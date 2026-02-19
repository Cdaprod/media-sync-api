"""Media browsing, streaming, and organization endpoints.

Example calls:
    curl http://localhost:8787/api/projects/demo/media
    curl -O http://localhost:8787/media/demo/ingest/originals/clip.mov
    curl -X POST http://localhost:8787/api/projects/auto-organize
"""
from __future__ import annotations

import logging
import os
import time
import mimetypes
import re
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageOps

from app.config import get_settings
from app.storage.dedupe import compute_sha256_from_path, lookup_file_hash, record_file_hash, remove_file_record
from app.storage.index import append_event, append_file_entry, load_index, remove_entries, seed_index, update_file_entry
from app.storage.metadata import (
    ensure_metadata,
    load_metadata,
    metadata_path,
    metadata_relpath,
    remove_metadata,
    update_metadata_tags,
    VIDEO_EXTENSIONS,
)
from app.storage.orientation import OrientationError, ffprobe_video, normalize_video_orientation_in_place
from app.storage.paths import (
    ensure_subdirs,
    is_thumbnail_path,
    is_temporary_path,
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
global_media_router = APIRouter(prefix="/api/media", tags=["media"])
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
THUMBNAIL_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic"}
THUMBNAIL_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
THUMBNAIL_SHA_PATTERN = re.compile(r"^[A-Fa-f0-9]{64}$")
THUMBNAIL_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}
THUMBNAIL_FALLBACK_HEADERS = {"Cache-Control": "public, max-age=300"}
_FFMPEG_AVAILABLE: bool | None = None
THUMB_MAX_W = int(os.getenv("MEDIA_SYNC_THUMB_MAX_W", "640"))
THUMB_TIMEOUT_S = int(os.getenv("MEDIA_SYNC_THUMB_TIMEOUT_S", "25"))
THUMB_TIMEOUT_FALLBACK_S = int(os.getenv("MEDIA_SYNC_THUMB_TIMEOUT_FALLBACK_S", "60"))
THUMB_TIMEOUT_SLOW_S = int(os.getenv("MEDIA_SYNC_THUMB_TIMEOUT_SLOW_S", "90"))
THUMB_SEEK_S = os.getenv("MEDIA_SYNC_THUMB_SEEK_S", "1.0")
THUMB_LOCK_TTL_S = int(os.getenv("MEDIA_SYNC_THUMB_LOCK_TTL_S", "120"))


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


class NormalizeOrientationRequest(BaseModel):
    relative_paths: List[str] | None = None
    dry_run: bool = True
    limit: int | None = Field(default=None, ge=1)


class ReconcileMediaRequest(BaseModel):
    dry_run: bool = True
    limit: int | None = Field(default=None, ge=1)
    normalize_orientation: bool = True
    rename_canonical: bool = True


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


def _remove_sha_path(sha_to_paths: dict[str, set[str]], sha: str, relative_path: str) -> None:
    paths = sha_to_paths.get(sha)
    if not paths:
        return
    paths.discard(relative_path)
    if not paths:
        sha_to_paths.pop(sha, None)


def _add_sha_path(sha_to_paths: dict[str, set[str]], sha: str, relative_path: str) -> None:
    sha_to_paths.setdefault(sha, set()).add(relative_path)


def _build_thumbnail_url(project: str, sha256: str, source: str | None) -> str:
    encoded_name = quote(thumbnail_name(sha256))
    suffix = f"?source={quote(source)}" if source is not None else ""
    return f"/thumbnails/{quote(project)}/{encoded_name}" + suffix


def _is_thumbable_media(path: Path) -> bool:
    return path.suffix.lower() in THUMBNAIL_EXTENSIONS


def _is_image_media(path: Path) -> bool:
    return path.suffix.lower() in THUMBNAIL_IMAGE_EXTENSIONS


def _ffmpeg_available() -> bool:
    global _FFMPEG_AVAILABLE
    if _FFMPEG_AVAILABLE is None:
        _FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None
    return _FFMPEG_AVAILABLE


