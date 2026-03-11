# app/admin/routers/facturas.py
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

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
    # Auto-create expense
    crear_gasto: bool = False
    gasto_descripcion: Optional[str] = None
    gasto_budget_id: Optional[str] = None
    payment_record_id: Optional[str] = None


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


@router.get("/facturas/{project_id}")
async def list_facturas(
    project_id: str,
    categoria: Optional[str] = None,
    tipo: Optional[str] = None,
    proveedor: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
):
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
        f"""SELECT f.*, s.nombre AS proveedor_supplier,
                   r.buyer_name AS linked_buyer_name,
                   pi.numero_cuota AS linked_cuota,
                   pr.monto_pagado AS linked_monto,
                   pr.moneda AS linked_moneda,
                   pr.fecha_pago AS linked_fecha_pago
            FROM facturas f
            LEFT JOIN suppliers s ON s.id = f.proveedor_id
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
    """List payment_records for a project, optionally filtered by buyer name."""
    pool = await get_pool()
    conditions = ["r.project_id = $1"]
    params: list = [project_id]
    if q:
        conditions.append(f"r.buyer_name ILIKE $2")
        params.append(f"%{q}%")
    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""SELECT pr.id, r.buyer_name, pi.numero_cuota, pi.concepto,
                   pr.monto_pagado, pr.moneda, pr.fecha_pago
            FROM payment_records pr
            JOIN payment_installments pi ON pi.id = pr.installment_id
            JOIN payment_plans pp ON pp.id = pi.plan_id
            JOIN reservations r ON r.id = pp.reservation_id
            WHERE {where} AND pr.deleted_at IS NULL
            ORDER BY pr.fecha_pago DESC
            LIMIT 20""",
        *params,
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
            gasto_id = body.gasto_id
            if body.crear_gasto:
                # Auto-create expense from factura
                monto_usd = body.monto_total if body.moneda == "USD" else None
                monto_ars = body.monto_total if body.moneda == "ARS" else None
                desc = body.gasto_descripcion or f"Factura {body.numero_factura or ''} - {body.proveedor_nombre or ''}"
                gasto_row = await conn.fetchrow(
                    """INSERT INTO project_expenses
                       (project_id, budget_id, proveedor, descripcion, monto_usd, monto_ars, fecha)
                       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id""",
                    project_id,
                    body.gasto_budget_id or None,
                    body.proveedor_nombre,
                    desc,
                    monto_usd,
                    monto_ars,
                    datetime.strptime(body.fecha_emision, "%Y-%m-%d").date(),
                )
                gasto_id = str(gasto_row["id"])
            payment_record_id = body.payment_record_id or None
            row = await conn.fetchrow(
                """INSERT INTO facturas
                   (project_id, tipo, numero_factura, proveedor_nombre, cuit_emisor,
                    fecha_emision, fecha_vencimiento, monto_neto, iva_pct, monto_total,
                    moneda, categoria, file_url, gasto_id, payment_record_id, estado, notas)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                   RETURNING id""",
                project_id, body.tipo, body.numero_factura, body.proveedor_nombre,
                body.cuit_emisor,
                datetime.strptime(body.fecha_emision, "%Y-%m-%d").date(),
                datetime.strptime(body.fecha_vencimiento, "%Y-%m-%d").date() if body.fecha_vencimiento else None,
                body.monto_neto, body.iva_pct, body.monto_total,
                body.moneda, body.categoria, body.file_url,
                gasto_id, payment_record_id, body.estado, body.notas,
            )
            estado_final = "vinculada" if (gasto_id or payment_record_id) else "cargada"
            if gasto_id:
                await conn.execute(
                    "UPDATE facturas SET estado=$1 WHERE id=$2", estado_final, row["id"]
                )
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="INSERT",
                 table_name="facturas", record_id=str(row["id"]), project_id=project_id,
                 details={"numero_factura": body.numero_factura, "proveedor_nombre": body.proveedor_nombre,
                          "monto_total": body.monto_total, "moneda": body.moneda})
    return {"factura_id": str(row["id"]), "gasto_id": gasto_id}


@router.patch("/facturas/{factura_id}")
async def patch_factura(
    factura_id: str,
    body: PatchFacturaBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
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
