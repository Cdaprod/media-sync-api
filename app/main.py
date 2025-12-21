"""Entry point for media-sync-api FastAPI application.

Usage:
    uvicorn app.main:app --host 0.0.0.0 --port 8787
    python -m app.main
"""

from __future__ import annotations

import logging
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.projects import router as projects_router
from app.api.sources import router as sources_router
from app.api.upload import router as upload_router
from app.api.reindex import router as reindex_router
from app.config import get_settings


BASE_PATH = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_PATH / "public"
INDEX_FILE = PUBLIC_DIR / "index.html"


def _configure_logging() -> None:
    """Initialize structured logging once for the service."""

    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        )
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("media_sync_api").setLevel(logging.INFO)


def create_app() -> FastAPI:
    """Create a new FastAPI instance with registered routers."""

    _configure_logging()
    application = FastAPI(title="media-sync-api", version="0.1.0")
    application.include_router(projects_router)
    application.include_router(sources_router)
    application.include_router(upload_router)
    application.include_router(reindex_router)

    application.mount(
        "/public",
        StaticFiles(directory=PUBLIC_DIR, html=True),
        name="public",
    )

    @application.get("/", include_in_schema=False)
    async def public_index():
        if INDEX_FILE.exists():
            return FileResponse(INDEX_FILE)
        return {
            "ok": False,
            "detail": "Static adapter is missing",
            "instructions": "Place public/index.html next to the app package or rebuild the image.",
        }

    @application.get("/health")
    async def healthcheck():
        settings = get_settings()
        return {
            "ok": True,
            "service": "media-sync-api",
            "projects_root": str(settings.project_root),
            "instructions": "See /public/index.html for end-to-end adapter and shortcut guidance.",
        }

    @application.get("/healthz")
    async def legacy_healthcheck():
        return {"status": "ok"}

    return application


app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=False)
