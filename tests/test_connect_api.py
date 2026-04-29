from __future__ import annotations

import importlib

from fastapi.testclient import TestClient

from app import config

def test_connect_plain_text_manifest(client):
    response = client.get("/connect", headers={"Accept": "text/plain"})
    assert response.status_code == 200
    body = response.text
    assert "media-sync-api connect" in body
    assert "register:" in body
    assert "ingest_claims:" in body


def test_connect_json_manifest(client):
    response = client.get("/connect", headers={"Accept": "application/json"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "media-sync-api"
    assert payload["authority"]["role"] in {"authority", "runner"}
    assert "register" in payload["endpoints"]
    assert "ingest_claims" in payload["endpoints"]
    assert isinstance(payload["source_records"], list)


def test_connect_html_manifest(client):
    response = client.get("/connect", headers={"Accept": "text/html"})
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<title>media-sync-api connect</title>" in response.text


def test_connect_register_upserts_node_and_returns_source_bearing_participant(client):
    payload = {
        "node_id": "capture-rpi5-1",
        "label": "RPI5 Capture Node",
        "base_url": "http://192.168.0.21:8787",
        "roles": ["runner", "capture"],
        "capabilities": ["can_proxy_streams", "can_record_local_media"],
        "source_name": "camera-primary",
        "source_kind": "capture",
        "source_authority": "runner-local",
        "advertised_source_kinds": ["capture"],
        "status": "healthy",
        "metadata": {
            "device_class": "rpi5",
            "transport_hint": "ws",
        },
    }

    response = client.post("/connect/register", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["ok"] is True
    assert body["registered_node"]["node_id"] == "capture-rpi5-1"
    assert body["registered_node"]["source_name"] == "camera-primary"
    assert body["source_record"]["name"] == "camera-primary"
    assert body["source_record"]["kind"] == "capture"
    assert body["source_record"]["authority"] == "runner-local"
    assert body["source_record"]["owner_node_id"] == "capture-rpi5-1"
    assert body["device_url"] == "/connect/device?node_id=capture-rpi5-1"
    assert "Ingest claims are still separate" in body["message"]
    assert body["auth"]["type"] == "bearer"
    assert body["auth"]["token"]
    assert body["auth"]["token_preview"]
    assert body["auth"]["shown_once"] is True
    assert "node:heartbeat" in body["auth"]["scopes"]
    assert body["registered_node"]["auth_type"] == "bearer"
    assert body["registered_node"]["token_preview"]
    assert "token_hash" not in body["registered_node"]

    nodes = client.get("/api/nodes").json()
    assert any(node["node_id"] == "capture-rpi5-1" for node in nodes)
    target_node = next(node for node in nodes if node["node_id"] == "capture-rpi5-1")
    assert target_node.get("token_preview")
    assert target_node.get("auth_scopes")
    assert "token_hash" not in target_node
    assert "token" not in target_node

    manifest = client.get("/connect", headers={"Accept": "application/json"}).json()
    sources = manifest["source_records"]
    assert any(
        source["name"] == "camera-primary" and source["owner_node_id"] == "capture-rpi5-1"
        for source in sources
    )


def test_connect_register_rejects_invalid_node_id(client):
    payload = {
        "node_id": "../bad",
        "label": "Bad Node",
        "base_url": "http://192.168.0.22:8787",
        "source_name": "bad-primary",
    }
    response = client.post("/connect/register", json=payload)
    assert response.status_code == 400
    assert "Node id" in response.json()["detail"]


def test_connect_register_accepts_session_node_with_null_base_url(client):
    payload = {
        "node_id": "ipad-session-node",
        "label": "iPad Session Node",
        "base_url": None,
        "roles": ["runner", "capture"],
        "source_name": "camera-primary",
        "source_kind": "capture",
        "metadata": {
            "transport_hint": "session",
            "session_node": "true",
            "browser_push": "true",
        },
    }
    response = client.post("/connect/register", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["registered_node"]["base_url"] is None


def test_connect_register_normalizes_empty_base_url_to_null_for_session_node(client):
    payload = {
        "node_id": "iphone-session-node",
        "label": "iPhone Session Node",
        "base_url": "",
        "roles": ["runner", "capture"],
        "source_name": "camera-primary",
        "source_kind": "capture",
        "metadata": {
            "transport_hint": "session",
            "session_node": "true",
            "browser_push": "true",
        },
    }
    response = client.post("/connect/register", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["registered_node"]["base_url"] is None


def test_connect_register_rejects_missing_base_url_for_non_session_node(client):
    payload = {
        "node_id": "runner-non-session",
        "label": "Runner Non Session",
        "base_url": "",
        "roles": ["runner"],
        "source_name": "primary",
        "source_kind": "filesystem",
        "metadata": {},
    }
    response = client.post("/connect/register", json=payload)
    assert response.status_code == 400
    assert "base_url" in response.json()["detail"]


def test_connect_manifest_prefers_configured_authority_origin(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_TEMP_ROOT", str(tmp_path / "temp"))
    monkeypatch.setenv("MEDIA_SYNC_AUTO_REINDEX", "0")
    monkeypatch.setenv("MEDIA_SYNC_AUTHORITY_ORIGIN", "https://cda-desktop.local")
    monkeypatch.setenv("MEDIA_SYNC_PUBLIC_ORIGIN", "https://public.example")
    config.reset_settings_cache()
    module = importlib.import_module("app.main")
    importlib.reload(module)
    application = module.create_app()
    with TestClient(application) as test_client:
        payload = test_client.get("/connect", headers={"Accept": "application/json"}).json()
    assert payload["authority"]["base_url"] == "https://cda-desktop.local"
    assert payload["endpoints"]["self"] == "https://cda-desktop.local/connect"
    assert payload["endpoints"]["register"] == "https://cda-desktop.local/connect/register"


def test_connect_register_prefers_configured_authority_origin_for_device_url(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_TEMP_ROOT", str(tmp_path / "temp"))
    monkeypatch.setenv("MEDIA_SYNC_AUTO_REINDEX", "0")
    monkeypatch.setenv("MEDIA_SYNC_AUTHORITY_ORIGIN", "https://cda-desktop.local")
    config.reset_settings_cache()
    module = importlib.import_module("app.main")
    importlib.reload(module)
    application = module.create_app()

    payload = {
        "node_id": "capture-rpi5-configured-origin",
        "label": "Configured Origin Node",
        "base_url": "http://192.168.0.22:8787",
        "roles": ["runner", "capture"],
        "source_name": "camera-primary",
        "source_kind": "capture",
    }

    with TestClient(application) as test_client:
        response = test_client.post("/connect/register", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["authority"]["base_url"] == "https://cda-desktop.local"
    assert body["device_url"] == "https://cda-desktop.local/connect/device?node_id=capture-rpi5-configured-origin"
