"""
Role Router: determines if an incoming message is from a lead or an authorized developer.
Routes to the appropriate handler based on the sender's phone number.
Supports role toggle: developers can switch to lead mode for testing.
"""

import logging

from app.database import get_pool
from app.modules.agent.session import get_test_mode, set_test_mode
from app.modules.handoff.manager import check_active_handoff_by_phone
from app.modules.whatsapp.providers.base import IncomingMessage, TenantChannel

logger = logging.getLogger(__name__)


async def get_authorized_number(phone: str, developer_id: str) -> dict | None:
    """Check if a phone number is authorized for any project of this developer."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT an.id, an.phone, an.project_id, an.role, an.name, an.status, an.activation_code
        FROM authorized_numbers an
        JOIN projects p ON p.id = an.project_id
        WHERE an.phone = $1 AND p.organization_id = $2
        LIMIT 1
        """,
        phone,
        developer_id,
    )
    return dict(row) if row else None


async def resolve_tenant_channel(phone_hint: str, provider: str) -> TenantChannel | None:
    """
    Resolve the TenantChannel for an incoming message.

    For production: looks up tenant_channels by phone_number (Twilio) or phone_number_id (Meta).
    For dev: if ACTIVE_DEVELOPER_ID is set, returns a synthetic TenantChannel from env vars.
    """
    from app.config import get_settings
    settings = get_settings()
    pool = await get_pool()

    # Dev shortcut: single-tenant mode via ACTIVE_DEVELOPER_ID env var
    if settings.active_developer_id:
        dev = await pool.fetchrow(
            "SELECT id, name FROM organizations WHERE id = $1",
            settings.active_developer_id,
        )
        if not dev:
            return None
        # Build synthetic TenantChannel from env vars (for local dev only)
        if provider == "twilio":
            return TenantChannel(
                id="dev-synthetic",
                organization_id=str(dev["id"]),
                provider="twilio",
                phone_number=settings.twilio_whatsapp_number or phone_hint,
                account_sid=settings.twilio_account_sid,
                auth_token=settings.twilio_auth_token,
            )
        else:
            return TenantChannel(
                id="dev-synthetic",
                organization_id=str(dev["id"]),
                provider="meta",
                phone_number=settings.whatsapp_phone_number_id or phone_hint,
                phone_number_id=settings.whatsapp_phone_number_id,
                access_token=settings.whatsapp_token,
                verify_token=settings.whatsapp_verify_token,
            )

    # Production: lookup from tenant_channels table
    if provider == "meta":
        row = await pool.fetchrow(
            """SELECT id, organization_id, provider, phone_number, display_name,
                      account_sid, auth_token, access_token, phone_number_id, verify_token, waba_id
               FROM tenant_channels
               WHERE phone_number_id = $1 AND provider = 'meta' AND activo = true""",
            phone_hint,
        )
    elif provider == "ycloud":
        row = await pool.fetchrow(
            """SELECT id, organization_id, provider, phone_number, display_name,
                      account_sid, auth_token, access_token, phone_number_id, verify_token, waba_id
               FROM tenant_channels
               WHERE waba_id = $1 AND provider = 'ycloud' AND activo = true""",
            phone_hint,
        )
    else:
        row = await pool.fetchrow(
            """SELECT id, organization_id, provider, phone_number, display_name,
                      account_sid, auth_token, access_token, phone_number_id, verify_token, waba_id
               FROM tenant_channels
               WHERE phone_number = $1 AND provider = 'twilio' AND activo = true""",
            phone_hint,
        )

    if not row:
        return None

    return TenantChannel(
        id=str(row["id"]),
        organization_id=str(row["organization_id"]),
        provider=row["provider"],
        phone_number=row["phone_number"],
        display_name=row.get("display_name"),
        account_sid=row.get("account_sid"),
        auth_token=row.get("auth_token"),
        access_token=row.get("access_token"),
        phone_number_id=row.get("phone_number_id"),
        verify_token=row.get("verify_token"),
        waba_id=row.get("waba_id"),
    )


async def route_message(
    channel: TenantChannel,
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
    pool = await get_pool()

    developer_id = channel.organization_id

    # Fetch org name and default project to build the developer dict
    dev = await pool.fetchrow(
        "SELECT id, name FROM organizations WHERE id = $1",
        developer_id,
    )
    if not dev:
        return

    proj = await pool.fetchrow(
        "SELECT id, name FROM projects WHERE organization_id = $1 AND status = 'active' AND deleted_at IS NULL ORDER BY name LIMIT 1",
        developer_id,
    )

    developer = {
        "developer_id": developer_id,
        "developer_name": dev["name"],
        "default_project_id": str(proj["id"]) if proj else None,
        "default_project_name": proj["name"] if proj else None,
    }

    is_dev = False
    auth = None

    if settings.dev_phone and sender_phone == settings.dev_phone:
        is_dev = True
        auth = await get_authorized_number(sender_phone, developer_id)
    elif not settings.dev_phone:
        auth = await get_authorized_number(sender_phone, developer_id)
        if auth and auth["status"] == "active":
            is_dev = True

    text = (message.text or "").strip().lower()
    if is_dev and auth and auth["status"] == "active":
        in_test_mode = await get_test_mode(sender_phone)
        toggle = _check_role_toggle(in_test_mode, text)
        if toggle == "to_lead":
            from app.modules.whatsapp.sender import send_text_message
            await set_test_mode(sender_phone, True)
            logger.info("Developer %s switched to LEAD test mode", sender_phone)
            await send_text_message(
                to=sender_phone,
                text="🔄 *Modo Test Lead activado*\n\nAhora te respondo como si fueras un usuario. "
                     "Para volver al modo admin escribí *modo admin*.",
            )
            return
        if toggle == "to_admin":
            from app.modules.whatsapp.sender import send_text_message
            await set_test_mode(sender_phone, False)
            logger.info("Developer %s switched back to ADMIN mode", sender_phone)
            dev_name = auth["name"] or "Developer"
            await send_text_message(
                to=sender_phone,
                text=f"🔧 *Modo Admin — {dev_name}*\n\nVolviste al modo admin. ¿Qué necesitás?",
            )
            return

        if in_test_mode:
            is_dev = False
        else:
            # If the admin's phone also has an active lead handoff (e.g. testing by
            # receiving a panel message on their own phone), treat as lead so their
            # reply is saved to the conversation and forwarded to the handoff.
            handoff = await check_active_handoff_by_phone(sender_phone)
            if handoff:
                is_dev = False

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
            channel=channel,
        )


def _check_role_toggle(in_test_mode: bool, text: str) -> str | None:
    """Detect role switch commands. Returns 'to_lead', 'to_admin', or None."""
    lead_keywords = ["modo usuario", "modo lead", "modo test", "modo cliente", "ser usuario", "ser lead", "test mode"]
    admin_keywords = ["modo admin", "modo developer", "modo dev", "volver admin", "volver a admin", "admin mode"]

    if not in_test_mode:
        if any(kw in text for kw in lead_keywords):
            return "to_lead"
    else:
        if any(kw in text for kw in admin_keywords):
            return "to_admin"
    return None
