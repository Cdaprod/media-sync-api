# Caddy LAN HTTPS gateway scaffold

Purpose: provide a single HTTPS LAN authority origin for Explorer + `media-sync-api` so iPhone/iPad Safari can treat `/connect/device` as a secure context for camera APIs.

## Authority origin

Use:

- `https://cda-DESKTOP.local`

## Required app environment

Set these for backend connect/authority URL generation:

```bash
MEDIA_SYNC_PUBLIC_ORIGIN=https://cda-DESKTOP.local
MEDIA_SYNC_AUTHORITY_ORIGIN=https://cda-DESKTOP.local
```

## Expected host services

- `media-sync-api` on `127.0.0.1:8787`
- Explorer dev server on `127.0.0.1:3000`

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
