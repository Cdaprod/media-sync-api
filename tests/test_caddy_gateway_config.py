from __future__ import annotations

from pathlib import Path


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


REQUIRED_BACKEND_PATHS = (
    "/api/*",
    "/connect/*",
    "/public/*",
    "/player.html",
    "/favicon.ico",
    "/favicon/*",
    "/static/*",
)


def test_caddy_gateway_uses_dedicated_media_matcher_with_http11_transport() -> None:
    expected_upstreams = {
        "docker/caddy/Caddyfile": ("127.0.0.1:8787", "127.0.0.1:3000"),
        "docker/caddy/Caddyfile.docker": ("host.docker.internal:8787", "host.docker.internal:3000"),
    }
    for config_path, (backend_host, explorer_host) in expected_upstreams.items():
        content = _read(config_path)

        assert "@media path /media/* /thumbnails/*" in content
        assert f"reverse_proxy @media {backend_host}" in content
        assert "transport http {" in content
        assert "versions 1.1" in content

        for route in REQUIRED_BACKEND_PATHS:
            assert route in content

        assert "@backend path" in content
        assert "/media/*" in content
        assert "/_next/*" not in content

        assert f"reverse_proxy @backend {backend_host}" in content
        assert f"reverse_proxy {explorer_host}" in content


def test_caddy_docker_has_no_redundant_forwarded_header_overrides() -> None:
    content = _read("docker/caddy/Caddyfile.docker")
    assert "header_up Host {host}" in content
    assert "header_up X-Forwarded-Host {host}" not in content
    assert "header_up X-Forwarded-Proto {scheme}" not in content
    assert "header_up X-Forwarded-For {remote_host}" not in content


def test_caddy_compose_uses_named_persistent_volumes() -> None:
    content = _read("docker/docker-compose.caddy.yaml")
    assert "- caddy_data:/data/caddy" in content
    assert "- caddy_config:/config/caddy" in content
    assert "volumes:" in content
    assert "caddy_data:" in content
    assert "caddy_config:" in content
