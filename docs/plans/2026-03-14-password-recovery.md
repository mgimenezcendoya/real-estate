# Password Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar flujo self-service de recuperación de contraseña vía email (token en DB + Resend).

**Architecture:** Token aleatorio UUID guardado en `password_reset_tokens` con expiración 30 min. Backend expone dos endpoints públicos: solicitar reset y confirmar nuevo password. Frontend con dos páginas nuevas (`/forgot-password`, `/reset-password`).

**Tech Stack:** FastAPI + asyncpg (backend), Next.js App Router + React (frontend), Resend API (email), PostgreSQL (tokens).

---

### Task 1: Migración de base de datos

**Files:**
- Create: `migrations/040_password_reset_tokens.sql`

**Step 1: Crear el archivo de migración**

```sql
-- migrations/040_password_reset_tokens.sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
```

**Step 2: Aplicar la migración en Railway**

```bash
psql $DATABASE_URL -f migrations/040_password_reset_tokens.sql
```

Expected: `CREATE TABLE` + `CREATE INDEX`

**Step 3: Verificar que la tabla existe**

```bash
psql $DATABASE_URL -c "\d password_reset_tokens"
```

Expected: tabla con columnas id, user_id, token, expires_at, used_at, created_at

**Step 4: Commit**

```bash
git add migrations/040_password_reset_tokens.sql
git commit -m "feat: add password_reset_tokens migration"
```

---

### Task 2: Instalar Resend y configurar email service

**Files:**
- Modify: `requirements.txt`
- Create: `app/services/email_service.py`
- Modify: `app/config.py`
- Modify: `.env` (agregar variable local)

**Step 1: Agregar resend a requirements.txt**

En `requirements.txt`, agregar al final:
```
resend
```

**Step 2: Instalar la dependencia**

```bash
pip install resend
```

Expected: `Successfully installed resend-...`

**Step 3: Agregar RESEND_API_KEY a config.py**

En `app/config.py`, dentro de la clase `Settings` (o similar), agregar:
```python
resend_api_key: str = ""
resend_from_email: str = "support@realia.lat"
app_url: str = "https://app.realia.lat"
```

**Step 4: Crear app/services/email_service.py**

```python
# app/services/email_service.py
import logging
import resend
from app.config import get_settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to: str, reset_url: str) -> None:
    """Send password reset email via Resend."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not set — skipping email send")
        return

    resend.api_key = settings.resend_api_key

    resend.Emails.send({
        "from": f"REALIA <{settings.resend_from_email}>",
        "to": [to],
        "subject": "Recuperá tu contraseña — REALIA",
        "html": f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #1d4ed8; font-size: 20px; margin-bottom: 8px;">Recuperá tu contraseña</h2>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta REALIA.
            Hacé click en el botón para continuar. El link es válido por 30 minutos.
          </p>
          <a href="{reset_url}"
             style="display:inline-block;margin:24px 0;padding:12px 24px;background:#1d4ed8;color:#fff;
                    border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
            Restablecer contraseña
          </a>
          <p style="color:#9ca3af;font-size:12px;">
            Si no solicitaste este cambio, podés ignorar este email. Tu contraseña no será modificada.
          </p>
          <p style="color:#9ca3af;font-size:12px;">
            O copiá este link en tu navegador:<br/>
            <span style="color:#1d4ed8;">{reset_url}</span>
          </p>
        </div>
        """,
    })
    logger.info("Password reset email sent to %s", to)
```

**Step 5: Agregar RESEND_API_KEY a .env**

```
RESEND_API_KEY=re_xxxxxxxx   # completar con la key real de resend.com
```

**Step 6: Commit**

```bash
git add requirements.txt app/services/email_service.py app/config.py
git commit -m "feat: add Resend email service for password reset"
```

---

### Task 3: Backend — endpoints forgot-password y reset-password

**Files:**
- Modify: `app/admin/routers/auth.py`

**Step 1: Agregar los dos Pydantic models al final de los existentes (antes del primer `@router.get`)**

En `app/admin/routers/auth.py`, agregar los modelos luego de `PasswordResetBody`:

```python
class ForgotPasswordBody(BaseModel):
    email: str

class ResetPasswordBody(BaseModel):
    token: str
    new_password: str
```

**Step 2: Agregar el import de secrets y datetime**

