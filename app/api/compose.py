# /app/api/compose.py

"""Compose endpoints for media-sync-api.

Example (existing files):
    curl -X POST http://localhost:8787/api/projects/demo/compose \
      -H 'Content-Type: application/json' \
      -d '{"inputs":["ingest/originals/a.mp4","ingest/originals/b.mp4"]}'

Example (upload then compose):
    curl -X POST 'http://localhost:8787/api/projects/demo/compose/upload?output_name=final.mp4' \
      -F 'files=@/path/a.mp4' -F 'files=@/path/b.mp4'
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.dedupe import (
    compute_sha256_from_path,
    lookup_file_hash,
    record_file_hash,
    remove_file_hash_by_sha256,
    remove_file_hashes_by_relative_path,
)
from app.storage.index import (
    append_event,
    append_file_entry,
    bump_count,
    load_index,
    remove_file_entries_for_relative_path,
    save_index,
)
from app.storage.metadata import ensure_metadata
from app.storage.paths import ensure_subdirs, project_path, safe_filename, validate_project_name
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["compose"])
logger = logging.getLogger("media_sync_api.compose")

COMPOSE_SESSION_PREFIX = "compose_session_"


class ComposeRequest(BaseModel):
    """Request body for composing already-ingested project clips."""

    inputs: list[str] = Field(..., min_length=1, description="Project-relative media paths to concatenate.")
    output_name: str = Field(default="compiled.mp4", description="Target filename under the project.")
    target_dir: str = Field(default="exports", description="Project-relative destination folder for output.")
    mode: Literal["auto", "copy", "encode"] = Field(default="auto")
    allow_overwrite: bool = Field(
        default=False,
        description="When false, composition fails if the output path already exists.",
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_filename_or_400(value: str | None, *, default: str) -> str:
    """Normalize compose output names and surface validation as HTTP 400."""

    raw = (value or "").strip() or default
    try:
        return safe_filename(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _prepare_overwrite(project: Path, output_rel: str) -> None:
    """Remove stale index and manifest rows before overwriting an output path."""

    manifest_db = project / "_manifest/manifest.db"
    removed_shas = remove_file_entries_for_relative_path(project, output_rel)
    remove_file_hashes_by_relative_path(manifest_db, output_rel)
    for sha in removed_shas:
        remove_file_hash_by_sha256(manifest_db, sha)


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
    ensure_subdirs(project, ["ingest/originals", "ingest/_metadata", "ingest/thumbnails", "_manifest", "exports"])
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    return name, active_source, project


def _assert_temp_root_isolation(registry: SourceRegistry, temp_root: Path) -> None:
    """Reject temp roots that would be discoverable under any enabled source root."""

    resolved_temp = temp_root.expanduser().resolve()
    try:
        enabled_sources = registry.list_enabled()
    except Exception as exc:  # defensive: fail closed if source roots cannot be enumerated
        raise HTTPException(status_code=503, detail=f"Cannot validate source roots for compose temp isolation: {exc}") from exc

    if not enabled_sources:
        try:
            enabled_sources = [registry.require(None)]
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot determine a default source root for compose temp isolation: {exc}",
            ) from exc

    for candidate_source in enabled_sources:
        source_root = candidate_source.root.expanduser().resolve()
        if resolved_temp == source_root or source_root in resolved_temp.parents:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"MEDIA_SYNC_TEMP_ROOT ({resolved_temp}) must resolve outside enabled SourceRegistry roots "
                    f"(conflicts with '{candidate_source.name}' at {source_root})"
                ),
            )


def _validate_compose_environment() -> None:
    """Validate compose runtime paths before handling requests."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    _assert_temp_root_isolation(registry, settings.temp_root)


def _resolve_within_project(project: Path, relative_path: str, *, require_exists: bool) -> Path:
    candidate = (project / relative_path.lstrip("/")).resolve()
    if candidate != project and project not in candidate.parents:
        raise HTTPException(status_code=400, detail="Path escapes project root")
    if require_exists and not candidate.exists():
        raise HTTPException(status_code=404, detail=f"Missing path: {relative_path}")
    return candidate


