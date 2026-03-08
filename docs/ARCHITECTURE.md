# Realia — Arquitectura SaaS Multi-Tenant

> Documento generado post-análisis del código fuente. Sirve como referencia de diseño durante la migración.

---

## 1. Diagnóstico del estado actual

### Stack actual

- **Backend:** FastAPI + asyncpg (sin ORM) + PostgreSQL (Neon, con pgvector)
- **AI:** Claude Haiku 4.5 via Anthropic API con RAG directo (PDFs base64 en context window)
- **Mensajería:** Twilio (dev) + Meta Cloud API (prod), abstracción base ya existe
- **Storage:** S3-compatible (Supabase/Cloudflare R2), org-jerárquico desde M021
- **Auth:** JWT HS256 + bcrypt, RBAC con 5 roles
- **Frontend:** Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui

### Qué tan lejos está del objetivo multi-tenant

El sistema está **60-70% del camino**. La infraestructura de organizaciones, usuarios y aislamiento de datos ya existe (M016-M017). Los problemas son en la capa de mensajería y el motor del agente.

| Capa | Estado | Brecha |
|------|--------|--------|
| DB: organizaciones, proyectos, leads | ✅ multi-tenant | — |
| Auth: JWT con organization_id, RBAC | ✅ multi-tenant | — |
| API admin: scoped por org | ✅ multi-tenant | — |
| Storage S3: jerarquía orgs/{id}/... | ✅ multi-tenant | — |
| Webhook WhatsApp | ❌ single-tenant | Usa `active_developer_id` global de config |
| Routing de mensajes | ❌ single-tenant | No identifica tenant desde número entrante |
| Configuración del agente | ❌ single-tenant | Prompts hardcodeados en `prompts.py` |
| Telegram handoff | ❌ single-tenant | Bot global, no por tenant |
| Canales WhatsApp | ❌ single-tenant | Un número de env vars, no por tenant |

### Cambios más urgentes

1. **Tabla `tenant_channels`:** mapear número de WhatsApp entrante → tenant
2. **Webhook routing:** identificar tenant desde `To` (Twilio) o `phone_number_id` (Meta) en lugar de `active_developer_id`
3. **Configuración del agente por tenant:** tabla `agent_configs` con prompts y personalidad per-tenant
4. **Credenciales por tenant:** mover tokens de WhatsApp de env vars a DB

### Qué está bien hecho y no hay que tocar

- Todo el modelo de datos desde M001 a M027 — robusto, bien indexado
- La abstracción `MessagingProvider` ya existe en `app/modules/whatsapp/providers/` — solo necesita credenciales por tenant
- El patrón de handoff atómico (`SELECT FOR UPDATE`) — correcto y seguro
- La arquitectura SSE para inbox — lista para multi-tenant (ya scopea por `organization_id`)
- El pattern de audit log en `M026` — mantener y extender
- S3 org-jerárquico — ya está bien diseñado

### Anti-patrones encontrados

1. **`active_developer_id` en config.py:** Fuerza single-tenant. Todo el routing pasa por un developer fijo. Fix: lookup desde `tenant_channels` por número entrante.
2. **Prompts hardcodeados en `prompts.py`:** `LEAD_SYSTEM_PROMPT` es global. Fix: tabla `agent_configs` con prompts por tenant.
3. **Credenciales WhatsApp en env vars:** `whatsapp_token`, `whatsapp_phone_number_id` únicos globales. Fix: tabla `tenant_channels` con credenciales encriptadas por registro.
4. **Fallback auth con env vars (ADMIN_USERNAME/ADMIN_PASSWORD):** Genera tokens sin `organization_id`. Fix: obsoleted una vez que todos los usuarios estén en DB. Mantener solo para superadmin de emergencia.
5. **Telegram bot global:** `telegram_bot_token` y `telegram_chat_id` únicos. Fix: agregar `telegram_chat_id` a `organizations` o `tenant_channels`.
6. **Sessions sin tenant_id explícito:** La tabla `sessions(phone, project_id)` infiere el tenant via `project → organization_id`. Es correcto pero frágil. Fix: agregar `organization_id` denormalizado o resolver via JOIN al crear.

---

## 2. Arquitectura objetivo

### Diagrama de flujo — mensaje inbound

```
[WhatsApp/Twilio/Meta]
        │
        ▼
[POST /whatsapp/webhook]
        │ validar firma HMAC
        ▼
[ProviderNormalizer]
        │ parse raw payload → IncomingMessage
        ▼
[TenantRouter]
        │ lookup: whatsapp_number → tenant_id
        │ 404 → silent drop
        ▼
[IdempotencyGuard]
        │ check message_id en processed_messages
        │ duplicate → 200 OK sin procesar
        ▼
[HandoffChecker]
        │ ¿hay handoff activo para este phone?
        │ sí → ForwardToHuman (SSE broadcast + Telegram)
        │ no → continúa
        ▼
[ConversationOrchestrator]
        │ get/create session
        │ save incoming message
        │ get conversation history (20 msgs)
        ▼
[AgentEngine]
        │ load agent_config para tenant
        │ load RAG documents (PDFs del tenant)
        │ invoke Claude Haiku
        │ extract markers: [HANDOFF:], [ENVIAR_DOC:]
        ▼
[MessagingProvider.send_message(tenant_channel)]
        │ usa credenciales del tenant_channel
        ▼
[WhatsApp → Usuario]
```

### Diagrama de flujo — mensaje outbound (admin manual)

```
[Admin Frontend]
        │ POST /admin/leads/{id}/message
        ▼
[API Admin]
        │ verificar JWT + org scoping
        │ activar handoff si no está activo
        ▼
[ConversationOrchestrator.send_as_human()]
        │ save message (sender_type=human)
        │ broadcast SSE (event: message)
        ▼
[TenantChannelResolver]
        │ get tenant_channel del lead.organization_id
        ▼
[MessagingProvider(channel.provider)]
        │ send_message usando channel.credentials
        ▼
[WhatsApp → Lead]
```

### Cómo cada componente conoce al tenant

- **Webhook inbound:** `TenantRouter` hace `SELECT organization_id FROM tenant_channels WHERE phone_number = $1 AND provider = $2`
- **API admin:** JWT payload contiene `organization_id`; todos los queries usan `WHERE organization_id = $tenant_id`
- **AgentEngine:** recibe `organization_id` explícito; carga `agent_configs` del tenant
- **MessagingProvider:** recibe `TenantChannel` con credenciales del tenant

---

## 3. Multi-tenancy

### Estrategia

Row-level security con `organization_id`. No shared-nothing (un schema por tenant) — demasiado overhead operativo para esta etapa. Un schema PostgreSQL con `organization_id` en todas las tablas relevantes.

### Tablas que necesitan tenant_id y su estado actual

