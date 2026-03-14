# app/admin/routers/projects.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials

from app.admin.auth import verify_token
from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool
from app.modules.project_loader import parse_project_csv, create_project_from_parsed, build_summary
from app.modules.storage import upload_file

logger = logging.getLogger(__name__)
router = APIRouter()

UPDATABLE_PROJECT_FIELDS = {
    "name", "slug", "address", "neighborhood", "city", "description",
    "amenities", "total_floors", "total_units", "construction_start",
    "estimated_delivery", "delivery_status", "payment_info", "status",
    "lat", "lng",
}

VALID_UNIT_STATUSES = {"available", "reserved", "sold"}


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

    project = await pool.fetchrow(
        "SELECT p.id, p.name, p.organization_id, o.slug as org_slug FROM projects p LEFT JOIN organizations o ON o.id = p.organization_id WHERE p.id = $1",
        project_id,
    )
    if not project:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

    content = await file.read()
    filename = file.filename or "document.pdf"
    project_slug = project["name"].lower().replace(" ", "-")
    org_slug = project["org_slug"] or str(project["organization_id"]) if project["organization_id"] else None

    file_url = await upload_file(content, project_slug, doc_type, filename, org_slug=org_slug)

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


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get full project details."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT id, organization_id, name, slug, address, neighborhood, city,
                  description, amenities, total_floors, total_units,
                  construction_start, estimated_delivery, delivery_status,
                  payment_info, whatsapp_number, status, created_at,
                  lat, lng
           FROM projects WHERE id = $1""",
        project_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
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
        raise HTTPException(status_code=400, detail=f"No valid fields to update. Allowed: {', '.join(sorted(UPDATABLE_PROJECT_FIELDS))}")

    set_clauses = []
    params = [project_id]
    for i, (field, value) in enumerate(fields_to_update.items(), start=2):
        set_clauses.append(f"{field} = ${i}")
        params.append(value)

    sql = f"UPDATE projects SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, name"
    row = await pool.fetchrow(sql, *params)
    if not row:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

    logger.info("Project %s updated: %s", row["name"], list(fields_to_update.keys()))
    return {"updated": list(fields_to_update.keys()), "project_id": str(row["id"]), "project_name": row["name"]}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Soft-delete a project by setting deleted_at = NOW()."""
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE projects SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        project_id,
    )
    deleted = result.split()[-1] != "0"
    return {"deleted": deleted}


