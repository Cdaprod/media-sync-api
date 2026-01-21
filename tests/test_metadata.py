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
