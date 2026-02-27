"""
Developer Handler: processes messages from authorized team members.
Handles audio transcription, document ingestion, obra updates, and admin commands.
"""

from app.modules.whatsapp.sender import send_text_message

ROLE_PERMISSIONS = {
    "admin": {"obra_update", "doc_upload", "price_update", "query", "milestone", "invite", "leads"},
    "obra": {"obra_update", "milestone", "fotos"},
    "ventas": {"query", "leads"},
}


async def handle_developer_message(
    auth_number: dict,
    project: dict,
    message_id: str,
    message_type: str,
    message: dict,
) -> None:
    """Process a message from an authorized developer."""
    role = auth_number["role"]
    phone = auth_number["phone"]

    # TODO: Save to developer_conversations table

    if message_type == "audio":
        # TODO: Download audio via WhatsApp media API
        # TODO: Transcribe with Whisper
        # TODO: Extract structured data with Claude (etapa, porcentaje, etc.)
        # TODO: Check permissions, ask for confirmation, persist
        pass

    elif message_type == "document":
        if "doc_upload" not in ROLE_PERMISSIONS.get(role, set()):
            await send_text_message(phone, "No tenes permisos para subir documentos. Pedile al admin del proyecto.")
            return
        # TODO: Download PDF via WhatsApp media API
        # TODO: Detect document type
        # TODO: Ingest into RAG pipeline
        # TODO: Confirm to developer
        pass

    elif message_type == "image":
        # TODO: Download image
        # TODO: Associate with current obra_update
        pass

    elif message_type == "text":
        text = message.get("text", {}).get("body", "")
        # TODO: Classify developer intent with Claude
        # TODO: Route to appropriate action (obra update, query, milestone, invite, etc.)
        # TODO: Check permissions before executing
        # TODO: Respond with confirmation or result
        pass


async def handle_activation_code(auth_number: dict, message: dict) -> None:
    """Handle activation code from a pending authorized number."""
    text = message.get("text", {}).get("body", "").strip()
    phone = auth_number["phone"]

    if text == auth_number.get("activation_code"):
        # TODO: UPDATE authorized_numbers SET status='active', activated_at=NOW()
        await send_text_message(phone, "Acceso activado. Ya podes operar en modo developer.")
    else:
        await send_text_message(phone, "Codigo incorrecto. Intenta de nuevo.")
