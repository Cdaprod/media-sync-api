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


def test_reindex_does_not_relocate_thumbnails(client, env_settings: Path) -> None:
    created = client.post("/api/projects", json={"name": "thumb-check"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    project_dir = env_settings / project_name
    thumb_dir = project_dir / "ingest" / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / "keep.jpg"
    thumb_path.write_bytes(b"thumb-cache")

    response = client.post(f"/api/projects/{project_name}/reindex")
    assert response.status_code == 200

    assert thumb_path.exists()
    assert not (project_dir / "ingest" / "originals" / "keep.jpg").exists()


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
