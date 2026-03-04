"""
Admin API: internal endpoints for document upload, analytics, pipeline visibility,
and cron-triggered background jobs.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.admin.auth import create_token, verify_token
from app.config import get_settings
from app.database import get_pool
from app.modules.handoff.manager import (
    close_handoff_by_lead_id,
    ensure_handoff_for_human_reply,
    get_active_handoff_by_lead_id,
)
from app.modules.handoff.telegram import _handle_update as handle_telegram_update
from app.modules.leads.nurturing import process_nurturing_batch
from app.modules.obra.notifier import notify_buyers_of_update
from datetime import datetime, timezone, date as date_type
from app.modules.project_loader import parse_project_csv, create_project_from_parsed, build_summary
from app.modules.storage import upload_file, upload_obra_foto
from app.modules.whatsapp.sender import send_text_message
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer(auto_error=False)


# --- Auth (login for web panel) ---

class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
async def auth_login(body: LoginBody):
    """Validate credentials and return a token. Supports admin and reader roles."""
    settings = get_settings()
    if not settings.admin_username or not settings.admin_password:
        raise HTTPException(status_code=503, detail="Login not configured")

    if body.username == settings.admin_username and body.password == settings.admin_password:
        role = "admin"
    elif (
        settings.reader_username
        and settings.reader_password
        and body.username == settings.reader_username
        and body.password == settings.reader_password
    ):
        role = "reader"
    else:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    token = create_token(body.username, role)
    return {"token": token, "user": body.username, "role": role}


@router.get("/auth/me")
async def auth_me(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Return current user and role if token is valid."""
    if not credentials or credentials.scheme != "Bearer":
        return {"user": None, "role": None}
    result = verify_token(credentials.credentials)
    if not result:
        return {"user": None, "role": None}
    username, role = result
    return {"user": username, "role": role}


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
    columns = """id, developer_id, name, slug, address, neighborhood, city,
                 total_floors, total_units, delivery_status, status, created_at"""
    if developer_id:
        rows = await pool.fetch(
            f"SELECT {columns} FROM projects WHERE developer_id = $1 ORDER BY name",
            developer_id,
        )
    else:
        rows = await pool.fetch(f"SELECT {columns} FROM projects ORDER BY name")
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


@router.patch("/units/{unit_id}")
async def update_unit(unit_id: str, request: Request):
    """Update editable fields of a unit (price, area, bedrooms, floor). Records changelog."""
    pool = await get_pool()
    body = await request.json()

    allowed = {"price_usd", "area_m2", "bedrooms", "floor"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        return {"error": "No valid fields to update"}

    # Fetch current values before updating
    current = await pool.fetchrow(
        "SELECT floor, bedrooms, area_m2, price_usd FROM units WHERE id = $1", unit_id
    )
    if not current:
        return {"error": f"Unit {unit_id} not found"}

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
async def list_leads(project_id: str | None = None, score: str | None = None):
    """List leads for a project, optionally filtered by score. If no project_id is provided, lists all leads."""
    pool = await get_pool()
    conditions = []
    params = []
    
    if project_id:
        conditions.append(f"l.project_id = ${len(params) + 1}")
        params.append(project_id)
        
    if score:
        conditions.append(f"l.score = ${len(params) + 1}")
        params.append(score)
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    
    query = f"""
        SELECT 
            l.id, l.project_id, l.phone, l.name, l.intent, l.financing, l.timeline,
            l.budget_usd, l.bedrooms, l.location_pref, l.score, l.source,
            l.created_at, l.last_contact,
            p.name as project_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        {where_clause}
        ORDER BY l.last_contact DESC NULLS LAST, l.created_at DESC
    """
    
    rows = await pool.fetch(query, *params)
    return [dict(r) for r in rows]


UPDATABLE_LEAD_FIELDS = {
    "name", "score", "source", "budget_usd", "intent", "timeline", "financing", "bedrooms", "location_pref",
}


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, request: Request):
    """Update editable lead fields."""
    pool = await get_pool()
    body = await request.json()

    fields_to_update = {k: v for k, v in body.items() if k in UPDATABLE_LEAD_FIELDS}
    if not fields_to_update:
        return {"error": f"No valid fields. Allowed: {', '.join(sorted(UPDATABLE_LEAD_FIELDS))}"}

    set_clauses = []
    params = [lead_id]
    for i, (field, value) in enumerate(fields_to_update.items(), start=2):
        set_clauses.append(f"{field} = ${i}")
        params.append(value)

    sql = f"UPDATE leads SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, name, score"
    row = await pool.fetchrow(sql, *params)
    if not row:
        return {"error": f"Lead {lead_id} not found"}

    logger.info("Lead %s updated: %s", lead_id, list(fields_to_update.keys()))
    return {"updated": list(fields_to_update.keys()), "lead_id": str(row["id"]), "name": row["name"], "score": row["score"]}