@router.post("/projects/{project_id}/restore")
async def restore_project(project_id: str, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Restore a soft-deleted project by clearing deleted_at."""
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE projects SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        project_id,
    )
    restored = result.split()[-1] != "0"
    return {"restored": restored}


@router.get("/projects")
async def list_projects(
    developer_id: str | None = None,
    include_deleted: bool = False,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """List projects. Automatically scoped to the caller's organization unless superadmin.
    Pass include_deleted=true to include soft-deleted projects."""
    pool = await get_pool()
    columns = """id, organization_id, name, slug, address, neighborhood, city,
                 total_floors, total_units, delivery_status, status, deleted_at, created_at"""

    effective_org_id = developer_id
    if not effective_org_id and credentials and credentials.scheme == "Bearer":
        payload = verify_token(credentials.credentials)
        if payload and payload.get("role") != "superadmin":
            effective_org_id = payload.get("organization_id")

    deleted_clause = "" if include_deleted else "AND deleted_at IS NULL"

    if effective_org_id:
        rows = await pool.fetch(
            f"SELECT {columns} FROM projects WHERE organization_id = $1 {deleted_clause} ORDER BY name",
            effective_org_id,
        )
    else:
        rows = await pool.fetch(
            f"SELECT {columns} FROM projects WHERE TRUE {deleted_clause} ORDER BY name"
        )
    return [dict(r) for r in rows]


@router.get("/units/{project_id}")
async def list_units(project_id: str):
    """List all units for a project with their current status."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT u.id, u.identifier, u.floor, u.bedrooms, u.area_m2, u.price_usd,
               CASE
                 WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id = u.id AND r.status = 'converted') THEN 'sold'
                 WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id = u.id AND r.status = 'active')    THEN 'reserved'
                 ELSE 'available'
               END AS status
        FROM units u
        WHERE u.project_id = $1
        ORDER BY u.floor, u.identifier
        """,
        project_id,
    )
    return [dict(r) for r in rows]


@router.patch("/units/{unit_id}/status")
async def update_unit_status(unit_id: str, request: Request):
    """Update the status of a unit.

    Body: {"status": "available" | "reserved" | "sold"}
    When setting to 'available', any active reservation for the unit is cancelled atomically.
    """
    pool = await get_pool()
    body = await request.json()
    new_status = body.get("status", "").lower()

    if new_status not in VALID_UNIT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status '{new_status}'. Must be one of: {', '.join(sorted(VALID_UNIT_STATUSES))}")

    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "UPDATE units SET status = $1 WHERE id = $2 RETURNING id, identifier, project_id, status",
                new_status, unit_id,
            )
            if not row:
                raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")

            # When reverting to available, cancel any active reservation so the
            # derived status query (which reads from reservations) stays in sync.
            if new_status == "available":
                await conn.execute(
                    "UPDATE reservations SET status = 'cancelled', updated_at = NOW() WHERE unit_id = $1 AND status = 'active'",
                    unit_id,
                )

    logger.info("Unit %s (%s) status changed to %s", row["identifier"], unit_id, new_status)
    return dict(row)


@router.patch("/units/{unit_id}")
async def update_unit(unit_id: str, request: Request):
    """Update editable fields of a unit (price, area, bedrooms, floor). Records changelog."""
    pool = await get_pool()
    body = await request.json()

    allowed = {"price_usd", "area_m2", "bedrooms", "floor"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Fetch current values before updating
    current = await pool.fetchrow(
        "SELECT floor, bedrooms, area_m2, price_usd FROM units WHERE id = $1", unit_id
    )
    if not current:
        raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await pool.fetchrow(
        f"UPDATE units SET {set_clause} WHERE id = $1 RETURNING id, identifier, floor, bedrooms, area_m2, price_usd, status",
        unit_id, *values,
    )

    # Insert changelog entries for changed fields
    for field, new_val in updates.items():
        old_val = current[field]
        if old_val != new_val:
            await pool.execute(
                "INSERT INTO unit_field_history (unit_id, field, old_value, new_value) VALUES ($1, $2, $3, $4)",
                unit_id, field, float(old_val) if old_val is not None else None, float(new_val),
            )

    return dict(row)


@router.get("/units/{unit_id}/history")
async def get_unit_history(unit_id: str):
    """Return the field change history for a unit."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, field, old_value, new_value, changed_at FROM unit_field_history WHERE unit_id = $1 ORDER BY changed_at DESC LIMIT 50",
        unit_id,
    )
    return [dict(r) for r in rows]


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
    from fastapi.responses import Response
    csv_content = (
        "## TEMPLATE PARA CARGAR PROYECTO\n"
        "## Completá lo que puedas. Lo que no tengas dejalo vacío.\n"
        "## El resto lo podés completar después por WhatsApp.\n"
        "##\n"
        "## SECCIÓN 1: DATOS DEL PROYECTO (completar en la primera fila de datos)\n"
        "## SECCIÓN 2: UNIDADES (una fila por unidad)\n"
        "##\n"
        "## Guardar como CSV (separado por comas) y enviar por WhatsApp.\n"
        "\n"
        "proyecto_nombre,proyecto_direccion,proyecto_barrio,proyecto_ciudad,proyecto_descripcion,"
        "proyecto_pisos_total,proyecto_unidades_total,proyecto_inicio_obra,proyecto_entrega_estimada,"
        "proyecto_estado_obra,proyecto_formas_pago,proyecto_amenities,unidad,piso,ambientes,m2,precio_usd,estado\n"
        'Manzanares 2088,Manzanares 2088,Núñez,CABA,Edificio residencial premium de 5 plantas a 5 cuadras del río,'
        '5,8,2025-03-01,2027-12-01,en_construccion,"30% anticipo USD + 18 cuotas CAC + 10% posesion. Contado: 5% dto.",'
        '"SUM con parrilla | Piscina | Gimnasio | Bicicletero | Seguridad 24hs",1A,1,1,35,58000,disponible\n'
        ",,,,,,,,,,,,1B,1,2,50,78000,disponible\n"
        ",,,,,,,,,,,,2A,2,2,52,82000,disponible\n"
        ",,,,,,,,,,,,2B,2,2,55,86000,reservada\n"
        ",,,,,,,,,,,,3A,3,3,72,115000,disponible\n"
        ",,,,,,,,,,,,3B,3,3,75,120000,disponible\n"
        ",,,,,,,,,,,,4A,4,3,78,130000,disponible\n"
        ",,,,,,,,,,,,PH,5,4,110,195000,disponible\n"
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=proyecto_template.csv"},
    )


@router.post("/load-project")
async def load_project_from_csv(
    developer_id: str = Form(...),  # maps to organization_id in DB
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
