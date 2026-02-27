"""
NocoDB Webhook Handler: receives events when data changes in NocoDB
(e.g., project config updated, new document uploaded, lead status changed).
"""

from fastapi import APIRouter, Request

router = APIRouter()


@router.post("/webhook")
async def nocodb_webhook(request: Request):
    """Receive webhook events from NocoDB on record changes."""
    event = await request.json()
    await handle_nocodb_event(event)
    return {"status": "ok"}


async def handle_nocodb_event(event: dict) -> None:
    """Process NocoDB webhook events."""
    table = event.get("table", {}).get("title", "")
    action = event.get("type", "")

    # TODO: Route by table name + action type
    # e.g. "projects" + "update" → invalidate project cache
    # e.g. "documents" + "insert" → trigger RAG ingestion for new doc
    # e.g. "leads" + "update" → sync lead status change
    pass
