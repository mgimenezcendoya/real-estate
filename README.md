# Realia

AI-powered platform for real estate developers — WhatsApp agent, RAG over project docs, and construction tracking.

## Quick Start

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy env file and fill in your keys
cp .env.example .env

# Run database migration (requires PostgreSQL with pgvector)
psql $DATABASE_URL < migrations/001_initial_schema.sql

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
| Cloudflare R2 | S3-compatible file storage |

Set `WHATSAPP_PROVIDER=twilio` in `.env` for development, `meta` for production.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/whatsapp/webhook` | GET | WhatsApp verification (Meta) |
| `/whatsapp/webhook` | POST | Receive WhatsApp messages (Twilio or Meta) |
| `/chatwoot/webhook` | POST | Chatwoot events |
| `/nocodb/webhook` | POST | NocoDB record change events |
| `/admin/jobs/nurturing` | POST | Trigger nurturing batch |
| `/admin/jobs/obra-notifications` | POST | Trigger obra notifications |
| `/admin/leads` | GET | List leads by project |
| `/admin/leads/{id}` | GET | Lead detail |
| `/admin/metrics/{project_id}` | GET | Project metrics |
| `/admin/chat` | POST | Local chat (dev/testing) |

## Docs

- [CONTEXT.md](docs/CONTEXT.md) — Full project context, architecture, design decisions
- [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — Step-by-step implementation plan with progress tracking
