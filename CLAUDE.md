# REALIA — Claude Code Guidelines

## Debugging & Bug Fixes

When fixing bugs, verify the fix actually works end-to-end before declaring it done. Do not claim a fix is complete until you've confirmed the original symptom is resolved, not just that the code change was applied.

## Deployment

Always test against the actual deployment target (Railway, production) rather than only locally. When deploying, ensure changes are merged to the correct branch (usually `main`) before telling the user to deploy.

## Workflow

When the user asks for a plan or document, generate the plan document first and wait for approval before executing. Do not start implementing unless explicitly asked.

## Tech Stack & Gotchas

This project uses Python (FastAPI/asyncpg) for the backend and TypeScript (React/Next.js) for the frontend.

- Use `datetime.date` objects (not strings) for asyncpg date parameters
- Ensure all shadcn components are installed before using them in frontend code
- CSS tokens live in `globals.css` `@theme {}` — no `tailwind.config.ts`
- Auth pattern: `credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)` — never use `require_auth`
- DB is Railway PostgreSQL (`postgres.railway.internal:5432`), Railway deploys from `main` branch
