"""Orientation normalization helpers for media-sync-api.

Example:
    # Normalize a rotated file in place.
    from pathlib import Path
    from app.storage.orientation import normalize_video_orientation_in_place

    changed = normalize_video_orientation_in_place(Path("ingest/originals/clip.mov"))
"""
from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


SUPPORTED_ROTATIONS = {90, 180, 270}


class OrientationError(RuntimeError):
    """Raised when orientation normalization fails."""


@dataclass(frozen=True)
class ProbeVideo:
    rotation: int
    width: int
    height: int
    codec: str


@dataclass(frozen=True)
class NormalizationResult:
    changed: bool
    rotation: int | None
    backup_path: Path | None = None


def _run(cmd: list[str], *, timeout_s: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            timeout=timeout_s,
        )
    except subprocess.TimeoutExpired as exc:
        raise OrientationError(f"Command timed out after {timeout_s}s: {' '.join(cmd)}") from exc
    except FileNotFoundError as exc:
        raise OrientationError(f"Command not found: {cmd[0]}") from exc


def ffprobe_video(path: Path, *, timeout_s: int = 15) -> ProbeVideo:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-select_streams",
        "v:0",
        str(path),
    ]
    proc = _run(cmd, timeout_s=timeout_s)
    if proc.returncode != 0:
        raise OrientationError(f"ffprobe failed: {proc.stderr[-1500:]}")

    data = json.loads(proc.stdout or "{}")
    streams = data.get("streams") or []
    if not streams:
        raise OrientationError("ffprobe: no video streams found")

    stream = streams[0]
    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    codec = str(stream.get("codec_name") or "")

    rotation = 0
    tags = stream.get("tags") or {}
    if "rotate" in tags:
        try:
            rotation = int(tags["rotate"]) % 360
        except (TypeError, ValueError):
            rotation = 0

    for side_data in stream.get("side_data_list") or []:
        if "rotation" in side_data:
            try:
                rotation = int(side_data["rotation"]) % 360
            except (TypeError, ValueError):
                continue

    return ProbeVideo(rotation=rotation, width=width, height=height, codec=codec)


def _vf_for_rotation(rotation: int) -> str:
    if rotation == 90:
        return "transpose=2"
    if rotation == 270:
        return "transpose=1"
    if rotation == 180:
        return "transpose=2,transpose=2"
    raise OrientationError(f"Unsupported rotation: {rotation}")


def normalize_video_orientation_in_place(
    input_path: Path,
    *,
    timeout_s: int = 3600,
    crf: int = 18,
    preset: str = "veryfast",
    min_output_bytes: int = 1024,
    keep_backup: bool = False,
) -> NormalizationResult:
    """Normalize a video orientation in place by applying rotation metadata to pixels."""

    if not input_path.exists():
        raise OrientationError(f"Input missing: {input_path}")
    if not shutil.which("ffmpeg"):
        raise OrientationError("ffmpeg is not available; cannot normalize orientation")
    if not shutil.which("ffprobe"):
        raise OrientationError("ffprobe is not available; cannot normalize orientation")

    probe = ffprobe_video(input_path)
    rotation = probe.rotation % 360
    if rotation not in SUPPORTED_ROTATIONS:
        return NormalizationResult(changed=False, rotation=rotation)

    vf = _vf_for_rotation(rotation)
    temp_path = input_path.with_name(f".tmp.{input_path.name}.normalized{input_path.suffix}")
    backup_path = input_path.with_name(f".bak.{input_path.name}")

    if temp_path.exists() or backup_path.exists():
        raise OrientationError(f"Temp or backup exists for {input_path.name}; refusing to overwrite")

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-noautorotate",
        "-i",
        str(input_path),
        "-vf",
        vf,
        "-map",
        "0",
        "-c:a",
        "copy",
        "-c:s",
        "copy",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        str(crf),
        "-preset",
        preset,
        "-movflags",
        "+faststart",
        "-metadata:s:v:0",
        "rotate=0",
        str(temp_path),
    ]
    proc = _run(cmd, timeout_s=timeout_s)
    if proc.returncode != 0:
        temp_path.unlink(missing_ok=True)
        raise OrientationError(f"ffmpeg normalize failed: {proc.stderr[-2000:]}")

    if not temp_path.exists() or temp_path.stat().st_size < min_output_bytes:
        temp_path.unlink(missing_ok=True)
        raise OrientationError("Normalized output missing or too small; refusing replace")

    output_probe = ffprobe_video(temp_path)
    if output_probe.rotation != 0:
        temp_path.unlink(missing_ok=True)
        raise OrientationError(f"Output still reports rotation={output_probe.rotation}")

    input_path.rename(backup_path)
    try:
        temp_path.rename(input_path)
        ffprobe_video(input_path)
    except Exception as exc:
        if input_path.exists():
            input_path.unlink(missing_ok=True)
        if backup_path.exists():
            backup_path.rename(input_path)
        temp_path.unlink(missing_ok=True)
        raise OrientationError(f"Replace failed, rolled back: {exc}") from exc
    finally:
        temp_path.unlink(missing_ok=True)

    if not keep_backup and backup_path.exists():
        backup_path.unlink(missing_ok=True)

    return NormalizationResult(changed=True, rotation=rotation, backup_path=backup_path if keep_backup else None)
