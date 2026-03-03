"""
Obra Notifier: sends personalized construction updates to buyers via WhatsApp.
"""

from app.database import get_pool
from app.modules.whatsapp.sender import send_text_message
from app.modules.whatsapp.templates import buyer_obra_notification


async def notify_buyers_of_update(project_id: str, update_id: str) -> int:
    """Send personalized obra update to all active buyers of a project. Returns count sent."""
    pool = await get_pool()

    update = await pool.fetchrow(
        """
        SELECT u.*, e.nombre as etapa_nombre
        FROM obra_updates u
        LEFT JOIN obra_etapas e ON e.id = u.etapa_id
        WHERE u.id = $1
        """,
        update_id,
    )
    if not update:
        return 0

    project = await pool.fetchrow("SELECT name FROM projects WHERE id = $1", project_id)
    project_name = project["name"] if project else ""

    # Calculate overall progress from etapas
    etapas = await pool.fetch(
        "SELECT peso_pct, porcentaje_completado, activa FROM obra_etapas WHERE project_id = $1",
        project_id,
    )
    avance_general = 0
    if etapas:
        active = [e for e in etapas if e["activa"]]
        total_weight = sum(float(e["peso_pct"]) for e in active)
        if total_weight:
            weighted = sum(float(e["peso_pct"]) * e["porcentaje_completado"] / 100 for e in active)
            avance_general = round(weighted / total_weight * 100)

    buyers = await pool.fetch(
        """
        SELECT b.*, u.identifier, u.floor
        FROM buyers b
        JOIN units u ON b.unit_id = u.id
        WHERE b.project_id = $1 AND b.status = 'active'
        """,
        project_id,
    )

    etapa_label = update["etapa_nombre"] or update["etapa"] or ""

    sent = 0
    for buyer in buyers:
        message = buyer_obra_notification(
            buyer_name=buyer["name"] or "Inversor",
            unit=buyer["identifier"],
            etapa=etapa_label,
            porcentaje=avance_general,
            nota=update["nota_publica"] or "",
            project_name=project_name,
            avance_general=avance_general,
        )
        await send_text_message(buyer["phone"], message)
        sent += 1

    await pool.execute(
        "UPDATE obra_updates SET enviado = TRUE WHERE id = $1",
        update_id,
    )

    return sent
