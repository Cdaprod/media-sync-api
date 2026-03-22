"""Compose endpoints for media-sync-api.

Internal architecture (single file, layered):
    1. Imports / Constants
    2. Request & Response Models
    3. Value Objects (dataclasses)
    4. Pure Helpers
    5. Project / Environment Helpers
    6. ComposeSession
    7. ComposePlanner
    8. ComposeExecutor
    9. ComposeRegistrar
    10. ComposeService
    11. FastAPI Routes

Example (existing files):
    curl -X POST http://localhost:8787/api/projects/demo/compose \
      -H 'Content-Type: application/json' \
      -d '{"inputs":["ingest/originals/a.mp4","ingest/originals/b.mp4"]}'

Example (upload then compose):
    curl -X POST 'http://localhost:8787/api/projects/demo/compose/upload?output_name=final.mp4' \
      -F 'files=@/path/a.mp4' -F 'files=@/path/b.mp4'
"""

from __future__ import annotations

# =============================================================================
# 1. IMPORTS / CONSTANTS
# =============================================================================

import hashlib
import json
import logging
import shlex
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from collections.abc import Callable, Sequence
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
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
)
from app.storage.index import (
    append_event,
    append_file_entry,
    bump_count,
    load_index,
    save_index,
)
from app.storage.metadata import ensure_metadata
from app.storage.paths import ensure_subdirs, project_path, safe_filename, validate_project_name
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["compose"])
logger = logging.getLogger("media_sync_api.compose")

COMPOSE_SESSION_PREFIX = "compose_session_"
COMPOSE_JOB_PREFIX = "compose_job_"
SESSION_MAX_AGE_SECONDS = 3600
JOB_MAX_AGE_SECONDS = 86400
JOB_MAX_WORKERS = 2

# Media-kind policy for compose preprocessing.
# Audio remains unsupported for now.
SUPPORTED_DIRECT_COMPOSE_KINDS: frozenset[str] = frozenset({"video", "image"})

# Duration used when converting still images into temporary MP4 segments.
IMAGE_FREEZE_SECONDS: float = 2.0
ENCODE_TARGET_FPS = 30000 / 1001
ENCODE_TARGET_FPS_ARG = "30000/1001"
ENCODE_VIDEO_TIME_BASE = "1001/30000"
ENCODE_AUDIO_TIME_BASE = "1/48000"
ENCODE_AV_DRIFT_MAX_SECONDS = 0.125
COPY_COMPATIBILITY_FIELDS: tuple[str, ...] = (
    "format_name",
    "video_codec",
    "video_profile",
    "video_pix_fmt",
    "video_width",
    "video_height",
    "video_sar",
    "video_dar",
    "video_avg_frame_rate",
    "video_r_frame_rate",
    "video_time_base",
    "video_codec_tag",
    "video_field_order",
    "video_has_b_frames",
    "video_level",
    "video_start_time",
    "audio_codec",
    "audio_profile",
    "audio_sample_rate",
    "audio_channels",
    "audio_channel_layout",
    "audio_time_base",
    "audio_start_time",
)


# =============================================================================
# 2. REQUEST & RESPONSE MODELS
# =============================================================================

class ComposeRequest(BaseModel):
    """Request body for composing already-ingested project clips."""

    inputs: list[str] = Field(..., min_length=1, description="Project-relative media paths to concatenate.")
    output_name: str = Field(default="compiled.mp4", description="Target filename base label.")
    target_dir: str = Field(default="exports", description="Project-relative destination folder.")
    mode: Literal["auto", "copy", "encode"] = Field(default="auto")


# =============================================================================
# 3. VALUE OBJECTS
# =============================================================================

@dataclass(frozen=True)
class ProjectContext:
    """Resolved project + source context. Replaces the (name, source, project) tuple."""

    project_name: str
    source_name: str
    project_root: Path       # absolute path to the project directory
    source_root: Path        # absolute path to the source root


@dataclass(frozen=True)
class ComposeSpec:
    """Normalized user intent for a compose operation."""

    inputs: list[str]                               # normalized relative paths (or empty for upload flows)
    output_name: str                                # raw base label, not the final filename
    target_dir: str
    mode: Literal["auto", "copy", "encode"]


@dataclass(frozen=True)
class InputAsset:
    """Resolved input asset with detected media kind.

    signature: ffprobe stream facts cached here so downstream code never
    needs to re-probe the same file (kind detection and copy-compatibility
    both come from one ffprobe pass per file).
    """

    path: Path
    kind: Literal["video", "image", "audio", "unknown"]
    signature: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class PreparedSegment:
    """Executor-ready segment after optional preprocessing.

    Today all segments are passthrough (generated=False).
    Future: image->timed video, audio->slated video.
    """

    path: Path
    source_kind: Literal["video", "image", "audio", "unknown"]
    generated: bool = False


@dataclass(frozen=True)
class ComposePlan:
    """Execution plan. The seam between policy and ffmpeg.

    input_assets: classified source inputs (used for validation and future preprocessing)
    prepared_segments: executor-ready paths in order (today == input_paths, future may differ)
    """

    input_paths: list[Path]
    output_path: Path
    strategy: Literal["copy", "encode"]
    requested_mode: Literal["auto", "copy", "encode"]
    strategy_reasons: list[str] = field(default_factory=list)
    input_assets: list[InputAsset] = field(default_factory=list)
    prepared_segments: list[PreparedSegment] = field(default_factory=list)


@dataclass(frozen=True)
class ComposeResult:
    """What the executor returns after ffmpeg completes."""

    output_path: Path
    mode_used: Literal["copy", "encode"]
    registration_mode: Literal["preserve_runs", "collapse_duplicates", "replace_path"] = "preserve_runs"


@dataclass
class ComposeJob:
    """Background compose job snapshot persisted under MEDIA_SYNC_TEMP_ROOT."""

    id: str
    project_name: str
    source_name: str
    flow: Literal["existing", "upload_batch", "upload_incremental", "bulk"]
    target_dir: str
    output_name: str
    mode_requested: Literal["auto", "copy", "encode"]
    input_count: int
    input_preview: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    error_status_code: int | None = None
    result: dict[str, Any] | None = None
    refresh_scope: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "project_name": self.project_name,
            "source_name": self.source_name,
            "flow": self.flow,
            "target_dir": self.target_dir,
            "output_name": self.output_name,
            "mode_requested": self.mode_requested,
            "input_count": self.input_count,
            "input_preview": list(self.input_preview),
            "created_at": self.created_at,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "error_status_code": self.error_status_code,
            "result": self.result,
            "refresh_scope": self.refresh_scope,
        }


# =============================================================================
# 4. PURE HELPERS
# =============================================================================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_filename_or_400(value: str | None, *, default: str) -> str:
    raw = (value or "").strip() or default
    try:
        return safe_filename(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _error_tail(value: str | None) -> str:
    return (value or "").strip()[-1000:]


def _log_compose(level: Literal["info", "warning", "error"], event: str, **fields: Any) -> None:
    """Emit consistent compose log events with key=value payloads."""
    parts: list[str] = []
    for key, value in fields.items():
        if value is None:
            continue
        if isinstance(value, (dict, list, tuple, set)):
            rendered = json.dumps(value, ensure_ascii=False, sort_keys=True)
        else:
            rendered = str(value)
        parts.append(f"{key}={rendered}")
    getattr(logger, level)("%s %s", event, " ".join(parts).strip())


def _format_command(command: Sequence[str]) -> str:
    return shlex.join([str(part) for part in command])


def _ffmpeg_indicates_existing_output(result: subprocess.CompletedProcess[str]) -> bool:
    combined = ((result.stderr or "") + "\n" + (result.stdout or "")).lower()
    return "file exists" in combined or "already exists" in combined or "not overwriting" in combined


def _probe_signature(path: Path) -> dict[str, str]:
    """Collect conservative stream/container facts for concat-copy safety checks."""
    command = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]
    try:
        result = subprocess.run(command, capture_output=True, text=True)
    except FileNotFoundError:
        return {}
    if result.returncode != 0:
        return {}
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}

    streams = payload.get("streams", [])
    fmt = payload.get("format", {})
    v = next((s for s in streams if s.get("codec_type") == "video"), {})
    a = next((s for s in streams if s.get("codec_type") == "audio"), {})
    return {
        "format_name": str(fmt.get("format_name", "")),
        "format_long_name": str(fmt.get("format_long_name", "")),
        "format_duration": str(fmt.get("duration", "")),
        "video_codec": str(v.get("codec_name", "")),
        "video_profile": str(v.get("profile", "")),
        "video_pix_fmt": str(v.get("pix_fmt", "")),
        "video_width": str(v.get("width", "")),
        "video_height": str(v.get("height", "")),
        "video_sar": str(v.get("sample_aspect_ratio", "")),
        "video_dar": str(v.get("display_aspect_ratio", "")),
        "video_avg_frame_rate": str(v.get("avg_frame_rate", "")),
        "video_r_frame_rate": str(v.get("r_frame_rate", "")),
        "video_time_base": str(v.get("time_base", "")),
        "video_codec_tag": str(v.get("codec_tag_string", "")),
        "video_field_order": str(v.get("field_order", "")),
        "video_has_b_frames": str(v.get("has_b_frames", "")),
        "video_level": str(v.get("level", "")),
        "video_start_time": str(v.get("start_time", "")),
        "video_duration": str(v.get("duration", "")),
        "audio_codec": str(a.get("codec_name", "")),
        "audio_profile": str(a.get("profile", "")),
        "audio_sample_rate": str(a.get("sample_rate", "")),
        "audio_channels": str(a.get("channels", "")),
        "audio_channel_layout": str(a.get("channel_layout", "")),
        "audio_time_base": str(a.get("time_base", "")),
        "audio_start_time": str(a.get("start_time", "")),
        "audio_duration": str(a.get("duration", "")),
    }


