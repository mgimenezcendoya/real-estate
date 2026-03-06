# Plan de Implementación — Realia V1

Estado actual: Fases 0–3 y 6 (panel web) completas. RAG y Chatwoot pendientes.

---

## Estado del código

### Backend

| Archivo | Estado | Notas |
|---|---|---|
| `app/main.py` | ✅ OK | Routers registrados |
| `app/config.py` | ✅ OK | Todas las env vars |
| `app/database.py` | ✅ OK | Pool asyncpg |
| `migrations/001_initial_schema.sql` | ✅ OK | Schema base: projects, units, leads, conversations, sessions, etc. |
| `migrations/002_lead_qualification_fields.sql` | ✅ OK | `budget_usd`, `bedrooms`, `location_pref` en `leads` |
| `migrations/003_project_details.sql` | ✅ OK | Campos detallados en `projects` |
| `migrations/004_unit_notes.sql` | ✅ OK | Tabla `unit_notes` |
| `migrations/005_telegram_handoff.sql` | ✅ OK | Handoff via Telegram |
| `migrations/006_lead_notes.sql` | ✅ OK | Tabla `lead_notes` |
| `migrations/007_obra_etapas.sql` | ✅ OK | Tablas `obra_etapas`, `obra_updates`, `obra_fotos` |
| `migrations/009_reservations.sql` | ✅ OK | Tabla `reservations` con índice parcial único por unidad |
| `migrations/010–015` | ✅ OK | Financiero, inversores, alertas, proveedores/pagos |
| `migrations/016_organizations.sql` | ✅ OK | `developers` → `organizations`; campo `tipo` (desarrolladora/inmobiliaria/ambas); `projects.organization_id` |
| `migrations/017_users.sql` | ✅ OK | Tabla `users` con roles superadmin/admin/gerente/vendedor/lector; bcrypt hash |
| `migrations/018_payment_plans.sql` | ✅ OK | `payment_plans`, `payment_installments`, `payment_records` |
| `migrations/019_facturas.sql` | ✅ OK | Tabla `facturas` con enums tipo/categoria/estado; FK a `project_expenses` |
| `migrations/020_migrate_factura_files.py` | ✅ OK | Script Python: migra PDFs de facturas existentes a jerarquía org en S3 |
| `migrations/021_migrate_all_files.py` | ✅ OK | Script Python: migra todos los archivos S3 de `projects/` a `orgs/{org_id}/projects/` via copy_object |
| `migrations/022_factura_payment_record.sql` | ✅ OK | FK `payment_record_id` en `facturas` para vincular factura de ingreso a cuota cobrada |
| `migrations/023_obra_payment_budget.sql` | ✅ OK | Link obra_payments ↔ project_budget |
| `migrations/024_budget_etapa_link.sql` | ✅ OK | Link project_budget ↔ obra_etapas |
| `migrations/025_soft_delete_financials.sql` | ✅ OK | Columna `deleted_at` en `project_expenses`, `payment_records`, `facturas`, `investors` |
| `migrations/026_audit_log.sql` | ✅ OK | Tabla `audit_log` con índices; tracking de INSERT/UPDATE/DELETE por usuario |
| `modules/whatsapp/webhook.py` | ✅ OK | Parseo de mensajes, routing |
| `modules/whatsapp/sender.py` | ✅ OK | Envío texto, docs, imágenes, templates |
| `modules/whatsapp/media.py` | ✅ OK | Download de media + `download_media_with_filename` |
| `modules/whatsapp/templates.py` | ✅ OK | Templates formateados |
| `modules/whatsapp/providers/base.py` | ✅ OK | `IncomingMessage` normalizado + `WhatsAppProvider` protocol |
| `modules/whatsapp/providers/twilio.py` | ✅ OK | Twilio provider |
| `modules/whatsapp/providers/meta.py` | ✅ OK | Meta Cloud API provider |
| `modules/agent/router.py` | ✅ OK | Routing lead vs developer |
| `modules/agent/session.py` | ✅ OK | CRUD sesiones, contexto multi-proyecto |
| `modules/agent/prompts.py` | ✅ OK | System prompts para lead + developer |
| `modules/agent/classifier.py` | ✅ OK | Parsea intención con Claude, JSON multi-intent |
| `modules/agent/lead_handler.py` | ✅ OK | Flujo completo: sesión → contexto → calificación → Claude → doc sharing → WA |
| `modules/agent/dev_handler.py` | ✅ OK | Admin mode: comandos, unit mgmt, PDF upload, CSV project load |
| `modules/rag/ingestion.py` | ✅ OK | Upload a S3, versionado, `find_document_for_sharing` |
| `modules/rag/chunker.py` | — | No se usa en la estrategia actual (PDFs nativos a Claude) |
| `modules/rag/retrieval.py` | ✅ OK | Descarga PDFs de S3, convierte a base64, pasa como `document` blocks a Claude. Cache en memoria. |
| `modules/storage.py` | ✅ OK | Upload a Supabase S3, presigned URLs |
| `modules/project_loader.py` | ✅ OK | Parseo CSV → crear proyecto + unidades |
| `modules/media/transcription.py` | ✅ OK | Whisper API |
| `modules/leads/qualification.py` | ✅ OK | 7 campos, scoring progresivo, extracción con Claude |
| `modules/leads/alerts.py` | ✅ OK | Alerta WA al vendedor |
| `modules/leads/nurturing.py` | ⚠️ Parcial | Lógica base OK; generación de mensaje con Claude pendiente |
| `modules/handoff/manager.py` | ✅ OK | check/initiate/close handoff |
| `modules/handoff/telegram.py` | ✅ OK | Notificaciones vía Telegram |
| `modules/handoff/chatwoot.py` | ⬜ Stub | Endpoint OK; API calls pendientes |
| `modules/obra/notifier.py` | ✅ OK | Envío personalizado a compradores |
| `app/admin/api.py` | ✅ OK | Auth, projects, units, leads, lead_notes, buyers, reservations, obra, analytics, docs, CSV, tools/exchange-rates, users CRUD, payment plans/installments/records, facturas, flujo de caja, alertas, proveedores/pagos |
| `app/admin/auth.py` | ✅ OK | JWT + bcrypt + tabla users; roles superadmin/admin/gerente/vendedor/lector; fallback env vars para compatibilidad |
| `app/services/alerts_service.py` | ✅ OK | Evalúa 5 condiciones de alerta (avance obra, gastos, cuotas vencidas, cuotas próximas); cron job POST /admin/jobs/alerts |
| `app/modules/tools/__init__.py` | ✅ OK | Módulo tools |
| `app/modules/tools/exchange_rates.py` | ✅ OK | Proxy + cache 15 min para ArgentinaDatos API; tipos oficial/blue/bolsa(mep); follow_redirects=True requerido |