@router.get("/leads/{lead_id}/notes")
async def get_lead_notes(lead_id: str):
    """Get notes for a lead."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, author_name, note, created_at FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC",
        lead_id,
    )
    return [dict(r) for r in rows]


class NoteBody(BaseModel):
    note: str
    author_name: Optional[str] = None


@router.post("/leads/{lead_id}/notes")
async def add_lead_note(lead_id: str, body: NoteBody):
    """Add a note to a lead."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "INSERT INTO lead_notes (lead_id, author_name, note) VALUES ($1, $2, $3) RETURNING id, author_name, note, created_at",
        lead_id, body.author_name, body.note,
    )
    return dict(row)


@router.delete("/leads/{lead_id}/notes/{note_id}")
async def delete_lead_note(lead_id: str, note_id: str):
    """Delete a note."""
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM lead_notes WHERE id = $1 AND lead_id = $2",
        note_id, lead_id,
    )
    deleted = result.split()[-1] != "0"
    return {"deleted": deleted}


@router.get("/analytics/{project_id}")
async def get_analytics(project_id: str):
    """Get analytics dashboard data for a project."""
    pool = await get_pool()

    lead_counts, unit_stats, weekly_rows, source_rows = await asyncio.gather(
        pool.fetchrow(
            "SELECT COUNT(*) as leads_total, COUNT(*) FILTER (WHERE score='hot') as leads_hot FROM leads WHERE project_id = $1",
            project_id,
        ),
        pool.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status='reserved') as units_reserved,
                COUNT(*) FILTER (WHERE status='sold') as units_sold,
                COALESCE(SUM(price_usd) FILTER (WHERE status='reserved'), 0) as reserved_usd,
                COALESCE(SUM(price_usd) FILTER (WHERE status='sold'), 0) as sold_usd,
                COALESCE(SUM(price_usd), 0) as potential_usd
            FROM units WHERE project_id = $1
            """,
            project_id,
        ),
        pool.fetch(
            """
            SELECT DATE_TRUNC('week', created_at)::date as week,
                COUNT(*) FILTER (WHERE score='hot') as hot,
                COUNT(*) FILTER (WHERE score='warm') as warm,
                COUNT(*) FILTER (WHERE score='cold') as cold
            FROM leads
            WHERE project_id = $1 AND created_at >= NOW() - INTERVAL '8 weeks'
            GROUP BY week ORDER BY week
            """,
            project_id,
        ),
        pool.fetch(
            "SELECT COALESCE(source, 'Sin fuente') as source, COUNT(*) as count FROM leads WHERE project_id = $1 GROUP BY source ORDER BY count DESC",
            project_id,
        ),
    )

    return {
        "funnel": {
            "leads_total": lead_counts["leads_total"],
            "leads_hot": lead_counts["leads_hot"],
            "units_reserved": unit_stats["units_reserved"],
            "units_sold": unit_stats["units_sold"],
        },
        "revenue": {
            "potential_usd": float(unit_stats["potential_usd"]),
            "reserved_usd": float(unit_stats["reserved_usd"]),
            "sold_usd": float(unit_stats["sold_usd"]),
        },
        "weekly_leads": [
            {"week": str(r["week"]), "hot": r["hot"], "warm": r["warm"], "cold": r["cold"]}
            for r in weekly_rows
        ],
        "lead_sources": [{"source": r["source"], "count": r["count"]} for r in source_rows],
    }


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str):
    """Get full lead detail including conversation history."""
    pool = await get_pool()
    lead = await pool.fetchrow(
        """
        SELECT id, project_id, phone, name, intent, financing, timeline,
               budget_usd, bedrooms, location_pref, score, source,
               created_at, last_contact
        FROM leads WHERE id = $1
        """,
        lead_id,
    )
    if not lead:
        return {"error": f"Lead {lead_id} not found"}

    conversations = await pool.fetch(
        """
        SELECT id, role, sender_type, content, media_type, created_at
        FROM conversations
        WHERE lead_id = $1
        ORDER BY created_at ASC
        """,
        lead_id,
    )

    return {
        **dict(lead),
        "conversations": [dict(c) for c in conversations],
    }

class SendMessageRequest(BaseModel):
    content: str

@router.get("/leads/{lead_id}/handoff")
async def get_lead_handoff(lead_id: str):
    """Get current handoff (HITL) status for a lead."""
    handoff = await get_active_handoff_by_lead_id(lead_id)
    return {"active": handoff is not None, "handoff_id": str(handoff["id"]) if handoff else None}


@router.post("/leads/{lead_id}/handoff/start")
async def start_lead_handoff(lead_id: str):
    """Start human-in-the-loop (takeover) for this lead from the frontend."""
    try:
        handoff = await ensure_handoff_for_human_reply(lead_id)
        return {"ok": True, "handoff_id": str(handoff["id"])}
    except ValueError as e:
        return {"error": str(e)}


@router.post("/leads/{lead_id}/handoff/close")
async def close_lead_handoff(lead_id: str):
    """End human takeover and return control to the agent."""
    closed = await close_handoff_by_lead_id(lead_id)
    return {"ok": True, "closed": closed}


@router.post("/leads/{lead_id}/message")
async def send_lead_message(lead_id: str, request: SendMessageRequest):
    """Send a message to a lead as a human agent. Activates HITL if not already active."""
    pool = await get_pool()
    lead = await pool.fetchrow("SELECT id, phone FROM leads WHERE id = $1", lead_id)
    if not lead:
        return {"error": f"Lead {lead_id} not found"}

    await ensure_handoff_for_human_reply(lead_id)

    # Guardamos en bd
    await pool.execute(
        """
        INSERT INTO conversations (lead_id, role, sender_type, content)
        VALUES ($1, 'assistant', 'human', $2)
        """,
        lead_id, request.content
    )

    # Actualizamos el ultimo contacto
    await pool.execute(
        "UPDATE leads SET last_contact = NOW() WHERE id = $1", lead_id
    )

    # Enviamos via WhatsApp
    try:
        await send_text_message(to=lead["phone"], text=request.content)
    except Exception as e:
        logger.error(f"Error sending message to {lead['phone']}: {e}")
        return {"error": "Failed to dispatch message to WhatsApp provider"}

    return {"status": "ok"}


@router.get("/metrics/{project_id}")
async def get_metrics(project_id: str):
    """Get project metrics."""
    pool = await get_pool()

    # Lead counts by score
    score_rows = await pool.fetch(
        """
        SELECT score, COUNT(*) AS count
        FROM leads
        WHERE project_id = $1
        GROUP BY score
        """,
        project_id,
    )
    score_counts = {r["score"]: r["count"] for r in score_rows}
    total_leads = sum(score_counts.values())

    # Unit counts by status
    unit_rows = await pool.fetch(
        """
        SELECT status, COUNT(*) AS count
        FROM units
        WHERE project_id = $1
        GROUP BY status
        """,
        project_id,
    )
    unit_counts = {r["status"]: r["count"] for r in unit_rows}

    return {
        "total_leads": total_leads,
        "hot": score_counts.get("hot", 0),
        "warm": score_counts.get("warm", 0),
        "cold": score_counts.get("cold", 0),
        "units_available": unit_counts.get("available", 0),
        "units_reserved": unit_counts.get("reserved", 0),
        "units_sold": unit_counts.get("sold", 0),
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


# ---------- Obra tracking ----------

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
async def get_obra(project_id: str):
    """Get full obra data: etapas with nested updates+fotos, calculated overall progress."""
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
        return {"error": "No valid fields"}

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
        return {"error": "Etapa not found"}
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

    project = await pool.fetchrow("SELECT slug FROM projects WHERE id = $1", project_id)
    if not project:
        return {"error": "Project not found"}

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
        file_url = await upload_obra_foto(content, project["slug"], foto.filename, scope, identifier)
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


# ---------- Reservations ----------

class ReservationBody(BaseModel):
    unit_id: str
    lead_id: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_phone: str
    buyer_email: Optional[str] = None
    amount_usd: Optional[float] = None
    payment_method: Optional[str] = None   # efectivo|transferencia|cheque|financiacion
    notes: Optional[str] = None
    signed_at: Optional[str] = None        # YYYY-MM-DD


class ReservationPatchBody(BaseModel):
    status: str   # cancelled | converted


@router.post("/reservations/{project_id}")
async def create_reservation(project_id: str, body: ReservationBody):
    """Create a reservation for a unit. Also marks the unit as 'reserved' if it was 'available'."""
    pool = await get_pool()

    unit = await pool.fetchrow(
        "SELECT id, identifier, status FROM units WHERE id = $1 AND project_id = $2",
        body.unit_id, project_id,
    )
    if not unit:
        raise HTTPException(status_code=404, detail="Unidad no encontrada en este proyecto")

    if unit["status"] == "sold":
        raise HTTPException(status_code=409, detail=f"La unidad {unit['identifier']} ya está vendida")

    existing = await pool.fetchval(
        "SELECT id FROM reservations WHERE unit_id = $1 AND status = 'active'",
        body.unit_id,
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"La unidad {unit['identifier']} ya tiene una reserva activa")

    async with pool.acquire() as conn:
        async with conn.transaction():
            if unit["status"] == "available":
                await conn.execute(
                    "UPDATE units SET status = 'reserved' WHERE id = $1",
                    body.unit_id,
                )

            signed_at_val = (
                datetime.strptime(body.signed_at, "%Y-%m-%d").date()
                if body.signed_at else None
            )
            row = await conn.fetchrow(
                """
                INSERT INTO reservations
                    (project_id, unit_id, lead_id, buyer_name, buyer_phone, buyer_email,
                     amount_usd, payment_method, notes, signed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, project_id, unit_id, lead_id, buyer_name, buyer_phone,
                          buyer_email, amount_usd, payment_method, notes, signed_at,
                          status, created_at
                """,
                project_id, body.unit_id, body.lead_id or None,
                body.buyer_name, body.buyer_phone, body.buyer_email,
                body.amount_usd, body.payment_method, body.notes,
                signed_at_val,
            )

    u = await pool.fetchrow(
        "SELECT identifier, floor, bedrooms, area_m2, price_usd FROM units WHERE id = $1",
        body.unit_id,
    )

    result = dict(row)
    result["unit_identifier"] = u["identifier"]
    result["unit_floor"] = u["floor"]
    result["unit_bedrooms"] = u["bedrooms"]
    result["unit_area_m2"] = float(u["area_m2"]) if u["area_m2"] is not None else None
    result["unit_price_usd"] = float(u["price_usd"]) if u["price_usd"] is not None else None
    if result.get("amount_usd") is not None:
        result["amount_usd"] = float(result["amount_usd"])

    logger.info("Reservation created for unit %s (project %s)", u["identifier"], project_id)
    return result


@router.get("/reservations/{project_id}")
async def list_reservations(project_id: str, status: Optional[str] = None):
    """List reservations for a project, optionally filtered by status."""
    pool = await get_pool()

    conditions = ["r.project_id = $1"]
    params = [project_id]
    if status:
        conditions.append(f"r.status = ${len(params) + 1}")
        params.append(status)

    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""
        SELECT r.id, r.project_id, r.unit_id, r.lead_id, r.buyer_name, r.buyer_phone,
               r.buyer_email, r.amount_usd, r.payment_method, r.notes, r.signed_at,
               r.status, r.created_at,
               u.identifier as unit_identifier, u.floor as unit_floor,
               u.bedrooms as unit_bedrooms, u.area_m2 as unit_area_m2, u.price_usd as unit_price_usd,
               p.name as project_name
        FROM reservations r
        JOIN units u ON u.id = r.unit_id
        JOIN projects p ON p.id = r.project_id
        WHERE {where}
        ORDER BY r.created_at DESC
        """,
        *params,
    )

    result = []
    for r in rows:
        d = dict(r)
        if d.get("amount_usd") is not None:
            d["amount_usd"] = float(d["amount_usd"])
        if d.get("unit_area_m2") is not None:
            d["unit_area_m2"] = float(d["unit_area_m2"])
        if d.get("unit_price_usd") is not None:
            d["unit_price_usd"] = float(d["unit_price_usd"])
        result.append(d)
    return result


