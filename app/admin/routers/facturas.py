# app/admin/routers/facturas.py
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.auth import verify_token
from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool
from app.modules.storage import upload_factura_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


class FacturaBody(BaseModel):
    tipo: str = "otro"
    numero_factura: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    cuit_emisor: Optional[str] = None
    fecha_emision: str
    fecha_vencimiento: Optional[str] = None
    monto_neto: Optional[float] = None
    iva_pct: Optional[float] = 21
    monto_total: float
    moneda: str = "ARS"
    categoria: str = "egreso"
    file_url: Optional[str] = None
    gasto_id: Optional[str] = None
    estado: str = "cargada"
    notas: Optional[str] = None
    payment_record_id: Optional[str] = None
    # Campos unificados (antes en project_expenses / obra_payments)
    etapa_id: Optional[str] = None
    budget_id: Optional[str] = None
    supplier_id: Optional[str] = None
    monto_usd: Optional[float] = None
    reservation_id: Optional[str] = None


class PatchFacturaBody(BaseModel):
    tipo: Optional[str] = None
    numero_factura: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    cuit_emisor: Optional[str] = None
    fecha_emision: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    monto_neto: Optional[float] = None
    iva_pct: Optional[float] = None
    monto_total: Optional[float] = None
    moneda: Optional[str] = None
    categoria: Optional[str] = None
    file_url: Optional[str] = None
    estado: Optional[str] = None
    notas: Optional[str] = None
    payment_record_id: Optional[str] = None
    etapa_id: Optional[str] = None
    budget_id: Optional[str] = None
    supplier_id: Optional[str] = None
    monto_usd: Optional[float] = None
    reservation_id: Optional[str] = None


