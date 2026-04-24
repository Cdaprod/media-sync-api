# Caddy LAN HTTPS gateway scaffold

Purpose: provide a single HTTPS LAN authority origin for Explorer + `media-sync-api` so iPhone/iPad Safari can treat `/connect/device` as a secure context for camera APIs.

## Authority origin

Use:

- `https://cda-DESKTOP.local`

## Required app environment

Set these for backend connect/authority URL generation and Caddy host binding:

## Repo root `.env` bootstrap

From the repository root:

```bash
cp .env.example .env
```

Then adjust values for your LAN hostname/IP before running compose.

```bash
# Full URLs (backend/frontend authority contracts)
MEDIA_SYNC_PUBLIC_ORIGIN=https://cda-DESKTOP.local
MEDIA_SYNC_AUTHORITY_ORIGIN=https://cda-DESKTOP.local

# Hostname only (Caddy site label)
MEDIA_SYNC_AUTHORITY_HOST=cda-DESKTOP.local
```

> Caddy site labels require hostnames, not full URLs.

## Expected host services

- `media-sync-api` on `127.0.0.1:8787`
- Explorer dev server on `127.0.0.1:3000`

The Docker Caddy config proxies to those host services using `host.docker.internal`.

## Trust requirement for iPhone/iPad Safari

Caddy uses `tls internal` (local CA). iPhone/iPad must trust the Caddy internal CA certificate or Safari may still block secure-context camera APIs.

## Quick test

```bash
curl -k https://cda-DESKTOP.local/health
curl -k https://192.168.0.25/health
```

## Browser test

Visit:

`https://cda-DESKTOP.local/connect/device?node_id=<node_id>`

Confirm diagnostics show:

- `Secure context: yes`
