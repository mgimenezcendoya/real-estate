"""
Handoff Manager: orchestrates the handoff flow between leads and sales team via Telegram.
"""

import logging

from app.database import get_pool
from app.modules.handoff.telegram import send_handoff_alert, forward_lead_message
from app.modules.whatsapp.sender import send_text_message

logger = logging.getLogger(__name__)


async def check_active_handoff(phone: str, project_id: str) -> dict | None:
    """Check if a lead has an active handoff."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT h.* FROM handoffs h
        JOIN leads l ON h.lead_id = l.id
        WHERE l.phone = $1 AND h.project_id = $2 AND h.status = 'active'
        """,
        phone,
        project_id,
    )
    return dict(row) if row else None


async def get_active_handoff_by_lead_id(lead_id: str) -> dict | None:
    """Get active handoff for a lead by lead_id (for frontend)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT h.* FROM handoffs h
        WHERE h.lead_id = $1 AND h.status = 'active'
        """,
        lead_id,
    )
    return dict(row) if row else None


async def ensure_handoff_for_human_reply(lead_id: str) -> dict:
    """Ensure there is an active handoff when a human replies from the frontend.
    Creates one if missing (HITL mode). Returns the handoff."""
    pool = await get_pool()
    existing = await pool.fetchrow(
        "SELECT * FROM handoffs WHERE lead_id = $1 AND status = 'active'",
        lead_id,
    )
    if existing:
        return dict(existing)
    lead = await pool.fetchrow("SELECT project_id FROM leads WHERE id = $1", lead_id)
    if not lead:
        raise ValueError(f"Lead {lead_id} not found")
    project_id = str(lead["project_id"])
    handoff = await pool.fetchrow(
        """
        INSERT INTO handoffs (lead_id, project_id, trigger, context_summary, status, started_at)
        VALUES ($1, $2, 'frontend', 'Intervención humana desde el panel', 'active', NOW())
        RETURNING *
        """,
        lead_id, project_id,
    )
    logger.info("Handoff started from frontend for lead %s", lead_id)
    return dict(handoff)


async def close_handoff_by_lead_id(lead_id: str) -> bool:
    """Close active handoff for a lead (e.g. from frontend). Returns True if one was closed."""
    handoff = await get_active_handoff_by_lead_id(lead_id)
    if not handoff:
        return False
    await close_handoff(str(handoff["id"]), lead_note=None)
    return True


async def initiate_handoff(
    lead_id: str,
    project_id: str,
    trigger: str,
    context_summary: str,
    conversation_history: list[dict] | None = None,
) -> dict:
    """Start a handoff: create record, send Telegram alert, message the lead."""
    pool = await get_pool()

    existing = await pool.fetchrow(
        "SELECT id FROM handoffs WHERE lead_id = $1 AND project_id = $2 AND status = 'active'",
        lead_id, project_id,
    )
    if existing:
        logger.info("Handoff already active for lead %s", lead_id)
        return dict(existing)

    handoff = await pool.fetchrow(
        """
        INSERT INTO handoffs (lead_id, project_id, trigger, context_summary, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING *
        """,
        lead_id, project_id, trigger, context_summary,
    )

    lead = await pool.fetchrow("SELECT phone, name FROM leads WHERE id = $1", lead_id)
    project = await pool.fetchrow("SELECT name FROM projects WHERE id = $1", project_id)
    score = await pool.fetchval("SELECT score FROM leads WHERE id = $1", lead_id)

    await send_handoff_alert(
        handoff_id=str(handoff["id"]),
        lead_name=lead["name"] or "Sin nombre",
        lead_phone=lead["phone"],
        project_name=project["name"] if project else "?",
        score=score or "?",
        context_summary=context_summary,
        conversation_history=conversation_history,
    )

    if lead:
        await send_text_message(
            lead["phone"],
            "Te paso con un asesor comercial. Ya le compartí el contexto de nuestra conversación para que no tengas que repetir nada.",
        )

    return dict(handoff)


async def handle_lead_message_during_handoff(handoff: dict, text: str) -> None:
    """Forward a lead message to the active Telegram handoff thread."""
    await forward_lead_message(str(handoff["id"]), text)


async def close_handoff(handoff_id: str, lead_note: str | None = None, send_goodbye: bool = True) -> None:
    """Close a handoff and resume the agent. Set send_goodbye=False when closing due to timeout."""
    pool = await get_pool()

    await pool.execute(
        """
        UPDATE handoffs
        SET status = 'completed', completed_at = NOW(), lead_note = $2
        WHERE id = $1
        """,
        handoff_id,
        lead_note,
    )

    handoff = await pool.fetchrow("SELECT * FROM handoffs WHERE id = $1", handoff_id)
    if handoff and send_goodbye:
        lead = await pool.fetchrow("SELECT phone FROM leads WHERE id = $1", handoff["lead_id"])
        if lead:
            await send_text_message(
                lead["phone"],
                "Gracias por hablar con nuestro equipo. Si necesitás algo más, seguí escribiéndome.",
            )
    logger.info("Handoff %s closed", handoff_id)
