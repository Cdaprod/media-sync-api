from __future__ import annotations

from pathlib import Path

import yaml


COMPOSE_PATH = Path("docker/docker-compose.yaml")


def test_compose_invariants():
    content = yaml.safe_load(COMPOSE_PATH.read_text())
    assert "version" not in content

    services = content.get("services", {})
    assert "media-sync-api" in services
    api_service = services["media-sync-api"]

    assert api_service.get("restart") == "always"
    assert "8787:8787" in api_service.get("ports", [])

    env_vars = api_service.get("environment", [])
    assert "MEDIA_SYNC_PROJECTS_ROOT=/data/projects" in env_vars
    assert "MEDIA_SYNC_SOURCES_PARENT_ROOT=/mnt/media-sources" in env_vars

    volumes = api_service.get("volumes", [])
    assert any("/data/projects" in volume for volume in volumes)
    assert any("/mnt/media-sources" in volume for volume in volumes)

    assert "resolve-postgres" in services
    resolve_service = services["resolve-postgres"]
    assert resolve_service.get("image") == "postgres:15-alpine"
    assert "5432:5432" in resolve_service.get("ports", [])
    resolve_env = resolve_service.get("environment", [])
    assert any(var.startswith("POSTGRES_DB=") for var in resolve_env)
    assert any(var.startswith("POSTGRES_USER=") for var in resolve_env)
    assert any(var.startswith("POSTGRES_PASSWORD=") for var in resolve_env)
