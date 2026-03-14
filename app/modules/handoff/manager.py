"""
Handoff Manager: orchestrates the handoff flow between leads and the sales team.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo as _ZoneInfo
    _BA_TZ = _ZoneInfo("America/Argentina/Buenos_Aires")
except Exception:
    _BA_TZ = timezone(timedelta(hours=-3))

from app.database import get_pool
from app.modules.whatsapp.sender import send_text_message

logger = logging.getLogger(__name__)


async def _send_to_lead(lead_phone: str, text: str, org_id: str) -> None:
    """Send a message to a lead using the org's tenant channel (correct provider)."""
    try:
        pool = await get_pool()
        row = await pool.fetchrow(
            "SELECT * FROM tenant_channels WHERE organization_id = $1 AND activo = true LIMIT 1",
            org_id,
        )
        if row:
            from app.modules.whatsapp.providers.base import TenantChannel
            from app.modules.whatsapp.providers.factory import get_provider
            channel = TenantChannel(
                id=str(row["id"]),
                organization_id=str(row["organization_id"]),
                provider=row["provider"],
                phone_number=row["phone_number"],
                phone_number_id=row.get("phone_number_id"),
                account_sid=row.get("account_sid"),
                auth_token=row.get("auth_token"),
                access_token=row.get("access_token"),
                verify_token=row.get("verify_token"),
                waba_id=row.get("waba_id"),
            )
            await get_provider(channel).send_text(lead_phone, text)
        else:
            await send_text_message(lead_phone, text)
    except Exception as exc:
        logger.error("_send_to_lead failed for %s: %s", lead_phone, exc)


async def _send_hitl_notification(org_id: str, lead_name: str, lead_id: str) -> None:
    """Send WhatsApp template to advisor when HITL is activated."""
    try:
        pool = await get_pool()
        channel_row = await pool.fetchrow(
            "SELECT * FROM tenant_channels WHERE organization_id = $1 AND activo = true LIMIT 1",
            org_id,
        )
        if not channel_row or not channel_row.get("notify_phone"):
            return

        notify_phone = channel_row["notify_phone"]
        ba_time = datetime.now(_BA_TZ).strftime("%H:%M")

        provider = channel_row["provider"]
        if provider == "kapso":
            from app.modules.whatsapp.providers.base import TenantChannel
            from app.modules.whatsapp.providers.kapso import KapsoProvider
            tc = TenantChannel(
                id=str(channel_row["id"]),
                organization_id=str(channel_row["organization_id"]),
                provider="kapso",
                phone_number=channel_row["phone_number"],
                phone_number_id=channel_row.get("phone_number_id"),
            )
            await KapsoProvider(tc).send_template(notify_phone, lead_name, lead_id, ba_time)
        elif provider == "twilio":
            from app.config import get_settings
            from app.modules.whatsapp.providers.twilio import send_template
            settings = get_settings()
            account_sid = channel_row.get("account_sid") or settings.twilio_account_sid
            auth_token = channel_row.get("auth_token") or settings.twilio_auth_token
            from_number = channel_row["phone_number"]
            await send_template(notify_phone, account_sid, auth_token, from_number, lead_name, lead_id, ba_time)
    except Exception as exc:
        logger.error("_send_hitl_notification failed: %s", exc)


async def check_active_handoff(phone: str, project_id: str) -> dict | None:
    """Check if a lead has an active handoff (legacy, prefer check_active_handoff_by_phone)."""
    return await check_active_handoff_by_phone(phone)


