from __future__ import annotations

import base64
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


def test_download_media_and_link_in_listing(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "downloadable.mov"
    payload = b"download-me"
    media_path.write_bytes(payload)

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    media_entry = listing.json()["media"][0]
    assert media_entry["download_url"].startswith(f"/media/{project_name}/download/")

    download = client.get(media_entry["download_url"])
    assert download.status_code == 200
    assert "attachment" in download.headers.get("content-disposition", "").lower()
    assert download.content == payload


def test_store_thumbnail_and_list(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "thumb.mov"
    media_path.write_bytes(b"media-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    thumbnail_data = base64.b64encode(b"thumb-bytes").decode("utf-8")
    response = client.post(
        f"/api/projects/{project_name}/media/thumbnail",
        json={
            "relative_path": "ingest/originals/thumb.mov",
            "data_url": f"data:image/jpeg;base64,{thumbnail_data}",
        },
    )
    assert response.status_code == 200

    thumb_path = env_settings / project_name / "ingest" / "thumbnails" / "thumb.jpg"
    assert thumb_path.exists()

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    media_entry = listing.json()["media"][0]
    assert "/ingest/thumbnails/thumb.jpg" in media_entry["thumb_url"]

    thumbnail = client.get(media_entry["thumb_url"])
    assert thumbnail.status_code == 200
    assert thumbnail.content == b"thumb-bytes"


def test_reindex_moves_misplaced_media(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    project_dir = env_settings / project_name
    misplaced = project_dir / "floating.mov"
    misplaced.write_bytes(b"floating")

    response = client.post(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200
    payload = response.json()
    assert payload["relocated"] == 1

    relocated_path = project_dir / "ingest" / "originals" / misplaced.name
    assert relocated_path.exists()

    index_listing = client.get(f"/api/projects/{project_name}/media")
    assert index_listing.status_code == 200
    media_entries = index_listing.json()["media"]
    assert any(entry["relative_path"].endswith("floating.mov") for entry in media_entries)


def test_reindex_skips_non_media_files(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    ignored = ingest / "notes.txt"
    ignored.write_text("not media")

    response = client.post(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200
    payload = response.json()
    assert payload["indexed"] == 0
    assert payload["skipped_unsupported"] == 1

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    assert not listing.json()["media"]


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


def test_delete_media_removes_index_and_file(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "delete-me.mov"
    media_path.write_bytes(b"delete-me")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    response = client.post(
        f"/api/projects/{project_name}/media/delete",
        json={"relative_paths": ["ingest/originals/delete-me.mov"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "ingest/originals/delete-me.mov" in payload["removed"]
    assert not media_path.exists()

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    assert listing.json()["media"] == []


def test_move_media_between_projects(client: TestClient, env_settings: Path) -> None:
    source_project = _create_project(client)
    target = client.post("/api/projects", json={"name": "dest"})
    assert target.status_code == 201
    target_project = target.json()["name"]

    ingest = env_settings / source_project / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "move-me.mov"
    media_path.write_bytes(b"move-me")

    reindexed = client.post(f"/api/projects/{source_project}/reindex")
    assert reindexed.status_code == 200

    response = client.post(
        f"/api/projects/{source_project}/media/move",
        json={"relative_paths": ["ingest/originals/move-me.mov"], "target_project": target_project},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["moved"]

    source_listing = client.get(f"/api/projects/{source_project}/media")
    assert source_listing.status_code == 200
    assert source_listing.json()["media"] == []

    target_listing = client.get(f"/api/projects/{target_project}/media")
    assert target_listing.status_code == 200
    assert any(
        entry["relative_path"].endswith("move-me.mov")
        for entry in target_listing.json()["media"]
    )