| Tabla | tenant_id | Cómo |
|-------|-----------|------|
| `organizations` | — | Es la tabla de tenants |
| `users` | ✅ `organization_id` FK | Directo |
| `projects` | ✅ `organization_id` FK | Directo |
| `units` | via `project_id → projects.organization_id` | Indirecto — OK |
| `leads` | via `project_id → projects.organization_id` | Indirecto — OK |
| `conversations` | via `lead_id → leads → projects` | Indirecto — OK |
| `sessions` | via `project_id → projects.organization_id` | Indirecto — OK |
| `reservations` | via `project_id` | Indirecto — OK |
| `payment_plans` | via `reservation_id` | Indirecto — OK |
| `payment_installments` | via `payment_plan_id` | Indirecto — OK |
| `payment_records` | via `installment_id` | Indirecto — OK |
| `facturas` | via `project_id` | Indirecto — OK |
| `handoffs` | via `lead_id` + `project_id` | Indirecto — OK |
| `authorized_numbers` | via `project_id` | Indirecto — OK |
| `audit_log` | via `project_id` | Indirecto — OK |
| `tenant_channels` | ✅ `organization_id` FK | Directo — nueva tabla |
| `agent_configs` | ✅ `organization_id` FK | Directo — nueva tabla |
| `usage_events` | ✅ `organization_id` FK | Directo — nueva tabla |

### Datos globales vs tenant-scoped

**Globales (sin tenant):**
- Exchange rates (tools)
- Audit log (cross-tenant para superadmin)
- Sistema de archivos S3 (jerarquía orgs/{id})

**Tenant-scoped:**
- Todo lo demás

### Prevención de data leaks

**Patrón actual (correcto):** Todos los endpoints admin usan `WHERE organization_id = $tenant_id` extraído del JWT.

**Refuerzo recomendado — middleware de assertion:**

```python
# app/core/tenant_guard.py
from functools import wraps
import asyncpg

def require_tenant_scope(table: str, id_field: str = "organization_id"):
    """Decorador que verifica post-query que todos los resultados son del tenant."""
    def decorator(fn):
        @wraps(fn)
        async def wrapper(*args, tenant_id: str, **kwargs):
            results = await fn(*args, tenant_id=tenant_id, **kwargs)
            if isinstance(results, list):
                for row in results:
                    if row.get(id_field) and str(row[id_field]) != tenant_id:
                        raise RuntimeError(
                            f"TENANT LEAK: {table} row {row.get('id')} "
                            f"belongs to {row[id_field]}, not {tenant_id}"
                        )
            return results
        return wrapper
    return decorator
```

**Anti-patrones comunes en multi-tenancy y cómo evitarlos:**

1. **Query sin WHERE tenant_id:** Todo endpoint que lee datos debe incluir el filter. En endpoints que reciben un ID (ej. `GET /admin/reservation/{id}`), siempre verificar que `reservation.project.organization_id == caller_org_id`.
2. **Caché compartida entre tenants:** El `_pdf_cache` en `retrieval.py` debe keyarse por `(organization_id, document_id)`, no solo `document_id`.
3. **Background tasks sin tenant context:** `asyncio.create_task(_send_document(...))` debe recibir el `organization_id` explícito, no inferirlo de estado global.
4. **SSE broadcast sin scope:** Ya está bien implementado — `connection_manager.broadcast(tenant_id, ...)`.

---

## 4. Abstracción de providers de mensajería

La abstracción ya existe en `app/modules/whatsapp/providers/`. El cambio principal es pasar credenciales por tenant (desde `tenant_channels` DB) en lugar de variables de entorno globales.

