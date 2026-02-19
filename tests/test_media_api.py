from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image


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


def test_thumbnail_endpoint_serves_cached_file(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "thumbed.mov"
    media_path.write_bytes(b"video-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    media_entry = listing.json()["media"][0]
    thumb_url = media_entry.get("thumb_url")
    if not thumb_url:
        thumb_url = f"/thumbnails/{project_name}/{media_entry['sha256']}.jpg"
    assert thumb_url.startswith(f"/thumbnails/{project_name}/")

    sha = media_entry["sha256"]
    thumb_path = env_settings / project_name / "ingest" / "thumbnails" / f"{sha}.jpg"
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    thumb_path.write_bytes(b"thumb-bytes")

    response = client.get(thumb_url)
    assert response.status_code == 200
    assert response.content == b"thumb-bytes"
    assert "immutable" in response.headers.get("cache-control", "")


def test_thumbnail_endpoint_generates_image_thumbnail(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    image_path = ingest / "frame.png"
    image = Image.new("RGB", (1280, 720), color=(32, 64, 96))
    image.save(image_path, format="PNG")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    media_entry = listing.json()["media"][0]
    thumb_url = media_entry.get("thumb_url")
    assert thumb_url

    response = client.get(thumb_url)
    assert response.status_code == 200
    assert response.headers.get("content-type") == "image/jpeg"
    assert response.content.startswith(b"\xff\xd8")
    assert "immutable" in response.headers.get("cache-control", "")


def test_thumbnail_endpoint_falls_back_when_ffmpeg_missing(
    client: TestClient,
    env_settings: Path,
    monkeypatch,
) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "sample.mov"
    media_path.write_bytes(b"video-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    import app.api.media as media_module

    monkeypatch.setattr(media_module, "_ffmpeg_available", lambda: False)

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    media_entry = listing.json()["media"][0]
    thumb_url = media_entry.get("thumb_url")
    assert thumb_url

    response = client.get(thumb_url)
    assert response.status_code == 200
    assert response.headers.get("content-type") == "image/svg+xml"
    assert response.headers.get("x-thumb-status") == "ffmpeg_missing"


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


def test_reindex_skips_thumbnail_assets(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    thumbnail = ingest / "clip.thumb.jpg"
    thumbnail.write_bytes(b"thumb-bytes")

    response = client.post(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200
    payload = response.json()
    assert payload["indexed"] == 0
    assert payload["skipped_unsupported"] == 1

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    assert not listing.json()["media"]


def test_normalize_orientation_updates_index_and_manifest(
    client: TestClient,
    env_settings: Path,
    monkeypatch,
) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "rotated.mov"
    media_path.write_bytes(b"original-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    from app.storage.index import load_index
    from app.storage.dedupe import compute_sha256_from_path, lookup_file_hash
    import app.storage.orientation as orientation_module
    import app.api.media as media_module

    index_before = load_index(env_settings / project_name)
    entry_before = index_before["files"][0]
    old_sha = entry_before["sha256"]

    def fake_probe(_path):
        return orientation_module.ProbeVideo(rotation=90, width=1920, height=1080, codec="h264")

    def fake_normalize(path, keep_backup=True, **_kwargs):
        backup = path.with_name(f".bak.{path.name}")
        backup.write_bytes(path.read_bytes())
        path.write_bytes(b"normalized-bytes")
        return orientation_module.NormalizationResult(changed=True, rotation=90, backup_path=backup)

    monkeypatch.setattr(orientation_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(orientation_module, "normalize_video_orientation_in_place", fake_normalize)
    monkeypatch.setattr(media_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(media_module, "normalize_video_orientation_in_place", fake_normalize)

    response = client.post(
        f"/api/projects/{project_name}/media/normalize-orientation",
        json={"dry_run": False},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["changed"]
    assert not payload["failed"]

    index_after = load_index(env_settings / project_name)
    entry_after = index_after["files"][0]
    new_sha = entry_after["sha256"]
    assert new_sha != old_sha
    assert entry_after["relative_path"] == "ingest/originals/rotated.mov"

    manifest_db = env_settings / project_name / "_manifest" / "manifest.db"
    assert lookup_file_hash(manifest_db, new_sha) == "ingest/originals/rotated.mov"
    assert lookup_file_hash(manifest_db, old_sha) is None
    assert compute_sha256_from_path(media_path) == new_sha
    assert not media_path.with_name(f".bak.{media_path.name}").exists()


def test_normalize_orientation_get_apply(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "rotated-get.mov"
    media_path.write_bytes(b"original-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    import app.storage.orientation as orientation_module
    import app.api.media as media_module

    def fake_probe(_path):
        return orientation_module.ProbeVideo(rotation=90, width=1920, height=1080, codec="h264")

    def fake_normalize(path, keep_backup=True, **_kwargs):
        backup = path.with_name(f".bak.{path.name}")
        backup.write_bytes(path.read_bytes())
        path.write_bytes(b"normalized-bytes")
        return orientation_module.NormalizationResult(changed=True, rotation=90, backup_path=backup)

    monkeypatch.setattr(orientation_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(orientation_module, "normalize_video_orientation_in_place", fake_normalize)
    monkeypatch.setattr(media_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(media_module, "normalize_video_orientation_in_place", fake_normalize)

    response = client.get(
        f"/api/projects/{project_name}/media/normalize-orientation",
        params={"dry_run": "false"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["dry_run"] is False
    assert payload["changed"]
    assert not payload["failed"]



def test_normalize_orientation_get_limit_validation(client: TestClient) -> None:
    project_name = _create_project(client)

    project_response = client.get(
        f"/api/projects/{project_name}/media/normalize-orientation",
        params={"limit": 0},
    )
    assert project_response.status_code == 422

    global_response = client.get("/api/media/normalize-orientation", params={"limit": 0})
    assert global_response.status_code == 422


def test_normalize_orientation_cleans_orphaned_shared_sha_sidecars(
    client: TestClient,
    env_settings: Path,
    monkeypatch,
) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    first = ingest / "a.mov"
    second = ingest / "b.mov"
    first.write_bytes(b"same-content")
    second.write_bytes(b"same-content")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    from app.storage.index import load_index
    from app.storage.metadata import metadata_path
    import app.storage.orientation as orientation_module
    import app.api.media as media_module

    index_before = load_index(env_settings / project_name)
    old_sha = index_before["files"][0]["sha256"]
    old_metadata = metadata_path(env_settings / project_name, old_sha)
    old_thumbnail = env_settings / project_name / "ingest" / "thumbnails" / f"{old_sha}.jpg"
    old_thumbnail.write_bytes(b"thumb")
    assert old_metadata.exists()
    assert old_thumbnail.exists()

    def fake_probe(_path):
        return orientation_module.ProbeVideo(rotation=90, width=1920, height=1080, codec="h264")

    def fake_normalize(path, keep_backup=True, **_kwargs):
        backup = path.with_name(f".bak.{path.name}")
        backup.write_bytes(path.read_bytes())
        path.write_bytes(("normalized-" + path.name).encode("utf-8"))
        return orientation_module.NormalizationResult(changed=True, rotation=90, backup_path=backup)

    monkeypatch.setattr(orientation_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(orientation_module, "normalize_video_orientation_in_place", fake_normalize)
    monkeypatch.setattr(media_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(media_module, "normalize_video_orientation_in_place", fake_normalize)

    response = client.post(
        f"/api/projects/{project_name}/media/normalize-orientation",
        json={"dry_run": False},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["changed"]) == 2
    assert not payload["failed"]

    assert not old_metadata.exists()
    assert not old_thumbnail.exists()

def test_normalize_orientation_all_projects_dry_run(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_one = _create_project(client)
    project_two = client.post("/api/projects", json={"name": "demo-two"}).json()["name"]

    for name in (project_one, project_two):
        ingest = env_settings / name / "ingest" / "originals"
        ingest.mkdir(parents=True, exist_ok=True)
        (ingest / f"{name}.mov").write_bytes(b"rotate-me")
        reindexed = client.post(f"/api/projects/{name}/reindex")
        assert reindexed.status_code == 200

    import app.api.media as media_module
    import app.storage.orientation as orientation_module

    def fake_probe(_path):
        return orientation_module.ProbeVideo(rotation=90, width=1920, height=1080, codec="h264")

    monkeypatch.setattr(media_module, "ffprobe_video", fake_probe)

    response = client.post("/api/media/normalize-orientation", json={"dry_run": True})
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "all"
    assert payload["projects_processed"] == 2
    assert payload["totals"]["planned"] == 2




def test_reconcile_media_dry_run_classifies_and_plans_rename(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "2026-01-17_18-57-14.mp4"
    media_path.write_bytes(b"obs-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    import app.api.media as media_module

    fake_payload = {
        "format": {"tags": {"creation_time": "2026-01-17T18:57:14Z"}},
        "streams": [{"side_data_list": [{"side_data_type": "Display Matrix", "rotation": 90}]}],
    }
    monkeypatch.setattr(media_module, "_read_ffprobe_payload", lambda _path: fake_payload)

    response = client.post(
        f"/api/projects/{project_name}/media/reconcile",
        json={"dry_run": True, "normalize_orientation": True, "rename_canonical": True},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["dry_run"] is True
    assert payload["actions"]
    action = payload["actions"][0]
    assert action["origin"]["source"] == "obs"
    assert action["rotation_detected_deg"] == 90
    assert action["rename_planned"] is True
    assert action["normalize_planned"] is True




def test_reconcile_media_dry_run_does_not_mutate_rotated_media(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "rotate-on-reindex.mov"
    media_path.write_bytes(b"before-rotation")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    import app.api.media as media_module
    import app.storage.orientation as orientation_module

    def fake_probe(path, **_kwargs):
        data = path.read_bytes()
        rotation = 90 if data == b"before-rotation" else 0
        return orientation_module.ProbeVideo(rotation=rotation, width=1920, height=1080, codec="h264")

    def fake_normalize(path, **_kwargs):
        path.write_bytes(b"after-rotation")
        return orientation_module.NormalizationResult(changed=True, rotation=90, backup_path=None)

    fake_payload = {
        "format": {"tags": {"creation_time": "2026-01-17T18:57:14Z"}},
        "streams": [{"side_data_list": [{"side_data_type": "Display Matrix", "rotation": 90}]}],
    }

    monkeypatch.setattr(media_module, "_read_ffprobe_payload", lambda _path: fake_payload)
    monkeypatch.setattr(media_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(media_module, "normalize_video_orientation_in_place", fake_normalize)

    response = client.post(
        f"/api/projects/{project_name}/media/reconcile",
        json={"dry_run": True, "normalize_orientation": True, "rename_canonical": True},
    )
    assert response.status_code == 200
    assert media_path.read_bytes() == b"before-rotation"

def test_reconcile_media_apply_renames_and_updates_index(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "copy_1234.mov"
    media_path.write_bytes(b"iphone-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    import app.api.media as media_module

    fake_payload = {
        "format": {"tags": {"creation_time": "2026-02-04T11:09:42Z", "com.apple.quicktime.model": "iPhone"}},
        "streams": [{"side_data_list": [{"side_data_type": "Display Matrix", "rotation": 0}]}],
    }
    monkeypatch.setattr(media_module, "_read_ffprobe_payload", lambda _path: fake_payload)

    response = client.post(
        f"/api/projects/{project_name}/media/reconcile",
        json={"dry_run": False, "normalize_orientation": False, "rename_canonical": True},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["renamed"]
    renamed = payload["renamed"][0]
    assert renamed["from"] == "ingest/originals/copy_1234.mov"
    assert renamed["to"].startswith("ingest/originals/P")

    assert not (ingest / "copy_1234.mov").exists()
    assert (env_settings / project_name / renamed["to"]).exists()

    listing = client.get(f"/api/projects/{project_name}/media")
    assert listing.status_code == 200
    rel_paths = {item["relative_path"] for item in listing.json().get("media", [])}
    assert renamed["to"] in rel_paths
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


def test_registry_get_and_resolve_aliases(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "2026-01-17_18-57-14.mp4"
    media_path.write_bytes(b"obs-bytes")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    import app.api.media as media_module

    fake_payload = {
        "format": {"tags": {"creation_time": "2026-01-17T18:57:14Z"}},
        "streams": [{"side_data_list": [{"side_data_type": "Display Matrix", "rotation": 90}]}],
    }
    monkeypatch.setattr(media_module, "_read_ffprobe_payload", lambda _path: fake_payload)

    reconcile = client.post(
        f"/api/projects/{project_name}/media/reconcile",
        json={"dry_run": False, "apply": True, "normalize_orientation": False, "rename_canonical": True},
    )
    assert reconcile.status_code == 200

    listing = client.get(f"/api/projects/{project_name}/media")
    sha = listing.json()["media"][0]["sha256"]

    resolved = client.get(f"/api/registry/{sha}")
    assert resolved.status_code == 200
    payload = resolved.json()
    assert payload["asset_id"] == f"sha256:{sha}"
    assert payload["origin"] == "obs"
    assert payload["orientation"]["rotation"] == 90
    assert payload["orientation"]["detected_from"] == "display_matrix"
    assert any(alias.endswith("2026-01-17_18-57-14.mp4") for alias in payload["aliases"])

    batch = client.post(
        "/api/registry/resolve",
        json={"asset_ids": [f"sha256:{sha}", "sha256:bad"], "fallback_paths": {}},
    )
    assert batch.status_code == 200
    body = batch.json()
    assert f"sha256:{sha}" in body["results"]
    assert "sha256:bad" in body["missing"]


def test_reconcile_canonical_naming_is_deterministic_with_collision(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    first = ingest / "IMG_0001 copy.mov"
    second = ingest / "IMG_0001   copy.mov"
    first.write_bytes(b"iphone-bytes-a")
    second.write_bytes(b"iphone-bytes-b")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200

    import app.api.media as media_module

    fake_payload = {
        "format": {"tags": {"creation_time": "2026-02-04T11:09:42Z", "com.apple.quicktime.model": "iPhone"}},
        "streams": [{"tags": {"rotate": "0"}}],
    }
    monkeypatch.setattr(media_module, "_read_ffprobe_payload", lambda _path: fake_payload)

    apply_one = client.post(
        f"/api/projects/{project_name}/media/reconcile",
        json={"dry_run": False, "apply": True, "normalize_orientation": False, "rename_canonical": True},
    )
    assert apply_one.status_code == 200

    media_paths = sorted(item["relative_path"] for item in client.get(f"/api/projects/{project_name}/media").json()["media"])
    assert len(media_paths) == 2
    assert media_paths[0].startswith("ingest/originals/P")
    assert media_paths[1].startswith("ingest/originals/P")
    assert media_paths[0] != media_paths[1]


def test_reconcile_dry_run_never_mutates_sidecars_or_files(client: TestClient, env_settings: Path, monkeypatch) -> None:
    project_name = _create_project(client)
    ingest = env_settings / project_name / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_path = ingest / "rotate-on-reindex.mov"
    media_path.write_bytes(b"before-rotation")

    reindexed = client.post(f"/api/projects/{project_name}/reindex")
    assert reindexed.status_code == 200
    listing = client.get(f"/api/projects/{project_name}/media").json()["media"][0]
    sha = listing["sha256"]
    sidecar = env_settings / project_name / "ingest" / "_metadata" / f"{sha}.json"
    before_sidecar = sidecar.read_bytes()

    import app.api.media as media_module

    fake_payload = {
        "format": {"tags": {"creation_time": "2026-01-17T18:57:14Z"}},
        "streams": [{"side_data_list": [{"side_data_type": "Display Matrix", "rotation": 90}]}],
    }
    monkeypatch.setattr(media_module, "_read_ffprobe_payload", lambda _path: fake_payload)

    response = client.post(
        f"/api/projects/{project_name}/media/reconcile",
        json={"dry_run": True, "apply": False, "normalize_orientation": True, "rename_canonical": True},
    )
    assert response.status_code == 200
    assert media_path.read_bytes() == b"before-rotation"
    assert sidecar.read_bytes() == before_sidecar

