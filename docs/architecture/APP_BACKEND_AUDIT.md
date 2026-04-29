# Backend Audit

This audit documents the current `/app` backend structure after recent runtime, live-session, recording, and device-auth additions.

## Current strengths

- FastAPI route modularity (`app/api/*`) keeps endpoint families logically grouped.
- Source registry abstraction enables project/source-aware reads and writes.
- `AppRuntime` composition root centralizes runtime service wiring and lifecycle startup/shutdown.
- Node bearer auth foundation exists (`app/auth/*`, `runtime_device_auth`) for device-owned mutations.
- Live session and recording lifecycle are separated into dedicated state lanes (`live_session_registry` and `recording_sessions`).
- CAS/indexing direction is visible through registry + resolve/media flows.
- Explorer-compatible low-latency filesystem serving is preserved for `/media/*` and `/thumbnails/*` read paths.

## Current risks

- Route ownership is mixed across legacy and newer modules; overlap exists between `/api/live` and `/api/live_sessions` signaling families.
- Several service lanes are in-memory runtime state and do not survive process restart without external persistence.
- Frontend/backend contracts are partially implicit (some object/list and compatibility response shapes are not standardized).
- CAS write/index atomicity patterns are not yet uniformly hardened across all write paths.
- Test coverage is broad, but full-suite ownership and known-failure inventory still needs explicit living documentation.
- Lifecycle state and operator-visible runtime state depend on process continuity.
- High-traffic media and thumbnail delivery need explicit caching/index invalidation policy documentation.

## Backend module inventory

### `app/main.py`
- FastAPI composition and router registration boundary.
- CORS setup, static/public mount, health routes.
- Runtime creation and lifecycle startup/shutdown via lifespan.

### `app/runtime/*`
- `create_runtime.py`: process composition root.
- `types.py`: runtime/service dataclasses and capability model.
- `lifecycle.py`: periodic sweep controller.
- `live_sessions.py`: in-memory live session + WebRTC signaling registries.
- `recording_sessions.py`: in-memory recording lifecycle registry.
- `nodes.py`, `ingest_registry.py`, `dependencies.py`: node/claim storage and request runtime access.

### `app/api/*`
- Route ownership by functional family: projects/media/sources, connect/onboarding, nodes, ingest claims, live sessions, live WebRTC, recordings, resolve/reindex.
- Contains mixed audience routes (operator, registered node, browser device page, and dev/debug).

### `app/auth/*`
- Node token issue/hash/verify/preview helpers.
- Device/runtime auth context and scope checks for node-owned mutations.
- Platform credential scaffolding for future externalized auth/provider integration.

### `app/services/*`
- Domain service logic around live sessions, ingest claims, library snapshots, and related orchestration.
- Bridges route layer and runtime registry/state ownership.

### `app/models/*`
- Shared API/runtime models (for example recording session schema).

## Refactor constraints

- Preserve working Explorer flows already in production/development use.
- Preserve direct LAN development and operator workflows.
- Preserve Caddy same-origin gateway compatibility assumptions.
- Preserve media read routes (`/media/*`, `/thumbnails/*`) and range-read behavior.
- Avoid breaking compose/upload, source registry behavior, and asset-grid-facing route contracts.
- Prefer additive adapters and contract wrappers before invasive rewrites.

## Structural debt lanes (no behavior changes in this PR)

1. Route contract normalization (response model consistency and explicit schema ownership).
2. Live signaling consolidation decision (`/api/live` vs `/api/live_sessions/*/signal/*`).
3. Runtime in-memory state persistence strategy for live and recording lifecycle entities.
4. Auth boundary documentation and policy hardening for operator vs node-owned route families.
5. CAS write/index integrity hardening (atomicity, deterministic indexing, duplicate handling).
