from __future__ import annotations

import importlib
import json
from pathlib import Path

import importlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.storage.sources import SourceRegistry


@pytest.fixture()
def project_root(env_settings: Path) -> Path:
    return env_settings


def test_create_and_list_project(client, project_root: Path):
    create = client.post("/api/projects", json={"name": "demo", "notes": "first"})
    assert create.status_code == 201
    project_name = create.json()["name"]

    listing = client.get("/api/projects")
    payload = listing.json()
    assert any(
        project["name"] == project_name
        and project["index_exists"]
        and project["source"] == "primary"
        for project in payload
    )

    index_path = project_root / project_name / "index.json"
    assert index_path.exists()
    index = json.loads(index_path.read_text())
    assert index.get("project") == project_name


def test_get_project_details(client):
    create = client.post("/api/projects", json={"name": "demo"})
    assert create.status_code == 201
    project_name = create.json()["name"]

    response = client.get(f"/api/projects/{project_name}")
    assert response.status_code == 200
    assert response.json().get("project") == project_name


def test_invalid_project_names_rejected(client):
    for bad in ["../oops", "bad name", "slash/inside"]:
        resp = client.post("/api/projects", json={"name": bad})
        assert resp.status_code == 400


def test_projects_include_upload_url(client):
    create = client.post("/api/projects", json={"name": "demo"})
    assert create.status_code == 201
    created_payload = create.json()
    project_name = created_payload["name"]
    assert created_payload["upload_url"].startswith(f"/api/projects/{project_name}/upload")

    listing = client.get("/api/projects").json()
    project = next(p for p in listing if p["name"] == project_name)
    assert project["upload_url"].startswith(f"/api/projects/{project_name}/upload")
    assert f"source={project['source']}" in project["upload_url"]


def test_auto_sequences_project_names(client, project_root: Path):
    first = client.post("/api/projects", json={"name": "Alpha"})
    second = client.post("/api/projects", json={"name": "Beta"})

    assert first.status_code == 201
    assert second.status_code == 201

    first_name = first.json()["name"]
    second_name = second.json()["name"]

    assert first_name.startswith("P1-")
    assert second_name.startswith("P2-")
    assert (project_root / first_name).exists()
    assert (project_root / second_name).exists()


def test_bootstrap_indexes_existing_project(env_settings: Path, monkeypatch: pytest.MonkeyPatch):
    project_dir = env_settings / "P1-Existing"
    ingest = project_dir / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    manual_file = ingest / "clip.mov"
    manual_file.write_bytes(b"manual")

    module = importlib.import_module("app.main")
    importlib.reload(module)
    app = module.create_app()
    client = TestClient(app)

    response = client.get("/api/projects")
    assert response.status_code == 200
    index = json.loads((project_dir / "index.json").read_text())
    assert index["project"] == "P1-Existing"
    assert any(entry["relative_path"] == "ingest/originals/clip.mov" for entry in index["files"])


def test_lists_projects_from_multiple_sources(client, env_settings: Path, tmp_path: Path):
    created = client.post("/api/projects", json={"name": "demo"})
    assert created.status_code == 201

    secondary_root = tmp_path / "nas"
    ingest = secondary_root / "P99-Other" / "ingest" / "originals"
    ingest.mkdir(parents=True)
    (ingest / "clip.mov").write_bytes(b"nas")

    registry = SourceRegistry(env_settings)
    registry.upsert(name="nas", root=secondary_root)

    all_projects = client.get("/api/projects").json()
    assert any(project["source"] == "primary" for project in all_projects)
    assert any(project["source"] == "nas" for project in all_projects)

    filtered = client.get("/api/projects", params={"source": "nas"}).json()
    assert all(project["source"] == "nas" for project in filtered)
