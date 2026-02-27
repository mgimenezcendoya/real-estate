"""
Intent Classifier: uses Claude to detect the intent of an incoming message.
Supports multi-intent detection (e.g., price + financing in the same message).
"""

from anthropic import AsyncAnthropic

from app.config import get_settings

INTENT_CATEGORIES = [
    "precio",
    "financiamiento",
    "disponibilidad",
    "ubicacion",
    "amenities",
    "visita",
    "documentacion",
    "avance_obra",
    "contacto_humano",
    "saludo",
    "otro",
]


async def classify_intent(text: str, conversation_history: list[dict] | None = None) -> list[str]:
    """Classify the intent(s) of a lead message. Returns a list of detected intents."""
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    system_prompt = (
        "You are an intent classifier for a real estate AI agent. "
        "Analyze the user message and return the detected intents as a JSON array. "
        "A message can have multiple intents. "
        f"Valid intents: {INTENT_CATEGORIES}\n"
        "Respond ONLY with the JSON array, nothing else."
    )

    messages = []
    if conversation_history:
        messages.extend(conversation_history[-5:])
    messages.append({"role": "user", "content": text})

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=100,
        system=system_prompt,
        messages=messages,
    )

    # TODO: Parse JSON response, handle errors
    return ["otro"]
