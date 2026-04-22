from __future__ import annotations


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("ok") is True
    assert payload.get("service") == "media-sync-api"
    assert payload.get("role") in {"authority", "runner"}
    assert isinstance(payload.get("runtime_id"), str)
    assert isinstance(payload.get("node_id"), str)
    assert payload.get("started") is True
    assert payload.get("projects_root")
