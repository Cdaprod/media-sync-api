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


def test_upload_rejects_traversal_filename(client, project_path: Path):
    created = client.post("/api/projects", json={"name": "demo"})
    assert created.status_code == 201

    response = client.post(
        "/api/projects/demo/upload",
        files={"file": ("../escape.mp4", b"payload", "video/mp4")},
    )

    assert response.status_code == 400
    data = response.json()
    assert "Filename cannot" in data["detail"]


def test_dedupe_records_final_path_after_collision(client, project_path: Path):
    client.post("/api/projects", json={"name": "demo"})

    first_payload = b"video-one"
    first = client.post(
        "/api/projects/demo/upload",
        files={"file": ("clip.mp4", first_payload, "video/mp4")},
    )
    first_path = first.json()["path"]

    second_payload = b"video-two-different"
    second = client.post(
        "/api/projects/demo/upload",
        files={"file": ("clip.mp4", second_payload, "video/mp4")},
    )
    assert second.status_code == 200
    second_path = second.json()["path"]
    assert second_path.startswith("ingest/originals/")
    assert second_path != first_path
    assert (project_path / "demo" / second_path).exists()

    duplicate = client.post(
        "/api/projects/demo/upload",
        files={"file": ("another.mp4", second_payload, "video/mp4")},
    )
    assert duplicate.status_code == 200
    dup_data = duplicate.json()
    assert dup_data["status"] == "duplicate"
    assert dup_data["path"] == second_path

    index_path = project_path / "demo" / "index.json"
    index = json.loads(index_path.read_text())
    assert index["counts"]["videos"] == 2
    assert index["counts"]["duplicates_skipped"] == 1
