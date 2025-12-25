from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import config


@pytest.fixture()
def env_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "projects"
    sources_root = tmp_path / "sources"
    cache_root = tmp_path / "cache"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_SOURCES_PARENT_ROOT", str(sources_root))
    monkeypatch.setenv("MEDIA_SYNC_CACHE_ROOT", str(cache_root))
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
    sources_root = tmp_path / "sources"
    cache_root = tmp_path / "cache"
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(root))
    monkeypatch.setenv("MEDIA_SYNC_SOURCES_PARENT_ROOT", str(sources_root))
    monkeypatch.setenv("MEDIA_SYNC_CACHE_ROOT", str(cache_root))
    monkeypatch.setenv("MEDIA_SYNC_MAX_UPLOAD_MB", "1")
    monkeypatch.setenv("MEDIA_SYNC_CORS_ORIGINS", "*")
    config.reset_settings_cache()
    config.get_settings()
    module = importlib.import_module("app.main")
    importlib.reload(module)
    application = module.create_app()
    return TestClient(application)
