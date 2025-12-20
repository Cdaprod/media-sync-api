from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config


@pytest.fixture()
def env_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "projects"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_MAX_UPLOAD_MB", "5")
    monkeypatch.setenv("MEDIA_SYNC_CORS_ORIGINS", "*")
    config.reset_settings_cache()
    config.get_settings()
    return root


@pytest.fixture()
def client(env_settings: Path) -> TestClient:
    module = importlib.import_module("app.main")
    importlib.reload(module)
    application = module.create_app()
    return TestClient(application)


@pytest.fixture()
def limited_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    root = tmp_path / "projects"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_MAX_UPLOAD_MB", "1")
    monkeypatch.setenv("MEDIA_SYNC_CORS_ORIGINS", "*")
    config.reset_settings_cache()
    config.get_settings()
    module = importlib.import_module("app.main")
    importlib.reload(module)
    application = module.create_app()
    return TestClient(application)
