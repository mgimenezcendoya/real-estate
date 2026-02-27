# Plan de Implementación — Realia V1

Estado actual: estructura completa, modelos definidos, stubs en todos los módulos.
Objetivo: llegar a un flujo testeable end-to-end lo antes posible, luego iterar.

---

## Estado del código

| Archivo | Estado | Notas |
|---|---|---|
| `app/main.py` | OK | Routers registrados |
| `app/config.py` | OK | Todas las env vars |
| `app/database.py` | OK | Pool asyncpg |
| `app/models/*` | OK | Pydantic models completos |
| `migrations/001_initial_schema.sql` | OK | 15 tablas, pgvector |
| `modules/whatsapp/webhook.py` | OK | Parseo de mensajes, routing |
| `modules/whatsapp/sender.py` | OK | Envio texto, docs, imagenes, templates |
| `modules/whatsapp/media.py` | OK | Download de media de WA |
| `modules/whatsapp/templates.py` | OK | Templates formateados |
| `modules/agent/router.py` | **Parcial** | Fallback single-project, falta mapeo real |
| `modules/agent/session.py` | OK | CRUD sesiones y conversaciones |
| `modules/agent/prompts.py` | OK | System prompts |
| `modules/agent/classifier.py` | **Parcial** | Llama Claude pero devuelve hardcoded `["otro"]` |
| `modules/agent/lead_handler.py` | **Stub** | Solo setup, logica TODO |
| `modules/agent/dev_handler.py` | **Stub** | Solo checks, logica TODO |
| `modules/rag/ingestion.py` | **Parcial** | Flujo armado, falta extract PDF y embeddings reales |
| `modules/rag/chunker.py` | **Parcial** | Generic chunking funciona, especializados son TODO |
| `modules/rag/retrieval.py` | OK* | Funciona pero depende de embeddings stub |
| `modules/storage.py` | **Parcial** | Upload devuelve placeholder, download funciona |
| `modules/media/transcription.py` | OK | Whisper API |
| `modules/media/processor.py` | **Parcial** | detect_document_type heurístico, extract_obra devuelve `{}` |
| `modules/leads/qualification.py` | OK | Scoring y next question |
| `modules/leads/alerts.py` | OK | Alerta WA al vendedor |
| `modules/leads/nurturing.py` | **Parcial** | Falta generar mensaje con Claude |
| `modules/handoff/manager.py` | OK | check/initiate/close handoff |
| `modules/handoff/chatwoot.py` | **Stub** | Webhook endpoint OK, API calls TODO |
| `modules/nocodb_webhook.py` | **Stub** | Endpoint OK, handler TODO |
| `modules/obra/*` | OK | CRUD updates, milestones, notifier |
| `app/admin/api.py` | **Parcial** | Endpoints definidos, muchos devuelven `[]` |

---

## Fases de implementación

### Fase 0: Infra base (poder hacer deploy y recibir un mensaje)

**Objetivo:** Deploy gratis, webhook conectado, un mensaje de WA llega y se loguea.

**Plataforma:** Neon (PostgreSQL) + ngrok + Twilio Sandbox. Gratis. Migración a Render/Railway después es solo cambiar env vars.

**Estado: COMPLETA**

- [x] Crear base de datos en Neon (free tier) — habilitar extensión `vector` y `pgcrypto`
- [x] Correr migración SQL contra la PG de Neon — 14 tablas + 7 índices creados
- [x] Crear `.env` local con `DATABASE_URL` de Neon
- [x] Instalar dependencias (`venv` + `pip install -r requirements.txt`)
- [x] Levantar FastAPI local (`uvicorn app.main:app --reload --port 8000`)
- [x] Exponer con ngrok — `/health` responde OK desde internet
- [x] Refactorizar WhatsApp module con provider pattern (Twilio + Meta intercambiables)
- [x] Crear cuenta Twilio y configurar WhatsApp Sandbox
- [x] Configurar webhook de Twilio apuntando a `{ngrok_url}/whatsapp/webhook`
- [x] Mensaje de WA llega al webhook — 200 OK confirmado

**Nota dev:** Se usa ngrok + Twilio Sandbox para desarrollo (iteración rápida, sin deploys, sin verificación Meta). Render + Meta Cloud API se configura cuando el código esté estable.

**Test:** Enviar un mensaje de WA vía Twilio Sandbox → ver en logs de la terminal que llegó.

---

### Fase 1: Modo Lead básico (el agente responde)

**Objetivo:** Un lead manda un mensaje, el agente responde con texto usando RAG.

Archivos a implementar:

- [ ] `agent/classifier.py` — Parsear la respuesta de Claude en vez de hardcodear `["otro"]`
- [ ] `agent/lead_handler.py` — Flujo completo:
  1. Obtener/crear sesion y lead
  2. Clasificar intención
  3. Si RAG → buscar contexto → generar respuesta con Claude → enviar por WA
  4. Si calificación → hacer pregunta → actualizar lead score
  5. Guardar conversación en DB
- [ ] `agent/router.py` — Mapeo real de `phone_number_id` → `project_id` (query a tabla `projects`)
- [ ] `rag/ingestion.py` — Implementar `generate_embedding` con OpenAI API real
- [ ] `rag/ingestion.py` — Implementar `extract_text_from_pdf` (PyPDF2 o pdfplumber)
- [ ] `storage.py` — Implementar `upload_file` real con aioboto3

**Prerequisito:** Tener al menos 1 proyecto y 1-2 documentos ingresados en la DB para que RAG tenga contenido.

**Seed data:**
- [ ] Crear script `scripts/seed_dev.py` que inserte un proyecto de prueba, unidades, y authorized_numbers

**Test:** Enviar "cuanto sale un 2 ambientes?" por WA → el agente responde con info del proyecto seed.

