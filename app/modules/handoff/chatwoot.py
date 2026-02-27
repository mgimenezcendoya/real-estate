"""
Chatwoot Integration: API client for creating conversations,
forwarding messages, and receiving webhook events.
"""

import httpx
from fastapi import APIRouter, Request

from app.config import get_settings

router = APIRouter()


@router.post("/webhook")
async def chatwoot_webhook(request: Request):
    """Receive webhook events from Chatwoot (message_created, conversation_resolved, etc.)."""
    event = await request.json()
    await handle_chatwoot_webhook(event)
    return {"status": "ok"}


async def create_chatwoot_conversation(
    handoff_id: str,
    lead_id: str,
    project_id: str,
    context_summary: str,
) -> dict:
    """Create a new conversation in Chatwoot for a handoff."""
    settings = get_settings()
    base_url = settings.chatwoot_base_url
    token = settings.chatwoot_api_token
    account_id = settings.chatwoot_account_id

    # TODO: Create contact in Chatwoot if not exists
    # TODO: Create conversation with initial message containing context_summary
    # TODO: Assign to sales agent

    return {}


async def forward_to_chatwoot(handoff: dict, message: dict) -> None:
    """Forward a lead's message to an active Chatwoot conversation."""
    # TODO: Find the Chatwoot conversation for this handoff
    # TODO: Add the message as an incoming message in Chatwoot
    pass


async def handle_chatwoot_webhook(event: dict) -> None:
    """Process incoming webhook events from Chatwoot."""
    event_type = event.get("event")

    if event_type == "conversation_resolved":
        # TODO: Close the handoff in Realia
        pass
    elif event_type == "message_created":
        # TODO: If outgoing message from agent, forward to lead via WhatsApp
        # TODO: Save to conversations table with sender_type='human'
        pass
