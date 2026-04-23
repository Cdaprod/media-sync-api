from __future__ import annotations


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
    assert "Ingest claims are still separate" in body["message"]

    nodes = client.get("/api/nodes").json()
    assert any(node["node_id"] == "capture-rpi5-1" for node in nodes)

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
