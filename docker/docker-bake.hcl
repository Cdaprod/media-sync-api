group "default" {
  targets = ["media-sync-api"]
}

target "media-sync-api" {
  context    = ".."
  dockerfile = "docker/Dockerfile"

  tags = [
    "media-sync-api:latest",
    "cdaprod/media-sync-api:latest"
  ]

  platforms = ["linux/amd64"]

  labels = {
    "org.opencontainers.image.title"       = "media-sync-api"
    "org.opencontainers.image.description" = "LAN-first media ingest, dedupe, and project indexing API"
    "org.opencontainers.image.source"      = "https://github.com/Cdaprod/media-sync-api"
    "org.opencontainers.image.authors"     = "David Cannan (@Cdaprod)"
  }
}
