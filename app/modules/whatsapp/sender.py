"""
Public API for sending WhatsApp messages.
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


async def send_text_message(to: str, text: str) -> dict:
    return await _get_provider().send_text(to, text)


async def send_document_message(to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
    return await _get_provider().send_document(to, document_url, filename, caption)


async def send_image_message(to: str, image_url: str, caption: str | None = None) -> dict:
    return await _get_provider().send_image(to, image_url, caption)


async def send_template_message(to: str, template_name: str, language: str = "es_AR", components: list | None = None) -> dict:
    """Send a template message. Only supported on Meta — on Twilio falls back to text."""
    settings = get_settings()
    if settings.whatsapp_provider == "twilio":
        return await _get_provider().send_text(to, f"[Template: {template_name}]")
    from app.modules.whatsapp.providers import meta
    return await meta.send_template(to, template_name, language, components)
