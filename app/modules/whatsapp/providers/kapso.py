"""
Kapso WhatsApp provider.

Kapso acts as a managed layer on top of Meta's WhatsApp Cloud API.
Key difference from MetaProvider: no per-tenant access_token is needed.
All API calls are authenticated with the platform-level KAPSO_API_KEY.
Kapso forwards incoming webhooks in Meta format — so parse_webhook() reuses
the existing MetaProvider parsing logic unchanged.

Sending endpoint: POST https://api.kapso.ai/meta/whatsapp/messages/send-a-message
Auth header: x-api-key: <KAPSO_API_KEY>
"""

import httpx
from fastapi import Request
from .base import IncomingMessage, TenantChannel

KAPSO_API_BASE = "https://api.kapso.ai/meta/whatsapp"


def _api_key() -> str:
    from app.config import get_settings
    return get_settings().kapso_api_key


class KapsoProvider:
    def __init__(self, channel: TenantChannel):
        self.channel = channel

    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        """Kapso forwards Meta-format payloads — reuse Meta parser."""
        from app.modules.whatsapp.providers.meta import parse_webhook as _parse
        return await _parse(request)

    async def verify_webhook(self, hub_mode, hub_verify_token, hub_challenge) -> str | None:
        return None  # Kapso handles Meta verification internally

    async def send_text(self, to: str, text: str) -> dict:
        headers = {"x-api-key": _api_key(), "Content-Type": "application/json"}
        payload = {
            "phoneNumberId": self.channel.phone_number_id,
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{KAPSO_API_BASE}/messages/send-a-message",
                json=payload,
                headers=headers,
            )
            return response.json()

    async def send_document(self, to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
        headers = {"x-api-key": _api_key(), "Content-Type": "application/json"}
        doc_payload: dict = {"link": document_url, "filename": filename}
        if caption:
            doc_payload["caption"] = caption
        payload = {
            "phoneNumberId": self.channel.phone_number_id,
            "to": to,
            "type": "document",
            "document": doc_payload,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{KAPSO_API_BASE}/messages/send-a-message",
                json=payload,
                headers=headers,
            )
            return response.json()

    async def send_image(self, to: str, image_url: str, caption: str | None = None) -> dict:
        headers = {"x-api-key": _api_key(), "Content-Type": "application/json"}
        img_payload: dict = {"link": image_url}
        if caption:
            img_payload["caption"] = caption
        payload = {
            "phoneNumberId": self.channel.phone_number_id,
            "to": to,
            "type": "image",
            "image": img_payload,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{KAPSO_API_BASE}/messages/send-a-message",
                json=payload,
                headers=headers,
            )
            return response.json()

    async def download_media(self, media_id: str | None = None, media_url: str | None = None) -> bytes:
        """Kapso forwards Meta-format media — same as MetaProvider but using platform key."""
        headers = {"x-api-key": _api_key()}
        async with httpx.AsyncClient() as client:
            if not media_url and media_id:
                url_resp = await client.get(
                    f"{KAPSO_API_BASE}/{media_id}",
                    headers=headers,
                )
                media_url = url_resp.json().get("url")
            response = await client.get(media_url, headers=headers)
            return response.content
