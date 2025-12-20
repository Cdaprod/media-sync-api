"""Reindex endpoint for reconciling filesystem state.

Example call:
    curl -X POST http://localhost:8787/api/projects/demo/reindex
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.storage.paths import project_path, validate_project_name
from app.storage.reindex import reindex_project

router = APIRouter(prefix="/api/projects", tags=["reindex"])


@router.post("/{project_name}/reindex")
async def reindex(project_name: str):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    project = project_path(settings.project_root, name)
    if not project.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    return reindex_project(project)
