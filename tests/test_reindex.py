from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from app.storage.dedupe import get_recorded_paths


def test_reindex_handles_new_and_missing_files(client, env_settings: Path):
    created = client.post("/api/projects", json={"name": "demo"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    project_dir = env_settings / project_name
    ingest_dir = project_dir / "ingest" / "originals"
    ingest_dir.mkdir(parents=True, exist_ok=True)
    manual_file = ingest_dir / "manual.mov"
    manual_file.write_bytes(b"manual-bytes")

    reindex_response = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_response.status_code == 200
    index_data = json.loads((project_dir / "index.json").read_text())
    assert any(entry["relative_path"] == "ingest/originals/manual.mov" for entry in index_data["files"])

    db_path = project_dir / "_manifest" / "manifest.db"
    records = get_recorded_paths(db_path)
    assert any(path == "ingest/originals/manual.mov" for path in records.values())

    manual_file.unlink()
    reindex_again = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_again.status_code == 200
    updated_index = json.loads((project_dir / "index.json").read_text())
    assert not any(entry["relative_path"] == "ingest/originals/manual.mov" for entry in updated_index.get("files", []))
    assert updated_index["counts"]["removed_missing_records"] >= 1

    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT relative_path FROM files").fetchall()
    assert all(row[0] != "ingest/originals/manual.mov" for row in rows)


def test_reindex_allows_get_and_indexes_manual_moves(client, env_settings: Path):
    created = client.post("/api/projects", json={"name": "manual-move"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    project_dir = env_settings / project_name
    ingest_dir = project_dir / "ingest" / "originals"
    ingest_dir.mkdir(parents=True, exist_ok=True)
    moved_file = ingest_dir / "relocated.mp4"
    moved_file.write_bytes(b"relocated bytes")

    response = client.get(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200

    index_data = json.loads((project_dir / "index.json").read_text())
    assert any(entry["relative_path"] == "ingest/originals/relocated.mp4" for entry in index_data["files"])


def test_reindex_skips_temporary_artifacts(client, env_settings: Path):
    created = client.post("/api/projects", json={"name": "temp-skip"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    ingest_dir = env_settings / project_name / "ingest" / "originals"
    ingest_dir.mkdir(parents=True, exist_ok=True)
    temp_file = ingest_dir / ".tmp.rotate-test.mov"
    temp_file.write_bytes(b"temp-bytes")

    response = client.post(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200
    payload = response.json()
    assert payload["indexed"] == 0

    index_data = json.loads((env_settings / project_name / "index.json").read_text())
    assert not any(entry["relative_path"] == "ingest/originals/.tmp.rotate-test.mov" for entry in index_data["files"])


def test_reindex_normalizes_rotated_video_before_hashing(client, env_settings: Path, monkeypatch):
    created = client.post("/api/projects", json={"name": "normalize-on-reindex"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    ingest_dir = env_settings / project_name / "ingest" / "originals"
    ingest_dir.mkdir(parents=True, exist_ok=True)
    video = ingest_dir / "rotated.mov"
    video.write_bytes(b"before-normalize")

    import app.storage.orientation as orientation_module
    import app.storage.reindex as reindex_module

    def fake_probe(path, **_kwargs):
        data = path.read_bytes()
        rotation = 90 if data == b"before-normalize" else 0
        return orientation_module.ProbeVideo(rotation=rotation, width=1920, height=1080, codec="h264")

    def fake_normalize(path, **_kwargs):
        path.write_bytes(b"after-normalize")
        return orientation_module.NormalizationResult(changed=True, rotation=90, backup_path=None)

    monkeypatch.setattr(reindex_module, "ffprobe_video", fake_probe)
    monkeypatch.setattr(reindex_module, "normalize_video_orientation_in_place", fake_normalize)

    response = client.post(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200
    payload = response.json()
    assert payload["normalized"] == 1
    assert payload["normalization_failed"] == 0

    index_data = json.loads((env_settings / project_name / "index.json").read_text())
    file_entry = next(entry for entry in index_data["files"] if entry["relative_path"] == "ingest/originals/rotated.mov")
    from app.storage.dedupe import compute_sha256_from_path
    assert file_entry["sha256"] == compute_sha256_from_path(video)
    assert video.read_bytes() == b"after-normalize"



def test_reindex_preserves_shared_sha_metadata_when_one_path_changes(client, env_settings: Path):
    created = client.post("/api/projects", json={"name": "shared-sha"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    project_dir = env_settings / project_name
    ingest_dir = project_dir / "ingest" / "originals"
    ingest_dir.mkdir(parents=True, exist_ok=True)
    file_one = ingest_dir / "dup-a.mov"
    file_two = ingest_dir / "dup-b.mov"
    file_one.write_bytes(b"same-bytes")
    file_two.write_bytes(b"same-bytes")

    reindex_response = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_response.status_code == 200

    index_data = json.loads((project_dir / "index.json").read_text())
    sha = next(entry["sha256"] for entry in index_data["files"] if entry["relative_path"] == "ingest/originals/dup-a.mov")
    sidecar = project_dir / "ingest" / "_metadata" / f"{sha}.json"
    assert sidecar.exists()

    file_one.write_bytes(b"changed-bytes")

    reindex_again = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_again.status_code == 200

    # dup-b still references the original sha, so its metadata sidecar must remain.
    assert sidecar.exists()

    refreshed = json.loads((project_dir / "index.json").read_text())
    dup_b = next(entry for entry in refreshed["files"] if entry["relative_path"] == "ingest/originals/dup-b.mov")
    assert dup_b["sha256"] == sha

def test_root_reindex_scans_all_sources(client, env_settings: Path):
    primary = client.post("/api/projects", json={"name": "bulk-primary"})
    assert primary.status_code == 201
    primary_name = primary.json()["name"]

    secondary_root = env_settings.parent / "secondary-projects"
    secondary_root.mkdir(parents=True, exist_ok=True)
    secondary_source = client.post(
        "/api/sources",
        json={"name": "secondary", "root": str(secondary_root), "type": "local"},
    )
    assert secondary_source.status_code == 201

    secondary = client.post(
        "/api/projects?source=secondary",
        json={"name": "bulk-secondary"},
    )
    assert secondary.status_code == 201
    secondary_name = secondary.json()["name"]

    primary_dir = env_settings / primary_name / "ingest" / "originals"
    secondary_dir = secondary_root / secondary_name / "ingest" / "originals"
    primary_dir.mkdir(parents=True, exist_ok=True)
    secondary_dir.mkdir(parents=True, exist_ok=True)
    (primary_dir / "manual.mov").write_bytes(b"primary-bytes")
    (secondary_dir / "manual.mov").write_bytes(b"secondary-bytes")

    response = client.post("/reindex")
    assert response.status_code == 200
    payload = response.json()
    assert payload["indexed_projects"] >= 2
    assert payload["indexed_files"] >= 2

    primary_index = json.loads((env_settings / primary_name / "index.json").read_text())
    assert any(entry["relative_path"] == "ingest/originals/manual.mov" for entry in primary_index["files"])

    secondary_index = json.loads((secondary_root / secondary_name / "index.json").read_text())
    assert any(entry["relative_path"] == "ingest/originals/manual.mov" for entry in secondary_index["files"])
