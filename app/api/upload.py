"""Upload and sync endpoints for media-sync-api.

Example upload:
    curl -X POST http://localhost:8787/api/projects/demo/upload \
        -F "file=@/path/to/video.mov"
"""

from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import logging

from fastapi import APIRouter, Body, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.storage.dedupe import record_file_hash, compute_sha256_from_path, lookup_file_hash
from app.storage.index import append_file_entry, load_index, save_index, bump_count, append_event
from app.storage.metadata import ensure_metadata
from app.storage.paths import ensure_subdirs, project_path, validate_project_name, safe_filename
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["upload"])


logger = logging.getLogger("media_sync_api.upload")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_absolute_media_url(
    request: Request,
    project: str,
    relative_path: str,
    *,
    source: str | None,
    download: bool,
) -> str:
    encoded_path = quote(relative_path.lstrip("/"), safe="/")
    encoded_project = quote(project, safe="")
    suffix = f"?source={quote(source)}" if source is not None else ""
    path = f"/media/{encoded_project}/download/{encoded_path}" if download else f"/media/{encoded_project}/{encoded_path}"
    return f"{str(request.base_url).rstrip('/')}{path}{suffix}"


def _ensure_batch_storage(project: Path) -> Path:
    ensure_subdirs(project, ["_manifest/upload_batches"])
    return project / "_manifest" / "upload_batches"


def _batch_paths(project: Path, batch_id: str) -> tuple[Path, Path]:
    directory = _ensure_batch_storage(project)
    return (directory / f"{batch_id}.jsonl", directory / f"{batch_id}.meta.json")


def _write_jsonl(path: Path, record: dict[str, Any]) -> None:
    line = json.dumps(record, ensure_ascii=False)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    items: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            raw = raw.strip()
            if not raw:
                continue
            try:
                items.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
    return items


def _load_batch_meta(meta_path: Path) -> dict[str, Any]:
    return json.loads(meta_path.read_text(encoding="utf-8"))


def _resolve_project(project_name: str, source: str | None) -> tuple[str, Any, Path]:
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
    project = project_path(active_source.root, name)
    ensure_subdirs(project, ["ingest/originals", "ingest/_metadata", "_manifest"])
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    return name, active_source, project


def _require_batch_id(payload: dict[str, Any] | None, batch_id: str | None) -> str:
    if batch_id:
        return batch_id
    if payload:
        value = payload.get("batch_id")
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise HTTPException(status_code=400, detail="batch_id is required")


def _prepare_batch(project: Path, batch_id: str | None) -> Path | None:
    if not batch_id:
        return None
    jsonl_path, meta_path = _batch_paths(project, batch_id)
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="batch_id not found; call /upload?op=start first")
    meta = _load_batch_meta(meta_path)
    if meta.get("closed"):
        raise HTTPException(status_code=409, detail="batch_id is closed; start a new batch")
    return jsonl_path


async def _handle_single_upload(
    *,
    request: Request,
    project: Path,
    project_name: str,
    active_source: Any,
    file: UploadFile,
) -> dict[str, Any]:
    ingest_dir = project / "ingest/originals"
    manifest_db = project / "_manifest/manifest.db"
    try:
        filename = safe_filename(file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    max_bytes = get_settings().max_upload_mb * 1024 * 1024
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
                "project": project_name,
                "source": active_source.name,
                "sha256": sha,
                "path": existing_path,
                "bytes": written,
            },
        )
        return {
            "status": "duplicate",
            "path": existing_path,
            "sha256": sha,
            "size": written,
            "served": {
                "stream_url": _build_absolute_media_url(
                    request,
                    project_name,
                    existing_path,
                    source=active_source.name,
                    download=False,
                ),
                "download_url": _build_absolute_media_url(
                    request,
                    project_name,
                    existing_path,
                    source=active_source.name,
                    download=True,
                ),
            },
            "filename": filename,
        }

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
        "uploaded_at": _now_iso(),
    }
    ensure_metadata(
        project,
        entry["relative_path"],
        sha,
        dest_path,
        source=active_source.name,
        method="upload",
    )
    append_file_entry(project, entry)
    append_event(project, "upload_ingested", entry)
    logger.info(
        "upload_stored",
        extra={
            "project": project_name,
            "source": active_source.name,
            "sha256": sha,
            "path": entry["relative_path"],
            "bytes": entry["size"],
        },
    )
    return {
        "status": "stored",
        "path": entry["relative_path"],
        "sha256": sha,
        "size": entry["size"],
        "uploaded_at": entry["uploaded_at"],
        "served": {
            "stream_url": _build_absolute_media_url(
                request,
                project_name,
                entry["relative_path"],
                source=active_source.name,
                download=False,
            ),
            "download_url": _build_absolute_media_url(
                request,
                project_name,
                entry["relative_path"],
                source=active_source.name,
                download=True,
            ),
        },
        "filename": filename,
    }


