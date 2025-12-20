from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture()
def project_root(env_settings: Path) -> Path:
    return env_settings


def test_create_and_list_project(client, project_root: Path):
    create = client.post("/api/projects", json={"name": "demo", "notes": "first"})
    assert create.status_code == 201

    listing = client.get("/api/projects")
    payload = listing.json()
    assert any(project["name"] == "demo" and project["index_exists"] for project in payload)

    index_path = project_root / "demo" / "index.json"
    assert index_path.exists()
    index = json.loads(index_path.read_text())
    assert index.get("project") == "demo"


def test_get_project_details(client):
    create = client.post("/api/projects", json={"name": "demo"})
    assert create.status_code == 201

    response = client.get("/api/projects/demo")
    assert response.status_code == 200
    assert response.json().get("project") == "demo"


def test_invalid_project_names_rejected(client):
    for bad in ["../oops", "bad name", "slash/inside"]:
        resp = client.post("/api/projects", json={"name": bad})
        assert resp.status_code == 400
