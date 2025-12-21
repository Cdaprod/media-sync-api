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
