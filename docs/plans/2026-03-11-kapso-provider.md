# Kapso WhatsApp Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Kapso as a fourth WhatsApp provider option with embedded onboarding UI in `/configuracion`.

**Architecture:** Implement `KapsoProvider` following the existing `WhatsAppProvider` Protocol. Kapso uses a single platform-level `KAPSO_API_KEY` (no per-customer credentials). Customers connect their WhatsApp via a Kapso setup link. A dedicated `/webhook/kapso` endpoint handles both incoming messages (Meta-format forwarding) and onboarding callbacks. Frontend gets a new `/configuracion` page with a Canales WhatsApp tab.

**Tech Stack:** FastAPI + asyncpg (backend), Next.js 16 + Tailwind CSS 4 + shadcn/ui (frontend), Kapso REST API at `https://api.kapso.ai/meta/whatsapp`.

---

### Task 1: Migration 029 — Update CHECK constraints

**Files:**
- Create: `migrations/029_kapso_provider.sql`

**Step 1: Create migration file**

```sql
-- migrations/029_kapso_provider.sql
-- Add 'kapso' and 'ycloud' to provider constraints in tenant_channels and processed_messages.
-- Note: 'ycloud' was already implemented in code but missing from the DB constraint.

ALTER TABLE tenant_channels
  DROP CONSTRAINT tenant_channels_provider_check,
  ADD CONSTRAINT tenant_channels_provider_check
    CHECK (provider IN ('twilio', 'meta', 'ycloud', 'kapso'));

ALTER TABLE processed_messages
  DROP CONSTRAINT processed_messages_provider_check,
  ADD CONSTRAINT processed_messages_provider_check
    CHECK (provider IN ('twilio', 'meta', 'ycloud', 'kapso'));

-- Index for Kapso lookup by phone_number_id (same as Meta, just new provider value)
-- The existing idx_tenant_channels_phone_id already covers this since it's on (phone_number_id, provider)
```

**Step 2: Apply migration to local DB**

```bash
psql $DATABASE_URL -f migrations/029_kapso_provider.sql
```

Expected: `ALTER TABLE` twice, no errors.

**Step 3: Commit**

```bash
git add migrations/029_kapso_provider.sql
git commit -m "feat: migration 029 — add kapso (and ycloud) to provider CHECK constraints"
```

---

### Task 2: Config — add KAPSO_API_KEY

**Files:**
- Modify: `app/config.py:19-34`

**Step 1: Add the setting**

In `app/config.py`, after the `ycloud_webhook_secret` line, add:

```python
    # Kapso WhatsApp Platform API
    kapso_api_key: str = ""
    kapso_webhook_secret: str = ""  # for verifying onboarding callbacks
```

**Step 2: Add to .env (local dev)**

In `.env`, add:
```
KAPSO_API_KEY=your_kapso_api_key_here
KAPSO_WEBHOOK_SECRET=
```

**Step 3: Commit**

```bash
git add app/config.py
git commit -m "feat: add KAPSO_API_KEY and KAPSO_WEBHOOK_SECRET to config"
```

---

### Task 3: KapsoProvider — new provider class

**Files:**
- Create: `app/modules/whatsapp/providers/kapso.py`

**Step 1: Create the provider**

