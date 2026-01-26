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
    project_name = created.json()["name"]

    payload = b"video-bytes"
    first = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("clip.mp4", payload, "video/mp4")},
    )
    assert first.status_code == 200
    first_data = first.json()
    stored_rel_path = first_data["path"]
    stored_path = project_path / project_name / stored_rel_path
    assert stored_path.exists()
    assert f"/media/{project_name}/{stored_rel_path}" in first_data["served"]["stream_url"]
    assert f"/media/{project_name}/download/{stored_rel_path}" in first_data["served"]["download_url"]

    duplicate = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("second-name.mp4", payload, "video/mp4")},
    )
    dup_data = duplicate.json()
    assert duplicate.status_code == 200
    assert dup_data["status"] == "duplicate"
    assert dup_data["path"] == stored_rel_path
    assert f"/media/{project_name}/{stored_rel_path}" in dup_data["served"]["stream_url"]
    assert f"/media/{project_name}/download/{stored_rel_path}" in dup_data["served"]["download_url"]

    index_path = project_path / project_name / "index.json"
    index = json.loads(index_path.read_text())
    assert index["counts"]["videos"] == 1
    assert index["counts"]["duplicates_skipped"] == 1

    events_path = project_path / project_name / "_manifest" / "events.jsonl"
    lines = events_path.read_text().splitlines()
    assert any("upload_ingested" in line for line in lines)
    assert any("upload_duplicate_skipped" in line for line in lines)


def test_upload_batch_session_aggregates_items(client, project_path: Path):
    created = client.post("/api/projects", json={"name": "demo"})
    project_name = created.json()["name"]

    batch_start = client.post(f"/api/projects/{project_name}/upload", params={"op": "start"})
    assert batch_start.status_code == 200
    batch_id = batch_start.json()["batch_id"]

    first = client.post(
        f"/api/projects/{project_name}/upload",
        params={"batch_id": batch_id},
        files={"file": ("clip-one.mp4", b"first", "video/mp4")},
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/projects/{project_name}/upload",
        params={"batch_id": batch_id},
        files={"file": ("clip-two.mp4", b"second", "video/mp4")},
    )
    assert second.status_code == 200

    finalized = client.post(
        f"/api/projects/{project_name}/upload",
        params={"op": "finalize"},
        json={"batch_id": batch_id},
    )
    assert finalized.status_code == 200
    data = finalized.json()
    assert data["counts"]["total"] == 2
    assert data["counts"]["stored"] == 2
    assert len(data["served_urls"]) == 2
    assert all(f"/media/{project_name}/download/ingest/originals/" in url for url in data["served_urls"])


def test_upload_multi_file_single_request(client):
    created = client.post("/api/projects", json={"name": "demo"})
    project_name = created.json()["name"]

    response = client.post(
        f"/api/projects/{project_name}/upload",
        files=[
            ("files", ("clip-one.mp4", b"one", "video/mp4")),
            ("files", ("clip-two.mp4", b"two", "video/mp4")),
        ],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["counts"]["total"] == 2
    assert len(data["items"]) == 2


def test_upload_rejects_traversal_filename(client, project_path: Path):
    created = client.post("/api/projects", json={"name": "demo"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    response = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("../escape.mp4", b"payload", "video/mp4")},
    )

    assert response.status_code == 400
    data = response.json()
    assert "Filename cannot" in data["detail"]


def test_dedupe_records_final_path_after_collision(client, project_path: Path):
    created = client.post("/api/projects", json={"name": "demo"})
    project_name = created.json()["name"]

    first_payload = b"video-one"
    first = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("clip.mp4", first_payload, "video/mp4")},
    )
    first_path = first.json()["path"]

    second_payload = b"video-two-different"
    second = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("clip.mp4", second_payload, "video/mp4")},
    )
    assert second.status_code == 200
    second_path = second.json()["path"]
    assert second_path.startswith("ingest/originals/")
    assert second_path != first_path
    assert (project_path / project_name / second_path).exists()

    duplicate = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("another.mp4", second_payload, "video/mp4")},
    )
    assert duplicate.status_code == 200
    dup_data = duplicate.json()
    assert dup_data["status"] == "duplicate"
    assert dup_data["path"] == second_path

    index_path = project_path / project_name / "index.json"
    index = json.loads(index_path.read_text())
    assert index["counts"]["videos"] == 2
    assert index["counts"]["duplicates_skipped"] == 1
