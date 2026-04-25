# Caddy LAN HTTPS gateway scaffold

Purpose: provide a single HTTPS LAN authority origin for Explorer + `media-sync-api` so iPhone/iPad Safari can treat `/connect/device` as a secure context for camera APIs.

## Authority origin

Use:

- `https://cda-desktop.local`

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
MEDIA_SYNC_PUBLIC_ORIGIN=https://cda-desktop.local
MEDIA_SYNC_AUTHORITY_ORIGIN=https://cda-desktop.local

# Hostname only (Caddy site label)
MEDIA_SYNC_AUTHORITY_HOST=cda-desktop.local
```

> Caddy site labels require hostnames, not full URLs.
> Keep authority host/origin values lowercase for consistent LAN HTTPS behavior.

## Expected host services

- `media-sync-api` on `127.0.0.1:8787`
- Explorer dev server on `127.0.0.1:3000`

The Docker Caddy config proxies to those host services using `host.docker.internal`.

## Trust requirement for iPhone/iPad Safari

Caddy uses `tls internal` (local CA). iPhone/iPad must trust the Caddy internal CA certificate or Safari may still block secure-context camera APIs.

## Quick test

```powershell
curl.exe -k https://cda-desktop.local/health
curl.exe -k https://cda-desktop.local/
curl.exe -k -I "https://cda-desktop.local/media/<project>/<relative>.mp4?source=primary"
curl.exe -k -I "https://cda-desktop.local/thumbnails/<project>/<thumb>.jpg"
curl.exe -k https://192.168.0.25/health
```

Expected behavior:
- `/api/*`, `/connect/*`, `/media/*`, `/thumbnails/*`, `/public/*`, `/player.html`, `/favicon*`, and `/static/*` are served by `media-sync-api:8787`.
- all other paths (including Next.js app routes and `/_next/*` chunks) fall back to Explorer on `:3000`.

## Troubleshooting Next static asset origins

- Expected Next script URLs under Caddy are `/_next/static/...` or `https://<authority>/_next/static/...`.
- Seeing `http://<lan-ip>:3000/_next/static/...` usually means stale browser cache, direct dev-server access, or missing proxy header/origin config.

```bash
curl -k https://<authority>/ -o cda-home.html
```

```powershell
Select-String -Path .\cda-home.html -Pattern "192.168.0.25:3000|http://|_next/static"
```

## Browser test

Visit:

`https://cda-desktop.local/connect/device?node_id=<node_id>`

Confirm diagnostics show:

- `Secure context: yes`
