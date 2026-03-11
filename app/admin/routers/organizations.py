# app/admin/routers/organizations.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


class OrganizationBody(BaseModel):
    name: str
    tipo: str = "ambas"
    cuit: Optional[str] = None


class SubscriptionCreate(BaseModel):
    organization_id: str
    plan: str  # 'base' | 'pro' | 'studio'
    billing_cycle: str = "monthly"  # 'monthly' | 'annual'
    price_usd: float
    current_period_start: str  # ISO date string YYYY-MM-DD
    current_period_end: str    # ISO date string YYYY-MM-DD
    postventa_projects: int = 0
    notes: Optional[str] = None
    status: str = "active"


class SubscriptionUpdate(BaseModel):
    plan: Optional[str] = None
    status: Optional[str] = None
    billing_cycle: Optional[str] = None
    price_usd: Optional[float] = None
    current_period_start: Optional[str] = None
    current_period_end: Optional[str] = None
    postventa_projects: Optional[int] = None
    notes: Optional[str] = None


@router.get("/organizations")
async def list_organizations(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """List all organizations."""
    _require_admin(credentials)
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, name, tipo, cuit, activa, created_at FROM organizations ORDER BY name"
    )
    return [dict(r) for r in rows]


@router.post("/organizations")
async def create_organization(
    body: OrganizationBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Create a new organization. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede crear organizaciones")
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT id FROM organizations WHERE name = $1", body.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"Ya existe una organización con el nombre '{body.name}'")
    import re
    org_slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")
    row = await pool.fetchrow(
        """INSERT INTO organizations (name, tipo, cuit, slug)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, tipo, cuit, activa, created_at""",
        body.name, body.tipo, body.cuit, org_slug,
    )
    logger.info("Organization created: %s (%s)", body.name, row["id"])
    return dict(row)


@router.patch("/organizations/{org_id}")
async def update_organization(
    org_id: str,
    body: OrganizationBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Update an organization. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede editar organizaciones")
    pool = await get_pool()
    row = await pool.fetchrow(
        """UPDATE organizations SET name = $1, tipo = $2, cuit = $3
           WHERE id = $4
           RETURNING id, name, tipo, cuit, activa, created_at""",
        body.name, body.tipo, body.cuit, org_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    logger.info("Organization updated: %s (%s)", body.name, org_id)
    return dict(row)


@router.patch("/organizations/{org_id}/toggle-active")
async def toggle_organization_active(
    org_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Toggle organization active/inactive. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede desactivar organizaciones")
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE organizations SET activa = NOT activa WHERE id = $1 RETURNING id, name, activa",
        org_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    logger.info("Organization %s toggled active=%s", org_id, row["activa"])
    return dict(row)


@router.get("/subscriptions")
async def list_subscriptions(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Lista todas las suscripciones. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede ver suscripciones")
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT s.*, o.name AS org_name
           FROM subscriptions s
           JOIN organizations o ON o.id = s.organization_id
           ORDER BY o.name"""
    )
    return [dict(r) for r in rows]


@router.get("/subscriptions/{org_id}")
async def get_subscription(
    org_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Obtiene la suscripción de una organización."""
    payload = _require_admin(credentials)
    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")
    if caller_role != "superadmin" and caller_org != org_id:
        raise HTTPException(status_code=403)
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT s.*, o.name AS org_name
           FROM subscriptions s
           JOIN organizations o ON o.id = s.organization_id
           WHERE s.organization_id = $1""",
        org_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Sin suscripción activa")
    return dict(row)


@router.post("/subscriptions")
async def create_subscription(
    body: SubscriptionCreate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Crea una suscripción para una organización. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede crear suscripciones")
    if body.plan not in ("base", "pro", "studio"):
        raise HTTPException(status_code=400, detail="plan debe ser base, pro o studio")
    if body.status not in ("trial", "active", "past_due", "suspended", "cancelled"):
        raise HTTPException(status_code=400, detail="status inválido")
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO subscriptions
               (organization_id, plan, status, billing_cycle, price_usd,
                current_period_start, current_period_end, postventa_projects, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *""",
        body.organization_id, body.plan, body.status, body.billing_cycle,
        body.price_usd,
        __import__('datetime').date.fromisoformat(body.current_period_start),
        __import__('datetime').date.fromisoformat(body.current_period_end),
        body.postventa_projects, body.notes,
    )
    logger.info("Subscription created for org %s: plan=%s", body.organization_id, body.plan)
    return dict(row)


@router.patch("/subscriptions/{org_id}")
async def update_subscription(
    org_id: str,
    body: SubscriptionUpdate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Actualiza la suscripción de una organización. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede modificar suscripciones")
    if body.plan and body.plan not in ("base", "pro", "studio"):
        raise HTTPException(status_code=400, detail="plan debe ser base, pro o studio")
    if body.status and body.status not in ("trial", "active", "past_due", "suspended", "cancelled"):
        raise HTTPException(status_code=400, detail="status inválido")
    from datetime import date as _date
    pool = await get_pool()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Convertir strings de fecha a datetime.date para asyncpg
    for date_field in ("current_period_start", "current_period_end"):
        if date_field in updates and isinstance(updates[date_field], str):
            updates[date_field] = _date.fromisoformat(updates[date_field])
    if not updates:
        row = await pool.fetchrow("SELECT * FROM subscriptions WHERE organization_id = $1", org_id)
        return dict(row) if row else {}
    set_clause = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await pool.fetchrow(
        f"UPDATE subscriptions SET {set_clause}, updated_at = NOW() WHERE organization_id = $1 RETURNING *",
        org_id, *values,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    logger.info("Subscription updated for org %s: %s", org_id, updates)
    return dict(row)
