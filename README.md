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
# See docs/CONTEXT.md section 8 for all env vars

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

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/whatsapp/webhook` | GET | WhatsApp verification (Meta) |
| `/whatsapp/webhook` | POST | Receive WhatsApp messages (Twilio or Meta) |
| `/chatwoot/webhook` | POST | Chatwoot events |
| `/nocodb/webhook` | POST | NocoDB record change events |
| `/admin/upload-document` | POST | Upload PDF to a project |
| `/admin/projects` | GET | List all projects |
| `/admin/projects/{id}` | GET/PATCH | Get or update project details |
| `/admin/units/{project_id}` | GET | List units for a project |
| `/admin/units/{id}/status` | PATCH | Update unit status |
| `/admin/units/bulk-status` | PATCH | Bulk update unit statuses |
| `/admin/documents/{project_id}` | GET | List project documents |
| `/admin/load-project` | POST | Create project from CSV upload |
| `/admin/project-template` | GET | CSV template info |
| `/admin/project-template/download` | GET | Download CSV template file |
| `/admin/leads` | GET | List leads (all or by project_id) |
| `/admin/leads/{id}` | GET | Lead detail with conversations |
| `/admin/leads/{id}/message` | POST | Send message as human (activates HITL) |
| `/admin/leads/{id}/handoff` | GET | Handoff status (active or not) |
| `/admin/leads/{id}/handoff/start` | POST | Start human takeover from frontend |
| `/admin/leads/{id}/handoff/close` | POST | End human takeover, return to agent |
| `/admin/metrics/{project_id}` | GET | Project metrics (incl. total_leads) |
| `/admin/chat` | POST | Local chat (dev/testing) |
| `/admin/jobs/nurturing` | POST | Trigger nurturing batch |
| `/admin/jobs/obra-notifications` | POST | Trigger obra notifications |

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

Panel web en `frontend/` (Next.js 16, React 19, Tailwind):

- **Login** (`/`): acceso con usuario y contraseña (configurar `ADMIN_USERNAME` y `ADMIN_PASSWORD` en el backend). Tras ingresar se redirige a Proyectos.
- **Proyectos** (`/proyectos`): listado de proyectos con unidades, pisos, leads y avance; botón "Nuevo Proyecto" sube CSV (mismo template que WhatsApp).
- **Inbox** (`/inbox`): conversaciones agrupadas por teléfono (una por persona), último proyecto de interés; mensajes usuario/agente/humano diferenciados; Human-in-the-Loop: "Tomar conversación", "Terminar intervención", polling cada 5 s.

Desarrollo local: `cd frontend && npm run dev` (puerto 3000). El front usa `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

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

- [CONTEXT.md](docs/CONTEXT.md) — Full project context, architecture, design decisions
- [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — Step-by-step implementation plan with progress tracking
