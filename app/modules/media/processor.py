"""
Media Processor: extracts structured data from transcriptions and documents.
Uses Claude to parse free-form text into structured updates.
"""

from anthropic import AsyncAnthropic

from app.config import get_settings


async def extract_obra_update(transcription: str) -> dict:
    """Extract structured obra update data from a transcription."""
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=(
            "Extract structured construction update data from the following transcription. "
            "Return a JSON object with: etapa, porcentaje_avance, floor (nullable), "
            "nota_publica, nota_interna. "
            "Respond ONLY with the JSON object."
        ),
        messages=[{"role": "user", "content": transcription}],
    )

    # TODO: Parse JSON response, handle errors
    return {}


async def detect_document_type(filename: str, first_page_text: str) -> str:
    """Detect the type of document based on filename and content."""
    # TODO: Use Claude or heuristics to classify document type
    filename_lower = filename.lower()
    if "precio" in filename_lower or "lista" in filename_lower:
        return "precios"
    elif "plano" in filename_lower:
        return "plano"
    elif "memoria" in filename_lower:
        return "memoria"
    elif "reglamento" in filename_lower:
        return "reglamento"
    elif "faq" in filename_lower:
        return "faq"
    return "otro"
