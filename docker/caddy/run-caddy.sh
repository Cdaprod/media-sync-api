#!/usr/bin/env bash
# Run Caddy LAN HTTPS gateway container using docker-compatible upstreams.
# Example:
#   MEDIA_SYNC_AUTHORITY_HOST=cda-DESKTOP.local ./docker/caddy/run-caddy.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CADDY_DIR="$ROOT_DIR/docker/caddy"

mkdir -p "$CADDY_DIR/data" "$CADDY_DIR/config"

if [[ ! -f "$CADDY_DIR/Caddyfile.docker" ]]; then
  echo "Missing Caddyfile: $CADDY_DIR/Caddyfile.docker" >&2
  exit 1
fi

docker run --rm -d \
  --name media-sync-caddy \
  -p 80:80 \
  -p 443:443 \
  --add-host host.docker.internal:host-gateway \
  -e MEDIA_SYNC_AUTHORITY_HOST \
  -e MEDIA_SYNC_PUBLIC_ORIGIN \
  -v "$CADDY_DIR/Caddyfile.docker:/etc/caddy/Caddyfile:ro" \
  -v "$CADDY_DIR/data:/data" \
  -v "$CADDY_DIR/config:/config" \
  caddy:2

echo "Caddy started."
echo "Logs: docker logs -f media-sync-caddy"
echo "Stop: docker stop media-sync-caddy"
