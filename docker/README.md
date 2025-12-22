# Docker helpers

## Compose
Run the stack from the repo root so the build context stays aligned with the source tree:

```bash
docker compose -f docker/docker-compose.yaml up -d --build
```

## Buildx bake
Use Bake when you want tagged multi-platform images from the same context:

```bash
docker buildx bake -f docker/docker-bake.hcl
```
