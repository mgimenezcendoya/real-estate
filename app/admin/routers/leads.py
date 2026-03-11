# app/admin/routers/leads.py
import asyncio
import logging
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.auth import verify_token
from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.core.sse import connection_manager
from app.database import get_pool
from app.modules.handoff.manager import (
    close_handoff_by_lead_id,
    ensure_handoff_for_human_reply,
    get_active_handoff_by_lead_id,
)
from app.modules.leads.nurturing import process_nurturing_batch
from app.modules.whatsapp.sender import send_text_message

logger = logging.getLogger(__name__)
router = APIRouter()

UPDATABLE_LEAD_FIELDS = {
    "name", "score", "source", "budget_usd", "intent", "timeline", "financing", "bedrooms", "location_pref",
    "tags", "internal_notes",
}


@router.post("/jobs/nurturing")
async def run_nurturing():
    """Trigger nurturing batch (called by Railway cron)."""
    sent = await process_nurturing_batch()
    return {"messages_sent": sent}


@router.post("/jobs/obra-notifications")
async def run_obra_notifications():
    """Trigger obra update notifications (called by Railway cron)."""
    return {"status": "ok"}


@router.get("/leads")
async def list_leads(
    project_id: str | None = None,
    score: str | None = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """List leads. Automatically scoped to the caller's organization unless superadmin."""
    pool = await get_pool()
    conditions = []
    params = []

    if project_id:
        conditions.append(f"l.project_id = ${len(params) + 1}")
        params.append(project_id)
    elif credentials and credentials.scheme == "Bearer":
        payload = verify_token(credentials.credentials)
        if payload and payload.get("role") != "superadmin":
            org_id = payload.get("organization_id")
            if org_id:
                conditions.append(f"p.organization_id = ${len(params) + 1}")
                params.append(org_id)

    if score:
        conditions.append(f"l.score = ${len(params) + 1}")
        params.append(score)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT
            l.id, l.project_id, l.phone, l.name, l.intent, l.financing, l.timeline,
            l.budget_usd, l.bedrooms, l.location_pref, l.score, l.source,
            l.created_at, l.last_contact,
            p.name as project_name,
            EXISTS(
                SELECT 1 FROM handoffs h
                WHERE h.lead_id = l.id AND h.status = 'active'
            ) as handoff_active
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        {where_clause}
        ORDER BY l.last_contact DESC NULLS LAST, l.created_at DESC
    """

    rows = await pool.fetch(query, *params)
    return [dict(r) for r in rows]


@router.patch("/leads/{lead_id}")
async def update_lead(
    lead_id: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Update editable lead fields."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
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
async def get_lead_notes(
    lead_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Get notes for a lead."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
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
async def add_lead_note(
    lead_id: str,
    body: NoteBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Add a note to a lead."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()
    row = await pool.fetchrow(
        "INSERT INTO lead_notes (lead_id, author_name, note) VALUES ($1, $2, $3) RETURNING id, author_name, note, created_at",
        lead_id, body.author_name, body.note,
    )
    return dict(row)


@router.delete("/leads/{lead_id}/notes/{note_id}")
async def delete_lead_note(
    lead_id: str,
    note_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Delete a note."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM lead_notes WHERE id = $1 AND lead_id = $2",
        note_id, lead_id,
    )
    deleted = result.split()[-1] != "0"
    return {"deleted": deleted}


@router.get("/analytics/{project_id}")
async def get_analytics(
    project_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Get analytics dashboard data for a project."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
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
async def get_lead(
    lead_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Get full lead detail including conversation history."""
    pool = await get_pool()
    lead = await pool.fetchrow(
        """
        SELECT l.id, l.project_id, l.phone, l.name, l.intent, l.financing, l.timeline,
               l.budget_usd, l.bedrooms, l.location_pref, l.score, l.source,
               l.created_at, l.last_contact, l.tags, l.internal_notes,
               p.organization_id
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        WHERE l.id = $1
        """,
        lead_id,
    )
    if not lead:
        return {"error": f"Lead {lead_id} not found"}

    # Verify the caller's org matches the lead's org (unless superadmin)
    if credentials and credentials.scheme == "Bearer":
        payload = verify_token(credentials.credentials)
        if payload and payload.get("role") != "superadmin":
            caller_org = payload.get("organization_id")
            lead_org = str(lead["organization_id"]) if lead["organization_id"] else None
            if caller_org and lead_org and caller_org != lead_org:
                raise HTTPException(status_code=403, detail="No tenés acceso a este lead")

    conversations = await pool.fetch(
        """
        SELECT id, role, sender_type, content, media_type, created_at
        FROM conversations
        WHERE lead_id = $1
        ORDER BY created_at ASC
        """,
        lead_id,
    )

    lead_dict = dict(lead)
    lead_dict.pop("organization_id", None)
    return {
        **lead_dict,
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
async def start_lead_handoff(
    lead_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Start human-in-the-loop (takeover) for this lead from the frontend.

    Uses SELECT FOR UPDATE to prevent two admins from simultaneously taking
    the same conversation (returns 409 if already taken).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Lock the handoffs row for this lead atomically so concurrent
            # requests from different admins cannot both succeed.
            existing = await conn.fetchrow(
                """
                SELECT id FROM handoffs
                WHERE lead_id = $1 AND status = 'active'
                FOR UPDATE
                """,
                lead_id,
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="Esta conversación ya fue tomada por otro agente.",
                )
            lead = await conn.fetchrow("SELECT project_id FROM leads WHERE id = $1", lead_id)
            if not lead:
                raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")
            handoff = await conn.fetchrow(
                """
                INSERT INTO handoffs (lead_id, project_id, trigger, context_summary, status, started_at, last_activity_at)
                VALUES ($1, $2, 'frontend', 'Intervención humana desde el panel', 'active', NOW(), NOW())
                RETURNING *
                """,
                lead_id,
                str(lead["project_id"]),
            )

    handoff_dict = dict(handoff)
    logger.info("Handoff started (atomic) for lead %s", lead_id)

    # Broadcast to all connected admins of this tenant
    payload = verify_token(credentials.credentials) if credentials else None
    tenant_id = payload.get("organization_id") if payload else None
    if tenant_id:
        asyncio.create_task(
            connection_manager.broadcast(
                tenant_id,
                "handoff_update",
                {"lead_id": lead_id, "handoff_active": True, "taken_by": payload.get("nombre", "admin")},
            )
        )

    return {"ok": True, "handoff_id": str(handoff_dict["id"])}


@router.post("/leads/{lead_id}/handoff/close")
async def close_lead_handoff(
    lead_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """End human takeover and return control to the agent."""
    closed = await close_handoff_by_lead_id(lead_id)

    # Broadcast handoff closure to all connected admins of this tenant
    payload = verify_token(credentials.credentials) if credentials else None
    tenant_id = payload.get("organization_id") if payload else None
    if tenant_id:
        asyncio.create_task(
            connection_manager.broadcast(
                tenant_id,
                "handoff_update",
                {"lead_id": lead_id, "handoff_active": False, "taken_by": None},
            )
        )

    return {"ok": True, "closed": closed}


@router.post("/leads/{lead_id}/message")
async def send_lead_message(
    lead_id: str,
    request: SendMessageRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Send a message to a lead as a human agent. Activates HITL if not already active."""
    pool = await get_pool()
    lead = await pool.fetchrow("SELECT id, phone FROM leads WHERE id = $1", lead_id)
    if not lead:
        return {"error": f"Lead {lead_id} not found"}

    await ensure_handoff_for_human_reply(lead_id)

    # Guardamos en bd
    conv = await pool.fetchrow(
        """
        INSERT INTO conversations (lead_id, role, sender_type, content)
        VALUES ($1, 'assistant', 'human', $2)
        RETURNING id, created_at
        """,
        lead_id, request.content
    )

    # Actualizamos el ultimo contacto y la actividad del handoff (para el timeout de 4h)
    await pool.execute(
        "UPDATE leads SET last_contact = NOW() WHERE id = $1", lead_id
    )
    await pool.execute(
        """
        UPDATE handoffs SET last_activity_at = NOW()
        WHERE lead_id = $1 AND status = 'active'
        """,
        lead_id,
    )

    # Enviamos via WhatsApp
    try:
        await send_text_message(to=lead["phone"], text=request.content)
    except Exception as e:
        logger.error(f"Error sending message to {lead['phone']}: {e}")
        return {"error": "Failed to dispatch message to WhatsApp provider"}

    # Broadcast the new message to all connected admins of this tenant so the
    # inbox updates instantly without waiting for SSE polling
    payload = verify_token(credentials.credentials) if credentials else None
    tenant_id = payload.get("organization_id") if payload else None
    if tenant_id:
        asyncio.create_task(
            connection_manager.broadcast(
                tenant_id,
                "message",
                {
                    "lead_id": lead_id,
                    "content": request.content,
                    "sender_type": "human",
                    "timestamp": conv["created_at"].isoformat() if conv else None,
                    "handoff_active": True,
                },
            )
        )

    return {"status": "ok"}


async def _sse_generator(tenant_id: str) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE-formatted strings for a single connection.

    Keeps the connection alive with a ping every 20 seconds. Render's idle
    connection timeout is ~55s, so 20s gives a comfortable margin.

    If the client disconnects (browser tab closed, network drop), FastAPI will
    cancel this generator; we clean up in the finally block.
    """
    queue = connection_manager.connect(tenant_id)
    try:
        while True:
            try:
                # Wait up to 20s for an event; if none arrives, send a ping
                message = await asyncio.wait_for(queue.get(), timeout=20.0)
                yield message
            except asyncio.TimeoutError:
                yield "event: ping\ndata: {}\n\n"
    except (asyncio.CancelledError, GeneratorExit):
        pass
    finally:
        connection_manager.disconnect(tenant_id, queue)


@router.get("/inbox/stream")
async def inbox_stream(
    token: Optional[str] = Query(default=None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """SSE endpoint — streams real-time inbox events to connected admins.

    Accepts JWT either as:
    - Authorization: Bearer <token>  header  (standard fetch)
    - ?token=<token>                 query param (EventSource browser API, which
      does not support custom headers natively)

    Events emitted:
    - event: message       — new WhatsApp message received or sent
    - event: handoff_update — HITL state changed for a lead
    - event: ping          — keepalive (every 20s, ignore in client)
    """
    raw_token = token or (credentials.credentials if credentials else None)
    payload = verify_token(raw_token) if raw_token else None
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    tenant_id = payload.get("organization_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Token sin organization_id")

    return StreamingResponse(
        _sse_generator(tenant_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable Nginx buffering if behind a proxy
            "Connection": "keep-alive",
        },
    )


@router.get("/metrics/{project_id}")
async def get_metrics(
    project_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Get project metrics."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
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
async def list_documents(
    project_id: str,
    doc_type: str | None = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """List active documents for a project."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
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
