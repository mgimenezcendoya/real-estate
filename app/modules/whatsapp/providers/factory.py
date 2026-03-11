"""
Provider factory: instantiate tenant-aware provider from a TenantChannel.
The old module-level functions (twilio.py, meta.py) remain for backward compat.
"""

import httpx
from fastapi import Request
from .base import IncomingMessage, TenantChannel

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"
WA_API_BASE = "https://graph.facebook.com/v21.0"


class TwilioProvider:
    def __init__(self, channel: TenantChannel):
        self.channel = channel

    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        from app.modules.whatsapp.providers.twilio import parse_webhook as _parse
        return await _parse(request)  # parsing is stateless, reuse existing

    async def send_text(self, to: str, text: str) -> dict:
        url = f"{TWILIO_API_BASE}/Accounts/{self.channel.account_sid}/Messages.json"
        auth = (self.channel.account_sid, self.channel.auth_token)
        payload = {
            "From": f"whatsapp:{self.channel.phone_number}",
            "To": f"whatsapp:+{to}" if not to.startswith("+") else f"whatsapp:{to}",
            "Body": text,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=payload, auth=auth)
            return response.json()

    async def send_document(self, to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
        url = f"{TWILIO_API_BASE}/Accounts/{self.channel.account_sid}/Messages.json"
        auth = (self.channel.account_sid, self.channel.auth_token)
        payload = {
            "From": f"whatsapp:{self.channel.phone_number}",
            "To": f"whatsapp:+{to}" if not to.startswith("+") else f"whatsapp:{to}",
            "Body": caption or filename,
            "MediaUrl": document_url,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=payload, auth=auth)
            return response.json()

    async def send_image(self, to: str, image_url: str, caption: str | None = None) -> dict:
        url = f"{TWILIO_API_BASE}/Accounts/{self.channel.account_sid}/Messages.json"
        auth = (self.channel.account_sid, self.channel.auth_token)
        payload = {
            "From": f"whatsapp:{self.channel.phone_number}",
            "To": f"whatsapp:+{to}" if not to.startswith("+") else f"whatsapp:{to}",
            "Body": caption or "",
            "MediaUrl": image_url,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=payload, auth=auth)
            return response.json()

    async def download_media(self, media_id: str | None = None, media_url: str | None = None) -> bytes:
        auth = (self.channel.account_sid, self.channel.auth_token)
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(media_url, auth=auth)
            return response.content


class MetaProvider:
    def __init__(self, channel: TenantChannel):
        self.channel = channel

    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        from app.modules.whatsapp.providers.meta import parse_webhook as _parse
        return await _parse(request)  # parsing is stateless, reuse existing

    async def verify_webhook(self, hub_mode: str | None, hub_verify_token: str | None, hub_challenge: str | None) -> str | None:
        if hub_mode == "subscribe" and hub_verify_token == self.channel.verify_token:
            return hub_challenge
        return None

    async def send_text(self, to: str, text: str) -> dict:
        url = f"{WA_API_BASE}/{self.channel.phone_number_id}/messages"
        headers = {"Authorization": f"Bearer {self.channel.access_token}"}
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers)
            return response.json()

    async def send_document(self, to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
        url = f"{WA_API_BASE}/{self.channel.phone_number_id}/messages"
        headers = {"Authorization": f"Bearer {self.channel.access_token}"}
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

    async def send_image(self, to: str, image_url: str, caption: str | None = None) -> dict:
        url = f"{WA_API_BASE}/{self.channel.phone_number_id}/messages"
        headers = {"Authorization": f"Bearer {self.channel.access_token}"}
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

    async def download_media(self, media_id: str | None = None, media_url: str | None = None) -> bytes:
        headers = {"Authorization": f"Bearer {self.channel.access_token}"}
        async with httpx.AsyncClient() as client:
            if not media_url:
                url_response = await client.get(f"{WA_API_BASE}/{media_id}", headers=headers)
                media_url = url_response.json().get("url")
            response = await client.get(media_url, headers=headers)
            return response.content


class YCloudProvider:
    def __init__(self, channel: TenantChannel):
        self.channel = channel

    def _api_key(self) -> str:
        from app.config import get_settings
        return get_settings().ycloud_api_key

    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        from app.modules.whatsapp.providers.ycloud import parse_webhook as _parse
        return await _parse(request)

    async def send_text(self, to: str, text: str) -> dict:
        from app.modules.whatsapp.providers.ycloud import send_text as _send
        return await _send(self.channel.phone_number, self.channel.phone_number_id, to, text, self._api_key())

    async def send_document(self, to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
        from app.modules.whatsapp.providers.ycloud import send_document as _send
        return await _send(self.channel.phone_number, self.channel.phone_number_id, to, document_url, filename, caption, self._api_key())

    async def send_image(self, to: str, image_url: str, caption: str | None = None) -> dict:
        from app.modules.whatsapp.providers.ycloud import send_image as _send
        return await _send(self.channel.phone_number, self.channel.phone_number_id, to, image_url, caption, self._api_key())

    async def download_media(self, media_id: str | None = None, media_url: str | None = None) -> bytes:
        from app.modules.whatsapp.providers.ycloud import download_media as _dl
        return await _dl(media_url)


def get_provider(channel: TenantChannel) -> "TwilioProvider | MetaProvider | YCloudProvider | KapsoProvider":
    """Return a tenant-aware provider instance for the given channel."""
    if channel.provider == "twilio":
        return TwilioProvider(channel)
    elif channel.provider == "meta":
        return MetaProvider(channel)
    elif channel.provider == "ycloud":
        return YCloudProvider(channel)
    elif channel.provider == "kapso":
        from app.modules.whatsapp.providers.kapso import KapsoProvider
        return KapsoProvider(channel)
    raise ValueError(f"Unknown provider: {channel.provider!r}")
