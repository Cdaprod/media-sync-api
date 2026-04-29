"""Atomic storage helpers for durable media writes.

Example:
    from pathlib import Path
    from app.storage.atomic import write_bytes_atomic

    result = write_bytes_atomic(Path('/tmp/demo.mov'), b'bytes')
"""

from __future__ import annotations

import contextlib
import hashlib
import os
import uuid
from pathlib import Path
from typing import Iterator


_CHUNK_SIZE = 1024 * 1024


def safe_relative_path(value: str, default: str = "") -> Path:
    """Return a validated relative path without traversal segments."""

    normalized = (value or default or "").strip().replace("\\", "/")
    candidate = Path(normalized)
    if candidate.is_absolute():
        raise ValueError("relative path must not be absolute")
    parts = [part for part in candidate.parts if part not in {"", "."}]
    if any(part == ".." for part in parts):
        raise ValueError("relative path must not contain '..'")
    if not parts:
        return Path(default) if default else Path()
    return Path(*parts)


def safe_filename(value: str, fallback: str) -> str:
    """Return filename-only value, falling back when empty."""

    stripped = Path((value or "").strip()).name.strip()
    if stripped in {"", ".", ".."}:
        stripped = Path((fallback or "").strip()).name.strip()
    if stripped in {"", ".", ".."}:
        raise ValueError("filename fallback resolved to empty")
    return stripped


def ensure_within_root(root: Path, candidate: Path) -> Path:
    """Resolve candidate and verify it stays beneath root."""

    resolved_root = root.resolve()
    resolved_candidate = candidate.resolve()
    try:
        resolved_candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError("path escapes configured root") from exc
    return resolved_candidate


def sha256_file(path: Path) -> str:
    """Compute deterministic sha256 for a file."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(_CHUNK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


@contextlib.contextmanager
def atomic_write_path(final_path: Path) -> Iterator[Path]:
    """Yield temp path in final directory and atomically replace on success."""

    directory = final_path.parent
    directory.mkdir(parents=True, exist_ok=True)
    temp_path = directory / f".{final_path.name}.{uuid.uuid4().hex}.tmp"
    try:
        yield temp_path
        os.replace(temp_path, final_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def write_bytes_atomic(final_path: Path, data: bytes) -> dict[str, object]:
    """Write bytes through temp file and atomically replace target."""

    with atomic_write_path(final_path) as temp_path:
        with temp_path.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())

    size = final_path.stat().st_size
    return {
        "path": str(final_path),
        "size_bytes": size,
        "sha256": sha256_file(final_path),
    }


def copy_file_atomic(src: Path, final_path: Path) -> dict[str, object]:
    """Copy file contents via temp path and atomically replace target."""

    with atomic_write_path(final_path) as temp_path:
        with src.open("rb") as in_handle, temp_path.open("wb") as out_handle:
            while True:
                chunk = in_handle.read(_CHUNK_SIZE)
                if not chunk:
                    break
                out_handle.write(chunk)
            out_handle.flush()
            os.fsync(out_handle.fileno())

    size = final_path.stat().st_size
    return {
        "path": str(final_path),
        "size_bytes": size,
        "sha256": sha256_file(final_path),
    }