```python
"""
Kapso WhatsApp provider.

Kapso acts as a managed layer on top of Meta's WhatsApp Cloud API.
Key difference from MetaProvider: no per-tenant access_token is needed.
All API calls are authenticated with the platform-level KAPSO_API_KEY.
Kapso forwards incoming webhooks in Meta format — so parse_webhook() reuses
the existing MetaProvider parsing logic unchanged.

Sending endpoint: POST https://api.kapso.ai/meta/whatsapp/messages/send-a-message
Auth header: x-api-key: <KAPSO_API_KEY>
"""

import httpx
from fastapi import Request
from .base import IncomingMessage, TenantChannel

KAPSO_API_BASE = "https://api.kapso.ai/meta/whatsapp"


def _api_key() -> str:
    from app.config import get_settings
    return get_settings().kapso_api_key


class KapsoProvider:
    def __init__(self, channel: TenantChannel):
        self.channel = channel

    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        """Kapso forwards Meta-format payloads — reuse Meta parser."""
        from app.modules.whatsapp.providers.meta import parse_webhook as _parse
        return await _parse(request)

    async def verify_webhook(self, hub_mode, hub_verify_token, hub_challenge) -> str | None:
        return None  # Kapso handles Meta verification internally

    async def send_text(self, to: str, text: str) -> dict:
        headers = {"x-api-key": _api_key(), "Content-Type": "application/json"}
        payload = {
            "phoneNumberId": self.channel.phone_number_id,
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{KAPSO_API_BASE}/messages/send-a-message",
                json=payload,
                headers=headers,
            )
            return response.json()

    async def send_document(self, to: str, document_url: str, filename: str, caption: str | None = None) -> dict:
        headers = {"x-api-key": _api_key(), "Content-Type": "application/json"}
        doc_payload: dict = {"link": document_url, "filename": filename}
        if caption:
            doc_payload["caption"] = caption
        payload = {
            "phoneNumberId": self.channel.phone_number_id,
            "to": to,
            "type": "document",
            "document": doc_payload,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{KAPSO_API_BASE}/messages/send-a-message",
                json=payload,
                headers=headers,
            )
            return response.json()

    async def send_image(self, to: str, image_url: str, caption: str | None = None) -> dict:
        headers = {"x-api-key": _api_key(), "Content-Type": "application/json"}
        img_payload: dict = {"link": image_url}
        if caption:
            img_payload["caption"] = caption
        payload = {
            "phoneNumberId": self.channel.phone_number_id,
            "to": to,
            "type": "image",
            "image": img_payload,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{KAPSO_API_BASE}/messages/send-a-message",
                json=payload,
                headers=headers,
            )
            return response.json()

    async def download_media(self, media_id: str | None = None, media_url: str | None = None) -> bytes:
        """Kapso forwards Meta-format media — same as MetaProvider but using platform key."""
        headers = {"x-api-key": _api_key()}
        async with httpx.AsyncClient() as client:
            if not media_url and media_id:
                # Resolve media URL from Kapso (Meta-compatible endpoint)
                url_resp = await client.get(
                    f"{KAPSO_API_BASE}/{media_id}",
                    headers=headers,
                )
                media_url = url_resp.json().get("url")
            response = await client.get(media_url, headers=headers)
            return response.content
```

**Step 2: Commit**

```bash
git add app/modules/whatsapp/providers/kapso.py
git commit -m "feat: KapsoProvider — WhatsApp provider via Kapso platform API"
```

---

### Task 4: Factory — register KapsoProvider

**Files:**
- Modify: `app/modules/whatsapp/providers/factory.py:162-170`

**Step 1: Import and register**

Add at the top of `factory.py` after the existing imports (the `KapsoProvider` class lives in its own file, imported lazily like the others):

In the `get_provider` function (lines 162–170), change:

```python
def get_provider(channel: TenantChannel) -> TwilioProvider | MetaProvider | YCloudProvider:
    """Return a tenant-aware provider instance for the given channel."""
    if channel.provider == "twilio":
        return TwilioProvider(channel)
    elif channel.provider == "meta":
        return MetaProvider(channel)
    elif channel.provider == "ycloud":
        return YCloudProvider(channel)
    raise ValueError(f"Unknown provider: {channel.provider!r}")
```

to:

