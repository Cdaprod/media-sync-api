"""Media browsing, streaming, and organization endpoints.

Example calls:
    curl http://localhost:8787/api/projects/demo/media
    curl -O http://localhost:8787/media/demo/ingest/originals/clip.mov
    curl -X POST http://localhost:8787/api/projects/auto-organize
"""
from __future__ import annotations

import base64
import binascii
import logging
import mimetypes
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse

from app.config import get_settings
from app.storage.dedupe import compute_sha256_from_path, record_file_hash, remove_file_record
from app.storage.index import append_event, append_file_entry, load_index, remove_entries, seed_index
from app.storage.paths import (
    ensure_subdirs,
    project_path,
    relpath_posix,
    safe_filename,
    validate_project_name,
)
from app.storage.reindex import reindex_project
from app.storage.sources import SourceRegistry


logger = logging.getLogger("media_sync_api.media")

router = APIRouter(prefix="/api/projects", tags=["media"])
media_router = APIRouter(prefix="/media", tags=["media"])

ORPHAN_PROJECT_NAME = "Unsorted-Loose"
MANIFEST_DB = "_manifest/manifest.db"
THUMBNAIL_DIR = "ingest/thumbnails"
THUMBNAIL_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
THUMBNAIL_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class _ResolvedProject:
    """Resolved project context with validated source and path."""

    def __init__(self, name: str, source_name: str, root: Path):
        self.name = name
        self.source_name = source_name
        self.root = root


class MoveMediaRequest(BaseModel):
    relative_paths: List[str] = Field(default_factory=list)
    target_project: str
    target_source: str | None = None


class DeleteMediaRequest(BaseModel):
    relative_paths: List[str] = Field(default_factory=list)


class ThumbnailCreateRequest(BaseModel):
    relative_path: str = Field(..., description="Relative media path under ingest/originals/")
    data_url: str = Field(..., description="Base64-encoded data URL for the thumbnail image.")


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


def _manifest_db_path(project_root: Path) -> Path:
    return project_root / MANIFEST_DB


