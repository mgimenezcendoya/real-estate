# app/admin/routers/obra.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.auth import verify_token
from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool
from app.modules.obra.notifier import notify_buyers_of_update
from app.modules.storage import upload_obra_foto

logger = logging.getLogger(__name__)
router = APIRouter()

STANDARD_ETAPAS = [
    {"nombre": "Excavación y cimientos",    "orden": 1, "peso_pct": 8},
    {"nombre": "Estructura",                "orden": 2, "peso_pct": 30},
    {"nombre": "Mampostería y cerramientos","orden": 3, "peso_pct": 15},
    {"nombre": "Instalaciones",             "orden": 4, "peso_pct": 15},
    {"nombre": "Terminaciones interiores",  "orden": 5, "peso_pct": 18},
    {"nombre": "Terminaciones exteriores",  "orden": 6, "peso_pct": 7},
    {"nombre": "Áreas comunes y amenities", "orden": 7, "peso_pct": 5},
    {"nombre": "Inspecciones y habilitación","orden": 8, "peso_pct": 2},
]

OBRA_CATEGORIA = "Pagos de Obra"


class SupplierBody(BaseModel):
    nombre: str
    cuit: Optional[str] = None
    rubro: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None


class ObraPaymentBody(BaseModel):
    supplier_id: Optional[str] = None
    etapa_id: Optional[str] = None
    budget_id: Optional[str] = None
    descripcion: str
    monto_usd: Optional[float] = None
    monto_ars: Optional[float] = None
    fecha_vencimiento: Optional[str] = None
    estado: str = "pendiente"
    fecha_pago: Optional[str] = None
    comprobante_url: Optional[str] = None


@router.post("/obra/{project_id}/init")
async def init_obra_etapas(project_id: str):
    """Initialize the 8 standard obra stages for a project. No-op if already initialized."""
    pool = await get_pool()
    existing = await pool.fetchval(
        "SELECT COUNT(*) FROM obra_etapas WHERE project_id = $1", project_id
    )
    if existing > 0:
        return {"already_initialized": True, "count": existing}

    async with pool.acquire() as conn:
        async with conn.transaction():
            for e in STANDARD_ETAPAS:
                await conn.execute(
                    "INSERT INTO obra_etapas (project_id, nombre, orden, peso_pct, es_standard) VALUES ($1, $2, $3, $4, TRUE)",
                    project_id, e["nombre"], e["orden"], e["peso_pct"],
                )

    logger.info("Initialized %d obra etapas for project %s", len(STANDARD_ETAPAS), project_id)
    return {"initialized": len(STANDARD_ETAPAS)}