async def check_active_handoff_by_phone(phone: str) -> dict | None:
    """Check if a lead has an active handoff, searching by phone across all projects."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT h.* FROM handoffs h
        JOIN leads l ON h.lead_id = l.id
        WHERE l.phone = $1 AND h.status = 'active'
        ORDER BY h.started_at DESC
        LIMIT 1
        """,
        phone,
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
    lead = await pool.fetchrow(
        """
        SELECT l.phone, l.project_id, p.organization_id
        FROM leads l
        LEFT JOIN projects p ON p.id = l.project_id
        WHERE l.id = $1
        """,
        lead_id,
    )
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
    if lead.get("phone") and lead.get("organization_id"):
        await _send_to_lead(
            lead["phone"],
            "Un asesor comercial se conectará con vos en breve. ¡Quedá atento!",
            str(lead["organization_id"]),
        )
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
    project_id: str | None,
    trigger: str,
    context_summary: str,
    conversation_history: list[dict] | None = None,
) -> dict:
    """Start a handoff: create record, notify advisor via WhatsApp, message the lead."""
    pool = await get_pool()

    # Resolve project_id from lead if not provided
    if not project_id:
        lead_row = await pool.fetchrow("SELECT project_id FROM leads WHERE id = $1", lead_id)
        project_id = str(lead_row["project_id"]) if lead_row and lead_row["project_id"] else None
    if not project_id:
        logger.error("initiate_handoff: cannot create handoff, no project_id for lead %s", lead_id)
        return {}

    existing = await pool.fetchrow(
        "SELECT id FROM handoffs WHERE lead_id = $1 AND status = 'active'",
        lead_id,
    )
    if existing:
        logger.info("Handoff already active for lead %s", lead_id)
        return dict(existing)

    handoff = await pool.fetchrow(
        """
        INSERT INTO handoffs (lead_id, project_id, trigger, context_summary, status, started_at)
        VALUES ($1, $2, $3, $4, 'active', NOW())
        RETURNING *
        """,
        lead_id, project_id, trigger, context_summary,
    )

    lead = await pool.fetchrow("SELECT phone, name FROM leads WHERE id = $1", lead_id)
    project = await pool.fetchrow("SELECT name FROM projects WHERE id = $1", project_id)

    # Broadcast handoff activation to all connected admins of this org
    project_org = await pool.fetchrow(
        "SELECT organization_id FROM projects WHERE id = $1", project_id
    )
    if project_org:
        org_id = str(project_org["organization_id"])
        if lead:
            await _send_to_lead(
                lead["phone"],
                "Te paso con un asesor comercial. Ya le compartí el contexto de nuestra conversación para que no tengas que repetir nada.",
                org_id,
            )
        from app.core.sse import connection_manager
        asyncio.create_task(
            connection_manager.broadcast(
                org_id,
                "handoff_update",
                {
                    "lead_id": lead_id,
                    "handoff_active": True,
                    "lead_name": lead["name"] or lead["phone"] if lead else "Lead",
                    "lead_phone": lead["phone"] if lead else "",
                    "project_name": project["name"] if project else "",
                    "trigger": trigger,
                },
            )
        )
        # Send WhatsApp notification to advisor if configured
        lead_name_str = (lead["name"] or lead["phone"]) if lead else "Lead"
        await _send_hitl_notification(org_id, lead_name_str, lead_id)

    return dict(handoff)


async def handle_lead_message_during_handoff(handoff: dict, text: str) -> None:
    """No-op: messages during handoff are surfaced via SSE only."""
    pass


async def close_handoff(handoff_id: str, lead_note: str | None = None, send_goodbye: bool = True) -> None:
    """Close a handoff and resume the agent. Set send_goodbye=False when closing due to timeout."""
    pool = await get_pool()

    # Fetch before update to get lead_id and project_id for SSE broadcast
    handoff = await pool.fetchrow("SELECT * FROM handoffs WHERE id = $1", handoff_id)

    await pool.execute(
        """
        UPDATE handoffs
        SET status = 'completed', completed_at = NOW(), lead_note = $2
        WHERE id = $1
        """,
        handoff_id,
        lead_note,
    )

    # Broadcast handoff closure to all connected admins of this tenant
    if handoff:
        lead_project = await pool.fetchrow(
            "SELECT organization_id FROM projects WHERE id = $1", handoff["project_id"]
        )
        if lead_project:
            if send_goodbye:
                lead = await pool.fetchrow("SELECT phone FROM leads WHERE id = $1", handoff["lead_id"])
                if lead:
                    await _send_to_lead(
                        lead["phone"],
                        "Gracias por hablar con nuestro equipo. Si necesitás algo más, seguí escribiéndome.",
                        str(lead_project["organization_id"]),
                    )
            from app.core.sse import connection_manager
            asyncio.create_task(
                connection_manager.broadcast(
                    str(lead_project["organization_id"]),
                    "handoff_update",
                    {
                        "lead_id": str(handoff["lead_id"]),
                        "handoff_active": False,
                        "taken_by": None,
                    },
                )
            )

    logger.info("Handoff %s closed", handoff_id)
