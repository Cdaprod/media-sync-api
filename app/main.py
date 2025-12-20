"""Entry point for media-sync-api FastAPI application.

Usage:
    uvicorn app.main:app --host 0.0.0.0 --port 8787
    python -m app.main
"""

from __future__ import annotations

import uvicorn
from fastapi import FastAPI

from app.api.projects import router as projects_router
from app.api.upload import router as upload_router
from app.api.reindex import router as reindex_router
from app.config import get_settings


def create_app() -> FastAPI:
    """Create a new FastAPI instance with registered routers."""

    application = FastAPI(title="media-sync-api", version="0.1.0")
    application.include_router(projects_router)
    application.include_router(upload_router)
    application.include_router(reindex_router)

    @application.get("/health")
    async def healthcheck():
        settings = get_settings()
        return {"ok": True, "service": "media-sync-api", "projects_root": str(settings.project_root)}

    @application.get("/healthz")
    async def legacy_healthcheck():
        return {"status": "ok"}

    return application


app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=False)
