"""AI tagging endpoints backed by local WhisperX + DEIM services.

Example calls:
    curl -X POST "http://localhost:8787/api/projects/P1-Demo/assets/ai-tags?rel_path=ingest/originals/clip.mov" \
      -H "Content-Type: application/json" -d '{"force": true}'
    curl "http://localhost:8787/api/projects/P1-Demo/assets/ai-tags?rel_path=ingest/originals/clip.mov"
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.ai_tagging import AITaggingError, enqueue_ai_tagging, tag_asset
from app.config import get_settings
from app.storage.paths import project_path, validate_project_name, validate_relative_path
from app.storage.sources import SourceRegistry
from app.storage.tags_store import TagStore, asset_key


logger = logging.getLogger("media_sync_api.ai_tags")

router = APIRouter(prefix="/api/projects", tags=["ai-tags"])


class AITagRequest(BaseModel):
    force: bool = Field(False, description="Recompute tags even if AI tags exist")
    background: bool = Field(False, description="Run tagging in the background")
    max_tags: int | None = Field(None, description="Override max tags returned by DEIM")
    language: str | None = Field(None, description="Optional language hint for WhisperX")


class _ResolvedProject:
    def __init__(self, name: str, source_name: str, root: Path):
        self.name = name
        self.source_name = source_name
        self.root = root


def _resolve_project(project_name: str, source: str | None) -> _ResolvedProject:
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    registry = SourceRegistry(get_settings().project_root)
    try:
        active_source = registry.require(source)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    project_root = project_path(active_source.root, name)
    if not project_root.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    return _ResolvedProject(name=name, source_name=active_source.name, root=project_root)


def _resolve_asset(project_root: Path, rel_path: str) -> str:
    if not rel_path:
        raise HTTPException(status_code=400, detail="rel_path is required")
    if "\\" in rel_path:
        raise HTTPException(status_code=400, detail="rel_path cannot contain backslashes")
    try:
        safe_rel = validate_relative_path(rel_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    target = (project_root / safe_rel).resolve()
    project_root = project_root.resolve()
    if project_root not in target.parents and target != project_root:
        raise HTTPException(status_code=400, detail="Requested path is outside the project")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return safe_rel


def _store() -> TagStore:
    settings = get_settings()
    return TagStore(settings.project_root / "_tags" / "tags.sqlite")


@router.get("/{project_name}/assets/ai-tags")
async def ai_tag_status(project_name: str, rel_path: str, source: str | None = None):
    resolved = _resolve_project(project_name, source)
    safe_rel = _resolve_asset(resolved.root, rel_path)
    store = _store()
    key = asset_key(resolved.name, safe_rel, resolved.source_name)
    run = store.get_asset_tag_run(key)
    return {
        "asset_key": key,
        "project": resolved.name,
        "relative_path": safe_rel,
        "source": resolved.source_name,
        "tags": store.get_asset_tags(key),
        "tag_source_counts": store.get_asset_tag_counts(key),
        "tag_run": run.__dict__ if run else None,
        "instructions": "POST to the same endpoint to generate AI tags.",
    }


@router.post("/{project_name}/assets/ai-tags")
async def ai_tag_asset(
    project_name: str,
    rel_path: str,
    payload: AITagRequest,
    background_tasks: BackgroundTasks,
    source: str | None = None,
):
    resolved = _resolve_project(project_name, source)
    safe_rel = _resolve_asset(resolved.root, rel_path)

    if payload.background:
        queued = enqueue_ai_tagging(
            background_tasks,
            resolved.root,
            resolved.name,
            safe_rel,
            resolved.source_name,
            force=payload.force,
            max_tags=payload.max_tags,
            language=payload.language,
        )
        if not queued:
            raise HTTPException(
                status_code=503,
                detail="AI tagging is disabled; set MEDIA_SYNC_AI_TAGGING_ENABLED=1 to enable.",
            )
        return {
            "status": "queued",
            "relative_path": safe_rel,
            "source": resolved.source_name,
            "instructions": "Poll this endpoint for status; tags will appear in /media listings once ready.",
        }

    try:
        result = tag_asset(
            resolved.root,
            resolved.name,
            safe_rel,
            resolved.source_name,
            force=payload.force,
            max_tags=payload.max_tags,
            language=payload.language,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AITaggingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("ai_tag_asset_failed", extra={"project": resolved.name, "path": safe_rel})
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result