Al inicio de `app/admin/routers/auth.py`, agregar:
```python
import secrets
from datetime import datetime, timedelta, timezone
```

**Step 3: Agregar los dos endpoints al final del archivo**

```python
@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    """Request a password reset link. Always returns 200 to avoid email enumeration."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id FROM users WHERE email = $1 AND activo = true",
        body.email.strip().lower(),
    )
    if row:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await pool.execute(
            """INSERT INTO password_reset_tokens (user_id, token, expires_at)
               VALUES ($1, $2, $3)""",
            row["id"], token, expires_at,
        )
        from app.config import get_settings
        from app.services.email_service import send_password_reset_email
        settings = get_settings()
        reset_url = f"{settings.app_url}/reset-password?token={token}"
        try:
            send_password_reset_email(body.email, reset_url)
        except Exception:
            logger.exception("Failed to send password reset email to %s", body.email)
    return {"ok": True}


@router.post("/auth/reset-password")
async def reset_password_with_token(body: ResetPasswordBody):
    """Reset password using a valid reset token."""
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    pool = await get_pool()
    now = datetime.now(timezone.utc)

    token_row = await pool.fetchrow(
        """SELECT id, user_id FROM password_reset_tokens
           WHERE token = $1 AND used_at IS NULL AND expires_at > $2""",
        body.token, now,
    )
    if not token_row:
        raise HTTPException(status_code=400, detail="El link es inválido o ya expiró")

    new_hash = hash_password(body.new_password)
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE users SET password_hash = $1, debe_cambiar_password = false WHERE id = $2",
                new_hash, token_row["user_id"],
            )
            await conn.execute(
                "UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2",
                now, token_row["id"],
            )

    return {"ok": True}
```

**Step 4: Reiniciar el servidor backend y verificar que los endpoints existen**

```bash
curl -s -X POST http://localhost:8000/admin/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

Expected: `{"ok": true}`

**Step 5: Commit**

```bash
git add app/admin/routers/auth.py
git commit -m "feat: add forgot-password and reset-password endpoints"
```

---

### Task 4: Frontend — página /forgot-password

**Files:**
- Create: `frontend/src/app/forgot-password/page.tsx`

**Step 1: Crear la página**

```tsx
// frontend/src/app/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HardHat, Mail, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BASE_URL } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await fetch(`${BASE_URL}/admin/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // silenciar errores de red — siempre mostrar éxito
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-[360px] animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-md shadow-blue-600/20 mb-4">
            <HardHat size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight mb-1">
            Recuperar contraseña
          </h1>
          <p className="text-gray-500 text-sm text-center">
            {sent
              ? 'Revisá tu bandeja de entrada'
              : 'Ingresá tu email y te enviamos un link'}
          </p>
        </div>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center mb-6">
            <p className="text-green-800 text-sm font-medium">
              Si el email está registrado, recibirás un link en los próximos minutos.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Email
              </label>
              <div className={cn(
                'flex rounded-xl border bg-white overflow-hidden transition-all',
                'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
              )}>
                <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
                  <Mail size={16} />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-5 text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white border-0 transition-colors rounded-xl mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Enviando...
                </>
              ) : (
                'Enviar instrucciones'
              )}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verificar que la página levanta sin errores**

Navegar a `http://localhost:3000/forgot-password` — debe mostrar el form.

**Step 3: Commit**

```bash
git add frontend/src/app/forgot-password/page.tsx
git commit -m "feat: add forgot-password page"
```

---

### Task 5: Frontend — página /reset-password

**Files:**
- Create: `frontend/src/app/reset-password/page.tsx`

**Step 1: Crear la página**