def _run_ffmpeg(cmd: list[str], timeout_s: int) -> None:
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        logger.warning(
            "thumbnail_ffmpeg_timeout",
            extra={"timeout_s": timeout_s, "cmd": " ".join(cmd)},
        )
        raise RuntimeError("ffmpeg thumbnail generation timed out") from exc

    if proc.returncode != 0:
        stderr_tail = (proc.stderr or "")[-4000:]
        stdout_tail = (proc.stdout or "")[-4000:]
        logger.warning(
            "thumbnail_ffmpeg_failed rc=%s cmd=%s stderr_tail=%s stdout_tail=%s",
            proc.returncode,
            " ".join(cmd),
            stderr_tail,
            stdout_tail,
        )
        raise RuntimeError("ffmpeg thumbnail generation failed")


def _thumbnail_lock_path(project_root: Path, sha: str) -> Path:
    return project_root / "ingest" / "thumbnails" / ".locks" / f"{sha}.lock"


def _acquire_thumbnail_lock(lock_path: Path, ttl_s: int = THUMB_LOCK_TTL_S) -> bool:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    if lock_path.exists():
        age = time.time() - lock_path.stat().st_mtime
        if age > ttl_s:
            lock_path.unlink(missing_ok=True)
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False
    else:
        os.close(fd)
        return True


def _release_thumbnail_lock(lock_path: Path) -> None:
    lock_path.unlink(missing_ok=True)


