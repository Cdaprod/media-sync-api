"""Tests for explorer refresh behavior."""

from pathlib import Path


def test_refresh_triggers_thumbnail_generation() -> None:
    explorer_path = Path(__file__).resolve().parents[1] / "public" / "explorer.html"
    content = explorer_path.read_text(encoding="utf-8")
    assert "refreshMissingThumbnails" in content
    assert "refreshMissingThumbnails(state.media)" in content
