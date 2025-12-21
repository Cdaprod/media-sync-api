"""Reindex endpoint for reconciling filesystem state.

Example call:
    curl http://localhost:8787/api/projects/demo/reindex
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.storage.paths import project_path, validate_project_name
from app.storage.reindex import reindex_project
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["reindex"])


logger = logging.getLogger("media_sync_api.reindex")


@router.api_route("/{project_name}/reindex", methods=["GET", "POST"])
async def reindex(project_name: str, source: str | None = None):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    try:
        active_source = registry.require(source)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")
    project = project_path(active_source.root, name)
    if not project.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    result = reindex_project(project)
    result["instructions"] = "Use this after manual file moves; see /public/index.html for workflow steps."
    logger.info(
        "project_reindexed",
        extra={
            "project": name,
            "source": active_source.name,
            **{k: result.get(k) for k in ("indexed", "removed")},
        },
    )
    return result
