from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class Handoff(BaseModel):
    id: UUID
    lead_id: UUID
    project_id: UUID
    assigned_to: UUID | None = None
    trigger: str  # lead_request, agent_escalation, hot_score, frustration, manual
    status: str = "pending"  # pending, active, completed, expired
    context_summary: str | None = None
    lead_note: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