### Frontend (`frontend/`)

| Archivo | Estado | Notas |
|---|---|---|
| `src/lib/api.ts` | ✅ OK | Cliente HTTP tipado con todos los endpoints; tipos ExchangeRate, Factura, LinkablePayment, PaymentPlan, etc. |
| `src/lib/utils.ts` | ✅ OK | `cn()` helper |
| `src/contexts/AuthContext.tsx` | ✅ OK | JWT con user_id/role/org_id/nombre; login/logout/isAuthenticated; flujo debe_cambiar_password |
| `src/components/AuthLayout.tsx` | ✅ OK | Guard de rutas protegidas; ChangePasswordModal bloqueante si debe_cambiar_password |
| `src/components/ChangePasswordModal.tsx` | ✅ OK | Modal bloqueante para primer login; POST /auth/change-password |
| `src/components/Sidebar.tsx` | ✅ OK | Sidebar responsivo; nombre de usuario + rol; link "Usuarios" solo para admin/superadmin |
| `src/components/NewProjectModal.tsx` | ✅ OK | Modal de carga CSV |
| `src/components/ReservationSheet.tsx` | ✅ OK | Wizard de reserva reutilizable (desde unidad o desde lead) |
| `src/components/AlertsPanel.tsx` | ✅ OK | Sheet lateral de alertas agrupadas por severidad; badge en sidebar con polling 60s |
| `src/components/ui/` | ✅ OK | shadcn/ui v3: Sheet, Dialog, Badge, Avatar, Skeleton, Separator, etc. |
| `src/hooks/useAsync.ts` | ✅ OK | Hook genérico con AbortController |
| `src/app/page.tsx` | ✅ OK | Login |
| `src/app/admin/usuarios/page.tsx` | ✅ OK | CRUD usuarios: tabla, modal crear/editar, reset password, toggle activo |
| `src/app/proyectos/page.tsx` | ✅ OK | Listado de proyectos |
| `src/app/proyectos/[id]/page.tsx` | ✅ OK | Dashboard: funnel, revenue, gráfico semanal, fuentes |
| `src/app/proyectos/[id]/layout.tsx` | ✅ OK | Tabs: Dashboard / Unidades / Leads / Reservas / Documentos / Obra / Financiero / Inversores |
| `src/app/proyectos/[id]/unidades/page.tsx` | ✅ OK | Grilla por piso; trigger reserva al marcar `reserved`; venta directa |
| `src/app/proyectos/[id]/leads/page.tsx` | ✅ OK | Kanban; Sheet con notas, edición, "Reservar unidad" |
| `src/app/proyectos/[id]/reservas/page.tsx` | ✅ OK | Lista con filtros (activas/canceladas/convertidas), acciones hover |
| `src/app/proyectos/[id]/reservas/[reservationId]/page.tsx` | ✅ OK | Detalle reserva: tabs "Detalle" + "Plan de Pagos"; grilla cuotas; registrar/editar/eliminar pagos |
| `src/app/proyectos/[id]/reservas/[id]/print/page.tsx` | ✅ OK | Comprobante imprimible con auto-print |
| `src/app/proyectos/[id]/documentos/page.tsx` | ✅ OK | Gestión documentos por tipo |
| `src/app/proyectos/[id]/obra/page.tsx` | ✅ OK | Etapas con barra de progreso, updates con fotos, tab "Pagos" (obra_payments) |
| `src/app/proyectos/[id]/financiero/page.tsx` | ✅ OK | Tabs: "Resumen" (KPIs + presupuesto vs ejecutado + gastos), "Facturas" (CRUD + PDF upload + link a payment_record), "Flujo de Caja" (bar chart + tabla mes a mes + proyección) |
| `src/app/proyectos/[id]/inversores/page.tsx` | ✅ OK | Portal inversores; envío reporte WhatsApp con preview HTML; historial |
| `src/app/inbox/page.tsx` | ✅ OK | Conversaciones; HITL con polling 1.5 s |
| `src/app/tools/page.tsx` | ✅ OK | Tipos de cambio ARS/USD (cards) + simulador conversión bidireccional; polling 5 min |

