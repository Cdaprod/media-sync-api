from __future__ import annotations


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("ok") is True
    assert payload.get("service") == "media-sync-api"


def test_health_sets_cors_headers(client):
    response = client.get("/health", headers={"Origin": "http://example.com"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "*"