@router.get("/facturas/{project_id}")
async def list_facturas(
    project_id: str,
    categoria: Optional[str] = None,
    tipo: Optional[str] = None,
    proveedor: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()
    conditions = ["f.project_id = $1", "f.deleted_at IS NULL"]
    params: list = [project_id]
    i = 2
    if categoria:
        conditions.append(f"f.categoria = ${i}"); params.append(categoria); i += 1
    if tipo:
        conditions.append(f"f.tipo = ${i}"); params.append(tipo); i += 1
    if proveedor:
        conditions.append(f"(f.proveedor_nombre ILIKE ${i} OR s.nombre ILIKE ${i})"); params.append(f"%{proveedor}%"); i += 1
    if fecha_desde:
        conditions.append(f"f.fecha_emision >= ${i}"); params.append(datetime.strptime(fecha_desde, "%Y-%m-%d").date()); i += 1
    if fecha_hasta:
        conditions.append(f"f.fecha_emision <= ${i}"); params.append(datetime.strptime(fecha_hasta, "%Y-%m-%d").date()); i += 1
    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""SELECT f.*,
                   s.nombre AS proveedor_supplier,
                   oe.nombre AS etapa_nombre,
                   pb.categoria AS budget_categoria,
                   r.buyer_name AS linked_buyer_name,
                   pi.numero_cuota AS linked_cuota,
                   pr.monto_pagado AS linked_monto,
                   pr.moneda AS linked_moneda,
                   pr.fecha_pago AS linked_fecha_pago
            FROM facturas f
            LEFT JOIN suppliers s ON s.id = f.proveedor_id
            LEFT JOIN obra_etapas oe ON oe.id = f.etapa_id
            LEFT JOIN project_budget pb ON pb.id = f.budget_id
            LEFT JOIN payment_records pr ON pr.id = f.payment_record_id
            LEFT JOIN payment_installments pi ON pi.id = pr.installment_id
            LEFT JOIN payment_plans pp ON pp.id = pi.plan_id
            LEFT JOIN reservations r ON r.id = pp.reservation_id
            WHERE {where}
            ORDER BY f.fecha_emision DESC""",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/facturas/{project_id}/linkable-payments")
async def list_linkable_payments(
    project_id: str,
    q: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """List payment_records (plan-based) and direct-sale reservations, optionally filtered by buyer name."""
    pool = await get_pool()
    name_filter = f"%{q}%" if q else "%"

    rows = await pool.fetch(
        """-- Plan-based payment records
           SELECT pr.id::text AS id,
                  'payment_record' AS kind,
                  r.buyer_name,
                  pi.numero_cuota,
                  pr.monto_pagado AS monto,
                  pr.moneda::text AS moneda,
                  pr.fecha_pago AS fecha
           FROM payment_records pr
           JOIN payment_installments pi ON pi.id = pr.installment_id
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           WHERE r.project_id = $1
             AND pr.deleted_at IS NULL
             AND r.buyer_name ILIKE $2
           UNION ALL
           -- Direct-sale reservations (no payment plan)
           SELECT r.id::text AS id,
                  'reservation' AS kind,
                  r.buyer_name,
                  NULL AS numero_cuota,
                  r.amount_usd AS monto,
                  'USD'::text AS moneda,
                  r.signed_at AS fecha
           FROM reservations r
           WHERE r.project_id = $1
             AND r.buyer_name ILIKE $2
             AND NOT EXISTS (
               SELECT 1 FROM payment_plans pp WHERE pp.reservation_id = r.id
             )
           ORDER BY fecha DESC
           LIMIT 30""",
        project_id, name_filter,
    )
    return [dict(r) for r in rows]


@router.post("/facturas/{project_id}")
async def create_factura(
    project_id: str,
    body: FacturaBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    async with pool.acquire() as conn:
        async with conn.transaction():
            payment_record_id = body.payment_record_id or None
            row = await conn.fetchrow(
                """INSERT INTO facturas
                   (project_id, tipo, numero_factura, proveedor_nombre, proveedor_id, cuit_emisor,
                    fecha_emision, fecha_vencimiento, monto_neto, iva_pct, monto_total, monto_usd,
                    moneda, categoria, file_url, payment_record_id, reservation_id, estado, notas,
                    etapa_id, budget_id)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
                   RETURNING id""",
                project_id, body.tipo, body.numero_factura, body.proveedor_nombre,
                body.supplier_id or None,
                body.cuit_emisor,
                datetime.strptime(body.fecha_emision, "%Y-%m-%d").date(),
                datetime.strptime(body.fecha_vencimiento, "%Y-%m-%d").date() if body.fecha_vencimiento else None,
                body.monto_neto, body.iva_pct, body.monto_total, body.monto_usd,
                body.moneda, body.categoria, body.file_url,
                payment_record_id, body.reservation_id or None, body.estado, body.notas,
                body.etapa_id or None, body.budget_id or None,
            )
            if payment_record_id or body.reservation_id:
                await conn.execute(
                    "UPDATE facturas SET estado='vinculada' WHERE id=$1", row["id"]
                )
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="INSERT",
                 table_name="facturas", record_id=str(row["id"]), project_id=project_id,
                 details={"numero_factura": body.numero_factura, "proveedor_nombre": body.proveedor_nombre,
                          "monto_total": body.monto_total, "moneda": body.moneda})
    return {"factura_id": str(row["id"])}


@router.patch("/facturas/{factura_id}")
async def patch_factura(
    factura_id: str,
    body: PatchFacturaBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Renombrar supplier_id → proveedor_id para la BD
    if "supplier_id" in updates:
        updates["proveedor_id"] = updates.pop("supplier_id")
    if "fecha_emision" in updates:
        updates["fecha_emision"] = datetime.strptime(updates["fecha_emision"], "%Y-%m-%d").date()
    if "fecha_vencimiento" in updates:
        updates["fecha_vencimiento"] = datetime.strptime(updates["fecha_vencimiento"], "%Y-%m-%d").date()
    if not updates:
        return {"ok": True}
    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates.keys()))
    values = [factura_id] + list(updates.values())
    await pool.execute(f"UPDATE facturas SET {set_clause} WHERE id = $1 AND deleted_at IS NULL", *values)
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="UPDATE",
                 table_name="facturas", record_id=factura_id,
                 details={k: str(v) for k, v in updates.items()})
    return {"ok": True}


@router.delete("/facturas/{factura_id}")
async def delete_factura(
    factura_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    await pool.execute("UPDATE facturas SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL", factura_id)
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="DELETE",
                 table_name="facturas", record_id=factura_id)
    return {"ok": True}


@router.post("/facturas/{project_id}/upload-pdf")
async def upload_factura_pdf_endpoint(
    project_id: str,
    file: UploadFile = File(...),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Upload a factura PDF to S3 under orgs/{org_id}/projects/{slug}/facturas/..."""
    pool = await get_pool()
    project = await pool.fetchrow(
        "SELECT p.slug, p.organization_id, o.slug as org_slug FROM projects p LEFT JOIN organizations o ON o.id = p.organization_id WHERE p.id = $1",
        project_id,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if project["organization_id"] is None:
        raise HTTPException(status_code=400, detail="El proyecto no tiene organización asignada")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    try:
        org_slug = project["org_slug"] or str(project["organization_id"])
        url = await upload_factura_pdf(
            file_bytes=content,
            org_id=str(project["organization_id"]),
            org_slug=org_slug,
            project_slug=project["slug"],
            filename=file.filename or "factura.pdf",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"file_url": url}