---

## Fases de implementación

### Fase 0: Infra base ✅ COMPLETA

- [x] DB en Neon con pgvector y pgcrypto
- [x] Migraciones SQL aplicadas
- [x] FastAPI local + ngrok expuesto
- [x] WhatsApp Sandbox (Twilio) configurado
- [x] Primer mensaje end-to-end confirmado

---

### Fase 1A: Agente Lead básico ✅ COMPLETA

- [x] `agent/classifier.py` — parseo JSON multi-intent
- [x] `agent/lead_handler.py` — flujo completo
- [x] `agent/session.py` — contexto multi-proyecto
- [x] Seed scripts: Torre Palermo + Manzanares 2088
- [x] Test e2e: "hola" por WA → respuesta inteligente

---

### Fase 1B: Calificación + Document Sharing ✅ COMPLETA

- [x] Scoring progresivo (7 campos: name, intent, financing, timeline, budget_usd, bedrooms, location_pref)
- [x] Extracción con Claude post-mensaje (JSON → merge inteligente)
- [x] Document sharing (marcadores `[ENVIAR_DOC:tipo:unidad:slug]`)
- [x] Soporte multi-proyecto

---

### Fase 2: RAG con documentos reales ✅ COMPLETA (estrategia cambiada)

**Decisión de diseño:** se descartaron embeddings/pgvector en favor de pasar los PDFs directamente a Claude como documentos nativos (base64). Claude lee el PDF con comprensión nativa — no hace falta chunking ni vectores.

