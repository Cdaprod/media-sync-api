#!/usr/bin/env bash
# Run Caddy LAN HTTPS gateway container using host-loopback upstreams.
# Example:
#   ./docker/caddy/run-caddy.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CADDY_DIR="$ROOT_DIR/docker/caddy"

mkdir -p "$CADDY_DIR/data" "$CADDY_DIR/config"

docker run --rm -d \
  --name media-sync-caddy \
  -p 80:80 \
  -p 443:443 \
  -v "$CADDY_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$CADDY_DIR/data:/data" \
  -v "$CADDY_DIR/config:/config" \
  caddy:2

echo "Caddy started."
echo "Logs: docker logs -f media-sync-caddy"
echo "Stop: docker stop media-sync-caddy"
