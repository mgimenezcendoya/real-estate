# app/admin/routers/auth.py
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.auth import (authenticate_user_db,
                             create_token, hash_password,
                             update_ultimo_acceso, verify_token)
from app.admin.deps import ADMIN_ROLES, _audit, _get_actor, _require_admin, security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
async def auth_login(body: LoginBody):
    """Validate credentials against the users table and return a JWT."""
    pool = await get_pool()

    # 1. Primary: DB-based auth
    db_user = await authenticate_user_db(pool, body.username, body.password)
    if db_user:
        await update_ultimo_acceso(pool, str(db_user["id"]))
        org_row = await pool.fetchrow(
            "SELECT name FROM organizations WHERE id = $1", db_user["organization_id"]
        )
        organization_name = org_row["name"] if org_row else None
        token = create_token(
            sub=db_user["email"],
            role=db_user["role"],
            user_id=str(db_user["id"]),
            organization_id=str(db_user["organization_id"]),
            nombre=f"{db_user['nombre']} {db_user['apellido']}".strip(),
        )
        return {
            "token": token,
            "user": db_user["email"],
            "role": db_user["role"],
            "nombre": f"{db_user['nombre']} {db_user['apellido']}".strip(),
            "user_id": str(db_user["id"]),
            "organization_id": str(db_user["organization_id"]),
            "organization_name": organization_name,
            "debe_cambiar_password": db_user["debe_cambiar_password"],
        }

    raise HTTPException(status_code=401, detail="Credenciales inválidas")


@router.get("/auth/me")
async def auth_me(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Return current user identity from JWT."""
    if not credentials or credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="No autorizado")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    result = {
        "user": payload.get("sub"),
        "role": payload.get("role"),
        "nombre": payload.get("nombre"),
        "user_id": payload.get("user_id"),
        "organization_id": payload.get("organization_id"),
    }
    user_id = payload.get("user_id")
    if user_id:
        try:
            pool = await get_pool()
            row = await pool.fetchrow(
                """SELECT u.debe_cambiar_password, o.name AS organization_name
                   FROM users u
                   LEFT JOIN organizations o ON o.id = u.organization_id
                   WHERE u.id = $1""",
                user_id,
            )
            if row:
                result["debe_cambiar_password"] = row["debe_cambiar_password"]
                result["organization_name"] = row["organization_name"]
        except Exception:
            pass
    return result


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(
    body: ChangePasswordBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Allow any authenticated user to change their own password."""
    if not credentials or credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = verify_token(credentials.credentials)
    if not payload or not payload.get("user_id"):
        raise HTTPException(status_code=401, detail="Token inválido o usuario legacy")
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, password_hash FROM users WHERE id = $1", payload["user_id"]
    )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    from app.admin.auth import verify_password as vp
    if not vp(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 8 caracteres")
    new_hash = hash_password(body.new_password)
    await pool.execute(
        "UPDATE users SET password_hash = $1, debe_cambiar_password = false WHERE id = $2",
        new_hash, payload["user_id"],
    )
    return {"ok": True}


class UserCreateBody(BaseModel):
    organization_id: str
    email: str
    password: str
    nombre: str
    apellido: str = ""
    role: str = "vendedor"


class UserUpdateBody(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    role: Optional[str] = None
    activo: Optional[bool] = None


class PasswordResetBody(BaseModel):
    new_password: str


class ForgotPasswordBody(BaseModel):
    email: str

class ResetPasswordBody(BaseModel):
    token: str
    new_password: str


@router.get("/users")
async def list_users(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """List all users. Admin/superadmin only."""
    _require_admin(credentials)
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT u.id, u.email, u.nombre, u.apellido, u.role, u.activo,
                  u.debe_cambiar_password, u.ultimo_acceso, u.created_at,
                  u.organization_id, o.name AS organization_name
           FROM users u
           JOIN organizations o ON o.id = u.organization_id
           ORDER BY u.created_at DESC"""
    )
    return [dict(r) for r in rows]


@router.get("/users/{user_id}")
async def get_user(user_id: str, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Get a single user. Admin/superadmin only."""
    _require_admin(credentials)
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT u.id, u.email, u.nombre, u.apellido, u.role, u.activo,
                  u.debe_cambiar_password, u.ultimo_acceso, u.created_at,
                  u.organization_id, o.name AS organization_name
           FROM users u
           JOIN organizations o ON o.id = u.organization_id
           WHERE u.id = $1""",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return dict(row)


@router.post("/users")
async def create_user(body: UserCreateBody, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Create a new user. Admin/superadmin only."""
    _require_admin(credentials)
    pool = await get_pool()

    existing = await pool.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")

    valid_roles = {"superadmin", "admin", "gerente", "vendedor", "lector"}
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {', '.join(valid_roles)}")

    hashed = hash_password(body.password)
    row = await pool.fetchrow(
        """INSERT INTO users (organization_id, email, password_hash, nombre, apellido, role, debe_cambiar_password)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id, email, nombre, apellido, role, activo, debe_cambiar_password, created_at""",
        body.organization_id, body.email, hashed, body.nombre, body.apellido, body.role,
    )
    return dict(row)


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdateBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Update user fields. Admin/superadmin only."""
    _require_admin(credentials)
    pool = await get_pool()

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await pool.fetchrow(
        f"UPDATE users SET {set_clauses} WHERE id = $1 RETURNING id, email, nombre, apellido, role, activo",
        user_id, *values,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return dict(row)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Deactivate a user (soft delete). Admin/superadmin only."""
    _require_admin(credentials)
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE users SET activo = false WHERE id = $1 RETURNING id, email",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True, "user_id": str(row["id"])}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    body: PasswordResetBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Reset a user's password. Admin/superadmin only."""
    _require_admin(credentials)
    pool = await get_pool()
    hashed = hash_password(body.new_password)
    row = await pool.fetchrow(
        "UPDATE users SET password_hash = $1, debe_cambiar_password = true WHERE id = $2 RETURNING id, email",
        hashed, user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True, "user_id": str(row["id"])}


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
