"""
Role Router: determines if an incoming message is from a lead or an authorized developer.
Routes to the appropriate handler based on the sender's phone number.
"""

from app.database import get_pool
from app.modules.whatsapp.providers.base import IncomingMessage


async def get_authorized_number(phone: str, project_id: str) -> dict | None:
    """Check if a phone number is authorized for a project."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, phone, project_id, role, name, status, activation_code
        FROM authorized_numbers
        WHERE phone = $1 AND project_id = $2
        """,
        phone,
        project_id,
    )
    return dict(row) if row else None


async def get_project_by_whatsapp_number(phone_number_id: str) -> dict | None:
    """Look up the project associated with a WhatsApp phone number ID."""
    pool = await get_pool()
    # TODO: map phone_number_id to project — may need a mapping table or config
    row = await pool.fetchrow(
        "SELECT id, developer_id, name, whatsapp_number, status FROM projects WHERE status = 'active' LIMIT 1"
    )
    return dict(row) if row else None


async def route_message(
    phone_number_id: str,
    sender_phone: str,
    message_id: str,
    message_type: str,
    message: IncomingMessage,
) -> None:
    """Main entry point: route a WhatsApp message to Lead or Developer handler."""
    project = await get_project_by_whatsapp_number(phone_number_id)
    if not project:
        return

    project_id = str(project["id"])
    auth = await get_authorized_number(sender_phone, project_id)

    if auth and auth["status"] == "active":
        from app.modules.agent.dev_handler import handle_developer_message

        await handle_developer_message(
            auth_number=auth,
            project=project,
            message_id=message_id,
            message_type=message_type,
            message=message,
        )
    elif auth and auth["status"] == "pending":
        from app.modules.agent.dev_handler import handle_activation_code

        await handle_activation_code(
            auth_number=auth,
            message=message,
        )
    else:
        from app.modules.agent.lead_handler import handle_lead_message

        await handle_lead_message(
            project=project,
            sender_phone=sender_phone,
            message_id=message_id,
            message_type=message_type,
            message=message,
        )