@router.get("/reservation/{reservation_id}")
async def get_reservation(reservation_id: str):
    """Get a single reservation with unit and project details."""
    pool = await get_pool()

    row = await pool.fetchrow(
        """
        SELECT r.id, r.project_id, r.unit_id, r.lead_id, r.buyer_name, r.buyer_phone,
               r.buyer_email, r.amount_usd, r.payment_method, r.notes, r.signed_at,
               r.status, r.created_at,
               u.identifier as unit_identifier, u.floor as unit_floor,
               u.bedrooms as unit_bedrooms, u.area_m2 as unit_area_m2, u.price_usd as unit_price_usd,
               p.name as project_name, p.address as project_address
        FROM reservations r
        JOIN units u ON u.id = r.unit_id
        JOIN projects p ON p.id = r.project_id
        WHERE r.id = $1
        """,
        reservation_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    d = dict(row)
    if d.get("amount_usd") is not None:
        d["amount_usd"] = float(d["amount_usd"])
    if d.get("unit_area_m2") is not None:
        d["unit_area_m2"] = float(d["unit_area_m2"])
    if d.get("unit_price_usd") is not None:
        d["unit_price_usd"] = float(d["unit_price_usd"])
    return d


@router.patch("/reservations/{reservation_id}")
async def patch_reservation(reservation_id: str, body: ReservationPatchBody):
    """Change reservation status: cancelled or converted."""
    if body.status not in ("cancelled", "converted"):
        raise HTTPException(status_code=400, detail="Estado debe ser 'cancelled' o 'converted'")

    pool = await get_pool()

    reservation = await pool.fetchrow(
        "SELECT id, unit_id, status FROM reservations WHERE id = $1",
        reservation_id,
    )
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    if reservation["status"] != "active":
        raise HTTPException(status_code=409, detail=f"La reserva ya está en estado '{reservation['status']}'")

    unit_id = reservation["unit_id"]

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE reservations SET status = $1, updated_at = NOW() WHERE id = $2",
                body.status, reservation_id,
            )

            if body.status == "cancelled":
                await conn.execute(
                    "UPDATE units SET status = 'available' WHERE id = $1",
                    unit_id,
                )
            elif body.status == "converted":
                await conn.execute(
                    "UPDATE units SET status = 'sold' WHERE id = $1",
                    unit_id,
                )
                # Register buyer using reservation data
                res_data = await conn.fetchrow(
                    "SELECT project_id, lead_id, buyer_name, buyer_phone, signed_at FROM reservations WHERE id = $1",
                    reservation_id,
                )
                if res_data:
                    await conn.execute(
                        """
                        INSERT INTO buyers (project_id, unit_id, lead_id, name, phone, signed_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT DO NOTHING
                        """,
                        res_data["project_id"], unit_id, res_data["lead_id"],
                        res_data["buyer_name"], res_data["buyer_phone"], res_data["signed_at"],
                    )

    logger.info("Reservation %s status changed to %s", reservation_id, body.status)
    return {"reservation_id": reservation_id, "status": body.status}


