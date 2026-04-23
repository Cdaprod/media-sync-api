from __future__ import annotations

import json
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
    assert asset["download_url"].startswith(f"/media/{project_name}/download/")
    assert payload.get("jobs") == []


def test_library_snapshot_rejects_unsupported_scope(client: TestClient) -> None:
    response = client.get("/api/library?scope=unsupported")
    assert response.status_code == 400
    assert "scope must be 'all' or 'project'" in response.json().get("detail", "")


def test_library_snapshot_rejects_project_scope_without_project(client: TestClient) -> None:
    response = client.get("/api/library?scope=project")
    assert response.status_code == 400
    assert "project is required" in response.json().get("detail", "")


def test_library_snapshot_scope_project_returns_target_project_only(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client, "scoped-demo")
    media_path = env_settings / project_name / "ingest" / "originals" / "sample.mov"
    media_path.parent.mkdir(parents=True, exist_ok=True)
    media_path.write_bytes(b"media-bytes")
    reindex_response = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_response.status_code == 200

    response = client.get(f"/api/library?scope=project&project={project_name}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["scope"] == "project"
    assert len(payload["projects"]) == 1
    assert payload["projects"][0]["name"] == project_name
    assert len(payload["sources"]) == 1
    assert payload["assets"]
    assert all(item["project_name"] == project_name for item in payload["assets"])


def test_library_snapshot_scope_all_includes_disabled_sources(client: TestClient) -> None:
    register_response = client.post("/api/sources", json={"name": "archive", "root": "/tmp", "type": "local"})
    assert register_response.status_code == 201
    toggle_response = client.post("/api/sources/archive/toggle?enabled=false")
    assert toggle_response.status_code == 200

    response = client.get("/api/library?scope=all")
    assert response.status_code == 200
    payload = response.json()
    disabled = [source for source in payload["sources"] if source["name"] == "archive"]
    assert disabled
    assert disabled[0]["enabled"] is False


def test_library_snapshot_skips_invalid_relative_paths(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client, "path-guard")
    media_path = env_settings / project_name / "ingest" / "originals" / "sample.mov"
    media_path.parent.mkdir(parents=True, exist_ok=True)
    media_path.write_bytes(b"media-bytes")
    reindex_response = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_response.status_code == 200

    index_path = env_settings / project_name / "index.json"
    payload = json.loads(index_path.read_text())
    payload.setdefault("files", []).append({"relative_path": "../escape.mov", "sha256": "bad"})
    index_path.write_text(json.dumps(payload))

    response = client.get("/api/library?scope=all")
    assert response.status_code == 200
    assets = response.json()["assets"]
    assert not any(item.get("relative_path") == "../escape.mov" for item in assets)


def test_library_snapshot_emits_thumbnail_urls_only_for_thumbable_assets(client: TestClient, env_settings: Path) -> None:
    project_name = _create_project(client, "thumb-guard")
    video_path = env_settings / project_name / "ingest" / "originals" / "sample.mov"
    audio_path = env_settings / project_name / "ingest" / "originals" / "notes.mp3"
    video_path.parent.mkdir(parents=True, exist_ok=True)
    video_path.write_bytes(b"video-bytes")
    audio_path.write_bytes(b"audio-bytes")
    reindex_response = client.post(f"/api/projects/{project_name}/reindex")
    assert reindex_response.status_code == 200

    response = client.get("/api/library?scope=all")
    assert response.status_code == 200
    assets = [item for item in response.json()["assets"] if item.get("project_name") == project_name]
    by_path = {item["relative_path"]: item for item in assets}

    assert "ingest/originals/sample.mov" in by_path
    assert "ingest/originals/notes.mp3" in by_path

    thumbable = by_path["ingest/originals/sample.mov"]
    non_thumbable = by_path["ingest/originals/notes.mp3"]

    assert thumbable.get("thumb_url")
    assert thumbable.get("thumbnail_url")
    assert "thumb_url" not in non_thumbable
    assert "thumbnail_url" not in non_thumbable


def test_library_snapshot_scope_all_skips_hidden_runtime_directories(client: TestClient, env_settings: Path) -> None:
    hidden_project = env_settings / ".runtime"
    hidden_project.mkdir(parents=True, exist_ok=True)
    visible_project = _create_project(client, "visible-project")

    response = client.get("/api/library?scope=all")
    assert response.status_code == 200
    names = [project["name"] for project in response.json()["projects"]]

    assert ".runtime" not in names
    assert visible_project in names
