"""Derived cache artifact helpers (thumbnails, waveforms, transcripts).

Example:
    from app.storage.derive import derive_artifacts_for_asset
    result = derive_artifacts_for_asset(Path("/mnt/library/clip.mov"), "asset-id", ["thumb"], Path("/app/storage/cache"))
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import httpx

from app.config import get_settings


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac"}


@dataclass(frozen=True)
class DeriveResult:
    kind: str
    status: str
    path: str | None = None
    detail: str | None = None


def cache_artifact_path(cache_root: Path, asset_id: str, artifact: str) -> Path:
    return Path(cache_root) / asset_id / artifact


def _ensure_cache_dir(cache_root: Path, asset_id: str) -> Path:
    target = Path(cache_root) / asset_id
    target.mkdir(parents=True, exist_ok=True)
    return target


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def _probe_duration(path: Path) -> float | None:
    if not _ffprobe_available():
        return None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path.as_posix(),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return float(result.stdout.strip())
    except (subprocess.SubprocessError, ValueError):
        return None


def derive_thumbnail(asset_path: Path, asset_id: str, cache_root: Path, *, force: bool = False) -> DeriveResult:
    target = cache_artifact_path(cache_root, asset_id, "thumb.jpg")
    if target.exists() and not force:
        return DeriveResult(kind="thumb", status="cached", path=target.as_posix())
    if not _ffmpeg_available():
        return DeriveResult(kind="thumb", status="unavailable", detail="ffmpeg not available")

    _ensure_cache_dir(cache_root, asset_id)
    try:
        if asset_path.suffix.lower() in VIDEO_EXTENSIONS:
            duration = _probe_duration(asset_path)
            seek = max(duration / 2, 0) if duration else 1.0
            cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                str(seek),
                "-i",
                asset_path.as_posix(),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                target.as_posix(),
            ]
        else:
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                asset_path.as_posix(),
                "-vf",
                "scale=640:-1",
                "-frames:v",
                "1",
                target.as_posix(),
            ]
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.SubprocessError as exc:
        return DeriveResult(kind="thumb", status="error", detail=str(exc))
    return DeriveResult(kind="thumb", status="created", path=target.as_posix())


def derive_waveform(asset_path: Path, asset_id: str, cache_root: Path, *, force: bool = False) -> DeriveResult:
    target = cache_artifact_path(cache_root, asset_id, "waveform.png")
    if target.exists() and not force:
        return DeriveResult(kind="waveform", status="cached", path=target.as_posix())
    if asset_path.suffix.lower() not in AUDIO_EXTENSIONS:
        return DeriveResult(kind="waveform", status="skipped", detail="Not an audio asset")
    if not _ffmpeg_available():
        return DeriveResult(kind="waveform", status="unavailable", detail="ffmpeg not available")

    _ensure_cache_dir(cache_root, asset_id)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                asset_path.as_posix(),
                "-filter_complex",
                "showwavespic=s=640x120",
                "-frames:v",
                "1",
                target.as_posix(),
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.SubprocessError as exc:
        return DeriveResult(kind="waveform", status="error", detail=str(exc))
    return DeriveResult(kind="waveform", status="created", path=target.as_posix())


def derive_transcript(asset_path: Path, asset_id: str, cache_root: Path, *, force: bool = False) -> DeriveResult:
    target = cache_artifact_path(cache_root, asset_id, "transcript.json")
    if target.exists() and not force:
        return DeriveResult(kind="transcript", status="cached", path=target.as_posix())

    settings = get_settings()
    if not settings.ai_whisperx_url:
        return DeriveResult(kind="transcript", status="unavailable", detail="WhisperX URL not configured")

    _ensure_cache_dir(cache_root, asset_id)
    payload = {"path": asset_path.as_posix()}
    if settings.ai_tagging_language:
        payload["language"] = settings.ai_tagging_language
    try:
        response = httpx.post(settings.ai_whisperx_url, json=payload, timeout=settings.ai_tagging_timeout_s)
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        return DeriveResult(kind="transcript", status="error", detail=str(exc))

    target.write_text(json.dumps(data, indent=2))
    return DeriveResult(kind="transcript", status="created", path=target.as_posix())


def derive_artifacts_for_asset(
    asset_path: Path,
    asset_id: str,
    kinds: Iterable[str],
    cache_root: Path,
    *,
    force: bool = False,
) -> list[DeriveResult]:
    results: list[DeriveResult] = []
    normalized = [k.strip().lower() for k in kinds if k]
    for kind in normalized:
        if kind == "thumb":
            results.append(derive_thumbnail(asset_path, asset_id, cache_root, force=force))
        elif kind == "waveform":
            results.append(derive_waveform(asset_path, asset_id, cache_root, force=force))
        elif kind == "transcript":
            results.append(derive_transcript(asset_path, asset_id, cache_root, force=force))
    return results
