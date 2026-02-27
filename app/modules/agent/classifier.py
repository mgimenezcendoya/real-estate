"""
Intent Classifier: uses Claude to detect the intent of an incoming message.
Supports multi-intent detection (e.g., price + financing in the same message).
"""

import json
import logging

from anthropic import AsyncAnthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

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
        "Respond ONLY with the JSON array, nothing else. Example: [\"precio\", \"disponibilidad\"]"
    )

    messages = []
    if conversation_history:
        for msg in conversation_history[-5:]:
            role = "user" if msg.get("sender_type") == "lead" else "assistant"
            messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": text})

    try:
        settings = get_settings()
        response = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=100,
            system=system_prompt,
            messages=messages,
        )

        raw = response.content[0].text.strip()
        intents = json.loads(raw)

        if isinstance(intents, list):
            valid = [i for i in intents if i in INTENT_CATEGORIES]
            return valid if valid else ["otro"]

        return ["otro"]
    except (json.JSONDecodeError, IndexError, KeyError) as e:
        logger.warning("Failed to parse classifier response: %s", e)
        return ["otro"]
    except Exception as e:
        logger.error("Classifier error: %s", e)
        return ["otro"]
