"""
Lead Nurturing: automated follow-up flow for warm/cold leads.
Triggered by a background cron job.
"""

from app.database import get_pool
from app.modules.whatsapp.sender import send_text_message


async def process_nurturing_batch() -> int:
    """Process all leads due for a nurturing message. Returns count of messages sent."""
    pool = await get_pool()

    leads = await pool.fetch(
        """
        SELECT l.id, l.phone, l.name, l.score, l.project_id, p.name as project_name
        FROM leads l
        JOIN projects p ON l.project_id = p.id
        WHERE l.score IN ('warm', 'cold')
          AND l.last_contact < NOW() - INTERVAL '7 days'
          AND p.status = 'active'
        ORDER BY l.last_contact ASC
        LIMIT 50
        """
    )

    sent = 0
    for lead in leads:
        message = await _generate_nurturing_message(dict(lead))
        if message:
            await send_text_message(lead["phone"], message)
            await pool.execute(
                "UPDATE leads SET last_contact = NOW() WHERE id = $1",
                lead["id"],
            )
            sent += 1

    return sent


async def _generate_nurturing_message(lead: dict) -> str | None:
    """Generate a personalized nurturing message for a lead."""
    # TODO: Use Claude to generate contextual nurturing message
    # Include: project updates, obra progress, relevant content
    return None
