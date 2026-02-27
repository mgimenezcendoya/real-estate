"""
Lead Qualification: scoring, extraction (via Claude), and status helpers.
"""

import json
import logging

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.modules.agent.prompts import EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

QUALIFICATION_FIELDS = {
    "name": "Nombre",
    "intent": "Proposito (inversion / vivienda / alquiler)",
    "financing": "Financiamiento (capital propio / financiamiento / mixto)",
    "timeline": "Timeline (cuando piensa comprar)",
    "budget_usd": "Presupuesto en USD",
    "bedrooms": "Cantidad de ambientes",
    "location_pref": "Ubicacion / zona preferida",
}

INTENT_SCORES = {"own_home": 3, "investment": 2, "rental": 1}
FINANCING_SCORES = {"own_capital": 3, "mixed": 2, "needs_financing": 1}
TIMELINE_SCORES = {"immediate": 3, "3_months": 2, "6_months": 1, "1_year_plus": 0}


def calculate_score(qualification: dict) -> str:
    """Calculate lead score (hot/warm/cold) from qualification data."""
    points = 0
    points += INTENT_SCORES.get(qualification.get("intent", ""), 0)
    points += FINANCING_SCORES.get(qualification.get("financing", ""), 0)
    points += TIMELINE_SCORES.get(qualification.get("timeline", ""), 0)

    if qualification.get("budget_usd"):
        points += 2
    if qualification.get("bedrooms"):
        points += 1
    if qualification.get("location_pref"):
        points += 1

    if points >= 9:
        return "hot"
    elif points >= 5:
        return "warm"
    return "cold"


def build_qualification_status(qualification: dict) -> str:
    """Format known qualification data as a readable string for the system prompt."""
    labels = {
        "intent": {"investment": "Inversion", "own_home": "Vivienda propia", "rental": "Alquiler"},
        "financing": {"own_capital": "Capital propio", "needs_financing": "Necesita financiamiento", "mixed": "Mixto"},
        "timeline": {"immediate": "Inmediato", "3_months": "En 3 meses", "6_months": "En 6 meses", "1_year_plus": "Mas de 1 año"},
    }

    lines = []
    if qualification.get("name"):
        lines.append(f"- Nombre: {qualification['name']}")
    if qualification.get("intent"):
        lines.append(f"- Proposito: {labels['intent'].get(qualification['intent'], qualification['intent'])}")
    if qualification.get("financing"):
        lines.append(f"- Financiamiento: {labels['financing'].get(qualification['financing'], qualification['financing'])}")
    if qualification.get("timeline"):
        lines.append(f"- Timeline: {labels['timeline'].get(qualification['timeline'], qualification['timeline'])}")
    if qualification.get("budget_usd"):
        lines.append(f"- Presupuesto: USD {qualification['budget_usd']:,}")
    if qualification.get("bedrooms"):
        lines.append(f"- Ambientes: {qualification['bedrooms']}")
    if qualification.get("location_pref"):
        lines.append(f"- Ubicacion: {qualification['location_pref']}")

    return "\n".join(lines) if lines else "Ninguno todavia — es un contacto nuevo."


def build_missing_fields(qualification: dict) -> str:
    """List fields still unknown, for the system prompt."""
    missing = []
    for key, label in QUALIFICATION_FIELDS.items():
        if not qualification.get(key):
            missing.append(f"- {label}")
    return "\n".join(missing) if missing else "Todos los datos recopilados."


async def extract_qualification_data(conversation_history: list[dict]) -> dict:
    """Use Claude to extract qualification data from the conversation."""
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    messages_text = "\n".join(
        f"{'Lead' if m.get('sender_type') == 'lead' else 'Agente'}: {m['content']}"
        for m in conversation_history
    )

    try:
        response = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=200,
            system=EXTRACTION_PROMPT,
            messages=[{"role": "user", "content": messages_text}],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        data = json.loads(raw)

        valid = {}
        for key in QUALIFICATION_FIELDS:
            val = data.get(key)
            if val is not None:
                valid[key] = val
        return valid

    except (json.JSONDecodeError, IndexError, KeyError) as e:
        logger.warning("Failed to parse extraction response: %s", e)
        return {}
    except Exception as e:
        logger.error("Extraction error: %s", e)
        return {}


def merge_qualification(existing: dict, extracted: dict) -> dict:
    """Merge newly extracted data into existing qualification, without overwriting with None."""
    merged = dict(existing)
    for key, val in extracted.items():
        if val is not None:
            merged[key] = val
    return merged
