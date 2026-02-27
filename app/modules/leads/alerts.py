"""
Lead Alerts: sends notifications to the sales team when a lead becomes hot.
"""

from app.database import get_pool
from app.modules.whatsapp.sender import send_text_message
from app.modules.whatsapp.templates import hot_lead_alert


async def notify_hot_lead(lead_id: str, project_id: str, summary: str) -> None:
    """Send WhatsApp alert to sales team about a hot lead."""
    pool = await get_pool()

    lead = await pool.fetchrow("SELECT * FROM leads WHERE id = $1", lead_id)
    if not lead:
        return

    sales_numbers = await pool.fetch(
        "SELECT phone, name FROM authorized_numbers WHERE project_id = $1 AND role = 'ventas' AND status = 'active'",
        project_id,
    )

    project = await pool.fetchrow("SELECT name FROM projects WHERE id = $1", project_id)

    for seller in sales_numbers:
        message = hot_lead_alert(
            lead_name=lead["name"] or "Lead sin nombre",
            phone=lead["phone"],
            project_name=project["name"],
            score=lead["score"],
            summary=summary,
        )
        await send_text_message(seller["phone"], message)
