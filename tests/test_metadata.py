from __future__ import annotations

import json
from pathlib import Path


def test_metadata_sidecar_created_on_upload(client, env_settings: Path) -> None:
    created = client.post("/api/projects", json={"name": "demo"})
    project_name = created.json()["name"]

    payload = b"video-bytes"
    response = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("clip.mp4", payload, "video/mp4")},
    )
    assert response.status_code == 200

    index_path = env_settings / project_name / "index.json"
    index = json.loads(index_path.read_text())
    entry = index["files"][0]
    sha = entry["sha256"]
    metadata_path = env_settings / project_name / "ingest" / "_metadata" / f"{sha}.json"

    assert metadata_path.exists()
    metadata = json.loads(metadata_path.read_text())
    assert metadata["sha256"] == sha
    assert metadata["relative"] == entry["relative_path"]
    assert metadata["kind"] == "video"


def test_metadata_created_on_reindex(client, env_settings: Path) -> None:
    created = client.post("/api/projects", json={"name": "demo"})
    project_name = created.json()["name"]

    project_root = env_settings / project_name
    ingest = project_root / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)

    file_path = ingest / "photo.jpg"
    file_path.write_bytes(b"image-bytes")

    response = client.get(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200

    index_path = project_root / "index.json"
    index = json.loads(index_path.read_text())
    entry = index["files"][0]
    sha = entry["sha256"]
    metadata_path = project_root / "ingest" / "_metadata" / f"{sha}.json"

    assert metadata_path.exists()
    metadata = json.loads(metadata_path.read_text())
    assert metadata["kind"] == "image"
    assert metadata["relative"] == entry["relative_path"]


def test_metadata_tags_endpoint(client, env_settings: Path) -> None:
    created = client.post("/api/projects", json={"name": "demo"})
    project_name = created.json()["name"]

    payload = b"video-bytes"
    upload = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("clip.mp4", payload, "video/mp4")},
    )
    rel_path = upload.json()["path"]

    response = client.post(
        f"/api/projects/{project_name}/media/tags",
        json={
            "relative_paths": [rel_path],
            "add_tags": ["Hero", "broll"],
        },
    )
    assert response.status_code == 200

    index_path = env_settings / project_name / "index.json"
    index = json.loads(index_path.read_text())
    entry = index["files"][0]
    sha = entry["sha256"]
    metadata_path = env_settings / project_name / "ingest" / "_metadata" / f"{sha}.json"
    metadata = json.loads(metadata_path.read_text())
    assert metadata["tags"]["manual"] == ["broll", "hero"]

    response = client.post(
        f"/api/projects/{project_name}/media/tags",
        json={
            "relative_paths": [rel_path],
            "remove_tags": ["hero"],
        },
    )
    assert response.status_code == 200
    metadata = json.loads(metadata_path.read_text())
    assert metadata["tags"]["manual"] == ["broll"]


def test_delete_keeps_metadata_for_duplicate_sha(client, env_settings: Path) -> None:
    created = client.post("/api/projects", json={"name": "demo"})
    project_name = created.json()["name"]

    payload = b"video-bytes"
    upload = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("clip.mp4", payload, "video/mp4")},
    )
    rel_path = upload.json()["path"]
    stored_path = env_settings / project_name / rel_path

    duplicate_path = stored_path.with_name("clip-copy.mp4")
    duplicate_path.write_bytes(stored_path.read_bytes())

    reindex = client.get(f"/api/projects/{project_name}/reindex")
    assert reindex.status_code == 200

    index_path = env_settings / project_name / "index.json"
    index = json.loads(index_path.read_text())
    entries = [entry for entry in index["files"] if entry["sha256"] == index["files"][0]["sha256"]]
    assert len(entries) == 2
    sha = entries[0]["sha256"]
    metadata_path = env_settings / project_name / "ingest" / "_metadata" / f"{sha}.json"
    assert metadata_path.exists()

    first_delete = client.post(
        f"/api/projects/{project_name}/media/delete",
        json={"relative_paths": [entries[0]["relative_path"]]},
    )
    assert first_delete.status_code == 200
    assert metadata_path.exists()

    second_delete = client.post(
        f"/api/projects/{project_name}/media/delete",
        json={"relative_paths": [entries[1]["relative_path"]]},
    )
    assert second_delete.status_code == 200
    assert not metadata_path.exists()