def _probe_media_summary(path: Path) -> dict[str, Any]:
    """Return a compact ffprobe summary used for compose logging/validation."""
    signature = _probe_signature(path)
    video_probe = _probe_video_geometry(path) if signature.get("video_codec") else {"width": 0, "height": 0, "rotate": 0}
    duration_raw = signature.get("format_duration") or ""
    try:
        duration = round(float(duration_raw), 3) if duration_raw else None
    except (TypeError, ValueError):
        duration = None
    video_duration = _float_or_none(signature.get("video_duration"))
    audio_duration = _float_or_none(signature.get("audio_duration"))
    av_duration_delta = None
    if video_duration is not None and audio_duration is not None:
        av_duration_delta = round(abs(video_duration - audio_duration), 3)
    return {
        "path": path.name,
        "suffix": path.suffix.lower(),
        "format": signature.get("format_name") or "",
        "video_codec": signature.get("video_codec") or "",
        "video_profile": signature.get("video_profile") or "",
        "video_pix_fmt": signature.get("video_pix_fmt") or "",
        "video_width": int(signature.get("video_width") or 0),
        "video_height": int(signature.get("video_height") or 0),
        "video_avg_frame_rate": signature.get("video_avg_frame_rate") or "",
        "video_r_frame_rate": signature.get("video_r_frame_rate") or "",
        "video_time_base": signature.get("video_time_base") or "",
        "video_start_time": signature.get("video_start_time") or "",
        "video_duration_seconds": video_duration,
        "rotate": int(video_probe.get("rotate") or 0),
        "audio_codec": signature.get("audio_codec") or "",
        "audio_sample_rate": signature.get("audio_sample_rate") or "",
        "audio_channels": signature.get("audio_channels") or "",
        "audio_channel_layout": signature.get("audio_channel_layout") or "",
        "audio_start_time": signature.get("audio_start_time") or "",
        "audio_duration_seconds": audio_duration,
        "av_duration_delta_seconds": av_duration_delta,
        "duration_seconds": duration,
    }


def _rate_to_float(value: str | None) -> float | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if "/" in raw:
            num_s, den_s = raw.split("/", 1)
            den = float(den_s)
            if den == 0:
                return None
            return float(num_s) / den
        return float(raw)
    except (TypeError, ValueError):
        return None


def _float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _validate_encode_probe(summary: dict[str, Any], *, target_width: int, target_height: int) -> list[str]:
    """Validate that a normalized/encoded summary matches canonical compose expectations."""
    issues: list[str] = []
    if summary.get("video_codec") != "h264":
        issues.append(f"video_codec:{summary.get('video_codec') or '<missing>'}")
    if summary.get("video_pix_fmt") != "yuv420p":
        issues.append(f"video_pix_fmt:{summary.get('video_pix_fmt') or '<missing>'}")
    if int(summary.get("video_width") or 0) != target_width:
        issues.append(f"video_width:{summary.get('video_width')}")
    if int(summary.get("video_height") or 0) != target_height:
        issues.append(f"video_height:{summary.get('video_height')}")
    avg_fps = _rate_to_float(summary.get("video_avg_frame_rate"))
    real_fps = _rate_to_float(summary.get("video_r_frame_rate"))
    avg_matches = avg_fps is not None and abs(avg_fps - ENCODE_TARGET_FPS) <= 0.05
    real_matches = real_fps is not None and abs(real_fps - ENCODE_TARGET_FPS) <= 0.05
    if not avg_matches and not real_matches:
        issues.append(
            "video_frame_rate:"
            f"avg={summary.get('video_avg_frame_rate') or '<missing>'},"
            f"real={summary.get('video_r_frame_rate') or '<missing>'}"
        )
    if int(summary.get("rotate") or 0) != 0:
        issues.append(f"rotate:{summary.get('rotate')}")
    if summary.get("audio_codec") != "aac":
        issues.append(f"audio_codec:{summary.get('audio_codec') or '<missing>'}")
    if str(summary.get("audio_sample_rate") or "") != "48000":
        issues.append(f"audio_sample_rate:{summary.get('audio_sample_rate') or '<missing>'}")
    if str(summary.get("audio_channels") or "") != "2":
        issues.append(f"audio_channels:{summary.get('audio_channels') or '<missing>'}")
    video_start = _float_or_none(summary.get("video_start_time"))
    if video_start is not None and abs(video_start) > 0.25:
        issues.append(f"video_start_time:{summary.get('video_start_time')}")
    audio_start = _float_or_none(summary.get("audio_start_time"))
    if audio_start is not None and abs(audio_start) > 0.25:
        issues.append(f"audio_start_time:{summary.get('audio_start_time')}")
    av_duration_delta = _float_or_none(summary.get("av_duration_delta_seconds"))
    if av_duration_delta is not None and av_duration_delta > ENCODE_AV_DRIFT_MAX_SECONDS:
        issues.append(f"av_duration_delta_seconds:{summary.get('av_duration_delta_seconds')}")
    duration = _float_or_none(summary.get("duration_seconds"))
    if duration is None or duration <= 0:
        issues.append(f"duration_seconds:{summary.get('duration_seconds')}")
    return issues


def _validate_output_probe(summary: dict[str, Any], *, mode_used: Literal["copy", "encode"], target_width: int | None = None, target_height: int | None = None) -> list[str]:
    """Validate final output before registration; encode mode is held to canonical expectations."""
    issues: list[str] = []
    if not summary.get("video_codec"):
        issues.append("missing_video_codec")
    duration = _float_or_none(summary.get("duration_seconds"))
    if duration is None or duration <= 0:
        issues.append(f"duration_seconds:{summary.get('duration_seconds')}")
    if mode_used == "encode":
        if target_width is None or target_height is None:
            issues.append("missing_encode_target_dimensions")
        else:
            issues.extend(_validate_encode_probe(summary, target_width=target_width, target_height=target_height))
    return sorted(set(issues))


def _inputs_compatible_for_copy(input_paths: list[Path]) -> bool:
    """Check copy compatibility by re-probing each path.

    Superseded by _assets_compatible_for_copy() which uses pre-classified
    InputAsset signatures and avoids a second ffprobe pass.
    Kept for any direct callsite that has only paths, not assets.
    """
    signatures = [_probe_signature(p) for p in input_paths]
    if not signatures or any(not s for s in signatures):
        return False
    return all(s == signatures[0] for s in signatures[1:])


def _guess_kind_from_suffix(path: Path) -> Literal["video", "image", "audio", "unknown"]:
    suffix = path.suffix.lower()
    if suffix in {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}:
        return "video"
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}:
        return "image"
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}:
        return "audio"
    return "unknown"


def _probe_media_kind(path: Path) -> Literal["video", "image", "audio", "unknown"]:
    """Prefer ffprobe stream inspection; fall back to extension-based guessing.

    Note: call _classify_inputs() when you need both kind and signature to
    avoid a second ffprobe pass on the same file.
    """
    sig = _probe_signature(path)
    if sig.get("video_codec"):
        return "video"
    if sig.get("audio_codec"):
        return "audio"
    return _guess_kind_from_suffix(path)


def _classify_inputs(input_paths: Sequence[Path]) -> list[InputAsset]:
    """Probe each path once, capturing both kind and copy-compatibility signature."""
    assets: list[InputAsset] = []
    for path in input_paths:
        sig = _probe_signature(path)
        if sig.get("video_codec"):
            kind: Literal["video", "image", "audio", "unknown"] = "video"
        elif sig.get("audio_codec"):
            kind = "audio"
        else:
            kind = _guess_kind_from_suffix(path)
        assets.append(InputAsset(path=path, kind=kind, signature=sig))
    return assets


def _analyze_copy_compatibility(assets: Sequence[InputAsset]) -> tuple[bool, list[str]]:
    """Return whether concat-copy is safe enough, plus conservative rejection reasons."""
    reasons: list[str] = []
    if not assets:
        return False, ["no_assets"]
    if len(assets) < 2:
        reasons.append("copy_requires_multiple_assets")

    suffixes = {asset.path.suffix.lower() for asset in assets}
    if len(suffixes) != 1:
        reasons.append("mixed_container_suffixes")

    non_video_kinds = sorted({asset.kind for asset in assets if asset.kind != "video"})
    if non_video_kinds:
        reasons.append(f"non_video_inputs:{','.join(non_video_kinds)}")

    sigs = [asset.signature for asset in assets]
    if any(not sig for sig in sigs):
        reasons.append("missing_probe_signature")
    else:
        baseline = sigs[0]
        mismatch_fields = sorted({
            key
            for signature in sigs[1:]
            for key in COPY_COMPATIBILITY_FIELDS
            for value in [baseline.get(key, "")]
            if signature.get(key, "") != value
        })
        if mismatch_fields:
            reasons.append(f"signature_mismatch:{','.join(mismatch_fields)}")

    return (not reasons), reasons


def _assets_compatible_for_copy(assets: Sequence[InputAsset]) -> bool:
    """Check stream-copy compatibility using pre-probed signatures — no extra ffprobe calls."""
    compatible, _ = _analyze_copy_compatibility(assets)
    return compatible


def _validate_supported_inputs(input_assets: Sequence[InputAsset]) -> None:
    """Reject media kinds that are not currently implemented in the compose preprocessor."""
    unsupported = [a for a in input_assets if a.kind not in SUPPORTED_DIRECT_COMPOSE_KINDS]
    if not unsupported:
        return
    preview = [{"path": a.path.name, "kind": a.kind} for a in unsupported[:10]]
    raise HTTPException(
        status_code=400,
        detail=(
            "Compose currently supports direct concatenation only for: "
            f"{sorted(SUPPORTED_DIRECT_COMPOSE_KINDS)}. "
            f"Unsupported inputs (up to 10 shown): {preview}"
        ),
    )


def _header_str(request: Request, key: str) -> str | None:
    val = request.headers.get(key)
    return val.strip() or None if val else None


def _header_int(request: Request, key: str) -> int | None:
    raw = _header_str(request, key)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _build_absolute_media_url(
    base_url: str,
    project_name: str,
    relative_path: str,
    *,
    source: str | None,
    download: bool,
) -> str:
    encoded_path = quote(relative_path.lstrip("/"), safe="/")
    encoded_project = quote(project_name, safe="")
    suffix = f"?source={quote(source)}" if source is not None else ""
    path = (
        f"/media/{encoded_project}/download/{encoded_path}"
        if download
        else f"/media/{encoded_project}/{encoded_path}"
    )
    return f"{base_url.rstrip('/')}{path}{suffix}"


def _display_geometry_from_probe(probe: dict[str, int]) -> tuple[int, int]:
    width = int(probe.get("width") or 0)
    height = int(probe.get("height") or 0)
    rotate = int(probe.get("rotate") or 0)

    if rotate in {90, 270}:
        return height, width
    return width, height


