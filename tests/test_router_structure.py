"""
Structural tests for the api.py split refactor.

These tests validate that:
- All 12 domain routers import without errors
- The total route count is preserved (121)
- Per-domain route counts match what was extracted
- No (path, method) pair is registered twice
- All critical endpoint paths exist
- The aggregator produces the exact same route set as the sum of all domain routers

No network, no database, no env vars required.
Run: pytest tests/test_router_structure.py -v
"""
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def aggregator_router():
    from app.admin.api import router
    return router


@pytest.fixture(scope="module")
def all_domain_routers():
    from app.admin.routers import (
        alerts,
        auth,
        channels,
        facturas,
        financials,
        investors,
        leads,
        obra,
        organizations,
        projects,
        reservations,
        tools,
    )
    return {
        "auth": auth.router,
        "organizations": organizations.router,
        "channels": channels.router,
        "projects": projects.router,
        "leads": leads.router,
        "obra": obra.router,
        "reservations": reservations.router,
        "facturas": facturas.router,
        "financials": financials.router,
        "investors": investors.router,
        "alerts": alerts.router,
        "tools": tools.router,
    }


@pytest.fixture(scope="module")
def deps_module():
    from app.admin import deps
    return deps


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def route_set(router):
    """Return set of (path, frozenset(methods)) for all HTTP routes."""
    result = set()
    for r in router.routes:
        if hasattr(r, "methods") and r.methods:
            result.add((r.path, frozenset(r.methods)))
    return result


# ---------------------------------------------------------------------------
# 1. Imports
# ---------------------------------------------------------------------------

class TestImports:
    def test_deps_imports(self, deps_module):
        assert hasattr(deps_module, "security")
        assert hasattr(deps_module, "ADMIN_ROLES")
        assert hasattr(deps_module, "_get_actor")
        assert hasattr(deps_module, "_audit")
        assert hasattr(deps_module, "_require_admin")

    def test_all_domain_routers_importable(self, all_domain_routers):
        assert len(all_domain_routers) == 12

    def test_aggregator_importable(self, aggregator_router):
        assert aggregator_router is not None

    def test_app_loads(self):
        from app.main import app
        assert app is not None


# ---------------------------------------------------------------------------
# 2. Route counts
# ---------------------------------------------------------------------------

EXPECTED_DOMAIN_COUNTS = {
    "auth": 11,
    "organizations": 8,
    "channels": 9,
    "projects": 14,
    "leads": 16,
    "obra": 17,
    "reservations": 13,
    "facturas": 6,
    "financials": 16,
    "investors": 7,
    "alerts": 4,
    "tools": 5,
}

EXPECTED_TOTAL = 126


class TestRouteCounts:
    def test_total_routes_preserved(self, aggregator_router):
        assert len(aggregator_router.routes) == EXPECTED_TOTAL, (
            f"Expected {EXPECTED_TOTAL} routes in aggregator, got {len(aggregator_router.routes)}"
        )

    @pytest.mark.parametrize("domain,expected", EXPECTED_DOMAIN_COUNTS.items())
    def test_domain_route_count(self, all_domain_routers, domain, expected):
        actual = len(all_domain_routers[domain].routes)
        assert actual == expected, (
            f"Router '{domain}': expected {expected} routes, got {actual}"
        )

    def test_sum_of_domains_equals_total(self, all_domain_routers):
        total = sum(len(r.routes) for r in all_domain_routers.values())
        assert total == EXPECTED_TOTAL


# ---------------------------------------------------------------------------
# 3. No duplicate routes
# ---------------------------------------------------------------------------

class TestNoDuplicates:
    def test_no_duplicate_path_method_in_aggregator(self, aggregator_router):
        seen = set()
        duplicates = []
        for r in aggregator_router.routes:
            if not hasattr(r, "methods") or not r.methods:
                continue
            for method in r.methods:
                key = (r.path, method)
                if key in seen:
                    duplicates.append(key)
                seen.add(key)
        assert not duplicates, f"Duplicate routes found: {duplicates}"

    def test_aggregator_matches_sum_of_domains(self, aggregator_router, all_domain_routers):
        agg = route_set(aggregator_router)
        domain_union = set()
        for router in all_domain_routers.values():
            domain_union |= route_set(router)
        assert agg == domain_union, (
            f"Mismatch.\n"
            f"  In aggregator but not domains: {agg - domain_union}\n"
            f"  In domains but not aggregator: {domain_union - agg}"
        )


