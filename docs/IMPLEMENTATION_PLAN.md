# Plan de Implementación — Realia V1

Estado actual: Fases 0, 1A, 1B (parcial), 3 (parcial) completas.
Objetivo: llegar a un flujo testeable end-to-end lo antes posible, luego iterar.

---

## Estado del código

| Archivo | Estado | Notas |
|---|---|---|
| `app/main.py` | OK | Routers registrados |
| `app/config.py` | OK | Todas las env vars, incluyendo `ACTIVE_DEVELOPER_ID` y `DEV_PHONE` |
| `app/database.py` | OK | Pool asyncpg |
| `app/models/*` | OK | Pydantic models completos |
| `migrations/001_initial_schema.sql` | OK | 16 tablas (incl. `unit_notes`), pgvector, 7 índices |
| `migrations/002_lead_qualification_fields.sql` | OK | Incremental: `budget_usd`, `bedrooms`, `location_pref` en `leads` |
| `migrations/003_project_details.sql` | OK | Incremental: campos detallados en `projects` |
| `migrations/004_unit_notes.sql` | OK | Incremental: tabla `unit_notes` |
| `modules/whatsapp/webhook.py` | OK | Parseo de mensajes, routing |
| `modules/whatsapp/sender.py` | OK | Envío texto, docs, imágenes, templates |
| `modules/whatsapp/media.py` | OK | Download de media + `download_media_with_filename` |
| `modules/whatsapp/templates.py` | OK | Templates formateados |
| `modules/whatsapp/providers/base.py` | OK | `IncomingMessage` normalizado + `WhatsAppProvider` protocol |
| `modules/whatsapp/providers/twilio.py` | OK | Twilio provider con `follow_redirects=True` y extracción de filename |
| `modules/whatsapp/providers/meta.py` | OK | Meta Cloud API provider |
| `modules/agent/router.py` | OK | `resolve_developer` por `ACTIVE_DEVELOPER_ID` (dev) o `whatsapp_number` (prod), routing lead vs developer por `DEV_PHONE` |
| `modules/agent/session.py` | OK | CRUD sesiones, `get_developer_context` multi-proyecto, conversaciones |
| `modules/agent/prompts.py` | OK | System prompts para lead + developer, extraction prompt, acciones admin |
| `modules/agent/classifier.py` | OK | Llama Claude, parsea JSON multi-intent |
| `modules/agent/lead_handler.py` | OK | Flujo completo: sesión → contexto multi-proyecto → calificación → Claude → doc sharing → WA |
| `modules/agent/dev_handler.py` | OK | Admin mode completo: commands, unit mgmt, notes, PDF upload, CSV project load, doc sharing |
| `modules/rag/ingestion.py` | **Parcial** | `find_document_for_sharing` funciona, falta extract PDF y embeddings reales |
| `modules/rag/chunker.py` | **Parcial** | Generic chunking funciona, especializados son TODO |
| `modules/rag/retrieval.py` | OK* | Funciona pero depende de embeddings stub |
| `modules/storage.py` | OK | Upload a Supabase S3, presigned URLs, estructura `projects/{slug}/{filename}` |
| `modules/project_loader.py` | OK | Parseo CSV → crear proyecto + unidades |
| `modules/media/transcription.py` | OK | Whisper API |
| `modules/media/processor.py` | **Parcial** | `detect_document_type` heurístico, `extract_obra` devuelve `{}` |
| `modules/leads/qualification.py` | OK | 7 campos, scoring progresivo, extracción con Claude |
| `modules/leads/alerts.py` | OK | Alerta WA al vendedor |
| `modules/leads/nurturing.py` | **Parcial** | Falta generar mensaje con Claude |
| `modules/handoff/manager.py` | OK | check/initiate/close handoff |
| `modules/handoff/chatwoot.py` | **Stub** | Webhook endpoint OK, API calls TODO |
| `modules/nocodb_webhook.py` | **Stub** | Endpoint OK, handler TODO |
| `modules/obra/*` | OK | CRUD updates, milestones, notifier |
| `app/admin/api.py` | **Parcial** | Upload docs, manage units/projects, CSV loader, leads/metrics stubs |
| `templates/proyecto_template.csv` | OK | Template CSV para carga de proyectos |
| `scripts/seed_dev.py` | OK | Seed Torre Palermo + 7 unidades |
| `scripts/seed_manzanares.py` | OK | Seed Manzanares 2088 + 8 unidades + docs |
| `scripts/generate_pdfs_manzanares.py` | OK | Genera PDFs reales con reportlab y sube a S3 |

