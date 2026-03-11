"""
Admin API router — aggregates all domain routers.
The actual endpoint implementations live in app/admin/routers/.
"""
from fastapi import APIRouter

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

router = APIRouter()

router.include_router(auth.router)
router.include_router(organizations.router)
router.include_router(channels.router)
router.include_router(projects.router)
router.include_router(leads.router)
router.include_router(obra.router)
router.include_router(reservations.router)
router.include_router(facturas.router)
router.include_router(financials.router)
router.include_router(investors.router)
router.include_router(alerts.router)
router.include_router(tools.router)