```python
def get_provider(channel: TenantChannel) -> TwilioProvider | MetaProvider | YCloudProvider:
    """Return a tenant-aware provider instance for the given channel."""
    if channel.provider == "twilio":
        return TwilioProvider(channel)
    elif channel.provider == "meta":
        return MetaProvider(channel)
    elif channel.provider == "ycloud":
        return YCloudProvider(channel)
    elif channel.provider == "kapso":
        from app.modules.whatsapp.providers.kapso import KapsoProvider
        return KapsoProvider(channel)
    raise ValueError(f"Unknown provider: {channel.provider!r}")
```

**Step 2: Commit**

```bash
git add app/modules/whatsapp/providers/factory.py
git commit -m "feat: register KapsoProvider in provider factory"
```

---

### Task 5: Dedicated Kapso webhook endpoint

Kapso sends incoming messages to a URL you configure in their dashboard. We give them `/webhook/kapso` (separate from `/webhook` to avoid provider detection ambiguity).

**Files:**
- Modify: `app/modules/whatsapp/webhook.py`

**Step 1: Add the Kapso message webhook route**

Add this new route at the end of `app/modules/whatsapp/webhook.py`:

```python
@router.post("/webhook/kapso")
async def receive_kapso_message(request: Request):
    """Receive incoming WhatsApp messages forwarded by Kapso in Meta format.
    Kapso always forwards to this dedicated endpoint — no provider detection needed."""
    from app.modules.agent.router import resolve_tenant_channel, route_message
    from app.modules.whatsapp.providers.kapso import KapsoProvider

    try:
        body = await request.json()
    except Exception:
        return {"status": "ok"}

    # Extract phone_number_id from Meta-format payload
    try:
        phone_number_id = body["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]
    except (KeyError, IndexError):
        logger.warning("Kapso webhook: could not extract phone_number_id from payload")
        return {"status": "ok"}

    channel = await resolve_tenant_channel(phone_number_id, "kapso")
    if not channel:
        logger.warning("No kapso tenant_channel for phone_number_id=%r", phone_number_id)
        return {"status": "ok"}

    provider_instance = KapsoProvider(channel)
    messages = await provider_instance.parse_webhook(request)
    pool = await get_pool()

    for msg in messages:
        inserted = await pool.fetchval(
            """
            INSERT INTO processed_messages (message_id, provider, organization_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (message_id, provider) DO NOTHING
            RETURNING message_id
            """,
            msg.message_id, "kapso", channel.organization_id,
        )
        if not inserted:
            continue

        logger.info(
            "Incoming [kapso/%s] from %s: type=%s text=%s",
            channel.organization_id[:8], msg.sender_phone,
            msg.message_type, msg.text[:80] if msg.text else "(media)",
        )
        try:
            await route_message(
                channel=channel,
                sender_phone=msg.sender_phone,
                message_id=msg.message_id,
                message_type=msg.message_type,
                message=msg,
            )
        except Exception as e:
            logger.exception("Error processing Kapso message from %s: %s", msg.sender_phone, e)

    return {"status": "ok"}
```

**Step 2: Update `resolve_tenant_channel` to support 'kapso' provider**

In `app/modules/agent/router.py`, find the `resolve_tenant_channel` function. It currently queries `WHERE phone_number_id = $1 AND provider = 'meta'`. Add a `'kapso'` lookup:

Find the block that handles Meta (looks up by `phone_number_id`) and change the provider filter to include `kapso`:

```python
# Before (approximate, check exact line):
row = await pool.fetchrow(
    "SELECT * FROM tenant_channels WHERE phone_number_id = $1 AND provider = 'meta' AND activo = true",
    phone_hint,
)

# After:
row = await pool.fetchrow(
    "SELECT * FROM tenant_channels WHERE phone_number_id = $1 AND provider = $2 AND activo = true",
    phone_hint, provider,
)
```

This makes the lookup provider-aware — when called with `provider='kapso'`, it finds Kapso channels.

**Step 3: Commit**

```bash
git add app/modules/whatsapp/webhook.py app/modules/agent/router.py
git commit -m "feat: dedicated /webhook/kapso endpoint for Kapso message forwarding"
```