def _probe_video_geometry(path: Path) -> dict[str, int]:
    """
    Return decoded geometry hints for a video file.

    width/height are the stored stream dimensions.
    rotate is normalized to one of: 0, 90, 180, 270 when detectable.
    """
    command = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:stream_tags=rotate:side_data",
        "-of", "json",
        str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return {"width": 0, "height": 0, "rotate": 0}

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"width": 0, "height": 0, "rotate": 0}

    streams = payload.get("streams", [])
    if not streams:
        return {"width": 0, "height": 0, "rotate": 0}

    stream = streams[0]
    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)

    rotate = 0

    tag_rotate = stream.get("tags", {}).get("rotate")
    if isinstance(tag_rotate, str):
        try:
            rotate = int(tag_rotate) % 360
        except ValueError:
            rotate = 0

    side_data_list = stream.get("side_data_list", [])
    for side in side_data_list:
        if not isinstance(side, dict):
            continue

        rotation = side.get("rotation")
        if isinstance(rotation, (int, float)):
            rotate = int(rotation) % 360

        display_matrix = side.get("displaymatrix")
        if isinstance(display_matrix, str):
            dm = display_matrix.lower()
            if "rotation of -90.00 degrees" in dm:
                rotate = 270
            elif "rotation of 90.00 degrees" in dm:
                rotate = 90
            elif "rotation of 180.00 degrees" in dm or "rotation of -180.00 degrees" in dm:
                rotate = 180

    rotate = rotate % 360
    if rotate not in {0, 90, 180, 270}:
        rotate = 0

    return {
        "width": width,
        "height": height,
        "rotate": rotate,
    }


def _probe_image_geometry(path: Path) -> dict[str, int]:
    """Return width/height for an image file using ffprobe stream metadata."""
    command = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json",
        str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return {"width": 0, "height": 0, "rotate": 0}

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"width": 0, "height": 0, "rotate": 0}

    streams = payload.get("streams", [])
    if not streams:
        return {"width": 0, "height": 0, "rotate": 0}

    stream = streams[0]
    return {
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "rotate": 0,
    }


def _display_geometry_for_asset(asset: InputAsset) -> tuple[int, int]:
    """Return display width/height for either video or image assets."""
    if asset.kind == "video":
        return _display_geometry_from_probe(_probe_video_geometry(asset.path))
    if asset.kind == "image":
        return _display_geometry_from_probe(_probe_image_geometry(asset.path))
    return 0, 0


def _normalize_video_segment(
    input_path: Path,
    output_path: Path,
    *,
    has_audio: bool,
    target_width: int,
    target_height: int,
) -> Path:
    """
    Re-encode one video clip into a normalized intermediate MP4.

    Policy:
    - detect source rotation ourselves
    - disable ffmpeg autorotate
    - apply explicit rotation transform when needed
    - scale to fit inside target canvas
    - pad to exact target canvas
    - strip metadata so orientation does not leak forward
    """
    probe = _probe_video_geometry(input_path)
    rotate = int(probe.get("rotate") or 0)

    vf_parts: list[str] = []

    if rotate == 90:
        vf_parts.append("transpose=2")
    elif rotate == 270:
        vf_parts.append("transpose=1")
    elif rotate == 180:
        vf_parts.append("hflip,vflip")

    vf_parts.append(
        f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease"
    )
    vf_parts.append(
        f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black"
    )
    vf_parts.append(f"fps={ENCODE_TARGET_FPS_ARG}:round=near")
    vf_parts.append("setsar=1")
    vf_parts.append(f"settb={ENCODE_VIDEO_TIME_BASE}")
    vf_parts.append(f"setpts=N/({ENCODE_TARGET_FPS_ARG}*TB)")

    vf = ",".join(vf_parts)

    command: list[str] = [
        "ffmpeg",
        "-y",
        "-fflags", "+genpts",
        "-avoid_negative_ts", "make_zero",
        "-noautorotate",
        "-i", str(input_path),
        "-map_metadata", "-1",
        "-map", "0:v:0",
    ]
    if has_audio:
        command.extend([
            "-map", "0:a:0",
        ])
    else:
        command.extend([
            "-f", "lavfi",
            "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map", "1:a:0",
            "-shortest",
        ])
    command.extend([
        "-af", f"aresample=48000:async=1:first_pts=0,asettb={ENCODE_AUDIO_TIME_BASE},asetpts=N/SR/TB",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-vf", vf,
        "-r", ENCODE_TARGET_FPS_ARG,
        "-fps_mode", "cfr",
        "-video_track_timescale", "30000",
        "-c:a", "aac",
        "-ar", "48000",
        "-ac", "2",
        "-movflags", "+faststart",
        "-metadata:s:v:0", "rotate=0",
        str(output_path),
    ])

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        stderr_tail = _error_tail(result.stderr)
        stdout_tail = _error_tail(result.stdout)
        raise HTTPException(
            status_code=500,
            detail=(
                "video normalization failed; "
                f"stderr_tail={stderr_tail or '<empty>'}; "
                f"stdout_tail={stdout_tail or '<empty>'}"
            ),
        )

    return output_path


def _normalize_image_segment(
    input_path: Path,
    output_path: Path,
    *,
    target_width: int,
    target_height: int,
    duration_seconds: float,
) -> Path:
    """Convert one image into a fixed-duration MP4 segment."""
    vf = (
        f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,"
        f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
    )
    command = [
        "ffmpeg",
        "-y",
        "-fflags", "+genpts",
        "-avoid_negative_ts", "make_zero",
        "-loop", "1",
        "-i", str(input_path),
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-t", str(duration_seconds),
        "-shortest",
        "-vf", vf,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", ENCODE_TARGET_FPS_ARG,
        "-fps_mode", "cfr",
        "-video_track_timescale", "30000",
        "-c:a", "aac",
        "-ar", "48000",
        "-ac", "2",
        "-movflags", "+faststart",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        stderr_tail = _error_tail(result.stderr)
        stdout_tail = _error_tail(result.stdout)
        raise HTTPException(
            status_code=500,
            detail=(
                "image normalization failed; "
                f"stderr_tail={stderr_tail or '<empty>'}; "
                f"stdout_tail={stdout_tail or '<empty>'}"
            ),
        )
    return output_path


# =============================================================================
# 5. PROJECT / ENVIRONMENT HELPERS
# =============================================================================

def _resolve_project_context(project_name: str, source_name: str | None) -> tuple[ProjectContext, Any]:
    """
    Validate project name, resolve source, ensure project layout.
    Returns (ProjectContext, active_source_object).
    """
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    try:
        active_source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    proj_root = project_path(active_source.root, name)
    ensure_subdirs(proj_root, ["ingest/originals", "ingest/_metadata", "ingest/thumbnails", "_manifest", "exports"])
    if not (proj_root / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")

    ctx = ProjectContext(
        project_name=name,
        source_name=active_source.name,
        project_root=proj_root,
        source_root=active_source.root,
    )
    return ctx, active_source


def _validate_compose_environment() -> None:
    """
    Reject temp roots that overlap any enabled source root.
    Compose temp files must never live inside discoverable project/source roots.
    """
    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    resolved_temp = Path(settings.temp_root).expanduser().resolve()

    try:
        enabled = registry.list_enabled()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Cannot enumerate source roots: {exc}") from exc

    if not enabled:
        try:
            enabled = [registry.require(None)]
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Cannot determine default source root: {exc}") from exc

    for src in enabled:
        src_root = src.root.expanduser().resolve()
        if resolved_temp == src_root or src_root in resolved_temp.parents:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"MEDIA_SYNC_TEMP_ROOT ({resolved_temp}) must resolve outside enabled SourceRegistry roots "
                    f"(conflicts with '{src.name}' at {src_root})"
                ),
            )


def _resolve_path_within_project(ctx: ProjectContext, relative: str, *, require_exists: bool) -> Path:
    candidate = (ctx.project_root / relative.lstrip("/")).resolve()
    if candidate != ctx.project_root and ctx.project_root not in candidate.parents:
        raise HTTPException(status_code=400, detail="Path escapes project root")
    if require_exists and not candidate.exists():
        raise HTTPException(status_code=404, detail=f"Missing path: {relative}")
    return candidate


def _indexed_path_set(ctx: ProjectContext) -> set[str]:
    index = load_index(ctx.project_root)
    files = index.get("files", []) if isinstance(index, dict) else []
    result: set[str] = set()
    for entry in files:
        rel = entry.get("relative_path") if isinstance(entry, dict) else None
        if isinstance(rel, str):
            result.add(rel.replace("\\", "/").lstrip("/"))
    return result


def _compose_job_root() -> Path:
    root = Path(get_settings().temp_root) / "compose_jobs"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _compose_job_path(job_id: str) -> Path:
    return _compose_job_root() / f"{COMPOSE_JOB_PREFIX}{job_id}.json"


def _serialize_compose_job(job: ComposeJob, *, base_url: str | None = None) -> dict[str, Any]:
    payload = {
        "status": job.status,
        "job_id": job.id,
        "project": job.project_name,
        "source": job.source_name,
        "flow": job.flow,
        "output_name": job.output_name,
        "target_dir": job.target_dir,
        "mode_requested": job.mode_requested,
        "input_count": job.input_count,
        "input_preview": list(job.input_preview),
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "refresh_scope": job.refresh_scope,
    }
    if base_url:
        payload["job_url"] = (
            f"{base_url.rstrip('/')}/api/projects/{quote(job.project_name)}/compose/jobs/{quote(job.id)}"
            f"?source={quote(job.source_name)}"
        )
    if job.error is not None:
        payload["error"] = job.error
        payload["error_status_code"] = job.error_status_code
    if job.result is not None:
        payload["result"] = job.result
    if job.status in {"queued", "running"}:
        payload["instructions"] = "Poll job_url for status; completed jobs register outputs into the affected project path scope."
    elif job.status == "completed":
        payload["instructions"] = "Refresh only refresh_scope paths; result contains the validated registered output."
    elif job.status == "failed":
        payload["instructions"] = "Inspect error and correlated compose lifecycle logs for this job_id; failed jobs do not register outputs."
    return payload


def _validate_compose_submission(ctx: ProjectContext, spec: ComposeSpec) -> None:
    """Reject obvious request-shape/path errors before background job submission."""

    _safe_filename_or_400(spec.output_name, default="compiled.mp4")
    _resolve_path_within_project(ctx, spec.target_dir.strip() or "exports", require_exists=False)