---

## Fases de implementación

### Fase 0: Infra base (poder hacer deploy y recibir un mensaje)

**Estado: COMPLETA**

- [x] Crear base de datos en Neon (free tier) — habilitar extensión `vector` y `pgcrypto`
- [x] Correr migración SQL contra la PG de Neon — 16 tablas + 7 índices creados
- [x] Crear `.env` local con todas las variables
- [x] Instalar dependencias (`venv` + `pip install -r requirements.txt`)
- [x] Levantar FastAPI local (`uvicorn app.main:app --reload --port 8000`)
- [x] Exponer con ngrok — `/health` responde OK desde internet
- [x] Refactorizar WhatsApp module con provider pattern (Twilio + Meta intercambiables)
- [x] Crear cuenta Twilio y configurar WhatsApp Sandbox
- [x] Configurar webhook de Twilio apuntando a `{ngrok_url}/whatsapp/webhook`
- [x] Mensaje de WA llega al webhook — 200 OK confirmado

---

### Fase 1A: Agente Lead básico (sin RAG)

**Estado: COMPLETA**

- [x] `agent/classifier.py` — Parsea respuesta JSON de Claude (multi-intent)
- [x] `agent/lead_handler.py` — Flujo completo: sesión → contexto proyecto → Claude → respuesta WA → guardar en DB
- [x] `agent/session.py` — `get_developer_context` consulta todos los proyectos del developer + units + docs
- [x] `agent/prompts.py` — System prompt para agente inmobiliario
- [x] Crear script `scripts/seed_dev.py` — Proyecto demo (Torre Palermo) + 7 unidades
- [x] Modelo configurable via `ANTHROPIC_MODEL` env var (Claude Haiku 4.5 para dev)
- [x] Test e2e: "hola" por WA → agente responde con info del proyecto ✓

---

### Fase 1B: Lead Qualification + Document Sharing

**Estado: COMPLETA**

- [x] Lead Qualification — scoring progresivo con 7 campos (name, intent, financing, timeline, budget_usd, bedrooms, location_pref)
- [x] Extracción de datos con Claude (`EXTRACTION_PROMPT`) al final de cada mensaje
- [x] Merge inteligente de datos extraídos (nunca sobreescribe con null)
- [x] Calificación inyectada al prompt del lead (campos conocidos + campos faltantes)
- [x] Document Sharing — el agente detecta marcadores `[ENVIAR_DOC:tipo:unidad:proyecto-slug]` y envía PDFs
- [x] `storage.py` — Upload a Supabase S3, presigned URLs funcionales
- [x] `find_document_for_sharing` busca docs por tipo, unidad y proyecto en la DB
- [x] Soporte multi-proyecto: el lead puede preguntar por cualquier proyecto del developer
- [x] Seed data para Manzanares 2088 (8 unidades + 7 PDFs reales en S3)

---

### Fase 2: RAG con documentos reales

**Estado: PENDIENTE**

- [ ] `rag/ingestion.py` — Implementar `generate_embedding` con OpenAI API real
- [ ] `rag/ingestion.py` — Implementar `extract_text_from_pdf` (PyPDF2 o pdfplumber)
- [ ] `rag/chunker.py` — Mejorar chunking para listas de precios (tablas) y brochures
- [ ] `rag/retrieval.py` — Testear calidad de retrieval con documentos reales
- [ ] Ajustar prompts según resultados de testing

**Nota:** Actualmente la info relevante está en la DB (projects, units, documents metadata). El RAG será útil cuando haya documentos extensos (memorias descriptivas, contratos) cuyo contenido no cabe en el contexto.