---

### Task 6: Admin endpoints — setup link + channel creation

**Files:**
- Modify: `app/admin/api.py`

**Step 1: Update provider validation in `create_tenant_channel`**

Find line 682:
```python
    if body.provider not in ("twilio", "meta"):
        raise HTTPException(400, detail="provider debe ser 'twilio' o 'meta'")
```

Change to:
```python
    if body.provider not in ("twilio", "meta", "ycloud", "kapso"):
        raise HTTPException(400, detail="provider debe ser 'twilio', 'meta', 'ycloud' o 'kapso'")
```

**Step 2: Add Kapso setup-link endpoint and onboarding webhook**

Add these two endpoints after the existing tenant-channels CRUD block (after line 761). Add the Pydantic model near the other models at the top of the file too.

First, find where other request models are defined (near `TenantChannelCreate`) and add:

```python
class KapsoSetupLinkRequest(BaseModel):
    display_name: Optional[str] = None  # optional label for the channel
```

Then add the endpoints:

```python
# --- Kapso Onboarding ---

@router.post("/kapso/setup-link")
async def create_kapso_setup_link(
    body: KapsoSetupLinkRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Generate a Kapso setup link so an org admin can connect their WhatsApp number."""
    import httpx
    from app.config import get_settings

    payload = _require_admin(credentials)
    settings = get_settings()

    if not settings.kapso_api_key:
        raise HTTPException(503, detail="Kapso no está configurado en este entorno")

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role not in ("superadmin", "admin"):
        raise HTTPException(403, detail="Solo admin puede generar setup links")

    # Create setup link in Kapso — passes org_id as metadata for the callback
    kapso_payload = {
        "metadata": {
            "org_id": caller_org,
            "display_name": body.display_name or "",
        }
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.kapso.ai/setup-links",
            json=kapso_payload,
            headers={"x-api-key": settings.kapso_api_key, "Content-Type": "application/json"},
        )
    if resp.status_code not in (200, 201):
        logger.error("Kapso setup-link error: %s %s", resp.status_code, resp.text)
        raise HTTPException(502, detail="Error al crear setup link en Kapso")

    data = resp.json()
    setup_url = data.get("url") or data.get("setupUrl") or data.get("link")
    if not setup_url:
        raise HTTPException(502, detail="Kapso no devolvió URL de setup")

    return {"url": setup_url}


@router.post("/kapso/webhook/onboarding")
async def kapso_onboarding_webhook(request: Request):
    """Kapso calls this endpoint when a customer completes the WhatsApp setup link.
    Auto-creates a tenant_channels record for the organization.
    This endpoint is PUBLIC — verified via payload signature."""
    import hmac, hashlib
    from app.config import get_settings

    settings = get_settings()
    body_bytes = await request.body()

    # Verify signature if secret is configured
    if settings.kapso_webhook_secret:
        sig_header = request.headers.get("x-kapso-signature", "")
        expected = hmac.new(
            settings.kapso_webhook_secret.encode(),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig_header, expected):
            return Response(status_code=403)

    try:
        data = await request.json()
    except Exception:
        return {"status": "ok"}

    # Extract fields from Kapso onboarding callback
    # Kapso sends: { phone_number_id, phone_number, waba_id, metadata: { org_id, display_name } }
    phone_number_id = data.get("phoneNumberId") or data.get("phone_number_id")
    phone_number = data.get("phoneNumber") or data.get("phone_number", "")
    waba_id = data.get("wabaId") or data.get("waba_id")
    metadata = data.get("metadata", {})
    org_id = metadata.get("org_id")
    display_name = metadata.get("display_name") or "WhatsApp (Kapso)"

    if not phone_number_id or not org_id:
        logger.warning("Kapso onboarding webhook missing phone_number_id or org_id: %s", data)
        return {"status": "ok"}

    pool = await get_pool()

    # Upsert the tenant channel — idempotent
    await pool.execute(
        """
        INSERT INTO tenant_channels
            (organization_id, provider, phone_number, display_name, phone_number_id, waba_id, activo)
        VALUES ($1, 'kapso', $2, $3, $4, $5, true)
        ON CONFLICT (organization_id, phone_number, provider)
        DO UPDATE SET
            phone_number_id = EXCLUDED.phone_number_id,
            waba_id = EXCLUDED.waba_id,
            display_name = EXCLUDED.display_name,
            activo = true,
            updated_at = NOW()
        """,
        org_id, phone_number or phone_number_id, display_name, phone_number_id, waba_id,
    )
    logger.info("Kapso onboarding complete: org=%s phone_number_id=%s", org_id, phone_number_id)
    return {"status": "ok"}
```

