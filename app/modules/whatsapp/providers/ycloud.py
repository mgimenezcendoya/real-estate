"""YCloud WhatsApp API provider."""

import hashlib
import hmac
import httpx
from fastapi import Request

from app.modules.whatsapp.providers.base import IncomingMessage

YCLOUD_API_BASE = "https://api.ycloud.com/v2"


async def parse_webhook(request: Request) -> list[IncomingMessage]:
    body = await request.json()
    messages = []

    if body.get("type") != "whatsapp.inbound_message.received":
        return messages

    msg = body.get("whatsappInboundMessage", {})
    if not msg:
        return messages

    message_type = msg.get("type", "text")
    incoming = IncomingMessage(
        sender_phone=msg.get("from", ""),
        message_id=msg.get("id", ""),
        message_type=message_type,
        raw=msg,
    )

    if message_type == "text":
        incoming.text = msg.get("text", {}).get("body")
    elif message_type == "audio":
        audio = msg.get("audio", {})
        incoming.media_id = audio.get("id")
        incoming.media_mime_type = audio.get("mimeType")
        incoming.media_url = audio.get("link")
    elif message_type == "image":
        image = msg.get("image", {})
        incoming.media_id = image.get("id")
        incoming.media_mime_type = image.get("mimeType")
        incoming.media_url = image.get("link")
    elif message_type == "document":
        doc = msg.get("document", {})
        incoming.media_id = doc.get("id")
        incoming.media_mime_type = doc.get("mimeType")
        incoming.media_url = doc.get("link")
        incoming.filename = doc.get("filename")
    elif message_type == "location":
        loc = msg.get("location", {})
        incoming.latitude = loc.get("latitude")
        incoming.longitude = loc.get("longitude")

    messages.append(incoming)
    return messages


def verify_signature(payload: bytes, signature_header: str, secret: str) -> bool:
    """Verify YCloud webhook HMAC-SHA256 signature: YCloud-Signature: t={ts},s={sig}"""
    try:
        parts = dict(p.split("=", 1) for p in signature_header.split(","))
        timestamp = parts.get("t", "")
        signature = parts.get("s", "")
        mac = hmac.new(
            secret.encode(),
            f"{timestamp}.{payload.decode()}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, mac)
    except Exception:
        return False


async def send_text(phone_number: str, phone_number_id: str, to: str, text: str, api_key: str) -> dict:
    url = f"{YCLOUD_API_BASE}/whatsapp/messages/sendDirectly"
    payload = {
        "from": phone_number,
        "to": to,
        "phoneNumberId": phone_number_id,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers={"X-API-Key": api_key})
        return response.json()


async def send_document(phone_number: str, phone_number_id: str, to: str, document_url: str, filename: str, caption: str | None = None, api_key: str = "") -> dict:
    url = f"{YCLOUD_API_BASE}/whatsapp/messages/sendDirectly"
    doc = {"link": document_url, "filename": filename}
    if caption:
        doc["caption"] = caption
    payload = {
        "from": phone_number,
        "to": to,
        "phoneNumberId": phone_number_id,
        "type": "document",
        "document": doc,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers={"X-API-Key": api_key})
        return response.json()


async def send_image(phone_number: str, phone_number_id: str, to: str, image_url: str, caption: str | None = None, api_key: str = "") -> dict:
    url = f"{YCLOUD_API_BASE}/whatsapp/messages/sendDirectly"
    image = {"link": image_url}
    if caption:
        image["caption"] = caption
    payload = {
        "from": phone_number,
        "to": to,
        "phoneNumberId": phone_number_id,
        "type": "image",
        "image": image,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers={"X-API-Key": api_key})
        return response.json()


async def download_media(media_url: str) -> bytes:
    """YCloud provides media URLs directly in the webhook — just fetch them."""
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(media_url)
        return response.content
