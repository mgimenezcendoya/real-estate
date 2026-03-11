# app/admin/routers/channels.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


class TenantChannelCreate(BaseModel):
    organization_id: Optional[str] = None   # required if superadmin
    provider: str  # 'twilio' | 'meta'
    phone_number: str
    display_name: Optional[str] = None
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    verify_token: Optional[str] = None
    waba_id: Optional[str] = None


class TenantChannelUpdate(BaseModel):
    organization_id: Optional[str] = None
    provider: Optional[str] = None
    display_name: Optional[str] = None
    phone_number: Optional[str] = None
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    verify_token: Optional[str] = None
    waba_id: Optional[str] = None
    activo: Optional[bool] = None


class KapsoSetupLinkRequest(BaseModel):
    display_name: Optional[str] = None


class KapsoConnectRequest(BaseModel):
    phone_number_id: str
    display_phone_number: Optional[str] = None
    business_account_id: Optional[str] = None


class AgentConfigUpdate(BaseModel):
    agent_name: Optional[str] = None
    system_prompt_override: Optional[str] = None
    system_prompt_append: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


@router.get("/tenant-channels")
async def list_tenant_channels(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """List tenant channels. Superadmin sees all, admin sees own org."""
    payload = _require_admin(credentials)
    pool = await get_pool()

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role == "superadmin":
        rows = await pool.fetch(
            """SELECT tc.id, tc.organization_id, tc.provider, tc.phone_number,
                      tc.display_name, tc.phone_number_id, tc.verify_token, tc.waba_id,
                      tc.activo, tc.created_at, tc.updated_at, o.name as org_name
               FROM tenant_channels tc
               JOIN organizations o ON o.id = tc.organization_id
               ORDER BY o.name, tc.provider"""
        )
    else:
        rows = await pool.fetch(
            """SELECT tc.id, tc.organization_id, tc.provider, tc.phone_number,
                      tc.display_name, tc.phone_number_id, tc.verify_token, tc.waba_id,
                      tc.activo, tc.created_at, tc.updated_at, o.name as org_name
               FROM tenant_channels tc
               JOIN organizations o ON o.id = tc.organization_id
               WHERE tc.organization_id = $1
               ORDER BY tc.provider""",
            caller_org
        )
    return [dict(r) for r in rows]


@router.post("/tenant-channels")
async def create_tenant_channel(
    body: TenantChannelCreate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Create a tenant channel. Superadmin can set any org_id; admin creates for own org."""
    payload = _require_admin(credentials)
    pool = await get_pool()

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role not in ("superadmin", "admin"):
        raise HTTPException(403, detail="Solo admin o superadmin pueden crear canales")

    target_org = body.organization_id if caller_role == "superadmin" else caller_org
    if not target_org:
        raise HTTPException(400, detail="organization_id requerido")

    if body.provider not in ("twilio", "meta", "ycloud", "kapso"):
        raise HTTPException(400, detail="provider debe ser 'twilio', 'meta', 'ycloud' o 'kapso'")

    row = await pool.fetchrow(
        """INSERT INTO tenant_channels
           (organization_id, provider, phone_number, display_name,
            account_sid, auth_token, access_token, phone_number_id, verify_token, waba_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *""",
        target_org, body.provider, body.phone_number, body.display_name,
        body.account_sid, body.auth_token, body.access_token,
        body.phone_number_id, body.verify_token, body.waba_id
    )
    logger.info("Tenant channel created id=%s provider=%s org=%s", row["id"], row["provider"], target_org)
    result = dict(row)
    result.pop("auth_token", None)
    result.pop("access_token", None)
    return result


@router.patch("/tenant-channels/{channel_id}")
async def update_tenant_channel(
    channel_id: str,
    body: TenantChannelUpdate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Update a tenant channel."""
    payload = _require_admin(credentials)
    pool = await get_pool()

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    channel = await pool.fetchrow("SELECT * FROM tenant_channels WHERE id = $1", channel_id)
    if not channel:
        raise HTTPException(404)
    if caller_role != "superadmin" and str(channel["organization_id"]) != caller_org:
        raise HTTPException(403)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No hay campos para actualizar")

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await pool.fetchrow(
        f"UPDATE tenant_channels SET {set_clause}, updated_at = NOW() WHERE id = $1 RETURNING *",
        channel_id, *values
    )
    logger.info("Tenant channel updated id=%s fields=%s", channel_id, list(updates.keys()))
    result = dict(row)
    result.pop("auth_token", None)
    result.pop("access_token", None)
    return result


@router.delete("/tenant-channels/{channel_id}")
async def delete_tenant_channel(
    channel_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Soft-delete (deactivate) a tenant channel."""
    payload = _require_admin(credentials)
    pool = await get_pool()

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    channel = await pool.fetchrow("SELECT organization_id FROM tenant_channels WHERE id = $1", channel_id)
    if not channel:
        raise HTTPException(404)
    if caller_role != "superadmin" and str(channel["organization_id"]) != caller_org:
        raise HTTPException(403)

    await pool.execute(
        "UPDATE tenant_channels SET activo = false, updated_at = NOW() WHERE id = $1",
        channel_id
    )
    logger.info("Tenant channel deactivated id=%s", channel_id)
    return {"status": "ok"}


@router.post("/kapso/setup-link")
async def create_kapso_setup_link(
    body: KapsoSetupLinkRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Generate a Kapso setup link so an org admin can connect their WhatsApp number.
    Gets or creates a Kapso customer for the org (using org_id as external_customer_id),
    then creates a setup link with success_redirect_url pointing back to /configuracion."""
    import httpx as _httpx
    from app.config import get_settings

    payload = _require_admin(credentials)
    settings = get_settings()

    if not settings.kapso_api_key:
        raise HTTPException(503, detail="Kapso no está configurado en este entorno")

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role not in ("superadmin", "admin"):
        raise HTTPException(403, detail="Solo admin puede generar setup links")

    pool = await get_pool()
    headers = {"X-API-Key": settings.kapso_api_key, "Content-Type": "application/json"}
    KAPSO_BASE = "https://api.kapso.ai/platform/v1"

    async with _httpx.AsyncClient() as client:
        # --- Get or create Kapso customer for this org ---
        org_row = await pool.fetchrow(
            "SELECT id, name, kapso_customer_id FROM organizations WHERE id = $1", caller_org
        )
        if not org_row:
            raise HTTPException(404, detail="Organización no encontrada")

        kapso_customer_id = org_row["kapso_customer_id"]

        if not kapso_customer_id:
            # Check if already exists in Kapso by external_customer_id
            lookup = await client.get(
                f"{KAPSO_BASE}/customers",
                params={"external_customer_id": caller_org},
                headers=headers,
            )
            existing = lookup.json().get("data", [])
            if existing:
                kapso_customer_id = existing[0]["id"]
            else:
                # Create new customer
                create_resp = await client.post(
                    f"{KAPSO_BASE}/customers",
                    json={"customer": {"name": org_row["name"], "external_customer_id": caller_org}},
                    headers=headers,
                )
                if create_resp.status_code not in (200, 201):
                    logger.error("Kapso create customer error: %s %s", create_resp.status_code, create_resp.text)
                    raise HTTPException(502, detail="Error al crear customer en Kapso")
                kapso_customer_id = create_resp.json()["data"]["id"]

            # Persist the kapso_customer_id
            await pool.execute(
                "UPDATE organizations SET kapso_customer_id = $1 WHERE id = $2",
                kapso_customer_id, caller_org,
            )

        # --- Create setup link ---
        setup_resp = await client.post(
            f"{KAPSO_BASE}/customers/{kapso_customer_id}/setup_links",
            json={"setup_link": {
                "success_redirect_url": "https://realia.up.railway.app/configuracion",
                "language": "es",
            }},
            headers=headers,
        )

    if setup_resp.status_code not in (200, 201):
        logger.error("Kapso setup-link error: %s %s", setup_resp.status_code, setup_resp.text)
        raise HTTPException(502, detail="Error al crear setup link en Kapso")

    setup_url = setup_resp.json().get("data", {}).get("url")
    if not setup_url:
        raise HTTPException(502, detail="Kapso no devolvió URL de setup")

    return {"url": setup_url}


@router.post("/kapso/connect")
async def kapso_connect(
    body: KapsoConnectRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Called by frontend after customer completes setup link (success_redirect_url).
    Receives phone_number_id and display_phone_number from Kapso query params,
    creates the TenantChannel for the authenticated org."""
    payload = _require_admin(credentials)
    caller_org = payload.get("organization_id")

    phone_number_id = body.phone_number_id
    phone_number = body.display_phone_number or phone_number_id
    waba_id = body.business_account_id

    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO tenant_channels
            (organization_id, provider, phone_number, display_name, phone_number_id, waba_id, activo)
        VALUES ($1, 'kapso', $2, $3, $4, $5, true)
        ON CONFLICT (organization_id, phone_number, provider)
        DO UPDATE SET
            phone_number_id = EXCLUDED.phone_number_id,
            waba_id = EXCLUDED.waba_id,
            activo = true,
            updated_at = NOW()
        """,
        caller_org, phone_number, "WhatsApp (Kapso)", phone_number_id, waba_id,
    )
    logger.info("Kapso channel connected: org=%s phone_number_id=%s", caller_org, phone_number_id)
    return {"status": "ok"}


@router.post("/kapso/webhook/onboarding")
async def kapso_onboarding_webhook(request: Request):
    """Kapso calls this endpoint when a customer completes the WhatsApp setup link.
    Auto-creates a tenant_channels record for the organization."""
    import hmac as _hmac
    import hashlib as _hashlib
    from app.config import get_settings

    settings = get_settings()
    body_bytes = await request.body()

    if settings.kapso_webhook_secret:
        sig_header = request.headers.get("X-Webhook-Signature", "")
        expected = _hmac.new(
            settings.kapso_webhook_secret.encode(),
            body_bytes,
            _hashlib.sha256,
        ).hexdigest()
        if not _hmac.compare_digest(sig_header, expected):
            from fastapi.responses import Response
            return Response(status_code=403)

    try:
        import json as _json
        data = _json.loads(body_bytes)
    except Exception:
        return {"status": "ok"}

    # Real Kapso webhook payload: { phone_number_id, customer: { id }, project: { id } }
    phone_number_id = data.get("phone_number_id")
    kapso_customer_id = (data.get("customer") or {}).get("id")

    if not phone_number_id or not kapso_customer_id:
        logger.warning("Kapso webhook missing fields: %s", data)
        return {"status": "ok"}

    pool = await get_pool()

    # Look up org by kapso_customer_id
    org_row = await pool.fetchrow(
        "SELECT id, name FROM organizations WHERE kapso_customer_id = $1", kapso_customer_id
    )
    if not org_row:
        logger.warning("Kapso webhook: no org found for kapso_customer_id=%r", kapso_customer_id)
        return {"status": "ok"}

    org_id = str(org_row["id"])

    await pool.execute(
        """
        INSERT INTO tenant_channels
            (organization_id, provider, phone_number, display_name, phone_number_id, activo)
        VALUES ($1, 'kapso', $2, $3, $4, true)
        ON CONFLICT (organization_id, phone_number, provider)
        DO UPDATE SET
            phone_number_id = EXCLUDED.phone_number_id,
            activo = true,
            updated_at = NOW()
        """,
        org_id, phone_number_id, "WhatsApp (Kapso)", phone_number_id,
    )
    logger.info("Kapso webhook: channel connected org=%s phone_number_id=%s", org_id, phone_number_id)
    return {"status": "ok"}


@router.get("/agent-config")
async def get_agent_config_endpoint(
    org_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Get agent config for org. Superadmin can pass ?org_id=. Others get own org."""
    payload = _require_admin(credentials)
    pool = await get_pool()

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    target_org = org_id if (caller_role == "superadmin" and org_id) else caller_org

    row = await pool.fetchrow(
        "SELECT * FROM agent_configs WHERE organization_id = $1", target_org
    )
    if not row:
        # Return defaults (no row yet — config_loader handles this in runtime too)
        return {
            "organization_id": target_org,
            "agent_name": "Asistente",
            "system_prompt_override": None,
            "system_prompt_append": None,
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 800,
            "temperature": 0.7,
        }
    return dict(row)


@router.patch("/agent-config")
async def update_agent_config_endpoint(
    body: AgentConfigUpdate,
    org_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Upsert agent config for org."""
    payload = _require_admin(credentials)
    pool = await get_pool()

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role not in ("superadmin", "admin"):
        raise HTTPException(403)

    target_org = org_id if (caller_role == "superadmin" and org_id) else caller_org

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    if not updates:
        raise HTTPException(400, "No hay campos para actualizar")

    # Validate temperature if provided
    if "temperature" in updates and not (0.0 <= updates["temperature"] <= 2.0):
        raise HTTPException(400, "temperature debe estar entre 0.0 y 2.0")
    _ALLOWED_MODELS = {"claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"}
    if "model" in updates and updates["model"] not in _ALLOWED_MODELS:
        raise HTTPException(400, f"model no válido. Opciones: {', '.join(sorted(_ALLOWED_MODELS))}")
    if "max_tokens" in updates and not (100 <= updates["max_tokens"] <= 4096):
        raise HTTPException(400, "max_tokens debe estar entre 100 y 4096")

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())

    row = await pool.fetchrow(
        f"""INSERT INTO agent_configs (organization_id, {', '.join(updates.keys())})
            VALUES ($1, {', '.join(f'${i+2}' for i in range(len(updates)))})
            ON CONFLICT (organization_id) DO UPDATE SET {set_clause}, updated_at = NOW()
            RETURNING *""",
        target_org, *values
    )
    logger.info("Agent config updated org=%s fields=%s", target_org, list(updates.keys()))
    return dict(row)