- [x] `rag/retrieval.py` — `get_developer_document_blocks()`: descarga PDFs de S3, los convierte a base64, los pasa como content blocks de tipo `document` en la llamada a Claude. Cache en memoria por `document_id`.
- [x] `rag/ingestion.py` — `ingest_document()`: sube a S3, versionado (anterior queda `is_active=false`), invalida cache. `find_document_for_sharing()`: busca docs en DB para enviar al lead por WhatsApp.
- [x] `rag/chunker.py` — chunking genérico implementado; especializados (precios, planos, FAQ) son stubs — no necesarios con la estrategia actual.
- [x] `rag_status = 'ready'` inmediato al subir — no hay pipeline de embeddings que esperar.

**Limitación conocida:** si los documentos son muy grandes (muchos PDFs pesados), el context window se llena. Para V2 se puede agregar filtrado semántico previo con embeddings para seleccionar qué docs pasar a Claude.

---

### Fase 3: Modo Developer (Admin por WhatsApp) ✅ COMPLETA

- [x] `agent/dev_handler.py` — admin mode completo
- [x] Acciones: update_unit_status, update_unit_price, add_unit_note, get_lead_detail, update_project, create_project_instructions
- [x] PDF upload conversacional → S3 → DB
- [x] CSV project loader → resumen → confirmación → crea proyecto + unidades
- [x] Routing por `DEV_PHONE` (dev) o `authorized_numbers` (prod)

---

### Fase 4: Handoff a Chatwoot ⬜ PENDIENTE

- [ ] Deploy Chatwoot en Railway
- [ ] Configurar inbox de WhatsApp en Chatwoot
- [ ] `handoff/chatwoot.py` — create/forward/webhook handlers
- [ ] Webhook Chatwoot → `{url}/chatwoot/webhook`

---

### Fase 5: Seguimiento de obra + notificaciones ✅ COMPLETA (backend + frontend)

- [x] Tabla `obra_etapas` con 8 etapas estándar (migration 007)
- [x] CRUD etapas: crear, actualizar %, ajustar pesos (suma 100%)
- [x] Updates con fotos (S3 + tabla `obra_fotos`)
- [x] Notificaciones WhatsApp a compradores (`notify_buyers_of_update`)
- [x] Frontend: barra de progreso ponderada, gestión de etapas, galería de fotos

---

### Fase 6: Panel Web Next.js ✅ COMPLETA

- [x] Auth: JWT, login/logout, rutas protegidas
- [x] Proyectos: listado, dashboard analytics, carga CSV
- [x] Unidades: grilla por piso, cambio de estado, trigger de reserva
- [x] Leads: kanban hot/warm/cold, Sheet con notas y edición
- [x] Reservas: wizard (desde unidad o desde lead), lista con filtros, comprobante PDF imprimible
- [x] Documentos: gestión por tipo
- [x] Obra: etapas, progreso, updates con fotos
- [x] Inbox: conversaciones WhatsApp con HITL (polling 1.5 s)
- [x] Financiero: KPI cards, presupuesto vs ejecutado por categoría, tabla gastos
- [x] Inversores: portal de inversores, envío de reporte por WhatsApp, historial
- [x] Alertas: panel lateral con badge en sidebar, polling 60 s
- [x] Proveedores/Pagos: tab "Pagos" dentro de /obra
- [x] Tools: tipos de cambio ARS/USD + simulador de conversión