def _write_batch_item(batch_jsonl_path: Path, item: dict[str, Any]) -> None:
    _write_jsonl(
        batch_jsonl_path,
        {
            "timestamp": _now_iso(),
            "status": item["status"],
            "filename": item.get("filename"),
            "relative_path": item["path"],
            "sha256": item["sha256"],
            "size": item.get("size"),
            "uploaded_at": item.get("uploaded_at"),
            "served": item["served"],
        },
    )


def _summarize_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {"total": len(items), "stored": 0, "duplicate": 0, "error": 0}
    served_urls: list[str] = []
    for item in items:
        status = item.get("status")
        if status in counts:
            counts[status] += 1
        else:
            counts["error"] += 1
        served = item.get("served") or {}
        url = served.get("download_url")
        if isinstance(url, str):
            served_urls.append(url)
    return {"counts": counts, "served_urls": served_urls}


def _as_upload(value: Any) -> UploadFile | None:
    if isinstance(value, UploadFile):
        return value
    if hasattr(value, "filename") and hasattr(value, "file"):
        return value  # type: ignore[return-value]
    return None


def _batch_start(project_name: str, request: Request, source: str | None) -> dict[str, Any]:
    name, active_source, project = _resolve_project(project_name, source)
    batch_id = uuid.uuid4().hex
    jsonl_path, meta_path = _batch_paths(project, batch_id)
    meta_path.write_text(
        json.dumps(
            {
                "batch_id": batch_id,
                "project": name,
                "source": active_source.name,
                "created_at": _now_iso(),
                "closed": False,
                "client": {
                    "remote": request.client.host if request.client else None,
                    "user_agent": request.headers.get("user-agent"),
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    base_url = str(request.base_url).rstrip("/")
    upload_url = f"{base_url}/api/projects/{quote(name, safe='')}/upload?op=upload&batch_id={batch_id}"
    finalize_url = f"{base_url}/api/projects/{quote(name, safe='')}/upload?op=finalize"

    return {
        "ok": True,
        "batch_id": batch_id,
        "project": name,
        "source": active_source.name,
        "upload_url": upload_url,
        "finalize_url": finalize_url,
        "batch_path": str(jsonl_path.relative_to(project)),
        "instructions": "Call upload_url once per file (multipart field name 'file'), then call finalize_url with {batch_id}.",
    }


def _batch_finalize(project_name: str, batch_id: str, source: str | None) -> dict[str, Any]:
    name, active_source, project = _resolve_project(project_name, source)
    jsonl_path, meta_path = _batch_paths(project, batch_id)
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="batch_id not found")

    meta = _load_batch_meta(meta_path)
    items = _read_jsonl(jsonl_path)
    summary = _summarize_items(items)

    if not meta.get("closed"):
        meta["closed"] = True
        meta["closed_at"] = _now_iso()
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "ok": True,
        "batch_id": batch_id,
        "project": name,
        "source": active_source.name,
        "counts": summary["counts"],
        "items": items,
        "served_urls": summary["served_urls"],
        "instructions": "Batch is marked closed; store served_urls or items for downstream actions.",
    }


def _batch_snapshot(project_name: str, batch_id: str, source: str | None) -> dict[str, Any]:
    name, active_source, project = _resolve_project(project_name, source)
    jsonl_path, meta_path = _batch_paths(project, batch_id)
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="batch_id not found")

    meta = _load_batch_meta(meta_path)
    items = _read_jsonl(jsonl_path)
    return {"ok": True, "project": name, "source": active_source.name, "meta": meta, "count": len(items), "items": items}


@router.post("/{project_name}/upload")
async def upload_file(
    project_name: str,
    request: Request,
    op: str = Query(default="upload"),
    source: str | None = None,
    batch_id: str | None = Query(default=None),
    include_batch_snapshot: bool = Query(default=False),
):
    """Upload media, or manage batch sessions via op=.

    Examples:
        curl -X POST "http://localhost:8787/api/projects/demo/upload?op=start"
        curl -X POST "http://localhost:8787/api/projects/demo/upload?op=upload" -F "file=@/path/to/video.mov"
        curl -X POST "http://localhost:8787/api/projects/demo/upload?op=finalize" \\
          -H "Content-Type: application/json" -d '{"batch_id":"..."}'
    """
    op = (op or "upload").strip().lower()
    if op == "start":
        return _batch_start(project_name, request, source)
    if op in {"finalize", "snapshot"}:
        payload: dict[str, Any] | None = None
        if "application/json" in (request.headers.get("content-type") or ""):
            try:
                payload = await request.json()
            except ValueError:
                payload = None
        resolved_batch_id = _require_batch_id(payload, batch_id)
        if op == "finalize":
            return _batch_finalize(project_name, resolved_batch_id, source)
        return _batch_snapshot(project_name, resolved_batch_id, source)

    name, active_source, project = _resolve_project(project_name, source)
    form = await request.form()
    upload_list: list[UploadFile] = []
    for value in form.getlist("files"):
        upload = _as_upload(value)
        if upload:
            upload_list.append(upload)
    for value in form.getlist("files[]"):
        upload = _as_upload(value)
        if upload:
            upload_list.append(upload)
    single = _as_upload(form.get("file"))
    if single:
        upload_list.append(single)
    if not upload_list:
        raise HTTPException(status_code=400, detail="upload requires multipart file or files[]")

    batch_jsonl_path = _prepare_batch(project, batch_id)
    items: list[dict[str, Any]] = []
    for upload_file_item in upload_list:
        item = await _handle_single_upload(
            request=request,
            project=project,
            project_name=name,
            active_source=active_source,
            file=upload_file_item,
        )
        items.append(item)
        if batch_jsonl_path is not None:
            _write_batch_item(batch_jsonl_path, item)

    if len(items) == 1 and not batch_id and len(upload_list) == 1:
        single = items[0]
        single["instructions"] = (
            f"Use /api/projects/{name}/sync-album?source={active_source.name} to log runs and /reindex if you move files."
        )
        return JSONResponse(status_code=200, content=single)

    summary = _summarize_items(items)
    return {
        "status": "ok",
        "project": name,
        "source": active_source.name,
        "batch_id": batch_id,
        "counts": summary["counts"],
        "items": items,
        "served_urls": summary["served_urls"],
        "batch_snapshot": _read_jsonl(batch_jsonl_path)[-5:] if batch_jsonl_path and include_batch_snapshot else None,
        "instructions": "Multi-file upload completed. For Shortcut repeat loops, call op=finalize with batch_id to aggregate all items.",
    }


@router.post("/{project_name}/upload-batch/start")
async def upload_batch_start(
    project_name: str,
    request: Request,
    source: str | None = None,
):
    """Start a batch session (legacy alias for op=start).

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/upload-batch/start
    """
    return _batch_start(project_name, request, source)


@router.post("/{project_name}/upload-batch/finalize")
async def upload_batch_finalize(
    project_name: str,
    payload: dict[str, Any] = Body(...),
    source: str | None = None,
):
    """Finalize a batch session (legacy alias for op=finalize).

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/upload-batch/finalize \\
          -H "Content-Type: application/json" \\
          -d '{"batch_id":"..."}'
    """
    resolved_batch_id = _require_batch_id(payload, None)
    return _batch_finalize(project_name, resolved_batch_id, source)


@router.get("/{project_name}/upload-batch/{batch_id}")
async def upload_batch_get(project_name: str, batch_id: str, source: str | None = None):
    """Fetch batch progress snapshot (legacy alias for op=snapshot).

    Example:
        curl http://localhost:8787/api/projects/demo/upload-batch/{batch_id}
    """
    return _batch_snapshot(project_name, batch_id, source)


@router.post("/{project_name}/sync-album")
async def sync_album(project_name: str, payload: dict, source: str | None = None):
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
