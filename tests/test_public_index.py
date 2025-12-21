from __future__ import annotations


def test_root_serves_adapter(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    body = response.text
    assert "media-sync-api" in body
    assert "Playbook" in body
    assert "upload media" in body.lower()


def test_public_path_alias(client):
    response = client.get("/public/index.html")
    assert response.status_code == 200
    assert "media-sync-api adapter" in response.text