# ---------- Buyers ----------

class BuyerBody(BaseModel):
    unit_id: str
    name: str
    phone: str
    lead_id: Optional[str] = None
    signed_at: Optional[str] = None


@router.get("/buyers/{project_id}")
async def list_buyers(project_id: str):
    """List active buyers for a project with their unit details."""
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT b.id, b.lead_id, b.unit_id, b.phone, b.name, b.signed_at, b.status,
                  u.identifier as unit_identifier, u.floor as unit_floor,
                  u.bedrooms, u.area_m2, u.price_usd
           FROM buyers b
           JOIN units u ON b.unit_id = u.id
           WHERE b.project_id = $1 AND b.status = 'active'
           ORDER BY b.signed_at DESC NULLS LAST""",
        project_id,
    )
    return [dict(r) for r in rows]


@router.post("/buyers/{project_id}")
async def create_buyer(project_id: str, body: BuyerBody):
    """Register a buyer for a sold unit."""
    pool = await get_pool()

    unit = await pool.fetchrow(
        "SELECT id, identifier FROM units WHERE id = $1 AND project_id = $2",
        body.unit_id, project_id,
    )
    if not unit:
        return {"error": "Unidad no encontrada"}

    existing = await pool.fetchval(
        "SELECT id FROM buyers WHERE unit_id = $1 AND status = 'active'", body.unit_id
    )
    if existing:
        return {"error": f"Ya existe un comprador activo para la unidad {unit['identifier']}"}

    signed_at = datetime.now(timezone.utc)
    if body.signed_at:
        try:
            signed_at = datetime.fromisoformat(body.signed_at)
        except ValueError:
            pass

    row = await pool.fetchrow(
        """INSERT INTO buyers (project_id, unit_id, lead_id, name, phone, signed_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, phone""",
        project_id, body.unit_id, body.lead_id or None,
        body.name, body.phone, signed_at,
    )

    logger.info("Buyer registered: %s for unit %s (project %s)", body.name, unit["identifier"], project_id)
    return dict(row)


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


# ---------- Módulo 1: Dashboard Financiero ----------

class BudgetBody(BaseModel):
    categoria: str
    descripcion: Optional[str] = None
    monto_usd: Optional[float] = None
    monto_ars: Optional[float] = None


class ExpenseBody(BaseModel):
    proveedor: Optional[str] = None
    descripcion: str
    monto_usd: Optional[float] = None
    monto_ars: Optional[float] = None
    fecha: str   # YYYY-MM-DD
    comprobante_url: Optional[str] = None
    budget_id: Optional[str] = None


class FinancialsConfigBody(BaseModel):
    tipo_cambio_usd_ars: float


@router.get("/financials/{project_id}/summary")
async def get_financials_summary(project_id: str):
    pool = await get_pool()

    config_row = await pool.fetchrow(
        "SELECT tipo_cambio_usd_ars FROM project_financials_config WHERE project_id = $1",
        project_id,
    )
    tipo_cambio = float(config_row["tipo_cambio_usd_ars"]) if config_row else 1000.0

    budget_rows = await pool.fetch(
        "SELECT id, categoria, monto_usd FROM project_budget WHERE project_id = $1",
        project_id,
    )
    presupuesto_total = sum(float(r["monto_usd"] or 0) for r in budget_rows)

    expenses_rows = await pool.fetch(
        """SELECT e.monto_usd, b.categoria
           FROM project_expenses e
           LEFT JOIN project_budget b ON b.id = e.budget_id
           WHERE e.project_id = $1""",
        project_id,
    )
    ejecutado_total = sum(float(r["monto_usd"] or 0) for r in expenses_rows)

    revenue_row = await pool.fetchrow(
        "SELECT COALESCE(SUM(price_usd), 0) as revenue FROM units WHERE project_id = $1",
        project_id,
    )
    revenue = float(revenue_row["revenue"]) if revenue_row else 0.0

    desvio = ejecutado_total - presupuesto_total
    desvio_pct = (desvio / presupuesto_total * 100) if presupuesto_total else 0.0
    margen_pct = ((revenue - presupuesto_total) / revenue * 100) if revenue else 0.0

    # By category
    cat_exec: dict = {}
    for r in expenses_rows:
        cat = r["categoria"] or "Sin categoría"
        cat_exec[cat] = cat_exec.get(cat, 0.0) + float(r["monto_usd"] or 0)

    por_categoria = []
    for b in budget_rows:
        cat = b["categoria"]
        bud = float(b["monto_usd"] or 0)
        exe = cat_exec.get(cat, 0.0)
        dev_pct = ((exe - bud) / bud * 100) if bud else 0.0
        por_categoria.append({
            "categoria": cat,
            "presupuesto_usd": bud,
            "ejecutado_usd": exe,
            "desvio_pct": round(dev_pct, 1),
        })

    return {
        "presupuesto_total_usd": presupuesto_total,
        "ejecutado_usd": ejecutado_total,
        "desvio_usd": desvio,
        "desvio_pct": round(desvio_pct, 1),
        "revenue_esperado_usd": revenue,
        "margen_esperado_pct": round(margen_pct, 1),
        "tipo_cambio": tipo_cambio,
        "por_categoria": por_categoria,
    }


@router.get("/financials/{project_id}/expenses")
async def list_expenses(
    project_id: str,
    categoria: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
):
    pool = await get_pool()
    conditions = ["e.project_id = $1"]
    params: list = [project_id]

    if categoria:
        params.append(categoria)
        conditions.append(f"b.categoria = ${len(params)}")
    if fecha_desde:
        params.append(datetime.strptime(fecha_desde, "%Y-%m-%d").date())
        conditions.append(f"e.fecha >= ${len(params)}")
    if fecha_hasta:
        params.append(datetime.strptime(fecha_hasta, "%Y-%m-%d").date())
        conditions.append(f"e.fecha <= ${len(params)}")

    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""SELECT e.id, e.budget_id, e.proveedor, e.descripcion,
                   e.monto_usd, e.monto_ars, e.fecha, e.comprobante_url, e.created_at,
                   b.categoria
            FROM project_expenses e
            LEFT JOIN project_budget b ON b.id = e.budget_id
            WHERE {where}
            ORDER BY e.fecha DESC, e.created_at DESC""",
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


@router.post("/financials/{project_id}/expenses")
async def create_expense(project_id: str, body: ExpenseBody):
    pool = await get_pool()
    fecha = datetime.strptime(body.fecha, "%Y-%m-%d").date()
    row = await pool.fetchrow(
        """INSERT INTO project_expenses
               (project_id, budget_id, proveedor, descripcion, monto_usd, monto_ars, fecha, comprobante_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, budget_id, proveedor, descripcion, monto_usd, monto_ars, fecha, comprobante_url, created_at""",
        project_id, body.budget_id or None, body.proveedor, body.descripcion,
        body.monto_usd, body.monto_ars, fecha, body.comprobante_url,
    )
    d = dict(row)
    if d.get("monto_usd") is not None:
        d["monto_usd"] = float(d["monto_usd"])
    if d.get("monto_ars") is not None:
        d["monto_ars"] = float(d["monto_ars"])
    return d


@router.patch("/financials/{project_id}/expenses/{expense_id}")
async def patch_expense(project_id: str, expense_id: str, request: Request):
    pool = await get_pool()
    body = await request.json()
    ALLOWED = {"proveedor", "descripcion", "monto_usd", "monto_ars", "fecha", "comprobante_url", "budget_id"}
    fields = {k: v for k, v in body.items() if k in ALLOWED}
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields")
    if "fecha" in fields:
        fields["fecha"] = datetime.strptime(fields["fecha"], "%Y-%m-%d").date()

    set_clauses = []
    params: list = [expense_id, project_id]
    for i, (k, v) in enumerate(fields.items(), start=3):
        set_clauses.append(f"{k} = ${i}")
        params.append(v)

    row = await pool.fetchrow(
        f"UPDATE project_expenses SET {', '.join(set_clauses)} WHERE id = $1 AND project_id = $2 RETURNING id",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    return {"updated": True, "id": str(row["id"])}


@router.delete("/financials/{project_id}/expenses/{expense_id}")
async def delete_expense(project_id: str, expense_id: str):
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM project_expenses WHERE id = $1 AND project_id = $2",
        expense_id, project_id,
    )
    return {"deleted": result.split()[-1] != "0"}


@router.get("/financials/{project_id}/budget")
async def get_budget(project_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, categoria, descripcion, monto_usd, monto_ars, created_at FROM project_budget WHERE project_id = $1 ORDER BY categoria",
        project_id,
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


@router.post("/financials/{project_id}/budget")
async def upsert_budget(project_id: str, body: BudgetBody):
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO project_budget (project_id, categoria, descripcion, monto_usd, monto_ars)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING
           RETURNING id, categoria, monto_usd""",
        project_id, body.categoria, body.descripcion, body.monto_usd, body.monto_ars,
    )
    if not row:
        row = await pool.fetchrow(
            """UPDATE project_budget SET descripcion = $3, monto_usd = $4, monto_ars = $5
               WHERE project_id = $1 AND categoria = $2
               RETURNING id, categoria, monto_usd""",
            project_id, body.categoria, body.descripcion, body.monto_usd, body.monto_ars,
        )
    d = dict(row)
    if d.get("monto_usd") is not None:
        d["monto_usd"] = float(d["monto_usd"])
    return d


@router.patch("/financials/{project_id}/config")
async def patch_financials_config(project_id: str, body: FinancialsConfigBody):
    pool = await get_pool()
    await pool.execute(
        """INSERT INTO project_financials_config (project_id, tipo_cambio_usd_ars, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (project_id) DO UPDATE SET tipo_cambio_usd_ars = $2, updated_at = NOW()""",
        project_id, body.tipo_cambio_usd_ars,
    )
    return {"tipo_cambio": body.tipo_cambio_usd_ars}


# ---------- Módulo 2: Portal de Inversores ----------

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
        "SELECT id, nombre, email, telefono, monto_aportado_usd, fecha_aporte, porcentaje_participacion, created_at FROM investors WHERE project_id = $1 ORDER BY nombre",
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
async def create_investor(project_id: str, body: InvestorBody):
    pool = await get_pool()
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
    return d


@router.patch("/investors/{project_id}/{investor_id}")
async def patch_investor(project_id: str, investor_id: str, request: Request):
    pool = await get_pool()
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
        f"UPDATE investors SET {', '.join(set_clauses)} WHERE id = $1 AND project_id = $2 RETURNING id, nombre",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Inversor no encontrado")
    return {"updated": True, "id": str(row["id"])}


@router.delete("/investors/{project_id}/{investor_id}")
async def delete_investor(project_id: str, investor_id: str):
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM investors WHERE id = $1 AND project_id = $2", investor_id, project_id
    )
    return {"deleted": result.split()[-1] != "0"}


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
        "SELECT nombre, telefono FROM investors WHERE project_id = $1 AND telefono IS NOT NULL",
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


# ---------- Módulo 3: Alertas Proactivas ----------

@router.get("/alerts")
async def list_alerts(project_id: Optional[str] = None):
    pool = await get_pool()
    if project_id:
        rows = await pool.fetch(
            "SELECT id, project_id, tipo, titulo, descripcion, severidad, leida, metadata, created_at FROM project_alerts WHERE project_id = $1 ORDER BY created_at DESC",
            project_id,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, project_id, tipo, titulo, descripcion, severidad, leida, metadata, created_at FROM project_alerts ORDER BY created_at DESC LIMIT 100",
        )
    return [dict(r) for r in rows]


@router.post("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    pool = await get_pool()
    await pool.execute("UPDATE project_alerts SET leida = TRUE WHERE id = $1", alert_id)
    return {"ok": True}


@router.post("/alerts/read-all")
async def mark_all_alerts_read(project_id: Optional[str] = None):
    pool = await get_pool()
    if project_id:
        await pool.execute("UPDATE project_alerts SET leida = TRUE WHERE project_id = $1 AND leida = FALSE", project_id)
    else:
        await pool.execute("UPDATE project_alerts SET leida = TRUE WHERE leida = FALSE")
    return {"ok": True}


@router.post("/jobs/alerts")
async def run_alerts_job():
    from app.services.alerts_service import evaluate_alerts
    created = await evaluate_alerts()
    return {"alerts_created": created}


# ---------- Módulo 4: Proveedores y Pagos de Obra ----------

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
    descripcion: str
    monto_usd: Optional[float] = None
    monto_ars: Optional[float] = None
    fecha_vencimiento: Optional[str] = None
    estado: str = "pendiente"
    fecha_pago: Optional[str] = None
    comprobante_url: Optional[str] = None


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
        f"""SELECT p.id, p.supplier_id, p.etapa_id, p.descripcion,
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
    fv = datetime.strptime(body.fecha_vencimiento, "%Y-%m-%d").date() if body.fecha_vencimiento else None
    fp = datetime.strptime(body.fecha_pago, "%Y-%m-%d").date() if body.fecha_pago else None
    row = await pool.fetchrow(
        """INSERT INTO obra_payments
               (project_id, supplier_id, etapa_id, descripcion, monto_usd, monto_ars,
                fecha_vencimiento, estado, fecha_pago, comprobante_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, descripcion, estado, fecha_vencimiento, created_at""",
        project_id, body.supplier_id or None, body.etapa_id or None, body.descripcion,
        body.monto_usd, body.monto_ars, fv, body.estado, fp, body.comprobante_url,
    )
    return dict(row)


@router.patch("/obra-payments/{payment_id}")
async def patch_obra_payment(payment_id: str, request: Request):
    pool = await get_pool()
    body = await request.json()
    ALLOWED = {"supplier_id", "etapa_id", "descripcion", "monto_usd", "monto_ars",
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


@router.post("/jobs/update-payment-states")
async def update_payment_states():
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE obra_payments SET estado = 'vencido' WHERE fecha_vencimiento < CURRENT_DATE AND estado = 'pendiente'"
    )
    updated = int(result.split()[-1])
    return {"updated": updated}
