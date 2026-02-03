"""Media browsing, streaming, and organization endpoints.

Example calls:
    curl http://localhost:8787/api/projects/demo/media
    curl -O http://localhost:8787/media/demo/ingest/originals/clip.mov
    curl -X POST http://localhost:8787/api/projects/auto-organize
"""
from __future__ import annotations

import logging
import mimetypes
import re
import shutil
import subprocess
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
from app.storage.metadata import (
    ensure_metadata,
    metadata_path,
    metadata_relpath,
    remove_metadata,
    update_metadata_tags,
)
from app.storage.paths import (
    ensure_subdirs,
    is_thumbnail_path,
    project_path,
    relpath_posix,
    safe_filename,
    thumbnail_path,
    thumbnail_name,
    validate_project_name,
)
from app.storage.reindex import reindex_project
from app.storage.sources import SourceRegistry


logger = logging.getLogger("media_sync_api.media")

router = APIRouter(prefix="/api/projects", tags=["media"])
media_router = APIRouter(prefix="/media", tags=["media"])
thumbnail_router = APIRouter(prefix="/thumbnails", tags=["media"])

ORPHAN_PROJECT_NAME = "Unsorted-Loose"
MANIFEST_DB = "_manifest/manifest.db"
THUMBNAIL_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".jpg",
    ".jpeg",
    ".png",
    ".heic",
}
THUMBNAIL_SHA_PATTERN = re.compile(r"^[A-Fa-f0-9]{64}$")
THUMBNAIL_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}
_FFMPEG_AVAILABLE: bool | None = None


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


class TagMediaRequest(BaseModel):
    relative_paths: List[str] = Field(default_factory=list)
    add_tags: List[str] = Field(default_factory=list)
    remove_tags: List[str] = Field(default_factory=list)


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


def _should_remove_metadata(
    sha: str,
    delete_paths: set[str],
    sha_to_paths: dict[str, set[str]],
) -> bool:
    paths = sha_to_paths.get(sha, set())
    if not paths:
        return True
    return paths.issubset(delete_paths)


def _build_thumbnail_url(project: str, sha256: str, source: str | None) -> str:
    encoded_name = quote(thumbnail_name(sha256))
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/thumbnails/{quote(project)}/{encoded_name}" + suffix


def _is_thumbable_media(path: Path) -> bool:
    return path.suffix.lower() in THUMBNAIL_EXTENSIONS


def _ffmpeg_available() -> bool:
    global _FFMPEG_AVAILABLE
    if _FFMPEG_AVAILABLE is None:
        _FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None
    return _FFMPEG_AVAILABLE


