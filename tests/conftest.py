from __future__ import annotations

import importlib
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import config


@pytest.fixture()
def env_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "projects"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_MAX_UPLOAD_MB", "5")
    monkeypatch.setenv("MEDIA_SYNC_CORS_ORIGINS", "*")
    monkeypatch.setenv("MEDIA_SYNC_AUTO_REINDEX", "0")
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
    monkeypatch.setenv("MEDIA_SYNC_AUTO_REINDEX", "0")
    config.reset_settings_cache()
    config.get_settings()
    module = importlib.import_module("app.main")
    importlib.reload(module)
    application = module.create_app()
    return TestClient(application)