```python
# app/providers/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from fastapi import Request


@dataclass
class IncomingMessage:
    sender_phone: str
    message_id: str
    message_type: str  # text | image | audio | document
    text: Optional[str]
    media_url: Optional[str]
    media_mime_type: Optional[str]
    raw_payload: dict


@dataclass
class TenantChannel:
    """Credenciales de un canal de mensajería para un tenant específico."""
    id: str                    # UUID del tenant_channel
    organization_id: str
    provider: str              # twilio | meta
    phone_number: str          # número entrante/saliente
    # Twilio
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    # Meta
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    verify_token: Optional[str] = None


class MessagingProvider(ABC):

    def __init__(self, channel: TenantChannel):
        self.channel = channel

    @abstractmethod
    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        """Parsear payload raw del provider → lista normalizada de mensajes."""
        ...

    @abstractmethod
    async def validate_signature(self, request: Request) -> bool:
        """Verificar autenticidad del webhook (HMAC o token)."""
        ...

    @abstractmethod
    async def send_text(self, to: str, text: str) -> str:
        """Enviar texto. Devuelve message_id del provider."""
        ...

    @abstractmethod
    async def send_document(self, to: str, url: str, filename: str) -> str:
        """Enviar documento (PDF). Devuelve message_id."""
        ...

    @abstractmethod
    async def send_template(self, to: str, template_name: str, params: dict) -> str:
        """Enviar mensaje template (para 24h window)."""
        ...

    @abstractmethod
    async def download_media(self, media_id: str) -> bytes:
        """Descargar media entrante."""
        ...


# app/providers/twilio.py
import hmac, hashlib, base64
from urllib.parse import urlencode
import httpx
from fastapi import Request
from .base import MessagingProvider, IncomingMessage, TenantChannel


class TwilioProvider(MessagingProvider):

    def __init__(self, channel: TenantChannel):
        super().__init__(channel)
        self._client = httpx.AsyncClient(
            auth=(channel.account_sid, channel.auth_token)
        )

    async def validate_signature(self, request: Request) -> bool:
        signature = request.headers.get("X-Twilio-Signature", "")
        body = await request.body()
        form = await request.form()
        params = dict(form)
        url = str(request.url)
        # Twilio signature: HMAC-SHA1 of url + sorted params
        sorted_params = "".join(f"{k}{v}" for k, v in sorted(params.items()))
        expected = base64.b64encode(
            hmac.new(
                self.channel.auth_token.encode(),
                (url + sorted_params).encode(),
                hashlib.sha1
            ).digest()
        ).decode()
        return hmac.compare_digest(signature, expected)

    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        form = await request.form()
        msg_type = form.get("MediaContentType0", "text").split("/")[0]
        return [IncomingMessage(
            sender_phone=form.get("From", "").replace("whatsapp:", ""),
            message_id=form.get("MessageSid", ""),
            message_type="text" if not form.get("MediaUrl0") else msg_type,
            text=form.get("Body"),
            media_url=form.get("MediaUrl0"),
            media_mime_type=form.get("MediaContentType0"),
            raw_payload=dict(form),
        )]

    async def send_text(self, to: str, text: str) -> str:
        resp = await self._client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{self.channel.account_sid}/Messages.json",
            data={
                "From": f"whatsapp:{self.channel.phone_number}",
                "To": f"whatsapp:{to}",
                "Body": text,
            }
        )
        resp.raise_for_status()
        return resp.json()["sid"]

    async def send_document(self, to: str, url: str, filename: str) -> str:
        resp = await self._client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{self.channel.account_sid}/Messages.json",
            data={
                "From": f"whatsapp:{self.channel.phone_number}",
                "To": f"whatsapp:{to}",
                "Body": filename,
                "MediaUrl": url,
            }
        )
        resp.raise_for_status()
        return resp.json()["sid"]

    async def send_template(self, to: str, template_name: str, params: dict) -> str:
        # Twilio content templates via ContentSid
        raise NotImplementedError("Use send_text for Twilio sandbox")

    async def download_media(self, media_id: str) -> bytes:
        # media_id is the full URL for Twilio
        async with httpx.AsyncClient(auth=(self.channel.account_sid, self.channel.auth_token)) as c:
            resp = await c.get(media_id)
            resp.raise_for_status()
            return resp.content


# app/providers/meta.py
import hashlib, hmac
import httpx
from fastapi import Request
from .base import MessagingProvider, IncomingMessage, TenantChannel

META_API_BASE = "https://graph.facebook.com/v19.0"


class MetaWhatsAppProvider(MessagingProvider):

    def __init__(self, channel: TenantChannel):
        super().__init__(channel)
        self._client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {channel.access_token}"}
        )

    async def validate_signature(self, request: Request) -> bool:
        signature = request.headers.get("X-Hub-Signature-256", "")
        body = await request.body()
        expected = "sha256=" + hmac.new(
            self.channel.auth_token.encode() if self.channel.auth_token else b"",
            body,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(signature, expected)

    async def parse_webhook(self, request: Request) -> list[IncomingMessage]:
        data = await request.json()
        messages = []
        for entry in data.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for msg in value.get("messages", []):
                    msg_type = msg.get("type", "text")
                    media = msg.get(msg_type, {}) if msg_type != "text" else {}
                    messages.append(IncomingMessage(
                        sender_phone=msg["from"],
                        message_id=msg["id"],
                        message_type=msg_type,
                        text=msg.get("text", {}).get("body") if msg_type == "text" else None,
                        media_url=None,  # descargado separado con download_media
                        media_mime_type=media.get("mime_type"),
                        raw_payload=msg,
                    ))
        return messages

    async def send_text(self, to: str, text: str) -> str:
        resp = await self._client.post(
            f"{META_API_BASE}/{self.channel.phone_number_id}/messages",
            json={
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": text},
            }
        )
        resp.raise_for_status()
        return resp.json()["messages"][0]["id"]

    async def send_document(self, to: str, url: str, filename: str) -> str:
        resp = await self._client.post(
            f"{META_API_BASE}/{self.channel.phone_number_id}/messages",
            json={
                "messaging_product": "whatsapp",
                "to": to,
                "type": "document",
                "document": {"link": url, "filename": filename},
            }
        )
        resp.raise_for_status()
        return resp.json()["messages"][0]["id"]

    async def send_template(self, to: str, template_name: str, params: dict) -> str:
        components = [
            {"type": "body", "parameters": [{"type": "text", "text": v} for v in params.values()]}
        ] if params else []
        resp = await self._client.post(
            f"{META_API_BASE}/{self.channel.phone_number_id}/messages",
            json={
                "messaging_product": "whatsapp",
                "to": to,
                "type": "template",
                "template": {
                    "name": template_name,
                    "language": {"code": "es_AR"},
                    "components": components,
                },
            }
        )
        resp.raise_for_status()
        return resp.json()["messages"][0]["id"]

    async def download_media(self, media_id: str) -> bytes:
        # Step 1: get media URL
        resp = await self._client.get(f"{META_API_BASE}/{media_id}")
        resp.raise_for_status()
        media_url = resp.json()["url"]
        # Step 2: download
        async with httpx.AsyncClient(
            headers={"Authorization": f"Bearer {self.channel.access_token}"}
        ) as c:
            r = await c.get(media_url)
            r.raise_for_status()
            return r.content


# app/providers/factory.py
from .base import TenantChannel
from .twilio import TwilioProvider
from .meta import MetaWhatsAppProvider


def get_provider(channel: TenantChannel) -> "MessagingProvider":
    if channel.provider == "twilio":
        return TwilioProvider(channel)
    elif channel.provider == "meta":
        return MetaWhatsAppProvider(channel)
    raise ValueError(f"Unknown provider: {channel.provider}")
```

### Migrar un tenant de Twilio a Meta sin downtime

1. Insertar nuevo registro en `tenant_channels` con `provider='meta'`, credenciales Meta, `activo=false`
2. Probar en staging con el `phone_number_id` de Meta
3. Flip atómico: `UPDATE tenant_channels SET activo=true WHERE id=<meta_channel_id>; UPDATE tenant_channels SET activo=false WHERE id=<twilio_channel_id>;` en una transacción
4. El TenantRouter empieza a usar Meta en el próximo mensaje
5. El agente no cambia — recibe el mismo `IncomingMessage` normalizado

---

## 5. Motor conversacional por tenant

### Configuración del agente por tenant

```sql
-- Cada tenant puede personalizar completamente su agente
SELECT * FROM agent_configs WHERE organization_id = $tenant_id;
-- → nombre_agente, system_prompt, tono, reglas_especificas, handoff_triggers
```

El `LEAD_SYSTEM_PROMPT` actual se convierte en la plantilla base. Los tenants pueden sobrescribir:
- `agent_name` — nombre del agente (ej. "Sofía de Remax")
- `system_prompt_override` — prompt completo custom (anula la plantilla)
- `system_prompt_append` — texto adicional al final del prompt base (más común)
- `handoff_triggers` — frases o condiciones que activan handoff
- `personality_notes` — tono, estilo, restricciones específicas del negocio

### Estado de la conversación (sesiones)

El estado se persiste en `sessions(phone, project_id)` — correcto para esta escala. No hay razón para Redis en < 200 tenants con tráfico normal de inmobiliaria.

**Redis solo si:** >10k mensajes/día activos simultáneamente. Para referencia: 200 tenants × 50 leads activos × 1 msg/hora = 10k/día. Borderline — PostgreSQL aguanta bien con `SELECT ... FOR UPDATE SKIP LOCKED` para evitar contención.

### Handoff robusto

El sistema actual es correcto (SELECT FOR UPDATE, timeouts de 4h/2h). La única mejora necesaria es agregar `telegram_chat_id` a `organizations` para que cada tenant tenga su propio canal de notificación.

### Mezcla de contexto entre tenants

Puntos de riesgo y solución:

1. **PDF cache en `retrieval.py`:** `_pdf_cache = {}` es global. Fix: key = `(organization_id, doc_id)`.
2. **ConversationOrchestrator:** Siempre recibe `organization_id` explícito desde el TenantRouter. No hay estado global.
3. **Sessions lookup:** `WHERE phone = $1 AND project_id = $2`. El `project_id` ya scopea al tenant via FK. Correcto.

---

## 6. Schema de base de datos

### Nuevas tablas

