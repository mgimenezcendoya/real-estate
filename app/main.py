import logging
import os
import uuid
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=0.1,   # 10% of requests traced
        send_default_pii=False,
        environment=os.getenv("ENVIRONMENT", "development"),
    )
    logger.info("Sentry initialized (env=%s)", os.getenv("ENVIRONMENT", "development"))

from app.config import get_settings, reload_settings

reload_settings()
from app.database import get_pool, close_pool
from app.modules.whatsapp.webhook import router as whatsapp_router
from app.modules.nocodb_webhook import router as nocodb_router
from app.admin.api import router as admin_router
from app.admin.routers import portal as portal_router


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

_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIDMiddleware)

app.include_router(whatsapp_router, prefix="/whatsapp", tags=["whatsapp"])
app.include_router(nocodb_router, prefix="/nocodb", tags=["nocodb"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(portal_router.router, prefix="/portal", tags=["portal"])


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}
