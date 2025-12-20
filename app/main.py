"""Entry point for media-sync-api FastAPI application.

Usage:
    uvicorn app.main:app --host 0.0.0.0 --port 8787
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api.projects import router as projects_router
from app.api.upload import router as upload_router
from app.api.reindex import router as reindex_router

app = FastAPI(title="media-sync-api", version="0.1.0")

app.include_router(projects_router)
app.include_router(upload_router)
app.include_router(reindex_router)


@app.get("/healthz")
async def healthcheck():
    return {"status": "ok"}
