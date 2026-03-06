# Diseño: Arquitectura Omnicanal — Realia

**Fecha**: 2026-03-06  
**Estado**: Aprobado  
**Fases**: 13A → 13E → 14

---

## Contexto y problema

Realia hoy opera únicamente sobre WhatsApp con un proveedor global (Twilio sandbox). Esto genera tres fricciones:

1. **Agentes pierden conversaciones**: el inbox de Realia requiere que el agente esté en el front con polling cada 1.5s. No hay notificaciones push.
2. **Un solo canal**: leads que vienen por web, Instagram o email no tienen atención automática.
3. **No es multi-tenant real**: las credenciales de WhatsApp son globales (env vars), no por org. No se pueden onboardear clientes nuevos con sus propios números sin modificar el código.

---

## Decisiones de diseño

### Stack de canales

| Canal | Proveedor | Fricción de onboarding |
|---|---|---|
| WhatsApp | Twilio subaccounts (cuenta maestra `AC6817...`) | 1-3 días (revisión Meta) |
| Web Chat | Chatwoot widget embed | Cero — generado automáticamente |
| Instagram DMs | Chatwoot + Meta Graph API | Baja — OAuth del cliente |
| Email | Chatwoot SMTP inbox | Mínima — credenciales email |

### Chatwoot como motor de inbox y notificaciones

**Chatwoot no reemplaza el agente IA** — es el inbox humano. El agente IA sigue corriendo en Realia. Cuando se detecta la necesidad de handoff, Chatwoot toma el control. Al resolver, el control vuelve al IA.

El inbox de Realia (`/inbox`) se mantiene en paralelo hasta validar Chatwoot en producción.

**Deploy**: Chatwoot Cloud ($19/mes, 5 agentes) mientras el stack sigue en Render. No soporta Render de forma oficial para self-hosting. Migrar a self-hosted Railway cuando haya clientes reales.

### Twilio subaccounts

Realia es cuenta maestra (`TWILIO_SID_REDACTED`, tipo `Full`, renombrada a "Realia"). Cada cliente → subaccount aislado creado por API. El cliente no necesita cuenta de Twilio. Los números son del cliente (no de Twilio) para garantizar portabilidad futura a Meta Cloud API.

### Meta Tech Provider (largo plazo)

En el mediano plazo, Realia aplica para ser Tech Provider de Meta e implementa Embedded Signup directamente, eliminando Twilio como intermediario. El proveedor es intercambiable en `org_channels.config` — la migración es un UPDATE en la DB, no un cambio de código.

---

## Arquitectura

```
CANALES DE ENTRADA
├── WhatsApp (Twilio subaccount por org)
├── Web Chat (Chatwoot widget)
├── Instagram DMs (Chatwoot + Meta)
└── Email (Chatwoot SMTP)
         │
         ▼
POST /webhooks/{canal}  ← FastAPI Realia
         │
         ├── Lookup org en org_channels por número/token/inbox_id
         ├── Construye IncomingMessage normalizado (channel='whatsapp'|'webchat'|...)
         │
         ▼
route_message(org_id, channel, message)
         │
    ┌────┴────┐
    ▼         ▼
AI Agent   Chatwoot (handoff activo)
(Claude)   ├── Push notification mobile (agente)
    │       ├── HITL en inbox de Chatwoot
    └───────►└── Webhook vuelta a Realia al resolver → AI retoma
```

---

## Modelo de datos

### Tabla `org_channels` (Migración 027)

```sql
CREATE TABLE org_channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id),
    channel     TEXT NOT NULL,
    -- 'whatsapp' | 'webchat' | 'instagram' | 'email'
    status      TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'active' | 'suspended'
    config      JSONB NOT NULL DEFAULT '{}',
    chatwoot_inbox_id    INT,
    chatwoot_inbox_token TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, channel)
);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS chatwoot_account_id INT;
```

**Estructura de `config` por canal:**

