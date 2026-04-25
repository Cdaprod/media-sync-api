<#
Run Caddy LAN HTTPS gateway on Docker Desktop (Windows).

Usage:
  powershell -ExecutionPolicy Bypass -File .\docker\caddy\run-caddy.ps1
#>

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$CaddyDir = Join-Path $RepoRoot 'docker\caddy'
$DataDir = Join-Path $CaddyDir 'data'
$ConfigDir = Join-Path $CaddyDir 'config'
$DockerCaddyfile = Join-Path $CaddyDir 'Caddyfile.docker'

if (-not (Test-Path $DockerCaddyfile)) {
  Write-Error "Missing Caddyfile: $DockerCaddyfile"
  exit 1
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

Write-Host 'Starting Caddy container on ports 80/443 using Caddyfile.docker...'

docker run --rm -d `
  --name media-sync-caddy `
  -p 80:80 `
  -p 443:443 `
  -v "${DockerCaddyfile}:/etc/caddy/Caddyfile:ro" `
  -v "${DataDir}:/data" `
  -v "${ConfigDir}:/config" `
  --add-host host.docker.internal:host-gateway `
  --env MEDIA_SYNC_AUTHORITY_HOST `
  --env MEDIA_SYNC_PUBLIC_ORIGIN `
  caddy:2 | Out-Null

if ($LASTEXITCODE -ne 0) {
  Write-Error 'Failed to start Caddy container.'
  exit 1
}

Write-Host 'Caddy started successfully.'
Write-Host 'To inspect logs: docker logs -f media-sync-caddy'
Write-Host 'To stop: docker stop media-sync-caddy'