```sql
-- Tabla de canales de mensajería por tenant
-- Un tenant puede tener múltiples números/providers
CREATE TABLE tenant_channels (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider        TEXT        NOT NULL CHECK (provider IN ('twilio', 'meta', 'telegram')),
    phone_number    TEXT        NOT NULL,                -- número E.164 (+5491100000000)
    display_name    TEXT,                               -- "Canal principal", "Proyecto Norte"
    -- Twilio credentials
    account_sid     TEXT,
    auth_token_enc  TEXT,                               -- encriptado con APP_SECRET
    -- Meta Cloud API credentials
    access_token_enc TEXT,                              -- encriptado con APP_SECRET
    phone_number_id  TEXT,
    verify_token    TEXT,
    waba_id         TEXT,                               -- WhatsApp Business Account ID
    -- Estado
    activo          BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, phone_number, provider)
);

CREATE INDEX idx_tenant_channels_phone ON tenant_channels (phone_number, provider) WHERE activo = true;
CREATE INDEX idx_tenant_channels_org   ON tenant_channels (organization_id) WHERE activo = true;


-- Configuración del agente por tenant
CREATE TABLE agent_configs (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    agent_name              TEXT        NOT NULL DEFAULT 'Asistente',
    -- Prompt: override anula la plantilla base; append se agrega al final
    system_prompt_override  TEXT,
    system_prompt_append    TEXT,
    personality_notes       TEXT,
    -- Configuración del modelo
    model                   TEXT        NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    max_tokens              INT         NOT NULL DEFAULT 600,
    temperature             FLOAT       NOT NULL DEFAULT 0.7,
    -- Handoff
    handoff_triggers        TEXT[],     -- frases adicionales que activan handoff
    auto_handoff_on_close   BOOLEAN     NOT NULL DEFAULT true,
    -- RAG
    use_rag                 BOOLEAN     NOT NULL DEFAULT true,
    -- Restricciones
    languages               TEXT[]      NOT NULL DEFAULT ARRAY['es'],
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Idempotencia de webhooks
CREATE TABLE processed_messages (
    message_id      TEXT        NOT NULL,
    provider        TEXT        NOT NULL,
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, provider)
);

CREATE INDEX idx_processed_messages_age ON processed_messages (processed_at);
-- TTL manual: DELETE FROM processed_messages WHERE processed_at < NOW() - INTERVAL '48 hours'


-- Tracking de uso para billing
CREATE TABLE usage_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_type      TEXT        NOT NULL CHECK (event_type IN (
                                    'message_inbound',
                                    'message_outbound',
                                    'ai_tokens_input',
                                    'ai_tokens_output',
                                    'handoff_started',
                                    'document_sent',
                                    'media_transcribed'
                                )),
    quantity        BIGINT      NOT NULL DEFAULT 1,   -- tokens para ai_tokens_*, mensajes para el resto
    metadata        JSONB,                             -- lead_id, conversation_id, model, etc.
    billing_period  TEXT        NOT NULL,              -- 'YYYY-MM' para agrupación
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_org_period ON usage_events (organization_id, billing_period);
CREATE INDEX idx_usage_events_type       ON usage_events (organization_id, event_type, billing_period);


-- Métricas de billing mensuales (snapshot para facturación)
CREATE TABLE billing_metrics (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    billing_period  TEXT        NOT NULL,             -- 'YYYY-MM'
    messages_in     INT         NOT NULL DEFAULT 0,
    messages_out    INT         NOT NULL DEFAULT 0,
    ai_tokens_total BIGINT      NOT NULL DEFAULT 0,
    handoffs_total  INT         NOT NULL DEFAULT 0,
    conversations   INT         NOT NULL DEFAULT 0,   -- conversaciones únicas en el período
    plan_slug       TEXT        NOT NULL,             -- 'starter' | 'pro' | 'enterprise'
    overage_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, billing_period)
);
```

### Modificaciones a tablas existentes

```sql
-- Agregar telegram_chat_id a organizations para notificaciones de handoff por tenant
ALTER TABLE organizations
    ADD COLUMN telegram_chat_id TEXT,
    ADD COLUMN plan_slug        TEXT NOT NULL DEFAULT 'starter',
    ADD COLUMN plan_started_at  TIMESTAMPTZ,
    ADD COLUMN trial_ends_at    TIMESTAMPTZ;

-- Agregar channel_id a sessions para trazabilidad
ALTER TABLE sessions
    ADD COLUMN tenant_channel_id UUID REFERENCES tenant_channels(id);

-- Agregar channel_id a handoffs para saber por qué canal llegó el handoff
ALTER TABLE handoffs
    ADD COLUMN tenant_channel_id UUID REFERENCES tenant_channels(id);

-- Índices para queries de cobranza multi-tenant (ya usadas, formalizar)
CREATE INDEX IF NOT EXISTS idx_payment_installments_estado_vencimiento
    ON payment_installments (estado, fecha_vencimiento)
    WHERE estado IN ('pendiente', 'vencido');

CREATE INDEX IF NOT EXISTS idx_leads_project_phone
    ON leads (project_id, phone);
```

---

## 7. Flujo técnico completo — mensaje inbound

