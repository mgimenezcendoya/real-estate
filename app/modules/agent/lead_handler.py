"""
Lead Handler: orchestrates the response flow for external leads.
Manages session state, intent classification, RAG queries, lead qualification,
and document sharing.
"""

import asyncio
import logging
import re
from datetime import datetime, timezone

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.core.sse import connection_manager
from app.database import get_pool
from app.modules.agent.prompts import build_lead_system_prompt
from app.modules.agent.session import (
    get_or_create_session,
    get_conversation_history,
    get_lead_qualification,
    get_developer_context,
    get_developer_projects,
    save_conversation_message,
    update_lead_qualification,
    update_lead_project,
)
from app.modules.handoff.manager import (
    check_active_handoff_by_phone,
    close_handoff,
    handle_lead_message_during_handoff,
    initiate_handoff,
)
from app.modules.leads.qualification import (
    build_missing_fields,
    build_qualification_status,
    calculate_score,
    extract_qualification_data,
    merge_qualification,
)
from app.modules.rag.ingestion import find_document_for_sharing
from app.modules.rag.retrieval import get_developer_document_blocks
from app.modules.whatsapp.providers.base import IncomingMessage
from app.modules.whatsapp.sender import send_document_message, send_text_message

logger = logging.getLogger(__name__)

DOC_MARKER_RE = re.compile(r"\[ENVIAR_DOC:(\w+):(\w+)(?::([a-zA-Z0-9_-]+))?\]")
HANDOFF_MARKER_RE = re.compile(r"\[HANDOFF:([^\]]+)\]")

async def _safe_task(coro, label: str) -> None:
    """Run a coroutine as a background task and log any exception."""
    try:
        await coro
    except Exception as e:
        logger.error("Background task '%s' failed: %s", label, e, exc_info=True)

# Phrases that indicate the agent intends to hand off even without the explicit marker
_HANDOFF_PHRASES = re.compile(
    r"(te paso con un asesor|te comunico con|paso con un asesor|un asesor (se va a |te va a |va a )?(comunicar|contactar|ayudar|confirmar)|pasarte con (un asesor|el equipo)|te pongo en contacto)",
    re.IGNORECASE,
)