**Step 3: Commit**

```bash
git add app/admin/api.py
git commit -m "feat: Kapso setup-link endpoint + onboarding webhook auto-creates TenantChannel"
```

---

### Task 7: Frontend — API client types and calls

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add types and functions**

Find the section with tenant channel types. Add these new types and functions at the end of the relevant section:

```typescript
// Kapso
export interface KapsoChannel {
  id: string;
  organization_id: string;
  provider: 'kapso';
  phone_number: string;
  phone_number_id: string;
  display_name: string | null;
  activo: boolean;
  created_at: string;
}

export async function createKapsoSetupLink(displayName?: string): Promise<{ url: string }> {
  return fetcher('/admin/kapso/setup-link', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName ?? null }),
  });
}

export async function getKapsoChannel(): Promise<KapsoChannel | null> {
  const channels: KapsoChannel[] = await fetcher('/admin/tenant-channels');
  return channels.find((c) => c.provider === 'kapso' && c.activo) ?? null;
}

export async function disconnectKapsoChannel(channelId: string): Promise<void> {
  await fetcher(`/admin/tenant-channels/${channelId}`, { method: 'DELETE' });
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: Kapso API client — setup link, get channel, disconnect"
```

---

### Task 8: Frontend — /configuracion page

**Files:**
- Create: `frontend/src/app/configuracion/page.tsx`

**Step 1: Create the page**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Wifi, WifiOff, ExternalLink, Loader2, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { createKapsoSetupLink, getKapsoChannel, disconnectKapsoChannel, KapsoChannel } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'general' | 'canales';

