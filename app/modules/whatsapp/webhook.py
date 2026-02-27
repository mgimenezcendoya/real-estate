import logging

from fastapi import APIRouter, Request, Query, Response

from app.config import get_settings
from app.modules.agent.router import route_message

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_provider():
    settings = get_settings()
    if settings.whatsapp_provider == "twilio":
        from app.modules.whatsapp.providers import twilio
        return twilio
    from app.modules.whatsapp.providers import meta
    return meta


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Webhook verification (Meta uses GET challenge, Twilio skips this)."""
    provider = _get_provider()
    challenge = await provider.verify_webhook(hub_mode, hub_verify_token, hub_challenge)
    if challenge:
        return Response(content=challenge, media_type="text/plain")
    return Response(status_code=403)


@router.post("/webhook")
async def receive_message(request: Request):
    """Receive incoming WhatsApp messages — works with both Meta and Twilio."""
    provider = _get_provider()
    messages = await provider.parse_webhook(request)

    for msg in messages:
        logger.info(
            "Incoming [%s] from %s: type=%s text=%s",
            get_settings().whatsapp_provider,
            msg.sender_phone,
            msg.message_type,
            msg.text[:80] if msg.text else "(media)",
        )
        try:
            await route_message(
                phone_number_id=get_settings().whatsapp_phone_number_id,
                sender_phone=msg.sender_phone,
                message_id=msg.message_id,
                message_type=msg.message_type,
                message=msg,
            )
        except Exception as e:
            logger.exception("Error processing message from %s: %s", msg.sender_phone, e)

    return {"status": "ok"}
