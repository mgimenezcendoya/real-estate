"""
Lead Handler: orchestrates the response flow for external leads.
Manages session state, intent classification, RAG queries, lead qualification,
and document sharing.
"""

import asyncio
import logging
import re

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.modules.agent.prompts import LEAD_SYSTEM_PROMPT
from app.modules.agent.session import (
    get_or_create_session,
    get_conversation_history,
    get_lead_qualification,
    get_developer_context,
    save_conversation_message,
    update_lead_qualification,
)
from app.modules.handoff.manager import check_active_handoff
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

    active_handoff = await check_active_handoff(sender_phone, default_project_id)
    if active_handoff:
        from app.modules.handoff.chatwoot import forward_to_chatwoot
        await forward_to_chatwoot(handoff=active_handoff, message=message)
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

    qualification = await get_lead_qualification(lead_id)
    developer_context = await get_developer_context(developer_id)
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

    await save_conversation_message(
        lead_id=lead_id,
        role="assistant",
        sender_type="agent",
        content=clean_text,
    )

    logger.info("Replying to %s: %s", sender_phone, clean_text[:80])
    await send_text_message(to=sender_phone, text=clean_text)

    if doc_request:
        asyncio.create_task(
            _send_document(developer_id, sender_phone, doc_request)
        )

    asyncio.create_task(
        _update_qualification(lead_id, history, text, clean_text)
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
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    system = LEAD_SYSTEM_PROMPT.format(
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
        model=settings.anthropic_model,
        max_tokens=500,
        system=system,
        messages=messages,
    )

    return response.content[0].text


async def _update_qualification(
    lead_id: str,
    history: list[dict],
    user_message: str,
    assistant_response: str,
) -> None:
    """Extract qualification data from conversation and update the lead record."""
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
    except Exception as e:
        logger.error("Failed to update qualification for lead %s: %s", lead_id, e)