def _generate_thumbnail(source_path: Path, target_path: Path) -> None:
    if not _ffmpeg_available():
        raise RuntimeError("ffmpeg is not available to generate thumbnails")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is not available to generate thumbnails")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_suffix(".tmp")
    cmd = [
        ffmpeg,
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-an",
        "-frames:v",
        "1",
        "-vf",
        "scale='min(640,iw)':-2",
        "-q:v",
        "4",
        str(temp_path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=12)
        temp_path.replace(target_path)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("ffmpeg thumbnail generation timed out") from exc
    except subprocess.CalledProcessError as exc:
        logger.warning(
            "thumbnail_ffmpeg_failed",
            extra={"stderr": exc.stderr, "path": str(source_path)},
        )
        raise
    finally:
        temp_path.unlink(missing_ok=True)


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
        if is_thumbnail_path(Path(safe_relative)):
            continue
        item = dict(entry)
        item["relative_path"] = safe_relative
        item["stream_url"] = _build_stream_url(resolved.name, safe_relative, resolved.source_name)
        item["download_url"] = _build_download_url(resolved.name, safe_relative, resolved.source_name)
        if _is_thumbable_media(Path(safe_relative)):
            sha = item.get("sha256")
            if isinstance(sha, str):
                thumb_path = thumbnail_path(resolved.root, sha)
                if thumb_path.exists() or _ffmpeg_available():
                    item["thumb_url"] = _build_thumbnail_url(resolved.name, sha, resolved.source_name)
        sha = item.get("sha256")
        if isinstance(sha, str) and metadata_path(resolved.root, sha).exists():
            item["metadata_path"] = metadata_relpath(resolved.root, sha)
        media.append(item)
    sorted_media = sorted(media, key=lambda m: m.get("relative_path", ""))

    return {
        "project": resolved.name,
        "source": resolved.source_name,
        "media": sorted_media,
        "counts": index.get("counts", {}),
        "instructions": "Use stream_url to play media directly; run /reindex after manual moves.",
    }


@thumbnail_router.get("/{project_name}/{thumb_name}")
async def get_thumbnail(project_name: str, thumb_name: str, source: str | None = None):
    """Serve a stored or generated thumbnail for a project asset.

    Example:
        curl -O "http://localhost:8787/thumbnails/demo/<sha256>.jpg"
    """

    resolved = _require_source_and_project(project_name, source)
    try:
        cleaned = safe_filename(thumb_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    name_path = Path(cleaned)
    if name_path.suffix.lower() != ".jpg":
        raise HTTPException(status_code=400, detail="Thumbnail name must end with .jpg")
    sha = name_path.stem
    if not THUMBNAIL_SHA_PATTERN.fullmatch(sha):
        raise HTTPException(status_code=400, detail="Thumbnail name must be a sha256.jpg filename")

    index = load_index(resolved.root)
    entry = next((item for item in index.get("files", []) if item.get("sha256") == sha), None)
    if not entry:
        raise HTTPException(status_code=404, detail="No media entry matches this thumbnail")

    relative_path = entry.get("relative_path")
    if not isinstance(relative_path, str):
        raise HTTPException(status_code=404, detail="Media entry missing relative path")
    try:
        safe_relative = _validate_relative_media_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    source_path = (resolved.root / safe_relative).resolve()
    project_root = resolved.root.resolve()
    if project_root not in source_path.parents and source_path != project_root:
        raise HTTPException(status_code=400, detail="Requested path is outside the project")
    if not source_path.exists() or not source_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found for thumbnail")
    if not _is_thumbable_media(source_path):
        raise HTTPException(status_code=400, detail="Media type does not support thumbnails")

    target_path = thumbnail_path(resolved.root, sha)
    if not target_path.exists():
        legacy_path = resolved.root / "ingest" / "originals" / "ingest" / "thumbnails" / f"{sha}.jpg"
        if legacy_path.exists():
            target_path.parent.mkdir(parents=True, exist_ok=True)
            legacy_path.replace(target_path)
        else:
            try:
                _generate_thumbnail(source_path, target_path)
            except RuntimeError as exc:
                status = 404 if "ffmpeg is not available" in str(exc) else 500
                raise HTTPException(status_code=status, detail=str(exc)) from exc
            except subprocess.CalledProcessError as exc:
                logger.warning(
                    "thumbnail_generation_failed",
                    extra={"project": resolved.name, "path": safe_relative},
                )
                raise HTTPException(status_code=500, detail="Thumbnail generation failed") from exc

    return FileResponse(target_path, media_type="image/jpeg", headers=THUMBNAIL_HEADERS)


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
    sha_to_paths: dict[str, set[str]] = {}
    for rel_path, entry in entries_by_path.items():
        sha = entry.get("sha256")
        if not sha or not isinstance(rel_path, str):
            continue
        sha_to_paths.setdefault(sha, set()).add(rel_path)

    removed_paths: set[str] = set()
    missing: list[str] = []
    removed_shas: set[str] = set()
    delete_targets: set[str] = set()
    for raw_path in payload.relative_paths:
        try:
            safe_relative = _validate_relative_media_path(raw_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        delete_targets.add(safe_relative)
        entry = entries_by_path.get(safe_relative)
        target = (resolved.root / safe_relative).resolve()
        if target.exists() and target.is_file():
            target.unlink()
            removed_paths.add(safe_relative)
        if entry:
            sha = entry.get("sha256")
            if sha:
                remove_file_record(_manifest_db_path(resolved.root), sha, safe_relative)
                removed_shas.add(sha)
            removed_paths.add(safe_relative)
        if not entry and not target.exists():
            missing.append(safe_relative)

    for sha in removed_shas:
        if _should_remove_metadata(sha, delete_targets, sha_to_paths):
            remove_metadata(resolved.root, sha)

    if removed_paths:
        remove_entries(resolved.root, removed_paths)
        append_event(
            resolved.root,
            "media_deleted",
            {"paths": sorted(removed_paths), "source": resolved.source_name},
        )

    return {"status": "ok", "removed": sorted(removed_paths), "missing": missing}


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
    ensure_subdirs(target_root, ["ingest/originals", "ingest/_metadata", "ingest/thumbnails", "_manifest"])
    if not (target_root / "index.json").exists():
        seed_index(target_root, target_name)

    source_index = load_index(resolved.root)
    source_entries = {entry.get("relative_path"): entry for entry in source_index.get("files", [])}
    sha_to_paths: dict[str, set[str]] = {}
    for rel_path, entry in source_entries.items():
        sha = entry.get("sha256")
        if not sha or not isinstance(rel_path, str):
            continue
        sha_to_paths.setdefault(sha, set()).add(rel_path)

    moved: list[dict[str, str]] = []
    duplicates: list[str] = []
    missing: list[str] = []
    removed_shas: set[str] = set()
    delete_targets: set[str] = set()

    for raw_path in payload.relative_paths:
        try:
            safe_relative = _validate_relative_media_path(raw_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        delete_targets.add(safe_relative)
        source_entry = source_entries.get(safe_relative)
        source_file = (resolved.root / safe_relative).resolve()
        if not source_file.exists() or not source_file.is_file():
            if source_entry:
                remove_entries(resolved.root, [safe_relative])
                if source_entry.get("sha256"):
                    remove_file_record(_manifest_db_path(resolved.root), source_entry["sha256"], safe_relative)
                    removed_shas.add(source_entry["sha256"])
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
            ensure_metadata(
                target_root,
                new_relative,
                sha,
                destination,
                source=target_source.name,
                method="move",
            )
            append_file_entry(target_root, entry)
            moved.append({"from": safe_relative, "to": new_relative})

        if source_entry:
            remove_entries(resolved.root, [safe_relative])
            if source_entry.get("sha256"):
                remove_file_record(_manifest_db_path(resolved.root), source_entry["sha256"], safe_relative)
                removed_shas.add(source_entry["sha256"])

    for sha in removed_shas:
        if _should_remove_metadata(sha, delete_targets, sha_to_paths):
            remove_metadata(resolved.root, sha)

    if moved:
        append_event(
            target_root,
            "media_moved_in",
            {"source_project": resolved.name, "items": moved, "source": target_source.name},
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
            {"target_project": target_name, "items": moved, "source": resolved.source_name},
        )

    return {"status": "ok", "moved": moved, "duplicates": duplicates, "missing": missing}


@router.post("/{project_name}/media/tags")
async def tag_media(project_name: str, payload: TagMediaRequest, source: str | None = None):
    """Add or remove manual tags for media assets.

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/media/tags \
          -H "Content-Type: application/json" \
          -d '{"relative_paths":["ingest/originals/clip.mov"],"add_tags":["broll"],"remove_tags":["draft"]}'
    """

    if not payload.relative_paths:
        raise HTTPException(status_code=400, detail="relative_paths is required")
    if not payload.add_tags and not payload.remove_tags:
        raise HTTPException(status_code=400, detail="add_tags or remove_tags is required")

    resolved = _require_source_and_project(project_name, source)
    index = load_index(resolved.root)
    entries_by_path = {entry.get("relative_path"): entry for entry in index.get("files", [])}

    updated: list[dict[str, object]] = []
    missing: list[str] = []

    for raw_path in payload.relative_paths:
        try:
            safe_relative = _validate_relative_media_path(raw_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        entry = entries_by_path.get(safe_relative)
        if not entry:
            missing.append(safe_relative)
            continue
        target = (resolved.root / safe_relative).resolve()
        if not target.exists() or not target.is_file():
            missing.append(safe_relative)
            continue
        sha = entry.get("sha256")
        if not sha:
            sha = compute_sha256_from_path(target)
        metadata = update_metadata_tags(
            resolved.root,
            safe_relative,
            sha,
            target,
            add_tags=payload.add_tags,
            remove_tags=payload.remove_tags,
            source=resolved.source_name,
            method="tag_update",
        )
        updated.append(
            {
                "relative_path": safe_relative,
                "sha256": sha,
                "tags": metadata.get("tags", {}),
            }
        )

    if updated:
        append_event(
            resolved.root,
            "media_tags_updated",
            {
                "paths": [item["relative_path"] for item in updated],
                "add_tags": payload.add_tags,
                "remove_tags": payload.remove_tags,
                "source": resolved.source_name,
            },
        )

    return {"status": "ok", "updated": updated, "missing": missing}


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
    ensure_subdirs(destination, ["ingest/originals", "ingest/_metadata", "ingest/thumbnails", "_manifest"])

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


def _build_download_url(project: str, relative_path: str, source: str | None) -> str:
    encoded_path = quote(relative_path, safe="/")
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/media/{quote(project)}/download" + (f"/{encoded_path}" if encoded_path else "") + suffix
