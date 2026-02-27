"""Twilio WhatsApp Sandbox provider."""

import httpx
from fastapi import Request

from app.config import get_settings
from app.modules.whatsapp.providers.base import IncomingMessage

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"


def _clean_phone(phone: str) -> str:
    """Strip 'whatsapp:' prefix and '+' from Twilio phone format."""
    return phone.replace("whatsapp:", "").replace("+", "")


async def parse_webhook(request: Request) -> list[IncomingMessage]:
    form = await request.form()
    data = dict(form)

    sender = _clean_phone(data.get("From", ""))
    message_id = data.get("MessageSid", "")
    body = data.get("Body", "")
    num_media = int(data.get("NumMedia", "0"))

    if num_media > 0:
        media_url = data.get("MediaUrl0", "")
        content_type = data.get("MediaContentType0", "")

        if "audio" in content_type:
            message_type = "audio"
        elif "image" in content_type:
            message_type = "image"
        elif "pdf" in content_type or "document" in content_type:
            message_type = "document"
        else:
            message_type = "document"

        return [IncomingMessage(
            sender_phone=sender,
            message_id=message_id,
            message_type=message_type,
            text=body or None,
            media_url=media_url,
            media_mime_type=content_type,
            raw=data,
        )]

    return [IncomingMessage(
        sender_phone=sender,
        message_id=message_id,
        message_type="text",
        text=body,
        raw=data,
    )]


async def verify_webhook(
    hub_mode: str | None,
    hub_verify_token: str | None,
    hub_challenge: str | None,
) -> str | None:
    # Twilio doesn't use GET verification — it validates via signature.
    # For sandbox development, we skip verification.
    return None


async def send_text(to: str, text: str) -> dict:
    settings = get_settings()
    url = f"{TWILIO_API_BASE}/Accounts/{settings.twilio_account_sid}/Messages.json"
    auth = (settings.twilio_account_sid, settings.twilio_auth_token)

    payload = {
        "From": f"whatsapp:{settings.twilio_whatsapp_number}",
        "To": f"whatsapp:+{to}",
        "Body": text,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=payload, auth=auth)
        return response.json()


async def send_document(to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
    settings = get_settings()
    url = f"{TWILIO_API_BASE}/Accounts/{settings.twilio_account_sid}/Messages.json"
    auth = (settings.twilio_account_sid, settings.twilio_auth_token)

    body = caption or filename
    payload = {
        "From": f"whatsapp:{settings.twilio_whatsapp_number}",
        "To": f"whatsapp:+{to}",
        "Body": body,
        "MediaUrl": document_url,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=payload, auth=auth)
        return response.json()


async def send_image(to: str, image_url: str, caption: str | None = None) -> dict:
    settings = get_settings()
    url = f"{TWILIO_API_BASE}/Accounts/{settings.twilio_account_sid}/Messages.json"
    auth = (settings.twilio_account_sid, settings.twilio_auth_token)

    payload = {
        "From": f"whatsapp:{settings.twilio_whatsapp_number}",
        "To": f"whatsapp:+{to}",
        "Body": caption or "",
        "MediaUrl": image_url,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=payload, auth=auth)
        return response.json()


async def download_media(media_id: str | None = None, media_url: str | None = None) -> bytes:
    """Download media from Twilio. Media URLs are directly accessible with Basic Auth."""
    settings = get_settings()
    auth = (settings.twilio_account_sid, settings.twilio_auth_token)

    async with httpx.AsyncClient() as client:
        response = await client.get(media_url, auth=auth)
        return response.content
