from __future__ import annotations

from pathlib import Path

import pytest

from app.storage.paths import relpath_posix, safe_filename


def test_relpath_posix_normalizes():
    base = Path("/tmp/base")
    target = base / "child" / "file.txt"
    assert relpath_posix(target, base) == "child/file.txt"


def test_safe_filename_rejects_components():
    with pytest.raises(ValueError):
        safe_filename("../evil.txt")
    with pytest.raises(ValueError):
        safe_filename("nested/path/video.mp4")
    with pytest.raises(ValueError):
        safe_filename("..\\video.mp4")
    assert safe_filename("video.mp4") == "video.mp4"