---

### Fase 8: Modelo de Actores + Usuarios ✅ COMPLETA

- [x] Migración 016: `developers` → `organizations`; campo `tipo`; `projects.organization_id`
- [x] Migración 017: tabla `users` con roles (superadmin/admin/gerente/vendedor/lector)
- [x] Auth backend: PyJWT + bcrypt; JWT incluye user_id/role/org_id/nombre; fallback env vars
- [x] Endpoints CRUD usuarios: GET/POST/PATCH `/admin/users`, POST `/admin/users/{id}/reset-password`
- [x] Flujo `debe_cambiar_password`: modal bloqueante en AuthLayout + POST `/auth/change-password`
- [x] Panel `/admin/usuarios`: tabla de usuarios, modal crear/editar, toggle activo, reset password
- [x] Sidebar: nombre de usuario + link "Usuarios" solo para admin/superadmin

---

### Fase 9: Finanzas Core — Payment Plans ✅ COMPLETA

- [x] Migración 018: `payment_plans`, `payment_installments`, `payment_records`
- [x] Endpoints: GET/POST `/admin/payment-plans/{reservation_id}`, PATCH `/admin/payment-installments/{id}`, POST/PATCH/DELETE `/admin/payment-records[/{id}]`
- [x] Cron `update-payment-states`: marca cuotas como `vencido` + genera alertas CUOTA_VENCIDA/CUOTA_PROXIMA
- [x] UI: `/reservas/[id]` con tabs "Detalle" + "Plan de Pagos"; grilla de cuotas; registrar/editar/eliminar pagos
- [x] Venta directa: endpoint atómico `POST /admin/reservations/{project_id}/direct-sale`

---

### Fase 10: Finanzas Core — Facturas ✅ COMPLETA

- [x] Migración 019: tabla `facturas`; enums tipo/categoria/estado; FK a `project_expenses`
- [x] Migración 022: `payment_record_id` FK en `facturas` para vincular factura de ingreso a cuota cobrada
- [x] Endpoints: GET/POST/PATCH/DELETE facturas; `POST /admin/facturas/{id}/upload-pdf`; `GET .../linkable-payments?q=`
- [x] Storage org-jerárquico: `orgs/{org_id}/projects/{slug}/...`; `storage.py` actualizado con `org_id` opcional
- [x] Migración S3 (020, 021): scripts Python para migrar archivos existentes a nueva jerarquía
- [x] UI: tab "Facturas" en /financiero; modal con file picker PDF; selector buscable de pago para vincular
- [x] Flujo de Caja: endpoint `GET /admin/cash-flow/{project_id}`; ingresos reales + egresos + proyección
- [x] UI: tab "Flujo de Caja" en /financiero; bar chart CSS + tabla mes a mes + saldo acumulado

---

### Fase 7: Tools — Herramientas de mercado ✅ COMPLETA

- [x] Sidebar: ítem "Tools" con ícono `Wrench`
- [x] Backend: `app/modules/tools/exchange_rates.py` — proxy con cache 15 min para ArgentinaDatos API
- [x] Endpoints: `GET /admin/tools/exchange-rates`, `GET /admin/tools/exchange-rates/history/{tipo}`
- [x] Frontend: página `/tools` con cards de cotización (Oficial/MEP/Blue), polling 5 min
- [x] Simulador: conversión bidireccional ARS↔USD con toggle Comprar/Vender, tabla comparativa, separador de miles

---

### Fase 11: Soft Delete ✅ COMPLETA