class ComposeJobRunner:
    """Simple in-process background runner with persisted compose job snapshots."""

    def __init__(self) -> None:
        self._executor: ThreadPoolExecutor | None = ThreadPoolExecutor(
            max_workers=JOB_MAX_WORKERS,
            thread_name_prefix="compose-job",
        )
        self._lock = threading.Lock()
        self._jobs: dict[str, ComposeJob] = {}
        self._futures: dict[str, Future[None]] = {}
        self._hydrated_root: str | None = None

    def _ensure_executor(self) -> ThreadPoolExecutor:
        with self._lock:
            if self._executor is None:
                self._executor = ThreadPoolExecutor(max_workers=JOB_MAX_WORKERS, thread_name_prefix="compose-job")
            return self._executor

    def _hydrate_if_needed(self) -> None:
        root = str(_compose_job_root().resolve())
        with self._lock:
            if self._hydrated_root == root:
                return
            self._jobs.clear()
            self._futures.clear()
            now = time.time()
            for path in _compose_job_root().glob(f"{COMPOSE_JOB_PREFIX}*.json"):
                try:
                    payload = json.loads(path.read_text(encoding="utf-8"))
                    job = ComposeJob(**payload)
                except Exception:
                    path.unlink(missing_ok=True)
                    continue
                if job.status in {"queued", "running"}:
                    job.status = "failed"
                    job.finished_at = _now_iso()
                    job.error_status_code = 503
                    job.error = "Compose job was interrupted before completion (service restarted or worker stopped)."
                    self._persist_locked(job)
                created_dt = datetime.fromisoformat(job.created_at)
                if (now - created_dt.timestamp()) > JOB_MAX_AGE_SECONDS:
                    path.unlink(missing_ok=True)
                    continue
                self._jobs[job.id] = job
            self._hydrated_root = root

    def _persist_locked(self, job: ComposeJob) -> None:
        target = _compose_job_path(job.id)
        temp = target.with_suffix(".tmp")
        temp.write_text(json.dumps(job.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(target)

    def submit(
        self,
        job: ComposeJob,
        task: Callable[[], dict[str, Any]],
    ) -> ComposeJob:
        self._hydrate_if_needed()
        with self._lock:
            self._jobs[job.id] = job
            self._persist_locked(job)
        future = self._ensure_executor().submit(self._run, job.id, task)
        with self._lock:
            self._futures[job.id] = future
        return job

    def _run(self, job_id: str, task: Callable[[], dict[str, Any]]) -> None:
        self._hydrate_if_needed()
        with self._lock:
            job = self._jobs[job_id]
            job.status = "running"
            job.started_at = _now_iso()
            self._persist_locked(job)

        try:
            result = task()
        except HTTPException as exc:
            with self._lock:
                job = self._jobs[job_id]
                job.status = "failed"
                job.finished_at = _now_iso()
                job.error_status_code = exc.status_code
                job.error = str(exc.detail)
                self._persist_locked(job)
            logger.warning(
                "compose_job_failed job_id=%s project=%s source=%s status=%s detail=%s",
                job_id,
                job.project_name,
                job.source_name,
                exc.status_code,
                exc.detail,
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            with self._lock:
                job = self._jobs[job_id]
                job.status = "failed"
                job.finished_at = _now_iso()
                job.error_status_code = 500
                job.error = f"Unexpected compose job failure: {exc}"
                self._persist_locked(job)
            logger.exception("compose_job_unexpected_failure job_id=%s", job_id)
        else:
            with self._lock:
                job = self._jobs[job_id]
                job.status = "completed"
                job.finished_at = _now_iso()
                job.result = result
                self._persist_locked(job)
            logger.info(
                "compose_job_completed job_id=%s project=%s source=%s path=%s",
                job_id,
                job.project_name,
                job.source_name,
                (result or {}).get("path"),
            )
        finally:
            with self._lock:
                self._futures.pop(job_id, None)

    def get(self, job_id: str) -> ComposeJob | None:
        self._hydrate_if_needed()
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                return ComposeJob(**job.to_dict())
        path = _compose_job_path(job_id)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            job = ComposeJob(**payload)
        except Exception:
            return None
        with self._lock:
            self._jobs[job.id] = job
        return ComposeJob(**job.to_dict())

    def shutdown(self) -> None:
        with self._lock:
            executor = self._executor
            self._executor = None
        if executor is not None:
            executor.shutdown(wait=False, cancel_futures=False)


# =============================================================================
# 6. COMPOSE SESSION
# =============================================================================

async def _write_upload(upload: UploadFile, target: Path, max_bytes: int) -> None:
    """Shared upload writer used by both batch staging and incremental session staging."""
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

@dataclass
class ComposeSession:
    """
    Manages incremental (one-clip-per-POST) upload state.
    Replaces all _session_* free functions + route-local session logic.
    """

    session_dir: Path
    run_id: str
    project_name: str
    source_name: str
    count: int
    received: list[int] = field(default_factory=list)
    closed: bool = False
    closed_at: str | None = None
    created_at: str = field(default_factory=_now_iso)
    created_ts: float = field(default_factory=lambda: datetime.now(timezone.utc).timestamp())

    # ------------------------------------------------------------------
    # State queries
    # ------------------------------------------------------------------

    def is_complete(self) -> bool:
        return len(self.received) >= self.count and self.missing_indices() == []

    def missing_indices(self) -> list[int]:
        received_set = set(self.received)
        return [i for i in range(self.count) if i not in received_set]

    def ordered_inputs(self) -> list[Path]:
        inputs: list[Path] = []
        for i in range(self.count):
            match = sorted(self.session_dir.glob(f"{i:04d}_*"))
            if not match:
                raise HTTPException(status_code=500, detail=f"Session file missing on disk for index {i}")
            inputs.append(match[0])
        return inputs

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _meta_path(self) -> Path:
        return self.session_dir / "meta.json"

    def save(self) -> None:
        meta = {
            "project": self.project_name,
            "source": self.source_name,
            "run_id": self.run_id,
            "created_at": self.created_at,
            "created_ts": self.created_ts,
            "count": self.count,
            "received": self.received,
            "closed": self.closed,
            "closed_at": self.closed_at,
        }
        tmp = self.session_dir / "meta.json.tmp"
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self._meta_path())

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def stage_clip(self, upload: UploadFile, idx0: int, max_bytes: int) -> Path:
        safe_name = safe_filename(upload.filename or f"clip-{idx0}.mp4")
        target = self.session_dir / f"{idx0:04d}_{safe_name}"
        # Last-write-wins for duplicate index posts (iOS Shortcuts retry-safe).
        # The file is overwritten and received list remains deduplicated.
        await _write_upload(upload, target, max_bytes)
        if idx0 not in self.received:
            self.received.append(idx0)
            self.received.sort()
        self.save()
        return target

    def close(self) -> None:
        self.closed = True
        self.closed_at = _now_iso()
        self.save()

    def cleanup(self) -> None:
        shutil.rmtree(self.session_dir, ignore_errors=True)

    # ------------------------------------------------------------------
    # Class-level factory / loader
    # ------------------------------------------------------------------

    @classmethod
    def _session_key(cls, project_name: str, run_id: str) -> str:
        h = hashlib.sha1(f"{project_name}::{run_id}".encode()).hexdigest()[:16]
        return f"{COMPOSE_SESSION_PREFIX}{project_name}_{h}"

    @classmethod
    def _session_dir_path(cls, settings: Any, project_name: str, run_id: str) -> Path:
        return Path(settings.temp_root) / cls._session_key(project_name, run_id)

    @classmethod
    def load(cls, settings: Any, project_name: str, run_id: str) -> "ComposeSession | None":
        session_dir = cls._session_dir_path(settings, project_name, run_id)
        meta_path = session_dir / "meta.json"
        if not meta_path.exists():
            return None

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            return None

        # Reject corrupt sessions rather than loading a broken zero-count object.
        count_raw = meta.get("count")
        if not isinstance(count_raw, (int, float)) or int(count_raw) <= 0:
            return None
        count = int(count_raw)

        received_raw = meta.get("received", [])
        received: list[int] = sorted({
            int(x) for x in received_raw
            if isinstance(x, int) or (isinstance(x, str) and str(x).isdigit())
        })

        # Reject impossible sessions — indices outside [0, count) indicate corruption.
        if any(idx < 0 or idx >= count for idx in received):
            return None

        return cls(
            session_dir=session_dir,
            run_id=run_id,
            project_name=meta.get("project", project_name),
            source_name=meta.get("source", ""),
            count=count,
            received=received,
            closed=bool(meta.get("closed", False)),
            closed_at=meta.get("closed_at") or None,
            created_at=meta.get("created_at") or _now_iso(),
            created_ts=float(meta["created_ts"]) if isinstance(meta.get("created_ts"), (int, float)) else datetime.now(timezone.utc).timestamp(),
        )

    @classmethod
    def create(cls, settings: Any, ctx: ProjectContext, run_id: str, count: int) -> "ComposeSession":
        session_dir = cls._session_dir_path(settings, ctx.project_name, run_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        session = cls(
            session_dir=session_dir,
            run_id=run_id,
            project_name=ctx.project_name,
            source_name=ctx.source_name,
            count=count,
        )
        session.save()
        return session

    @classmethod
    def prune_stale(cls, temp_root: Path) -> None:
        now = datetime.now(timezone.utc).timestamp()
        try:
            for child in temp_root.iterdir():
                if not child.is_dir() or not child.name.startswith(COMPOSE_SESSION_PREFIX):
                    continue

                meta_path = child / "meta.json"
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    shutil.rmtree(child, ignore_errors=True)
                    continue

                created = meta.get("created_ts")
                if not isinstance(created, (int, float)):
                    shutil.rmtree(child, ignore_errors=True)
                    continue

                if (now - float(created)) > SESSION_MAX_AGE_SECONDS:
                    shutil.rmtree(child, ignore_errors=True)
        except Exception:
            return


# =============================================================================
# 7. COMPOSE PLANNER
# =============================================================================

class ComposePlanner:
    """
    Translates a ComposeSpec into a ComposePlan.
    Owns: output naming, path resolution, index validation, strategy selection.
    Future: segment selection, album clip rules.
    """

    def build_existing_plan(self, ctx: ProjectContext, spec: ComposeSpec) -> ComposePlan:
        indexed = _indexed_path_set(ctx)
        normalized = [v.replace("\\", "/").lstrip("/") for v in spec.inputs]
        missing = [v for v in normalized if v not in indexed]
        if missing:
            preview_limit = 10
            preview = missing[:preview_limit]
            remaining = len(missing) - len(preview)
            suffix = f" (+{remaining} more)" if remaining > 0 else ""
            raise HTTPException(
                status_code=400,
                detail=(
                    "Compose inputs must be indexed project assets. "
                    f"Missing index entries (showing up to {preview_limit}): {preview}{suffix}"
                ),
            )

        input_paths = [_resolve_path_within_project(ctx, rel, require_exists=True) for rel in normalized]
        input_assets = _classify_inputs(input_paths)
        _validate_supported_inputs(input_assets)

        output_path = self._resolve_output_path(ctx, spec)
        # Strategy is selected from classified assets using cached signatures — no re-probe.
        # prepared_segments is intentionally left empty here; ComposePreprocessor owns it.
        strategy, strategy_reasons = self._select_strategy(spec.mode, input_assets)
        return ComposePlan(
            input_paths=input_paths,
            output_path=output_path,
            strategy=strategy,
            requested_mode=spec.mode,
            strategy_reasons=strategy_reasons,
            input_assets=input_assets,
        )

    def build_staged_plan(self, ctx: ProjectContext, staged_inputs: list[Path], spec: ComposeSpec) -> ComposePlan:
        if not staged_inputs:
            raise HTTPException(status_code=400, detail="No staged inputs available for compose")

        input_assets = _classify_inputs(staged_inputs)
        _validate_supported_inputs(input_assets)

        output_path = self._resolve_output_path(ctx, spec)
        # Strategy from classified assets using cached signatures — no re-probe.
        # prepared_segments left empty; ComposePreprocessor owns it.
        strategy, strategy_reasons = self._select_strategy(spec.mode, input_assets)
        return ComposePlan(
            input_paths=staged_inputs,
            output_path=output_path,
            strategy=strategy,
            requested_mode=spec.mode,
            strategy_reasons=strategy_reasons,
            input_assets=input_assets,
        )

    def _select_strategy(
        self,
        mode: Literal["auto", "copy", "encode"],
        assets: list[InputAsset],
    ) -> tuple[Literal["copy", "encode"], list[str]]:
        if mode == "encode":
            reasons = ["requested_encode"]
            _log_compose("info", "compose_strategy_selected", requested_mode=mode, selected_strategy="encode", asset_count=len(assets), reasons=reasons)
            return "encode", reasons
        compatible, reasons = _analyze_copy_compatibility(assets)
        selected: Literal["copy", "encode"] = "copy" if compatible else "encode"
        resolved_reasons = reasons or ["copy_safe"]
        _log_compose("info", "compose_strategy_selected", requested_mode=mode, selected_strategy=selected, asset_count=len(assets), reasons=resolved_reasons)
        if mode == "copy" and not compatible:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Inputs are incompatible for concat copy mode: "
                    f"{', '.join(reasons) or 'unknown_reason'}"
                ),
            )
        return selected, resolved_reasons

    def _resolve_output_path(self, ctx: ProjectContext, spec: ComposeSpec) -> Path:
        target_dir = _resolve_path_within_project(ctx, spec.target_dir.strip() or "exports", require_exists=False)
        target_dir.mkdir(parents=True, exist_ok=True)
        final_name = self._resolve_final_name(ctx.project_root, spec.output_name)
        output_path = _resolve_path_within_project(
            ctx,
            f"{target_dir.relative_to(ctx.project_root).as_posix()}/{final_name}",
            require_exists=False,
        )
        if output_path.exists():
            raise HTTPException(
                status_code=409,
                detail="Output already exists (unexpected with incremental naming). Try again.",
            )
        return output_path

    def _resolve_final_name(self, project_root: Path, requested: str | None) -> str:
        """
        Return a server-managed unique mp4 filename.

        Rules:
        - "", "auto", and "compiled.mp4" all normalize to base "compiled.mp4"
        - any other value is sanitized and used only as a base label
        - final output is always suffixed: <stem>-NNNN.mp4
        - output_name is never used as a final filename directly
        """
        normalized = (requested or "").strip().lower()
        base = "compiled.mp4" if normalized in {"", "auto", "compiled.mp4"} else (
            _safe_filename_or_400(requested, default="compiled.mp4")
        )
        if not base.lower().endswith(".mp4"):
            base = f"{base}.mp4"
        seq = self._next_sequence(project_root)
        stem = Path(base).stem
        return f"{stem}-{seq:04d}.mp4"

    @staticmethod
    def _next_sequence(project_root: Path) -> int:
        # Sequence numbers are monotonic but not gapless by design.
        # Failed compose attempts still advance the counter.
        # This is intentional: log/filename clarity over dense numbering.
        index = load_index(project_root)
        if not isinstance(index, dict):
            index = {}
        counts = index.setdefault("counts", {})
        current = counts.get("compose_compiled_seq")
        current = (int(current) if isinstance(current, int) else 0) + 1
        counts["compose_compiled_seq"] = current
        index["counts"] = counts
        save_index(project_root, index)
        return current


# =============================================================================
# 8. COMPOSE EXECUTOR
# =============================================================================

class ComposeExecutor:
    """
    Accepts a ComposePlan and invokes ffmpeg.
    Owns: concat list file, ffmpeg subprocess, error translation.
    """

    def execute(self, plan: ComposePlan, *, job_id: str | None = None) -> ComposeResult:
        if plan.strategy == "copy":
            return self._run_copy_pipeline(plan, job_id=job_id)
        return self._run_encode_pipeline(plan, job_id=job_id)

    def _concat_list_path(self, plan: ComposePlan) -> Path:
        return plan.output_path.parent / f".{plan.output_path.stem}.concat.txt"

    def _write_concat_list(self, plan: ComposePlan, *, source_paths: Sequence[Path] | None = None) -> Path:
        list_path = self._concat_list_path(plan)
        paths = list(source_paths or [segment.path for segment in plan.prepared_segments])
        if not paths:
            raise HTTPException(
                status_code=500,
                detail="Compose plan is missing prepared_segments. All flows must run through ComposePreprocessor.",
            )
        with list_path.open("w", encoding="utf-8") as handle:
            for path in paths:
                safe = str(path).replace("'", "'\\''")
                handle.write(f"file '{safe}'\n")
        return list_path

    def _run_copy_pipeline(self, plan: ComposePlan, *, job_id: str | None = None) -> ComposeResult:
        list_path = self._write_concat_list(plan)
        try:
            return self._run_copy(plan, list_path, job_id=job_id)
        finally:
            list_path.unlink(missing_ok=True)

    def _run_encode_pipeline(self, plan: ComposePlan, *, job_id: str | None = None) -> ComposeResult:
        return self._run_encode(plan, job_id=job_id)

    def _run_copy(self, plan: ComposePlan, list_path: Path, *, job_id: str | None = None) -> ComposeResult:
        command = [
            "ffmpeg", "-n",
            "-f", "concat", "-safe", "0",
            "-i", str(list_path),
            "-c", "copy",
            str(plan.output_path),
        ]
        _log_compose(
            "info",
            "compose_concat_started",
            job_id=job_id,
            requested_mode=plan.requested_mode,
            selected_strategy=plan.strategy,
            mechanism="concat_demuxer_copy",
            list_path=list_path.name,
            command=_format_command(command),
        )
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            if _ffmpeg_indicates_existing_output(result):
                self._raise_error("ffmpeg copy blocked existing output", result, status_code=409)
            if plan.requested_mode == "copy":
                self._raise_error("ffmpeg copy failed", result)
            _log_compose(
                "warning",
                "compose_copy_fallback",
                job_id=job_id,
                requested_mode=plan.requested_mode,
                output=plan.output_path.name,
                stderr_tail=_error_tail(result.stderr),
            )
            return self._run_encode(plan, job_id=job_id)
        return ComposeResult(output_path=plan.output_path, mode_used="copy", registration_mode="preserve_runs")

    def _run_encode(self, plan: ComposePlan, *, job_id: str | None = None) -> ComposeResult:
        if not plan.prepared_segments:
            raise HTTPException(status_code=500, detail="Encode pipeline requires prepared_segments")

        list_path = self._write_concat_list(plan, source_paths=[segment.path for segment in plan.prepared_segments])
        try:
            command = [
                "ffmpeg", "-n",
                "-fflags", "+genpts",
                "-avoid_negative_ts", "make_zero",
                "-f", "concat", "-safe", "0",
                "-i", str(list_path),
                "-c", "copy",
                "-movflags", "+faststart",
                str(plan.output_path),
            ]
            _log_compose(
                "info",
                "compose_concat_started",
                job_id=job_id,
                requested_mode=plan.requested_mode,
                selected_strategy=plan.strategy,
                mechanism="concat_demuxer_copy_normalized",
                list_path=list_path.name,
                normalized_inputs=[segment.path.name for segment in plan.prepared_segments],
                command=_format_command(command),
            )
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode == 0:
                return ComposeResult(output_path=plan.output_path, mode_used="encode", registration_mode="preserve_runs")
            if _ffmpeg_indicates_existing_output(result):
                self._raise_error("ffmpeg normalized concat blocked existing output", result, status_code=409)
            _log_compose(
                "warning",
                "compose_normalized_concat_fallback",
                job_id=job_id,
                requested_mode=plan.requested_mode,
                output=plan.output_path.name,
                stderr_tail=_error_tail(result.stderr),
            )
        finally:
            list_path.unlink(missing_ok=True)

        return self._run_filter_concat_encode(plan, job_id=job_id)

    def _run_filter_concat_encode(self, plan: ComposePlan, *, job_id: str | None = None) -> ComposeResult:
        if not plan.prepared_segments:
            raise HTTPException(status_code=500, detail="Encode pipeline requires prepared_segments")

        command: list[str] = ["ffmpeg", "-n", "-fflags", "+genpts", "-avoid_negative_ts", "make_zero"]
        filter_parts: list[str] = []
        concat_inputs: list[str] = []
        for segment in plan.prepared_segments:
            command.extend(["-i", str(segment.path)])
            input_index = len(concat_inputs)
            filter_parts.append(
                f"[{input_index}:v:0]settb={ENCODE_VIDEO_TIME_BASE},setpts=N/({ENCODE_TARGET_FPS_ARG}*TB)[v{input_index}]"
            )
            filter_parts.append(
                f"[{input_index}:a:0]aresample=48000:async=1:first_pts=0,asettb={ENCODE_AUDIO_TIME_BASE},asetpts=N/SR/TB[a{input_index}]"
            )
            concat_inputs.append(f"[v{input_index}][a{input_index}]")
        filter_parts.append(
            f"{''.join(concat_inputs)}concat=n={len(plan.prepared_segments)}:v=1:a=1[vcat][acat]"
        )
        filter_parts.append(f"[vcat]fps={ENCODE_TARGET_FPS_ARG}:round=near,settb={ENCODE_VIDEO_TIME_BASE}[outv]")
        filter_parts.append(
            f"[acat]aresample=48000:async=1:first_pts=0,asettb={ENCODE_AUDIO_TIME_BASE},asetpts=N/SR/TB[outa]"
        )
        filter_complex = ";".join(filter_parts)
        command.extend([
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "[outa]",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-r", "30000/1001",
            "-fps_mode", "cfr",
            "-video_track_timescale", "30000",
            "-c:a", "aac",
            "-ar", "48000",
            "-ac", "2",
            "-movflags", "+faststart",
            str(plan.output_path),
        ])
        _log_compose(
            "info",
            "compose_concat_started",
            job_id=job_id,
            requested_mode=plan.requested_mode,
            selected_strategy=plan.strategy,
            mechanism="filter_concat_encode",
            normalized_inputs=[segment.path.name for segment in plan.prepared_segments],
            command=_format_command(command),
        )
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            if _ffmpeg_indicates_existing_output(result):
                self._raise_error("ffmpeg encode blocked existing output", result, status_code=409)
            self._raise_error("ffmpeg encode failed", result)
        return ComposeResult(output_path=plan.output_path, mode_used="encode", registration_mode="preserve_runs")

    @staticmethod
    def _raise_error(prefix: str, result: subprocess.CompletedProcess[str], *, status_code: int = 500) -> None:
        stderr_tail = _error_tail(result.stderr)
        stdout_tail = _error_tail(result.stdout)
        detail = f"{prefix}; stderr_tail={stderr_tail or '<empty>'}; stdout_tail={stdout_tail or '<empty>'}"
        raise HTTPException(status_code=status_code, detail=detail)


# =============================================================================
# 9. COMPOSE REGISTRAR
# =============================================================================

class ComposeRegistrar:
    """
    Hashes output, reconciles storage state, writes index/manifest/metadata, shapes response.

    Registration modes (set on ComposeResult by executor):

      preserve_runs      — Each compose run produces its own artifact entry even if
                           output bytes are identical to a prior run. This is the default
                           for all compose flows. Testing the same clips repeatedly always
                           yields new visible results. Hash is recorded per-path, not
                           globally collapsed.

      collapse_duplicates — If the output hash matches an already-registered path, discard
                           the new file and return the existing artifact. Intended for
                           storage-saving batch jobs, not interactive compose.

      replace_path       — For canonical outputs at a fixed relative path. Retires old
                           index/hash rows for that path before registering the replacement.
                           Not used in current auto-named compose flows.

    Overwrite behavior is an internal artifact-registration policy, not a user-facing option.
    """

    def register(
        self,
        ctx: ProjectContext,
        result: ComposeResult,
        base_url: str,
    ) -> dict[str, Any]:
        output_rel = result.output_path.relative_to(ctx.project_root).as_posix()
        sha256 = compute_sha256_from_path(result.output_path)

        if result.registration_mode == "preserve_runs":
            return self._handle_preserve_run(ctx, output_rel, sha256, result, base_url)

        if result.registration_mode == "collapse_duplicates":
            return self._handle_collapse(ctx, output_rel, sha256, result, base_url)

        if result.registration_mode == "replace_path":
            return self._handle_replace(ctx, output_rel, sha256, result, base_url)

        raise HTTPException(status_code=500, detail=f"Unknown registration_mode: {result.registration_mode!r}")

    # ------------------------------------------------------------------
    # Mode: preserve_runs (default for all compose flows)
    # ------------------------------------------------------------------

    def _handle_preserve_run(
        self,
        ctx: ProjectContext,
        output_rel: str,
        sha256: str,
        result: ComposeResult,
        base_url: str,
    ) -> dict[str, Any]:
        """
        Register this compose run as its own artifact regardless of content hash.
        Same input clips composed again → new entry, new path, new event.
        Hash is recorded against this specific output_rel (not used as a global
        collapse key), so duplicate hashes across runs are permitted.
        """
        project = ctx.project_root
        manifest_db = project / "_manifest/manifest.db"

        record_file_hash(manifest_db, sha256, output_rel)
        size = result.output_path.stat().st_size
        entry = {
            "relative_path": output_rel,
            "sha256": sha256,
            "size": size,
            "uploaded_at": _now_iso(),
        }
        ensure_metadata(project, output_rel, sha256, result.output_path, source=ctx.source_name, method="compose")
        append_file_entry(project, entry)
        append_event(project, "compose_created", {
            "relative_path": output_rel,
            "sha256": sha256,
            "mode": result.mode_used,
            "registration": "preserve_runs",
        })

        return {
            "status": "stored",
            "project": ctx.project_name,
            "source": ctx.source_name,
            "path": output_rel,
            "sha256": sha256,
            "size": size,
            "mode_used": result.mode_used,
            "served": self._served_urls(base_url, ctx.project_name, output_rel, ctx.source_name),
        }

    # ------------------------------------------------------------------
    # Mode: collapse_duplicates
    # ------------------------------------------------------------------

    def _handle_collapse(
        self,
        ctx: ProjectContext,
        output_rel: str,
        sha256: str,
        result: ComposeResult,
        base_url: str,
    ) -> dict[str, Any]:
        """
        If the output hash already maps to a registered path, discard the new
        file and return the existing artifact. Intended for storage-saving jobs.
        """
        project = ctx.project_root
        manifest_db = project / "_manifest/manifest.db"

        existing = lookup_file_hash(manifest_db, sha256)
        if existing and existing != output_rel:
            result.output_path.unlink(missing_ok=True)
            index = load_index(project)
            bump_count(index, "duplicates_skipped", amount=1)
            save_index(project, index)
            append_event(project, "compose_duplicate_skipped", {
                "relative_path": existing,
                "sha256": sha256,
                "registration": "collapse_duplicates",
            })
            return {
                "status": "duplicate",
                "project": ctx.project_name,
                "source": ctx.source_name,
                "path": existing,
                "sha256": sha256,
                "mode_used": result.mode_used,
                "served": self._served_urls(base_url, ctx.project_name, existing, ctx.source_name),
            }

        return self._handle_preserve_run(ctx, output_rel, sha256, result, base_url)

    # ------------------------------------------------------------------
    # Mode: replace_path
    # ------------------------------------------------------------------

    def _handle_replace(
        self,
        ctx: ProjectContext,
        output_rel: str,
        sha256: str,
        result: ComposeResult,
        base_url: str,
    ) -> dict[str, Any]:
        """
        Canonical fixed-path output. Retire stale index/hash rows for this
        relative path before registering the new artifact. No user flag required —
        the pipeline sets this mode for known canonical targets.
        """
        project = ctx.project_root
        manifest_db = project / "_manifest/manifest.db"

        # Retire stale hash mapping for this path before re-registering.
        # This keeps the manifest consistent when the same logical output
        # is rebuilt (e.g. proxy refresh, pipeline re-run).
        old_sha = None
        try:
            index = load_index(project)
            files = index.get("files", []) if isinstance(index, dict) else []
            for entry in files:
                if isinstance(entry, dict) and entry.get("relative_path") == output_rel:
                    old_sha = entry.get("sha256")
                    break
        except Exception:
            pass

        if old_sha and old_sha != sha256:
            try:
                # Remove stale hash row so the new hash registers cleanly.
                existing = lookup_file_hash(manifest_db, old_sha)
                if existing == output_rel:
                    record_file_hash(manifest_db, old_sha, "")  # vacate old mapping
            except Exception:
                pass
            append_event(project, "compose_path_replaced", {
                "relative_path": output_rel,
                "old_sha256": old_sha,
                "new_sha256": sha256,
                "registration": "replace_path",
            })

        return self._handle_preserve_run(ctx, output_rel, sha256, result, base_url)

    @staticmethod
    def _served_urls(base_url: str, project_name: str, relative_path: str, source_name: str) -> dict[str, str]:
        return {
            "stream_url": _build_absolute_media_url(
                base_url, project_name, relative_path, source=source_name, download=False
            ),
            "download_url": _build_absolute_media_url(
                base_url, project_name, relative_path, source=source_name, download=True
            ),
        }


# =============================================================================
# 10. COMPOSE PREPROCESSOR
# =============================================================================

class ComposePreprocessor:
    """
    Sole owner of PreparedSegment production.

    Policy:
    - first visual clip (video/image) decides orientation family
    - portrait jobs normalize to 1080x1920
    - landscape jobs normalize to 1920x1080
    - videos are normalized into upright temp mp4 segments
    - images are converted into fixed-duration temp mp4 segments
    - audio preprocessing is not enabled
    """

    def prepare(self, assets: Sequence[InputAsset], work_dir: Path, *, job_id: str | None = None) -> list[PreparedSegment]:
        prepared: list[PreparedSegment] = []

        normalized_dir = work_dir / "normalized"
        normalized_dir.mkdir(parents=True, exist_ok=True)

        visual_assets = [asset for asset in assets if asset.kind in {"video", "image"}]
        if not visual_assets:
            raise HTTPException(status_code=400, detail="No visual assets available for compose")

        first_visual = visual_assets[0]
        display_width, display_height = _display_geometry_for_asset(first_visual)

        if display_width <= 0 or display_height <= 0:
            raise HTTPException(
                status_code=500,
                detail=f"Could not determine target canvas from first visual input: {first_visual.path.name}",
            )

        if display_height >= display_width:
            target_width, target_height = 1080, 1920
        else:
            target_width, target_height = 1920, 1080

        _log_compose(
            "info",
            "compose_normalize_started",
            job_id=job_id,
            asset_count=len(assets),
            target_width=target_width,
            target_height=target_height,
            first_visual=first_visual.path.name,
        )

        for idx, asset in enumerate(assets):
            if asset.kind == "video":
                out_path = normalized_dir / f"segment_{idx:04d}.mp4"
                _log_compose(
                    "info",
                    "compose_normalize_input",
                    job_id=job_id,
                    index=idx,
                    kind=asset.kind,
                    input_path=asset.path.name,
                    output_path=out_path.name,
                    has_audio=bool(asset.signature.get("audio_codec")),
                )
                normalized_path = _normalize_video_segment(
                    asset.path,
                    out_path,
                    has_audio=bool(asset.signature.get("audio_codec")),
                    target_width=target_width,
                    target_height=target_height,
                )
                prepared.append(
                    PreparedSegment(
                        path=normalized_path,
                        source_kind="video",
                        generated=True,
                    )
                )
                _log_compose(
                    "info",
                    "compose_normalize_completed",
                    job_id=job_id,
                    index=idx,
                    kind=asset.kind,
                    output_path=normalized_path.name,
                )
                normalized_summary = _probe_media_summary(normalized_path)
                _log_compose(
                    "info",
                    "compose_normalized_probe",
                    job_id=job_id,
                    index=idx,
                    kind=asset.kind,
                    summary=normalized_summary,
                )
                issues = _validate_encode_probe(normalized_summary, target_width=target_width, target_height=target_height)
                if issues:
                    _log_compose(
                        "error",
                        "compose_normalized_validation_failed",
                        job_id=job_id,
                        index=idx,
                        output_path=normalized_path.name,
                        issues=issues,
                    )
                    raise HTTPException(
                        status_code=500,
                        detail=f"Normalized segment validation failed for {normalized_path.name}: {issues}",
                    )
                continue

            if asset.kind == "image":
                out_path = normalized_dir / f"segment_{idx:04d}.mp4"
                _log_compose(
                    "info",
                    "compose_normalize_input",
                    job_id=job_id,
                    index=idx,
                    kind=asset.kind,
                    input_path=asset.path.name,
                    output_path=out_path.name,
                    freeze_seconds=IMAGE_FREEZE_SECONDS,
                )
                normalized_path = _normalize_image_segment(
                    asset.path,
                    out_path,
                    target_width=target_width,
                    target_height=target_height,
                    duration_seconds=IMAGE_FREEZE_SECONDS,
                )
                prepared.append(
                    PreparedSegment(
                        path=normalized_path,
                        source_kind="image",
                        generated=True,
                    )
                )
                _log_compose(
                    "info",
                    "compose_normalize_completed",
                    job_id=job_id,
                    index=idx,
                    kind=asset.kind,
                    output_path=normalized_path.name,
                )
                normalized_summary = _probe_media_summary(normalized_path)
                _log_compose(
                    "info",
                    "compose_normalized_probe",
                    job_id=job_id,
                    index=idx,
                    kind=asset.kind,
                    summary=normalized_summary,
                )
                issues = _validate_encode_probe(normalized_summary, target_width=target_width, target_height=target_height)
                if issues:
                    _log_compose(
                        "error",
                        "compose_normalized_validation_failed",
                        job_id=job_id,
                        index=idx,
                        output_path=normalized_path.name,
                        issues=issues,
                    )
                    raise HTTPException(
                        status_code=500,
                        detail=f"Normalized segment validation failed for {normalized_path.name}: {issues}",
                    )
                continue

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported compose asset kind '{asset.kind}' for '{asset.path.name}'. "
                    "Audio preprocessing is not yet enabled."
                ),
            )

        return prepared


