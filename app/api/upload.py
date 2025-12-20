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

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.storage.dedupe import record_file_hash, compute_sha256_from_path
from app.storage.index import append_file_entry, load_index, save_index, bump_count, append_event
from app.storage.paths import ensure_subdirs, project_path, validate_project_name, safe_filename

router = APIRouter(prefix="/api/projects", tags=["upload"])


@router.post("/{project_name}/upload")
async def upload_file(project_name: str, file: UploadFile = File(...)):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings = get_settings()
    project = project_path(settings.project_root, name)
    ensure_subdirs(project, ["ingest/originals", "_manifest"])
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")

    ingest_dir = project / "ingest/originals"
    manifest_db = project / "_manifest/manifest.db"
    filename = safe_filename(file.filename)

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
    relative_dest = f"ingest/originals/{filename}"
    existing_path = record_file_hash(manifest_db, sha, relative_dest)

    if existing_path:
        temp_path.unlink(missing_ok=True)
        index = load_index(project)
        bump_count(index, "duplicates_skipped", amount=1)
        save_index(project, index)
        append_event(project, "upload_duplicate_skipped", {"path": existing_path, "sha256": sha})
        return JSONResponse(
            status_code=200,
            content={"status": "duplicate", "path": existing_path, "sha256": sha},
        )

    dest_path = ingest_dir / filename
    if dest_path.exists():
        dest_path = ingest_dir / f"{datetime.now(timezone.utc).timestamp()}_{filename}"
    shutil.move(str(temp_path), dest_path)

    entry = {
        "relative_path": str(dest_path.relative_to(project)),
        "sha256": sha,
        "size": dest_path.stat().st_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    append_file_entry(project, entry)
    append_event(project, "upload_ingested", entry)

    return {"status": "stored", "path": entry["relative_path"], "sha256": sha}


@router.post("/{project_name}/sync-album")
async def sync_album(project_name: str, payload: dict):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    project = project_path(settings.project_root, name)
    ensure_subdirs(project, ["_manifest"])
    events_path = project / "_manifest/events.jsonl"
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": "sync-album",
        "payload": payload,
    }
    with events_path.open("a", encoding="utf-8") as f:
        f.write(f"{record}\n")
    return {"status": "recorded", "event": record}
