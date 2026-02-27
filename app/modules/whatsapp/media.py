"""
Public API for downloading WhatsApp media.
Delegates to the configured provider (Meta or Twilio).
"""

from app.config import get_settings


def _get_provider():
    settings = get_settings()
    if settings.whatsapp_provider == "twilio":
        from app.modules.whatsapp.providers import twilio
        return twilio
    from app.modules.whatsapp.providers import meta
    return meta


async def download_media(media_id: str | None = None, media_url: str | None = None) -> bytes:
    """Download media by ID (Meta) or URL (Twilio)."""
    return await _get_provider().download_media(media_id=media_id, media_url=media_url)


async def download_media_with_filename(media_url: str) -> tuple[bytes, str | None]:
    """Download media and try to extract the original filename. Falls back to None."""
    settings = get_settings()
    if settings.whatsapp_provider == "twilio":
        from app.modules.whatsapp.providers import twilio
        return await twilio.download_media_with_filename(media_url)
    content = await _get_provider().download_media(media_url=media_url)
    return content, None


async def get_media_url(media_id: str) -> str:
    """Get download URL for a media file. On Twilio, the URL comes directly in the webhook."""
    settings = get_settings()
    if settings.whatsapp_provider == "twilio":
        return ""
    from app.modules.whatsapp.providers import meta
    import httpx
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://graph.facebook.com/v21.0/{media_id}", headers=headers)
        return response.json().get("url", "")
