# Explorer Frontend Audit

This document maps the current Explorer package feature architecture under `docker/packages/Explorer/src`.

## Current feature surfaces

- Asset grid/list rendering and interaction ownership lanes.
- Source/runtime side panel and runtime context actions.
- Node registration modal and connect/onboarding UX.
- Live session cards (`LiveSourceCard`) and runtime live status chips.
- WebRTC viewer answer/watch flow (`LivePreview`).
- StreamHub session-owned media stream bridge.
- Browser-side MediaRecorder recording pipeline.
- Pending compose asset rendering.
- Pending recording asset rendering.
- Completed recording reconciliation into indexed asset state.
- URL policy and authority policy normalization helpers.
- Centralized API client used by hooks and feature surfaces.

## State ownership

| State | Owner | Persistence | Notes |
|---|---|---|---|
| Asset library snapshot | `useLibrarySnapshot` | API/index | Canonical media state for project/all views. |
| Runtime nodes/sources | `useSourceControlData` | API/runtime | Operator-facing runtime/source inventory. |
| WebRTC sessions | `useWebRtcLiveSessions` | API/runtime | Polling-based live transport status. |
| MediaStream ownership | `StreamHub` | browser memory | `session_id` keyed stream bridge; non-persistent. |
| Recording sessions | `useRecordingSessions` + `/api/recordings` | runtime + browser | Hybrid runtime lifecycle + browser recorder runtime. |
| Pending compose | `usePendingComposeJobs` | browser + runtime compose jobs | Tracks compose jobs and reconciles outputs. |
| UI prefs/layout | `useExplorerUiState` + localStorage | localStorage | Layout/filter UI state persistence. |

## Known frontend risks

- `ExplorerApp.tsx` remains a large orchestration surface with broad ownership scope.
- Pending asset types (compose vs recording) still have separate render/type lanes instead of one pending-artifact abstraction.
- Video ownership handoff remains sensitive to browser media pipeline timing.
- Polling is controlled and visibility-aware but not yet event-driven.
- Runtime side panel state and grid/preview state remain tightly coupled in the root app surface.
- WebRTC reliability has improved but still relies on polling loops and browser signaling heuristics.

## Feature module map

- `ExplorerApp.tsx`: primary orchestration and route-action boundary.
- `api.ts`: frontend contract surface for backend APIs.
- `components/live/LivePreview.tsx`: viewer answer/ICE/state lane.
- `components/LiveSourceCard.tsx`: live source side-panel card and peer stream preview controls.
- `hooks/useWebRtcLiveSessions.ts`: live session polling and node map utilities.
- `hooks/useRecordingSessions.ts`: runtime recording session lifecycle + browser recorder wiring.
- `runtime/StreamHub.ts`: ephemeral session stream store.
- `utils/runtimeChips.ts`: side-panel live/runtime chip normalization.
- `utils/mediaUrls.ts` + `config/urlPolicy.ts`: browser-safe URL normalization policy.

## Frontend architectural debt to track

1. Break up `ExplorerApp` into focused runtime/live/pending/asset orchestration modules.
2. Promote API client contracts into explicit typed domain modules by feature family.
3. Introduce event-stream consumption (SSE/WebSocket) after backend route/contracts stabilize.
4. Unify pending artifact rendering model for compose + recording lifecycle entities.
5. Add stronger runtime integration checks around live reconnection and recording reconciliation timing.