def _generate_image_thumbnail(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_suffix(".tmp.jpg")
    with Image.open(source_path) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
            background = Image.new("RGBA", image.size, (16, 18, 28, 255))
            background.paste(image, mask=image.split()[-1])
            image = background.convert("RGB")
        else:
            image = image.convert("RGB")
        image.thumbnail((THUMB_MAX_W, THUMB_MAX_W), Image.LANCZOS)
        image.save(temp_path, format="JPEG", quality=85, optimize=True, progressive=True)
    temp_path.replace(target_path)


def _generate_video_thumbnail(source_path: Path, target_path: Path) -> None:
    if not _ffmpeg_available():
        raise RuntimeError("ffmpeg is not available to generate thumbnails")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is not available to generate thumbnails")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_suffix(".tmp.jpg")
    vf = f"thumbnail,scale='min({THUMB_MAX_W},iw)':-2:flags=lanczos"
    cmd_fast = [
        ffmpeg,
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        THUMB_SEEK_S,
        "-i",
        str(source_path),
        "-an",
        "-sn",
        "-dn",
        "-map",
        "0:v:0",
        "-f",
        "image2",
        "-frames:v",
        "1",
        "-vf",
        vf,
        "-q:v",
        "5",
        str(temp_path),
    ]
    cmd_safe = [
        ffmpeg,
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-ss",
        THUMB_SEEK_S,
        "-an",
        "-sn",
        "-dn",
        "-map",
        "0:v:0",
        "-f",
        "image2",
        "-frames:v",
        "1",
        "-vf",
        vf,
        "-q:v",
        "5",
        str(temp_path),
    ]
    cmd_slow = [
        ffmpeg,
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-an",
        "-sn",
        "-dn",
        "-map",
        "0:v:0",
        "-f",
        "image2",
        "-frames:v",
        "1",
        "-vf",
        vf,
        "-q:v",
        "5",
        str(temp_path),
    ]
    try:
        _run_ffmpeg(cmd_fast, timeout_s=THUMB_TIMEOUT_S)
    except RuntimeError:
        try:
            _run_ffmpeg(cmd_safe, timeout_s=THUMB_TIMEOUT_FALLBACK_S)
        except RuntimeError:
            _run_ffmpeg(cmd_slow, timeout_s=THUMB_TIMEOUT_SLOW_S)
    temp_path.replace(target_path)
    temp_path.unlink(missing_ok=True)


def _generate_thumbnail(source_path: Path, target_path: Path) -> None:
    if _is_image_media(source_path):
        try:
            _generate_image_thumbnail(source_path, target_path)
        except OSError as exc:
            raise RuntimeError("image thumbnail generation failed") from exc
        return
    _generate_video_thumbnail(source_path, target_path)


def _thumbnail_fallback_response(label: str, status: str = "fallback") -> Response:
    safe_label = "".join(ch for ch in label.upper() if ch.isalnum() or ch == " ")
    safe_label = safe_label.strip() or "VIDEO"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a2d3a"/>
      <stop offset="100%" stop-color="#1d2030"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" rx="28" fill="url(#bg)"/>
  <rect x="24" y="24" width="592" height="312" rx="22" fill="rgba(255,255,255,0.06)"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#b7bcc8"
    font-family="Inter, system-ui, sans-serif" font-size="48" font-weight="600" letter-spacing="2">
    {safe_label}
  </text>
</svg>"""
    headers = {**THUMBNAIL_FALLBACK_HEADERS, "X-Thumb-Status": status}
    return Response(content=svg, media_type="image/svg+xml", headers=headers)


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
        if is_thumbnail_path(Path(safe_relative)) or is_temporary_path(Path(safe_relative)):
            continue
        item = dict(entry)
        item["relative_path"] = safe_relative
        item["stream_url"] = _build_stream_url(resolved.name, safe_relative, resolved.source_name)
        item["download_url"] = _build_download_url(resolved.name, safe_relative, resolved.source_name)
        if _is_thumbable_media(Path(safe_relative)):
            sha = item.get("sha256")
            if isinstance(sha, str):
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
            label = source_path.suffix.lstrip(".") or "VIDEO"
            if not _is_image_media(source_path) and not _ffmpeg_available():
                return _thumbnail_fallback_response(label, status="ffmpeg_missing")
            lock_path = _thumbnail_lock_path(resolved.root, sha)
            if not _acquire_thumbnail_lock(lock_path):
                return _thumbnail_fallback_response(label, status="locked")
            try:
                _generate_thumbnail(source_path, target_path)
            except RuntimeError as exc:
                message = str(exc)
                if "ffmpeg is not available" in message:
                    return _thumbnail_fallback_response(label, status="ffmpeg_missing")
                if "timed out" in message:
                    logger.warning(
                        "thumbnail_generation_timed_out",
                        extra={"project": resolved.name, "path": safe_relative},
                    )
                    return _thumbnail_fallback_response(label, status="timeout")
                if "failed" in message:
                    return _thumbnail_fallback_response(label, status="failed")
                raise HTTPException(status_code=500, detail=message) from exc
            finally:
                _release_thumbnail_lock(lock_path)

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


def _normalize_orientation_for_project(
    resolved: _ResolvedProject,
    payload: NormalizeOrientationRequest,
) -> dict[str, object]:
    index = load_index(resolved.root)
    entries_by_path = {entry.get("relative_path"): entry for entry in index.get("files", [])}
    sha_to_paths: dict[str, set[str]] = {}
    for rel_path, entry in entries_by_path.items():
        sha = entry.get("sha256")
        if not sha or not isinstance(rel_path, str):
            continue
        sha_to_paths.setdefault(sha, set()).add(rel_path)

    target_paths: list[str]
    if payload.relative_paths:
        target_paths = []
        for raw_path in payload.relative_paths:
            target_paths.append(_validate_relative_media_path(raw_path))
    else:
        target_paths = [path for path in entries_by_path.keys() if isinstance(path, str)]

    if payload.limit:
        target_paths = target_paths[: payload.limit]

    changed: list[dict[str, object]] = []
    skipped: list[dict[str, object]] = []
    failed: list[dict[str, object]] = []

    for relative_path in target_paths:
        entry = entries_by_path.get(relative_path)
        if not entry:
            skipped.append({"relative_path": relative_path, "reason": "not_indexed"})
            continue
        if is_temporary_path(Path(relative_path)):
            skipped.append({"relative_path": relative_path, "reason": "temporary_artifact"})
            continue
        if not relative_path.startswith("ingest/originals/"):
            skipped.append({"relative_path": relative_path, "reason": "outside_ingest"})
            continue
        if Path(relative_path).suffix.lower() not in VIDEO_EXTENSIONS:
            skipped.append({"relative_path": relative_path, "reason": "not_video"})
            continue

        target = (resolved.root / relative_path).resolve()
        project_root = resolved.root.resolve()
        if project_root not in target.parents and target != project_root:
            failed.append({"relative_path": relative_path, "error": "outside_project"})
            continue
        if not target.exists() or not target.is_file():
            failed.append({"relative_path": relative_path, "error": "missing_on_disk"})
            continue

        try:
            probe = ffprobe_video(target)
        except OrientationError as exc:
            failed.append({"relative_path": relative_path, "error": str(exc)})
            continue

        if probe.rotation not in (90, 180, 270):
            skipped.append({"relative_path": relative_path, "reason": "already_upright"})
            continue

        if payload.dry_run:
            changed.append({"relative_path": relative_path, "rotation": probe.rotation, "status": "planned"})
            continue

        backup_path: Path | None = None
        try:
            result = normalize_video_orientation_in_place(target, keep_backup=True)
            if not result.changed:
                skipped.append({"relative_path": relative_path, "reason": "no_change"})
                continue
            backup_path = result.backup_path
        except OrientationError as exc:
            failed.append({"relative_path": relative_path, "error": str(exc)})
            continue

        new_sha = compute_sha256_from_path(target)
        previous_sha = entry.get("sha256")
        existing_path = lookup_file_hash(_manifest_db_path(resolved.root), new_sha)
        if existing_path and existing_path != relative_path:
            if backup_path and backup_path.exists():
                target.unlink(missing_ok=True)
                backup_path.rename(target)
            failed.append({"relative_path": relative_path, "error": "sha_collision"})
            continue

        manifest_db = _manifest_db_path(resolved.root)
        try:
            if previous_sha:
                remove_file_record(manifest_db, previous_sha, relative_path)
            record_file_hash(manifest_db, new_sha, relative_path)
            updated_entry = update_file_entry(
                resolved.root,
                relative_path,
                {
                    "sha256": new_sha,
                    "size": target.stat().st_size,
                    "normalized_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            if not updated_entry:
                raise RuntimeError("index entry missing for normalized file")
            ensure_metadata(
                resolved.root,
                relative_path,
                new_sha,
                target,
                source=resolved.source_name,
                method="orientation_normalize",
            )
        except Exception as exc:
            remove_file_record(manifest_db, new_sha, relative_path)
            if previous_sha:
                record_file_hash(manifest_db, previous_sha, relative_path)
            remove_metadata(resolved.root, new_sha)
            if backup_path and backup_path.exists():
                target.unlink(missing_ok=True)
                backup_path.rename(target)
                fallback_sha = previous_sha or compute_sha256_from_path(target)
                update_file_entry(
                    resolved.root,
                    relative_path,
                    {
                        "sha256": fallback_sha,
                        "size": target.stat().st_size,
                    },
                )
            failed.append({"relative_path": relative_path, "error": f"update_failed: {exc}"})
            continue

        if previous_sha and previous_sha != new_sha:
            _remove_sha_path(sha_to_paths, previous_sha, relative_path)
            _add_sha_path(sha_to_paths, new_sha, relative_path)
            if previous_sha not in sha_to_paths:
                remove_metadata(resolved.root, previous_sha)
                thumbnail_path(resolved.root, previous_sha).unlink(missing_ok=True)

        if backup_path and backup_path.exists():
            backup_path.unlink(missing_ok=True)

        changed.append(
            {
                "relative_path": relative_path,
                "rotation": probe.rotation,
                "sha256": new_sha,
                "entry": updated_entry,
                "status": "normalized",
            }
        )

    if changed:
        append_event(
            resolved.root,
            "media_orientation_normalized",
            {
                "paths": [item["relative_path"] for item in changed],
                "dry_run": payload.dry_run,
                "source": resolved.source_name,
            },
        )

    return {
        "status": "ok",
        "project": resolved.name,
        "source": resolved.source_name,
        "dry_run": payload.dry_run,
        "changed": changed,
        "skipped": skipped,
        "failed": failed,
        "instructions": "Set dry_run=false to apply orientation fixes in place.",
    }


@router.post("/{project_name}/media/normalize-orientation")
async def normalize_orientation(
    project_name: str,
    payload: NormalizeOrientationRequest,
    source: str | None = None,
):
    """Normalize video orientation metadata in place for a project.

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/media/normalize-orientation \
          -H "Content-Type: application/json" \
          -d '{"dry_run": true}'
    """

    resolved = _require_source_and_project(project_name, source)
    if not (resolved.root / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    try:
        return _normalize_orientation_for_project(resolved, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{project_name}/media/normalize-orientation")
async def normalize_orientation_get(
    project_name: str,
    dry_run: bool = True,
    limit: int | None = Query(default=None, ge=1),
    source: str | None = None,
):
    """Normalize video orientation metadata in place for a project (GET fallback).

    Example:
        curl "http://localhost:8787/api/projects/demo/media/normalize-orientation?dry_run=false"
    """

    payload = NormalizeOrientationRequest(dry_run=dry_run, limit=limit)
    resolved = _require_source_and_project(project_name, source)
    if not (resolved.root / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    try:
        return _normalize_orientation_for_project(resolved, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@global_media_router.post("/normalize-orientation")
async def normalize_orientation_all(
    payload: NormalizeOrientationRequest,
    source: str | None = None,
):
    """Normalize orientation across all projects in a source.

    Example:
        curl -X POST http://localhost:8787/api/media/normalize-orientation \
          -H "Content-Type: application/json" \
          -d '{"dry_run": true}'
    """

    registry = SourceRegistry(get_settings().project_root)
    try:
        sources = registry.list_enabled() if source is None else [registry.require(source)]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    results: list[dict[str, object]] = []
    skipped_projects: list[dict[str, str]] = []
    total_changed = 0
    total_skipped = 0
    total_failed = 0

    for active_source in sources:
        if not active_source.accessible:
            skipped_projects.append({"project": active_source.name, "reason": "source_unreachable"})
            continue
        for path in active_source.root.iterdir() if active_source.root.exists() else []:
            if not path.is_dir():
                continue
            if path.name.startswith("_"):
                continue
            try:
                name = validate_project_name(path.name)
            except ValueError:
                continue
            if not (path / "index.json").exists():
                skipped_projects.append({"project": name, "reason": "index_missing"})
                continue
            resolved = _ResolvedProject(name=name, source_name=active_source.name, root=path)
            try:
                result = _normalize_orientation_for_project(resolved, payload)
            except ValueError as exc:
                skipped_projects.append({"project": name, "reason": str(exc)})
                continue
            results.append(result)
            total_changed += len(result.get("changed", []))
            total_skipped += len(result.get("skipped", []))
            total_failed += len(result.get("failed", []))

    return {
        "status": "ok",
        "source": source or "all",
        "dry_run": payload.dry_run,
        "projects_processed": len(results),
        "projects_skipped": skipped_projects,
        "totals": {
            "planned": total_changed if payload.dry_run else 0,
            "changed": 0 if payload.dry_run else total_changed,
            "skipped": total_skipped,
            "failed": total_failed,
        },
        "results": results,
        "instructions": "Set dry_run=false to apply orientation fixes in place.",
    }


@global_media_router.get("/normalize-orientation")
async def normalize_orientation_all_get(
    dry_run: bool = True,
    limit: int | None = Query(default=None, ge=1),
    source: str | None = None,
):
    """Normalize orientation across all projects in a source (GET fallback).

    Example:
        curl "http://localhost:8787/api/media/normalize-orientation?dry_run=true"
    """

    payload = NormalizeOrientationRequest(dry_run=dry_run, limit=limit)
    return await normalize_orientation_all(payload, source=source)


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


def _read_ffprobe_payload(path: Path, timeout_s: int = 20) -> dict[str, Any] | None:
    """Read ffprobe JSON payload for media introspection.

    Example:
        payload = _read_ffprobe_payload(Path("/data/projects/P1/ingest/originals/clip.mov"))
    """

    if not shutil.which("ffprobe"):
        return None
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return None


def _detect_rotation_from_ffprobe_payload(payload: dict[str, Any] | None) -> tuple[int, str | None]:
    if not isinstance(payload, dict):
        return 0, None
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    for stream in streams:
        if not isinstance(stream, dict):
            continue
        tags = stream.get("tags") if isinstance(stream.get("tags"), dict) else {}
        rotate = tags.get("rotate")
        if rotate is not None:
            try:
                return int(rotate) % 360, "tags.rotate"
            except (TypeError, ValueError):
                pass
        side_data = stream.get("side_data_list") if isinstance(stream.get("side_data_list"), list) else []
        for side in side_data:
            if not isinstance(side, dict):
                continue
            if side.get("side_data_type") == "Display Matrix" and side.get("rotation") is not None:
                try:
                    return int(side.get("rotation")) % 360, "display_matrix"
                except (TypeError, ValueError):
                    continue
            if side.get("rotation") is not None:
                try:
                    return int(side.get("rotation")) % 360, "display_matrix"
                except (TypeError, ValueError):
                    continue
    return 0, None


def _extract_creation_timestamp(payload: dict[str, Any] | None, fallback_path: Path) -> datetime:
    candidates: list[str] = []
    if isinstance(payload, dict):
        fmt = payload.get("format") if isinstance(payload.get("format"), dict) else {}
        format_tags = fmt.get("tags") if isinstance(fmt.get("tags"), dict) else {}
        value = format_tags.get("creation_time")
        if isinstance(value, str):
            candidates.append(value)
        streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
        for stream in streams:
            if not isinstance(stream, dict):
                continue
            tags = stream.get("tags") if isinstance(stream.get("tags"), dict) else {}
            value = tags.get("creation_time")
            if isinstance(value, str):
                candidates.append(value)
    for value in candidates:
        normalized = value.strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except ValueError:
            continue
    return datetime.fromtimestamp(fallback_path.stat().st_mtime, tz=timezone.utc)


def _classify_origin(filename: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    lower = filename.lower()
    streams = payload.get("streams") if isinstance(payload, dict) and isinstance(payload.get("streams"), list) else []
    fmt_tags = {}
    if isinstance(payload, dict) and isinstance(payload.get("format"), dict):
        tags = payload["format"].get("tags")
        if isinstance(tags, dict):
            fmt_tags = {str(k).lower(): str(v) for k, v in tags.items()}
    flattened = " ".join(fmt_tags.values()).lower()
    if re.match(r"^z7v_\d+", lower):
        return {"source": "nikon_z7", "confidence": 0.95, "evidence": "filename_z7v"}
    if "copy" in lower and (lower.endswith(".mov") or lower.endswith(".mp4")):
        return {"source": "iphone", "confidence": 0.8, "evidence": "filename_copy"}
    if re.match(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.(mp4|mov|mkv)$", lower):
        return {"source": "obs", "confidence": 0.9, "evidence": "filename_obs_timestamp"}
    apple_keys = ["com.apple.quicktime.make", "com.apple.quicktime.model", "com.apple.quicktime.software"]
    for key in apple_keys:
        if key in fmt_tags:
            return {"source": "iphone", "confidence": 0.85, "evidence": key}
    if "obs" in flattened:
        return {"source": "obs", "confidence": 0.7, "evidence": "format_tags_obs"}
    for stream in streams:
        if not isinstance(stream, dict):
            continue
        tags = stream.get("tags") if isinstance(stream.get("tags"), dict) else {}
        tag_blob = " ".join(str(v).lower() for v in tags.values())
        if "obs" in tag_blob:
            return {"source": "obs", "confidence": 0.7, "evidence": "stream_tags_obs"}
    return {"source": "unknown", "confidence": 0.3, "evidence": "no_match"}


def _canonical_filename(project_name: str, origin: str, created_at: datetime, sha256: str, extension: str) -> str:
    project_prefix = project_name.split("-", 1)[0]
    ts = created_at.astimezone(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{project_prefix}_{origin}_{ts}_{sha256[:8]}{extension.lower()}"


@router.post("/{project_name}/media/reconcile")
async def reconcile_project_media(
    project_name: str,
    payload: ReconcileMediaRequest,
    source: str | None = None,
):
    """Reconcile project media by classifying origin, normalizing orientation, and canonicalizing names.

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/media/reconcile \
          -H "Content-Type: application/json" \
          -d '{"dry_run": true, "normalize_orientation": true, "rename_canonical": true}'
    """

    resolved = _require_source_and_project(project_name, source)

    if payload.dry_run:
        reindex_result = {
            "indexed": 0,
            "files": [],
            "removed": 0,
            "relocated": 0,
            "skipped_unsupported": 0,
            "normalized": 0,
            "normalization_failed": 0,
        }
        index = load_index(resolved.root)
    else:
        reindex_result = reindex_project(
            resolved.root,
            normalize_videos=payload.normalize_orientation,
        )
        index = load_index(resolved.root)
    entries = [entry for entry in index.get("files", []) if isinstance(entry.get("relative_path"), str)]
    if payload.limit:
        entries = entries[: payload.limit]

    plan: list[dict[str, Any]] = []
    renamed: list[dict[str, Any]] = []
    for entry in entries:
        rel_path = str(entry["relative_path"])
        path = (resolved.root / rel_path).resolve()
        if not path.exists() or not path.is_file() or is_temporary_path(Path(rel_path)):
            continue
        probe_payload = _read_ffprobe_payload(path)
        rotation, rotation_source = _detect_rotation_from_ffprobe_payload(probe_payload)
        origin = _classify_origin(path.name, probe_payload)
        created_at = _extract_creation_timestamp(probe_payload, path)
        canonical_name = _canonical_filename(resolved.name, origin["source"], created_at, entry.get("sha256", ""), path.suffix)
        canonical_rel = f"ingest/originals/{canonical_name}"

        metadata = load_metadata(resolved.root, entry.get("sha256", "")) or {}
        metadata.setdefault("origin", {})
        metadata["origin"] = {
            "source": origin["source"],
            "confidence": origin["confidence"],
            "evidence": origin["evidence"],
        }
        metadata["rotation_detected_deg"] = rotation
        metadata["rotation_source"] = rotation_source
        metadata.setdefault("aliases", [])
        if rel_path not in metadata["aliases"]:
            metadata["aliases"].append(rel_path)
        if not payload.dry_run and entry.get("sha256"):
            sidecar = metadata_path(resolved.root, entry["sha256"])
            if sidecar.exists():
                sidecar.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")

        action = {
            "relative_path": rel_path,
            "origin": origin,
            "rotation_detected_deg": rotation,
            "rotation_source": rotation_source,
            "canonical_name": canonical_name,
            "rename_planned": payload.rename_canonical and canonical_rel != rel_path,
            "normalize_planned": payload.normalize_orientation and rotation in (90, 180, 270),
        }
        plan.append(action)

        if payload.dry_run or not payload.rename_canonical or canonical_rel == rel_path:
            continue

        target = (resolved.root / canonical_rel).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target = _dedupe_destination(target)
        path.rename(target)
        new_rel = relpath_posix(target, resolved.root)
        sha = entry.get("sha256")
        if sha:
            remove_file_record(_manifest_db_path(resolved.root), sha, rel_path)
            record_file_hash(_manifest_db_path(resolved.root), sha, new_rel)
        update_file_entry(resolved.root, rel_path, {"relative_path": new_rel})
        renamed.append({"from": rel_path, "to": new_rel})

    if not payload.dry_run and renamed:
        append_event(
            resolved.root,
            "media_reconciled",
            {
                "source": resolved.source_name,
                "renamed": renamed,
                "normalized": reindex_result.get("normalized", 0),
            },
        )
        reindex_result = reindex_project(
            resolved.root,
            normalize_videos=payload.normalize_orientation,
        )

    return {
        "status": "ok",
        "project": resolved.name,
        "source": resolved.source_name,
        "dry_run": payload.dry_run,
        "reindex": reindex_result,
        "actions": plan,
        "renamed": renamed,
        "instructions": "Run with dry_run=false to apply canonical renames and metadata updates.",
    }
