# Realia

AI-powered platform for real estate developers — WhatsApp agent, RAG over project docs, and construction tracking.

## Quick Start

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Fill in your keys in .env (all variables centralized here)
# See business/PRODUCTO.md section 8 for all env vars

# Run database migration (requires PostgreSQL with pgvector)
psql $DATABASE_URL < migrations/001_initial_schema.sql

# Seed demo data (optional)
python scripts/seed_dev.py         # Torre Palermo + 7 units
python scripts/seed_manzanares.py  # Manzanares 2088 + 8 units + docs

# Start the server
uvicorn app.main:app --reload --port 8000

# Expose to internet (for WhatsApp webhooks)
ngrok http 8000
```

## Dev Stack (free)

| Service | Purpose |
|---|---|
| Neon | PostgreSQL + pgvector |
| ngrok | Expose local server to internet |
| Twilio Sandbox | WhatsApp messaging (dev) |
| Supabase Storage | S3-compatible file storage |
| Anthropic | Claude Haiku 4.5 (LLM) |

Set `WHATSAPP_PROVIDER=twilio` in `.env` for development, `meta` for production.

## API Endpoints

### Core
| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/whatsapp/webhook` | GET/POST | WhatsApp webhook (verification + incoming messages) |
| `/nocodb/webhook` | POST | NocoDB record change events |

### Auth
| Endpoint | Method | Description |
|---|---|---|
| `/admin/auth/login` | POST | Login — returns JWT token |
| `/admin/auth/me` | GET | Verify token and return current user |

### Projects & Units
| Endpoint | Method | Description |
|---|---|---|
| `/admin/projects` | GET | List all projects |
| `/admin/projects/{id}` | GET/PATCH | Get or update project details |
| `/admin/units/{project_id}` | GET | List units for a project |
| `/admin/units/{id}/status` | PATCH | Update unit status |
| `/admin/units/bulk-status` | PATCH | Bulk update unit statuses |
| `/admin/load-project` | POST | Create project from CSV upload |
| `/admin/project-template` | GET | CSV template info |
| `/admin/project-template/download` | GET | Download CSV template file |

### Leads
| Endpoint | Method | Description |
|---|---|---|
| `/admin/leads` | GET | List leads (all or by `?project_id=&score=`) |
| `/admin/leads/{id}` | GET/PATCH | Lead detail + conversations; update editable fields |
| `/admin/leads/{id}/notes` | GET/POST | List or add team notes |
| `/admin/leads/{id}/notes/{note_id}` | DELETE | Delete a note |
| `/admin/leads/{id}/message` | POST | Send message as human (activates HITL) |
| `/admin/leads/{id}/handoff` | GET | Handoff status |
| `/admin/leads/{id}/handoff/start` | POST | Start human takeover |
| `/admin/leads/{id}/handoff/close` | POST | End human takeover, return to agent |

### Reservations
| Endpoint | Method | Description |
|---|---|---|
| `/admin/reservations/{project_id}` | POST | Create reservation (also marks unit as reserved) |
| `/admin/reservations/{project_id}` | GET | List reservations (`?status=active\|cancelled\|converted`) |
| `/admin/reservation/{reservation_id}` | GET | Reservation detail (used by print page) |
| `/admin/reservations/{reservation_id}` | PATCH | Change status: `cancelled` → unit available; `converted` → unit sold + buyer created |

### Buyers
| Endpoint | Method | Description |
|---|---|---|
| `/admin/buyers/{project_id}` | GET | List active buyers with unit details |
| `/admin/buyers/{project_id}` | POST | Register a buyer manually |

### Documents
| Endpoint | Method | Description |
|---|---|---|
| `/admin/documents/{project_id}` | GET | List active documents |
| `/admin/upload-document` | POST | Upload PDF to a project |

### Obra (construction tracking)
| Endpoint | Method | Description |
|---|---|---|
| `/admin/obra/{project_id}/init` | POST | Initialize 8 standard obra stages |
| `/admin/obra/{project_id}` | GET | Full obra data: stages + updates + photos + overall progress |
| `/admin/obra/etapas/{etapa_id}` | PATCH | Update stage (name, weight, completion %) |
| `/admin/obra/{project_id}/pesos` | PUT | Batch-update stage weights (must sum to 100) |
| `/admin/obra/{project_id}/etapas` | POST | Add a custom stage |
| `/admin/obra/{project_id}/updates` | POST | Create obra update with photos |
| `/admin/obra/updates/{update_id}` | DELETE | Delete update and its photos |
| `/admin/obra/{project_id}/notify/{update_id}` | POST | Notify buyers via WhatsApp |

### Analytics & Jobs
| Endpoint | Method | Description |
|---|---|---|
| `/admin/metrics/{project_id}` | GET | Project metrics (leads by score, units by status) |
| `/admin/analytics/{project_id}` | GET | Full analytics: funnel, revenue, weekly leads, sources |
| `/admin/jobs/nurturing` | POST | Trigger nurturing batch (cron) |
| `/admin/jobs/obra-notifications` | POST | Trigger obra notifications (cron) |

