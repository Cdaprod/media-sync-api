from __future__ import annotations

from pathlib import Path

import yaml


def test_compose_invariants():
    content = yaml.safe_load(Path("docker-compose.yml").read_text())
    services = content.get("services", {})
    assert "media-sync-api" in services
    service = services["media-sync-api"]

    assert service.get("restart") == "always"
    assert "8787:8787" in service.get("ports", [])

    env_vars = service.get("environment", [])
    assert "MEDIA_SYNC_PROJECTS_ROOT=/data/projects" in env_vars

    volumes = service.get("volumes", [])
    assert any("/data/projects" in volume for volume in volumes)