# =============================================================================
# 11. COMPOSE SERVICE
# =============================================================================

class ComposeService:
    """
    Orchestration facade. Routes call this. Nothing else does.
    Owns: flow coordination only — no ffmpeg, no index, no sessions directly.
    """

    def __init__(self) -> None:
        self.planner = ComposePlanner()
        self.executor = ComposeExecutor()
        self.registrar = ComposeRegistrar()
        self.preprocessor = ComposePreprocessor()

    def _with_prepared_segments(self, plan: ComposePlan, prepared: list[PreparedSegment]) -> ComposePlan:
        """Rebuild a plan with preprocessor-owned prepared_segments. Single place for this pattern."""
        return ComposePlan(
            input_paths=plan.input_paths,
            output_path=plan.output_path,
            strategy=plan.strategy,
            requested_mode=plan.requested_mode,
            strategy_reasons=plan.strategy_reasons,
            input_assets=plan.input_assets,
            prepared_segments=prepared,
        )

    @staticmethod
    def _build_direct_segments(plan: ComposePlan) -> list[PreparedSegment]:
        return [
            PreparedSegment(path=asset.path, source_kind=asset.kind, generated=False)
            for asset in plan.input_assets
        ]

    def _log_probe_inputs(self, plan: ComposePlan, *, job_id: str | None = None) -> None:
        _log_compose(
            "info",
            "compose_probe_started",
            job_id=job_id,
            requested_mode=plan.requested_mode,
            selected_strategy=plan.strategy,
            input_count=len(plan.input_assets),
            output_path=plan.output_path.name,
        )
        for index, asset in enumerate(plan.input_assets):
            _log_compose(
                "info",
                "compose_probe_input",
                job_id=job_id,
                index=index,
                kind=asset.kind,
                summary=_probe_media_summary(asset.path),
            )

    @staticmethod
    def _encode_target_dimensions(plan: ComposePlan) -> tuple[int | None, int | None]:
        visual_assets = [asset for asset in plan.input_assets if asset.kind in {"video", "image"}]
        if not visual_assets:
            return None, None
        display_width, display_height = _display_geometry_for_asset(visual_assets[0])
        if display_width <= 0 or display_height <= 0:
            return None, None
        if display_height >= display_width:
            return 1080, 1920
        return 1920, 1080

    def _log_output_validation(self, result: ComposeResult, *, job_id: str | None = None) -> dict[str, Any]:
        summary = _probe_media_summary(result.output_path)
        _log_compose(
            "info",
            "compose_output_probe",
            job_id=job_id,
            output_path=result.output_path.name,
            mode_used=result.mode_used,
            summary=summary,
        )
        return summary

    def _run_copy_compose(self, plan: ComposePlan, *, job_id: str | None = None) -> ComposeResult:
        direct_plan = self._with_prepared_segments(plan, self._build_direct_segments(plan))
        return self.executor.execute(direct_plan, job_id=job_id)

    def _run_encode_compose(self, plan: ComposePlan, work_dir: Path, *, job_id: str | None = None) -> ComposeResult:
        prepared = self.preprocessor.prepare(plan.input_assets, work_dir, job_id=job_id)
        encode_plan = self._with_prepared_segments(plan, prepared)
        return self.executor.execute(encode_plan, job_id=job_id)

    def _run_auto_compose(self, plan: ComposePlan, work_dir: Path, *, job_id: str | None = None) -> ComposeResult:
        if plan.strategy == "copy":
            return self._run_copy_compose(plan, job_id=job_id)
        return self._run_encode_compose(plan, work_dir, job_id=job_id)

    def _execute_plan(self, plan: ComposePlan, work_dir: Path, *, job_id: str | None = None) -> ComposeResult:
        self._log_probe_inputs(plan, job_id=job_id)
        _log_compose(
            "info",
            "compose_strategy_confirmed",
            job_id=job_id,
            requested_mode=plan.requested_mode,
            selected_strategy=plan.strategy,
            reasons=plan.strategy_reasons,
        )
        if plan.requested_mode == "copy":
            result = self._run_copy_compose(plan, job_id=job_id)
        elif plan.requested_mode == "encode":
            result = self._run_encode_compose(plan, work_dir, job_id=job_id)
        else:
            result = self._run_auto_compose(plan, work_dir, job_id=job_id)
        output_summary = self._log_output_validation(result, job_id=job_id)
        target_width, target_height = self._encode_target_dimensions(plan)
        issues = _validate_output_probe(
            output_summary,
            mode_used=result.mode_used,
            target_width=target_width,
            target_height=target_height,
        )
        if issues:
            _log_compose(
                "error",
                "compose_output_validation_failed",
                job_id=job_id,
                output_path=result.output_path.name,
                mode_used=result.mode_used,
                issues=issues,
            )
            result.output_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail=f"Compose output validation failed: {issues}")
        return result

    # ------------------------------------------------------------------
    # Flow A0: Compose pre-resolved staged paths (used by bulk asset compose)
    # ------------------------------------------------------------------

    def compose_staged_paths(
        self,
        ctx: ProjectContext,
        spec: ComposeSpec,
        staged_paths: Sequence[Path],
        base_url: str,
        *,
        work_dir: Path,
        job_id: str | None = None,
    ) -> dict[str, Any]:
        if not staged_paths:
            raise HTTPException(status_code=400, detail="No staged inputs available for compose")

        plan = self.planner.build_staged_plan(ctx, list(staged_paths), spec)
        result = self._execute_plan(plan, work_dir, job_id=job_id)
        logger.info(
            "compose_staged_paths_complete project=%s source=%s inputs=%s output=%s mode=%s",
            ctx.project_name,
            ctx.source_name,
            len(plan.input_paths),
            result.output_path.relative_to(ctx.project_root).as_posix(),
            result.mode_used,
        )
        return self.registrar.register(ctx, result, base_url)

    # ------------------------------------------------------------------
    # Flow A: Compose existing indexed clips
    # ------------------------------------------------------------------

    def compose_existing(
        self,
        ctx: ProjectContext,
        spec: ComposeSpec,
        base_url: str,
        *,
        work_dir: Path,
        job_id: str | None = None,
    ) -> dict[str, Any]:
        plan = self.planner.build_existing_plan(ctx, spec)
        result = self._execute_plan(plan, work_dir, job_id=job_id)
        logger.info(
            "compose_existing_complete project=%s source=%s inputs=%s output=%s mode=%s",
            ctx.project_name, ctx.source_name,
            len(plan.input_paths),
            result.output_path.relative_to(ctx.project_root).as_posix(),
            result.mode_used,
        )
        return self.registrar.register(ctx, result, base_url)

    # ------------------------------------------------------------------
    # Flow B: Upload batch (all files in one POST)
    # ------------------------------------------------------------------

    async def compose_upload_batch(
        self,
        ctx: ProjectContext,
        spec: ComposeSpec,
        files: list[UploadFile],
        settings: Any,
    ) -> list[Path]:
        max_bytes = settings.max_upload_mb * 1024 * 1024
        temp_dir = Path(tempfile.mkdtemp(prefix="compose_", dir=settings.temp_root))
        try:
            staged: list[Path] = []
            for index, upload in enumerate(files):
                safe_name = safe_filename(upload.filename or f"clip-{index}.mp4")
                target = temp_dir / f"{index:04d}_{safe_name}"
                await _write_upload(upload, target, max_bytes)
                staged.append(target)
            return staged
        except Exception:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise

    # ------------------------------------------------------------------
    # Flow C: Incremental upload (one clip per POST, X-Compose-* headers)
    # ------------------------------------------------------------------

    async def compose_upload_incremental(
        self,
        ctx: ProjectContext,
        spec: ComposeSpec,
        upload: UploadFile,
        settings: Any,
        run_id: str,
        idx: int,
        total: int,
    ) -> JSONResponse | tuple[ComposeSession, list[Path]]:
        if total <= 0:
            raise HTTPException(status_code=400, detail="Invalid X-Compose-Count (must be > 0)")

        # Normalize index (Shortcuts is 1-based)
        idx0 = (idx - 1) if 1 <= idx <= total else idx
        if idx0 < 0 or idx0 >= total:
            raise HTTPException(status_code=400, detail=f"Invalid X-Compose-Index (idx={idx}, total={total})")

        max_bytes = settings.max_upload_mb * 1024 * 1024

        # Load or create session
        session = ComposeSession.load(settings, ctx.project_name, run_id)
        if session is None:
            session = ComposeSession.create(settings, ctx, run_id, total)
        elif session.closed:
            raise HTTPException(
                status_code=409,
                detail="Compose session already closed (X-Compose-Time reused). Use millisecond precision.",
            )
        elif session.count != total:
            raise HTTPException(
                status_code=409,
                detail=f"Session count mismatch: existing={session.count}, header={total}",
            )

        await session.stage_clip(upload, idx0, max_bytes)

        is_last = (idx0 == total - 1)
        if not is_last:
            return JSONResponse(
                status_code=202,
                content={
                    "status": "staged",
                    "project": ctx.project_name,
                    "source": ctx.source_name,
                    "run_id": run_id,
                    "received": len(session.received),
                    "count": total,
                    "missing_preview": session.missing_indices()[:25],
                    "note": "Send remaining clips; final clip triggers compose immediately.",
                },
            )

        # Last clip: verify all parts present
        missing = session.missing_indices()
        if missing:
            raise HTTPException(status_code=409, detail=f"Last clip received but session missing indices: {missing[:50]}")

        staged_inputs = session.ordered_inputs()
        return session, staged_inputs


