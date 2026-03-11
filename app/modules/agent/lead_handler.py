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
from app.modules.whatsapp.providers.base import IncomingMessage, TenantChannel
from app.modules.whatsapp.providers.factory import get_provider as _get_provider

logger = logging.getLogger(__name__)


async def _safe_task(coro, label: str) -> None:
    """Run a coroutine as a background task and log any exception."""
    try:
        await coro
    except Exception as e:
        logger.error("Background task '%s' failed: %s", label, e, exc_info=True)


# ---------------------------------------------------------------------------
# Anthropic Tool Use definitions — replace text markers with structured calls
# ---------------------------------------------------------------------------
LEAD_TOOLS = [
    {
        "name": "enviar_documento",
        "description": (
            "Envía un documento del proyecto al lead por WhatsApp. "
            "Usá esta herramienta cuando el lead pida explícitamente un documento "
            "(brochure, plano, lista de precios, memoria, etc.)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tipo": {
                    "type": "string",
                    "enum": ["plano", "precios", "brochure", "memoria", "reglamento", "faq", "contrato", "cronograma"],
                    "description": "Tipo de documento a enviar",
                },
                "unidad": {
                    "type": "string",
                    "description": "Identificador de la unidad (ej: 2B). Omitir si no aplica a una unidad específica.",
                },
                "proyecto_slug": {
                    "type": "string",
                    "description": "Slug del proyecto en minúsculas con guiones (ej: manzanares-2088)",
                },
            },
            "required": ["tipo", "proyecto_slug"],
        },
    },
    {
        "name": "derivar_vendedor",
        "description": (
            "Deriva la conversación a un vendedor humano. "
            "Usá esta herramienta cuando: (1) el lead pide hablar con una persona, "
            "(2) el lead muestra intención de cierre (quiere reservar, señar, visitar), "
            "o (3) no podés responder con certeza y el lead insiste."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "razon": {
                    "type": "string",
                    "enum": ["lead_request", "intencion_cierre", "consulta_especifica"],
                    "description": "Motivo de la derivación",
                },
            },
            "required": ["razon"],
        },
    },
]


