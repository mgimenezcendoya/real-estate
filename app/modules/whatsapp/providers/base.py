"""
Base interface for WhatsApp providers.
Both Meta and Twilio implementations conform to this interface.
The rest of the app works with IncomingMessage — never touches provider-specific formats.
"""

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class IncomingMessage:
    """Normalized message format — provider-agnostic."""
    sender_phone: str
    message_id: str
    message_type: str  # "text", "audio", "image", "document", "location"
    text: str | None = None
    media_url: str | None = None
    media_id: str | None = None
    media_mime_type: str | None = None
    filename: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    raw: dict = field(default_factory=dict)


class WhatsAppProvider(Protocol):
    """Interface that both Meta and Twilio providers implement."""

    async def parse_webhook(self, request) -> list[IncomingMessage]:
        """Parse incoming webhook request into normalized messages."""
        ...

    async def verify_webhook(self, request) -> str | None:
        """Handle webhook verification (GET). Returns challenge string or None."""
        ...

    async def send_text(self, to: str, text: str) -> dict:
        ...

    async def send_document(self, to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
        ...

    async def send_image(self, to: str, image_url: str, caption: str | None = None) -> dict:
        ...

    async def download_media(self, media_id: str | None = None, media_url: str | None = None) -> bytes:
        """Download media by ID (Meta) or URL (Twilio)."""
        ...