async def handle_lead_message(
    developer: dict,
    sender_phone: str,
    message_id: str,
    message_type: str,
    message: IncomingMessage,
) -> None:
    """Process an incoming message from a lead."""
    developer_id = developer["developer_id"]
    default_project_id = developer["default_project_id"]

    active_handoff = await check_active_handoff_by_phone(sender_phone)
    if active_handoff:
        if message.text:
            pool = await get_pool()

            # --- Timeout checks ---
            # 1. If there has been no ADMIN activity for 4 hours, close and resume agent.
            #    This covers abandoned handoffs where the admin stopped responding.
            last_activity = active_handoff.get("last_activity_at") or active_handoff.get("started_at")
            if last_activity:
                if last_activity.tzinfo is None:
                    last_activity = last_activity.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - last_activity).total_seconds() > 4 * 3600:
                    logger.info(
                        "Handoff 4h inactivity timeout for lead %s, returning to agent",
                        active_handoff["lead_id"],
                    )
                    await close_handoff(str(active_handoff["id"]), lead_note="timeout_4h", send_goodbye=False)
                    active_handoff = None

            # 2. If lead didn't reply in 30 min (original logic), return control to agent.
            if active_handoff:
                last_user = await pool.fetchrow(
                    """
                    SELECT created_at FROM conversations
                    WHERE lead_id = $1 AND role = 'user'
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    active_handoff["lead_id"],
                )
                if last_user:
                    last_at = last_user["created_at"]
                    if last_at.tzinfo is None:
                        last_at = last_at.replace(tzinfo=timezone.utc)
                    if (datetime.now(timezone.utc) - last_at).total_seconds() > 2 * 3600:
                        logger.info("Handoff timeout (2h) for lead %s, returning to agent", active_handoff["lead_id"])
                        await close_handoff(str(active_handoff["id"]), lead_note="timeout_2h", send_goodbye=False)
                        active_handoff = None
            if active_handoff:
                lead_id = str(active_handoff["lead_id"])
                conv = await save_conversation_message(
                    lead_id=lead_id,
                    wa_message_id=message_id,
                    role="user",
                    sender_type="lead",
                    content=message.text,
                )
                await pool.execute("UPDATE leads SET last_contact = NOW() WHERE id = $1", lead_id)
                await handle_lead_message_during_handoff(active_handoff, message.text)

                # Broadcast to the admin inbox so the new message appears instantly
                asyncio.create_task(
                    connection_manager.broadcast(
                        developer_id,
                        "message",
                        {
                            "lead_id": lead_id,
                            "phone": sender_phone,
                            "content": message.text,
                            "sender_type": "lead",
                            "timestamp": conv["created_at"].isoformat() if conv else None,
                            "handoff_active": True,
                        },
                    )
                )
                return

    session = await get_or_create_session(sender_phone, default_project_id)
    lead_id = str(session["lead_id"])

    text = message.text if message_type == "text" else None
    if not text:
        return

    await save_conversation_message(
        lead_id=lead_id,
        wa_message_id=message_id,
        role="user",
        sender_type="lead",
        content=text,
    )

    # Broadcast the incoming lead message immediately so the admin inbox updates
    # before the AI finishes generating a response (which can take a few seconds)
    asyncio.create_task(
        connection_manager.broadcast(
            developer_id,
            "message",
            {
                "lead_id": lead_id,
                "phone": sender_phone,
                "content": text,
                "sender_type": "lead",
                "timestamp": None,
                "handoff_active": False,
            },
        )
    )

    qualification = await get_lead_qualification(lead_id)
    developer_context = await get_developer_context(developer_id)
    developer_projects = await get_developer_projects(developer_id)
    history = await get_conversation_history(lead_id, limit=15)

    response_text = await _generate_response(
        developer_id=developer_id,
        developer_name=developer["developer_name"],
        developer_context=developer_context,
        qualification=qualification,
        conversation_history=history,
        user_message=text,
    )

    clean_text, doc_request = _extract_doc_marker(response_text)
    clean_text, handoff_trigger = _extract_handoff_marker(clean_text)

    # Fallback: if the agent said "te paso con un asesor" but forgot the marker, trigger anyway
    if not handoff_trigger and _HANDOFF_PHRASES.search(clean_text):
        logger.info("Handoff phrase detected without marker for lead %s — auto-triggering handoff", lead_id)
        handoff_trigger = "auto_detected"

    await save_conversation_message(
        lead_id=lead_id,
        role="assistant",
        sender_type="agent",
        content=clean_text,
    )

    logger.info("Replying to %s: %s", sender_phone, clean_text[:80])
    await send_text_message(to=sender_phone, text=clean_text)

    # Broadcast AI response to the admin inbox — non-blocking
    asyncio.create_task(
        connection_manager.broadcast(
            developer_id,
            "message",
            {
                "lead_id": lead_id,
                "phone": sender_phone,
                "content": clean_text,
                "sender_type": "agent",
                "timestamp": None,
                "handoff_active": False,
            },
        )
    )

    if doc_request:
        asyncio.create_task(
            _send_document(developer_id, sender_phone, doc_request)
        )

    if handoff_trigger:
        qual_summary, full_history = _build_handoff_context(
            qualification, history, text, clean_text,
        )
        # Use qualification project_id as fallback if default_project_id is None
        effective_project_id = default_project_id or qualification.get("project_id")
        asyncio.create_task(
            _safe_task(
                initiate_handoff(
                    lead_id=lead_id,
                    project_id=effective_project_id,
                    trigger=handoff_trigger,
                    context_summary=qual_summary,
                    conversation_history=full_history,
                ),
                label=f"initiate_handoff lead={lead_id}",
            )
        )

    asyncio.create_task(
        _safe_task(
            _update_qualification(lead_id, history, text, clean_text, qualification.get("project_id"), developer_projects),
            label=f"update_qualification lead={lead_id}",
        )
    )


def _extract_doc_marker(text: str) -> tuple[str, dict | None]:
    """Parse and remove [ENVIAR_DOC:type:unit] marker from Claude's response."""
    match = DOC_MARKER_RE.search(text)
    if not match:
        return text, None

    clean = DOC_MARKER_RE.sub("", text).rstrip()
    doc_type = match.group(1)
    unit = match.group(2) if match.group(2) != "NONE" else None
    project_slug = match.group(3) if match.group(3) else None
    return clean, {"doc_type": doc_type, "unit_identifier": unit, "project_slug": project_slug}


def _extract_handoff_marker(text: str) -> tuple[str, str | None]:
    """Parse and remove [HANDOFF:reason] marker from Claude's response."""
    match = HANDOFF_MARKER_RE.search(text)
    if not match:
        return text, None
    clean = HANDOFF_MARKER_RE.sub("", text).rstrip()
    return clean, match.group(1)


def _build_handoff_context(
    qualification: dict, history: list[dict], last_message: str, last_response: str,
) -> tuple[str, list[dict]]:
    """Build qualification summary and full conversation history for handoff."""
    parts = []

    if qualification.get("name"):
        parts.append(f"Nombre: {qualification['name']}")
    if qualification.get("intent"):
        labels = {"investment": "Inversión", "own_home": "Vivienda propia", "rental": "Renta"}
        parts.append(f"Intención: {labels.get(qualification['intent'], qualification['intent'])}")
    if qualification.get("budget_usd"):
        parts.append(f"Presupuesto: USD {qualification['budget_usd']:,}")
    if qualification.get("bedrooms"):
        parts.append(f"Busca: {qualification['bedrooms']} ambientes")
    if qualification.get("financing"):
        labels = {"own_capital": "Capital propio", "needs_financing": "Necesita financiación", "mixed": "Mixto"}
        parts.append(f"Financiamiento: {labels.get(qualification['financing'], qualification['financing'])}")
    if qualification.get("timeline"):
        labels = {"immediate": "Inmediato", "3_months": "3 meses", "6_months": "6 meses", "1_year_plus": "+1 año"}
        parts.append(f"Plazo: {labels.get(qualification['timeline'], qualification['timeline'])}")

    qualification_summary = "\n".join(parts) if parts else "Sin datos de calificación"

    full_history = list(history)
    full_history.append({"sender_type": "lead", "content": last_message})
    full_history.append({"sender_type": "agent", "content": last_response})

    return qualification_summary, full_history


async def _send_document(developer_id: str, to_phone: str, doc_request: dict) -> None:
    """Find and send a document via WhatsApp (searches across all developer projects)."""
    try:
        doc = await find_document_for_sharing(
            developer_id=developer_id,
            doc_type=doc_request["doc_type"],
            unit_identifier=doc_request.get("unit_identifier"),
            project_slug=doc_request.get("project_slug"),
        )
        if not doc:
            logger.warning("Document not found: %s", doc_request)
            return

        document_url = doc["file_url"]
        logger.info("Sending doc to %s: type=%s url=%s", to_phone, doc_request["doc_type"], document_url)

        result = await send_document_message(
            to=to_phone,
            document_url=document_url,
            filename=doc["filename"],
            caption=doc["filename"],
        )
        logger.info("Twilio response for doc send: %s", result)
    except Exception as e:
        logger.error("Failed to send document to %s: %s", to_phone, e)


async def _generate_response(
    developer_id: str,
    developer_name: str,
    developer_context: str,
    qualification: dict,
    conversation_history: list[dict],
    user_message: str,
) -> str:
    """Call Claude to generate a response, with project PDFs as native attachments."""
    from app.modules.agent.config_loader import get_agent_config
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    agent_config = await get_agent_config(developer_id)

    system = build_lead_system_prompt(
        agent_config=agent_config,
        developer_name=developer_name,
        qualification_status=build_qualification_status(qualification),
        missing_fields=build_missing_fields(qualification),
    )
    system += f"\n\nInformacion de los proyectos:\n{developer_context}"

    doc_blocks = await get_developer_document_blocks(developer_id)

    messages = []

    if doc_blocks:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": "Documentos del proyecto adjuntos para consulta:"},
                *doc_blocks,
            ],
        })
        messages.append({
            "role": "assistant",
            "content": "Entendido, tengo los documentos del proyecto disponibles para consultar.",
        })

    for msg in conversation_history[:-1]:
        role = "user" if msg["sender_type"] == "lead" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    response = await client.messages.create(
        model=agent_config.model,
        max_tokens=agent_config.max_tokens,
        system=system,
        messages=messages,
    )

    return response.content[0].text


