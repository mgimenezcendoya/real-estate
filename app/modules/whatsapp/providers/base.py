"""
Base interface for WhatsApp providers.
Both Meta and Twilio implementations conform to this interface.
The rest of the app works with IncomingMessage — never touches provider-specific formats.
"""

from dataclasses import dataclass, field
from typing import Optional, Protocol


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


@dataclass
class TenantChannel:
    """Credentials and metadata for one tenant's messaging channel."""
    id: str                          # UUID from tenant_channels table
    organization_id: str             # UUID of the tenant
    provider: str                    # 'twilio' | 'meta'
    phone_number: str                # E.164, e.g. '+14155238886'
    display_name: Optional[str] = None
    # Twilio
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None  # decrypted value (not _enc)
    # Meta
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    verify_token: Optional[str] = None
    waba_id: Optional[str] = None


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
