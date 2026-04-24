from __future__ import annotations

from pathlib import Path


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


REQUIRED_BACKEND_PATHS = (
    "/api/*",
    "/connect/*",
    "/media/*",
    "/thumbnails/*",
    "/public/*",
    "/player.html",
    "/favicon.ico",
    "/favicon/*",
    "/static/*",
)


def test_caddy_gateway_routes_backend_asset_paths_before_explorer_fallback():
    expected_upstreams = {
        "docker/caddy/Caddyfile": ("127.0.0.1:8787", "127.0.0.1:3000"),
        "docker/caddy/Caddyfile.docker": ("host.docker.internal:8787", "host.docker.internal:3000"),
    }
    for config_path, (backend_host, explorer_host) in expected_upstreams.items():
        content = _read(config_path)
        for route in REQUIRED_BACKEND_PATHS:
            assert route in content

        assert "/_next/*" not in content
        assert f"reverse_proxy @backend {backend_host}" in content
        assert f"reverse_proxy {explorer_host}" in content

        backend_idx = content.index(f"reverse_proxy @backend {backend_host}")
        explorer_idx = content.index(f"reverse_proxy {explorer_host}")
        assert backend_idx < explorer_idx


def test_caddy_docker_forwards_public_origin_proxy_headers():
    content = _read("docker/caddy/Caddyfile.docker")
    assert "header_up Host {host}" in content
    assert "header_up X-Forwarded-Host {host}" in content
    assert "header_up X-Forwarded-Proto {scheme}" in content
    assert "header_up X-Forwarded-For {remote_host}" in content
    assert "/_next/*" not in content
