"""
Telegram Handoff Bot using Forum Topics: each handoff gets its own topic
in a Telegram group, so sellers can write directly without reply chains.
"""

import logging

import httpx
from fastapi import APIRouter, Request

from app.config import get_settings
from app.database import get_pool
from app.modules.whatsapp.sender import send_text_message

logger = logging.getLogger(__name__)

router = APIRouter()

TELEGRAM_API = "https://api.telegram.org/bot{token}"


def _api_url(method: str) -> str:
    settings = get_settings()
    return f"{TELEGRAM_API.format(token=settings.telegram_bot_token)}/{method}"


async def _tg_request(method: str, payload: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(_api_url(method), json=payload)
        data = resp.json()
        if not data.get("ok"):
            logger.error("Telegram API error on %s: %s", method, data)
        return data


TG_MAX_MSG_LEN = 4096


async def send_handoff_alert(
    handoff_id: str,
    lead_name: str,
    lead_phone: str,
    project_name: str,
    score: str,
    context_summary: str,
    conversation_history: list[dict] | None = None,
) -> int | None:
    """Create a Forum Topic for this handoff, post alert + full conversation history."""
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        logger.warning("Telegram not configured, skipping handoff alert")
        return None

    topic_name = f"{lead_name} — {project_name}"
    topic_data = await _tg_request("createForumTopic", {
        "chat_id": settings.telegram_chat_id,
        "name": topic_name[:128],
        "icon_custom_emoji_id": "",
    })

    thread_id = topic_data.get("result", {}).get("message_thread_id")
    if not thread_id:
        logger.error("Failed to create topic for handoff %s: %s", handoff_id, topic_data)
        return None

    alert_text = (
        f"🔔 *NUEVO HANDOFF — {project_name}*\n\n"
        f"👤 *{lead_name}*\n"
        f"📱 +{lead_phone}\n"
        f"🎯 Score: {score}\n\n"
    )
    if context_summary:
        alert_text += f"📋 *Datos del lead:*\n{context_summary}\n\n"
    alert_text += (
        "_Escribí directo acá para hablar con el lead._\n"
        "_Escribí /cerrar cuando termines._"
    )

    await _tg_request("sendMessage", {
        "chat_id": settings.telegram_chat_id,
        "message_thread_id": thread_id,
        "text": alert_text,
        "parse_mode": "Markdown",
    })

    if conversation_history:
        await _send_conversation_history(settings.telegram_chat_id, thread_id, conversation_history)

    pool = await get_pool()
    await pool.execute(
        "UPDATE handoffs SET telegram_thread_id = $1, status = 'active', started_at = NOW() WHERE id = $2",
        thread_id, handoff_id,
    )
    logger.info("Handoff %s: Topic created (thread_id=%s, name=%s)", handoff_id, thread_id, topic_name)

    return thread_id


async def _send_conversation_history(
    chat_id: str, thread_id: int, history: list[dict],
) -> None:
    """Format and send conversation history to a topic, splitting if too long."""
    lines = ["📋 *HISTORIAL DE CONVERSACIÓN*\n"]
    for msg in history:
        sender = "👤 Lead" if msg.get("sender_type") == "lead" else "🤖 Agente"
        content = msg.get("content", "")
        lines.append(f"{sender}: {content}")

    full_text = "\n".join(lines)

    chunks = _split_message(full_text)
    for chunk in chunks:
        await _tg_request("sendMessage", {
            "chat_id": chat_id,
            "message_thread_id": thread_id,
            "text": chunk,
            "parse_mode": "Markdown",
        })


def _split_message(text: str) -> list[str]:
    """Split a message into chunks that fit Telegram's 4096 char limit."""
    if len(text) <= TG_MAX_MSG_LEN:
        return [text]

    chunks = []
    while text:
        if len(text) <= TG_MAX_MSG_LEN:
            chunks.append(text)
            break
        split_at = text.rfind("\n", 0, TG_MAX_MSG_LEN)
        if split_at <= 0:
            split_at = TG_MAX_MSG_LEN
        chunks.append(text[:split_at])
        text = text[split_at:].lstrip("\n")
    return chunks


async def forward_lead_message(handoff_id: str, text: str) -> None:
    """Forward a lead's WhatsApp message to the corresponding Telegram topic."""
    settings = get_settings()
    pool = await get_pool()

    handoff = await pool.fetchrow(
        "SELECT telegram_thread_id FROM handoffs WHERE id = $1", handoff_id,
    )
    if not handoff or not handoff["telegram_thread_id"]:
        return

    await _tg_request("sendMessage", {
        "chat_id": settings.telegram_chat_id,
        "message_thread_id": handoff["telegram_thread_id"],
        "text": f"💬 *Lead:* {text}",
        "parse_mode": "Markdown",
    })


@router.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive updates from Telegram Bot API."""
    update = await request.json()
    await _handle_update(update)
    return {"ok": True}


async def _handle_update(update: dict) -> None:
    """Process a Telegram update: relay seller messages or handle /cerrar."""
    message = update.get("message")
    if not message:
        return

    text = message.get("text", "")
    chat_id = str(message["chat"]["id"])
    settings = get_settings()

    if chat_id != settings.telegram_chat_id:
        return

    if message.get("from", {}).get("is_bot"):
        return

    thread_id = message.get("message_thread_id")
    if not thread_id:
        return

    pool = await get_pool()
    handoff = await pool.fetchrow(
        """SELECT h.id, h.lead_id, h.status, l.phone
           FROM handoffs h JOIN leads l ON h.lead_id = l.id
           WHERE h.telegram_thread_id = $1 AND h.status = 'active'""",
        thread_id,
    )

    if not handoff:
        return

    if text.startswith("/cerrar"):
        note = text.replace("/cerrar", "").strip() or None
        from app.modules.handoff.manager import close_handoff
        await close_handoff(str(handoff["id"]), lead_note=note)

        await _tg_request("sendMessage", {
            "chat_id": settings.telegram_chat_id,
            "message_thread_id": thread_id,
            "text": "✅ Handoff cerrado. Este topic se puede archivar.",
        })

        await _tg_request("closeForumTopic", {
            "chat_id": settings.telegram_chat_id,
            "message_thread_id": thread_id,
        })
        logger.info("Handoff %s closed via Telegram", handoff["id"])
        return

    sender_name = message.get("from", {}).get("first_name", "Vendedor")
    await send_text_message(to=handoff["phone"], text=text)

    await pool.execute(
        """INSERT INTO conversations (lead_id, role, sender_type, content)
           VALUES ($1, 'assistant', 'human', $2)""",
        handoff["lead_id"], text,
    )
    logger.info("Telegram reply from %s forwarded to %s via topic %s", sender_name, handoff["phone"], thread_id)


async def register_webhook(base_url: str) -> dict:
    """Register the Telegram webhook URL. Call once after deploy."""
    webhook_url = f"{base_url}/telegram/webhook"
    return await _tg_request("setWebhook", {"url": webhook_url})
