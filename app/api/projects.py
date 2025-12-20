"""Project management endpoints for media-sync-api.

Example call:
    curl -X POST http://localhost:8787/api/projects -H 'Content-Type: application/json' \
        -d '{"name":"demo","notes":"first run"}'
"""

from __future__ import annotations

from pathlib import Path
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.storage.index import load_index, seed_index
from app.storage.paths import ensure_subdirs, project_path, validate_project_name

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., description="Name of the project")
    notes: str | None = Field(None, description="Optional notes to include in the index")


class ProjectResponse(BaseModel):
    name: str
    index_exists: bool


@router.get("", response_model=List[ProjectResponse])
async def list_projects() -> List[ProjectResponse]:
    root = settings.project_root
    projects = []
    for path in root.iterdir():
        if not path.is_dir():
            continue
        index_exists = (path / "index.json").exists()
        projects.append(ProjectResponse(name=path.name, index_exists=index_exists))
    return sorted(projects, key=lambda p: p.name)


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(payload: ProjectCreateRequest) -> ProjectResponse:
    try:
        name = validate_project_name(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target = project_path(settings.project_root, name)
    target.mkdir(parents=True, exist_ok=True)
    ensure_subdirs(target, ["ingest/originals", "_manifest"])

    index_path = target / "index.json"
    if not index_path.exists():
        seed_index(target, name, notes=payload.notes)
    return ProjectResponse(name=name, index_exists=index_path.exists())


@router.get("/{project_name}")
async def get_project(project_name: str):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target = project_path(settings.project_root, name)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return load_index(target)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Missing index") from exc
