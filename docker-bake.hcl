// docker-bake.hcl
// Build definition for Cdaprod/media-sync-api
// Designed for Docker Desktop (Linux engine) and CI environments

group "default" {
  targets = ["media-sync-api"]
}

target "media-sync-api" {
  context    = "."
  dockerfile = "Dockerfile"

  tags = [
    "media-sync-api:latest",
    "cdaprod/media-sync-api:latest"
  ]

  platforms = [
    "linux/amd64"
  ]

  args = {
    PYTHON_VERSION = "3.12"
  }

  labels = {
    "org.opencontainers.image.title"       = "media-sync-api"
    "org.opencontainers.image.description" = "LAN-first media ingest, dedupe, and project indexing API"
    "org.opencontainers.image.source"      = "https://github.com/Cdaprod/media-sync-api"
    "org.opencontainers.image.authors"     = "David Cannan (@Cdaprod)"
  }
}