def _dedupe_destination(target: Path) -> Path:
    if not target.exists():
        return target
    counter = 1
    stem = target.stem
    suffix = target.suffix
    while True:
        candidate = target.with_name(f"{stem}_{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


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
        item["download_url"] = _build_download_url(resolved.name, safe_relative, resolved.source_name)
        thumbnail_relative = _find_thumbnail_relative(resolved.root, safe_relative)
        if thumbnail_relative:
            item["thumb_url"] = _build_stream_url(resolved.name, thumbnail_relative, resolved.source_name)
        media.append(item)
    sorted_media = sorted(media, key=lambda m: m.get("relative_path", ""))

    return {
        "project": resolved.name,
        "source": resolved.source_name,
        "media": sorted_media,
        "counts": index.get("counts", {}),
        "instructions": "Use stream_url to play media directly; run /reindex after manual moves.",
    }


@router.post("/{project_name}/media/thumbnail")
async def store_thumbnail(project_name: str, payload: ThumbnailCreateRequest, source: str | None = None):
    """Persist a generated thumbnail alongside the project media.

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/media/thumbnail \
          -H "Content-Type: application/json" \
          -d '{"relative_path":"ingest/originals/clip.mov","data_url":"data:image/jpeg;base64,..."}'
    """

    resolved = _require_source_and_project(project_name, source)
    try:
        safe_relative = _validate_relative_media_path(payload.relative_path)
        data, ext = _decode_thumbnail_data(payload.data_url)
        thumb_relative = _thumbnail_relative_for_extension(safe_relative, ext)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    media_path = (resolved.root / safe_relative).resolve()
    if not media_path.exists() or not media_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    target = (resolved.root / thumb_relative).resolve()
    project_root = resolved.root.resolve()
    if project_root not in target.parents and target != project_root:
        raise HTTPException(status_code=400, detail="Thumbnail path is outside the project")

    target.parent.mkdir(parents=True, exist_ok=True)
    stored = False
    if not target.exists():
        target.write_bytes(data)
        stored = True
    logger.info(
        "thumbnail_saved",
        extra={
            "project": resolved.name,
            "source": resolved.source_name,
            "path": thumb_relative,
            "stored": stored,
        },
    )
    return {
        "status": "ok",
        "stored": stored,
        "thumbnail_path": thumb_relative,
        "thumbnail_url": _build_stream_url(resolved.name, thumb_relative, resolved.source_name),
    }


@media_router.get("/{project_name}/download/{relative_path:path}")
async def download_media(project_name: str, relative_path: str, source: str | None = None):
    """Force-download a media file within a project.

    Example:
        curl -OJ "http://localhost:8787/media/demo/download/ingest/originals/file.mov"
    """

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


@router.post("/{project_name}/media/delete")
async def delete_media(project_name: str, payload: DeleteMediaRequest, source: str | None = None):
    """Delete media files from a project and remove index entries.

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/media/delete \
          -H "Content-Type: application/json" \
          -d '{"relative_paths":["ingest/originals/clip.mov"]}'
    """

    if not payload.relative_paths:
        raise HTTPException(status_code=400, detail="relative_paths is required")
    resolved = _require_source_and_project(project_name, source)
    index = load_index(resolved.root)
    entries_by_path = {entry.get("relative_path"): entry for entry in index.get("files", [])}

    removed_paths: set[str] = set()
    removed_thumbnails: set[str] = set()
    missing: list[str] = []
    for raw_path in payload.relative_paths:
        try:
            safe_relative = _validate_relative_media_path(raw_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        entry = entries_by_path.get(safe_relative)
        target = (resolved.root / safe_relative).resolve()
        if target.exists() and target.is_file():
            target.unlink()
            removed_paths.add(safe_relative)
            thumb_removed = _remove_thumbnail(resolved.root, safe_relative)
            if thumb_removed:
                removed_thumbnails.add(thumb_removed)
        if entry:
            sha = entry.get("sha256")
            if sha:
                remove_file_record(_manifest_db_path(resolved.root), sha, safe_relative)
            removed_paths.add(safe_relative)
            thumb_removed = _remove_thumbnail(resolved.root, safe_relative)
            if thumb_removed:
                removed_thumbnails.add(thumb_removed)
        if not entry and not target.exists():
            missing.append(safe_relative)

    if removed_paths:
        remove_entries(resolved.root, removed_paths)
        append_event(
            resolved.root,
            "media_deleted",
            {
                "paths": sorted(removed_paths),
                "source": resolved.source_name,
                "thumbnails": sorted(removed_thumbnails),
            },
        )

    return {
        "status": "ok",
        "removed": sorted(removed_paths),
        "missing": missing,
        "thumbnails_removed": sorted(removed_thumbnails),
    }


@router.post("/{project_name}/media/move")
async def move_media(project_name: str, payload: MoveMediaRequest, source: str | None = None):
    """Move media entries from one project to another.

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/media/move \
          -H "Content-Type: application/json" \
          -d '{"relative_paths":["ingest/originals/clip.mov"],"target_project":"P2-Editing"}'
    """

    if not payload.relative_paths:
        raise HTTPException(status_code=400, detail="relative_paths is required")
    resolved = _require_source_and_project(project_name, source)
    registry = SourceRegistry(get_settings().project_root)
    try:
        target_source = registry.require(payload.target_source)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        target_name = validate_project_name(payload.target_project)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if resolved.name == target_name and resolved.source_name == target_source.name:
        raise HTTPException(status_code=400, detail="Source and target project must differ")

    target_root = project_path(target_source.root, target_name)
    if not target_root.exists():
        raise HTTPException(status_code=404, detail="Target project not found")
    ensure_subdirs(target_root, ["ingest/originals", "ingest/thumbnails", "_manifest"])
    if not (target_root / "index.json").exists():
        seed_index(target_root, target_name)

    source_index = load_index(resolved.root)
    source_entries = {entry.get("relative_path"): entry for entry in source_index.get("files", [])}

    moved: list[dict[str, str]] = []
    thumbnails_moved: list[dict[str, str]] = []
    duplicates: list[str] = []
    missing: list[str] = []

    for raw_path in payload.relative_paths:
        try:
            safe_relative = _validate_relative_media_path(raw_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        source_entry = source_entries.get(safe_relative)
        source_file = (resolved.root / safe_relative).resolve()
        if not source_file.exists() or not source_file.is_file():
            if source_entry:
                remove_entries(resolved.root, [safe_relative])
                if source_entry.get("sha256"):
                    remove_file_record(_manifest_db_path(resolved.root), source_entry["sha256"], safe_relative)
            missing.append(safe_relative)
            continue
        filename = safe_filename(Path(safe_relative).name)
        destination = _dedupe_destination(target_root / "ingest" / "originals" / filename)
        destination.parent.mkdir(parents=True, exist_ok=True)

        sha = source_entry.get("sha256") if source_entry else None
        if not sha:
            sha = compute_sha256_from_path(source_file)

        source_file.rename(destination)
        new_relative = relpath_posix(destination, target_root)
        thumb_relative = _move_thumbnail(resolved.root, target_root, safe_relative, new_relative)
        if thumb_relative:
            thumbnails_moved.append({"from": safe_relative, "to": thumb_relative})

        duplicate = record_file_hash(_manifest_db_path(target_root), sha, new_relative)
        if duplicate:
            destination.unlink(missing_ok=True)
            duplicates.append(safe_relative)
        else:
            entry = {
                "relative_path": new_relative,
                "sha256": sha,
                "size": destination.stat().st_size,
                "indexed_at": datetime.now(timezone.utc).isoformat(),
            }
            append_file_entry(target_root, entry)
            moved.append({"from": safe_relative, "to": new_relative})

        if source_entry:
            remove_entries(resolved.root, [safe_relative])
            if source_entry.get("sha256"):
                remove_file_record(_manifest_db_path(resolved.root), source_entry["sha256"], safe_relative)

    if moved:
        append_event(
            target_root,
            "media_moved_in",
            {
                "source_project": resolved.name,
                "items": moved,
                "source": target_source.name,
                "thumbnails": thumbnails_moved,
            },
        )
    if duplicates:
        append_event(
            resolved.root,
            "media_move_duplicate",
            {"target_project": target_name, "paths": duplicates},
        )
    if moved:
        append_event(
            resolved.root,
            "media_moved_out",
            {
                "target_project": target_name,
                "items": moved,
                "source": resolved.source_name,
                "thumbnails": thumbnails_moved,
            },
        )

    return {
        "status": "ok",
        "moved": moved,
        "duplicates": duplicates,
        "missing": missing,
        "thumbnails_moved": thumbnails_moved,
    }


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
    ensure_subdirs(destination, ["ingest/originals", "ingest/thumbnails", "_manifest"])

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


def _thumbnail_relative_for_extension(relative_path: str, extension: str) -> str:
    path = Path(relative_path)
    if path.parts[:2] != ("ingest", "originals"):
        raise ValueError("Thumbnails are only supported for ingest/originals media")
    if not extension.startswith("."):
        raise ValueError("Thumbnail extension must start with a dot")
    sub_path = Path(*path.parts[2:])
    return (Path("ingest") / "thumbnails" / sub_path.with_suffix(extension)).as_posix()


def _thumbnail_candidate_relatives(relative_path: str) -> List[str]:
    path = Path(relative_path)
    if path.parts[:2] != ("ingest", "originals"):
        return []
    sub_path = Path(*path.parts[2:])
    candidates = []
    for ext in THUMBNAIL_EXTENSIONS:
        candidates.append((Path("ingest") / "thumbnails" / sub_path.with_suffix(ext)).as_posix())
    return candidates


def _find_thumbnail_relative(project_root: Path, relative_path: str) -> str | None:
    for candidate in _thumbnail_candidate_relatives(relative_path):
        if (project_root / candidate).exists():
            return candidate
    return None


def _remove_thumbnail(project_root: Path, relative_path: str) -> str | None:
    thumb_relative = _find_thumbnail_relative(project_root, relative_path)
    if not thumb_relative:
        return None
    thumb_path = (project_root / thumb_relative).resolve()
    project_root = project_root.resolve()
    if project_root not in thumb_path.parents and thumb_path != project_root:
        return None
    thumb_path.unlink(missing_ok=True)
    return thumb_relative


def _move_thumbnail(
    source_root: Path,
    target_root: Path,
    source_relative: str,
    target_relative: str,
) -> str | None:
    thumb_relative = _find_thumbnail_relative(source_root, source_relative)
    if not thumb_relative:
        return None
    source_thumb = (source_root / thumb_relative).resolve()
    source_root = source_root.resolve()
    if source_root not in source_thumb.parents and source_thumb != source_root:
        return None
    extension = Path(thumb_relative).suffix
    if not extension:
        return None
    target_thumb_relative = _thumbnail_relative_for_extension(target_relative, extension)
    target_thumb = (target_root / target_thumb_relative).resolve()
    target_root = target_root.resolve()
    if target_root not in target_thumb.parents and target_thumb != target_root:
        return None
    target_thumb.parent.mkdir(parents=True, exist_ok=True)
    if target_thumb.exists():
        source_thumb.unlink(missing_ok=True)
    else:
        source_thumb.rename(target_thumb)
    return target_thumb_relative


def _decode_thumbnail_data(data_url: str) -> tuple[bytes, str]:
    header, separator, b64_data = data_url.partition(",")
    if not separator or not header:
        raise ValueError("data_url must be a base64-encoded image data URL")
    if not header.startswith("data:image/"):
        raise ValueError("data_url must be an image data URL")
    header_parts = header.split(";")
    if "base64" not in header_parts:
        raise ValueError("data_url must be base64 encoded")
    mime = header_parts[0].replace("data:", "", 1)
    extension = THUMBNAIL_MIME_TO_EXT.get(mime)
    if not extension:
        raise ValueError("Unsupported thumbnail mime type")
    try:
        decoded = base64.b64decode(b64_data, validate=True)
    except binascii.Error as exc:
        raise ValueError("Invalid base64 thumbnail payload") from exc
    if not decoded:
        raise ValueError("Thumbnail payload is empty")
    return decoded, extension


def _build_stream_url(project: str, relative_path: str, source: str | None) -> str:
    encoded_path = quote(relative_path, safe="/")
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/media/{quote(project)}" + (f"/{encoded_path}" if encoded_path else "") + suffix


def _build_download_url(project: str, relative_path: str, source: str | None) -> str:
    encoded_path = quote(relative_path, safe="/")
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/media/{quote(project)}/download" + (f"/{encoded_path}" if encoded_path else "") + suffix
