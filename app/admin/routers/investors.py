# app/admin/routers/investors.py
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool
from app.modules.whatsapp.sender import send_text_message

logger = logging.getLogger(__name__)
router = APIRouter()


class InvestorBody(BaseModel):
    nombre: str
    email: Optional[str] = None
    telefono: Optional[str] = None
    monto_aportado_usd: Optional[float] = None
    fecha_aporte: Optional[str] = None
    porcentaje_participacion: Optional[float] = None


@router.get("/investors/{project_id}")
async def list_investors(project_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, nombre, email, telefono, monto_aportado_usd, fecha_aporte, porcentaje_participacion, created_at FROM investors WHERE project_id = $1 AND deleted_at IS NULL ORDER BY nombre",
        project_id,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("monto_aportado_usd") is not None:
            d["monto_aportado_usd"] = float(d["monto_aportado_usd"])
        if d.get("porcentaje_participacion") is not None:
            d["porcentaje_participacion"] = float(d["porcentaje_participacion"])
        result.append(d)
    return result


@router.post("/investors/{project_id}")
async def create_investor(
    project_id: str,
    body: InvestorBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    fecha = datetime.strptime(body.fecha_aporte, "%Y-%m-%d").date() if body.fecha_aporte else None
    row = await pool.fetchrow(
        """INSERT INTO investors (project_id, nombre, email, telefono, monto_aportado_usd, fecha_aporte, porcentaje_participacion)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, nombre, email, telefono, monto_aportado_usd, fecha_aporte, porcentaje_participacion, created_at""",
        project_id, body.nombre, body.email, body.telefono,
        body.monto_aportado_usd, fecha, body.porcentaje_participacion,
    )
    d = dict(row)
    if d.get("monto_aportado_usd") is not None:
        d["monto_aportado_usd"] = float(d["monto_aportado_usd"])
    if d.get("porcentaje_participacion") is not None:
        d["porcentaje_participacion"] = float(d["porcentaje_participacion"])
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="INSERT",
                 table_name="investors", record_id=str(row["id"]), project_id=project_id,
                 details={"nombre": body.nombre, "monto_aportado_usd": body.monto_aportado_usd})
    return d


@router.patch("/investors/{project_id}/{investor_id}")
async def patch_investor(
    project_id: str,
    investor_id: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    body = await request.json()
    ALLOWED = {"nombre", "email", "telefono", "monto_aportado_usd", "fecha_aporte", "porcentaje_participacion"}
    fields = {k: v for k, v in body.items() if k in ALLOWED}
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields")
    if "fecha_aporte" in fields and fields["fecha_aporte"]:
        fields["fecha_aporte"] = datetime.strptime(fields["fecha_aporte"], "%Y-%m-%d").date()

    set_clauses = []
    params: list = [investor_id, project_id]
    for i, (k, v) in enumerate(fields.items(), start=3):
        set_clauses.append(f"{k} = ${i}")
        params.append(v)

    row = await pool.fetchrow(
        f"UPDATE investors SET {', '.join(set_clauses)} WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL RETURNING id, nombre",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Inversor no encontrado")
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="UPDATE",
                 table_name="investors", record_id=investor_id, project_id=project_id,
                 details={k: str(v) for k, v in fields.items()})
    return {"updated": True, "id": str(row["id"])}


@router.delete("/investors/{project_id}/{investor_id}")
async def delete_investor(
    project_id: str,
    investor_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    result = await pool.execute(
        "UPDATE investors SET deleted_at = NOW() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL",
        investor_id, project_id,
    )
    deleted = result.split()[-1] != "0"
    if deleted:
        await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="DELETE",
                     table_name="investors", record_id=investor_id, project_id=project_id)
    return {"deleted": deleted}


@router.get("/investors/{project_id}/report/preview")
async def preview_investor_report(project_id: str):
    pool = await get_pool()

    etapas, units_stats, fotos = await asyncio.gather(
        pool.fetch(
            "SELECT nombre, peso_pct, porcentaje_completado FROM obra_etapas WHERE project_id = $1 AND activa = TRUE",
            project_id,
        ),
        pool.fetchrow(
            """SELECT
                COUNT(*) FILTER (WHERE status='available') as disponibles,
                COUNT(*) FILTER (WHERE status='reserved') as reservadas,
                COUNT(*) FILTER (WHERE status='sold') as vendidas,
                COALESCE(SUM(price_usd) FILTER (WHERE status='sold'), 0) as revenue_usd
               FROM units WHERE project_id = $1""",
            project_id,
        ),
        pool.fetch(
            """SELECT f.file_url, f.caption FROM obra_fotos f
               JOIN obra_updates u ON u.id = f.update_id
               WHERE u.project_id = $1 ORDER BY f.uploaded_at DESC LIMIT 3""",
            project_id,
        ),
    )

    total_weight = sum(float(e["peso_pct"]) for e in etapas)
    progress = 0
    if total_weight:
        progress = round(sum(float(e["peso_pct"]) * e["porcentaje_completado"] / 100 for e in etapas) / total_weight * 100)

    project = await pool.fetchrow("SELECT name, address FROM projects WHERE id = $1", project_id)

    html = f"""<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
<h2 style="color:#4f46e5">Reporte de Avance — {project['name'] if project else ''}</h2>
<p style="color:#6b7280">{project['address'] if project else ''}</p>
<hr style="border-color:#e5e7eb"/>
<h3>Avance de Obra</h3>
<p><strong>{progress}%</strong> completado</p>
<div style="background:#f3f4f6;border-radius:8px;height:12px;overflow:hidden">
  <div style="background:#4f46e5;width:{progress}%;height:100%"></div>
</div>
<h3 style="margin-top:20px">Estado de Unidades</h3>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">Disponibles</td><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>{units_stats['disponibles']}</strong></td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">Reservadas</td><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>{units_stats['reservadas']}</strong></td></tr>
<tr><td style="padding:8px">Vendidas</td><td style="padding:8px"><strong>{units_stats['vendidas']}</strong></td></tr>
</table>
<p>Revenue vendido: <strong>USD {float(units_stats['revenue_usd']):,.0f}</strong></p>
</div>"""

    return {
        "html": html,
        "progress": progress,
        "units": dict(units_stats),
        "fotos": [{"file_url": f["file_url"], "caption": f["caption"]} for f in fotos],
    }


@router.post("/investors/{project_id}/report/send")
async def send_investor_report(project_id: str, request: Request):
    pool = await get_pool()
    body = await request.json()

    preview = await preview_investor_report(project_id)
    html = preview["html"]
    titulo = body.get("titulo", f"Reporte de Avance — {datetime.now(timezone.utc).strftime('%B %Y')}")
    periodo_desde = body.get("periodo_desde")
    periodo_hasta = body.get("periodo_hasta")

    pd_val = datetime.strptime(periodo_desde, "%Y-%m-%d").date() if periodo_desde else None
    ph_val = datetime.strptime(periodo_hasta, "%Y-%m-%d").date() if periodo_hasta else None

    report_row = await pool.fetchrow(
        """INSERT INTO investor_reports (project_id, titulo, contenido_html, periodo_desde, periodo_hasta, enviado_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           RETURNING id, titulo, enviado_at""",
        project_id, titulo, html, pd_val, ph_val,
    )

    investors = await pool.fetch(
        "SELECT nombre, telefono FROM investors WHERE project_id = $1 AND telefono IS NOT NULL AND deleted_at IS NULL",
        project_id,
    )

    sent = 0
    msg = f"📊 {titulo}\n\nAvance de obra: {preview['progress']}%\nUnidades vendidas: {preview['units'].get('vendidas', 0)}\n\nContactanos para más detalles."
    for inv in investors:
        try:
            await send_text_message(to=inv["telefono"], text=msg)
            sent += 1
        except Exception as e:
            logger.error("Error sending report to investor %s: %s", inv["nombre"], e)

    return {"report_id": str(report_row["id"]), "enviado_a": sent}


@router.get("/investors/{project_id}/report/history")
async def list_investor_reports(project_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, titulo, periodo_desde, periodo_hasta, enviado_at, created_at FROM investor_reports WHERE project_id = $1 ORDER BY created_at DESC",
        project_id,
    )
    return [dict(r) for r in rows]
