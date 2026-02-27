"""
Lead Handler: orchestrates the response flow for external leads.
Manages session state, intent classification, RAG queries, and lead qualification.
"""

from app.modules.agent.session import get_or_create_session
from app.modules.handoff.manager import check_active_handoff


async def handle_lead_message(
    project: dict,
    sender_phone: str,
    message_id: str,
    message_type: str,
    message: dict,
) -> None:
    """Process an incoming message from a lead."""
    project_id = str(project["id"])

    # Check if lead has an active handoff — if so, forward to Chatwoot
    active_handoff = await check_active_handoff(sender_phone, project_id)
    if active_handoff:
        from app.modules.handoff.chatwoot import forward_to_chatwoot

        await forward_to_chatwoot(
            handoff=active_handoff,
            message=message,
        )
        return

    # Get or create session + lead record
    session = await get_or_create_session(sender_phone, project_id)

    # Extract text content
    text = _extract_text(message, message_type)
    if not text:
        return

    # TODO: Save incoming message to conversations table (with wa_message_id for idempotency)

    # TODO: Classify intent (Claude)
    # TODO: Query RAG if needed
    # TODO: Generate response with Claude (context = RAG results + conversation history)
    # TODO: Run qualification flow (update lead score)
    # TODO: Send response via WhatsApp
    # TODO: If lead is hot, send alert to sales team
    pass


def _extract_text(message: dict, message_type: str) -> str | None:
    """Extract text content from a WhatsApp message."""
    if message_type == "text":
        return message.get("text", {}).get("body")
    # TODO: handle audio (transcribe), image, document
    return None
