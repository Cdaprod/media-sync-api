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

from app.config import settings
from app.storage.dedupe import record_file_hash, compute_sha256_from_path
from app.storage.index import append_file_entry
from app.storage.paths import ensure_subdirs, project_path, validate_project_name

router = APIRouter(prefix="/api/projects", tags=["upload"])


@router.post("/{project_name}/upload")
async def upload_file(project_name: str, file: UploadFile = File(...)):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    project = project_path(settings.project_root, name)
    ensure_subdirs(project, ["ingest/originals", "_manifest"])
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")

    ingest_dir = project / "ingest/originals"
    manifest_db = project / "_manifest/manifest.db"

    # stream upload to temp file to avoid memory use
    with tempfile.NamedTemporaryFile(delete=False, dir=ingest_dir) as tmp:
        temp_path = Path(tmp.name)
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            tmp.write(chunk)

    sha = compute_sha256_from_path(temp_path)
    relative_dest = f"ingest/originals/{file.filename}"
    existing_path = record_file_hash(manifest_db, sha, relative_dest)

    if existing_path:
        temp_path.unlink(missing_ok=True)
        return JSONResponse(
            status_code=200,
            content={"status": "duplicate", "path": existing_path, "sha256": sha},
        )

    dest_path = ingest_dir / file.filename
    if dest_path.exists():
        dest_path = ingest_dir / f"{datetime.now(timezone.utc).timestamp()}_{file.filename}"
    shutil.move(str(temp_path), dest_path)

    entry = {
        "relative_path": str(dest_path.relative_to(project)),
        "sha256": sha,
        "size": dest_path.stat().st_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    append_file_entry(project, entry)

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
