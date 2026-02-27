"""Meta WhatsApp Cloud API provider."""

import httpx
from fastapi import Request, Query

from app.config import get_settings
from app.modules.whatsapp.providers.base import IncomingMessage

WA_API_BASE = "https://graph.facebook.com/v21.0"


async def parse_webhook(request: Request) -> list[IncomingMessage]:
    body = await request.json()
    messages = []

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                message_type = msg.get("type", "text")
                incoming = IncomingMessage(
                    sender_phone=msg.get("from"),
                    message_id=msg.get("id"),
                    message_type=message_type,
                    raw=msg,
                )

                if message_type == "text":
                    incoming.text = msg.get("text", {}).get("body")
                elif message_type == "audio":
                    incoming.media_id = msg.get("audio", {}).get("id")
                    incoming.media_mime_type = msg.get("audio", {}).get("mime_type")
                elif message_type == "image":
                    incoming.media_id = msg.get("image", {}).get("id")
                    incoming.media_mime_type = msg.get("image", {}).get("mime_type")
                elif message_type == "document":
                    doc = msg.get("document", {})
                    incoming.media_id = doc.get("id")
                    incoming.media_mime_type = doc.get("mime_type")
                    incoming.filename = doc.get("filename")
                elif message_type == "location":
                    loc = msg.get("location", {})
                    incoming.latitude = loc.get("latitude")
                    incoming.longitude = loc.get("longitude")

                messages.append(incoming)

    return messages


async def verify_webhook(
    hub_mode: str | None,
    hub_verify_token: str | None,
    hub_challenge: str | None,
) -> str | None:
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return hub_challenge
    return None


async def send_text(to: str, text: str) -> dict:
    settings = get_settings()
    url = f"{WA_API_BASE}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        return response.json()


async def send_document(to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
    settings = get_settings()
    url = f"{WA_API_BASE}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "document",
        "document": {"link": document_url, "filename": filename},
    }
    if caption:
        payload["document"]["caption"] = caption
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        return response.json()


async def send_image(to: str, image_url: str, caption: str | None = None) -> dict:
    settings = get_settings()
    url = f"{WA_API_BASE}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "image",
        "image": {"link": image_url},
    }
    if caption:
        payload["image"]["caption"] = caption
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        return response.json()


async def send_template(to: str, template_name: str, language: str = "es_AR", components: list | None = None) -> dict:
    settings = get_settings()
    url = f"{WA_API_BASE}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
        },
    }
    if components:
        payload["template"]["components"] = components
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        return response.json()


async def download_media(media_id: str | None = None, media_url: str | None = None) -> bytes:
    settings = get_settings()
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}

    async with httpx.AsyncClient() as client:
        if not media_url:
            url_response = await client.get(f"{WA_API_BASE}/{media_id}", headers=headers)
            media_url = url_response.json().get("url")
        response = await client.get(media_url, headers=headers)
        return response.content