@router.get("/obra/{project_id}")
async def get_obra(
    project_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Get full obra data: etapas with nested updates+fotos, calculated overall progress."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()

    etapas = await pool.fetch(
        "SELECT id, nombre, orden, peso_pct, es_standard, activa, porcentaje_completado FROM obra_etapas WHERE project_id = $1 ORDER BY orden",
        project_id,
    )
    if not etapas:
        return {"etapas": [], "progress": 0}

    updates = await pool.fetch(
        """SELECT id, etapa_id, fecha, nota_publica, nota_interna, scope,
                  unit_identifier, floor, enviado, created_at
           FROM obra_updates WHERE project_id = $1 ORDER BY fecha DESC, created_at DESC""",
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

    return {"etapas": result, "progress": progress}


@router.patch("/obra/etapas/{etapa_id}")
async def patch_etapa(etapa_id: str, request: Request):
    """Update an etapa: nombre, peso_pct, porcentaje_completado, activa."""
    pool = await get_pool()
    body = await request.json()
    ALLOWED = {"nombre", "peso_pct", "porcentaje_completado", "activa"}
    fields = {k: v for k, v in body.items() if k in ALLOWED}
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields")

    if "peso_pct" in fields:
        project_id = await pool.fetchval(
            "SELECT project_id FROM obra_etapas WHERE id = $1", etapa_id
        )
        other_sum = await pool.fetchval(
            "SELECT COALESCE(SUM(peso_pct), 0) FROM obra_etapas WHERE project_id = $1 AND id != $2",
            project_id, etapa_id,
        )
        new_total = round(float(other_sum) + float(fields["peso_pct"]))
        if new_total != 100:
            raise HTTPException(
                status_code=400,
                detail=f"La suma de los pesos debe ser exactamente 100%. Total resultante: {new_total}%",
            )

    set_clauses = []
    params = [etapa_id]
    for i, (k, v) in enumerate(fields.items(), start=2):
        set_clauses.append(f"{k} = ${i}")
        params.append(v)

    row = await pool.fetchrow(
        f"UPDATE obra_etapas SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, nombre, porcentaje_completado",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Etapa not found")
    return dict(row)


@router.put("/obra/{project_id}/pesos")
async def update_pesos(project_id: str, request: Request):
    """Batch-update peso_pct for all etapas. Validates sum == 100."""
    pool = await get_pool()
    body = await request.json()  # [{"id": "uuid", "peso_pct": N}, ...]
    total = sum(float(item["peso_pct"]) for item in body)
    if round(total) != 100:
        raise HTTPException(
            status_code=400,
            detail=f"La suma de los pesos debe ser exactamente 100%. Total: {round(total)}%",
        )
    async with pool.acquire() as conn:
        async with conn.transaction():
            for item in body:
                await conn.execute(
                    "UPDATE obra_etapas SET peso_pct = $1 WHERE id = $2 AND project_id = $3",
                    float(item["peso_pct"]), item["id"], project_id,
                )
    return {"ok": True}


@router.post("/obra/{project_id}/etapas")
async def add_etapa(project_id: str, request: Request):
    """Add a custom etapa to a project."""
    pool = await get_pool()
    body = await request.json()

    max_orden = await pool.fetchval(
        "SELECT COALESCE(MAX(orden), 0) FROM obra_etapas WHERE project_id = $1", project_id
    )
    orden = body.get("orden", max_orden + 1)
    nombre = body.get("nombre", "Etapa personalizada")
    peso_pct = body.get("peso_pct", 0)

    row = await pool.fetchrow(
        "INSERT INTO obra_etapas (project_id, nombre, orden, peso_pct, es_standard) VALUES ($1, $2, $3, $4, FALSE) RETURNING id, nombre, orden, peso_pct, es_standard, activa, porcentaje_completado",
        project_id, nombre, orden, peso_pct,
    )
    return dict(row)


@router.delete("/obra/etapas/{etapa_id}")
async def delete_etapa(etapa_id: str, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Delete a custom (non-standard) etapa."""
    pool = await get_pool()
    etapa = await pool.fetchrow(
        "SELECT id, es_standard FROM obra_etapas WHERE id = $1", etapa_id
    )
    if not etapa:
        raise HTTPException(status_code=404, detail="Etapa no encontrada")
    if etapa["es_standard"]:
        raise HTTPException(status_code=400, detail="No se pueden eliminar etapas estándar")
    await pool.execute("DELETE FROM obra_etapas WHERE id = $1", etapa_id)
    return {"deleted": True}


@router.post("/obra/{project_id}/updates")
async def create_obra_update(
    project_id: str,
    etapa_id: str = Form(...),
    porcentaje_etapa: int = Form(...),
    nota_publica: str = Form(""),
    nota_interna: Optional[str] = Form(None),
    scope: str = Form("general"),
    unit_identifier: Optional[str] = Form(None),
    floor_num: Optional[int] = Form(None),
    fotos: list[UploadFile] = File(default=[]),
):
    """Create an obra update: saves record, uploads photos, updates etapa progress."""
    pool = await get_pool()

    project = await pool.fetchrow(
        "SELECT p.slug, p.organization_id, o.slug as org_slug FROM projects p LEFT JOIN organizations o ON o.id = p.organization_id WHERE p.id = $1",
        project_id,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update = await pool.fetchrow(
        """INSERT INTO obra_updates (project_id, etapa_id, fecha, nota_publica, nota_interna, scope, unit_identifier, floor, source)
           VALUES ($1, $2, NOW()::date, $3, $4, $5, $6, $7, 'admin')
           RETURNING id, fecha""",
        project_id, etapa_id,
        nota_publica or None, nota_interna,
        scope, unit_identifier, floor_num,
    )
    update_id = str(update["id"])

    await pool.execute(
        "UPDATE obra_etapas SET porcentaje_completado = $1 WHERE id = $2",
        porcentaje_etapa, etapa_id,
    )

    uploaded_fotos = []
    for foto in fotos:
        if not foto.filename:
            continue
        content = await foto.read()
        if not content:
            continue
        identifier = unit_identifier or (str(floor_num) if floor_num else None)
        org_slug = project.get("org_slug") or (str(project["organization_id"]) if project["organization_id"] else None)
        file_url = await upload_obra_foto(content, project["slug"], foto.filename, scope, identifier, org_slug=org_slug)
        foto_row = await pool.fetchrow(
            """INSERT INTO obra_fotos (project_id, update_id, file_url, filename, scope, unit_identifier, floor)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id, file_url, filename, scope, unit_identifier, floor""",
            project_id, update_id, file_url, foto.filename, scope, unit_identifier, floor_num,
        )
        uploaded_fotos.append(dict(foto_row))

    logger.info("Obra update %s created for project %s (etapa %s, %d%%)", update_id, project_id, etapa_id, porcentaje_etapa)
    return {
        "update_id": update_id,
        "fecha": str(update["fecha"]),
        "porcentaje_etapa": porcentaje_etapa,
        "fotos": uploaded_fotos,
    }


@router.delete("/obra/updates/{update_id}")
async def delete_obra_update(update_id: str):
    """Delete an obra update and its photos."""
    pool = await get_pool()
    await pool.execute("DELETE FROM obra_fotos WHERE update_id = $1", update_id)
    result = await pool.execute("DELETE FROM obra_updates WHERE id = $1", update_id)
    deleted = result.split()[-1] != "0"
    return {"deleted": deleted}


@router.post("/obra/{project_id}/notify/{update_id}")
async def notify_obra_update(project_id: str, update_id: str):
    """Send WhatsApp notification to all active buyers about an obra update."""
    sent = await notify_buyers_of_update(project_id, update_id)
    return {"sent": sent}


@router.get("/suppliers")
async def list_suppliers():
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, nombre, cuit, rubro, telefono, email, notas, created_at FROM suppliers ORDER BY nombre"
    )
    return [dict(r) for r in rows]


@router.post("/suppliers")
async def create_supplier(body: SupplierBody):
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO suppliers (nombre, cuit, rubro, telefono, email, notas)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, nombre, cuit, rubro, telefono, email, notas, created_at""",
        body.nombre, body.cuit, body.rubro, body.telefono, body.email, body.notas,
    )
    return dict(row)


@router.patch("/suppliers/{supplier_id}")
async def patch_supplier(supplier_id: str, request: Request):
    pool = await get_pool()
    body = await request.json()
    ALLOWED = {"nombre", "cuit", "rubro", "telefono", "email", "notas"}
    fields = {k: v for k, v in body.items() if k in ALLOWED}
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields")

    set_clauses = []
    params: list = [supplier_id]
    for i, (k, v) in enumerate(fields.items(), start=2):
        set_clauses.append(f"{k} = ${i}")
        params.append(v)

    row = await pool.fetchrow(
        f"UPDATE suppliers SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, nombre",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return {"updated": True, "id": str(row["id"])}


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    pool = await get_pool()
    result = await pool.execute("DELETE FROM suppliers WHERE id = $1", supplier_id)
    return {"deleted": result.split()[-1] != "0"}


@router.get("/obra-payments/{project_id}")
async def list_obra_payments(project_id: str, estado: Optional[str] = None):
    pool = await get_pool()
    conditions = ["p.project_id = $1"]
    params: list = [project_id]

    if estado:
        params.append(estado)
        conditions.append(f"p.estado = ${len(params)}")

    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""SELECT p.id, p.supplier_id, p.etapa_id, p.budget_id, p.descripcion,
                   p.monto_usd, p.monto_ars, p.fecha_vencimiento, p.estado,
                   p.fecha_pago, p.comprobante_url, p.created_at,
                   s.nombre as supplier_nombre,
                   e.nombre as etapa_nombre
            FROM obra_payments p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN obra_etapas e ON e.id = p.etapa_id
            WHERE {where}
            ORDER BY p.fecha_vencimiento ASC NULLS LAST, p.created_at DESC""",
        *params,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("monto_usd") is not None:
            d["monto_usd"] = float(d["monto_usd"])
        if d.get("monto_ars") is not None:
            d["monto_ars"] = float(d["monto_ars"])
        result.append(d)
    return result


@router.post("/obra-payments/{project_id}")
async def create_obra_payment(project_id: str, body: ObraPaymentBody):
    pool = await get_pool()
    from datetime import datetime
    fv = datetime.strptime(body.fecha_vencimiento, "%Y-%m-%d").date() if body.fecha_vencimiento else None
    fp = datetime.strptime(body.fecha_pago, "%Y-%m-%d").date() if body.fecha_pago else None
    row = await pool.fetchrow(
        """INSERT INTO obra_payments
               (project_id, supplier_id, etapa_id, budget_id, descripcion, monto_usd, monto_ars,
                fecha_vencimiento, estado, fecha_pago, comprobante_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, descripcion, estado, fecha_vencimiento, created_at""",
        project_id, body.supplier_id or None, body.etapa_id or None, body.budget_id or None,
        body.descripcion, body.monto_usd, body.monto_ars, fv, body.estado, fp, body.comprobante_url,
    )
    return dict(row)


@router.patch("/obra-payments/{payment_id}")
async def patch_obra_payment(payment_id: str, request: Request):
    pool = await get_pool()
    from datetime import datetime
    body = await request.json()
    ALLOWED = {"supplier_id", "etapa_id", "budget_id", "descripcion", "monto_usd", "monto_ars",
               "fecha_vencimiento", "estado", "fecha_pago", "comprobante_url"}
    fields = {k: v for k, v in body.items() if k in ALLOWED}
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields")

    for date_field in ("fecha_vencimiento", "fecha_pago"):
        if date_field in fields and fields[date_field]:
            fields[date_field] = datetime.strptime(fields[date_field], "%Y-%m-%d").date()

    VALID_ESTADOS = {"pendiente", "aprobado", "pagado", "vencido"}
    if "estado" in fields and fields["estado"] not in VALID_ESTADOS:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Usar: {', '.join(VALID_ESTADOS)}")

    set_clauses = []
    params: list = [payment_id]
    for i, (k, v) in enumerate(fields.items(), start=2):
        set_clauses.append(f"{k} = ${i}")
        params.append(v)

    row = await pool.fetchrow(
        f"UPDATE obra_payments SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, estado",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return {"updated": True, "id": str(row["id"]), "estado": row["estado"]}


@router.get("/obra-payments/{project_id}/vencimientos")
async def get_vencimientos(project_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT p.id, p.descripcion, p.monto_usd, p.estado, p.fecha_vencimiento,
                  s.nombre as supplier_nombre, e.nombre as etapa_nombre
           FROM obra_payments p
           LEFT JOIN suppliers s ON s.id = p.supplier_id
           LEFT JOIN obra_etapas e ON e.id = p.etapa_id
           WHERE p.project_id = $1
             AND p.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '15 days'
             AND p.estado IN ('pendiente', 'aprobado')
           ORDER BY p.fecha_vencimiento ASC""",
        project_id,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("monto_usd") is not None:
            d["monto_usd"] = float(d["monto_usd"])
        result.append(d)
    return result
