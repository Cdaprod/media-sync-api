from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def _create_project(client: TestClient) -> str:
    created = client.post("/api/projects", json={"name": "demo"})
    assert created.status_code == 201
    return created.json()["name"]


def test_list_media_and_stream(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "sample.mov"
    payload = b"media-bytes"
    media_path.write_bytes(payload)

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    data = listing.json()
    assert data["project"] == project_name
    assert len(data["media"]) == 1
    media_entry = data["media"][0]
    assert media_entry["relative_path"] == "ingest/originals/sample.mov"
    stream_url = media_entry["stream_url"]

    streamed = client.get(stream_url)
    assert streamed.status_code == 200
    assert streamed.content == payload

    traversal = client.get(f"/media/{project_name}/..%2Fsecret.txt")
    assert traversal.status_code == 400


def test_auto_organize_loose_files(client: TestClient, env_settings: Path) -> None:
    loose_file = env_settings / "loose.mov"
    loose_file.write_bytes(b"orphaned")

    response = client.post("/api/projects/auto-organize")
    assert response.status_code == 200
    payload = response.json()
    assert payload["moved"] == 1
    summary = payload["sources"][0]
    destination = summary["destination_project"]
    assert destination

    ingest_path = env_settings / destination / "ingest" / "originals" / "loose.mov"
    assert ingest_path.exists()

    media_listing = client.get(f"/api/projects/{destination}/media")
    assert media_listing.status_code == 200
    media_payload = media_listing.json()
    assert any(item["relative_path"].endswith("loose.mov") for item in media_payload["media"])

    empty_run = client.post("/api/projects/auto-organize")
    assert empty_run.status_code == 200
    assert empty_run.json()["moved"] == 0
