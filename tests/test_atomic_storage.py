from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.storage.atomic import (
    ensure_within_root,
    safe_filename,
    safe_relative_path,
    sha256_file,
    write_bytes_atomic,
)


def test_write_bytes_atomic_writes_final_file(tmp_path: Path) -> None:
    final_path = tmp_path / "ingest" / "originals" / "clip.webm"
    payload = b"atomic-bytes"

    result = write_bytes_atomic(final_path, payload)

    assert final_path.exists()
    assert final_path.read_bytes() == payload
    assert result["path"] == str(final_path)
    assert result["size_bytes"] == len(payload)


def test_sha256_is_deterministic(tmp_path: Path) -> None:
    final_path = tmp_path / "clip.webm"
    payload = b"same-payload"

    first = write_bytes_atomic(final_path, payload)
    second = write_bytes_atomic(final_path, payload)

    assert first["sha256"] == second["sha256"] == sha256_file(final_path)


def test_write_bytes_atomic_removes_temp_after_success(tmp_path: Path) -> None:
    final_path = tmp_path / "assets" / "video.mov"
    write_bytes_atomic(final_path, b"content")

    leftovers = list(final_path.parent.glob("*.tmp"))
    assert leftovers == []


def test_write_bytes_atomic_removes_temp_after_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    final_path = tmp_path / "assets" / "broken.mov"

    def _fail_replace(_src: str | os.PathLike[str], _dst: str | os.PathLike[str]) -> None:
        raise OSError("replace failed")

    monkeypatch.setattr("app.storage.atomic.os.replace", _fail_replace)

    with pytest.raises(OSError):
        write_bytes_atomic(final_path, b"content")

    assert not final_path.exists()
    assert list((tmp_path / "assets").glob("*.tmp")) == []


def test_safe_relative_path_rejects_traversal() -> None:
    with pytest.raises(ValueError):
        safe_relative_path("../escape")
    with pytest.raises(ValueError):
        safe_relative_path("/absolute/path")


def test_ensure_within_root_rejects_escape(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir(parents=True, exist_ok=True)

    with pytest.raises(ValueError):
        ensure_within_root(root, tmp_path / "outside" / "file.mov")


def test_safe_filename_strips_and_falls_back() -> None:
    assert safe_filename("nested/path/clip.webm", "fallback.webm") == "clip.webm"
    assert safe_filename("", "fallback.webm") == "fallback.webm"
