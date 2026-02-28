"""
Admin API: internal endpoints for document upload, analytics, pipeline visibility,
and cron-triggered background jobs.
"""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, Request, UploadFile

from app.database import get_pool
from app.modules.handoff.telegram import _handle_update as handle_telegram_update
from app.modules.leads.nurturing import process_nurturing_batch
from app.modules.obra.notifier import notify_buyers_of_update
from app.modules.project_loader import parse_project_csv, create_project_from_parsed, build_summary
from app.modules.storage import upload_file

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Document upload ---

@router.post("/upload-document")
async def upload_document(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    doc_type: str = Form(...),
    unit_identifier: Optional[str] = Form(None),
    floor: Optional[int] = Form(None),
):
    """Upload a PDF to Supabase Storage and register it in the documents table.

    doc_type: plano, precios, memoria, reglamento, faq, contrato, cronograma
    """
    pool = await get_pool()

    project = await pool.fetchrow("SELECT id, name FROM projects WHERE id = $1", project_id)
    if not project:
        return {"error": f"Project {project_id} not found"}

    content = await file.read()
    filename = file.filename or "document.pdf"
    project_slug = project["name"].lower().replace(" ", "-")

    file_url = await upload_file(content, project_slug, doc_type, filename)

    if unit_identifier:
        await pool.execute(
            "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier = $3 AND is_active = TRUE",
            project_id, doc_type, unit_identifier,
        )
    else:
        await pool.execute(
            "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier IS NULL AND is_active = TRUE",
            project_id, doc_type,
        )

    row = await pool.fetchrow(
        """
        INSERT INTO documents (project_id, doc_type, filename, file_url, file_size_bytes, unit_identifier, floor, source, rag_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', 'ready')
        RETURNING id, version
        """,
        project_id, doc_type, filename, file_url, len(content),
        unit_identifier, floor,
    )

    logger.info("Document uploaded: %s (%s) -> %s", filename, doc_type, file_url)

    return {
        "document_id": str(row["id"]),
        "version": row["version"],
        "file_url": file_url,
        "doc_type": doc_type,
        "filename": filename,
    }


# --- Project management ---

UPDATABLE_PROJECT_FIELDS = {
    "name", "slug", "address", "neighborhood", "city", "description",
    "amenities", "total_floors", "total_units", "construction_start",
    "estimated_delivery", "delivery_status", "payment_info", "status",
}


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get full project details."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT id, developer_id, name, slug, address, neighborhood, city,
                  description, amenities, total_floors, total_units,
                  construction_start, estimated_delivery, delivery_status,
                  payment_info, whatsapp_number, status, created_at
           FROM projects WHERE id = $1""",
        project_id,
    )
    if not row:
        return {"error": f"Project {project_id} not found"}
    return dict(row)


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, request: Request):
    """Update project details.

    Body: any subset of updatable fields, e.g.
    {"address": "...", "amenities": ["...", "..."], "estimated_delivery": "2027-12-01"}
    """
    pool = await get_pool()
    body = await request.json()

    fields_to_update = {k: v for k, v in body.items() if k in UPDATABLE_PROJECT_FIELDS}
    if not fields_to_update:
        return {"error": f"No valid fields to update. Allowed: {', '.join(sorted(UPDATABLE_PROJECT_FIELDS))}"}

    set_clauses = []
    params = [project_id]
    for i, (field, value) in enumerate(fields_to_update.items(), start=2):
        set_clauses.append(f"{field} = ${i}")
        params.append(value)

    sql = f"UPDATE projects SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, name"
    row = await pool.fetchrow(sql, *params)
    if not row:
        return {"error": f"Project {project_id} not found"}

    logger.info("Project %s updated: %s", row["name"], list(fields_to_update.keys()))
    return {"updated": list(fields_to_update.keys()), "project_id": str(row["id"]), "project_name": row["name"]}


# --- Units management ---

VALID_UNIT_STATUSES = {"available", "reserved", "sold"}


@router.get("/projects")
async def list_projects(developer_id: str | None = None):
    """List projects, optionally filtered by developer."""
    pool = await get_pool()
    if developer_id:
        rows = await pool.fetch(
            "SELECT id, developer_id, name, status, created_at FROM projects WHERE developer_id = $1 ORDER BY name",
            developer_id,
        )
    else:
        rows = await pool.fetch("SELECT id, developer_id, name, status, created_at FROM projects ORDER BY name")
    return [dict(r) for r in rows]


@router.get("/units/{project_id}")
async def list_units(project_id: str):
    """List all units for a project with their current status."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, identifier, floor, bedrooms, area_m2, price_usd, status FROM units WHERE project_id = $1 ORDER BY floor, identifier",
        project_id,
    )
    return [dict(r) for r in rows]


@router.patch("/units/{unit_id}/status")
async def update_unit_status(unit_id: str, request: Request):
    """Update the status of a unit.

    Body: {"status": "available" | "reserved" | "sold"}
    """
    pool = await get_pool()
    body = await request.json()
    new_status = body.get("status", "").lower()

    if new_status not in VALID_UNIT_STATUSES:
        return {"error": f"Invalid status '{new_status}'. Must be one of: {', '.join(sorted(VALID_UNIT_STATUSES))}"}

    row = await pool.fetchrow(
        "UPDATE units SET status = $1 WHERE id = $2 RETURNING id, identifier, project_id, status",
        new_status, unit_id,
    )
    if not row:
        return {"error": f"Unit {unit_id} not found"}

    logger.info("Unit %s (%s) status changed to %s", row["identifier"], unit_id, new_status)
    return dict(row)


