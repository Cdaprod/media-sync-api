"""Media browsing, streaming, and organization endpoints.

Example calls:
    curl http://localhost:8787/api/projects/demo/media
    curl -O http://localhost:8787/media/demo/ingest/originals/clip.mov
    curl -X POST http://localhost:8787/api/projects/auto-organize
"""
from __future__ import annotations

import logging
import mimetypes
import shutil
from pathlib import Path
from typing import Dict, List
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.index import load_index, seed_index
from app.storage.paths import ensure_subdirs, project_path, safe_filename, validate_project_name, validate_relative_path
from app.storage.reindex import ALLOWED_MEDIA_EXTENSIONS, reindex_project
from app.storage.sources import SourceRegistry
from app.storage.tags_store import TagStore, asset_id_for_source_relpath, normalize_tag
from app.storage.buckets import BucketStore
from app.storage.bridge import BridgeStore
from app.storage.derive import cache_artifact_path, derive_artifacts_for_asset


logger = logging.getLogger("media_sync_api.media")

router = APIRouter(prefix="/api/projects", tags=["media"])
source_router = APIRouter(prefix="/api/sources", tags=["media"])
media_router = APIRouter(prefix="/media", tags=["media"])
source_media_router = APIRouter(prefix="/media/source", tags=["media"])
cache_router = APIRouter(prefix="/api/cache", tags=["media"])
bucket_router = APIRouter(prefix="/api", tags=["media"])

ORPHAN_PROJECT_NAME = "Unsorted-Loose"


class _ResolvedProject:
    """Resolved project context with validated source and path."""

    def __init__(self, name: str, source_name: str, root: Path):
        self.name = name
        self.source_name = source_name
        self.root = root


def _require_source_and_project(project_name: str, source: str | None) -> _ResolvedProject:
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        active_source = registry.require(source)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if active_source.mode != "project":
        raise HTTPException(status_code=400, detail="Selected source is not a project source")
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    project_root = project_path(active_source.root, name)
    return _ResolvedProject(name=name, source_name=active_source.name, root=project_root)


@router.get("/{project_name}/media")
async def list_media(
    project_name: str,
    source: str | None = None,
    tags: str | None = None,
    any_tags: str | None = None,
    no_tags: bool = False,
):
    """List all media recorded in a project's index with streamable URLs."""

    resolved = _require_source_and_project(project_name, source)
    index_path = resolved.root / "index.json"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    index = load_index(resolved.root)

    media: List[Dict[str, object]] = []
    asset_ids: List[str] = []
    for entry in index.get("files", []):
        relative_path = entry.get("relative_path")
        if not isinstance(relative_path, str):
            continue
        try:
            safe_relative = validate_relative_path(relative_path)
        except ValueError:
            logger.warning(
                "skipping_invalid_media_path",
                extra={"project": resolved.name, "path": relative_path},
            )
            continue
        item = dict(entry)
        item["relative_path"] = safe_relative
        item["stream_url"] = _build_stream_url(resolved.name, safe_relative, resolved.source_name)
        item["download_url"] = _build_download_url(resolved.name, safe_relative, resolved.source_name)
        source_rel_path = f"{resolved.name}/{safe_relative}"
        asset_id = asset_id_for_source_relpath(resolved.source_name, source_rel_path)
        item["asset_id"] = asset_id
        thumb_path = cache_artifact_path(get_settings().cache_root, asset_id, "thumb.jpg")
        if thumb_path.exists():
            item["thumb_url"] = f"/api/cache/{asset_id}/thumb.jpg"
        media.append(item)
        asset_ids.append(asset_id)

    store = TagStore(get_settings().project_root / "_tags" / "tags.sqlite")
    tags_map = store.batch_get_asset_tags(asset_ids)
    counts_map = store.batch_get_asset_tag_counts(asset_ids)

    for item in media:
        asset_id = item.get("asset_id")
        item_tags = tags_map.get(asset_id, []) if asset_id else []
        item["tags"] = item_tags
        item["tag_source_counts"] = counts_map.get(asset_id, {}) if asset_id else {}

    required_tags = _parse_tag_filter(tags)
    any_tag_list = _parse_tag_filter(any_tags)

    filtered = media
    if required_tags:
        filtered = [m for m in filtered if _has_all_tags(m.get("tags", []), required_tags)]
    if any_tag_list:
        filtered = [m for m in filtered if _has_any_tags(m.get("tags", []), any_tag_list)]
    if no_tags:
        filtered = [m for m in filtered if not m.get("tags")]

    sorted_media = sorted(filtered, key=lambda m: m.get("relative_path", ""))

    return {
        "project": resolved.name,
        "source": resolved.source_name,
        "media": sorted_media,
        "counts": index.get("counts", {}),
        "instructions": "Use stream_url to play media directly; run /reindex after manual moves.",
    }