```python
# app/modules/whatsapp/webhook.py

@router.post("/whatsapp/webhook")
async def receive_message(request: Request, db=Depends(get_pool)):
    """
    Endpoint único para Twilio y Meta.
    El tenant se identifica por el número entrante (To/phone_number_id).
    """

    # 1. Identificar provider desde headers
    provider_name = _detect_provider(request)  # "twilio" | "meta"

    # 2. Obtener tenant_channel desde el número receptor
    #    Para Twilio: form["To"] = "whatsapp:+1234567890"
    #    Para Meta: JSON body entry[0].changes[0].value.metadata.phone_number_id
    phone_hint = await _extract_phone_hint(request, provider_name)
    channel = await _resolve_tenant_channel(db, phone_hint, provider_name)

    if not channel:
        # Número no registrado — drop silencioso (no revelar existencia)
        return {"status": "ok"}

    # 3. Instanciar provider con credenciales del tenant
    provider = get_provider(channel)

    # 4. Validar firma
    if not await provider.validate_signature(request):
        raise HTTPException(403, "Invalid webhook signature")

    # 5. Parsear mensajes
    messages = await provider.parse_webhook(request)

    # 6. Procesar cada mensaje (en background para responder 200 rápido)
    for msg in messages:
        asyncio.create_task(
            _process_message(channel, msg, db)
        )

    return {"status": "ok"}


async def _process_message(channel: TenantChannel, msg: IncomingMessage, db):
    """
    Proceso completo de un mensaje inbound. Corre en background task.
    """
    # 1. Idempotencia — evitar procesar duplicados
    inserted = await db.fetchval(
        """
        INSERT INTO processed_messages (message_id, provider, organization_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, provider) DO NOTHING
        RETURNING message_id
        """,
        msg.message_id, channel.provider, channel.organization_id
    )
    if not inserted:
        return  # Mensaje ya procesado

    try:
        # 2. Verificar si hay handoff activo
        handoff = await get_active_handoff_by_phone(
            db, msg.sender_phone, channel.organization_id
        )

        if handoff:
            await handle_message_during_handoff(
                db, channel, handoff, msg
            )
            return

        # 3. Verificar si es mensaje de desarrollador (authorized_number)
        is_dev = await is_authorized_number(db, msg.sender_phone, channel.organization_id)
        if is_dev:
            await handle_developer_message(db, channel, msg)
            return

        # 4. Flujo de lead
        await handle_lead_message(db, channel, msg)

    except Exception as e:
        logger.error(
            "Error processing message",
            extra={
                "organization_id": channel.organization_id,
                "message_id": msg.message_id,
                "error": str(e),
            }
        )
        # No re-raise — el webhook ya respondió 200


async def handle_lead_message(db, channel: TenantChannel, msg: IncomingMessage):
    # 1. Get/create session y lead
    session = await get_or_create_session(db, msg.sender_phone, channel)
    lead_id = session["lead_id"]

    # 2. Guardar mensaje entrante
    await save_conversation_message(db, lead_id, "user", "lead", msg.text or "[media]")

    # 3. Broadcast SSE a admins del tenant
    await connection_manager.broadcast(channel.organization_id, "message", {
        "lead_id": str(lead_id),
        "phone": msg.sender_phone,
        "content": msg.text,
        "sender_type": "lead",
        "timestamp": datetime.utcnow().isoformat(),
    })

    # 4. Cargar config del agente para este tenant
    agent_config = await get_agent_config(db, channel.organization_id)

    # 5. Cargar RAG (PDFs del tenant, cacheados por org_id+doc_id)
    doc_blocks = await get_tenant_document_blocks(db, channel.organization_id)

    # 6. Cargar historial (últimos 20 mensajes)
    history = await get_conversation_history(db, lead_id, limit=20)

    # 7. Generar respuesta
    qualification = await get_lead_qualification(db, lead_id)
    response_text = await invoke_agent(
        agent_config=agent_config,
        doc_blocks=doc_blocks,
        history=history,
        user_message=msg.text,
        qualification=qualification,
    )

    # 8. Extraer markers de control
    clean_text, doc_request = _extract_doc_marker(response_text)
    clean_text, handoff_trigger = _extract_handoff_marker(clean_text)

    # 9. Guardar respuesta del agente
    await save_conversation_message(db, lead_id, "assistant", "agent", clean_text)

    # 10. Enviar via provider del tenant
    provider = get_provider(channel)
    await provider.send_text(msg.sender_phone, clean_text)

    # 11. Broadcast SSE
    await connection_manager.broadcast(channel.organization_id, "message", {
        "lead_id": str(lead_id),
        "content": clean_text,
        "sender_type": "agent",
        "timestamp": datetime.utcnow().isoformat(),
    })

    # 12. Tareas no bloqueantes
    asyncio.create_task(_track_usage(db, channel.organization_id, msg, clean_text))
    if doc_request:
        asyncio.create_task(_send_document(db, channel, msg.sender_phone, doc_request))
    if handoff_trigger:
        asyncio.create_task(initiate_handoff(db, lead_id, handoff_trigger, channel))
    asyncio.create_task(_update_qualification(db, lead_id, history + [{"role": "user", "content": msg.text}]))
```

---

## 8. Flujo técnico completo — mensaje outbound

```python
# En app/admin/api.py

@router.post("/admin/leads/{lead_id}/message")
async def send_admin_message(
    lead_id: str,
    body: SendMessageBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    payload = verify_token(credentials.credentials)
    caller_org = payload["organization_id"]

    pool = await get_pool()

    # 1. Verificar que el lead pertenece al org del caller
    lead = await pool.fetchrow(
        """
        SELECT l.*, p.organization_id, p.id as project_id
        FROM leads l
        JOIN projects p ON p.id = l.project_id
        WHERE l.id = $1
        """,
        lead_id
    )
    if not lead or str(lead["organization_id"]) != caller_org:
        raise HTTPException(404, "Lead not found")

    # 2. Obtener el canal activo del tenant (primero Meta, fallback Twilio)
    channel_row = await pool.fetchrow(
        """
        SELECT * FROM tenant_channels
        WHERE organization_id = $1 AND activo = true
        ORDER BY
            CASE provider WHEN 'meta' THEN 0 ELSE 1 END
        LIMIT 1
        """,
        caller_org
    )
    if not channel_row:
        raise HTTPException(503, "No active messaging channel configured")

    channel = TenantChannel(**dict(channel_row))

    # 3. Activar handoff si no está activo
    handoff = await get_active_handoff_by_phone(pool, lead["phone"], caller_org)
    if not handoff:
        # SELECT FOR UPDATE para atomicidad
        async with pool.acquire() as conn:
            async with conn.transaction():
                handoff = await conn.fetchrow(
                    "SELECT * FROM handoffs WHERE lead_id = $1 AND status = 'active' FOR UPDATE",
                    lead_id
                )
                if not handoff:
                    handoff_id = await conn.fetchval(
                        """
                        INSERT INTO handoffs (lead_id, project_id, trigger, status, started_at, last_activity_at)
                        VALUES ($1, $2, 'frontend', 'active', NOW(), NOW())
                        RETURNING id
                        """,
                        lead_id, lead["project_id"]
                    )

    # 4. Guardar mensaje
    user_id = payload.get("user_id")
    user_nombre = payload.get("nombre", "Admin")
    await pool.execute(
        """
        INSERT INTO conversations (lead_id, role, content, sender_type)
        VALUES ($1, 'assistant', $2, 'human')
        """,
        lead_id, body.message
    )

    # 5. Enviar via provider correcto del tenant
    provider = get_provider(channel)
    try:
        msg_id = await provider.send_text(lead["phone"], body.message)
    except Exception as e:
        logger.error("Provider send failed", extra={
            "organization_id": caller_org,
            "provider": channel.provider,
            "lead_id": lead_id,
            "error": str(e),
        })
        raise HTTPException(502, f"Messaging provider error: {str(e)}")

    # 6. Audit log
    await _audit(pool,
        user_id=user_id, user_nombre=user_nombre,
        action="INSERT", table_name="conversations",
        record_id=lead_id, project_id=lead["project_id"],
        details={"message_preview": body.message[:100], "provider": channel.provider}
    )

    # 7. Actualizar last_activity_at del handoff
    if handoff:
        await pool.execute(
            "UPDATE handoffs SET last_activity_at = NOW() WHERE id = $1",
            handoff["id"]
        )

    # 8. Broadcast SSE
    await connection_manager.broadcast(caller_org, "message", {
        "lead_id": lead_id,
        "content": body.message,
        "sender_type": "human",
        "timestamp": datetime.utcnow().isoformat(),
        "sender_name": user_nombre,
    })

    # 9. Track usage
    asyncio.create_task(_track_usage_outbound(pool, caller_org, msg_id))

    return {"status": "sent", "provider_message_id": msg_id}
```

---

## 9. Plan de migración por fases

