"""Metadata sidecar helpers for media assets.

Example:
    ensure_metadata(project_path, "ingest/originals/clip.mov", sha, source="primary", method="upload")
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


METADATA_DIR = "ingest/_metadata"
METADATA_SCHEMA_VERSION = 1

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".aac"}


def metadata_dir(project_path: Path) -> Path:
    """Return the metadata directory for a project."""

    return project_path / METADATA_DIR


def metadata_path(project_path: Path, sha256: str) -> Path:
    """Return the metadata sidecar path for a sha256."""

    return metadata_dir(project_path) / f"{sha256}.json"


def metadata_relpath(project_path: Path, sha256: str) -> str:
    """Return the POSIX relative metadata path for a sha256."""

    return metadata_path(project_path, sha256).relative_to(project_path).as_posix()


def load_metadata(project_path: Path, sha256: str) -> Dict[str, Any] | None:
    """Load metadata if present."""

    path = metadata_path(project_path, sha256)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_metadata(
    project_path: Path,
    relative_path: str,
    sha256: str,
    file_path: Path,
    *,
    source: str,
    method: str,
    run_id: str | None = None,
) -> Path:
    """Create or update a metadata sidecar for a media asset."""

    metadata_dir(project_path).mkdir(parents=True, exist_ok=True)
    payload = load_metadata(project_path, sha256)
    if payload is None:
        payload = _build_metadata_payload(relative_path, sha256, file_path, source, method, run_id)
        return _write_metadata(project_path, sha256, payload)

    updated = False
    if payload.get("relative") != relative_path:
        payload["relative"] = relative_path
        updated = True
    if payload.get("sha256") != sha256:
        payload["sha256"] = sha256
        updated = True
    if payload.get("kind") != _detect_kind(file_path):
        payload["kind"] = _detect_kind(file_path)
        updated = True
    if payload.get("size_bytes") != file_path.stat().st_size:
        payload["size_bytes"] = file_path.stat().st_size
        updated = True

    ingest = payload.get("ingest") or {}
    ingest.setdefault("source", source)
    ingest.setdefault("method", method)
    if run_id:
        ingest.setdefault("run_id", run_id)
    payload["ingest"] = ingest

    payload.setdefault("schema_version", METADATA_SCHEMA_VERSION)
    payload.setdefault("tags", {"manual": [], "derived": []})
    if updated:
        payload["updated_at"] = _timestamp()
        return _write_metadata(project_path, sha256, payload)

    return metadata_path(project_path, sha256)


def remove_metadata(project_path: Path, sha256: str) -> None:
    """Remove a metadata sidecar if it exists."""

    path = metadata_path(project_path, sha256)
    path.unlink(missing_ok=True)


def _build_metadata_payload(
    relative_path: str,
    sha256: str,
    file_path: Path,
    source: str,
    method: str,
    run_id: str | None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "schema_version": METADATA_SCHEMA_VERSION,
        "sha256": sha256,
        "relative": relative_path,
        "kind": _detect_kind(file_path),
        "size_bytes": file_path.stat().st_size,
        "recorded_at": _timestamp(),
        "ingest": {"source": source, "method": method},
        "tags": {"manual": [], "derived": []},
    }
    if run_id:
        payload["ingest"]["run_id"] = run_id
    return payload


def _write_metadata(project_path: Path, sha256: str, payload: Dict[str, Any]) -> Path:
    path = metadata_path(project_path, sha256)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
    return path


def _detect_kind(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix in IMAGE_EXTENSIONS:
        return "image"
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in AUDIO_EXTENSIONS:
        return "audio"
    return "other"


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()
