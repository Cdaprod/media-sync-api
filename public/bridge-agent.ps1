<#
Bridge agent for media-sync-api.

Usage:
  powershell -ExecutionPolicy Bypass -File .\bridge-agent.ps1

Example calls:
  curl http://127.0.0.1:8790/health
  curl -X POST http://127.0.0.1:8790/junction/create -H "Content-Type: application/json" `
    -d "{\"link\":\"B:\\\\Video\\\\Projects\\\\_bridge\\\\Audio\",\"target\":\"Z:\\\\Audio\"}"
#>

[CmdletBinding()]
param(
  [int]$Port = 8790
)

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Error "Failed to start bridge agent on $prefix. $($_.Exception.Message)"
  exit 1
}

Write-Host "Bridge agent listening on $prefix"

$allowedExtensions = @(
  ".mp4",".mov",".avi",".mkv",".webm",".m4v",
  ".mp3",".wav",".m4a",".aac",".flac",
  ".jpg",".jpeg",".png",".gif",".webp",".heic"
)
$ignoredDirs = @(".ds_store","@eadir","__pycache__","cache","caches","tmp","temp","_manifest","_sources","_tags")
$ignoredFiles = @("thumbs.db",".ds_store")

function Write-JsonResponse {
  param([System.Net.HttpListenerResponse]$Response, [int]$Status, $Body)
  $Response.StatusCode = $Status
  $Response.ContentType = "application/json"
  $json = $Body | ConvertTo-Json -Depth 10
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Read-JsonBody {
  param([System.Net.HttpListenerRequest]$Request)
  $reader = [System.IO.StreamReader]::new($Request.InputStream, $Request.ContentEncoding)
  $content = $reader.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($content)) { return @{} }
  return $content | ConvertFrom-Json
}

function Get-AssetKind {
  param([string]$Extension)
  switch ($Extension.ToLower()) {
    ".mp4" { return "video" }
    ".mov" { return "video" }
    ".mkv" { return "video" }
    ".webm" { return "video" }
    ".m4v" { return "video" }
    ".avi" { return "video" }
    ".jpg" { return "image" }
    ".jpeg" { return "image" }
    ".png" { return "image" }
    ".gif" { return "image" }
    ".webp" { return "image" }
    ".heic" { return "image" }
    ".mp3" { return "audio" }
    ".wav" { return "audio" }
    ".m4a" { return "audio" }
    ".aac" { return "audio" }
    ".flac" { return "audio" }
    default { return "document" }
  }
}

