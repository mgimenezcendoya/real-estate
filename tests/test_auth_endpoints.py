"""
Auth / HTTP tests for admin endpoints.

Validates that:
1. Login endpoint validates its input schema
2. GET endpoints with auth guards return 401 when unauthenticated
3. Public endpoints are accessible without credentials
4. Known security gaps (missing auth guards) are documented as xfail

Note on POST endpoints: FastAPI validates the request body BEFORE running the
handler, so a POST with no/empty body returns 422 (schema error) rather than 401
even when auth would be checked. For this reason, auth tests focus on GET
endpoints where auth is checked first.

Note on verify_token: it returns None (not raises) for invalid JWTs, so handlers
that use `if not credentials: raise 401` are tested here.

Run: pytest tests/test_auth_endpoints.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    mock_pool = AsyncMock()
    with patch("app.database.get_pool", return_value=mock_pool):
        from app.main import app
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


# ---------------------------------------------------------------------------
# 1. Login endpoint input validation
# ---------------------------------------------------------------------------

class TestLoginEndpoint:
    def test_login_exists(self, client):
        r = client.post("/admin/auth/login", json={})
        assert r.status_code != 404

    def test_login_no_body_returns_422(self, client):
        r = client.post("/admin/auth/login")
        assert r.status_code == 422

    def test_login_missing_password_returns_422(self, client):
        r = client.post("/admin/auth/login", json={"email": "admin@test.com"})
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# 2. GET endpoints that enforce auth → 401 when unauthenticated
# ---------------------------------------------------------------------------

AUTH_GUARDED_GETS = [
    "/admin/users",
    "/admin/alerts",
    "/admin/tenant-channels",
    "/admin/agent-config",
    "/admin/organizations",
    "/admin/analytics/proj-id",
    "/admin/audit-log",
    "/admin/subscriptions",
    "/admin/leads/lead-id/notes",
    "/admin/cobranza",
    "/admin/reservations/proj-id",
    "/admin/facturas/proj-id",
    "/admin/obra/proj-id",
    "/admin/investors/proj-id",
    "/admin/cash-flow/proj-id",
    "/admin/financials/proj/summary",
    "/admin/buyers/proj-id",
    "/admin/metrics/proj-id",
    "/admin/documents/proj-id",
]


class TestAuthGuardedGets:
    @pytest.mark.parametrize("path", AUTH_GUARDED_GETS)
    def test_no_token_returns_401(self, client, path):
        r = client.get(path)
        assert r.status_code == 401, (
            f"GET {path} — expected 401, got {r.status_code}: {r.text[:150]}"
        )


# ---------------------------------------------------------------------------
# 3. Public / semi-public endpoints (no auth required by design)
# ---------------------------------------------------------------------------

class TestPublicEndpoints:
    def test_exchange_rates_is_public(self, client):
        r = client.get("/admin/tools/exchange-rates")
        assert r.status_code == 200

    def test_auth_me_returns_401_without_token(self, client):
        """auth/me now returns 401 when unauthenticated (not {user: null})."""
        r = client.get("/admin/auth/me")
        assert r.status_code == 401

    def test_leads_list_accessible_without_token(self, client):
        """list_leads is semi-public (scoped by JWT if present, open otherwise)."""
        r = client.get("/admin/leads")
        assert r.status_code == 200

    def test_projects_list_accessible_without_token(self, client):
        """list_projects is semi-public (scoped by JWT if present, open otherwise)."""
        r = client.get("/admin/projects")
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 4. Known security gaps — GET endpoints missing auth guards
#    xfail(strict=True): test MUST fail (endpoint returns 200 without auth).
#    When an auth guard is added, the test will PASS → remove xfail.
# ---------------------------------------------------------------------------

SECURITY_GAPS: list = []


class TestKnownSecurityGaps:
    """
    All previously known security gaps have been resolved.
    This class is retained for future gap tracking.
    """

    @pytest.mark.xfail(strict=True, reason="Missing auth guard — tracked security gap")
    @pytest.mark.parametrize("path,note", SECURITY_GAPS)
    def test_should_require_auth(self, client, path, note):
        r = client.get(path)
        assert r.status_code == 401, (
            f"SECURITY GAP: GET {path} — {note} — got {r.status_code} (200 = unauthenticated access)"
        )


# ---------------------------------------------------------------------------
# 5. All key routes exist (not 404, not 500)
# ---------------------------------------------------------------------------

ALL_ROUTES = [
    ("GET",    "/admin/leads"),
    ("GET",    "/admin/projects"),
    ("GET",    "/admin/users"),
    ("GET",    "/admin/alerts"),
    ("GET",    "/admin/tools/exchange-rates"),
    ("GET",    "/admin/organizations"),
    ("GET",    "/admin/tenant-channels"),
    ("GET",    "/admin/subscriptions"),
    ("GET",    "/admin/audit-log"),
    ("GET",    "/admin/metrics/proj-id"),
    ("GET",    "/admin/documents/proj-id"),
    ("GET",    "/admin/financials/proj-id/summary"),
    ("GET",    "/admin/financials/proj-id/expenses"),
    ("GET",    "/admin/cash-flow/proj-id"),
    ("GET",    "/admin/cobranza"),
    ("GET",    "/admin/investors/proj-id"),
    ("GET",    "/admin/obra/proj-id"),
    ("GET",    "/admin/obra-payments/proj-id"),
    ("GET",    "/admin/suppliers"),
    ("GET",    "/admin/reservations/proj-id"),
    ("GET",    "/admin/agent-config"),
    ("GET",    "/admin/project-template"),
    ("POST",   "/admin/auth/login"),
]


class TestRoutesExist:
    @pytest.mark.parametrize("method,path", ALL_ROUTES)
    def test_route_not_404(self, client, method, path):
        r = client.request(method, path)
        assert r.status_code != 404, f"{method} {path} returned 404 — route not registered"
        assert r.status_code != 500, f"{method} {path} returned 500 — server error"
