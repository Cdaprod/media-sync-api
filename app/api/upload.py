"""Upload and sync endpoints for media-sync-api.

Example upload:
    curl -X POST http://localhost:8787/api/projects/demo/upload \
        -F "file=@/path/to/video.mov"
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import logging

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.ai_tagging import enqueue_ai_tagging
from app.config import get_settings
from app.storage.dedupe import record_file_hash, compute_sha256_from_path, lookup_file_hash
from app.storage.index import append_file_entry, load_index, save_index, bump_count, append_event
from app.storage.paths import ensure_subdirs, project_path, validate_project_name, safe_filename, derive_ingest_metadata
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["upload"])


logger = logging.getLogger("media_sync_api.upload")


@router.post("/{project_name}/upload")
async def upload_file(
    project_name: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source: str | None = None,
):
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
    if active_source.read_only:
        raise HTTPException(status_code=400, detail="Selected source is read-only")
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")
    project = project_path(active_source.root, name)
    ensure_subdirs(project, ["ingest/originals", "_manifest"])
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")

    ingest_dir = project / "ingest/originals"
    manifest_db = project / "_manifest/manifest.db"
    try:
        filename = safe_filename(file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # stream upload to temp file to avoid memory use
    max_bytes = settings.max_upload_mb * 1024 * 1024
    written = 0
    with tempfile.NamedTemporaryFile(delete=False, dir=ingest_dir) as tmp:
        temp_path = Path(tmp.name)
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            tmp.write(chunk)
            written += len(chunk)
            if written > max_bytes:
                temp_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Upload exceeds configured limit")

    sha = compute_sha256_from_path(temp_path)
    existing_path = lookup_file_hash(manifest_db, sha)

    if existing_path:
        temp_path.unlink(missing_ok=True)
        index = load_index(project)
        bump_count(index, "duplicates_skipped", amount=1)
        save_index(project, index)
        append_event(project, "upload_duplicate_skipped", {"path": existing_path, "sha256": sha})
        logger.info(
            "upload_duplicate",
            extra={
                "project": name,
                "source": active_source.name,
                "sha256": sha,
                "path": existing_path,
                "bytes": written,
            },
        )
        return JSONResponse(
            status_code=200,
            content={
                "status": "duplicate",
                "path": existing_path,
                "sha256": sha,
                "instructions": "File already recorded; you can safely retry uploads or run /reindex after manual edits.",
            },
        )

    dest_path = ingest_dir / filename
    if dest_path.exists():
        dest_path = ingest_dir / f"{datetime.now(timezone.utc).timestamp()}_{filename}"
    shutil.move(str(temp_path), dest_path)
    relative_dest = f"ingest/originals/{dest_path.name}"
    record_file_hash(manifest_db, sha, relative_dest)

    entry = {
        "relative_path": str(dest_path.relative_to(project)),
        "sha256": sha,
        "size": dest_path.stat().st_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    entry.update(derive_ingest_metadata(entry["relative_path"]))
    append_file_entry(project, entry)
    append_event(project, "upload_ingested", entry)
    logger.info(
        "upload_stored",
        extra={
            "project": name,
            "source": active_source.name,
            "sha256": sha,
            "path": entry["relative_path"],
            "bytes": entry["size"],
        },
    )

    ai_queued = False
    if background_tasks and settings.ai_tagging_enabled and settings.ai_tagging_auto:
        ai_queued = enqueue_ai_tagging(
            background_tasks,
            project,
            name,
            entry["relative_path"],
            active_source.name,
        )

    return {
        "status": "stored",
        "path": entry["relative_path"],
        "sha256": sha,
        "ai_tagging": "queued" if ai_queued else "disabled",
        "instructions": f"Use /api/projects/{name}/sync-album?source={active_source.name} to log runs and /reindex if you move files.",
    }


@router.post("/{project_name}/sync-album")
async def sync_album(project_name: str, payload: dict, source: str | None = None):
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
    project = project_path(active_source.root, name)
    ensure_subdirs(project, ["_manifest"])
    events_path = project / "_manifest/events.jsonl"
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": "sync-album",
        "payload": payload,
    }
    with events_path.open("a", encoding="utf-8") as f:
        f.write(f"{record}\n")
    logger.info("sync_album_recorded", extra={"project": name, "keys": list(payload.keys())})
    return {
        "status": "recorded",
        "event": record,
        "instructions": "Uploads still flow through /upload; this endpoint is for audit trail entries.",
    }