---

### Fase 3: Modo Developer (Admin por WhatsApp)

**Estado: COMPLETA**

- [x] `agent/dev_handler.py` — Admin mode funcional con Claude para interpretar comandos
- [x] Acciones implementadas:
  - `update_unit_status` — Cambiar estado de unidades (available/reserved/sold)
  - `update_unit_price` — Actualizar precio de unidades
  - `add_unit_note` — Agregar notas/comentarios a unidades
  - `get_lead_detail` — Ver detalle de un lead por teléfono
  - `update_project` — Actualizar campos del proyecto por chat
  - `create_project_instructions` — Enviar template CSV para carga de nuevo proyecto
- [x] PDF upload conversacional: developer manda PDF → agente pregunta proyecto y tipo → sube a S3 → registra en DB
- [x] CSV project loader: developer manda CSV con datos del proyecto y unidades → resumen → confirmación → crea todo en DB
- [x] Document sharing en modo admin (mismos marcadores que leads)
- [x] Greeting personalizado en modo admin (`🔧 Modo Admin — {nombre}`)
- [x] Detección real de filename desde headers HTTP de Twilio
- [x] Routing developer por `DEV_PHONE` (dev) o `authorized_numbers` (prod)
- [x] Template CSV (`templates/proyecto_template.csv`) con todos los campos

---

### Fase 4: Handoff a Chatwoot

**Estado: PENDIENTE**

- [ ] Deploy Chatwoot en Railway con su PostgreSQL propia
- [ ] Configurar inbox de WhatsApp en Chatwoot
- [ ] `handoff/chatwoot.py` — Implementar create/forward/webhook handlers
- [ ] Configurar webhook de Chatwoot → `{railway_url}/chatwoot/webhook`

---

### Fase 5: NocoDB como panel de gestión

**Estado: PENDIENTE**

- [ ] Deploy NocoDB en Railway, conectar a la PG de Realia
- [ ] Configurar tablas expuestas: projects, units, leads, documents, obra_updates
- [ ] Configurar S3 como storage de attachments en NocoDB
- [ ] `nocodb_webhook.py` — Implementar handlers

---

### Fase 6: Seguimiento de obra + notificaciones

**Estado: PENDIENTE**

- [ ] Conectar flujo: obra update → milestone check → notificación a compradores
- [ ] `leads/nurturing.py` — Implementar generación de mensaje con Claude
- [ ] Configurar cron jobs para nurturing y obra notifications
- [ ] `admin/api.py` — Implementar endpoints de métricas

---

## Dependencias externas

| Servicio | Qué se necesita | Fase | Estado |
|---|---|---|---|
| Neon | PostgreSQL con pgvector | 0 | ✅ Configurado |
| Twilio | WhatsApp Sandbox | 0 | ✅ Configurado |
| ngrok | Tunnel local | 0 | ✅ Configurado |
| Anthropic | API key (Claude Haiku 4.5) | 1 | ✅ Configurado |
| Supabase Storage | S3-compatible storage | 1 | ✅ Configurado |
| OpenAI | Whisper + embeddings | 2 | ⬜ Pendiente |
| WhatsApp Cloud API (Meta) | Business account | prod | ⬜ Pendiente |
| Railway | Deploy completo | 4 | ⬜ Pendiente |
| Chatwoot | Inbox de ventas | 4 | ⬜ Pendiente |
| NocoDB | Panel de gestión | 5 | ⬜ Pendiente |

---

## Notas

- **Fase 1 es el hito critico.** Si un lead puede mandar un mensaje y recibir una respuesta inteligente, tenemos producto. Todo lo demás es iteración.
- **El RAG no es urgente** porque la info esencial (proyectos, unidades, precios, amenities, formas de pago) ya está en la DB y se inyecta como contexto. El RAG agrega valor cuando haya docs extensos (memorias, contratos).
- **Seed data antes de testear.** Sin datos en la DB, no hay nada que probar.
- **Logging agresivo al principio.** Loguear todo: mensajes entrantes, clasificaciones, respuestas. Después se limpia.
