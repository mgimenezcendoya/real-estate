from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class Lead(BaseModel):
    id: UUID
    project_id: UUID
    phone: str
    name: str | None = None
    intent: str | None = None  # investment, own_home, unknown
    financing: str | None = None  # own_capital, needs_financing, unknown
    timeline: str | None = None  # immediate, 3_months, 6_months, exploring
    score: str | None = None  # hot, warm, cold
    source: str | None = None  # instagram, zonaprop, referido
    created_at: datetime
    last_contact: datetime | None = None


class Session(BaseModel):
    phone: str
    project_id: UUID
    lead_id: UUID | None = None
    state: dict | None = None
    updated_at: datetime