function Build-ScanTree {
  param(
    [string]$Root,
    [int]$MaxDepth = 6,
    [int]$MinFiles = 1
  )
  $rootInfo = Get-Item -LiteralPath $Root -ErrorAction Stop
  $rootPath = $rootInfo.FullName

  function Scan-Dir {
    param([string]$Path, [string]$RelPath, [int]$Depth)
    if ($MaxDepth -gt 0 -and $Depth -gt $MaxDepth) { return $null }
    $leaf = Split-Path -Leaf $Path
    if ($ignoredDirs -contains $leaf.ToLower()) { return $null }

    $directMedia = 0
    $mediaKinds = New-Object System.Collections.Generic.HashSet[string]
    $children = @()

    Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.PSIsContainer) {
        if ($ignoredDirs -contains $_.Name.ToLower()) { return }
        $childRel = if ($RelPath) { "$RelPath/$($_.Name)" } else { $_.Name }
        $child = Scan-Dir -Path $_.FullName -RelPath $childRel -Depth ($Depth + 1)
        if ($null -ne $child) { $children += $child }
      } else {
        if ($ignoredFiles -contains $_.Name.ToLower()) { return }
        $ext = $_.Extension.ToLower()
        if (-not ($allowedExtensions -contains $ext)) { return }
        $directMedia += 1
        $mediaKinds.Add((Get-AssetKind -Extension $ext)) | Out-Null
      }
    }

    $descendantMedia = $directMedia + ($children | Measure-Object -Property descendant_media_count -Sum).Sum
    $descendantKinds = New-Object System.Collections.Generic.HashSet[string]
    foreach ($kind in $mediaKinds) { $descendantKinds.Add($kind) | Out-Null }
    foreach ($child in $children) {
      foreach ($kind in $child.media_kinds) { $descendantKinds.Add($kind) | Out-Null }
    }
    $kindsList = $descendantKinds.ToArray() | Sort-Object
    $mixed = $kindsList.Count -gt 1
    $baseline = $descendantMedia / [Math]::Max(1, $MinFiles * 10)
    $score = [Math]::Min(1.0, $baseline)
    if ($mixed) { $score *= 0.7 }
    if ($Depth -le 1) { $score *= 0.85 }
    $score = [Math]::Round($score, 3)

    return [ordered]@{
      path = if ($RelPath) { $RelPath } else { "." }
      depth = $Depth
      direct_media_count = $directMedia
      descendant_media_count = $descendantMedia
      media_kinds = $kindsList
      mixed = $mixed
      score = $score
      suggested = ($descendantMedia -ge $MinFiles -and $Depth -gt 0 -and -not $mixed)
      children = $children
    }
  }

  $tree = Scan-Dir -Path $rootPath -RelPath "" -Depth 0
  if ($null -eq $tree) {
    return @{
      path = "."
      depth = 0
      direct_media_count = 0
      descendant_media_count = 0
      media_kinds = @()
      mixed = $false
      score = 0.0
      suggested = $false
      children = @()
    }
  }
  return $tree
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  try {
    switch ($request.Url.AbsolutePath) {
      "/health" {
        Write-JsonResponse -Response $response -Status 200 -Body @{ status = "ok" }
      }
      "/junction/create" {
        $payload = Read-JsonBody -Request $request
        if (-not $payload.link -or -not $payload.target) {
          Write-JsonResponse -Response $response -Status 400 -Body @{ error = "link and target required" }
          continue
        }
        if (-not (Test-Path -LiteralPath $payload.target)) {
          Write-JsonResponse -Response $response -Status 404 -Body @{ error = "target not found" }
          continue
        }
        $linkDir = Split-Path -Parent $payload.link
        if (-not (Test-Path -LiteralPath $linkDir)) {
          New-Item -ItemType Directory -Path $linkDir -Force | Out-Null
        }
        if (-not (Test-Path -LiteralPath $payload.link)) {
          New-Item -ItemType Junction -Path $payload.link -Target $payload.target | Out-Null
        }
        Write-JsonResponse -Response $response -Status 200 -Body @{ status = "created" }
      }
      "/junction/delete" {
        $payload = Read-JsonBody -Request $request
        if (-not $payload.link) {
          Write-JsonResponse -Response $response -Status 400 -Body @{ error = "link required" }
          continue
        }
        if (Test-Path -LiteralPath $payload.link) {
          Remove-Item -LiteralPath $payload.link -Force
        }
        Write-JsonResponse -Response $response -Status 200 -Body @{ status = "deleted" }
      }
      "/scan" {
        $payload = Read-JsonBody -Request $request
        if (-not $payload.target) {
          Write-JsonResponse -Response $response -Status 400 -Body @{ error = "target required" }
          continue
        }
        $depth = if ($payload.max_depth) { [int]$payload.max_depth } else { 6 }
        $minFiles = if ($payload.min_files) { [int]$payload.min_files } else { 1 }
        $tree = Build-ScanTree -Root $payload.target -MaxDepth $depth -MinFiles $minFiles
        Write-JsonResponse -Response $response -Status 200 -Body $tree
      }
      default {
        Write-JsonResponse -Response $response -Status 404 -Body @{ error = "not found" }
      }
    }
  } catch {
    Write-JsonResponse -Response $response -Status 500 -Body @{ error = $_.Exception.Message }
  }
}

exit 0
