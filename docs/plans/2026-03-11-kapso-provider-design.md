# Kapso WhatsApp Provider — Design

**Date:** 2026-03-11
**Status:** Approved

## Context

REALIA already has a multi-tenant WhatsApp provider abstraction supporting Twilio, Meta, and YCloud. The goal is to add Kapso as a fourth provider option.

**Key Kapso advantage:** A single platform-level `KAPSO_API_KEY` handles all customer connections — customers don't need to hand over Meta credentials. They onboard via a Kapso-hosted "setup link" (Meta embedded signup). This simplifies customer onboarding significantly and is the intended long-term default for all organizations.

---

## Architecture

### Provider Layer

New file: `app/modules/whatsapp/providers/kapso.py`

- Implements the existing `WhatsAppProvider` Protocol
- **Auth:** `x-api-key: KAPSO_API_KEY` header (one global key, stored in env)
- **Send endpoint:** `POST https://api.kapso.ai/meta/whatsapp/messages/send-a-message`
- **Credentials per org:** only `phone_number_id` — no per-customer `access_token`
- **Incoming webhooks:** Kapso forwards in Meta format → reuse `MetaProvider.parse_webhook()` detection logic

### Factory Update

`app/modules/whatsapp/providers/factory.py`: register `KapsoProvider` alongside existing providers.

### Config

`app/config.py`: add `kapso_api_key: str = ""`

---

## Database — Migration 029

- Update `tenant_channels` CHECK constraint:
  `provider IN ('twilio', 'meta', 'ycloud', 'kapso')`
- Kapso channels use only existing `phone_number_id` field — no new columns needed

---

## New Backend Endpoints

### `POST /admin/kapso/setup-link`
- Auth: Bearer (admin or superadmin)
- Creates a Kapso setup link for the authenticated user's organization
- Passes `org_id` as metadata to Kapso so we can associate the callback
- Returns: `{ url: string }`

### `POST /webhook/kapso`
- Public endpoint (verified via Kapso signature)
- Called by Kapso when a customer completes the Meta embedded signup
- Extracts `phone_number_id` + `org_id` from payload
- Auto-creates a `tenant_channels` record with `provider='kapso'`

---

## Onboarding Flow

1. Org admin navigates to `/configuracion` → "Canales WhatsApp" tab
2. Clicks "Conectar con Kapso"
3. Frontend calls `POST /admin/kapso/setup-link` → receives URL
4. URL opens in new tab → customer completes Meta signup via Kapso
5. Kapso fires `POST /webhook/kapso` with `phone_number_id` + `org_id`
6. Backend creates `tenant_channels` record
7. Frontend polls `GET /admin/tenant-channels` every 3s (up to 2 min) → shows connected state

---

## Frontend — `/configuracion`

New page with two tabs:

### Tab: General
- Org name and logo (read-only display for now)

### Tab: Canales WhatsApp
**Empty state:**
- WhatsApp icon + explanation text + "Conectar con Kapso" button

**Connecting state:**
- Spinner + "Esperando confirmación..." while polling

**Connected state:**
- Green badge with phone number, "Kapso" label, "Desconectar" button

**Advanced section (collapsed):**
- Existing Twilio/Meta/YCloud channel management (for orgs already using those)

### Sidebar
- Add "Configuración" nav item with `Settings` Lucide icon

---

## Tipos de conexión WhatsApp para clientes

### Requisitos mínimos
- Número de teléfono existente
- App **WhatsApp Business** (gratuita, distinta a WhatsApp personal)
- Nombre del negocio
- Cuenta de **Facebook** (el flujo pide seleccionar o crear un portafolio comercial — Meta Business Manager — pero se puede crear en el momento, en 1-2 minutos dentro del propio flujo)
- No requiere **verificación formal de empresa con Meta** (el proceso con documentación que tarda días/semanas)

> ⚠️ WhatsApp personal (no Business) **no es compatible** con la API de Meta/Kapso.

### Opción 1 — Conectar app WhatsApp Business (Coexistence)
El número opera simultáneamente en la app y en la API de Realia.
- ✅ No requiere número nuevo
- ✅ El vendedor puede seguir usando la app manualmente
- ✅ El bot responde automáticamente en paralelo
- ⚠️ La lógica de handoff de Realia evita que bot y humano respondan al mismo mensaje
- Límite: 5 mensajes/segundo

### Opción 2 — Número dedicado
El número queda exclusivamente para la API (sin app).
- Puede ser un número nuevo provisto por Kapso, o uno existente migrado
- Mayor velocidad: hasta 1000 mensajes/segundo
- Recomendado para volumen alto o cuando se quiere separación total entre bot y atención humana

### Por qué Kapso simplifica el onboarding vs Meta directo

| | Meta directo | Kapso embedded login |
|---|---|---|
| Requiere Meta Business Manager | ✅ sí (pre-configurado) | ⚠️ se crea en el flujo (~2 min) |
| Verificación formal de empresa con Meta | ✅ sí (puede tomar días) | ❌ no |
| Configuración técnica (tokens, WABA) | ✅ compleja | ❌ automatizada |
| Tiempo de onboarding | días/semanas | ~2 minutos |
| Conocimiento técnico del cliente | alto | ninguno |

El cliente solo hace click en "Conectar con Kapso" dentro de Realia, completa 2-3 pasos, y su número queda operativo. Kapso abstrae toda la complejidad de Meta.

---

## What's NOT in scope

- Migrating existing Meta/Twilio orgs to Kapso automatically
- Kapso flows/workflows beyond basic send/receive
- Credential encryption at rest (pre-existing limitation)
- Dark mode (project is light-theme only)