@router.patch("/units/bulk-status")
async def bulk_update_unit_status(request: Request):
    """Update status for multiple units at once.

    Body: {"units": [{"id": "uuid", "status": "reserved"}, ...]}
    """
    pool = await get_pool()
    body = await request.json()
    updates = body.get("units", [])
    results = []

    for item in updates:
        uid = item.get("id")
        new_status = item.get("status", "").lower()
        if new_status not in VALID_UNIT_STATUSES:
            results.append({"id": uid, "error": f"Invalid status '{new_status}'"})
            continue
        row = await pool.fetchrow(
            "UPDATE units SET status = $1 WHERE id = $2 RETURNING id, identifier, status",
            new_status, uid,
        )
        if row:
            results.append(dict(row))
        else:
            results.append({"id": uid, "error": "not found"})

    return {"updated": results}


# --- Telegram webhook (admin fallback) ---

@router.post("/telegram/webhook")
async def telegram_webhook_admin(request: Request):
    """Receive webhook events from Telegram (admin fallback route)."""
    body = await request.json()
    await handle_telegram_update(body)
    return {"status": "ok"}


# --- Cron-triggered jobs ---

@router.post("/jobs/nurturing")
async def run_nurturing():
    """Trigger nurturing batch (called by Railway cron)."""
    sent = await process_nurturing_batch()
    return {"messages_sent": sent}


@router.post("/jobs/obra-notifications")
async def run_obra_notifications():
    """Trigger obra update notifications (called by Railway cron)."""
    return {"status": "ok"}


# --- Analytics / Pipeline ---

@router.get("/leads")
async def list_leads(project_id: str, score: str | None = None):
    """List leads for a project, optionally filtered by score."""
    return []


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str):
    """Get full lead detail including conversation history."""
    return {}


@router.get("/metrics/{project_id}")
async def get_metrics(project_id: str):
    """Get project metrics."""
    return {
        "total_leads": 0,
        "hot": 0,
        "warm": 0,
        "cold": 0,
    }


@router.get("/documents/{project_id}")
async def list_documents(project_id: str, doc_type: str | None = None):
    """List active documents for a project."""
    pool = await get_pool()
    if doc_type:
        rows = await pool.fetch(
            "SELECT id, doc_type, filename, file_url, unit_identifier, floor, version, uploaded_at FROM documents WHERE project_id = $1 AND doc_type = $2 AND is_active = TRUE ORDER BY doc_type, unit_identifier",
            project_id, doc_type,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, doc_type, filename, file_url, unit_identifier, floor, version, uploaded_at FROM documents WHERE project_id = $1 AND is_active = TRUE ORDER BY doc_type, unit_identifier",
            project_id,
        )
    return [dict(r) for r in rows]


# ---------- Project loading from CSV ----------

@router.get("/project-template")
async def get_project_template():
    """Return info about how to download the CSV template."""
    return {
        "message": "Descargá el template y completá los campos. Envialo por WhatsApp o subilo al endpoint POST /admin/load-project.",
        "template_url": "/admin/project-template/download",
        "fields": {
            "project": [
                "proyecto_nombre (requerido)", "proyecto_direccion", "proyecto_barrio",
                "proyecto_ciudad", "proyecto_descripcion", "proyecto_pisos_total",
                "proyecto_unidades_total", "proyecto_inicio_obra (YYYY-MM-DD)",
                "proyecto_entrega_estimada (YYYY-MM-DD)", "proyecto_estado_obra (en_pozo|en_construccion|terminado)",
                "proyecto_formas_pago", "proyecto_amenities (separados por |)",
            ],
            "units": [
                "unidad (requerido)", "piso", "ambientes", "m2",
                "precio_usd", "estado (disponible|reservada|vendida)",
            ],
        },
    }


@router.get("/project-template/download")
async def download_project_template():
    """Download the CSV template file."""
    import os
    from fastapi.responses import FileResponse
    template_path = os.path.join(os.path.dirname(__file__), "..", "..", "templates", "proyecto_template.csv")
    template_path = os.path.abspath(template_path)
    return FileResponse(template_path, media_type="text/csv", filename="proyecto_template.csv")


@router.post("/load-project")
async def load_project_from_csv(
    developer_id: str = Form(...),
    csv_file: UploadFile = File(...),
):
    """Parse a CSV file and create a project with units."""
    content = await csv_file.read()

    parsed = parse_project_csv(content)

    if not parsed["project"] or not parsed["project"].get("name"):
        return {"ok": False, "errors": parsed["errors"]}

    if parsed["errors"]:
        return {
            "ok": False,
            "summary": build_summary(parsed),
            "errors": parsed["errors"],
            "message": "El CSV tiene errores. Revisá y volvé a subir.",
        }

    result = await create_project_from_parsed(developer_id, parsed)

    if result.get("error"):
        return {"ok": False, "error": result["error"]}

    return {
        "ok": True,
        "project_id": result["project_id"],
        "project_name": result["project_name"],
        "slug": result["slug"],
        "units_created": result["units_created"],
    }
