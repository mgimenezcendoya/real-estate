"""
Lead Qualification: scoring logic based on progressive qualification data.
"""


def calculate_score(intent: str | None, financing: str | None, timeline: str | None) -> str:
    """Calculate lead score based on qualification answers."""
    points = 0

    if intent == "investment":
        points += 2
    elif intent == "own_home":
        points += 3

    if financing == "own_capital":
        points += 3
    elif financing == "needs_financing":
        points += 1

    if timeline == "immediate":
        points += 3
    elif timeline == "3_months":
        points += 2
    elif timeline == "6_months":
        points += 1

    if points >= 7:
        return "hot"
    elif points >= 4:
        return "warm"
    return "cold"


def get_next_qualification_question(state: dict) -> str | None:
    """Determine the next qualification question to ask based on current state."""
    if not state.get("intent"):
        return "Estas buscando como inversion o para vivienda propia?"
    if not state.get("financing"):
        return "Contas con capital propio o necesitas financiamiento?"
    if not state.get("timeline"):
        return "Para cuando estarias pensando en concretar la compra?"
    return None