---

### Fase 2: RAG con documentos reales

**Objetivo:** Poder ingestar PDFs reales y que las respuestas usen esa información.

- [ ] `rag/chunker.py` — Mejorar chunking para listas de precios (tablas) y brochures
- [ ] Crear endpoint o script para ingestar documentos manualmente: `POST /admin/ingest-document`
- [ ] `rag/retrieval.py` — Testear calidad de retrieval con documentos reales del cliente ancla
- [ ] Ajustar prompts en `agent/prompts.py` según resultados de testing

**Test:** Subir PDF de lista de precios real → preguntar precios por WA → respuesta correcta.

---

### Fase 3: Modo Developer básico

**Objetivo:** Un developer autorizado puede enviar updates de obra y documentos por WA.

- [ ] `agent/dev_handler.py` — Implementar flujo:
  1. Audio → transcripción (Whisper) → structured update → confirmar → guardar
  2. PDF/imagen → clasificación conversacional → subir a S3 → ingestar en RAG
  3. Texto → interpretar comando (query, config, update)
- [ ] `media/processor.py` — `extract_obra_update`: parsear transcripción con Claude
- [ ] Testear flujo de activación de número autorizado

**Test:** Enviar audio de "la obra del proyecto X avanzó al 60%, ya terminamos la losa del piso 5" → el agente extrae datos estructurados → confirma → guarda.

---

### Fase 4: Handoff a Chatwoot

**Objetivo:** Cuando un lead está caliente, se crea conversación en Chatwoot y el vendedor puede responder.

- [ ] Deploy Chatwoot en Railway con su PostgreSQL propia
- [ ] Configurar inbox de WhatsApp en Chatwoot (o custom inbox)
- [ ] `handoff/chatwoot.py` — Implementar:
  1. `create_chatwoot_conversation`: crear contacto + conversación con contexto
  2. `forward_to_chatwoot`: reenviar mensajes del lead durante handoff
  3. `handle_chatwoot_webhook`: `message_created` → forward respuesta del vendedor por WA
  4. `handle_chatwoot_webhook`: `conversation_resolved` → cerrar handoff
- [ ] Configurar webhook de Chatwoot → `{railway_url}/chatwoot/webhook`

**Test:** Lead dice "quiero agendar una visita" → handoff se activa → vendedor ve conversación en Chatwoot → vendedor responde → lead recibe respuesta por WA.

---

### Fase 5: NocoDB como panel de gestión

**Objetivo:** El equipo del developer puede ver y editar datos desde NocoDB.

- [ ] Deploy NocoDB en Railway, conectar a la PG de Realia
- [ ] Configurar tablas expuestas: projects, units, leads, documents, obra_updates
- [ ] Configurar S3 (Cloudflare R2) como storage de attachments en NocoDB
- [ ] `nocodb_webhook.py` — Implementar handlers:
  1. Nuevo documento subido → trigger ingesta RAG
  2. Cambio en config de proyecto → invalidar cache
- [ ] Configurar webhooks de NocoDB → `{railway_url}/nocodb/webhook`

**Test:** Subir PDF desde NocoDB → aparece en RAG → lead puede preguntar sobre ese contenido.

---

### Fase 6: Seguimiento de obra + notificaciones

**Objetivo:** Developers registran hitos, compradores reciben notificaciones personalizadas.

- [ ] Conectar flujo completo: obra update → milestone check → notificación a compradores
- [ ] `leads/nurturing.py` — Implementar generación de mensaje con Claude
- [ ] Configurar cron jobs (Render cron o Railway cron) para nurturing y obra notifications
- [ ] `admin/api.py` — Implementar endpoints de métricas básicas

**Test:** Developer registra hito "Losa piso 5 completa" → compradores de unidades en piso 5 reciben mensaje personalizado por WA.

---

## Dependencias externas a configurar

| Servicio | Qué se necesita | Fase | Costo |
|---|---|---|---|
| Neon | Cuenta, base de datos con pgvector | 0 | Gratis (0.5GB) |
| Render | Cuenta, conectar repo GitHub | 0 | Gratis (spin-down) |
| Twilio | Cuenta + WhatsApp Sandbox activado | 0 | Gratis (sandbox) |
| WhatsApp Cloud API (Meta) | Business account, phone number, app en Meta Developers | prod | Gratis (1000 conv/mes) |
| Anthropic | API key con créditos | 1 | ~$5-10/mes dev |
| OpenAI | API key con créditos (Whisper + embeddings) | 1 | ~$2-5/mes dev |
| Cloudflare R2 | Bucket + access keys | 1 | Gratis (10GB) |
| Railway | Cuenta, proyecto completo | 4 | $5-20/mes |
| Chatwoot | Deploy en Railway | 4 | (incluido en Railway) |
| NocoDB | Deploy en Railway | 5 | (incluido en Railway) |

### Migración dev → prod (cuando llegue el momento)

1. `pg_dump` desde Neon → `pg_restore` en Railway PostgreSQL
2. En Railway: crear servicios (Realia, Chatwoot, NocoDB), 2x PostgreSQL
3. Copiar env vars, cambiar `DATABASE_URL` a la nueva PG
4. Actualizar webhook URLs en WhatsApp, Chatwoot, NocoDB
5. Done — la app es idéntica, solo cambia dónde corre

---

## Notas

- **Fase 1 es el hito critico.** Si un lead puede mandar un mensaje y recibir una respuesta inteligente, tenemos producto. Todo lo demás es iteración.
- **No optimizar antes de probar.** Chunking básico primero, mejorar con docs reales después.
- **Seed data antes de testear.** Sin datos en la DB, no hay nada que probar.
- **Logging agresivo al principio.** Loguear todo: mensajes entrantes, clasificaciones, queries RAG, respuestas. Después se limpia.
