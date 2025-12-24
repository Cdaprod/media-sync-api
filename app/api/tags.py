"""Tagging endpoints for media assets.

Example calls:
    curl http://localhost:8787/api/tags
    curl -X POST "http://localhost:8787/api/projects/P1-Demo/assets/tags?rel_path=ingest/originals/clip.mov" \
        -H 'Content-Type: application/json' -d '{"tags":["b-roll","interview"]}'
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.paths import validate_project_name
from app.storage.sources import SourceRegistry
from app.storage.tags_store import TagMeta, TagStore, asset_key


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
    registry = SourceRegistry(get_settings().project_root)
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


class TagPatch(BaseModel):
    color: Optional[str] = Field(default=None, description="Hex like #22c55e")
    description: Optional[str] = None


class TagsBody(BaseModel):
    tags: list[str] = Field(default_factory=list)


class BatchReq(BaseModel):
    project: str
    source: Optional[str] = None
    rel_paths: list[str] = Field(default_factory=list)


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
async def get_asset_tags(project: str, rel_path: str, source: str | None = None):
    project_name = _normalize_project(project)
    safe_rel = _normalize_rel_path(rel_path)
    source_name = _normalize_source(source)
    store = _store()
    key = asset_key(project=project_name, relative_path=safe_rel, source=source_name)
    return {
        "asset_key": key,
        "project": project_name,
        "relative_path": safe_rel,
        "source": source_name,
        "tags": store.get_asset_tags(key),
    }


@router.post("/projects/{project}/assets/tags")
async def add_asset_tags(project: str, rel_path: str, body: TagsBody, source: str | None = None, tag_source: str = "user"):
    project_name = _normalize_project(project)
    safe_rel = _normalize_rel_path(rel_path)
    source_name = _normalize_source(source)
    store = _store()
    key = asset_key(project=project_name, relative_path=safe_rel, source=source_name)
    tags = store.add_asset_tags(key, body.tags, source=tag_source)
    logger.info("asset_tags_added", extra={"asset_key": key, "count": len(tags)})
    return {"asset_key": key, "tags": tags}


@router.delete("/projects/{project}/assets/tags")
async def remove_asset_tags(project: str, rel_path: str, body: TagsBody, source: str | None = None):
    project_name = _normalize_project(project)
    safe_rel = _normalize_rel_path(rel_path)
    source_name = _normalize_source(source)
    store = _store()
    key = asset_key(project=project_name, relative_path=safe_rel, source=source_name)
    tags = store.remove_asset_tags(key, body.tags)
    logger.info("asset_tags_removed", extra={"asset_key": key, "count": len(tags)})
    return {"asset_key": key, "tags": tags}


@router.post("/tags/batch")
async def batch_tags(req: BatchReq):
    project_name = _normalize_project(req.project)
    source_name = _normalize_source(req.source)
    if not req.rel_paths:
        return {"project": project_name, "source": source_name, "map": {}}
    rels = [_normalize_rel_path(path) for path in req.rel_paths]
    keys = [asset_key(project=project_name, relative_path=path, source=source_name) for path in rels]
    store = _store()
    mapping = store.batch_get_asset_tags(keys)
    return {"project": project_name, "source": source_name, "map": mapping}
