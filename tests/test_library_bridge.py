from __future__ import annotations

from pathlib import Path

from app.storage.tags_store import asset_id_for_source_relpath


def _register_library_source(client, root: Path, name: str = "library"):
    payload = {
        "name": name,
        "root": str(root),
        "mode": "library",
        "read_only": True,
        "type": "smb",
    }
    response = client.post("/api/sources", json=payload)
    assert response.status_code == 201
    return response.json()

def _stage_scan_and_commit(client, source_name: str, selected_paths: list[str]):
    scan = client.post(f"/api/sources/{source_name}/stage-scan")
    assert scan.status_code == 200
    scan_payload = scan.json()
    scan_id = scan_payload["scan_id"]
    tree = client.get(f"/api/stage-scans/{scan_id}")
    assert tree.status_code == 200
    commit = client.post(
        f"/api/stage-scans/{scan_id}/commit",
        json={"selected_paths": selected_paths},
    )
    assert commit.status_code == 200
    return tree.json(), commit.json()


def test_library_media_listing_and_asset_id(client, env_settings: Path):
    sources_root = env_settings.parent / "sources"
    library_root = sources_root / "library"
    (library_root / "Sub").mkdir(parents=True, exist_ok=True)
    media_path = library_root / "Sub" / "clip.mov"
    media_path.write_bytes(b"library-media")

    _register_library_source(client, library_root, name="library")
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
    library_root = sources_root / "archive"
    (library_root / "Events" / "2024" / "Day1").mkdir(parents=True, exist_ok=True)
    (library_root / "Events" / "2024" / "Day1" / "a.mov").write_bytes(b"a")
    (library_root / "Events" / "2024" / "Day2").mkdir(parents=True, exist_ok=True)
    (library_root / "Events" / "2024" / "Day2" / "b.mov").write_bytes(b"b")

    _register_library_source(client, library_root, name="archive")
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

    _register_library_source(client, library_root, name="vault")

    tree_payload, commit_payload = _stage_scan_and_commit(client, "vault", ["Keep"])
    assert tree_payload["tree"]["path"] == "."
    assert "Keep" in commit_payload["committed"]

    listing = client.get("/api/sources/vault/media")
    assert listing.status_code == 200
    payload = listing.json()
    rel_paths = {item["relative_path"] for item in payload["media"]}
    assert "Keep/clip.mov" in rel_paths
    assert "Skip/clip.mov" not in rel_paths
