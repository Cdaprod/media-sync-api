"""Tagging endpoints for media assets.

Example calls:
    curl http://localhost:8787/api/tags
    curl -X POST "http://localhost:8787/api/projects/P1-Demo/assets/tags?rel_path=ingest/originals/clip.mov" \
        -H 'Content-Type: application/json' -d '{"tags":["b-roll","interview"]}'
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.paths import validate_project_name
from app.storage.sources import SourceRegistry
from app.storage.tags_store import TagMeta, TagStore, asset_id_for_project


logger = logging.getLogger("media_sync_api.tags")

router = APIRouter(prefix="/api", tags=["tags"])


def _store() -> TagStore:
    settings = get_settings()
    db_path = settings.project_root / "_tags" / "tags.sqlite"
    return TagStore(db_path=db_path)


def _normalize_project(name: str) -> str:
    try:
        return validate_project_name(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _normalize_source(source: str | None) -> str:
    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        resolved = registry.require(source, include_disabled=True)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return resolved.name


def _normalize_rel_path(rel_path: str) -> str:
    if not rel_path:
        raise HTTPException(status_code=400, detail="rel_path is required")
    if rel_path.startswith(("/", "\\")):
        raise HTTPException(status_code=400, detail="rel_path must be relative")
    if "\\" in rel_path:
        raise HTTPException(status_code=400, detail="rel_path cannot contain backslashes")
    if ".." in Path(rel_path).parts:
        raise HTTPException(status_code=400, detail="rel_path cannot contain traversal segments")
    return rel_path


def _normalize_asset_id(asset_id: str | None) -> str | None:
    if not asset_id:
        return None
    cleaned = asset_id.strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", cleaned):
        raise HTTPException(status_code=400, detail="asset_id must be a 64-character hex sha256")
    return cleaned


class TagPatch(BaseModel):
    color: Optional[str] = Field(default=None, description="Hex like #22c55e")
    description: Optional[str] = None


class TagsBody(BaseModel):
    tags: list[str] = Field(default_factory=list)


class BatchReq(BaseModel):
    project: Optional[str] = None
    source: Optional[str] = None
    rel_paths: list[str] = Field(default_factory=list)
    asset_ids: list[str] = Field(default_factory=list)


@router.get("/tags")
async def list_tags(q: str | None = None, limit: int = 200):
    store = _store()
    metas = store.list_tags(q=q, limit=limit)
    return [{"tag": m.tag, "color": m.color, "description": m.description} for m in metas]


@router.patch("/tags/{tag}")
async def patch_tag(tag: str, patch: TagPatch):
    store = _store()
    meta = store.upsert_tag_meta(TagMeta(tag=tag, color=patch.color, description=patch.description))
    logger.info("tag_meta_updated", extra={"tag": meta.tag})
    return {"tag": meta.tag, "color": meta.color, "description": meta.description}


@router.get("/projects/{project}/assets/tags")
async def get_asset_tags(
    project: str,
    rel_path: str | None = None,
    source: str | None = None,
    asset_id: str | None = None,
):
    project_name = _normalize_project(project)
    source_name = _normalize_source(source)
    resolved_asset_id = _normalize_asset_id(asset_id)
    safe_rel = _normalize_rel_path(rel_path) if not resolved_asset_id else None
    resolved_asset_id = resolved_asset_id or asset_id_for_project(source_name, project_name, safe_rel or "")
    store = _store()
    if not resolved_asset_id:
        raise HTTPException(status_code=400, detail="rel_path or asset_id is required")
    return {
        "asset_id": resolved_asset_id,
        "project": project_name,
        "relative_path": safe_rel,
        "source": source_name,
        "tags": store.get_asset_tags(resolved_asset_id),
    }


@router.post("/projects/{project}/assets/tags")
async def add_asset_tags(
    project: str,
    body: TagsBody,
    rel_path: str | None = None,
    source: str | None = None,
    tag_source: str = "user",
    asset_id: str | None = None,
):
    project_name = _normalize_project(project)
    source_name = _normalize_source(source)
    resolved_asset_id = _normalize_asset_id(asset_id)
    safe_rel = _normalize_rel_path(rel_path) if not resolved_asset_id else None
    resolved_asset_id = resolved_asset_id or asset_id_for_project(source_name, project_name, safe_rel or "")
    store = _store()
    if not resolved_asset_id:
        raise HTTPException(status_code=400, detail="rel_path or asset_id is required")
    tags = store.add_asset_tags(resolved_asset_id, body.tags, source=tag_source)
    logger.info("asset_tags_added", extra={"asset_id": resolved_asset_id, "count": len(tags)})
    return {"asset_id": resolved_asset_id, "tags": tags}


@router.delete("/projects/{project}/assets/tags")
async def remove_asset_tags(
    project: str,
    body: TagsBody,
    rel_path: str | None = None,
    source: str | None = None,
    asset_id: str | None = None,
):
    project_name = _normalize_project(project)
    source_name = _normalize_source(source)
    resolved_asset_id = _normalize_asset_id(asset_id)
    safe_rel = _normalize_rel_path(rel_path) if not resolved_asset_id else None
    resolved_asset_id = resolved_asset_id or asset_id_for_project(source_name, project_name, safe_rel or "")
    store = _store()
    if not resolved_asset_id:
        raise HTTPException(status_code=400, detail="rel_path or asset_id is required")
    tags = store.remove_asset_tags(resolved_asset_id, body.tags)
    logger.info("asset_tags_removed", extra={"asset_id": resolved_asset_id, "count": len(tags)})
    return {"asset_id": resolved_asset_id, "tags": tags}


@router.get("/assets/tags")
async def get_asset_tags_by_id(asset_id: str):
    """Fetch tags for an asset_id (library or project)."""

    resolved = _normalize_asset_id(asset_id)
    if not resolved:
        raise HTTPException(status_code=400, detail="asset_id is required")
    store = _store()
    return {
        "asset_id": resolved,
        "tags": store.get_asset_tags(resolved),
        "tag_source_counts": store.get_asset_tag_counts(resolved),
    }


@router.post("/assets/tags")
async def add_asset_tags_by_id(asset_id: str, body: TagsBody, tag_source: str = "user"):
    """Attach tags to an asset_id (library or project)."""

    resolved = _normalize_asset_id(asset_id)
    if not resolved:
        raise HTTPException(status_code=400, detail="asset_id is required")
    store = _store()
    tags = store.add_asset_tags(resolved, body.tags, source=tag_source)
    logger.info("asset_tags_added", extra={"asset_id": resolved, "count": len(tags)})
    return {"asset_id": resolved, "tags": tags}


@router.delete("/assets/tags")
async def remove_asset_tags_by_id(asset_id: str, body: TagsBody):
    """Remove tags from an asset_id (library or project)."""

    resolved = _normalize_asset_id(asset_id)
    if not resolved:
        raise HTTPException(status_code=400, detail="asset_id is required")
    store = _store()
    tags = store.remove_asset_tags(resolved, body.tags)
    logger.info("asset_tags_removed", extra={"asset_id": resolved, "count": len(tags)})
    return {"asset_id": resolved, "tags": tags}


@router.post("/tags/batch")
async def batch_tags(req: BatchReq):
    if req.asset_ids:
        asset_ids = [_normalize_asset_id(aid) for aid in req.asset_ids if aid]
        asset_ids = [aid for aid in asset_ids if aid]
        store = _store()
        mapping = store.batch_get_asset_tags(asset_ids)
        return {"asset_ids": asset_ids, "map": mapping}

    if not req.project:
        raise HTTPException(status_code=400, detail="project is required when asset_ids are not provided")
    project_name = _normalize_project(req.project)
    source_name = _normalize_source(req.source)
    if not req.rel_paths:
        return {"project": project_name, "source": source_name, "map": {}}
    rels = [_normalize_rel_path(path) for path in req.rel_paths]
    asset_ids = [asset_id_for_project(source_name, project_name, path) for path in rels]
    store = _store()
    mapping = store.batch_get_asset_tags(asset_ids)
    return {"project": project_name, "source": source_name, "map": mapping}