export default function ConfiguracionPage() {
  const { user, orgName } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('canales');
  const [channel, setChannel] = useState<KapsoChannel | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);

  const fetchChannel = useCallback(async () => {
    try {
      const ch = await getKapsoChannel();
      setChannel(ch);
      return ch;
    } catch {
      return null;
    } finally {
      setLoadingChannel(false);
    }
  }, []);

  useEffect(() => {
    fetchChannel();
  }, [fetchChannel]);

  // Poll every 3s while waiting for onboarding callback (max 2 min)
  useEffect(() => {
    if (!polling) return;
    let attempts = 0;
    const MAX = 40; // 40 × 3s = 2 min
    const interval = setInterval(async () => {
      attempts++;
      const ch = await getKapsoChannel();
      if (ch) {
        setChannel(ch);
        setPolling(false);
        setConnecting(false);
        toast.success('¡WhatsApp conectado con éxito!');
        clearInterval(interval);
        return;
      }
      if (attempts >= MAX) {
        setPolling(false);
        setConnecting(false);
        toast.error('No se detectó la conexión. Volvé a intentarlo.');
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await createKapsoSetupLink();
      window.open(url, '_blank', 'noopener,noreferrer');
      setPolling(true);
    } catch {
      toast.error('No se pudo generar el link de conexión');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!channel) return;
    try {
      await disconnectKapsoChannel(channel.id);
      setChannel(null);
      toast.success('Canal desconectado');
    } catch {
      toast.error('Error al desconectar');
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-[#f5f5f7]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Settings size={20} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-gray-900">Configuración</h1>
            <p className="text-sm text-muted-foreground">Administrá tu cuenta y canales</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {(['general', 'canales'] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 capitalize',
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab === 'canales' ? 'Canales WhatsApp' : 'General'}
            </button>
          ))}
        </div>

        {/* Tab: General */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Información de la organización</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Building2 size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{orgName || 'Tu organización'}</p>
                <p className="text-xs text-muted-foreground">Organización activa</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Canales WhatsApp */}
        {activeTab === 'canales' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-gray-900">Canal de WhatsApp</h2>
                <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded-full">vía Kapso</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Conectá el número de WhatsApp de tu organización. Los leads recibirán mensajes desde ese número.
              </p>

              {loadingChannel ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  Verificando conexión...
                </div>
              ) : polling ? (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <Loader2 size={18} className="animate-spin text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Esperando confirmación...</p>
                    <p className="text-xs text-blue-600 mt-0.5">Completá los pasos en la ventana que se abrió. Esto puede demorar un minuto.</p>
                  </div>
                </div>
              ) : channel ? (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Wifi size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-green-900">{channel.phone_number}</p>
                      <p className="text-xs text-green-700 mt-0.5">{channel.display_name || 'Conectado'} · Kapso</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                  >
                    Desconectar
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <WifiOff size={22} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">No hay número conectado</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Conectá tu cuenta de WhatsApp Business. El proceso toma menos de 2 minutos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {connecting ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ExternalLink size={15} />
                    )}
                    Conectar con Kapso
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Check if `orgName` exists in AuthContext — if not, use a fallback**

Run:
```bash
grep -n "orgName\|org_name" frontend/src/contexts/AuthContext.tsx
```

If `orgName` is not exposed, replace `orgName` in the component with a simple fallback:
```tsx
// Replace: orgName || 'Tu organización'
// With: 'Tu organización'
```

**Step 3: Commit**

```bash
git add frontend/src/app/configuracion/page.tsx
git commit -m "feat: /configuracion page with Canales WhatsApp tab and Kapso onboarding UI"
```

---

### Task 9: Frontend — Add Configuración to Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Add Settings to imports and nav**

In `Sidebar.tsx` line 5, add `Settings` to the Lucide import:

```tsx
import { Building2, HardHat, MessageSquare, LogOut, Menu, Bell, Wrench, Users, KeyRound, BookOpen, CreditCard, Settings } from 'lucide-react';
```

**Step 2: Add the nav item**

In the `navItems` array (lines 14–19), add the Configuración entry:

```tsx
const navItems = [
  { href: '/proyectos', label: 'Proyectos', icon: Building2 },
  { href: '/cobranza', label: 'Cobranza', icon: CreditCard },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];
```

**Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add Configuración link to sidebar"
```

---

## Post-Implementation Checklist

1. **Register Kapso webhooks in Kapso dashboard:**
   - Incoming messages: `https://your-api.onrender.com/webhook/kapso`
   - Onboarding callbacks: `https://your-api.onrender.com/admin/kapso/webhook/onboarding`

2. **Add to Render environment variables:**
   - `KAPSO_API_KEY`
   - `KAPSO_WEBHOOK_SECRET` (once Kapso provides it)

3. **Apply migration 029 to Neon DB:**
   ```bash
   psql $NEON_DATABASE_URL -f migrations/029_kapso_provider.sql
   ```

4. **Verify Kapso API payload format:**
   - The `send-a-message` endpoint body uses `phoneNumberId` (camelCase) — confirm with Kapso docs
   - The onboarding webhook payload field names (`phoneNumberId`, `phoneNumber`, `wabaId`, `metadata`) — confirm with Kapso support/docs and adjust `Task 6 Step 2` if needed

5. **Update `SCHEMA_COMPLETO.sql`** with the new constraint changes from migration 029
