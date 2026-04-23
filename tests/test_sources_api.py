from __future__ import annotations


def test_list_sources_includes_primary(limited_client, env_settings):
    response = limited_client.get("/api/sources")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 1
    primary = next((item for item in payload if item["name"] == "primary"), None)
    assert primary is not None
    assert primary["authority"] == "canonical"
    assert primary["kind"] == "filesystem"
    assert primary["accessible"] is True


def test_register_and_toggle_source(limited_client, env_settings):
    extra_root = env_settings.parent / "extra"
    extra_root.mkdir(parents=True, exist_ok=True)

    create_response = limited_client.post(
        "/api/sources",
        json={
            "name": "nas",
            "root": str(extra_root),
            "type": "smb",
            "enabled": True,
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "nas"
    assert created["type"] == "smb"
    assert created["authority"] == "canonical"

    toggle_response = limited_client.post("/api/sources/nas/toggle?enabled=false")
    assert toggle_response.status_code == 200
    toggled = toggle_response.json()
    assert toggled["name"] == "nas"
    assert toggled["enabled"] is False


def test_list_sources_merges_remote_source_bearing_participants(client):
    register_response = client.post(
        "/connect/register",
        json={
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
        },
    )
    assert register_response.status_code == 200

    response = client.get("/api/sources")
    assert response.status_code == 200
    payload = response.json()

    primary = next((item for item in payload if item["name"] == "primary" and item["owner_node_id"] is None), None)
    remote = next(
        (
            item for item in payload
            if item["name"] == "camera-primary" and item["owner_node_id"] == "capture-rpi5-1"
        ),
        None,
    )

    assert primary is not None
    assert primary["authority"] == "canonical"

    assert remote is not None
    assert remote["authority"] == "runner-local"
    assert remote["kind"] == "capture"
    assert remote["owner_node_id"] == "capture-rpi5-1"
    assert remote["local_only"] is True
    assert remote["can_proxy"] is True
    assert remote["can_record"] is True
    assert remote["metadata"]["registered_via"] == "/connect/register"
