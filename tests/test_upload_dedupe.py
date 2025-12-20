from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture()
def project_path(env_settings: Path) -> Path:
    return env_settings


def test_upload_and_dedupe_tracking(client, project_path: Path):
    created = client.post("/api/projects", json={"name": "demo"})
    assert created.status_code == 201

    payload = b"video-bytes"
    first = client.post(
        "/api/projects/demo/upload",
        files={"file": ("clip.mp4", payload, "video/mp4")},
    )
    assert first.status_code == 200
    first_data = first.json()
    stored_rel_path = first_data["path"]
    stored_path = project_path / "demo" / stored_rel_path
    assert stored_path.exists()

    duplicate = client.post(
        "/api/projects/demo/upload",
        files={"file": ("second-name.mp4", payload, "video/mp4")},
    )
    dup_data = duplicate.json()
    assert duplicate.status_code == 200
    assert dup_data["status"] == "duplicate"
    assert dup_data["path"] == stored_rel_path

    index_path = project_path / "demo" / "index.json"
    index = json.loads(index_path.read_text())
    assert index["counts"]["videos"] == 1
    assert index["counts"]["duplicates_skipped"] == 1

    events_path = project_path / "demo" / "_manifest" / "events.jsonl"
    lines = events_path.read_text().splitlines()
    assert any("upload_ingested" in line for line in lines)
    assert any("upload_duplicate_skipped" in line for line in lines)