@source_router.get("/{source_name}/media")
async def list_source_media(
    source_name: str,
    tags: str | None = None,
    any_tags: str | None = None,
    no_tags: bool = False,
):
    """List media files for a library source without copying originals."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source.mode != "library":
        raise HTTPException(status_code=400, detail="Selected source is not a library source")
    if not source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    library_roots = bridge_store.list_library_roots(source.name)
    if not library_roots:
        return {
            "source": source.name,
            "mode": source.mode,
            "media": [],
            "counts": {"total": 0},
            "instructions": "Run /api/sources/{source}/stage-scan and commit selections before browsing.",
        }
    allowed_roots = [root.rel_root for root in library_roots]

    media: List[Dict[str, object]] = []
    asset_ids: List[str] = []
    for path in _iter_media_files(source.root, allowed_roots):
        rel_path = path.relative_to(source.root).as_posix()
        asset_id = asset_id_for_source_relpath(source.name, rel_path)
        item = _item_for_media_path(path, rel_path, asset_id, source.name, include_download=False)
        media.append(item)
        asset_ids.append(asset_id)

    store = TagStore(settings.project_root / "_tags" / "tags.sqlite")
    tags_map = store.batch_get_asset_tags(asset_ids)
    counts_map = store.batch_get_asset_tag_counts(asset_ids)
    for item in media:
        asset_id = item.get("asset_id")
        item["tags"] = tags_map.get(asset_id, []) if asset_id else []
        item["tag_source_counts"] = counts_map.get(asset_id, {}) if asset_id else {}

    required_tags = _parse_tag_filter(tags)
    any_tag_list = _parse_tag_filter(any_tags)
    filtered = _filter_media_by_tags(media, required_tags, any_tag_list, no_tags)

    return {
        "source": source.name,
        "mode": source.mode,
        "media": sorted(filtered, key=lambda m: m.get("relative_path", "")),
        "counts": {"total": len(media)},
        "instructions": "Library sources stream directly from the NAS; use /api/sources/{source}/derive for cache artifacts.",
    }


class DeriveRequest(BaseModel):
    kinds: List[str] = Field(default_factory=lambda: ["thumb"])
    limit: int = Field(default=50, ge=1, le=500)
    force: bool = Field(default=False)


@source_router.post("/{source_name}/derive")
async def derive_source_artifacts(source_name: str, payload: DeriveRequest):
    """Derive cache artifacts for a library source.

    Example:
        curl -X POST http://localhost:8787/api/sources/nas/derive -d '{"kinds":["thumb"],"limit":25}'
    """

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source.mode != "library":
        raise HTTPException(status_code=400, detail="Selected source is not a library source")
    if not source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    library_roots = bridge_store.list_library_roots(source.name)
    if not library_roots:
        raise HTTPException(
            status_code=400,
            detail="No committed library roots; run stage-scan and commit selections first",
        )
    allowed_roots = [root.rel_root for root in library_roots]

    logger.info(
        "derive_started",
        extra={"source": source.name, "kinds": payload.kinds, "limit": payload.limit, "force": payload.force},
    )
    results: List[Dict[str, object]] = []
    total = 0
    for path in _iter_media_files(source.root, allowed_roots):
        if total >= payload.limit:
            break
        rel_path = path.relative_to(source.root).as_posix()
        asset_id = asset_id_for_source_relpath(source.name, rel_path)
        derived = derive_artifacts_for_asset(
            path,
            asset_id,
            payload.kinds,
            settings.cache_root,
            force=payload.force,
        )
        results.append(
            {
                "asset_id": asset_id,
                "relative_path": rel_path,
                "results": [result.__dict__ for result in derived],
            }
        )
        total += 1

    return {
        "source": source.name,
        "processed": total,
        "kinds": payload.kinds,
        "results": results,
    }


@source_router.post("/{source_name}/discover-buckets")
async def discover_buckets(source_name: str):
    """Discover virtual buckets for a library source.

    Example:
        curl -X POST http://localhost:8787/api/sources/nas/discover-buckets
    """

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source.mode != "library":
        raise HTTPException(status_code=400, detail="Selected source is not a library source")
    if not source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    library_roots = bridge_store.list_library_roots(source.name)
    if not library_roots:
        raise HTTPException(
            status_code=400,
            detail="No committed library roots; run stage-scan and commit selections first",
        )
    allowed_roots = [root.rel_root for root in library_roots]

    store = BucketStore(settings.project_root / "_sources" / "buckets.sqlite")
    buckets = store.discover(
        source.name,
        source.root,
        min_files=settings.buckets_min_files,
        max_depth=settings.buckets_max_depth,
        max_buckets=settings.buckets_max_count,
        overlap_threshold=settings.buckets_overlap_threshold,
        include_roots=allowed_roots,
    )
    logger.info(
        "bucket_discovery_completed",
        extra={
            "source": source.name,
            "count": len(buckets),
            "min_files": settings.buckets_min_files,
            "max_depth": settings.buckets_max_depth,
            "max_buckets": settings.buckets_max_count,
        },
    )
    return {
        "source": source.name,
        "count": len(buckets),
        "buckets": [bucket.__dict__ for bucket in buckets],
    }


@source_router.get("/{source_name}/buckets")
async def list_buckets(source_name: str):
    """List buckets for a library source."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source.mode != "library":
        raise HTTPException(status_code=400, detail="Selected source is not a library source")
    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    library_roots = bridge_store.list_library_roots(source.name)
    if not library_roots:
        return {
            "source": source.name,
            "count": 0,
            "buckets": [],
            "instructions": "Run stage-scan and commit selections to create library roots.",
        }
    store = BucketStore(settings.project_root / "_sources" / "buckets.sqlite")
    buckets = store.list_buckets(source.name)
    return {
        "source": source.name,
        "count": len(buckets),
        "buckets": [bucket.__dict__ for bucket in buckets],
    }