# =============================================================================
# 12. COMPOSE JOB SUBMISSION HELPERS
# =============================================================================

# Module-level singleton — ComposeService is stateless, no reason to rebuild per request.
_compose_service = ComposeService()
_compose_job_runner = ComposeJobRunner()


def _build_refresh_scope(ctx: ProjectContext, target_dir: str) -> dict[str, Any]:
    normalized = (target_dir or "exports").replace("\\", "/").strip("/") or "exports"
    return {
        "project": ctx.project_name,
        "source": ctx.source_name,
        "paths": [normalized],
    }


def _submit_compose_job(
    ctx: ProjectContext,
    *,
    flow: Literal["existing", "upload_batch", "upload_incremental", "bulk"],
    output_name: str,
    target_dir: str,
    base_url: str,
    mode_requested: Literal["auto", "copy", "encode"],
    input_count: int,
    input_preview: Sequence[str] | None = None,
    task: Callable[[str], dict[str, Any]],
) -> JSONResponse:
    job = ComposeJob(
        id=str(uuid.uuid4()),
        project_name=ctx.project_name,
        source_name=ctx.source_name,
        flow=flow,
        target_dir=target_dir,
        output_name=output_name,
        mode_requested=mode_requested,
        input_count=input_count,
        input_preview=list(input_preview or [])[:10],
        refresh_scope=_build_refresh_scope(ctx, target_dir),
    )
    _compose_job_runner.submit(job, lambda: task(job.id))
    _log_compose(
        "info",
        "compose_request_received",
        job_id=job.id,
        flow=flow,
        project=ctx.project_name,
        source=ctx.source_name,
        mode_requested=mode_requested,
        input_count=input_count,
        input_preview=list(input_preview or [])[:10],
        output_name=output_name,
        target_dir=target_dir,
    )
    payload = _serialize_compose_job(job, base_url=base_url)
    payload["status"] = "accepted"
    payload["job_status"] = job.status
    return JSONResponse(status_code=202, content=payload)


