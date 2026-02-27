from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class Document(BaseModel):
    id: UUID
    project_id: UUID
    doc_type: str | None = None  # memoria, plano, reglamento, precios, faq
    filename: str | None = None
    file_url: str | None = None
    file_size_bytes: int | None = None
    unit_identifier: str | None = None  # '4B', '2A' — for unit-specific docs
    floor: int | None = None
    version: int = 1
    is_active: bool = True
    source: str = "whatsapp"  # whatsapp, nocodb, api
    uploaded_by: UUID | None = None
    rag_status: str = "pending"  # pending, processing, ready, error
    uploaded_at: datetime


class DocumentChunk(BaseModel):
    id: UUID
    document_id: UUID
    project_id: UUID
    content: str
    metadata: dict | None = None  # { "unit": "4B", "floor": 4, "page": 2 }
    created_at: datetime
