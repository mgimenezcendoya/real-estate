"""
Handoff Manager: orchestrates the handoff flow between leads and sales team via Chatwoot.
"""

from app.database import get_pool
from app.modules.handoff.chatwoot import create_chatwoot_conversation
from app.modules.whatsapp.sender import send_text_message


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
    """Start a handoff: create record, notify Chatwoot, message the lead."""
    pool = await get_pool()

    handoff = await pool.fetchrow(
        """
        INSERT INTO handoffs (lead_id, project_id, trigger, context_summary)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        lead_id,
        project_id,
        trigger,
        context_summary,
    )

    # Create conversation in Chatwoot
    await create_chatwoot_conversation(
        handoff_id=str(handoff["id"]),
        lead_id=lead_id,
        project_id=project_id,
        context_summary=context_summary,
    )

    # Notify the lead
    lead = await pool.fetchrow("SELECT phone FROM leads WHERE id = $1", lead_id)
    if lead:
        await send_text_message(
            lead["phone"],
            "Te paso con un asesor comercial. Ya le comparti el contexto de nuestra conversacion.",
        )

    return dict(handoff)


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
                "Gracias por hablar con nuestro equipo. Si necesitas algo mas, segui escribiendome.",
            )
