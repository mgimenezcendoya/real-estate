"""
Role Router: determines if an incoming message is from a lead or an authorized developer.
Routes to the appropriate handler based on the sender's phone number.
"""

from app.database import get_pool
from app.modules.whatsapp.providers.base import IncomingMessage


async def get_authorized_number(phone: str, developer_id: str) -> dict | None:
    """Check if a phone number is authorized for any project of this developer."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT an.id, an.phone, an.project_id, an.role, an.name, an.status, an.activation_code
        FROM authorized_numbers an
        JOIN projects p ON p.id = an.project_id
        WHERE an.phone = $1 AND p.developer_id = $2
        LIMIT 1
        """,
        phone,
        developer_id,
    )
    return dict(row) if row else None


async def resolve_developer(phone_number_id: str) -> dict | None:
    """Resolve the developer from an incoming WhatsApp number.

    In dev (Twilio sandbox), ACTIVE_DEVELOPER_ID overrides lookup.
    In production, we find the project by whatsapp_number then get its developer.
    Returns: {developer_id, developer_name, default_project_id, default_project_name}
    """
    from app.config import get_settings
    settings = get_settings()
    pool = await get_pool()

    if settings.active_developer_id:
        dev = await pool.fetchrow(
            "SELECT id, name FROM developers WHERE id = $1",
            settings.active_developer_id,
        )
        if not dev:
            return None
        proj = await pool.fetchrow(
            "SELECT id, name FROM projects WHERE developer_id = $1 AND status = 'active' ORDER BY name LIMIT 1",
            str(dev["id"]),
        )
        return {
            "developer_id": str(dev["id"]),
            "developer_name": dev["name"],
            "default_project_id": str(proj["id"]) if proj else None,
            "default_project_name": proj["name"] if proj else None,
        }

    proj = await pool.fetchrow(
        "SELECT id, name, developer_id FROM projects WHERE whatsapp_number = $1 AND status = 'active'",
        phone_number_id,
    )
    if not proj:
        return None

    dev = await pool.fetchrow("SELECT id, name FROM developers WHERE id = $1", str(proj["developer_id"]))
    return {
        "developer_id": str(dev["id"]),
        "developer_name": dev["name"],
        "default_project_id": str(proj["id"]),
        "default_project_name": proj["name"],
    }


async def route_message(
    phone_number_id: str,
    sender_phone: str,
    message_id: str,
    message_type: str,
    message: IncomingMessage,
) -> None:
    """Main entry point: route a WhatsApp message to Lead or Developer handler.

    Uses DEV_PHONE env var to determine if the sender is a developer.
    When DEV_PHONE is set and matches, routes to dev_handler.
    When DEV_PHONE is empty or doesn't match, checks authorized_numbers table.
    """
    from app.config import get_settings
    settings = get_settings()

    developer = await resolve_developer(phone_number_id)
    if not developer:
        return

    developer_id = developer["developer_id"]

    is_dev = False
    auth = None

    if settings.dev_phone and sender_phone == settings.dev_phone:
        is_dev = True
        auth = await get_authorized_number(sender_phone, developer_id)
    elif not settings.dev_phone:
        auth = await get_authorized_number(sender_phone, developer_id)
        if auth and auth["status"] == "active":
            is_dev = True

    if is_dev and auth:
        if auth["status"] == "pending":
            from app.modules.agent.dev_handler import handle_activation_code
            await handle_activation_code(auth_number=auth, message=message)
        else:
            from app.modules.agent.dev_handler import handle_developer_message
            await handle_developer_message(
                auth_number=auth,
                developer=developer,
                message_id=message_id,
                message_type=message_type,
                message=message,
            )
    else:
        from app.modules.agent.lead_handler import handle_lead_message
        await handle_lead_message(
            developer=developer,
            sender_phone=sender_phone,
            message_id=message_id,
            message_type=message_type,
            message=message,
        )