| Fase | Objetivo | Cambios técnicos | Riesgos | Criterio de done |
|------|----------|-----------------|---------|-----------------|
| **1** | Multi-tenant routing en webhook | Crear `tenant_channels` (DDL). Migrar credenciales actuales (1 registro). Cambiar webhook para resolver tenant desde DB en lugar de `active_developer_id`. Corregir PDF cache key. | Downtime < 5min durante deploy. Si falla el lookup, mensajes dropean silenciosamente. | Webhook funciona con el tenant existente. `active_developer_id` eliminado del código. Tests de integración pasan. |
| **2** | Configuración del agente por tenant | Crear `agent_configs`. Migrar `LEAD_SYSTEM_PROMPT` al registro del tenant existente. Modificar `AgentEngine` para cargar config desde DB. | Regresión en calidad del agente si la migración del prompt es incompleta. | El agente usa prompt desde DB. Cambiar el prompt en DB cambia el comportamiento en < 1 min. |
| **3** | Idempotencia y `processed_messages` | Crear tabla `processed_messages`. Agregar insert-or-skip en webhook antes de procesar. Cron de cleanup de registros > 48h. | Minimal — es puramente aditivo. | Enviar el mismo `message_id` dos veces procesa solo una vez. |
| **4** | Panel de onboarding de tenants | Endpoints CRUD para `tenant_channels` y `agent_configs` (solo superadmin). UI en frontend `/admin/tenants`. Encriptación de `auth_token_enc` / `access_token_enc`. | Exposición de credenciales si la encriptación está mal implementada. | Superadmin puede crear un tenant nuevo con canal WhatsApp en < 5 minutos desde la UI. |
| **5** | Soporte dual Twilio + Meta por tenant | El factory ya existe. Agregar lógica de "canal preferido" (Meta > Twilio). UI para configurar múltiples canales por tenant. | Un tenant puede tener configuración inconsistente (Meta sin credenciales válidas). | Un tenant puede tener 2 canales (Twilio + Meta) y el sistema usa Meta si está disponible. |
| **6** | Usage tracking y billing | Crear `usage_events` y `billing_metrics`. Insertar eventos en `_track_usage()`. Cron mensual que consolida en `billing_metrics`. Dashboard de uso para superadmin. | Volumen de inserts en `usage_events` — necesita TTL o particionado a largo plazo. | Superadmin puede ver mensajes/tokens por tenant por mes. Exportable a CSV. |

---

## 10. Estructura de carpetas (estado objetivo)

Los cambios son **mínimos** — el código actual está bien organizado. Solo se agregan módulos, no se reestructura.

```
app/
├── main.py                    # sin cambios
├── config.py                  # eliminar active_developer_id, whatsapp_* vars globales
├── database.py                # sin cambios
├── admin/
│   ├── api.py                 # agregar endpoints de tenant_channels, agent_configs
│   └── auth.py                # sin cambios
├── core/
│   ├── sse.py                 # sin cambios
│   └── tenant_guard.py        # NUEVO: assert_tenant_scope decorator
├── models/
│   └── ...                    # agregar TenantChannel, AgentConfig pydantic models
├── modules/
│   ├── agent/
│   │   ├── prompts.py         # MODIFICAR: build_system_prompt(agent_config) en lugar de constante
│   │   ├── classifier.py      # sin cambios
│   │   ├── session.py         # sin cambios
│   │   ├── lead_handler.py    # MODIFICAR: recibe channel: TenantChannel en lugar de developer dict
│   │   ├── dev_handler.py     # MODIFICAR: idem
│   │   └── router.py          # MODIFICAR: recibe channel, lookup tenant de DB
│   ├── handoff/
│   │   ├── manager.py         # MODIFICAR: notificar Telegram via organizations.telegram_chat_id
│   │   └── telegram.py        # MODIFICAR: recibe chat_id por parámetro
│   ├── leads/                 # sin cambios
│   ├── rag/
│   │   └── retrieval.py       # MODIFICAR: cache key = (organization_id, doc_id)
│   ├── whatsapp/
│   │   ├── webhook.py         # MODIFICAR: TenantRouter + validate_signature por canal
│   │   ├── sender.py          # DEPRECAR: reemplazado por providers/
│   │   └── providers/
│   │       ├── base.py        # MODIFICAR: IncomingMessage ya existe, agregar TenantChannel
│   │       ├── twilio.py      # MODIFICAR: recibe TenantChannel con credenciales
│   │       ├── meta.py        # MODIFICAR: idem
│   │       └── factory.py     # NUEVO: get_provider(channel) → MessagingProvider
│   ├── storage.py             # sin cambios
│   └── tools/                 # sin cambios
└── services/
    ├── alerts_service.py      # sin cambios
    ├── tenant_service.py      # NUEVO: create_tenant, get_tenant_channel, etc.
    └── usage_service.py       # NUEVO: track_usage_event, aggregate_billing_metrics
```

**Archivos eliminados:** Ninguno — todo se modifica en lugar de reemplazar.

**Archivos renombrados:** Ninguno.

---

## 11. Ejemplos de código concretos

### TenantRouter — identificar tenant desde webhook inbound

```python
# app/modules/whatsapp/webhook.py

async def _detect_provider(request: Request) -> str:
    """Detectar provider desde headers o content-type."""
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type:
        return "twilio"
    return "meta"


async def _extract_phone_hint(request: Request, provider: str) -> str:
    """Extraer el número receptor (nuestro número) del payload crudo."""
    if provider == "twilio":
        form = await request.form()
        return form.get("To", "").replace("whatsapp:", "")
    else:
        body = await request.json()
        # Meta: entry[0].changes[0].value.metadata.phone_number_id
        try:
            return (
                body["entry"][0]["changes"][0]["value"]
                ["metadata"]["phone_number_id"]
            )
        except (KeyError, IndexError):
            return ""


async def _resolve_tenant_channel(
    db, phone_hint: str, provider: str
) -> Optional[TenantChannel]:
    """
    Lookup del tenant_channel desde el número receptor.
    Para Meta: phone_hint es el phone_number_id.
    Para Twilio: phone_hint es el número E.164.
    """
    if provider == "meta":
        row = await db.fetchrow(
            """
            SELECT * FROM tenant_channels
            WHERE phone_number_id = $1 AND provider = 'meta' AND activo = true
            """,
            phone_hint
        )
    else:
        row = await db.fetchrow(
            """
            SELECT * FROM tenant_channels
            WHERE phone_number = $1 AND provider = 'twilio' AND activo = true
            """,
            phone_hint
        )

    if not row:
        return None

    return TenantChannel(
        id=str(row["id"]),
        organization_id=str(row["organization_id"]),
        provider=row["provider"],
        phone_number=row["phone_number"],
        account_sid=row.get("account_sid"),
        auth_token=_decrypt(row.get("auth_token_enc")),
        access_token=_decrypt(row.get("access_token_enc")),
        phone_number_id=row.get("phone_number_id"),
        verify_token=row.get("verify_token"),
    )
```

### ConversationOrchestrator — coordinar agente + handoff + respuesta

