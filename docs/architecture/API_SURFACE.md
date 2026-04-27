# API Surface

This document maps the currently exposed FastAPI route surface for `media-sync-api` as of the latest OpenAPI snapshot in `docs/architecture/openapi.json`.

Regenerate inventory:

```bash
python scripts/export_openapi.py
```

## Route Naming Policy

- `/api/live` owns browser WebRTC signaling/control-plane transport.
- `/api/live_sessions` owns durable live capture/session lifecycle.
- `/api/recordings` owns recording lifecycle state.
- `/api/live_sessions/{session_id}/recording/upload` owns recording persistence/upload.
- `/media` and `/thumbnails` are read-optimized media delivery paths and must remain free of node bearer auth.

## Route Classes

- **Operator / Explorer-readable**
  - Project/media/source listings, runtime node views, ingest claim views, live session views, and maintenance tools used by Explorer/operator workflows.
- **Device-authenticated mutation routes**
  - Node heartbeat, ingest claim creation, and most `/api/live_sessions/*` write paths that require registered-node bearer token scope.
- **Live/WebRTC signaling routes**
  - `/api/live/*` and `/api/live_sessions/*/signal/*` signaling exchanges for offer/answer/ICE.
- **Recording lifecycle routes**
  - `/api/recordings/*` runtime lifecycle and `/api/live_sessions/{session_id}/recording/upload` browser upload persistence.
- **Ingest claim routes**
  - `/api/ingest/claims*` claim submit/list/get/delete/prune.
- **Project/source/media routes**
  - `/api/projects/*`, `/api/sources*`, `/media/*`, `/thumbnails/*`, `/api/library`.
- **Connect/onboarding routes**
  - `/connect`, `/connect/register`, `/connect/device`.
- **Health/debug routes**
  - `/health`, `/healthz`, `/debug/resolve-path`, `/reindex`.

## Current route inventory

> Notes:
> - "Auth" refers to app-level runtime auth expectations. In deployed environments, a gateway (for example Caddy Basic Auth) may add outer auth boundaries.
> - "Frontend Consumer" indicates known UI consumers (`Explorer`, `/connect/device`, or both).

