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

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

@"
{
  admin off
  local_certs
}

cda-DESKTOP.local, 192.168.0.25 {
  tls internal

  encode gzip zstd

  @api path /api/* /connect/* /media/* /health /healthz /docs /openapi.json /thumbnails/*
  reverse_proxy @api host.docker.internal:8787

  reverse_proxy host.docker.internal:3000
}
"@ | Set-Content -Path $DockerCaddyfile -Encoding UTF8

Write-Host 'Starting Caddy container on ports 80/443 using docker-compatible upstreams...'

docker run --rm -d `
  --name media-sync-caddy `
  -p 80:80 `
  -p 443:443 `
  -v "${DockerCaddyfile}:/etc/caddy/Caddyfile:ro" `
  -v "${DataDir}:/data" `
  -v "${ConfigDir}:/config" `
  caddy:2 | Out-Null

if ($LASTEXITCODE -ne 0) {
  Write-Error 'Failed to start Caddy container.'
  exit 1
}

Write-Host 'Caddy started successfully.'
Write-Host 'To inspect logs: docker logs -f media-sync-caddy'
Write-Host 'To stop: docker stop media-sync-caddy'
