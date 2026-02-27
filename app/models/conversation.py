from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class Conversation(BaseModel):
    id: UUID
    lead_id: UUID
    wa_message_id: str | None = None
    role: str  # user, assistant
    sender_type: str = "agent"  # agent, human, lead
    sender_id: UUID | None = None
    handoff_id: UUID | None = None
    content: str
    media_type: str | None = None  # text, audio, image, document
    media_url: str | None = None
    created_at: datetime


class DeveloperConversation(BaseModel):
    id: UUID
    authorized_number_id: UUID
    project_id: UUID
    role: str  # user, assistant
    content: str
    media_type: str | None = None
    media_url: str | None = None
    action_type: str | None = None  # obra_update, doc_upload, price_update, query, milestone, handoff
    action_result: dict | None = None
    created_at: datetime