| Method | Path | Audience | Auth | State Owner | Frontend Consumer | Notes |
|---|---|---|---|---|---|---|
| GET | `/health`, `/healthz` | internal/dev, operator | none/dev | `AppRuntime` | optional ops tooling | Health/readiness surfaces. |
| GET | `/connect` | operator/dev | none/dev | runtime metadata | Browser/operator | Onboarding discovery page. |
| POST | `/connect/register` | operator + runtime node registration | currently unprotected behind operator boundary | node registry | Explorer Register modal | Issues one-time bearer credential material. |
| GET | `/connect/device` | browser device page | currently unprotected behind operator boundary | node registry + `/api/live` | Browser device page | Device camera shell and signaling bootstrap. |
| GET/POST | `/api/projects` | Explorer/operator | currently unprotected behind operator boundary | source registry + filesystem/index | Explorer | Project list/create. |
| GET | `/api/projects/{project_name}` | Explorer/operator | currently unprotected behind operator boundary | source registry | Explorer | Project detail. |
| GET | `/api/projects/{project_name}/media` | Explorer/operator | currently unprotected behind operator boundary | source registry/index | Explorer grid/list | Canonical media listing. |
| GET | `/api/projects/{project_name}/media/query` | Explorer/operator | currently unprotected behind operator boundary | source registry/index | Explorer | Query/search media. |
| POST | `/api/projects/{project_name}/upload` | Explorer/operator | currently unprotected behind operator boundary | filesystem + indexing | Explorer | Direct upload path. |
| POST | `/api/projects/{project_name}/upload-batch/start|finalize`, GET `/upload-batch/{batch_id}` | Explorer/operator | currently unprotected behind operator boundary | upload batch state | Explorer | Batch upload lanes. |
| POST | `/api/projects/{project_name}/media/delete|move|tags|reconcile` | Explorer/operator | currently unprotected behind operator boundary | source registry/filesystem/index | Explorer | Media mutation lanes. |
| GET/POST | `/api/projects/{project_name}/compose/jobs/{job_id}` and compose endpoints | Explorer/operator | currently unprotected behind operator boundary | compose service/jobs | Explorer compose UI | Composition lifecycle. |
| POST | `/api/assets/bulk/delete|move|tags|compose` | Explorer/operator | currently unprotected behind operator boundary | source registry/compose/index | Explorer bulk actions | Cross-project bulk mutation contracts. |
| GET/POST | `/api/sources` | Explorer/operator | currently unprotected behind operator boundary | source registry | Explorer sidebar | Source list/add surfaces. |
| POST | `/api/sources/{source_name}/toggle` | Explorer/operator | currently unprotected behind operator boundary | source registry | Explorer | Source enable/disable control. |
| GET/POST | `/api/nodes` | Explorer/operator | currently unprotected behind operator boundary (writes can be runtime-mediated) | node registry | Explorer runtime panel | Runtime node inventory. |
| GET/DELETE | `/api/nodes/{node_id}` | Explorer/operator cleanup | currently unprotected behind operator boundary | node registry | Explorer context menu | Cleanup path; not node-owned mutation. |
| POST | `/api/nodes/prune` | Explorer/operator cleanup | currently unprotected behind operator boundary | node registry | Explorer | Stale node pruning. |
| POST | `/api/nodes/{node_id}/heartbeat` | registered node | node bearer token | node registry + lifecycle | runtime nodes + device runtimes | Node liveness mutation. |
| POST | `/api/nodes/{node_id}/claim` | internal/runtime | currently unprotected behind operator boundary | ingest claim service | none direct | Claim issue helper. |
| GET/POST | `/api/ingest/claims` | mixed: operator read + registered node write | GET: operator boundary, POST: node bearer token | ingest claim registry/service | Explorer ingest panel | Mixed ownership route family. |
| GET/DELETE | `/api/ingest/claims/{claim_id}` | Explorer/operator | currently unprotected behind operator boundary | ingest claim registry/service | Explorer | Claim details/cleanup. |
| POST | `/api/ingest/claims/prune` | Explorer/operator cleanup | currently unprotected behind operator boundary | ingest claim registry/service | Explorer | Stale claim pruning. |
| GET | `/api/library` | Explorer/operator | currently unprotected behind operator boundary | source registry/index | Explorer snapshot load | Aggregated library state. |
| GET | `/api/live_sessions` | Explorer/operator | currently unprotected behind operator boundary | live session service/registry | Explorer live cards | Device live session list. |
| POST | `/api/live_sessions/start|heartbeat|chunk|end|control|control/ack` | registered node | node bearer token | live session service/registry | device runtimes + Explorer controls | Node-owned live mutation routes. |
| GET | `/api/live_sessions/{session_id}` | Explorer/operator | currently unprotected behind operator boundary | live session registry | Explorer | Session detail read. |
| GET/POST | `/api/live_sessions/{session_id}/signal*` | mixed device/viewer | device writes require bearer where applicable | live session signaling state | Explorer + device runtime | Existing live-session signaling family. |
| GET | `/api/live_sessions/{session_id}/preview/latest` | Explorer/operator | currently unprotected behind operator boundary | spool chunk files | Explorer `LiveSourceCard` | Polling live preview bytes. |
| POST | `/api/live_sessions/{session_id}/recording/upload` | browser recorder flow | currently unprotected behind operator boundary | filesystem/source root | Explorer recording hook | Persists browser `.webm` recording. |
| GET | `/api/live` | Explorer/operator | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | Explorer runtime panel | Multi-viewer signaling/session status index. |
| POST/GET | `/api/live/{session_id}/offer` | browser device + viewer | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | `/connect/device`, `LivePreview` | Device publishes one offer; viewers fetch it. |
| POST/GET | `/api/live/{session_id}/answer` | legacy default viewer | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | `/connect/device`, `LivePreview` | Backward-compatible default viewer lane. |
| POST/GET | `/api/live/{session_id}/viewers/{viewer_id}/answer` | explicit live viewer | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | `LivePreview` | Multi-viewer answer lane. |
| POST/GET | `/api/live/{session_id}/ice/device` | browser device + viewers | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | `/connect/device`, `LivePreview` | Device ICE exchange lane. |
| POST/GET | `/api/live/{session_id}/viewers/{viewer_id}/ice` | explicit live viewer + device | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | `LivePreview`, `/connect/device` | Viewer ICE exchange lane. |
| POST | `/api/live/{session_id}/viewers/{viewer_id}/state` | live viewer | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | `LivePreview` | Connection-state telemetry lane. |
| DELETE | `/api/live/{session_id}` | operator/dev cleanup | currently unprotected behind operator boundary | `WebRtcLiveSessionRegistry` | optional | Signaling session cleanup. |
| GET/POST | `/api/recordings`, `/api/recordings/start` | Explorer/operator + browser recorder logic | currently unprotected behind operator boundary | runtime `recording_sessions` registry | Explorer `useRecordingSessions` | Runtime recording lifecycle source-of-truth. |
| POST | `/api/recordings/{recording_id}/complete|fail` | Explorer/browser recorder logic | currently unprotected behind operator boundary | runtime `recording_sessions` registry | Explorer `useRecordingSessions` | Recording lifecycle transitions. |
| DELETE | `/api/recordings/{recording_id}` | Explorer/operator cleanup | currently unprotected behind operator boundary | runtime `recording_sessions` registry | Explorer | Removes runtime lifecycle record only. |
| GET | `/media/{project_name}/{relative_path}`, `/media/{project_name}/download/{relative_path}` | Explorer/operator/public media read | none at app layer; gateway policy applies | filesystem/source roots/index | Explorer/video player/download links | High-traffic read route; must remain media-readable. |
| GET | `/thumbnails/{project_name}/{thumb_name}` | Explorer/operator/public media read | none at app layer; gateway policy applies | thumbnail generation/cache/filesystem | Explorer grid thumbs | High-traffic thumb route; must remain media-readable. |
| GET | `/debug/resolve-path` | internal/dev/operator | none/dev | source registry/filesystem path resolution | dev/debug only | Safe path diagnostics. |
| GET/POST | `/reindex` and `/api/projects/{project_name}/reindex` | operator | currently unprotected behind operator boundary | indexer/source registry | Explorer + ops | Manual indexing controls. |

## Legacy / needs review focus points

1. **Dual signaling families**: `/api/live_sessions/{session_id}/signal/*` and `/api/live/{session_id}/*` now coexist and overlap in capability.
2. **Mixed auth expectations**: route groups rely heavily on outer operator boundary assumptions while some specific mutations require node bearer auth.
3. **Response model consistency**: several route families mix object/list payload styles and optional compatibility payloads.
4. **In-memory runtime state**: `/api/live` and `/api/recordings` are process-memory backed today; restart persistence strategy is undecided.