- [x] Migración 025: columna `deleted_at TIMESTAMPTZ NULL` en `project_expenses`, `payment_records`, `facturas`, `investors`
- [x] Todos los endpoints `DELETE` de esas tablas hacen `UPDATE SET deleted_at = NOW()` en lugar de `DELETE FROM`
- [x] Todos los `SELECT`, `SUM` y analytics filtran `AND deleted_at IS NULL`
- [x] Endpoints `PATCH`/`UPDATE` incluyen `AND deleted_at IS NULL` en el `WHERE` para no operar sobre registros eliminados
- [x] `reservations` ya tenía soft delete nativo vía campo `status` (`active`/`cancelled`/`converted`) — sin cambios
- [x] `app/services/alerts_service.py` actualizado: JOIN con `project_expenses` e `investors` filtra `deleted_at IS NULL`
- [x] Convención documentada en `CONTEXT.md § 10. Convenciones de Base de Datos`

---

### Fase 12: Audit Log ✅ COMPLETA

- [x] Migración 026: tabla `audit_log(id, user_id, user_nombre, action, table_name, record_id, project_id, details JSONB, created_at)` con 4 índices
- [x] Helpers en `api.py`: `_get_actor(credentials)` y `_audit(pool, ...)` (silencia errores)
- [x] Tablas auditadas: `project_expenses`, `payment_records`, `facturas`, `investors`, `reservations` — INSERT/UPDATE/DELETE
- [x] Todos los endpoints de escritura de esas tablas reciben `credentials` y llaman `_audit` post-operación
- [x] Endpoint `GET /admin/audit-log` con filtros `project_id`, `table_name`, `record_id`, `user_id`; paginado; acceso `admin`/`superadmin`
- [x] Tipo `AuditLogEntry` y método `api.getAuditLog()` en `frontend/src/lib/api.ts`
- [x] Convención documentada en `CONTEXT.md § 10. Convenciones de Base de Datos`

---

### Fase 13A: Chatwoot — Inbox omnicanal + Notificaciones HITL ⬜ PENDIENTE

**Objetivo**: Resolver el problema de agentes que pierden conversaciones cuando no están en el front. El inbox de Realia (`/inbox`) se mantiene en paralelo hasta validar Chatwoot en producción.

**Decisión de deploy**: Chatwoot Community Edition es **gratuita** (open source, self-hosted). Solo se paga el hosting. Opciones por costo:
- **Hetzner VPS CX22** (~$4-6/mes) con Docker Compose — guía oficial Linux VM, más barato
- **Railway** (~$15-20/mes estimado) — cuando se migre el resto del stack
- Render paid (~$31/mes) — posible pero caro; Render free tier NO sirve (spin-down rompe WebSockets)

**Estrategia recomendada**:
- Mientras se esté en Render free: usar el **trial de Chatwoot Cloud** para desarrollar e integrar el módulo sin costo.
- Al migrar a Railway (ya previsto en el plan): deployar Chatwoot ahí junto con FastAPI + Postgres. Un solo stack, sin VPS separado.

- [ ] Crear cuenta en Chatwoot Cloud (app.chatwoot.com)
- [ ] Crear un Inbox de tipo "API" en Chatwoot para WhatsApp (un inbox por org)
- [ ] `modules/handoff/chatwoot.py` — implementar API calls reales:
  - `create_contact(phone, name, org_id)` → crea o busca contacto en Chatwoot
  - `create_conversation(contact_id, inbox_id, initial_message)` → abre conversación con contexto
  - `send_message(conversation_id, content)` → reenvía mensajes del lead al agente humano
  - `close_conversation(conversation_id)` → cierra handoff
- [ ] Webhook Chatwoot → `POST /chatwoot/webhook`:
  - `message_created` (agente responde) → reenviar al lead por WhatsApp
  - `conversation_resolved` → cerrar handoff en Realia, AI Agent retoma
