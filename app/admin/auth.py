"""
Admin panel auth: token generation and verification.

Strategy:
  1. Primary auth: DB users table (bcrypt password, JWT token).
  2. Fallback auth: env vars ADMIN_USERNAME/ADMIN_PASSWORD (legacy, for transition).

Tokens are signed JWTs (PyJWT, HS256, 24h expiry).
JWT payload includes: sub (email or username), user_id, organization_id, role, nombre.
"""

import logging
import time
from typing import Optional

import bcrypt
import jwt

from app.config import get_settings

logger = logging.getLogger(__name__)

TOKEN_EXPIRY_HOURS = 24


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def _get_secret() -> str:
    s = get_settings()
    return s.secret_key or "realia-admin-dev-secret"


def create_token(
    *,
    sub: str,
    role: str,
    user_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    nombre: Optional[str] = None,
) -> str:
    """Create a signed JWT for the given identity."""
    exp = int(time.time()) + (TOKEN_EXPIRY_HOURS * 3600)
    payload: dict = {
        "sub": sub,
        "role": role,
        "exp": exp,
    }
    if user_id:
        payload["user_id"] = user_id
    if organization_id:
        payload["organization_id"] = organization_id
    if nombre:
        payload["nombre"] = nombre
    return jwt.encode(payload, _get_secret(), algorithm="HS256")


def verify_token(token: str) -> Optional[dict]:
    """Verify JWT and return the decoded payload dict, or None if invalid/expired.

    Returns dict with keys: sub, role, and optionally user_id, organization_id, nombre.
    """
    if not token:
        return None
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=["HS256"])
        if "sub" not in payload or "role" not in payload:
            return None
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as exc:
        logger.debug("Invalid token: %s", exc)
        return None


# ---------------------------------------------------------------------------
# DB-based authentication (primary)
# ---------------------------------------------------------------------------

async def authenticate_user_db(pool, email: str, password: str) -> Optional[dict]:
    """Check credentials against the users table.
    Returns user dict on success, None on failure.
    Returns None (not raises) if the users table doesn't exist yet (migration pending).
    """
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.password_hash, u.nombre, u.apellido,
                       u.role, u.activo, u.debe_cambiar_password, u.organization_id
                FROM users u
                WHERE u.email = $1
                """,
                email,
            )
    except Exception as exc:
        logger.debug("DB auth unavailable (migration pending?): %s", exc)
        return None
    if not row:
        return None
    if not row["activo"]:
        return None
    if not verify_password(password, row["password_hash"]):
        return None
    return dict(row)


async def update_ultimo_acceso(pool, user_id: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET ultimo_acceso = NOW() WHERE id = $1",
            user_id,
        )


# ---------------------------------------------------------------------------
# Env-var fallback (legacy — keep until all users are migrated to DB)
# ---------------------------------------------------------------------------

def authenticate_user_env(username: str, password: str) -> Optional[dict]:
    """Check credentials against legacy env vars (ADMIN_USERNAME/PASSWORD).
    Returns a synthetic user dict on success, None otherwise.
    """
    settings = get_settings()
    if settings.admin_username and settings.admin_password:
        if username == settings.admin_username and password == settings.admin_password:
            return {"sub": username, "role": "admin", "nombre": username}
    if (
        settings.reader_username
        and settings.reader_password
        and username == settings.reader_username
        and password == settings.reader_password
    ):
        return {"sub": username, "role": "lector", "nombre": username}
    return None
