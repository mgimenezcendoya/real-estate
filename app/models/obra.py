from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class Buyer(BaseModel):
    id: UUID
    project_id: UUID
    lead_id: UUID | None = None
    unit_id: UUID | None = None
    phone: str
    name: str | None = None
    signed_at: datetime | None = None
    status: str = "active"  # active, delivered, cancelled


class ObraUpdate(BaseModel):
    id: UUID
    project_id: UUID
    fecha: date
    etapa: str | None = None  # excavacion, estructura, cerramientos, terminaciones
    porcentaje_avance: int | None = None
    fotos_urls: list[str] | None = None
    nota_publica: str | None = None
    nota_interna: str | None = None
    source: str = "whatsapp"  # whatsapp, api, manual
    created_by: UUID | None = None
    enviado: bool = False
    created_at: datetime


class ObraMilestone(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    etapa: str | None = None
    floor: int | None = None
    completed_at: datetime
    notify_buyers: bool = False
    notified: bool = False
    created_by: UUID | None = None
