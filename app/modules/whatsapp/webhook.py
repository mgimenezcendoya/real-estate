import logging

from fastapi import APIRouter, Request, Query, Response

from app.database import get_pool
from app.modules.whatsapp.providers.factory import get_provider

router = APIRouter()
logger = logging.getLogger(__name__)


async def _detect_provider_and_hint(request: Request) -> tuple[str, str]:
    """Detect provider and extract the phone hint in one pass (avoids double body read).
    Returns (provider, phone_hint)."""
    content_type = request.headers.get("content-type", "")

    if "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        hint = form.get("To", "").replace("whatsapp:", "").strip()
        return "twilio", hint

    try:
        body = await request.json()
    except Exception:
        return "meta", ""

    # YCloud payloads have a top-level "type" like "whatsapp.inbound_message.received"
    if body.get("type", "").startswith("whatsapp."):
        msg = body.get("whatsappInboundMessage", {})
        hint = msg.get("wabaId", "")
        return "ycloud", hint

    # Meta payloads have "entry" array
    try:
        hint = body["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]
    except (KeyError, IndexError, Exception):
        hint = ""
    return "meta", hint


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Webhook verification — Meta GET challenge. Looks up verify_token in tenant_channels."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT verify_token FROM tenant_channels WHERE verify_token = $1 AND provider = 'meta' AND activo = true",
        hub_verify_token,
    )
    if hub_mode == "subscribe" and row:
        return Response(content=hub_challenge, media_type="text/plain")
    # Dev fallback: check env var verify_token
    from app.config import get_settings
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(status_code=403)


@router.post("/webhook")
async def receive_message(request: Request):
    """Receive incoming WhatsApp messages — works with both Meta and Twilio.
    Identifies the tenant from the receiving phone number via tenant_channels table.
    Falls back to ACTIVE_DEVELOPER_ID for local dev."""
    from app.modules.agent.router import resolve_tenant_channel, route_message

    provider, phone_hint = await _detect_provider_and_hint(request)

    channel = await resolve_tenant_channel(phone_hint, provider)
    if not channel:
        logger.warning("No tenant_channel found for phone_hint=%r provider=%s", phone_hint, provider)
        return {"status": "ok"}  # silent drop — don't reveal 404 to providers

    provider_instance = get_provider(channel)
    messages = await provider_instance.parse_webhook(request)
    pool = await get_pool()

    for msg in messages:
        # Idempotency: skip if already processed
        inserted = await pool.fetchval(
            """
            INSERT INTO processed_messages (message_id, provider, organization_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (message_id, provider) DO NOTHING
            RETURNING message_id
            """,
            msg.message_id, channel.provider, channel.organization_id,
        )
        if not inserted:
            logger.info("Duplicate message %s from %s — skipping", msg.message_id, channel.provider)
            continue

        logger.info(
            "Incoming [%s/%s] from %s: type=%s text=%s",
            provider, channel.organization_id[:8],
            msg.sender_phone, msg.message_type,
            msg.text[:80] if msg.text else "(media)",
        )
        try:
            await route_message(
                channel=channel,
                sender_phone=msg.sender_phone,
                message_id=msg.message_id,
                message_type=msg.message_type,
                message=msg,
            )
        except Exception as e:
            logger.exception("Error processing message from %s: %s", msg.sender_phone, e)

    return {"status": "ok"}