```json
// whatsapp
{
  "provider": "twilio",
  "phone_number": "+54911XXXXXXXX",
  "twilio_subaccount_sid": "ACxxxx",
  "twilio_auth_token": "xxxx",
  "twilio_sender_sid": "PNxxxx"
}

// webchat
{
  "widget_token": "xxxx",
  "allowed_domains": ["cliente.com.ar"]
}

// instagram
{
  "page_id": "xxxx",
  "access_token": "xxxx",
  "instagram_account_id": "xxxx"
}

// email
{
  "smtp_host": "smtp.gmail.com",
  "smtp_user": "ventas@cliente.com.ar",
  "smtp_pass": "xxxx",
  "inbox_email": "ventas@cliente.com.ar"
}
```

---

## Cambios de código

### Lo que NO cambia
- `IncomingMessage` (base.py) — se extiende con campo `channel`
- `handle_lead_message` — lógica de negocio igual para todos los canales
- `handle_developer_message` — sin cambios
- `modules/rag/`, `modules/leads/`, `modules/obra/` — sin cambios

### Lo que cambia

| Archivo | Cambio |
|---|---|
| `modules/agent/router.py` | `resolve_developer()` busca en `org_channels` en lugar de `projects.whatsapp_number` |
| `modules/whatsapp/webhook.py` | Extrae `subaccount_sid` del payload Twilio para lookup de org |
| `modules/whatsapp/providers/twilio.py` | Acepta credenciales por org (no solo desde env vars) |
| `modules/whatsapp/providers/meta.py` | Acepta `phone_number_id` y `access_token` por org |
| `modules/handoff/chatwoot.py` | Implementar API calls reales (hoy es stub) |
| `app/admin/api.py` | Endpoints CRUD para `org_channels` + wizard de onboarding |

### Lo que se agrega

| Archivo | Descripción |
|---|---|
| `modules/webchat/webhook.py` | Recibe webhooks de Chatwoot para web chat |
| `modules/instagram/webhook.py` | Recibe webhooks de Chatwoot para Instagram |
| `app/modules/channels/dispatcher.py` | Rutea respuesta del agente al canal correcto (WA / Chatwoot API) |
| `migrations/027_org_channels.sql` | Schema de canales por org |

---

## Flujo de onboarding de cliente nuevo

```
Admin llena wizard en Realia (/admin/onboarding)
    │
    ├── Paso 1: Datos del negocio (nombre, logo, descripción)
    ├── Paso 2: Número de teléfono para WhatsApp
    │           └── Advertencia: debe ser número propio, no puede estar en WA personal
    │
    ├── Backend:
    │   1. POST /2010-04-01/Accounts.json → crea subaccount Twilio
    │   2. Registra WhatsApp Sender en subaccount
    │   3. POST Chatwoot /api/v1/accounts/{id}/inboxes → crea inbox
    │   4. INSERT org_channels (status='pending')
    │
    ├── Paso 3: Estado de aprobación (polling)
    │   └── "En revisión por WhatsApp — 1-3 días hábiles"
    │
    └── Webhook Twilio sender-status → UPDATE org_channels SET status='active'
        └── Notificación al admin: "¡Tu WhatsApp está listo!"
```

Web Chat queda activo desde el Paso 3 — no requiere aprobación de Meta.

---

## Fases de implementación

| Fase | Objetivo | Pre-requisito |
|---|---|---|
| **13A** | Chatwoot Cloud + handoff real + notificaciones push | Ninguno |
| **13B** | Migración 027 + routing multi-tenant por org | 13A |
| **13C** | Wizard onboarding + Twilio subaccounts por API | 13B |
| **13D** | Web Chat (Chatwoot widget por org) | 13C |
| **13E** | Instagram DMs | 13D |
| **14** | Meta Tech Provider + Embedded Signup directo | Business Verification Meta (1-4 sem) |

---

## Notas de riesgo

- **Twilio sender approval**: Meta revisa cada WhatsApp Sender nuevo. 1-3 días. Puede rechazar nombres genéricos.
- **Número propio**: si el cliente usa un número de Twilio en lugar del suyo, pierde portabilidad futura.
- **Chatwoot Cloud → self-hosted**: la API es idéntica. La migración es cambiar `CHATWOOT_BASE_URL` en env vars.
- **Responsabilidad de mensajería**: Realia es responsable ante Twilio/Meta por el uso de los clientes. Requiere ToS claros al onboardear.
