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

from app.config import get_settings
from app.storage.index import load_index, seed_index
from app.storage.paths import ensure_subdirs, project_path, safe_filename, validate_project_name
from app.storage.reindex import reindex_project
from app.storage.sources import SourceRegistry


logger = logging.getLogger("media_sync_api.media")

router = APIRouter(prefix="/api/projects", tags=["media"])
media_router = APIRouter(prefix="/media", tags=["media"])

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
    registry = SourceRegistry(settings.project_root)
    try:
        active_source = registry.require(source)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    project_root = project_path(active_source.root, name)
    return _ResolvedProject(name=name, source_name=active_source.name, root=project_root)


@router.get("/{project_name}/media")
async def list_media(project_name: str, source: str | None = None):
    """List all media recorded in a project's index with streamable URLs."""

    resolved = _require_source_and_project(project_name, source)
    index_path = resolved.root / "index.json"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    index = load_index(resolved.root)

    media: List[Dict[str, object]] = []
    for entry in index.get("files", []):
        relative_path = entry.get("relative_path")
        if not isinstance(relative_path, str):
            continue
        try:
            safe_relative = _validate_relative_media_path(relative_path)
        except ValueError:
            logger.warning(
                "skipping_invalid_media_path",
                extra={"project": resolved.name, "path": relative_path},
            )
            continue
        item = dict(entry)
        item["relative_path"] = safe_relative
        item["stream_url"] = _build_stream_url(resolved.name, safe_relative, resolved.source_name)
        media.append(item)
    sorted_media = sorted(media, key=lambda m: m.get("relative_path", ""))

    return {
        "project": resolved.name,
        "source": resolved.source_name,
        "media": sorted_media,
        "counts": index.get("counts", {}),
        "instructions": "Use stream_url to play media directly; run /reindex after manual moves.",
    }


@media_router.get("/{project_name}/{relative_path:path}")
async def stream_media(project_name: str, relative_path: str, source: str | None = None):
    """Stream a media file within a project using HTTP range support."""

    resolved = _require_source_and_project(project_name, source)
    try:
        safe_relative = _validate_relative_media_path(relative_path)
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


@router.post("/auto-organize")
async def auto_organize(source: str | None = None):
    """Move loose files in the projects root into a dedicated project ingest folder."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    try:
        sources = [registry.require(source)] if source else registry.list_enabled()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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


def _validate_relative_media_path(relative_path: str) -> str:
    path = Path(relative_path)
    if path.is_absolute():
        raise ValueError("Relative path cannot be absolute")
    if ".." in path.parts:
        raise ValueError("Relative path cannot traverse directories")
    cleaned = path.as_posix().lstrip("/")
    if not cleaned:
        raise ValueError("Relative path cannot be empty")
    return cleaned


def _build_stream_url(project: str, relative_path: str, source: str | None) -> str:
    encoded_path = quote(relative_path, safe="/")
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/media/{quote(project)}" + (f"/{encoded_path}" if encoded_path else "") + suffix
