from __future__ import annotations

from pathlib import Path


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


REQUIRED_BACKEND_PATHS = (
    "/api/*",
    "/connect",
    "/connect/register",
    "/debug/*",
    "/public/*",
    "/player.html",
    "/favicon.ico",
    "/favicon/*",
    "/static/*",
)


def test_caddy_route_ownership_is_explicit_for_backend_media_and_next() -> None:
    host_content = _read("docker/caddy/Caddyfile")
    docker_content = _read("docker/caddy/Caddyfile.docker")

    assert "reverse_proxy @media 127.0.0.1:8787" in host_content
    assert "reverse_proxy @backend 127.0.0.1:8787" in host_content
    assert "reverse_proxy @next 127.0.0.1:3000" in host_content
    assert "reverse_proxy 127.0.0.1:3000" in host_content

    assert "reverse_proxy @media host.docker.internal:8787" in docker_content
    assert "reverse_proxy @backend host.docker.internal:8787" in docker_content
    assert "reverse_proxy @next host.docker.internal:3000" in docker_content
    assert "reverse_proxy host.docker.internal:3000" in docker_content


    assert "@connectDevice path /connect/device" in host_content
    assert "reverse_proxy @connectDevice 127.0.0.1:3000" in host_content
    assert "@connectDevice path /connect/device" in docker_content
    assert "reverse_proxy @connectDevice host.docker.internal:3000" in docker_content
    for content in (host_content, docker_content):
        assert "@media path /media/* /thumbnails/*" in content
        assert "transport http {" in content
        assert "versions 1.1" in content
        assert "@backend path" in content
        assert "@next path /_next/*" in content
        for route in REQUIRED_BACKEND_PATHS:
            assert route in content

        backend_section = content.split("@backend path", 1)[1].split("reverse_proxy @backend", 1)[0]
        assert "/connect/device" not in backend_section
        assert "/_next/*" not in backend_section


def test_compose_env_passthrough_includes_authority_origin_contract() -> None:
    api_compose = _read("docker/docker-compose.yaml")
    caddy_compose = _read("docker/docker-compose.caddy.yaml")

    assert "MEDIA_SYNC_PUBLIC_ORIGIN=${MEDIA_SYNC_PUBLIC_ORIGIN}" in api_compose
    assert "MEDIA_SYNC_AUTHORITY_ORIGIN=${MEDIA_SYNC_AUTHORITY_ORIGIN}" in api_compose
    assert "MEDIA_SYNC_AUTHORITY_HOST=${MEDIA_SYNC_AUTHORITY_HOST}" in api_compose

    assert "- MEDIA_SYNC_PUBLIC_ORIGIN" in caddy_compose
    assert "- MEDIA_SYNC_AUTHORITY_ORIGIN" in caddy_compose
    assert "- MEDIA_SYNC_AUTHORITY_HOST" in caddy_compose