```python
# app/modules/agent/orchestrator.py

class ConversationOrchestrator:
    """
    Coordina el flujo completo de un mensaje inbound de lead.
    Recibe el channel (con tenant_id implícito) y el mensaje normalizado.
    """

    def __init__(self, db, channel: TenantChannel):
        self.db = db
        self.channel = channel
        self.provider = get_provider(channel)

    async def handle(self, msg: IncomingMessage) -> None:
        org_id = self.channel.organization_id

        # Idempotencia
        if not await self._mark_processed(msg):
            return

        # Handoff activo
        handoff = await get_active_handoff_by_phone(self.db, msg.sender_phone, org_id)
        if handoff:
            await self._forward_to_human(handoff, msg)
            return

        # Dev message
        if await is_authorized_number(self.db, msg.sender_phone, org_id):
            await handle_developer_message(self.db, self.channel, msg)
            return

        # Lead flow
        session = await get_or_create_session(self.db, msg.sender_phone, self.channel)
        lead_id = session["lead_id"]

        await save_conversation_message(self.db, lead_id, "user", "lead", msg.text or "[media]")
        await connection_manager.broadcast(org_id, "message", self._fmt_event(lead_id, msg, "lead"))

        agent_config = await get_agent_config(self.db, org_id)
        doc_blocks = await get_tenant_document_blocks(self.db, org_id)
        history = await get_conversation_history(self.db, lead_id)
        qualification = await get_lead_qualification(self.db, lead_id)

        response = await invoke_agent(agent_config, doc_blocks, history, msg.text, qualification)
        clean, doc_req = _extract_doc_marker(response)
        clean, handoff_trigger = _extract_handoff_marker(clean)

        await save_conversation_message(self.db, lead_id, "assistant", "agent", clean)
        await self.provider.send_text(msg.sender_phone, clean)
        await connection_manager.broadcast(org_id, "message", self._fmt_event(lead_id, msg, "agent", clean))

        asyncio.create_task(self._post_process(lead_id, msg, clean, doc_req, handoff_trigger, history))

    async def _mark_processed(self, msg: IncomingMessage) -> bool:
        result = await self.db.fetchval(
            """
            INSERT INTO processed_messages (message_id, provider, organization_id)
            VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING message_id
            """,
            msg.message_id, self.channel.provider, self.channel.organization_id
        )
        return result is not None

    async def _forward_to_human(self, handoff, msg: IncomingMessage) -> None:
        lead_id = str(handoff["lead_id"])
        await save_conversation_message(self.db, lead_id, "user", "lead", msg.text or "[media]")
        await connection_manager.broadcast(
            self.channel.organization_id, "message",
            self._fmt_event(lead_id, msg, "lead")
        )
        # Timeout checks (4h admin / 2h lead silence)
        await _check_handoff_timeouts(self.db, handoff, msg)

    async def _post_process(self, lead_id, msg, response, doc_req, handoff_trigger, history):
        asyncio.create_task(_track_usage(self.db, self.channel.organization_id, msg, response))
        if doc_req:
            asyncio.create_task(_send_document(self.db, self.channel, msg.sender_phone, doc_req))
        if handoff_trigger:
            asyncio.create_task(initiate_handoff(self.db, lead_id, handoff_trigger, self.channel))
        asyncio.create_task(_update_qualification(self.db, lead_id, history + [
            {"role": "user", "content": msg.text}
        ]))

    def _fmt_event(self, lead_id, msg, sender_type, content=None):
        return {
            "lead_id": lead_id,
            "phone": msg.sender_phone,
            "content": content or msg.text,
            "sender_type": sender_type,
            "timestamp": datetime.utcnow().isoformat(),
        }
```

### Middleware de tenant isolation

```python
# app/core/tenant_guard.py
# No es un middleware HTTP — es un decorator para funciones de DB.
# El middleware HTTP ya existe implícitamente en los Depends(security) de cada endpoint.

from functools import wraps
import logging

logger = logging.getLogger(__name__)


def scoped_to_tenant(fn):
    """
    Decorator para queries que devuelven filas con organization_id.
    Lanza en desarrollo, loggea en producción.
    """
    @wraps(fn)
    async def wrapper(*args, tenant_id: str, **kwargs):
        results = await fn(*args, tenant_id=tenant_id, **kwargs)
        if not isinstance(results, (list, tuple)):
            return results

        import os
        is_dev = os.getenv("ENVIRONMENT", "production") == "development"

        for row in results:
            row_org = str(row.get("organization_id", ""))
            if row_org and row_org != tenant_id:
                msg = (
                    f"TENANT_LEAK in {fn.__name__}: "
                    f"row belongs to {row_org}, caller is {tenant_id}"
                )
                if is_dev:
                    raise RuntimeError(msg)
                else:
                    logger.critical(msg, extra={"fn": fn.__name__, "tenant_id": tenant_id})
                    # En producción: devolver lista vacía (fail-safe)
                    return []

        return results
    return wrapper
```

### Webhook endpoint FastAPI — completo con validación

```python
# app/modules/whatsapp/webhook.py

from fastapi import APIRouter, Request, HTTPException
from app.database import get_pool

router = APIRouter()


@router.get("/whatsapp/webhook")
async def verify_webhook(
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
):
    """Verificación de Meta Cloud API webhook."""
    pool = await get_pool()
    # Buscar tenant_channel por verify_token
    row = await pool.fetchrow(
        "SELECT verify_token FROM tenant_channels WHERE verify_token = $1 AND provider = 'meta'",
        hub_verify_token
    )
    if hub_mode == "subscribe" and row:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(403, "Verification failed")


@router.post("/whatsapp/webhook")
async def receive_message(request: Request):
    """
    Webhook unificado para Twilio y Meta.
    Responde 200 inmediatamente. Procesa en background.
    """
    pool = await get_pool()

    provider_name = await _detect_provider(request)
    phone_hint = await _extract_phone_hint(request, provider_name)

    if not phone_hint:
        # Payload inesperado — 200 para que el provider no reintente
        logger.warning("webhook_no_phone_hint", extra={"provider": provider_name})
        return {"status": "ok"}

    channel = await _resolve_tenant_channel(pool, phone_hint, provider_name)
    if not channel:
        # Número no registrado — silencioso
        return {"status": "ok"}

    provider = get_provider(channel)

    # Validar firma (necesita body crudo antes de que FastAPI lo consuma)
    if not await provider.validate_signature(request):
        raise HTTPException(403, "Invalid signature")

    messages = await provider.parse_webhook(request)

    orchestrator = ConversationOrchestrator(pool, channel)
    for msg in messages:
        asyncio.create_task(orchestrator.handle(msg))

    return {"status": "ok"}
```

---

## 12. Escalabilidad y operaciones

### Idempotencia

Twilio y Meta reenvían webhooks si no reciben 200 en < 15s. La tabla `processed_messages` con `INSERT ... ON CONFLICT DO NOTHING` garantiza que cada `message_id` se procesa exactamente una vez.

Cleanup recomendado (agregar al cron existente):
```sql
DELETE FROM processed_messages WHERE processed_at < NOW() - INTERVAL '48 hours';
```

### Async processing

**No usar Celery/Redis para esta escala.** `asyncio.create_task()` es suficiente para < 200 tenants con tráfico de inmobiliaria (picos de ~100 mensajes/hora).

Usar Celery/ARQ/RQ recién si:
- Una tarea tarda > 20s (riesgo de timeout del webhook) — transcripción de audio larga podría calificar
- El proceso del agente falla y necesita retry con backoff

Por ahora: `asyncio.create_task()` + logs de error + alerting manual.

### Rate limiting de Meta Cloud API

Meta limita a ~80 mensajes/segundo por número. Para esta escala (inmobiliaria) no es un problema. Si se vuelve issue:

