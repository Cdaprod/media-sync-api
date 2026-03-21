"""Entry point for media-sync-api FastAPI application.

Usage:
    uvicorn app.main:app --host 0.0.0.0 --port 8787
    python -m app.main
"""

from __future__ import annotations

import logging
from pathlib import Path

import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.compose import router as compose_router
from app.api.compose import shutdown_compose_jobs
from app.api.media import bulk_router as assets_bulk_router
from app.api.media import global_media_router, media_router, registry_router, router as media_api_router, thumbnail_router
from app.api.projects import router as projects_router
from app.api.sources import router as sources_router
from app.api.upload import router as upload_router
from app.api.reindex import all_router as reindex_all_router
from app.api.reindex import router as reindex_router
from app.api.resolve_actions import router as resolve_router
from app.config import get_settings
from app.storage.auto_reindex import AutoReindexer


BASE_PATH = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_PATH / "public"
INDEX_FILE = PUBLIC_DIR / "index.html"
PLAYER_FILE = PUBLIC_DIR / "player.html"


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


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    reindexer = AutoReindexer(
        settings.project_root,
        interval_seconds=settings.auto_reindex_interval_seconds,
        enabled=settings.auto_reindex_enabled,
    )
    reindexer.start()
    yield
    reindexer.stop()
    shutdown_compose_jobs()


def _resolve_cors_settings() -> tuple[list[str], bool]:
    """Return CORS origins + credential policy for LAN Explorer clients.

    Example:
        origins, allow_credentials = _resolve_cors_settings()
    """

    settings = get_settings()
    default_origins = [
        "http://192.168.0.25:8790",
        "http://localhost:8790",
        "http://127.0.0.1:8790",
    ]
    configured_origins = [origin.strip() for origin in settings.cors_origins if origin.strip()]
    if "*" in configured_origins:
        return ["*"], False
    merged = sorted(set(default_origins + configured_origins))
    return merged, True




def create_app() -> FastAPI:
    """Create a new FastAPI instance with registered routers."""

    _configure_logging()
    application = FastAPI(title="media-sync-api", version="0.1.0", lifespan=lifespan)
    cors_origins, allow_credentials = _resolve_cors_settings()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(projects_router)
    application.include_router(media_api_router)
    application.include_router(assets_bulk_router)
    application.include_router(global_media_router)
    application.include_router(registry_router)
    application.include_router(sources_router)
    application.include_router(upload_router)
    application.include_router(compose_router)
    application.include_router(reindex_router)
    application.include_router(reindex_all_router)
    application.include_router(media_router)
    application.include_router(thumbnail_router)
    application.include_router(resolve_router)

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

    @application.get("/player.html", include_in_schema=False)
    async def public_player():
        if PLAYER_FILE.exists():
            return FileResponse(PLAYER_FILE)
        return {
            "ok": False,
            "detail": "OBS player is missing",
            "instructions": "Place public/player.html next to the app package or rebuild the image.",
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