@bucket_router.get("/buckets/{bucket_id}/media")
async def list_bucket_media(
    bucket_id: str,
    tags: str | None = None,
    any_tags: str | None = None,
    no_tags: bool = False,
):
    """List media for a virtual bucket."""

    settings = get_settings()
    store = BucketStore(settings.project_root / "_sources" / "buckets.sqlite")
    bucket = store.get_bucket(bucket_id)
    if not bucket:
        raise HTTPException(status_code=404, detail="Bucket not found")

    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(bucket.source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    library_roots = bridge_store.list_library_roots(source.name)
    if not library_roots:
        raise HTTPException(status_code=404, detail="No committed library roots")
    allowed_roots = [root.rel_root for root in library_roots]
    if not _path_allowed(bucket.bucket_rel_root, allowed_roots):
        raise HTTPException(status_code=404, detail="Bucket is outside committed library roots")

    base_root = source.root if bucket.bucket_rel_root == "." else source.root / bucket.bucket_rel_root
    media: List[Dict[str, object]] = []
    asset_ids: List[str] = []
    for path in _iter_media_files(base_root, None):
        rel_path = path.relative_to(source.root).as_posix()
        asset_id = asset_id_for_source_relpath(source.name, rel_path)
        item = _item_for_media_path(path, rel_path, asset_id, source.name, include_download=False)
        media.append(item)
        asset_ids.append(asset_id)

    tag_store = TagStore(settings.project_root / "_tags" / "tags.sqlite")
    tags_map = tag_store.batch_get_asset_tags(asset_ids)
    counts_map = tag_store.batch_get_asset_tag_counts(asset_ids)
    for item in media:
        asset_id = item.get("asset_id")
        item["tags"] = tags_map.get(asset_id, []) if asset_id else []
        item["tag_source_counts"] = counts_map.get(asset_id, {}) if asset_id else {}

    required_tags = _parse_tag_filter(tags)
    any_tag_list = _parse_tag_filter(any_tags)
    filtered = _filter_media_by_tags(media, required_tags, any_tag_list, no_tags)

    return {
        "bucket": bucket.__dict__,
        "media": sorted(filtered, key=lambda m: m.get("relative_path", "")),
        "counts": {"total": len(media)},
    }


def _parse_tag_filter(value: str | None) -> List[str]:
    if not value:
        return []
    normalized: List[str] = []
    for raw in value.split(","):
        tag = normalize_tag(raw)
        if tag:
            normalized.append(tag)
    return normalized


def _filter_media_by_tags(
    media: List[Dict[str, object]],
    required_tags: List[str],
    any_tag_list: List[str],
    no_tags: bool,
) -> List[Dict[str, object]]:
    filtered = media
    if required_tags:
        filtered = [m for m in filtered if _has_all_tags(m.get("tags", []), required_tags)]
    if any_tag_list:
        filtered = [m for m in filtered if _has_any_tags(m.get("tags", []), any_tag_list)]
    if no_tags:
        filtered = [m for m in filtered if not m.get("tags")]
    return filtered


def _has_all_tags(tags: List[str], required: List[str]) -> bool:
    if not required:
        return True
    tag_set = set(tags)
    return all(tag in tag_set for tag in required)


def _has_any_tags(tags: List[str], candidates: List[str]) -> bool:
    if not candidates:
        return True
    tag_set = set(tags)
    return any(tag in tag_set for tag in candidates)


@cache_router.get("/{asset_id}/{artifact}")
async def get_cache_artifact(asset_id: str, artifact: str):
    """Serve derived cache artifacts by asset_id.

    Example:
        curl -O http://localhost:8787/api/cache/<asset_id>/thumb.jpg
    """

    if "/" in artifact or "\\" in artifact or ".." in artifact:
        raise HTTPException(status_code=400, detail="Invalid artifact path")
    if not asset_id or len(asset_id) != 64:
        raise HTTPException(status_code=400, detail="Invalid asset_id")
    settings = get_settings()
    target = cache_artifact_path(settings.cache_root, asset_id, artifact)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Cache artifact not found")
    media_type, _ = mimetypes.guess_type(target.name)
    return FileResponse(target, media_type=media_type)


@media_router.get("/{project_name}/download/{relative_path:path}")
async def download_media(project_name: str, relative_path: str, source: str | None = None):
    """Force-download a media file within a project.

    Example:
        curl -OJ "http://localhost:8787/media/demo/download/ingest/originals/file.mov"
    """

    resolved = _require_source_and_project(project_name, source)
    try:
        safe_relative = validate_relative_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target = (resolved.root / safe_relative).resolve()
    project_root = resolved.root.resolve()
    if project_root not in target.parents and target != project_root:
        raise HTTPException(status_code=400, detail="Requested path is outside the project")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    media_type, _ = mimetypes.guess_type(target.name)
    headers = {"Content-Disposition": f"attachment; filename={quote(target.name)}"}
    logger.info(
        "download_media",
        extra={"project": resolved.name, "source": resolved.source_name, "path": safe_relative},
    )
    return FileResponse(target, media_type=media_type, headers=headers)


@media_router.get("/{project_name}/{relative_path:path}")
async def stream_media(project_name: str, relative_path: str, source: str | None = None):
    """Stream a media file within a project using HTTP range support."""

    resolved = _require_source_and_project(project_name, source)
    try:
        safe_relative = validate_relative_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target = (resolved.root / safe_relative).resolve()
    project_root = resolved.root.resolve()
    if project_root not in target.parents and target != project_root:
        raise HTTPException(status_code=400, detail="Requested path is outside the project")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    media_type, _ = mimetypes.guess_type(target.name)
    logger.info(
        "stream_media",
        extra={"project": resolved.name, "source": resolved.source_name, "path": safe_relative},
    )
    return FileResponse(target, media_type=media_type)


@source_media_router.get("/{source_name}/download/{relative_path:path}")
async def download_source_media(source_name: str, relative_path: str):
    """Force-download a media file from a library source."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source.mode != "library":
        raise HTTPException(status_code=400, detail="Selected source is not a library source")
    try:
        safe_relative = validate_relative_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    library_roots = bridge_store.list_library_roots(source.name)
    if not library_roots:
        raise HTTPException(status_code=404, detail="No committed library roots")
    allowed_roots = [root.rel_root for root in library_roots]
    if not _path_allowed(safe_relative, allowed_roots):
        raise HTTPException(status_code=404, detail="Media not available in committed library roots")
    target = (source.root / safe_relative).resolve()
    source_root = source.root.resolve()
    if source_root not in target.parents and target != source_root:
        raise HTTPException(status_code=400, detail="Requested path is outside the source")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    media_type, _ = mimetypes.guess_type(target.name)
    headers = {"Content-Disposition": f"attachment; filename={quote(target.name)}"}
    return FileResponse(target, media_type=media_type, headers=headers)


@source_media_router.get("/{source_name}/{relative_path:path}")
async def stream_source_media(source_name: str, relative_path: str):
    """Stream a media file from a library source."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source.mode != "library":
        raise HTTPException(status_code=400, detail="Selected source is not a library source")
    try:
        safe_relative = validate_relative_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    library_roots = bridge_store.list_library_roots(source.name)
    if not library_roots:
        raise HTTPException(status_code=404, detail="No committed library roots")
    allowed_roots = [root.rel_root for root in library_roots]
    if not _path_allowed(safe_relative, allowed_roots):
        raise HTTPException(status_code=404, detail="Media not available in committed library roots")
    target = (source.root / safe_relative).resolve()
    source_root = source.root.resolve()
    if source_root not in target.parents and target != source_root:
        raise HTTPException(status_code=400, detail="Requested path is outside the source")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    media_type, _ = mimetypes.guess_type(target.name)
    return FileResponse(target, media_type=media_type)


@router.post("/auto-organize")
async def auto_organize(source: str | None = None):
    """Move loose files in the projects root into a dedicated project ingest folder."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        sources = [registry.require(source)] if source else registry.list_enabled()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    sources = [src for src in sources if src.mode == "project"]

    summaries: List[Dict[str, object]] = []
    total_moved = 0

    for src in sources:
        if not src.accessible:
            summaries.append(
                {
                    "source": src.name,
                    "moved": 0,
                    "destination_project": None,
                    "detail": "Source root is not reachable",
                }
            )
            continue
        summary = _organize_source_root(src.root)
        summary["source"] = src.name
        summaries.append(summary)
        total_moved += int(summary.get("moved", 0))

    return {
        "status": "ok",
        "moved": total_moved,
        "sources": summaries,
        "instructions": "Loose files are relocated to the Unsorted-Loose project; browse via /api/projects/{project}/media.",
    }


def _organize_source_root(root: Path) -> Dict[str, object]:
    loose_files = [path for path in root.iterdir() if path.is_file()] if root.exists() else []
    if not loose_files:
        return {"moved": 0, "destination_project": None, "files": []}

    destination = project_path(root, ORPHAN_PROJECT_NAME)
    destination.mkdir(parents=True, exist_ok=True)
    index_path = destination / "index.json"
    if not index_path.exists():
        seed_index(destination, ORPHAN_PROJECT_NAME, notes="Auto-organized loose files from projects root")
    ensure_subdirs(destination, ["ingest/originals", "_manifest"])

    moved: List[str] = []
    ingest = destination / "ingest/originals"
    for source_path in loose_files:
        try:
            target_name = safe_filename(source_path.name)
        except ValueError:
            logger.warning("skipping_loose_file", extra={"path": source_path.name})
            continue
        target_path = ingest / target_name
        if target_path.exists():
            target_path = ingest / f"{int(source_path.stat().st_mtime)}_{target_name}"
        shutil.move(str(source_path), target_path)
        moved.append(target_path.name)

    reindex_project(destination)
    logger.info(
        "auto_organized",
        extra={"destination": destination.name, "moved": len(moved), "root": str(root)},
    )
    return {"moved": len(moved), "destination_project": destination.name, "files": moved}


def _build_stream_url(project: str, relative_path: str, source: str | None) -> str:
    encoded_path = quote(relative_path, safe="/")
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/media/{quote(project)}" + (f"/{encoded_path}" if encoded_path else "") + suffix


def _build_download_url(project: str, relative_path: str, source: str | None) -> str:
    encoded_path = quote(relative_path, safe="/")
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/media/{quote(project)}/download" + (f"/{encoded_path}" if encoded_path else "") + suffix


def _iter_media_files(root: Path, allowed_roots: List[str] | None):
    if not root.exists():
        return
    roots = _resolve_allowed_roots(root, allowed_roots)
    for base in roots:
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in ALLOWED_MEDIA_EXTENSIONS:
                yield path


def _media_kind_for_path(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}:
        return "video"
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}:
        return "image"
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".flac"}:
        return "audio"
    return "document"


def _item_for_media_path(
    path: Path,
    rel_path: str,
    asset_id: str,
    source_name: str,
    *,
    include_download: bool = True,
) -> Dict[str, object]:
    media_type, _ = mimetypes.guess_type(path.name)
    item: Dict[str, object] = {
        "relative_path": rel_path,
        "asset_id": asset_id,
        "size": path.stat().st_size,
        "kind": _media_kind_for_path(path),
        "mime": media_type,
        "stream_url": _build_source_stream_url(source_name, rel_path),
    }
    if include_download:
        item["download_url"] = _build_source_download_url(source_name, rel_path)
    thumb_path = cache_artifact_path(get_settings().cache_root, asset_id, "thumb.jpg")
    if thumb_path.exists():
        item["thumb_url"] = f"/api/cache/{asset_id}/thumb.jpg"
    return item


def _build_source_stream_url(source_name: str, rel_path: str) -> str:
    encoded_path = quote(rel_path, safe="/")
    return f"/media/source/{quote(source_name)}/{encoded_path}"


def _build_source_download_url(source_name: str, rel_path: str) -> str:
    encoded_path = quote(rel_path, safe="/")
    return f"/media/source/{quote(source_name)}/download/{encoded_path}"


def _resolve_allowed_roots(root: Path, allowed_roots: List[str] | None) -> List[Path]:
    if not allowed_roots:
        return [root]
    resolved_root = root.resolve()
    output: List[Path] = []
    for rel_root in allowed_roots:
        rel_path = Path(rel_root)
        if rel_path.is_absolute() or ".." in rel_path.parts:
            continue
        candidate = (resolved_root / rel_path).resolve()
        if resolved_root not in candidate.parents and candidate != resolved_root:
            continue
        output.append(candidate)
    return output or [root]


def _path_allowed(rel_path: str, allowed_roots: List[str]) -> bool:
    if not allowed_roots:
        return True
    rel = Path(rel_path)
    for root in allowed_roots:
        root_path = Path(root)
        if root_path == Path("."):
            return True
        if root_path == rel or root_path in rel.parents:
            return True
    return False
