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

## Dependencias externas

| Servicio | Qué se necesita | Estado |
|---|---|---|
| Neon | PostgreSQL + pgvector | ✅ Configurado |
| Twilio | WhatsApp Sandbox | ✅ Configurado |
| ngrok | Tunnel local | ✅ Configurado |
| Anthropic | API key (Claude Haiku 4.5) | ✅ Configurado |
| Supabase Storage | S3-compatible storage | ✅ Configurado |
| OpenAI | Whisper + embeddings | ⬜ Pendiente (Fase 2) |
| WhatsApp Cloud API (Meta) | Business account | ⬜ Pendiente (prod) |
| Railway | Deploy completo | ⬜ Pendiente |
| Chatwoot | Inbox de ventas | ⬜ Pendiente (Fase 4) |
| ArgentinaDatos API | Cotizaciones ARS/USD (oficial/blue/mep) | ✅ Configurado (proxy en backend) |