- [ ] Notificaciones: agentes instalan Chatwoot mobile app (iOS/Android) → push automático al hacer handoff
- [ ] El inbox de Realia (`/inbox/page.tsx`) se mantiene sin cambios durante esta fase

---

### Fase 13B: Multi-tenant real — `org_channels` ⬜ PENDIENTE

**Objetivo**: Sacar la config de WhatsApp de las env vars globales y moverla a la base de datos por org. Permite que cada cliente tenga su propio número y credenciales aisladas.

- [ ] Migración 027: tabla `org_channels`

```sql
CREATE TABLE org_channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id),
    channel     TEXT NOT NULL,   -- 'whatsapp' | 'webchat' | 'instagram' | 'email'
    status      TEXT NOT NULL DEFAULT 'pending',
                                 -- 'pending' | 'active' | 'suspended'
    config      JSONB NOT NULL DEFAULT '{}',
    -- config por canal:
    -- whatsapp: { provider, phone_number, twilio_subaccount_sid,
    --             twilio_auth_token, twilio_sender_sid }
    -- webchat:  { widget_token, allowed_domains }
    -- instagram:{ page_id, access_token, instagram_account_id }
    -- email:    { smtp_host, smtp_user, smtp_pass, inbox_email }
    chatwoot_inbox_id    INT,
    chatwoot_inbox_token TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, channel)
);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS chatwoot_account_id INT;
```

- [ ] `modules/agent/router.py` — `resolve_developer()` busca org en `org_channels` por `config->>'phone_number'` en lugar de `projects.whatsapp_number`
- [ ] `modules/whatsapp/webhook.py` — pasar `subaccount_sid` del payload de Twilio para lookup de org
- [ ] Providers de Twilio/Meta actualizados para usar credenciales por org desde DB (no desde env vars)
- [ ] Endpoint `POST /admin/channels` — crear/actualizar canal por org
- [ ] Endpoint `GET /admin/channels` — listar canales activos de la org
- [ ] **Las env vars actuales de Twilio quedan como fallback** mientras no haya `org_channels` para la org (compatibilidad retroactiva con el org de desarrollo actual)

---

### Fase 13C: Wizard de onboarding de clientes (WhatsApp) ⬜ PENDIENTE

**Objetivo**: Un admin de Realia puede registrar un cliente nuevo y dejarle el canal de WhatsApp configurado sin que el cliente toque Twilio.

**Modelo**: Realia es cuenta maestra de Twilio (`AC6817...`). Cada cliente → subaccount aislado.

- [ ] Backend: `POST /admin/onboarding/whatsapp`
  1. Crea subaccount en Twilio via API: `POST /2010-04-01/Accounts.json { FriendlyName: org_name }`
  2. Registra WhatsApp Sender en el subaccount con el número del cliente
  3. Crea Inbox en Chatwoot para la org via API: `POST /api/v1/accounts/{id}/inboxes`
  4. Guarda en `org_channels` con `status='pending'`
- [ ] Webhook Twilio de aprobación de sender → `POST /webhooks/twilio/sender-status`
  - Cuando Meta aprueba: `UPDATE org_channels SET status='active'`
  - Notificación al admin de la org: "¡Tu WhatsApp está listo!"
- [ ] Frontend: página `/admin/onboarding` con wizard de 3 pasos:
  - Paso 1: Datos del negocio (nombre, logo, descripción del perfil de WhatsApp)
  - Paso 2: Número de teléfono del cliente (con advertencia: no puede estar en app de WA personal)
  - Paso 3: Estado de aprobación en tiempo real (polling hasta `status='active'`)
- [ ] **Restricción por número**: el número debe ser del cliente (no de Twilio) para garantizar portabilidad futura a Meta Cloud API directo

---

### Fase 13D: Web Chat — canal de cero fricción ⬜ PENDIENTE

**Objetivo**: Cada org tiene un widget de chat embeddable en su sitio web. El agente IA responde igual que por WhatsApp. Sin verificación ni setup externo para el cliente.

