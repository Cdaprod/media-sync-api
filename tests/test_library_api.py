from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def _create_project(client: TestClient, name: str) -> str:
    created = client.post("/api/projects", json={"name": name})
    assert created.status_code == 201
    return created.json()["name"]


def test_library_snapshot_returns_aggregate_payload(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client, "library-demo")
    media_path = env_settings / project_name / "ingest" / "originals" / "sample.mov"
    media_path.parent.mkdir(parents=True, exist_ok=True)
    media_path.write_bytes(b"media-bytes")
    reindex_response = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_response.status_code == 200

    response = client.get("/api/library?scope=all")
    assert response.status_code == 200
    payload = response.json()

    assert payload["scope"] == "all"
    assert isinstance(payload.get("generated_at"), str)
    assert isinstance(payload.get("sources"), list)
    assert any(project["name"] == project_name for project in payload.get("projects", []))
    matching_assets = [item for item in payload.get("assets", []) if item.get("project_name") == project_name]
    assert len(matching_assets) == 1
    asset = matching_assets[0]
    assert asset["relative_path"] == "ingest/originals/sample.mov"
    assert asset["stream_url"].startswith(f"/media/{project_name}/")
    assert asset["download_url"].startswith(f"/api/projects/{project_name}/media/file")
    assert payload.get("jobs") == []


def test_library_snapshot_rejects_unsupported_scope(client: TestClient) -> None:
    response = client.get("/api/library?scope=project")
    assert response.status_code == 400
    assert "scope must be 'all'" in response.json().get("detail", "")