```python
# app/core/rate_limiter.py
from collections import defaultdict
import asyncio
import time

class ProviderRateLimiter:
    """Simple token bucket por tenant_channel."""
    def __init__(self, rate: float = 10.0):  # msgs/segundo
        self._buckets: dict[str, float] = defaultdict(lambda: rate)
        self._last_check: dict[str, float] = {}
        self._rate = rate
        self._lock = asyncio.Lock()

    async def acquire(self, channel_id: str) -> None:
        async with self._lock:
            now = time.monotonic()
            last = self._last_check.get(channel_id, now)
            elapsed = now - last
            self._buckets[channel_id] = min(
                self._rate,
                self._buckets[channel_id] + elapsed * self._rate
            )
            self._last_check[channel_id] = now
            if self._buckets[channel_id] >= 1:
                self._buckets[channel_id] -= 1
            else:
                await asyncio.sleep(1.0 / self._rate)
```

### Observabilidad

Loggear con `extra={}` para correlación por tenant:

```python
logger.info("message_processed", extra={
    "organization_id": channel.organization_id,
    "lead_id": str(lead_id),
    "message_id": msg.message_id,
    "provider": channel.provider,
    "duration_ms": int((time.monotonic() - start) * 1000),
})
```

**Métricas a exponer** (via `/metrics` o logging):
- `messages_processed_total{org, provider}` — contador
- `agent_latency_ms{org}` — histogram
- `handoffs_active{org}` — gauge
- `webhook_errors_total{org, provider, error_type}` — contador

### Seguridad

**Credenciales por tenant en DB:**
- `auth_token_enc` y `access_token_enc` se almacenan encriptados con AES-256
- Clave de encriptación: `APP_SECRET` de env var (no en DB)
- Rotación: `UPDATE tenant_channels SET access_token_enc = $new WHERE id = $channel_id`

**Rotación de tokens sin downtime:**
1. Generar nuevo token en Meta/Twilio
2. `UPDATE tenant_channels SET access_token_enc = encrypt(new_token) WHERE id = ...`
3. El próximo mensaje usa el token nuevo automáticamente

**Validación de firmas:**
- Twilio: HMAC-SHA1 sobre URL + sorted params (ver `TwilioProvider.validate_signature`)
- Meta: HMAC-SHA256 sobre raw body con App Secret

**Errores por provider:**
```python
async def _send_with_retry(provider, to, text, max_retries=2):
    for attempt in range(max_retries + 1):
        try:
            return await provider.send_text(to, text)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:  # Rate limit
                await asyncio.sleep(2 ** attempt)
            elif e.response.status_code in (400, 401, 403):
                # Error permanente — no retry
                logger.error("provider_send_permanent_error", extra={
                    "status": e.response.status_code,
                    "body": e.response.text[:200],
                })
                raise
            elif attempt == max_retries:
                raise
```

---

## 13. Modelo de negocio y billing

### Planes en DB

```sql
-- Los planes se definen en código (no tabla) — menos overhead.
-- El campo plan_slug en organizations referencia el plan.
-- Planes propuestos:
--   starter: hasta 500 mensajes/mes, 1 número, 1 agente
--   pro:     hasta 5000 mensajes/mes, 3 números, 1 agente customizable
--   enterprise: ilimitado, múltiples números, soporte prioritario

-- El campo en organizations ya fue agregado en sección 6:
-- plan_slug TEXT NOT NULL DEFAULT 'starter'
-- trial_ends_at TIMESTAMPTZ
```

### Eventos a registrar en `usage_events`

```python
# app/services/usage_service.py

async def track_message(db, organization_id: str, direction: str, lead_id: str = None):
    """direction: 'inbound' | 'outbound'"""
    await db.execute(
        """
        INSERT INTO usage_events (organization_id, event_type, quantity, metadata, billing_period)
        VALUES ($1, $2, 1, $3, to_char(NOW(), 'YYYY-MM'))
        """,
        organization_id,
        f"message_{direction}",
        {"lead_id": lead_id} if lead_id else None
    )

async def track_tokens(db, organization_id: str, input_tokens: int, output_tokens: int, model: str):
    period = datetime.utcnow().strftime("%Y-%m")
    await db.executemany(
        """
        INSERT INTO usage_events (organization_id, event_type, quantity, metadata, billing_period)
        VALUES ($1, $2, $3, $4, $5)
        """,
        [
            (organization_id, "ai_tokens_input", input_tokens, {"model": model}, period),
            (organization_id, "ai_tokens_output", output_tokens, {"model": model}, period),
        ]
    )


# Cron mensual para consolidar billing_metrics
async def consolidate_billing_metrics(db, period: str):
    await db.execute(
        """
        INSERT INTO billing_metrics
            (organization_id, billing_period, messages_in, messages_out,
             ai_tokens_total, handoffs_total, plan_slug)
        SELECT
            ue.organization_id,
            $1 AS billing_period,
            COUNT(*) FILTER (WHERE event_type = 'message_inbound') AS messages_in,
            COUNT(*) FILTER (WHERE event_type = 'message_outbound') AS messages_out,
            SUM(quantity) FILTER (WHERE event_type LIKE 'ai_tokens_%') AS ai_tokens_total,
            COUNT(*) FILTER (WHERE event_type = 'handoff_started') AS handoffs_total,
            o.plan_slug
        FROM usage_events ue
        JOIN organizations o ON o.id = ue.organization_id
        WHERE ue.billing_period = $1
        GROUP BY ue.organization_id, o.plan_slug
        ON CONFLICT (organization_id, billing_period) DO UPDATE SET
            messages_in = EXCLUDED.messages_in,
            messages_out = EXCLUDED.messages_out,
            ai_tokens_total = EXCLUDED.ai_tokens_total,
            handoffs_total = EXCLUDED.handoffs_total
        """,
        period
    )
```

### Estructura de precios recomendada

| Componente | Implementación |
|-----------|----------------|
| Setup fee | Manual (Stripe invoice) — no modelar en DB todavía |
| Mensual fijo | `organizations.plan_slug` → precio fijo por plan |
| Overage messages | `(billing_metrics.messages_in + messages_out) - plan_limit` × price_per_msg |
| AI tokens | Opcional: `ai_tokens_total × cost_per_1k_tokens` — solo para enterprise |

Para < 50 tenants, el billing puede ser manual (exportar `billing_metrics` a CSV mensual). Integración con Stripe recién cuando el proceso manual se vuelva tedioso.

---

## Resumen ejecutivo

El código actual está **más cerca de multi-tenant de lo que parece** — la infraestructura de datos ya está ahí. Los cambios críticos son quirúrgicos:

1. **Una tabla nueva** (`tenant_channels`) + lógica de lookup en el webhook — desbloquea multi-tenant real
2. **Una tabla nueva** (`agent_configs`) — desbloquea personalización por tenant
3. **Modificación del webhook.py** — reemplazar `active_developer_id` global por lookup de DB

Todo lo demás (billing, panel de admin, dual-provider) son fases posteriores que no bloquean lanzar el primer cliente adicional.

**Estimación:** Fase 1 + 2 + 3 son 2-3 días de trabajo. Suficiente para onboardear el segundo cliente.
