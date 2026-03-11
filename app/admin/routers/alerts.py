# app/admin/routers/alerts.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/alerts")
async def list_alerts(
    project_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    payload = _require_admin(credentials)
    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")
    pool = await get_pool()

    if project_id:
        # Superadmin ve todo; el resto solo si el proyecto pertenece a su org
        if caller_role != "superadmin":
            proj = await pool.fetchrow(
                "SELECT organization_id FROM projects WHERE id = $1", project_id
            )
            if not proj or str(proj["organization_id"]) != caller_org:
                raise HTTPException(status_code=403)
        rows = await pool.fetch(
            """SELECT id, project_id, organization_id, tipo, titulo, descripcion, severidad, leida, metadata, created_at
               FROM project_alerts
               WHERE project_id = $1
               ORDER BY created_at DESC""",
            project_id,
        )
    elif caller_role == "superadmin":
        rows = await pool.fetch(
            """SELECT id, project_id, organization_id, tipo, titulo, descripcion, severidad, leida, metadata, created_at
               FROM project_alerts
               ORDER BY created_at DESC
               LIMIT 100""",
        )
    else:
        # Admin/vendedor/etc: solo alertas de proyectos de su org + alertas de nivel org propias
        rows = await pool.fetch(
            """SELECT pa.id, pa.project_id, pa.organization_id, pa.tipo, pa.titulo,
                      pa.descripcion, pa.severidad, pa.leida, pa.metadata, pa.created_at
               FROM project_alerts pa
               WHERE (
                   pa.project_id IN (
                       SELECT id FROM projects WHERE organization_id = $1 AND deleted_at IS NULL
                   )
                   OR pa.organization_id = $1
               )
               ORDER BY pa.created_at DESC
               LIMIT 100""",
            caller_org,
        )
    return [dict(r) for r in rows]


@router.post("/alerts/{alert_id}/read")
async def mark_alert_read(
    alert_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    payload = _require_admin(credentials)
    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")
    pool = await get_pool()
    if caller_role != "superadmin":
        alert = await pool.fetchrow(
            """SELECT pa.id FROM project_alerts pa
               LEFT JOIN projects p ON p.id = pa.project_id
               WHERE pa.id = $1
                 AND (p.organization_id = $2 OR pa.organization_id = $2)""",
            alert_id, caller_org,
        )
        if not alert:
            raise HTTPException(status_code=403)
    await pool.execute("UPDATE project_alerts SET leida = TRUE WHERE id = $1", alert_id)
    return {"ok": True}


@router.post("/alerts/read-all")
async def mark_all_alerts_read(
    project_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    payload = _require_admin(credentials)
    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")
    pool = await get_pool()
    if project_id:
        await pool.execute("UPDATE project_alerts SET leida = TRUE WHERE project_id = $1 AND leida = FALSE", project_id)
    elif caller_role == "superadmin":
        await pool.execute("UPDATE project_alerts SET leida = TRUE WHERE leida = FALSE")
    else:
        await pool.execute(
            """UPDATE project_alerts SET leida = TRUE
               WHERE leida = FALSE
                 AND (
                     project_id IN (SELECT id FROM projects WHERE organization_id = $1 AND deleted_at IS NULL)
                     OR organization_id = $1
                 )""",
            caller_org,
        )
    return {"ok": True}


@router.post("/jobs/alerts")
async def run_alerts_job():
    from app.services.alerts_service import evaluate_alerts
    created = await evaluate_alerts()
    return {"alerts_created": created}
