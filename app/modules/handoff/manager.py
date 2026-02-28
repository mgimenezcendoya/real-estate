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


async def initiate_handoff(
    lead_id: str,
    project_id: str,
    trigger: str,
    context_summary: str,
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


async def close_handoff(handoff_id: str, lead_note: str | None = None) -> None:
    """Close a handoff and resume the agent."""
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
    if handoff:
        lead = await pool.fetchrow("SELECT phone FROM leads WHERE id = $1", handoff["lead_id"])
        if lead:
            await send_text_message(
                lead["phone"],
                "Gracias por hablar con nuestro equipo. Si necesitás algo más, seguí escribiéndome.",
            )
    logger.info("Handoff %s closed", handoff_id)
