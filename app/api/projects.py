"""Project management endpoints for media-sync-api.

Example call (label auto-prefixes to P{n}-<label>):
    curl -X POST http://localhost:8787/api/projects -H 'Content-Type: application/json' \
        -d '{"name":"MyProject","notes":"first run"}'
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.index import load_index, seed_index
from app.storage.paths import (
    PROJECT_SEQUENCE_PATTERN,
    ensure_subdirs,
    project_path,
    sequenced_project_name,
    validate_project_name,
)
from app.storage.reindex import reindex_project


logger = logging.getLogger("media_sync_api.projects")

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    name: str | None = Field(None, description="Optional project label; auto-prefixed with P{n}-")
    notes: str | None = Field(None, description="Optional notes to include in the index")


class ProjectResponse(BaseModel):
    name: str
    index_exists: bool
    instructions: str | None = Field(
        None,
        description="Human-friendly guidance about next steps for the project.",
    )


@router.get("", response_model=List[ProjectResponse])
async def list_projects() -> List[ProjectResponse]:
    settings = get_settings()
    root = settings.project_root
    _bootstrap_existing_projects(root)
    projects = []
    for path in root.iterdir():
        if not path.is_dir():
            continue
        index_exists = (path / "index.json").exists()
        projects.append(
            ProjectResponse(
                name=path.name,
                index_exists=index_exists,
                instructions="Uploads land in ingest/originals; use /public/index.html for the adapter UI.",
            )
        )
    sorted_projects = sorted(projects, key=lambda p: p.name)
    logger.info("listed_projects", extra={"count": len(sorted_projects)})
    return sorted_projects


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(payload: ProjectCreateRequest) -> ProjectResponse:
    settings = get_settings()
    try:
        name = _resolve_project_name(settings.project_root, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    target = project_path(settings.project_root, name)
    target.mkdir(parents=True, exist_ok=True)
    ensure_subdirs(target, ["ingest/originals", "_manifest"])

    index_path = target / "index.json"
    if not index_path.exists():
        seed_index(target, name, notes=payload.notes)
        reindex_project(target)
    logger.info("project_created", extra={"project": name, "path": str(target)})
    return ProjectResponse(
        name=name,
        index_exists=index_path.exists(),
        instructions=f"Use /api/projects/{name}/upload then reindex after manual edits.",
    )


@router.get("/{project_name}")
async def get_project(project_name: str):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings = get_settings()
    target = project_path(settings.project_root, name)
    _bootstrap_existing_projects(settings.project_root)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        payload = load_index(target)
        payload["instructions"] = "Uploads append to index.json; run /reindex if you change files manually."
        logger.info("project_loaded", extra={"project": name})
        return payload
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Missing index") from exc


def _bootstrap_existing_projects(root: Path) -> None:
    for path in root.iterdir() if root.exists() else []:
        if not path.is_dir():
            continue
        ensure_subdirs(path, ["ingest/originals", "_manifest"])
        index_path = path / "index.json"
        if not index_path.exists():
            seed_index(path, path.name)
            reindex_project(path)


def _resolve_project_name(root: Path, requested: str | None) -> str:
    label = requested.strip() if requested else None
    if label and PROJECT_SEQUENCE_PATTERN.match(label):
        return validate_project_name(label)
    if label:
        validate_project_name(label)
    return sequenced_project_name(root, label)
