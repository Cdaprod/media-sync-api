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
from app.storage.sources import SourceRegistry


logger = logging.getLogger("media_sync_api.projects")

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    name: str | None = Field(None, description="Optional project label; auto-prefixed with P{n}-")
    notes: str | None = Field(None, description="Optional notes to include in the index")


class ProjectResponse(BaseModel):
    name: str
    source: str
    source_accessible: bool
    index_exists: bool
    instructions: str | None = Field(
        None,
        description="Human-friendly guidance about next steps for the project.",
    )


@router.get("", response_model=List[ProjectResponse])
async def list_projects(source: str | None = None) -> List[ProjectResponse]:
    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    try:
        sources = [registry.require(source)] if source else registry.list_enabled()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    projects: List[ProjectResponse] = []
    for src in sources:
        if not src.accessible:
            logger.warning("source_unreachable", extra={"source": src.name, "root": str(src.root)})
            continue
        _bootstrap_existing_projects(src.root)
        for path in src.root.iterdir():
            if not path.is_dir():
                continue
            index_exists = (path / "index.json").exists()
            projects.append(
                ProjectResponse(
                    name=path.name,
                    source=src.name,
                    source_accessible=src.accessible,
                    index_exists=index_exists,
                    instructions="Uploads land in ingest/originals; use /public/index.html for the adapter UI.",
                )
            )
    sorted_projects = sorted(projects, key=lambda p: (p.source, p.name))
    logger.info("listed_projects", extra={"count": len(sorted_projects)})
    return sorted_projects


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(payload: ProjectCreateRequest, source: str | None = None) -> ProjectResponse:
    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    try:
        active_source = registry.require(source)
        name = _resolve_project_name(active_source.root, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")
    target = project_path(active_source.root, name)
    target.mkdir(parents=True, exist_ok=True)
    ensure_subdirs(target, ["ingest/originals", "_manifest"])

    index_path = target / "index.json"
    if not index_path.exists():
        seed_index(target, name, notes=payload.notes)
        reindex_project(target)
    logger.info(
        "project_created",
        extra={"project": name, "path": str(target), "source": active_source.name},
    )
    return ProjectResponse(
        name=name,
        source=active_source.name,
        source_accessible=active_source.accessible,
        index_exists=index_path.exists(),
        instructions=f"Use /api/projects/{name}/upload?source={active_source.name} then reindex after manual edits.",
    )


@router.get("/{project_name}")
async def get_project(project_name: str, source: str | None = None):
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
    target = project_path(active_source.root, name)
    _bootstrap_existing_projects(active_source.root)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        payload = load_index(target)
        payload["instructions"] = "Uploads append to index.json; run /reindex if you change files manually."
        logger.info("project_loaded", extra={"project": name, "source": active_source.name})
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
