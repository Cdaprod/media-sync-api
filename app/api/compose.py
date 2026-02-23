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
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.dedupe import compute_sha256_from_path, lookup_file_hash, record_file_hash
from app.storage.index import append_event, append_file_entry, bump_count, load_index, save_index
from app.storage.metadata import ensure_metadata
from app.storage.paths import ensure_subdirs, project_path, safe_filename, validate_project_name
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["compose"])
logger = logging.getLogger("media_sync_api.compose")


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


@router.post("/{project_name}/compose")
async def compose_existing(
    project_name: str,
    request: Request,
    payload: ComposeRequest,
    source: str | None = Query(default=None),
):
    """Compose one output from existing indexed project media paths.

    Example:
        curl -X POST http://localhost:8787/api/projects/demo/compose -H 'Content-Type: application/json' \
          -d '{"inputs":["ingest/originals/a.mp4","ingest/originals/b.mp4"],"output_name":"cut.mp4"}'
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
    output_name = safe_filename(payload.output_name if payload.output_name else "compiled.mp4")
    if not output_name.lower().endswith(".mp4"):
        output_name = f"{output_name}.mp4"
    output_abs = _resolve_within_project(project, f"{target_dir.relative_to(project).as_posix()}/{output_name}", require_exists=False)
    if output_abs.exists() and not payload.allow_overwrite:
        raise HTTPException(
            status_code=409,
            detail="Output already exists. Set allow_overwrite=true or provide a unique output_name.",
        )

    mode_used = _concat_files(inputs, output_abs, payload.mode, allow_overwrite=payload.allow_overwrite)
    logger.info(
        "compose_existing_complete",
        extra={"project": name, "source": active_source.name, "output": output_abs.relative_to(project).as_posix(), "mode": mode_used},
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
    allow_overwrite: bool = Query(default=False),
):
    """Upload many clips and return one composed artifact.

    Example:
        curl -X POST 'http://localhost:8787/api/projects/demo/compose/upload?output_name=final.mp4' \
          -F 'files=@/path/a.mp4' -F 'files=@/path/b.mp4'
    """

    _validate_compose_environment()
    name, active_source, project = _resolve_project(project_name, source)
    if not files:
        raise HTTPException(status_code=400, detail="files must include at least one upload")

    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024
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

        resolved_target_dir = _resolve_within_project(project, target_dir.strip() or "exports", require_exists=False)
        resolved_target_dir.mkdir(parents=True, exist_ok=True)
        final_name = safe_filename(output_name)
        if not final_name.lower().endswith(".mp4"):
            final_name = f"{final_name}.mp4"
        output_abs = _resolve_within_project(
            project,
            f"{resolved_target_dir.relative_to(project).as_posix()}/{final_name}",
            require_exists=False,
        )
        if output_abs.exists() and not allow_overwrite:
            raise HTTPException(
                status_code=409,
                detail="Output already exists. Set allow_overwrite=true or provide a unique output_name.",
            )

        mode_used = _concat_files(temp_inputs, output_abs, mode, allow_overwrite=allow_overwrite)
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