- [ ] Chatwoot crea automáticamente un Inbox de tipo "Website" al hacer onboarding (Fase 13C)
- [ ] Webhook Chatwoot → `POST /chatwoot/webhook` ya rutea al agente IA (mismo handler que WhatsApp)
- [ ] `IncomingMessage` extendido: campo `channel: str = 'whatsapp'` → acepta `'webchat'`
- [ ] Frontend: sección "Web Chat" en `/admin/channels` con embed snippet generado:
  ```html
  <script>
    window.chatwootSettings = { websiteToken: '<TOKEN>', baseUrl: 'https://app.chatwoot.com' };
    /* ... sdk loader ... */
  </script>
  ```
- [ ] Respuesta del agente IA por web chat: vía Chatwoot API (no vía WhatsApp sender)

---

### Fase 13E: Instagram DMs ⬜ PENDIENTE

**Objetivo**: Canal adicional para orgs que captan leads por Instagram.

- [ ] En Chatwoot: crear Inbox de tipo "Instagram" por org (requiere OAuth con Facebook del cliente)
- [ ] El cliente conecta su cuenta de Instagram Business desde el wizard de Realia (redirect OAuth)
- [ ] Mismo webhook Chatwoot → AI Agent (canal `'instagram'`)
- [ ] `IncomingMessage` acepta `channel='instagram'`
- [ ] Respuestas del agente vía Chatwoot API al canal Instagram

---

### Fase 14: Meta Tech Provider — Embedded Signup directo ⬜ PENDIENTE (mediano plazo)

**Objetivo**: Eliminar la dependencia de Twilio para WhatsApp en producción. Cada cliente crea su WABA con Meta directamente desde el wizard de Realia (~10 min, sin cuenta Twilio).

**Pre-requisito**: Realia debe completar Business Verification con Meta + App Review (1-4 semanas, una sola vez).

- [ ] Crear Facebook App con permisos `whatsapp_business_management` + `business_management`
- [ ] Implementar flujo Embedded Signup: iframe/redirect OAuth en el wizard de onboarding
- [ ] Al completar OAuth: guardar `waba_id` + `phone_number_id` + `access_token` en `org_channels.config`
- [ ] Provider Meta ya implementado (`modules/whatsapp/providers/meta.py`) — solo cambiar que las credenciales vengan de `org_channels` en lugar de env vars
- [ ] **Migración de clientes Twilio → Meta**: cambiar `config.provider` de `'twilio'` a `'meta'` en `org_channels` + registrar número en WABA. El número del cliente no cambia.
- [ ] Endpoint `PATCH /admin/channels/{id}/migrate-to-meta` para hacer la migración por org

---

## Dependencias externas

| Servicio | Qué se necesita | Estado |
|---|---|---|
| Neon | PostgreSQL + pgvector | ✅ Configurado |
| Twilio | Cuenta maestra (`AC6817...`) — renombrada a "Realia" | ✅ Configurado |
| ngrok | Tunnel local | ✅ Configurado |
| Anthropic | API key (Claude Haiku 4.5) | ✅ Configurado |
| Supabase Storage | S3-compatible storage | ✅ Configurado |
| OpenAI | Whisper + embeddings | ⬜ Pendiente (Fase 2) |
| WhatsApp Cloud API (Meta) | Business account | ⬜ Pendiente (Fase 14) |
| Railway | Deploy completo | ⬜ Pendiente |
| Chatwoot Community | Inbox omnicanal self-hosted — **gratis** (software). Hosting: Hetzner VPS ~$6/mes o Railway cuando se migre. No usar Render free tier (spin-down rompe WebSockets) | ⬜ Pendiente (Fase 13A) |
| ArgentinaDatos API | Cotizaciones ARS/USD (oficial/blue/mep) | ✅ Configurado (proxy en backend) |
