"""
Shared dependencies for admin routers:
- security (HTTPBearer)
- ADMIN_ROLES constant
- _get_actor helper
- _audit helper
- _require_admin helper
"""
import logging
from typing import Optional

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.admin.auth import verify_token

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

ADMIN_ROLES = {"superadmin", "admin"}


def _get_actor(credentials) -> tuple:
    """Extract (user_id, user_nombre) from JWT credentials. Returns (None, None) on failure."""
    if not credentials:
        return None, None
    payload = verify_token(credentials.credentials)
    if not payload:
        return None, None
    return payload.get("user_id"), payload.get("nombre")


async def _audit(
    pool,
    *,
    user_id,
    user_nombre,
    action: str,
    table_name: str,
    record_id=None,
    project_id=None,
    details: dict | None = None,
) -> None:
    """Insert an audit log entry. Silently swallows errors to avoid breaking the main flow."""
    import json as _json
    try:
        await pool.execute(
            """INSERT INTO audit_log
               (user_id, user_nombre, action, table_name, record_id, project_id, details)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            user_id, user_nombre, action, table_name,
            record_id, project_id,
            _json.dumps(details) if details else None,
        )
    except Exception as _e:
        logger.warning("audit_log insert failed: %s", _e)


def _require_admin(credentials: Optional[HTTPAuthorizationCredentials]) -> dict:
    """Raise 403 if the token doesn't belong to an admin/superadmin."""
    if not credentials or credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    if payload.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Acceso restringido a administradores")
    return payload
