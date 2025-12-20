from __future__ import annotations

from pathlib import Path

from app.storage.paths import relpath_posix, safe_filename


def test_relpath_posix_normalizes():
    base = Path("/tmp/base")
    target = base / "child" / "file.txt"
    assert relpath_posix(target, base) == "child/file.txt"


def test_safe_filename_strips_components():
    assert safe_filename("../evil.txt") == "evil.txt"
    assert safe_filename("nested/path/video.mp4") == "video.mp4"
