"""
Admin panel auth: token generation and verification.
Credentials from config (ADMIN_USERNAME, ADMIN_PASSWORD).
Tokens are HMAC-signed with expiry (default 24h).
"""

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

TOKEN_EXPIRY_HOURS = 24


def _get_secret() -> bytes:
    s = get_settings()
    raw = s.secret_key or "realia-admin-dev-secret"
    return raw.encode("utf-8") if isinstance(raw, str) else raw


def _payload_dumps(data: dict) -> bytes:
    return json.dumps(data, separators=(",", ":")).encode("utf-8")


def _payload_loads(data: bytes) -> Optional[dict]:
    try:
        return json.loads(data.decode("utf-8"))
    except Exception:
        return None


def create_token(username: str, role: str = "admin") -> str:
    """Create a signed token for the given username and role with expiry."""
    exp = int(time.time()) + (TOKEN_EXPIRY_HOURS * 3600)
    payload = {"sub": username, "role": role, "exp": exp}
    payload_b64 = base64.urlsafe_b64encode(_payload_dumps(payload)).rstrip(b"=").decode("ascii")
    sig = hmac.new(_get_secret(), payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_token(token: str) -> Optional[tuple[str, str]]:
    """Verify token and return (username, role) if valid, else None.
    Tokens without a role field default to 'admin' for backwards compatibility."""
    if not token or "." not in token:
        return None
    parts = token.split(".", 1)
    payload_b64, sig = parts[0], parts[1]
    payload_b64_padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
    try:
        payload_bytes = base64.urlsafe_b64decode(payload_b64_padded)
    except Exception:
        return None
    payload = _payload_loads(payload_bytes)
    if not payload or "sub" not in payload or "exp" not in payload:
        return None
    if int(time.time()) > int(payload["exp"]):
        return None
    expected_sig = hmac.new(_get_secret(), payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, sig):
        return None
    role = str(payload.get("role", "admin"))
    return (str(payload["sub"]), role)
