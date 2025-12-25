from __future__ import annotations

from pathlib import Path

from app.storage.tags_store import asset_id_for_source_relpath


def _stage_scan_and_commit(client, junction_name: str, selected_paths: list[str]):
    scan = client.post(
        "/api/bridge/stage-scan",
        json={"junction_name": junction_name},
    )
    assert scan.status_code == 200
    scan_payload = scan.json()
    commit = client.post(
        "/api/bridge/commit",
        json={
            "junction_name": junction_name,
            "selected_roots": selected_paths,
            "scan_id": scan_payload["scan_id"],
        },
    )
    assert commit.status_code == 200
    return scan_payload, commit.json()


def test_library_media_listing_and_asset_id(client, env_settings: Path):
    sources_root = env_settings.parent / "sources"
    library_root = sources_root / "library" / "Sub"
    library_root.mkdir(parents=True, exist_ok=True)
    (library_root / "clip.mov").write_bytes(b"library-media")

    candidates = client.get("/api/bridge/candidates")
    assert candidates.status_code == 200
    assert any(item["name"] == "library" for item in candidates.json()["candidates"])

    _stage_scan_and_commit(client, "library", ["Sub"])

    listing = client.get("/api/sources/library/media")
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["source"] == "library"
    assert payload["media"]
    item = payload["media"][0]
    assert item["relative_path"] == "Sub/clip.mov"
    assert item["stream_url"].startswith("/media/source/library/")
    expected = asset_id_for_source_relpath("library", "Sub/clip.mov")
    assert item["asset_id"] == expected


def test_bucket_discovery_and_listing(client, env_settings: Path):
    sources_root = env_settings.parent / "sources"
    library_root = sources_root / "archive" / "Events" / "2024"
    library_root.mkdir(parents=True, exist_ok=True)
    (library_root / "Day1").mkdir(parents=True, exist_ok=True)
    (library_root / "Day1" / "a.mov").write_bytes(b"a")
    (library_root / "Day2").mkdir(parents=True, exist_ok=True)
    (library_root / "Day2" / "b.mov").write_bytes(b"b")

    _stage_scan_and_commit(client, "archive", ["Events"])

    discovered = client.post("/api/sources/archive/discover-buckets")
    assert discovered.status_code == 200
    payload = discovered.json()
    assert payload["count"] > 0
    bucket_id = payload["buckets"][0]["bucket_id"]

    listing = client.get(f"/api/buckets/{bucket_id}/media")
    assert listing.status_code == 200
    media_payload = listing.json()
    assert media_payload["media"]


def test_stage_scan_commit_limits_library_root(client, env_settings: Path):
    sources_root = env_settings.parent / "sources"
    library_root = sources_root / "vault"
    (library_root / "Keep").mkdir(parents=True, exist_ok=True)
    (library_root / "Keep" / "clip.mov").write_bytes(b"keep")
    (library_root / "Skip").mkdir(parents=True, exist_ok=True)
    (library_root / "Skip" / "clip.mov").write_bytes(b"skip")

    scan_payload, commit_payload = _stage_scan_and_commit(client, "vault", ["Keep"])
    assert scan_payload["tree"]["path"] == "."
    assert commit_payload["source"] == "vault"

    listing = client.get("/api/sources/vault/media")
    assert listing.status_code == 200
    payload = listing.json()
    rel_paths = {item["relative_path"] for item in payload["media"]}
    assert "Keep/clip.mov" in rel_paths
    assert "Skip/clip.mov" not in rel_paths


def test_bridge_rejects_file_uploads(client):
    response = client.post(
        "/api/bridge/stage-scan",
        files={"file": ("clip.mov", b"data")},
    )
    assert response.status_code == 400
    assert "Bridge registers server-visible paths" in response.json()["detail"]
