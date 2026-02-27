"""
Admin API: internal endpoints for analytics, pipeline visibility, and project configuration.
Also includes Chatwoot webhook receiver and cron-triggered background jobs.
"""

from fastapi import APIRouter, Request

from app.modules.handoff.chatwoot import handle_chatwoot_webhook
from app.modules.leads.nurturing import process_nurturing_batch
from app.modules.obra.notifier import notify_buyers_of_update

router = APIRouter()


# --- Chatwoot webhook ---

@router.post("/chatwoot/webhook")
async def chatwoot_webhook(request: Request):
    """Receive webhook events from Chatwoot (conversation resolved, message created, etc.)."""
    body = await request.json()
    await handle_chatwoot_webhook(body)
    return {"status": "ok"}


# --- Cron-triggered jobs ---

@router.post("/jobs/nurturing")
async def run_nurturing():
    """Trigger nurturing batch (called by Railway cron)."""
    # TODO: Add auth token validation for cron endpoints
    sent = await process_nurturing_batch()
    return {"messages_sent": sent}


@router.post("/jobs/obra-notifications")
async def run_obra_notifications():
    """Trigger obra update notifications (called by Railway cron)."""
    # TODO: Process pending obra notifications
    return {"status": "ok"}


# --- Analytics / Pipeline ---

@router.get("/leads")
async def list_leads(project_id: str, score: str | None = None):
    """List leads for a project, optionally filtered by score."""
    # TODO: Query leads table with filters
    return []


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str):
    """Get full lead detail including conversation history."""
    # TODO: Fetch lead + conversations + handoffs
    return {}


@router.get("/metrics/{project_id}")
async def get_metrics(project_id: str):
    """Get project metrics: lead counts by score, response times, conversion rates."""
    # TODO: Aggregate metrics from DB
    return {
        "total_leads": 0,
        "hot": 0,
        "warm": 0,
        "cold": 0,
        "avg_response_time_seconds": 0,
        "handoffs_total": 0,
        "handoffs_completed": 0,
    }


# --- Local chat endpoint (development/testing) ---

@router.post("/chat")
async def local_chat(project_id: str, phone: str, message: str):
    """
    Simulate a WhatsApp conversation without the real API.
    Useful for local development and testing.
    """
    from app.modules.agent.router import route_message

    fake_message = {
        "from": phone,
        "id": f"local_{phone}_{message[:10]}",
        "type": "text",
        "text": {"body": message},
    }

    await route_message(
        phone_number_id="local",
        sender_phone=phone,
        message_id=fake_message["id"],
        message_type="text",
        message=fake_message,
    )

    return {"status": "sent", "note": "Response would be sent via WhatsApp in production"}