def _probe_signature(path: Path) -> dict[str, str]:
    """Collect stream compatibility facts for concat-copy safety checks."""

    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return {}
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}

    streams = payload.get("streams", [])
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
    return {
        "video_codec": str(video_stream.get("codec_name", "")),
        "video_profile": str(video_stream.get("profile", "")),
        "video_pix_fmt": str(video_stream.get("pix_fmt", "")),
        "video_width": str(video_stream.get("width", "")),
        "video_height": str(video_stream.get("height", "")),
        "video_sar": str(video_stream.get("sample_aspect_ratio", "")),
        "video_dar": str(video_stream.get("display_aspect_ratio", "")),
        "audio_codec": str(audio_stream.get("codec_name", "")),
        "audio_sample_rate": str(audio_stream.get("sample_rate", "")),
        "audio_channels": str(audio_stream.get("channels", "")),
        "audio_channel_layout": str(audio_stream.get("channel_layout", "")),
    }


def _inputs_compatible_for_copy(input_paths: list[Path]) -> bool:
    signatures = [_probe_signature(path) for path in input_paths]
    if not signatures or any(not signature for signature in signatures):
        return False
    baseline = signatures[0]
    return all(signature == baseline for signature in signatures[1:])


def _error_tail(value: str | None) -> str:
    return (value or "").strip()[-1000:]


def _ffmpeg_indicates_existing_output(result: subprocess.CompletedProcess[str]) -> bool:
    combined = ((result.stderr or "") + "\n" + (result.stdout or "")).lower()
    return "file exists" in combined or "already exists" in combined or "not overwriting" in combined


def _raise_ffmpeg_error(prefix: str, result: subprocess.CompletedProcess[str], *, status_code: int = 500) -> None:
    stderr_tail = _error_tail(result.stderr)
    stdout_tail = _error_tail(result.stdout)
    detail = f"{prefix}; stderr_tail={stderr_tail or '<empty>'}; stdout_tail={stdout_tail or '<empty>'}"
    raise HTTPException(status_code=status_code, detail=detail)


