from __future__ import annotations

import importlib

from fastapi.testclient import TestClient

from app import config


def _build_client() -> TestClient:
    module = importlib.import_module("app.main")
    importlib.reload(module)
    return TestClient(module.create_app())


def test_cors_allows_explorer_origin_when_env_unset(monkeypatch):
    monkeypatch.delenv("MEDIA_SYNC_CORS_ORIGINS", raising=False)
    config.reset_settings_cache()
    client = _build_client()

    response = client.get(
        "/api/sources",
        headers={"Origin": "http://192.168.0.25:8790"},
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://192.168.0.25:8790"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_wildcard_disables_credentials(monkeypatch):
    monkeypatch.setenv("MEDIA_SYNC_CORS_ORIGINS", "*")
    config.reset_settings_cache()
    client = _build_client()

    response = client.options(
        "/api/sources",
        headers={
            "Origin": "http://192.168.0.25:8790",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "*"
    assert response.headers.get("access-control-allow-credentials") is None