def shutdown_compose_jobs() -> None:
    """Stop the in-process compose job runner on application shutdown."""

    _compose_job_runner.shutdown()


# =============================================================================
# 13. FASTAPI ROUTES
# =============================================================================


@router.post("/{project_name}/compose")
async def compose_existing(
    project_name: str,
    request: Request,
    payload: ComposeRequest,
    source: str | None = Query(default=None),
):
    """Compose one output from existing indexed project media paths.

    Naming policy: output_name is treated as a base label only.
    Final filename is always server-managed: <stem>-NNNN.mp4.
    Overwrite is intentionally unsupported — outputs are always unique.
    """
    _validate_compose_environment()
    ctx, _ = _resolve_project_context(project_name, source)

    spec = ComposeSpec(
        inputs=payload.inputs,
        output_name=payload.output_name,
        target_dir=payload.target_dir,
        mode=payload.mode,
    )
    _validate_compose_submission(ctx, spec)
    base_url = str(request.base_url)

    def _task(job_id: str) -> dict[str, Any]:
        settings = get_settings()
        work_dir = Path(tempfile.mkdtemp(prefix="compose_existing_", dir=settings.temp_root))
        try:
            return _compose_service.compose_existing(ctx, spec, base_url, work_dir=work_dir, job_id=job_id)
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    return _submit_compose_job(
        ctx,
        flow="existing",
        output_name=spec.output_name,
        target_dir=spec.target_dir,
        base_url=base_url,
        mode_requested=spec.mode,
        input_count=len(spec.inputs),
        input_preview=spec.inputs,
        task=_task,
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
    """Upload clips and compose into one artifact.

    Naming policy: output_name is treated as a base label only.
    Final filename is always server-managed: <stem>-NNNN.mp4.
    Overwrite is intentionally unsupported — outputs are always unique.

    TWO flows:
      Legacy:      single POST with multiple files
      Incremental: one POST per clip with X-Compose-Time / X-Compose-Index / X-Compose-Count headers
                   Final clip (index == count - 1) triggers immediate compose.
                   If compose fails, session stays open for retry.
    """
    _validate_compose_environment()
    ctx, _ = _resolve_project_context(project_name, source)

    if not files:
        raise HTTPException(status_code=400, detail="files must include at least one upload")

    settings = get_settings()
    ComposeSession.prune_stale(Path(settings.temp_root))

    run_id = _header_str(request, "X-Compose-Time")
    idx = _header_int(request, "X-Compose-Index")
    total = _header_int(request, "X-Compose-Count")
    is_incremental = run_id is not None and idx is not None and total is not None and len(files) == 1

    logger.info(
        "compose_upload_received project=%s source=%s incremental=%s file_count=%s filenames=%s run_id=%s idx=%s total=%s",
        ctx.project_name, ctx.source_name, is_incremental, len(files),
        [f.filename for f in files],
        run_id, idx, total,
    )

    spec = ComposeSpec(
        inputs=[],
        output_name=output_name,
        target_dir=target_dir,
        mode=mode,
    )
    _validate_compose_submission(ctx, spec)
    base_url = str(request.base_url)

    if is_incremental:
        incremental_result = await _compose_service.compose_upload_incremental(
            ctx, spec, files[0], settings,
            run_id=run_id, idx=idx, total=total,
        )
        if isinstance(incremental_result, JSONResponse):
            return incremental_result
        session, staged_inputs = incremental_result

        def _incremental_task(job_id: str) -> dict[str, Any]:
            try:
                result = _compose_service.compose_staged_paths(
                    ctx,
                    spec,
                    staged_inputs,
                    base_url,
                    work_dir=session.session_dir,
                    job_id=job_id,
                )
            except HTTPException as exc:
                logger.warning(
                    "compose_upload_incremental_failed project=%s run_id=%s status=%s detail=%s",
                    ctx.project_name, run_id, exc.status_code, exc.detail,
                )
                raise
            session.close()
            session.cleanup()
            logger.info(
                "compose_upload_incremental_complete project=%s source=%s run_id=%s received=%s output=%s",
                ctx.project_name, ctx.source_name, run_id, len(session.received), result.get("path"),
            )
            return result

        return _submit_compose_job(
            ctx,
            flow="upload_incremental",
            output_name=spec.output_name,
            target_dir=spec.target_dir,
            base_url=base_url,
            mode_requested=spec.mode,
            input_count=len(staged_inputs),
            input_preview=[path.name for path in staged_inputs],
            task=_incremental_task,
        )
    staged_paths = await _compose_service.compose_upload_batch(ctx, spec, files, settings)
    batch_dir = staged_paths[0].parent if staged_paths else None

    def _batch_task(job_id: str) -> dict[str, Any]:
        try:
            return _compose_service.compose_staged_paths(
                ctx,
                spec,
                staged_paths,
                base_url,
                work_dir=batch_dir or Path(settings.temp_root),
                job_id=job_id,
            )
        finally:
            if batch_dir is not None:
                shutil.rmtree(batch_dir, ignore_errors=True)

    return _submit_compose_job(
        ctx,
        flow="upload_batch",
        output_name=spec.output_name,
        target_dir=spec.target_dir,
        base_url=base_url,
        mode_requested=spec.mode,
        input_count=len(staged_paths),
        input_preview=[path.name for path in staged_paths],
        task=_batch_task,
    )


@router.get("/{project_name}/compose/jobs/{job_id}")
async def compose_job_status(
    project_name: str,
    job_id: str,
    request: Request,
    source: str | None = Query(default=None),
):
    """Fetch background compose job status for a project-scoped compose request.

    Example:
        curl "http://localhost:8787/api/projects/demo/compose/jobs/<job_id>?source=primary"
    """

    ctx, _ = _resolve_project_context(project_name, source)
    job = _compose_job_runner.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Compose job not found")
    if job.project_name != ctx.project_name or job.source_name != ctx.source_name:
        raise HTTPException(status_code=404, detail="Compose job not found for the requested project/source")
    return _serialize_compose_job(job, base_url=str(request.base_url))