def _concat_files(
    input_paths: list[Path],
    output_path: Path,
    mode: Literal["auto", "copy", "encode"],
    *,
    allow_overwrite: bool,
) -> str:
    concat_mode = mode
    if mode in {"auto", "copy"}:
        is_compatible = _inputs_compatible_for_copy(input_paths)
        if mode == "copy" and not is_compatible:
            raise HTTPException(status_code=400, detail="Inputs are incompatible for concat copy mode")
        if mode == "auto":
            concat_mode = "copy" if is_compatible else "encode"

    list_path = output_path.parent / f".{output_path.stem}.concat.txt"
    overwrite_flag = "-y" if allow_overwrite else "-n"
    with list_path.open("w", encoding="utf-8") as handle:
        for path in input_paths:
            safe = str(path).replace("'", "'\\''")
            handle.write(f"file '{safe}'\n")

    if concat_mode == "copy":
        command = [
            "ffmpeg",
            overwrite_flag,
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-c",
            "copy",
            str(output_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0:
            list_path.unlink(missing_ok=True)
            return "copy"
        if mode == "copy":
            list_path.unlink(missing_ok=True)
            if not allow_overwrite and _ffmpeg_indicates_existing_output(result):
                _raise_ffmpeg_error("ffmpeg copy blocked existing output", result, status_code=409)
            _raise_ffmpeg_error("ffmpeg copy failed", result, status_code=500)

    command = [
        "ffmpeg",
        overwrite_flag,
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_path),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    list_path.unlink(missing_ok=True)
    if result.returncode != 0:
        if not allow_overwrite and _ffmpeg_indicates_existing_output(result):
            _raise_ffmpeg_error("ffmpeg encode blocked existing output", result, status_code=409)
        _raise_ffmpeg_error("ffmpeg encode failed", result, status_code=500)
    return "encode"


def _register_output(
    *,
    project: Path,
    project_name: str,
    active_source: Any,
    output_abs: Path,
    request: Request,
    mode_used: str,
) -> dict[str, Any]:
    manifest_db = project / "_manifest/manifest.db"
    output_rel = output_abs.relative_to(project).as_posix()
    sha256 = compute_sha256_from_path(output_abs)
    existing = lookup_file_hash(manifest_db, sha256)
    if existing and existing != output_rel:
        output_abs.unlink(missing_ok=True)
        index = load_index(project)
        bump_count(index, "duplicates_skipped", amount=1)
        save_index(project, index)
        append_event(project, "compose_duplicate_skipped", {"relative_path": existing, "sha256": sha256})
        return {
            "status": "duplicate",
            "project": project_name,
            "source": active_source.name,
            "path": existing,
            "sha256": sha256,
            "mode_used": mode_used,
            "served": {
                "stream_url": _build_absolute_media_url(
                    request,
                    project_name,
                    existing,
                    source=active_source.name,
                    download=False,
                ),
                "download_url": _build_absolute_media_url(
                    request,
                    project_name,
                    existing,
                    source=active_source.name,
                    download=True,
                ),
            },
        }

    record_file_hash(manifest_db, sha256, output_rel)
    entry = {
        "relative_path": output_rel,
        "sha256": sha256,
        "size": output_abs.stat().st_size,
        "uploaded_at": _now_iso(),
    }
    ensure_metadata(project, output_rel, sha256, output_abs, source=active_source.name, method="compose")
    append_file_entry(project, entry)
    append_event(project, "compose_created", {"relative_path": output_rel, "sha256": sha256, "mode": mode_used})
    return {
        "status": "stored",
        "project": project_name,
        "source": active_source.name,
        "path": output_rel,
        "sha256": sha256,
        "size": entry["size"],
        "mode_used": mode_used,
        "served": {
            "stream_url": _build_absolute_media_url(request, project_name, output_rel, source=active_source.name, download=False),
            "download_url": _build_absolute_media_url(request, project_name, output_rel, source=active_source.name, download=True),
        },
    }


def _indexed_path_set(project: Path) -> set[str]:
    index = load_index(project)
    files = index.get("files", []) if isinstance(index, dict) else []
    result: set[str] = set()
    for entry in files:
        rel = entry.get("relative_path") if isinstance(entry, dict) else None
        if isinstance(rel, str):
            result.add(rel.replace("\\", "/").lstrip("/"))
    return result


def _header_str(request: Request, key: str) -> str | None:
    val = request.headers.get(key)
    if not val:
        return None
    val = val.strip()
    return val or None


def _header_int(request: Request, key: str) -> int | None:
    raw = _header_str(request, key)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _session_key(project_name: str, run_id: str) -> str:
    h = hashlib.sha1(f"{project_name}::{run_id}".encode("utf-8")).hexdigest()[:16]
    return f"{COMPOSE_SESSION_PREFIX}{project_name}_{h}"


def _session_dir(settings: Any, project_name: str, run_id: str) -> Path:
    return Path(settings.temp_root) / _session_key(project_name, run_id)


def _session_meta_path(session_dir: Path) -> Path:
    return session_dir / "meta.json"


def _load_session_meta(session_dir: Path) -> dict[str, Any]:
    meta_path = _session_meta_path(session_dir)
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_session_meta_atomic(session_dir: Path, meta: dict[str, Any]) -> None:
    tmp = session_dir / "meta.json.tmp"
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(_session_meta_path(session_dir))


def _prune_old_sessions(temp_root: Path, *, max_age_seconds: int = 3600) -> None:
    now = datetime.now(timezone.utc).timestamp()
    try:
        for child in temp_root.iterdir():
            if not child.is_dir():
                continue
            if not child.name.startswith(COMPOSE_SESSION_PREFIX):
                continue
            meta = _load_session_meta(child)
            created = meta.get("created_ts")
            if not isinstance(created, (int, float)):
                shutil.rmtree(child, ignore_errors=True)
                continue
            if (now - float(created)) > max_age_seconds:
                shutil.rmtree(child, ignore_errors=True)
    except Exception:
        return


def _next_compiled_sequence(project: Path) -> int:
    index = load_index(project)
    if not isinstance(index, dict):
        index = {}
    counts = index.get("counts")
    if not isinstance(counts, dict):
        counts = {}
    current = counts.get("compose_compiled_seq")
    if not isinstance(current, int):
        current = 0
    current += 1
    counts["compose_compiled_seq"] = current
    index["counts"] = counts
    save_index(project, index)
    return current


def _compiled_name(base_name: str, seq: int) -> str:
    name = (base_name or "").strip() or "compiled.mp4"
    if not name.lower().endswith(".mp4"):
        name = f"{name}.mp4"
    stem = Path(name).stem
    return f"{stem}-{seq:04d}.mp4"


def _resolve_output_name(project: Path, output_name: str | None) -> str:
    """Return a server-managed, unique mp4 filename (always suffixed).

    - output_name in {"", "auto", "compiled.mp4"} -> base "compiled.mp4"
    - otherwise -> sanitized provided base
    - always append -{seq:04d}.mp4
    """
    normalized = (output_name or "").strip().lower()

    if normalized in {"", "auto", "compiled.mp4"}:
        base = "compiled.mp4"
    else:
        base = _safe_filename_or_400(output_name, default="compiled.mp4")
        if not base.lower().endswith(".mp4"):
            base = f"{base}.mp4"

    seq = _next_compiled_sequence(project)
    return _compiled_name(base, seq)


@router.post("/{project_name}/compose")
async def compose_existing(
    project_name: str,
    request: Request,
    payload: ComposeRequest,
    source: str | None = Query(default=None),
):
    """Compose one output from existing indexed project media paths.

    Naming: ALWAYS server-managed incremental (no manual naming).
    - payload.output_name is treated as an optional *base label* only.
    - output filename is always suffixed like: <stem>-0001.mp4, <stem>-0002.mp4, ...

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/compose -H 'Content-Type: application/json' \
          -d '{"inputs":["ingest/originals/a.mp4","ingest/originals/b.mp4"],"output_name":"compiled.mp4"}'
    """

    _validate_compose_environment()
    name, active_source, project = _resolve_project(project_name, source)

    indexed_paths = _indexed_path_set(project)
    normalized_inputs = [value.replace("\\", "/").lstrip("/") for value in payload.inputs]
    missing_from_index = [value for value in normalized_inputs if value not in indexed_paths]
    if missing_from_index:
        preview_limit = 10
        preview = missing_from_index[:preview_limit]
        remaining = len(missing_from_index) - len(preview)
        suffix = f" (+{remaining} more)" if remaining > 0 else ""
        raise HTTPException(
            status_code=400,
            detail=(
                "Compose inputs must be indexed project assets. "
                f"Missing index entries (showing up to {preview_limit}): {preview}{suffix}"
            ),
        )

    inputs = [_resolve_within_project(project, rel_path, require_exists=True) for rel_path in normalized_inputs]

    target_dir = _resolve_within_project(project, payload.target_dir.strip() or "exports", require_exists=False)
    target_dir.mkdir(parents=True, exist_ok=True)

    # ALWAYS server-managed incremental output name
    final_name = _resolve_output_name(project, payload.output_name)

    output_abs = _resolve_within_project(
        project,
        f"{target_dir.relative_to(project).as_posix()}/{final_name}",
        require_exists=False,
    )

    # With incremental naming, collisions should be extremely rare; keep guard for safety.
    if output_abs.exists():
        raise HTTPException(
            status_code=409,
            detail="Output already exists (unexpected with incremental naming). Try again.",
        )

    # Ignore allow_overwrite for compose_existing in incremental naming mode.
    mode_used = _concat_files(inputs, output_abs, payload.mode, allow_overwrite=False)

    logger.info(
        "compose_existing_complete",
        extra={
            "project": name,
            "source": active_source.name,
            "output": output_abs.relative_to(project).as_posix(),
            "mode": mode_used,
        },
    )
    return _register_output(
        project=project,
        project_name=name,
        active_source=active_source,
        output_abs=output_abs,
        request=request,
        mode_used=mode_used,
    )


@router.post("/{project_name}/compose/upload")
async def compose_upload(
    project_name: str,
    request: Request,
    files: list[UploadFile] = File(...),
    source: str | None = Query(default=None),
    output_name: str = Query(default="compiled.mp4"),
    target_dir: str = Query(default="exports"),
    mode: Literal["auto", "copy", "encode"] = Query(default="auto"),
):
    """Upload many clips and return one composed artifact.

    ALWAYS server-managed incremental naming (no manual naming).
    - `output_name` is treated only as an optional *base label* (default "compiled.mp4").
      Final output is always `<stem>-NNNN.mp4`.
    - Incremental flow is designed for iOS Shortcuts: one POST per clip.

    TWO flows:
    1) Legacy: a single POST with multiple `files=...` parts -> compose immediately
    2) Incremental: one POST per clip with headers:
         - X-Compose-Time  : run/session key (string)
         - X-Compose-Index : clip index (Shortcuts Repeat Index; usually 1-based)
         - X-Compose-Count : total clips in run
       -> stage each clip; when last clip arrives, compose immediately.

    Notes:
    - `allow_overwrite` is intentionally removed: outputs are always unique.
    """

    _validate_compose_environment()
    name, active_source, project = _resolve_project(project_name, source)

    if not files:
        raise HTTPException(status_code=400, detail="files must include at least one upload")

    logger.info(
        "compose_upload_received",
        extra={
            "project": name,
            "source": active_source.name,
            "file_count": len(files),
            "filenames": [f.filename for f in files],
            "incremental": incremental,
        },
    )
    
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024

    # Opportunistic cleanup of old incremental sessions
    _prune_old_sessions(Path(settings.temp_root), max_age_seconds=3600)

    run_id = _header_str(request, "X-Compose-Time")
    idx = _header_int(request, "X-Compose-Index")
    total = _header_int(request, "X-Compose-Count")

    incremental = run_id is not None and idx is not None and total is not None and len(files) == 1

    if not incremental:
        # -------------------------
        # Legacy: single request, many files
        # -------------------------
        temp_job_dir = Path(tempfile.mkdtemp(prefix="compose_", dir=settings.temp_root))
        try:
            temp_inputs: list[Path] = []
            for index, upload in enumerate(files):
                safe_name = safe_filename(upload.filename or f"clip-{index}.mp4")
                target = temp_job_dir / f"{index:04d}_{safe_name}"

                written = 0
                with target.open("wb") as handle:
                    while True:
                        chunk = await upload.read(1024 * 1024)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > max_bytes:
                            raise HTTPException(status_code=413, detail="Upload exceeds configured limit")
                        handle.write(chunk)

                temp_inputs.append(target)

            resolved_target_dir = _resolve_within_project(
                project,
                target_dir.strip() or "exports",
                require_exists=False,
            )
            resolved_target_dir.mkdir(parents=True, exist_ok=True)

            # ALWAYS server-managed incremental output name
            final_name = _resolve_output_name(project, output_name)

            output_abs = _resolve_within_project(
                project,
                f"{resolved_target_dir.relative_to(project).as_posix()}/{final_name}",
                require_exists=False,
            )

            # With incremental naming, collisions should be extremely rare; keep guard for safety.
            if output_abs.exists():
                raise HTTPException(
                    status_code=409,
                    detail="Output already exists (unexpected with incremental naming). Try again.",
                )

            mode_used = _concat_files(temp_inputs, output_abs, mode, allow_overwrite=False)

            response = _register_output(
                project=project,
                project_name=name,
                active_source=active_source,
                output_abs=output_abs,
                request=request,
                mode_used=mode_used,
            )

            logger.info(
                "compose_upload_complete",
                extra={"project": name, "source": active_source.name, "output": response.get("path"), "mode": mode_used},
            )
            return response
        finally:
            shutil.rmtree(temp_job_dir, ignore_errors=True)

    # -------------------------
    # Incremental: one clip per POST
    # -------------------------

    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid X-Compose-Count (must be > 0)")

    # Shortcuts Repeat Index is typically 1-based; normalize safely.
    if 1 <= idx <= total:
        idx0 = idx - 1
    else:
        idx0 = idx

    if idx0 < 0 or idx0 >= total:
        raise HTTPException(status_code=400, detail=f"Invalid X-Compose-Index for count (idx={idx}, total={total})")

    session_dir = _session_dir(settings, name, run_id)
    session_dir.mkdir(parents=True, exist_ok=True)

    meta = _load_session_meta(session_dir)
    if not meta:
        meta = {
            "project": name,
            "source": active_source.name,
            "run_id": run_id,
            "created_at": _now_iso(),
            "created_ts": datetime.now(timezone.utc).timestamp(),
            "count": total,
            "received": [],
            "closed": False,
        }

    if meta.get("closed") is True:
        raise HTTPException(
            status_code=409,
            detail="Compose session already closed (X-Compose-Time reused). Use millisecond precision in your time format.",
        )

    existing_count = meta.get("count")
    if isinstance(existing_count, int) and existing_count != total:
        raise HTTPException(status_code=409, detail=f"Session count mismatch: existing={existing_count}, header={total}")

    upload = files[0]
    safe_name = safe_filename(upload.filename or f"clip-{idx0}.mp4")
    target = session_dir / f"{idx0:04d}_{safe_name}"

    written = 0
    with target.open("wb") as handle:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(status_code=413, detail="Upload exceeds configured limit")
            handle.write(chunk)

    received = meta.get("received")
    if not isinstance(received, list):
        received = []
    if idx0 not in received:
        received.append(idx0)
        received.sort()
    meta["received"] = received
    _save_session_meta_atomic(session_dir, meta)

    is_last = (idx0 == total - 1)
    if not is_last:
        missing = [i for i in range(total) if i not in set(received)]
        return JSONResponse(
            status_code=202,
            content={
                "status": "staged",
                "project": name,
                "source": active_source.name,
                "run_id": run_id,
                "received": len(received),
                "count": total,
                "missing_preview": missing[:25],
                "note": "Send remaining clips; final clip (index=count-1) triggers compose immediately.",
            },
        )

    # Last clip arrived. Ensure we have all parts.
    missing = [i for i in range(total) if i not in set(received)]
    if missing:
        raise HTTPException(status_code=409, detail=f"Last clip received but session missing indices: {missing[:50]}")

    resolved_target_dir = _resolve_within_project(project, target_dir.strip() or "exports", require_exists=False)
    resolved_target_dir.mkdir(parents=True, exist_ok=True)

    # ALWAYS server-managed incremental output name
    final_name = _resolve_output_name(project, output_name)

    output_abs = _resolve_within_project(
        project,
        f"{resolved_target_dir.relative_to(project).as_posix()}/{final_name}",
        require_exists=False,
    )

    # Gather staged inputs in order
    temp_inputs: list[Path] = []
    for i in range(total):
        match = sorted(session_dir.glob(f"{i:04d}_*"))
        if not match:
            raise HTTPException(status_code=500, detail=f"Session file missing on disk for index {i}")
        temp_inputs.append(match[0])

    mode_used = _concat_files(temp_inputs, output_abs, mode, allow_overwrite=False)

    response = _register_output(
        project=project,
        project_name=name,
        active_source=active_source,
        output_abs=output_abs,
        request=request,
        mode_used=mode_used,
    )

    # Close + cleanup
    meta["closed"] = True
    meta["closed_at"] = _now_iso()
    _save_session_meta_atomic(session_dir, meta)
    shutil.rmtree(session_dir, ignore_errors=True)

    logger.info(
        "compose_upload_incremental_complete",
        extra={"project": name, "source": active_source.name, "run_id": run_id, "output": response.get("path"), "mode": mode_used},
    )
    return response