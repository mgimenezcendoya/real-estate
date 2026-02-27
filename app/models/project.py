from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class Developer(BaseModel):
    id: UUID
    name: str
    contact_phone: str | None = None
    contact_email: str | None = None
    created_at: datetime


class Project(BaseModel):
    id: UUID
    developer_id: UUID
    name: str
    whatsapp_number: str | None = None
    status: str = "active"
    created_at: datetime


class Unit(BaseModel):
    id: UUID
    project_id: UUID
    identifier: str
    floor: int | None = None
    bedrooms: int | None = None
    area_m2: Decimal | None = None
    price_usd: Decimal | None = None
    status: str = "available"


class AuthorizedNumber(BaseModel):
    id: UUID
    phone: str
    project_id: UUID
    role: str  # admin, obra, ventas
    name: str | None = None
    status: str = "pending"  # pending, active, revoked
    activation_code: str | None = None
    activated_at: datetime | None = None
    created_at: datetime
