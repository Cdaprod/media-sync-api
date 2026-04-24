from __future__ import annotations

from pathlib import Path


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


REQUIRED_BACKEND_PATHS = (
    "/api/*",
    "/media/*",
    "/download/*",
    "/thumbnails/*",
    "/player.html",
)



def test_caddy_gateway_routes_backend_asset_paths_before_explorer_fallback():
    for config_path in ("docker/caddy/Caddyfile", "docker/caddy/Caddyfile.docker"):
        content = _read(config_path)
        for route in REQUIRED_BACKEND_PATHS:
            assert route in content

        assert "reverse_proxy @backend host.docker.internal:8787" in content
        assert "reverse_proxy host.docker.internal:3000" in content

        backend_idx = content.index("reverse_proxy @backend host.docker.internal:8787")
        explorer_idx = content.index("reverse_proxy host.docker.internal:3000")
        assert backend_idx < explorer_idx
