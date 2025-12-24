from __future__ import annotations

import importlib
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import config


def _build_ai_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> tuple[TestClient, Path]:
    root = tmp_path / "projects"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_MAX_UPLOAD_MB", "5")
    monkeypatch.setenv("MEDIA_SYNC_CORS_ORIGINS", "*")
    monkeypatch.setenv("MEDIA_SYNC_AI_TAGGING_ENABLED", "1")
    monkeypatch.setenv("MEDIA_SYNC_AI_TAGGING_AUTO", "0")
    monkeypatch.setenv("MEDIA_SYNC_WHISPERX_URL", "http://whisperx.local/transcribe")
    monkeypatch.setenv("MEDIA_SYNC_DEIM_URL", "http://deim.local/tag")
    config.reset_settings_cache()
    module = importlib.import_module("app.main")
    importlib.reload(module)
    from app import ai_tagging

    def _client_factory(timeout_s: float) -> httpx.Client:
        return httpx.Client(transport=transport, timeout=timeout_s)

    monkeypatch.setattr(ai_tagging, "create_http_client", _client_factory)
    return TestClient(module.create_app()), root


def test_ai_tags_disabled(client: TestClient, env_settings: Path):
    created = client.post("/api/projects", json={"name": "AI-Disabled"})
    assert created.status_code == 201
    project = created.json()["name"]

    project_dir = env_settings / project / "ingest/originals"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "clip.mov").write_bytes(b"demo")
    client.get(f"/api/projects/{project}/reindex")

    response = client.post(
        f"/api/projects/{project}/assets/ai-tags",
        params={"rel_path": "ingest/originals/clip.mov"},
        json={"force": False},
    )
    assert response.status_code == 503


def test_ai_tagging_flow(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "http://whisperx.local/transcribe":
            return httpx.Response(200, json={"text": "Interview about the ocean"})
        if str(request.url) == "http://deim.local/tag":
            return httpx.Response(200, json={"tags": ["Interview", "Ocean", "B-roll"]})
        return httpx.Response(404, json={"detail": "unknown"})

    transport = httpx.MockTransport(handler)
    client, root = _build_ai_client(tmp_path, monkeypatch, transport)

    created = client.post("/api/projects", json={"name": "AI-Demo"})
    assert created.status_code == 201
    project = created.json()["name"]

    project_dir = root / project / "ingest/originals"
    project_dir.mkdir(parents=True, exist_ok=True)
    media_path = project_dir / "clip.mp4"
    media_path.write_bytes(b"demo")

    indexed = client.get(f"/api/projects/{project}/reindex")
    assert indexed.status_code == 200

    tagged = client.post(
        f"/api/projects/{project}/assets/ai-tags",
        params={"rel_path": "ingest/originals/clip.mp4"},
        json={"force": True},
    )
    assert tagged.status_code == 200
    payload = tagged.json()
    assert payload["status"] == "complete"
    assert payload["tags"] == ["b-roll", "interview", "ocean"]

    listing = client.get(f"/api/projects/{project}/media")
    assert listing.status_code == 200
    media = listing.json()["media"]
    assert media[0]["tags"] == ["b-roll", "interview", "ocean"]
    assert media[0]["tag_source_counts"]["ai"] == 3
