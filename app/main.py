import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.config import get_settings, reload_settings

reload_settings()
from app.database import get_pool, close_pool
from app.modules.whatsapp.webhook import router as whatsapp_router
from app.modules.handoff.chatwoot import router as chatwoot_router
from app.modules.nocodb_webhook import router as nocodb_router
from app.admin.api import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


settings = get_settings()

app = FastAPI(
    title="Realia",
    description="AI platform for real estate developers",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(whatsapp_router, prefix="/whatsapp", tags=["whatsapp"])
app.include_router(chatwoot_router, prefix="/chatwoot", tags=["chatwoot"])
app.include_router(nocodb_router, prefix="/nocodb", tags=["nocodb"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}
