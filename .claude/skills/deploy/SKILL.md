---
name: deploy
description: Deploy checklist for Railway. Use when the user wants to deploy, merge to main, push changes, or asks if something is ready to ship. Enforces branch, build, and production verification before declaring done.
---

## Deploy Checklist

Follow these steps **in order** before telling the user anything is deployed or ready.

1. **Check branch state** — run `git status` and `git log origin/main..HEAD --oneline`. If there are commits not on main, merge or create a PR first.

2. **Run backend tests** — `cd /Users/mcendoya/repos/real-estate && python -m pytest` (or `python -m py_compile` on changed files if no test suite). Fix any failures before continuing.

3. **Run frontend build** — `cd /Users/mcendoya/repos/real-estate/frontend && npm run build`. Fix any TypeScript or build errors before continuing.

4. **Merge to main** — ensure all changes are on `main` (Railway deploys from `main`). Create a PR or merge directly if appropriate.

5. **Push to origin** — `git push origin main`.

6. **Verify production** — hit the production URL (`https://realia-production-318c.up.railway.app/health`) and confirm the fix works end-to-end, not just locally.

Do NOT tell the user deployment is complete until step 6 passes.
