---
date: 2026-03-14
topic: password-recovery
status: approved
---

# Password Recovery — Design

## Contexto

El sistema actual no tiene flujo de recuperación de contraseña. El único reset existente es admin-iniciado (`POST /admin/users/{user_id}/reset-password`). Aplica a usuarios admin (vendedores, gerentes, etc.) y al portal de compradores/inversores.

## Decisiones

- **Email service:** Resend (dominio `realia.lat`, free tier 3.000/mes)
- **Token strategy:** Token aleatorio en DB (no JWT) para poder invalidar inmediatamente al usarse
- **Expiración:** 30 minutos

---

## Base de datos

Nueva migración (`040_password_reset_tokens.sql`):

```sql
CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON password_reset_tokens(token);
```

---

## Backend

### Nuevo módulo: `app/services/email_service.py`

Wrapper de Resend con función:
- `send_password_reset_email(to: str, reset_url: str) -> None`

Config var nueva: `RESEND_API_KEY` en `.env` y Railway.

### Endpoints nuevos en `app/admin/routers/auth.py`

**`POST /admin/auth/forgot-password`**
- Body: `{ "email": "..." }`
- Busca el usuario en `users` (activo)
- Genera token UUID aleatorio
- Inserta en `password_reset_tokens` con `expires_at = NOW() + 30min`
- Envía email via Resend con link `https://app.realia.lat/reset-password?token=xxx`
- **Siempre responde 200** (no revelar si el email existe)

**`POST /admin/auth/reset-password`**
- Body: `{ "token": "...", "new_password": "..." }`
- Valida: token existe, `used_at IS NULL`, `expires_at > NOW()`
- Actualiza `password_hash` en `users` + `debe_cambiar_password = false`
- Marca `used_at = NOW()` en el token
- Responde 200 en éxito, 400 si token inválido/expirado

---

## Frontend

### Página `/forgot-password` (pública)

- Form con input de email + botón "Enviar instrucciones"
- Al submit: `POST /admin/auth/forgot-password`
- Siempre muestra: "Si el email existe, recibirás un link en minutos" (sin importar el resultado)

### Página `/reset-password` (pública)

- Lee `?token` de la URL
- Form con "Nueva contraseña" + "Confirmar contraseña"
- Al submit: `POST /admin/auth/reset-password`
- En éxito: redirige a `/` con mensaje de éxito
- En error (token inválido/expirado): muestra mensaje y link a `/forgot-password`

### Modificación en página de login (`/`)

Agregar link "¿Olvidaste tu contraseña?" debajo del botón de login.

---

## Variables de entorno

```
RESEND_API_KEY=re_...
```

Agregar en Railway (frontend no necesita esta var, solo el backend).

---

## Dependencia nueva

```
resend
```

Agregar a `requirements.txt`.