# ---------------------------------------------------------------------------
# 4. Critical paths exist
# ---------------------------------------------------------------------------

CRITICAL_PATHS = [
    # auth
    ("POST", "/auth/login"),
    ("GET", "/auth/me"),
    ("POST", "/auth/change-password"),
    # users
    ("GET", "/users"),
    ("POST", "/users"),
    # leads
    ("GET", "/leads"),
    ("PATCH", "/leads/{lead_id}"),
    ("GET", "/leads/{lead_id}"),
    ("GET", "/leads/{lead_id}/handoff"),
    ("POST", "/leads/{lead_id}/handoff/start"),
    ("POST", "/leads/{lead_id}/handoff/close"),
    ("POST", "/leads/{lead_id}/message"),
    ("GET", "/leads/{lead_id}/notes"),
    ("POST", "/leads/{lead_id}/notes"),
    ("DELETE", "/leads/{lead_id}/notes/{note_id}"),
    # projects / units
    ("GET", "/projects"),
    ("POST", "/projects/{project_id}/restore"),
    ("GET", "/units/{project_id}"),
    ("PATCH", "/units/{unit_id}/status"),
    ("PATCH", "/units/bulk-status"),
    # reservations
    ("POST", "/reservations/{project_id}"),
    ("GET", "/reservations/{project_id}"),
    ("POST", "/reservations/{project_id}/direct-sale"),
    ("PATCH", "/reservations/{reservation_id}"),
    ("GET", "/reservation/{reservation_id}"),
    # payment plans
    ("GET", "/payment-plans/{reservation_id}"),
    ("POST", "/payment-plans/{reservation_id}"),
    ("PATCH", "/payment-installments/{installment_id}"),
    ("POST", "/payment-records"),
    ("PATCH", "/payment-records/{record_id}"),
    ("DELETE", "/payment-records/{record_id}"),
    # financials
    ("GET", "/cash-flow/{project_id}"),
    ("GET", "/financials/{project_id}/summary"),
    ("GET", "/financials/{project_id}/expenses"),
    # facturas
    ("GET", "/facturas/{project_id}"),
    ("POST", "/facturas/{project_id}"),
    ("PATCH", "/facturas/{factura_id}"),
    ("DELETE", "/facturas/{factura_id}"),
    ("POST", "/facturas/{project_id}/upload-pdf"),
    ("GET", "/facturas/{project_id}/linkable-payments"),
    # obra
    ("GET", "/obra/{project_id}"),
    ("POST", "/obra/{project_id}/updates"),
    ("GET", "/obra-payments/{project_id}"),
    # investors
    ("GET", "/investors/{project_id}"),
    ("POST", "/investors/{project_id}/report/send"),
    # alerts
    ("GET", "/alerts"),
    ("POST", "/alerts/read-all"),
    # tools
    ("GET", "/tools/exchange-rates"),
    # jobs
    ("POST", "/jobs/alerts"),
    ("POST", "/jobs/nurturing"),
    # channels / kapso
    ("GET", "/tenant-channels"),
    ("POST", "/kapso/setup-link"),
    ("GET", "/agent-config"),
    # analytics
    ("GET", "/analytics/{project_id}"),
]


class TestCriticalPaths:
    @pytest.fixture(scope="class")
    def registered_routes(self, aggregator_router):
        result = set()
        for r in aggregator_router.routes:
            if hasattr(r, "methods") and r.methods:
                for method in r.methods:
                    result.add((method, r.path))
        return result

    @pytest.mark.parametrize("method,path", CRITICAL_PATHS)
    def test_critical_path_exists(self, registered_routes, method, path):
        assert (method, path) in registered_routes, (
            f"Critical route missing: {method} {path}"
        )


# ---------------------------------------------------------------------------
# 5. Deps correctness
# ---------------------------------------------------------------------------

class TestDeps:
    def test_admin_roles_contains_expected(self, deps_module):
        assert "admin" in deps_module.ADMIN_ROLES
        assert "superadmin" in deps_module.ADMIN_ROLES

    def test_security_is_http_bearer(self, deps_module):
        from fastapi.security import HTTPBearer
        assert isinstance(deps_module.security, HTTPBearer)

    def test_get_actor_returns_none_none_without_credentials(self, deps_module):
        result = deps_module._get_actor(None)
        assert result == (None, None)