```tsx
// frontend/src/app/reset-password/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HardHat, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { BASE_URL } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError('El link es inválido. Solicitá uno nuevo.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? 'Error al restablecer la contraseña');
      }
      setDone(true);
      setTimeout(() => router.push('/'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-[360px] animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-md shadow-blue-600/20 mb-4">
            <HardHat size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight mb-1">
            Nueva contraseña
          </h1>
          <p className="text-gray-500 text-sm text-center">
            {done ? 'Contraseña actualizada' : 'Elegí una contraseña segura'}
          </p>
        </div>

        {done ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center mb-6">
            <p className="text-green-800 text-sm font-medium">
              ¡Contraseña actualizada! Redirigiendo al inicio...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-700">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {/* Nueva contraseña */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Nueva contraseña
              </label>
              <div className={cn(
                'flex rounded-xl border bg-white overflow-hidden transition-all',
                'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
              )}>
                <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
                  <Lock size={16} />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="w-11 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirmar contraseña */}
            <div className="space-y-1.5">
              <label htmlFor="confirm" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Confirmar contraseña
              </label>
              <div className={cn(
                'flex rounded-xl border bg-white overflow-hidden transition-all',
                'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
              )}>
                <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
                  <Lock size={16} />
                </div>
                <input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repetí la contraseña"
                  className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !token}
              className="w-full py-5 text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white border-0 transition-colors rounded-xl mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Actualizando...
                </>
              ) : (
                'Actualizar contraseña'
              )}
            </Button>
          </form>
        )}

        {!done && (
          <div className="mt-6 text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Solicitar un nuevo link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
```

**Step 2: Verificar que la página levanta**

Navegar a `http://localhost:3000/reset-password` — debe mostrar form con error "link inválido".
Navegar a `http://localhost:3000/reset-password?token=test` — debe mostrar el form sin error inicial.

**Step 3: Commit**

```bash
git add frontend/src/app/reset-password/page.tsx
git commit -m "feat: add reset-password page"
```

---

### Task 6: Agregar link "¿Olvidaste tu contraseña?" en la página de login

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Agregar import de Link**

Al inicio del archivo (después de los imports existentes), agregar:
```tsx
import Link from 'next/link';
```

**Step 2: Agregar el link debajo del botón de submit**

En `FormCard`, después del `<Button type="submit">` (antes del `<p>` final con el texto "Acceso restringido"):

```tsx
<div className="text-center mt-3">
  <Link
    href="/forgot-password"
    className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
  >
    ¿Olvidaste tu contraseña?
  </Link>
</div>
```

**Step 3: Verificar visualmente**

Navegar a `http://localhost:3000` — debe aparecer el link debajo del botón "Ingresar".

**Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add forgot password link on login page"
```

---

### Task 7: Configurar Resend y verificar dominio

**Pasos manuales (no código):**

1. Crear cuenta en [resend.com](https://resend.com)
2. Ir a **Domains** → Add Domain → ingresar `realia.lat`
3. Agregar los registros DNS que Resend indica (SPF + DKIM, generalmente 2-3 registros TXT/CNAME)
4. Esperar verificación (puede tardar algunos minutos)
5. Ir a **API Keys** → Create API Key → copiar el valor
6. Agregar en Railway: Settings → Variables → `RESEND_API_KEY=re_xxxxxxxx`
7. También agregar `APP_URL=https://app.realia.lat` si no está ya

**Step 1: Verificar localmente con RESEND_API_KEY real en .env**

```bash
curl -s -X POST http://localhost:8000/admin/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "TU_EMAIL_REAL@gmail.com"}'
```

Expected: `{"ok": true}` y recibir el email en la bandeja de entrada.

---

### Task 8: Test end-to-end del flujo completo

**Step 1: Test flujo completo**

1. Ir a `/forgot-password` → ingresar email de un usuario existente → ver mensaje de éxito
2. Revisar el email recibido → click en el link → llegar a `/reset-password?token=xxx`
3. Ingresar nueva contraseña (mínimo 8 chars) + confirmar → click "Actualizar contraseña"
4. Ver mensaje de éxito → redirección automática a `/`
5. Hacer login con la nueva contraseña → debe funcionar

**Step 2: Test token expirado**

Insertar manualmente un token vencido en DB y verificar que el endpoint devuelve 400:
```sql
INSERT INTO password_reset_tokens (user_id, token, expires_at)
SELECT id, 'test-expired-token', NOW() - INTERVAL '1 hour'
FROM users LIMIT 1;
```

```bash
curl -s -X POST http://localhost:8000/admin/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "test-expired-token", "new_password": "nueva1234"}'
```

Expected: `{"detail": "El link es inválido o ya expiró"}`

**Step 3: Test email no existente**

```bash
curl -s -X POST http://localhost:8000/admin/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "noexiste@realia.lat"}'
```

Expected: `{"ok": true}` (sin revelar que el email no existe)

**Step 4: Commit final + deploy**

```bash
git add -A
git commit -m "chore: final verification password recovery flow"
git push origin feat/mg/depuracion
```

Luego mergear a `main` para que Railway haga el deploy automático.
