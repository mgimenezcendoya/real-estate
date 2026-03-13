# app/admin/routers/portal.py
"""
Portal del Comprador — endpoints for buyers to view their project progress and payment plan.
These endpoints are NOT under /admin; they are registered at /portal in main.py.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.auth import (
    authenticate_user_db,
    create_token,
    update_ultimo_acceso,
    verify_token,
)
from app.admin.deps import security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()

TOKEN_EXPIRY_HOURS = 24


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _require_comprador(credentials: Optional[HTTPAuthorizationCredentials]) -> dict:
    """Raise 401/403 if token is missing or role != comprador."""
    if not credentials or credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    if payload.get("role") != "comprador":
        raise HTTPException(status_code=403, detail="Acceso exclusivo para compradores")
    return payload


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class PortalLoginBody(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
async def portal_login(body: PortalLoginBody):
    """Authenticate a comprador and return JWT + reservation_id."""
    pool = await get_pool()
    db_user = await authenticate_user_db(pool, body.email, body.password)

    if not db_user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if db_user["role"] != "comprador":
        raise HTTPException(status_code=403, detail="Este portal es exclusivo para compradores")

    await update_ultimo_acceso(pool, str(db_user["id"]))

    token = create_token(
        sub=db_user["email"],
        role="comprador",
        user_id=str(db_user["id"]),
        nombre=f"{db_user['nombre']} {db_user['apellido']}".strip(),
    )

    return {
        "token": token,
        "user_id": str(db_user["id"]),
        "email": db_user["email"],
        "nombre": f"{db_user['nombre']} {db_user['apellido']}".strip(),
        "reservation_id": str(db_user["reservation_id"]) if db_user.get("reservation_id") else None,
        "debe_cambiar_password": db_user["debe_cambiar_password"],
    }


# ---------------------------------------------------------------------------
# /portal/me
# ---------------------------------------------------------------------------

@router.get("/me")
async def portal_me(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Return comprador profile: user + reservation + unit + project."""
    payload = _require_comprador(credentials)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sin user_id")

    pool = await get_pool()

    row = await pool.fetchrow(
        """
        SELECT u.id AS user_id, u.email, u.nombre, u.apellido, u.debe_cambiar_password,
               u.reservation_id,
               r.id AS res_id, r.buyer_name, r.buyer_phone, r.buyer_email,
               r.amount_usd, r.payment_method, r.signed_at, r.status AS res_status,
               r.project_id,
               un.id AS unit_id, un.identifier AS unit_identifier, un.floor AS unit_floor,
               un.bedrooms, un.area_m2, un.price_usd,
               p.name AS project_name, p.address AS project_address,
               p.neighborhood, p.city, p.estimated_delivery
        FROM users u
        LEFT JOIN reservations r ON r.id = u.reservation_id
        LEFT JOIN units un ON un.id = r.unit_id
        LEFT JOIN projects p ON p.id = r.project_id
        WHERE u.id = $1
        """,
        user_id,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return dict(row)


# ---------------------------------------------------------------------------
# /portal/obra
# ---------------------------------------------------------------------------

@router.get("/obra")
async def portal_obra(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Return construction progress for the buyer's project (public notes only)."""
    payload = _require_comprador(credentials)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sin user_id")

    pool = await get_pool()

    # Get the buyer's project_id via reservation
    project_id = await pool.fetchval(
        """
        SELECT r.project_id
        FROM users u
        JOIN reservations r ON r.id = u.reservation_id
        WHERE u.id = $1
        """,
        user_id,
    )
    if not project_id:
        raise HTTPException(status_code=404, detail="No se encontró proyecto asociado")

    etapas = await pool.fetch(
        """SELECT id, nombre, orden, peso_pct, es_standard, activa, porcentaje_completado
           FROM obra_etapas WHERE project_id = $1 ORDER BY orden""",
        project_id,
    )
    if not etapas:
        return {"etapas": [], "progress": 0, "project_id": str(project_id)}

    updates = await pool.fetch(
        """SELECT id, etapa_id, fecha, nota_publica, scope,
                  unit_identifier, floor, created_at
           FROM obra_updates
           WHERE project_id = $1 AND nota_publica IS NOT NULL AND nota_publica != ''
           ORDER BY fecha DESC, created_at DESC""",
        project_id,
    )

    fotos = await pool.fetch(
        """SELECT f.id, f.update_id, f.file_url, f.filename, f.scope,
                  f.unit_identifier, f.floor, f.caption
           FROM obra_fotos f
           JOIN obra_updates u ON u.id = f.update_id
           WHERE u.project_id = $1
           ORDER BY f.uploaded_at ASC""",
        project_id,
    )

    fotos_by_update: dict = {}
    for f in fotos:
        uid = str(f["update_id"])
        fotos_by_update.setdefault(uid, []).append(dict(f))

    updates_by_etapa: dict = {}
    for u in updates:
        eid = str(u["etapa_id"]) if u["etapa_id"] else None
        if eid:
            u_dict = dict(u)
            u_dict["fotos"] = fotos_by_update.get(str(u["id"]), [])
            updates_by_etapa.setdefault(eid, []).append(u_dict)

    result = []
    for etapa in etapas:
        e_dict = dict(etapa)
        e_dict["updates"] = updates_by_etapa.get(str(etapa["id"]), [])
        result.append(e_dict)

    active = [e for e in result if e["activa"]]
    total_weight = sum(float(e["peso_pct"]) for e in active)
    progress = 0
    if total_weight:
        weighted = sum(float(e["peso_pct"]) * e["porcentaje_completado"] / 100 for e in active)
        progress = round(weighted / total_weight * 100)

    return {"etapas": result, "progress": progress, "project_id": str(project_id)}


# ---------------------------------------------------------------------------
# /portal/payment-plan
# ---------------------------------------------------------------------------

@router.get("/payment-plan")
async def portal_payment_plan(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Return the buyer's payment plan with installments and payment records."""
    payload = _require_comprador(credentials)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sin user_id")

    pool = await get_pool()

    reservation_id = await pool.fetchval(
        "SELECT reservation_id FROM users WHERE id = $1",
        user_id,
    )
    if not reservation_id:
        raise HTTPException(status_code=404, detail="No se encontró reserva asociada")

    plan = await pool.fetchrow(
        """SELECT id, reservation_id, descripcion, moneda_base, monto_total,
                  tipo_ajuste, porcentaje_ajuste, created_at
           FROM payment_plans
           WHERE reservation_id = $1""",
        reservation_id,
    )
    if not plan:
        return None

    installments = await pool.fetch(
        """SELECT id, plan_id, numero_cuota, concepto, monto, moneda,
                  fecha_vencimiento, estado, notas
           FROM payment_installments
           WHERE plan_id = $1
           ORDER BY numero_cuota""",
        str(plan["id"]),
    )

    records = await pool.fetch(
        """SELECT pr.id, pr.installment_id, pr.fecha_pago, pr.monto_pagado,
                  pr.moneda, pr.metodo_pago, pr.referencia, pr.notas, pr.created_at
           FROM payment_records pr
           JOIN payment_installments pi ON pi.id = pr.installment_id
           WHERE pi.plan_id = $1""",
        str(plan["id"]),
    )

    records_by_installment: dict = {}
    for r in records:
        iid = str(r["installment_id"])
        records_by_installment.setdefault(iid, []).append(dict(r))

    installments_list = []
    for inst in installments:
        i_dict = dict(inst)
        i_dict["records"] = records_by_installment.get(str(inst["id"]), [])
        installments_list.append(i_dict)

    result = dict(plan)
    result["installments"] = installments_list
    return result
