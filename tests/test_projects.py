from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ["PROJECT_ROOT"] = "/tmp/media-sync-test"

from app.main import app  # noqa: E402

client = TestClient(app)


def setup_function():
    root = Path(os.environ["PROJECT_ROOT"])
    if root.exists():
        for child in root.rglob("*"):
            if child.is_file():
                child.unlink()
        for child in sorted(root.glob("**/*"), reverse=True):
            if child.is_dir():
                child.rmdir()
    root.mkdir(parents=True, exist_ok=True)


def test_create_and_list_project(tmp_path):
    response = client.post("/api/projects", json={"name": "demo", "notes": "first"})
    assert response.status_code == 201
    list_response = client.get("/api/projects")
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload[0]["name"] == "demo"
    assert payload[0]["index_exists"] is True


def test_upload_and_dedupe(tmp_path):
    client.post("/api/projects", json={"name": "demo"})
    file_content = b"example-data"
    resp = client.post(
        "/api/projects/demo/upload",
        files={"file": ("sample.mov", file_content, "video/quicktime")},
    )
    assert resp.status_code == 200
    first_path = resp.json()["path"]

    resp_dupe = client.post(
        "/api/projects/demo/upload",
        files={"file": ("sample.mov", file_content, "video/quicktime")},
    )
    assert resp_dupe.status_code == 200
    assert resp_dupe.json()["status"] == "duplicate"
    assert resp_dupe.json()["path"] == first_path

    index_resp = client.get("/api/projects/demo")
    assert index_resp.status_code == 200
    index_data = index_resp.json()
    assert len(index_data["files"]) == 1


def test_reindex_detects_existing(tmp_path):
    client.post("/api/projects", json={"name": "demo"})
    root = Path(os.environ["PROJECT_ROOT"])
    project = root / "demo"
    ingest = project / "ingest/originals"
    ingest.mkdir(parents=True, exist_ok=True)
    media_file = ingest / "manual.mov"
    media_file.write_bytes(b"manual")

    reindex_resp = client.post("/api/projects/demo/reindex")
    assert reindex_resp.status_code == 200
    index_data = client.get("/api/projects/demo").json()
    assert any(entry["relative_path"] == "ingest/originals/manual.mov" for entry in index_data["files"])