## Developer Mode (Admin via WhatsApp)

Authorized phone numbers get admin access via WhatsApp. Commands include:

- **Unit management:** "marcá la 2B como vendida", "actualizá el precio del PH a 200000"
- **Unit notes:** "dejá una nota en la 3A: el cliente llama el viernes"
- **Project info:** "cómo están las unidades de Manzanares?", "resumen de leads"
- **Document sharing:** "pasame el brochure de Pedraza"
- **PDF upload:** Send a PDF → agent asks project and document type → stores in S3
- **CSV project load:** Send a CSV with project data → agent shows summary → confirms → creates project + units
- **Project updates:** "agregale la descripción a Pedraza: edificio de 5 pisos..."

## Frontend (Next.js)

Panel web en `frontend/` — Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui v3.

Desarrollo local: `cd frontend && npm run dev` (puerto 3000). El front usa `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

### Rutas

| Ruta | Descripción |
|---|---|
| `/` | Login con usuario/contraseña (JWT en sessionStorage) |
| `/proyectos` | Listado de proyectos con métricas; modal "Nuevo Proyecto" sube CSV |
| `/proyectos/[id]` | Dashboard: funnel de leads, revenue (disponible/reservado/vendido), gráfico semanal, fuentes |
| `/proyectos/[id]/unidades` | Grilla de unidades por piso; click abre Sheet con cambio de estado; marcar "reserved" abre flujo de reserva |
| `/proyectos/[id]/leads` | Kanban hot/warm/cold; Sheet de detalle con score, edición, notas del equipo, botón "Reservar unidad" |
| `/proyectos/[id]/reservas` | Lista de reservas con filtros (activa/cancelada/convertida); convertir en venta o cancelar con confirmación |
| `/proyectos/[id]/documentos` | Gestión de documentos por tipo; upload de PDFs |
| `/proyectos/[id]/obra` | Seguimiento de etapas de obra: barra de progreso, actualizar % por etapa, cargar updates con fotos |
| `/proyectos/[id]/reservas/[id]/print` | Comprobante de reserva imprimible (auto-abre diálogo de impresión), sin navegación del proyecto |
| `/inbox` | Conversaciones WhatsApp agrupadas por teléfono; Human-in-the-Loop con polling cada 1.5 s |

### Migraciones

Aplicar en orden:

```bash
psql $DATABASE_URL < migrations/001_initial_schema.sql
psql $DATABASE_URL < migrations/002_lead_qualification_fields.sql
psql $DATABASE_URL < migrations/003_project_details.sql
psql $DATABASE_URL < migrations/004_unit_notes.sql
psql $DATABASE_URL < migrations/005_telegram_handoff.sql
psql $DATABASE_URL < migrations/006_lead_notes.sql
psql $DATABASE_URL < migrations/007_obra_etapas.sql
psql $DATABASE_URL < migrations/009_reservations.sql
```

### Dónde poner las variables en Render

1. **Dashboard de Render** → tu cuenta → cada servicio tiene su pestaña **Environment**.
2. **Backend (servicio `realia`):**
   - **Environment** → **Environment Variables** → Add:
     - `ADMIN_USERNAME`: usuario para el login del panel (ej: `admin`).
     - `ADMIN_PASSWORD`: contraseña para el login (ej: la que quieras).
     - `SECRET_KEY`: si no está, Render puede generarla (se usa para firmar el token de sesión).
     - `CORS_ORIGINS`: URL del frontend, ej. `https://realia-frontend.onrender.com` (sin barra final). Si tenés más orígenes, separados por coma.
     - El resto (DATABASE_URL, API keys, etc.) como ya tengas.
3. **Frontend (servicio `realia-frontend`):**
   - **Environment** → **Environment Variables** → Add:
     - `NEXT_PUBLIC_API_URL`: URL del backend, ej. `https://realia.onrender.com` (sin barra final).
4. Guardar y redeploy si hace falta. Con eso el login del panel usa `ADMIN_USERNAME` / `ADMIN_PASSWORD` y el front puede llamar al backend sin problemas de CORS.

## Docs

- [PRODUCTO.md](business/PRODUCTO.md) — Contexto del producto, arquitectura, decisiones de diseño
- [INFRAESTRUCTURA.md](business/INFRAESTRUCTURA.md) — Stack técnico, costos, análisis de migración
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Arquitectura multi-tenant detallada
- [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — Plan de implementación con progreso
- [ESTRATEGIA.md](marketing/ESTRATEGIA.md) — Estrategia de captación de clientes
- [HERRAMIENTAS.md](marketing/HERRAMIENTAS.md) — Stack de herramientas de marketing
