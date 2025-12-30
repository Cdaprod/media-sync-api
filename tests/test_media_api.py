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


def test_media_listing_derives_capture_metadata(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    capture_dir = (
        env_settings
        / project_name
        / "ingest"
        / "originals"
        / "ffmpeg"
        / "hdmi0"
        / "2025"
        / "12"
        / "28"
    )
    capture_dir.mkdir(parents=True, exist_ok=True)
    media_path = capture_dir / "2025-12-28_19-22-11_rpi5-1_program_001.mp4"
    sidecar = media_path.with_suffix(".srt")
    media_path.write_bytes(b"capture")
    sidecar.write_text("caption")
    legacy_path = env_settings / project_name / "ingest" / "originals" / "legacy.mov"
    legacy_path.write_bytes(b"legacy")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    payload = listing.json()
    media_items = payload["media"]
    capture_item = next(item for item in media_items if item["relative_path"].endswith(".mp4"))
    legacy_item = next(item for item in media_items if item["relative_path"].endswith("legacy.mov"))

    assert capture_item["schema_version"] == "p1_hostapp_device_v1"
    assert capture_item["host_app"] == "ffmpeg"
    assert capture_item["device_id"] == "hdmi0"
    assert capture_item["date"] == "2025-12-28"
    assert capture_item["ts"] == "2025-12-28_19-22-11"
    assert capture_item["hostnode"] == "rpi5-1"
    assert capture_item["role"] == "program"
    assert capture_item["seq"] == 1
    assert capture_item["captions_url"].split("?")[0].endswith(".srt")

    assert legacy_item["schema_version"] == "legacy"
    assert legacy_item["host_app"] == "unknown"
    assert legacy_item["device_id"] == "unknown"


def test_media_listing_filters_by_capture_fields(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    base = env_settings / project_name / "ingest" / "originals"
    first_dir = base / "ffmpeg" / "hdmi0" / "2025" / "12" / "28"
    second_dir = base / "obs" / "camx" / "2025" / "12" / "29"
    first_dir.mkdir(parents=True, exist_ok=True)
    second_dir.mkdir(parents=True, exist_ok=True)
    first_media = first_dir / "2025-12-28_10-00-00_rpi5-1_program_001.mp4"
    second_media = second_dir / "2025-12-29_11-00-00_cda-desktop_camB_001.mp4"
    first_media.write_bytes(b"first")
    second_media.write_bytes(b"second")
    first_media.with_suffix(".srt").write_text("caption")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    host_filtered = client.get(
        f"/api/projects/{project_name}/media",
        params={"host": "rpi5-1"},
    )
    assert host_filtered.status_code == 200
    assert len(host_filtered.json()["media"]) == 1

    device_filtered = client.get(
        f"/api/projects/{project_name}/media",
        params={"device": "camx"},
    )
    assert device_filtered.status_code == 200
    assert device_filtered.json()["media"][0]["device_id"] == "camx"

    app_filtered = client.get(
        f"/api/projects/{project_name}/media",
        params={"app": "ffmpeg"},
    )
    assert app_filtered.status_code == 200
    assert app_filtered.json()["media"][0]["host_app"] == "ffmpeg"

    date_filtered = client.get(
        f"/api/projects/{project_name}/media",
        params={"date_from": "2025-12-29", "date_to": "2025-12-29"},
    )
    assert date_filtered.status_code == 200
    assert len(date_filtered.json()["media"]) == 1

    captions_filtered = client.get(
        f"/api/projects/{project_name}/media",
        params={"has_captions": "true"},
    )
    assert captions_filtered.status_code == 200
    assert len(captions_filtered.json()["media"]) == 1


def test_media_tags_and_filters(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    tagged_path = ingest / "tagged.mov"
    untagged_path = ingest / "untagged.mov"
    tagged_path.write_bytes(b"tagged")
    untagged_path.write_bytes(b"untagged")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    tag_response = client.post(
        f"/api/projects/{project_name}/assets/tags",
        params={"rel_path": "ingest/originals/tagged.mov"},
        json={"tags": ["wf:select", "topic:foia"]},
    )
    assert tag_response.status_code == 200

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    payload = listing.json()
    tagged = next(item for item in payload["media"] if item["relative_path"].endswith("tagged.mov"))
    assert tagged["tags"] == ["topic:foia", "wf:select"]
    assert tagged["tag_source_counts"]["user"] == 2

    filtered_all = client.get(f"/api/projects/{project_name}/media", params={"tags": "wf:select,topic:foia"})
    assert filtered_all.status_code == 200
    assert len(filtered_all.json()["media"]) == 1

    filtered_any = client.get(f"/api/projects/{project_name}/media", params={"any_tags": "topic:missing,topic:foia"})
    assert filtered_any.status_code == 200
    assert len(filtered_any.json()["media"]) == 1

    no_tags = client.get(f"/api/projects/{project_name}/media", params={"no_tags": "true"})
    assert no_tags.status_code == 200
    assert len(no_tags.json()["media"]) == 1


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
