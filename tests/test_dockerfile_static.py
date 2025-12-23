from __future__ import annotations

from pathlib import Path


def test_dockerfile_invariants():
    dockerfile_path = Path("docker/Dockerfile")
    assert dockerfile_path.exists(), "docker/Dockerfile must exist for Compose/Bake builds"
    dockerfile = dockerfile_path.read_text()
    assert "FROM python:3.12-slim" in dockerfile
    assert "COPY requirements.txt" in dockerfile
    assert "pip install --no-cache-dir -r requirements.txt" in dockerfile
    assert "COPY app ./app" in dockerfile
    assert "COPY public ./public" in dockerfile
    assert "EXPOSE 8787" in dockerfile
    assert "python -m app.main" in dockerfile or "\"python\", \"-m\", \"app.main\"" in dockerfile
