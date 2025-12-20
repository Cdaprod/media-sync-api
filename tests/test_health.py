from __future__ import annotations


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("ok") is True
    assert payload.get("service") == "media-sync-api"