async def _update_qualification(
    lead_id: str,
    history: list[dict],
    user_message: str,
    assistant_response: str,
    current_project_id: str | None = None,
    developer_projects: list[dict] | None = None,
) -> None:
    """Extract qualification data from conversation and update the lead record.
    Also detects which project the lead is actually asking about and reassigns if needed.
    """
    try:
        full_history = list(history)
        full_history.append({"sender_type": "lead", "content": user_message})
        full_history.append({"sender_type": "agent", "content": assistant_response})

        extracted = await extract_qualification_data(full_history)
        if not extracted:
            return

        existing = await get_lead_qualification(lead_id)
        merged = merge_qualification(existing, extracted)
        score = calculate_score(merged)

        await update_lead_qualification(lead_id, merged, score)
        logger.info("Lead %s qualification updated: score=%s data=%s", lead_id, score, merged)

        # Auto-reassign lead to the project they're actually asking about
        if developer_projects and len(developer_projects) > 1 and current_project_id:
            combined = (user_message + " " + assistant_response).lower()
            for proj in developer_projects:
                if str(proj["id"]) == str(current_project_id):
                    continue
                name_lower = proj["name"].lower()
                slug_words = proj["slug"].replace("-", " ")
                if name_lower in combined or slug_words in combined:
                    await update_lead_project(lead_id, str(proj["id"]))
                    logger.info(
                        "Lead %s reassigned from project %s to %s (%s)",
                        lead_id, current_project_id, proj["name"], proj["id"],
                    )
                    break
    except Exception as e:
        logger.error("Failed to update qualification for lead %s: %s", lead_id, e)
