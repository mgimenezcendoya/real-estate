"""
Obra Notifier: sends personalized construction updates to buyers via WhatsApp.
"""

from app.database import get_pool
from app.modules.whatsapp.sender import send_text_message
from app.modules.whatsapp.templates import buyer_obra_notification


async def notify_buyers_of_update(project_id: str, update_id: str) -> int:
    """Send personalized obra update to all active buyers of a project. Returns count sent."""
    pool = await get_pool()

    update = await pool.fetchrow("SELECT * FROM obra_updates WHERE id = $1", update_id)
    if not update:
        return 0

    buyers = await pool.fetch(
        """
        SELECT b.*, u.identifier, u.floor
        FROM buyers b
        JOIN units u ON b.unit_id = u.id
        WHERE b.project_id = $1 AND b.status = 'active'
        """,
        project_id,
    )

    sent = 0
    for buyer in buyers:
        message = buyer_obra_notification(
            buyer_name=buyer["name"] or "Inversor",
            unit=buyer["identifier"],
            etapa=update["etapa"],
            porcentaje=update["porcentaje_avance"],
            nota=update["nota_publica"] or "",
        )
        await send_text_message(buyer["phone"], message)
        sent += 1

    await pool.execute(
        "UPDATE obra_updates SET enviado = TRUE WHERE id = $1",
        update_id,
    )

    return sent