async def handle_lead_message(
    developer: dict,
    sender_phone: str,
    message_id: str,
    message_type: str,
    message: IncomingMessage,
    channel: TenantChannel | None = None,
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
        _MEDIA_REPLY = {
            "audio": "¡Hola! No puedo escuchar audios. ¿Me lo podés escribir por texto?",
            "image": "¡Hola! No puedo ver imágenes. ¿Me podés describir tu consulta por texto?",
            "video": "¡Hola! No puedo ver videos. ¿Me podés escribir tu consulta?",
            "sticker": "¡Hola! ¿En qué te puedo ayudar?",
        }
        reply = _MEDIA_REPLY.get(message_type, "¡Hola! Solo puedo leer mensajes de texto. ¿Me escribís tu consulta?")
        if channel:
            provider = _get_provider(channel)
            await provider.send_text(sender_phone, reply)
        else:
            from app.modules.whatsapp.sender import send_text_message
            await send_text_message(to=sender_phone, text=reply)
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

    response = await _generate_response(
        developer_id=developer_id,
        developer_name=developer["developer_name"],
        developer_context=developer_context,
        qualification=qualification,
        conversation_history=history,
        user_message=text,
    )

    reply_text = response["text"]
    doc_request = response["doc_request"]
    handoff_trigger = response["handoff_trigger"]

    await save_conversation_message(
        lead_id=lead_id,
        role="assistant",
        sender_type="agent",
        content=reply_text,
    )

    logger.info("Replying to %s: %s", sender_phone, reply_text[:80])
    if channel:
        provider = _get_provider(channel)
        await provider.send_text(sender_phone, reply_text)
    else:
        from app.modules.whatsapp.sender import send_text_message
        await send_text_message(to=sender_phone, text=reply_text)

    # Broadcast AI response to the admin inbox — non-blocking
    asyncio.create_task(
        connection_manager.broadcast(
            developer_id,
            "message",
            {
                "lead_id": lead_id,
                "phone": sender_phone,
                "content": reply_text,
                "sender_type": "agent",
                "timestamp": None,
                "handoff_active": False,
            },
        )
    )

    if doc_request:
        asyncio.create_task(
            _send_document(developer_id, sender_phone, doc_request, channel)
        )

    if handoff_trigger:
        qual_summary, full_history = _build_handoff_context(
            qualification, history, text, reply_text,
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

    # Only run extraction when the message has substance and there are still fields to collect
    missing = build_missing_fields(qualification)
    if len(text) > 20 and missing != "Todos los datos recopilados.":
        asyncio.create_task(
            _safe_task(
                _update_qualification(lead_id, history, text, reply_text, qualification.get("project_id"), developer_projects),
                label=f"update_qualification lead={lead_id}",
            )
        )



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


async def _send_document(
    developer_id: str,
    to_phone: str,
    doc_request: dict,
    channel: TenantChannel | None = None,
) -> None:
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

        if channel:
            provider = _get_provider(channel)
            result = await provider.send_document(
                to=to_phone,
                document_url=document_url,
                filename=doc["filename"],
                caption=doc["filename"],
            )
        else:
            from app.modules.whatsapp.sender import send_document_message
            result = await send_document_message(
                to=to_phone,
                document_url=document_url,
                filename=doc["filename"],
                caption=doc["filename"],
            )
        logger.info("Provider response for doc send: %s", result)
    except Exception as e:
        logger.error("Failed to send document to %s: %s", to_phone, e)


_PDF_KEYWORDS = re.compile(
    r"(terminacion|material|amenit|superfici|memoria|brochure|plano|precio|reglamento|"
    r"contrato|cronograma|entrega|acabado|piso|cocina|baño|dormitorio|living|balcon|"
    r"terraza|estacionamiento|cochera|baulera|expensa|medida|metro|m2|m²)",
    re.IGNORECASE,
)


def _should_attach_pdfs(user_message: str, conversation_history: list[dict]) -> bool:
    """Only attach PDFs when the lead's message is likely to need document info."""
    if _PDF_KEYWORDS.search(user_message):
        return True
    # Also check the last assistant message — if agent promised info from docs, attach them
    if conversation_history:
        last = conversation_history[-1]
        if last.get("sender_type") == "agent" and "confirmo" in (last.get("content") or "").lower():
            return True
    return False


async def _generate_response(
    developer_id: str,
    developer_name: str,
    developer_context: str,
    qualification: dict,
    conversation_history: list[dict],
    user_message: str,
) -> dict:
    """Call Claude with tool_use. Returns {text, doc_request, handoff_trigger}."""
    from app.modules.agent.config_loader import get_agent_config
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    agent_config = await get_agent_config(developer_id)

    is_first_contact = len(conversation_history) == 0

    system = build_lead_system_prompt(
        agent_config=agent_config,
        developer_name=developer_name,
        qualification_status=build_qualification_status(qualification),
        missing_fields=build_missing_fields(qualification),
    )

    if is_first_contact:
        system += (
            "\n\nINSTRUCCIÓN ESPECIAL — PRIMER CONTACTO: "
            "Este es el primer mensaje del lead. Presentate brevemente como asistente de "
            f"{developer_name} y mencioná los proyectos disponibles. "
            "Sé cálido pero conciso."
        )

    messages = []

    # Unit context as user/assistant message pair (not in system prompt)
    messages.append({
        "role": "user",
        "content": (
            f"⚠️ ESTADO ACTUAL DE UNIDADES (fuente de verdad — invalida cualquier mensaje anterior):\n"
            f"{developer_context}\n"
            f"IMPORTANTE: Si una unidad NO aparece en la lista de disponibles, "
            f"significa que ya fue reservada o vendida. No la ofrezcas."
        ),
    })
    messages.append({
        "role": "assistant",
        "content": "Entendido, tengo el estado actualizado de todas las unidades.",
    })

    # Only attach PDFs when the message is relevant (saves tokens)
    if _should_attach_pdfs(user_message, conversation_history):
        doc_blocks = await get_developer_document_blocks(developer_id)
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
        temperature=agent_config.temperature,
        system=system,
        messages=messages,
        tools=LEAD_TOOLS,
    )

    # Parse response: extract text and tool calls
    result = {"text": "", "doc_request": None, "handoff_trigger": None}

    for block in response.content:
        if block.type == "text":
            result["text"] = block.text
        elif block.type == "tool_use":
            if block.name == "enviar_documento":
                inp = block.input
                result["doc_request"] = {
                    "doc_type": inp["tipo"],
                    "unit_identifier": inp.get("unidad"),
                    "project_slug": inp["proyecto_slug"],
                }
            elif block.name == "derivar_vendedor":
                result["handoff_trigger"] = block.input["razon"]

    return result


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
