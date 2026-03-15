# AGENTS.md -- Codex Operating Guide (Media Sync API)
> Update this file **on every commit**. Treat it like the "handoff contract" for the next agent.

## Mission
Build and maintain a **LAN-only**, **low-overhead**, **containerized Python API** that acts as a *middleman* between:
- **iPhone Shortcuts** (Photos UI/UX for selecting videos)
- **Windows host storage** (SMB-backed project folders)
- (Optional later) **MacBook tooling** (Resolve ingest, metadata, etc.)

The service must:
- Create/list projects
- Upload media into projects
- Avoid duplicates (content-hash de-dupe)
- Maintain an index per project
- Reindex the filesystem so **manual changes outside the API are respected**
- Never store "real" media inside the container filesystem (container is stateless)

---

## Source of Truth Storage
**Windows Host**

- Hostname: `cda-DESKTOP`
- LAN IP: `192.168.0.25`
- Target folder (canonical): `B:\Video\Projects\<project>\`

**SMB view (for clients)**

- `\\192.168.0.25\B\Video\Projects\<project>\` (share name may vary; treat `B:` path as canonical on host)

---

## Non-Negotiable Constraints

1. **LAN-only / no Internet requirement**
   - No cloud dependencies.
   - Designed for `192.168.0.x` home LAN.
2. **Idempotent + reindexable**
   - API can be restarted at any time.
   - If files are added/removed/renamed manually in `B:\Video\Projects`, API must reconcile on next scan.
3. **De-dupe by content hash**
   - Skip duplicates even if filenames differ.
   - Prefer `sha256` stored in sqlite.
4. **Container is a middleman**
   - Do not persist uploads in container layers.
   - All media writes land on **host-mounted volume**.
5. **Minimal overhead**
   - Single container (or compose stack with only what’s necessary).
   - SQLite is acceptable (embedded, zero service ops).

---

## Repository Layout (Expected)

```
/
  AGENTS.md
  README.md
  docker-compose.yaml
  requirements.txt
  docker/
    Dockerfile
    docker-compose.yaml
    docker-bake.hcl
    packages/
      Explorer/          # Next.js App Router explorer package + standalone app
        app/
        src/
        README.md
  app/
    main.py
    config.py
    storage/
      index.py          # index.json + jsonl handling
      dedupe.py         # hashing + sqlite
      reindex.py        # scan filesystem & reconcile db/index
      paths.py          # safe project path handling
    api/
      projects.py       # endpoints: list/create/get
      upload.py         # upload endpoint: stream+hash+dedupe
      sync.py           # sync trigger endpoint (audit/event)
  scripts/
    dev.ps1
    dev.sh
  public/
    index.html
    explorer.html
  tests/
```

---

## API Contract (Must Stay Stable)

Base: `http://192.168.0.25:<PORT>`

### Projects

- `GET /api/projects`
  - returns list of project names + whether index exists
- `POST /api/projects`
  - body: `{ "name": "...", "notes": "..." }`
  - creates folder + seeds index/manifest
- `GET /api/projects/{project}`
  - returns `index.json` content + summary

### Upload (de-dupe)

- `POST /api/projects/{project}/upload`
  - multipart form: `file=<UploadFile>`
  - server streams file to temp, computes `sha256`, checks sqlite
  - if duplicate: discard temp, return existing path
  - if new: move into `ingest/originals/` and record manifest

### Sync Trigger (for iOS Shortcut auditing)

- `POST /api/projects/{project}/sync-album`
  - body: `{ "album_name": "...", "device": "iphone", "note": "..." }`
  - records event only (uploads happen via `/upload`)

### Reindex


- `POST /api/projects/{project}/reindex`
  - scans project folders, computes missing hashes (optionally incremental)
  - reconciles sqlite + index counts + jsonl events

---

## Project Folder Standard (Enforced)
Each project must contain:

```
B:\Video\Projects\<project>\
  index.json
  ingest\
    originals\
    _metadata\
    proxies\
  exports\
  _manifest\
    files.jsonl
    hashes.sqlite
```

### `index.json` semantics

```
- Created once
- Updated on:
  - upload ingested
  - upload duplicate skipped
  - reindex completed
```

---

## iPhone Shortcuts UX (Product Requirement)
The Shortcuts flow must be supported:

1. Fetch `/api/projects`
2. Choose from list OR create new project
3. Ask for input (entry label / notes)
4. Choose videos from Photos
5. Upload each video to `/upload`
6. (Optional) call `/sync-album` once per run

Server-side de-dupe ensures re-sending the same video is safe.

---

## Docker Rules (Correct the README + commands)
### Goal

Run API **on the Windows host** and bind it to the host network so iPhone can reach:
- `http://192.168.0.25:8787` (default)

### docker-compose.yml expectations

- Build image locally
- Bind port to host
- Mount `B:\Video\Projects` into container at `/data/projects`
- Restart always

**Windows volume mount note:** Docker Desktop supports drive mounts. Use:

- `B:/Video/Projects:/data/projects`

---

## Standard Commands
### Build & run (Compose)

```bash
docker compose build
docker compose up -d
```

### Tail logs

```bash
docker compose logs -f
```

### Restart

```bash
docker compose restart
```

### Stop

```bash
docker compose down
```

---

## README.md Must Include (keep updated)

1. LAN URL and port
2. Host path mapping: 
   - Host: `B:\Video\Projects`
   - Container: `/data/projects`
3. How to verify:
   - `GET /api/projects`
4. iPhone Shortcut notes (high level)
5. Troubleshooting:
   - firewall
   - binding to `0.0.0.0`
   - Docker Desktop file sharing for drive `B:`

---

## Engineering Standards

- **No breaking API changes** without updating README + AGENTS.md.
- Always wire new features into **both** API handlers and the static explorers (`public/index.html`, `public/explorer.html`) when user-facing behavior is involved.
- Enforce metadata contracts: originals stay immutable, tags live in `ingest/_metadata/<sha256>.json`, and UI tag actions must call `/api/projects/{project}/media/tags`.
- Update AGENTS.md **and** relevant changelog/implementation notes on **every** patch (no exceptions), even for UI-only changes.
- Safe path handling: reject `..`, slashes, traversal.
- Upload must be streaming (no full file in memory).
- Hashing must be computed as bytes stream.
- Reindex must be incremental + safe on large folders.
- Store events append-only in JSONL.
- Prefer explicit errors and consistent response shapes.

---

## Current Priority Roadmap (Update each commit)

1. ✅ Compose + volume mount stable on Windows (`B:` drive).
2. ✅ Upload endpoint w/ sha256 de-dupe to sqlite.
3. ✅ Project create/list/get + seed index.
4. ✅ Reindex endpoint (scan disk, reconcile db/index).
5. ✅ Minimal web UI for local admin with project/media browsing.
6. ✅ Next.js Explorer package under `/docker/packages/Explorer` for embedding.
7. ⏭ Optional OBS integration + Resolve bridge (separate services).

---

## Definitions (avoid ambiguity)

- **Project** = folder under `B:\Video\Projects\`
- **Entry** = optional metadata record tied to uploads (future)
- **Index** = `index.json` + `_manifest/` (jsonl + sqlite)
- **Hydrate** = upload + index + dedupe + organize into ingest/originals

---

## Agent Notes
If anything conflicts:

- **B:\Video\Projects** is the canonical store.
- Container filesystem is disposable.
- LAN-only first. Everything else is secondary.

### Latest Implementation Notes (2024-06-06)
- FastAPI app lives under `app/` with routers for projects, upload, and reindex.
- Dedupe uses sqlite stored at `<project>/_manifest/manifest.db` with sha256 primary key.
- `index.json` is created on project init and appended to on upload/reindex; reindex rescans `ingest/originals`.
- Docker Compose binds `B:/Video/Projects` to `/data/projects` and exposes `8787`.

The matching **README.md skeleton** and a correct **docker-compose.yml + Dockerfile** that uses `B:/Video/Projects:/data/projects` and binds `0.0.0.0:8787`.

### Latest Implementation Notes (2024-06-21)
- Environment variables renamed to `MEDIA_SYNC_PROJECTS_ROOT`, `MEDIA_SYNC_PORT`, and `MEDIA_SYNC_MAX_UPLOAD_MB` (legacy fallbacks remain for compatibility).
- Health endpoint now available at `/health` with service metadata.
- Uploads log manifest events, enforce upload size limits, and track index counts (videos, duplicates skipped, removed records).
- Reindex cleans up missing files from both the index and sqlite manifest.
- Comprehensive pytest suite added under `tests/` plus Makefile and dev requirements for local runs.
- Static adapter UI lives at `/public/index.html` (also served at `/`) and ships with the image; keep it in sync with README usage steps.
- API responses now include `instructions` hints where possible; keep them actionable and LAN-specific.
- Logging namespace `media_sync_api.*` emits INFO-level breadcrumbs for project creation, uploads, duplicates, sync events, and reindex runs.
- `docker-compose.yml` drops the obsolete `version` key and sets `pull_policy: never` on the service so `docker compose up -d` works without registry authentication.

### Latest Implementation Notes (2024-06-30)
- Upload filenames now reject separators/traversal rather than stripping them; unsafe names return HTTP 400 with a clear error.
- Dedupe records are written after the final destination path (post-collision rename) so duplicate lookups always point to the stored file.
- Project names are auto-sequenced as `P{n}-<label>`; existing `P{n}-*` folders are bootstrapped (index + reindex of `ingest/originals`) on first list/get so host-created projects are ingested idempotently.

### Latest Implementation Notes (2025-02-15)
- Source registry added: `/api/sources` lists/creates/toggles logical project roots, persisting configuration at `<projects_root>/_sources/sources.json`.
- Project, upload, sync, and reindex endpoints accept `?source=<name>` (default `primary` mapped to `/data/projects`) so additional NAS mounts can be indexed without redeploying.
- Makefile test target now uses proper tabs; `make test` runs the pytest suite after installing requirements.

### Latest Implementation Notes (2025-02-18)
- Source toggling now honors disabled entries so previously disabled sources can be re-enabled via `/api/sources/{name}/toggle` without manual file edits.

### Latest Implementation Notes (2025-02-20)
- Media explorer endpoints added:
  - `GET /api/projects/{project}/media` lists indexed files with stream URLs.
  - `GET /media/{project}/{relative_path}` streams media with range support.
- `/api/projects/auto-organize` sweeps loose files in the projects root into `Unsorted-Loose`, seeds index if missing, and reindexes after moves.
- Static adapter at `/public/index.html` now includes a browser-native explorer to list projects, browse media, and play clips inline.
- Tests cover media listing/streaming and auto-organize idempotency; keep adding coverage with new endpoints.
- Reindex endpoint now accepts GET in addition to POST so manual filesystem edits can be reconciled directly from a browser.

### Latest Implementation Notes (2025-02-21)
- Root-level `GET|POST /reindex` reindexes every enabled source and project, seeding missing indexes and skipping invalid directory names.
- Bulk reindex responses now summarize indexed files/projects across sources; logging uses `project_reindexed_bulk` and `root_reindex_complete` events.
- Tests cover cross-source root reindexing to ensure manual file drops are indexed everywhere.

### Latest Implementation Notes (2025-02-22)
- Media listing entries now include `download_url`, and `/media/{project}/download/{relative_path}` forces attachments for offline use.
- Reindexing now relocates supported media files that were dropped outside `ingest/originals/` back into the ingest tree, skipping unsupported extensions.
- Only common media types are indexed (`.mp4`, `.mov`, `.avi`, `.mkv`, `.mp3`, `.wav`, `.flac`, `.aac`, `.jpg`, `.jpeg`, `.png`, `.heic`); others are ignored and pruned from the index during reindex runs.

### Latest Implementation Notes (2025-02-23)
- Project listings now return an `upload_url` scoped to the active source for copy-paste and UI use.
- The static adapter at `/public/index.html` includes a browser upload panel that posts files to the selected project and refreshes media listings after completion.
- Upload UI now exposes a native file picker button (falls back to `.click()` when `showPicker` is unavailable) and prompts users to open it if they try uploading without selecting a file.

### Latest Implementation Notes (2025-02-24)
- `docker-compose.yml` now mounts the working copy into `/app` and runs `uvicorn app.main:app --reload` so code edits on the host trigger hot reloads without rebuilding the image. Remove or override the bind mount/command if running in production.

### Latest Implementation Notes (2025-02-25)
- The adapter page lists configured sources and provides a form to register new destinations via `/api/sources`; `_sources` remains reserved for registry metadata and is hidden from project listings/upload UI.
- The upload picker uses a single native file chooser (input visually hidden, dedicated button triggers `showPicker`/`.click()`); duplicate default browser buttons removed.

### Latest Implementation Notes (2025-02-26)
- Docker/build assets now live under `/docker/` with Compose using `context: ..` and `docker/Dockerfile` so build context stays at the repo root.
- Root-level `docker-compose.yaml` includes `/docker/docker-compose.yaml` for convenience, and the Makefile pins `COMPOSE_FILE := docker/docker-compose.yaml` for `make up|down|build|logs|ps`.
- README references updated compose/bake commands; Bake still runs from repo root with `docker buildx bake -f docker/docker-bake.hcl`.

### Latest Implementation Notes (2025-02-27)
- Bake context updated to `..` in `/docker/docker-bake.hcl` so builds continue to use the repo root even though the bake file lives under `/docker/`.

### Latest Implementation Notes (2025-02-28)
- The stray root-level `docker-compose.yml` has been removed; the canonical stack lives at `docker/docker-compose.yaml` (included via the root `docker-compose.yaml`) and now carries the DaVinci Resolve PostgreSQL service alongside `media-sync-api`.
- Resolve bridge added: `/api/resolve/open` queues jobs for a LAN-only resolve-agent that polls `/api/resolve/jobs/next` then marks `/complete` or `/fail`. UI now exposes an "Open in DaVinci Resolve" control that posts selected media paths from the browser explorer. Keep Resolve path alignment via SMB + Resolve mapped mounts; do not attempt to shell out to launch Resolve from the browser.

### Latest Implementation Notes (2025-03-01)
- Removed the legacy root-level Docker build assets (`Dockerfile`, `docker-bake.hcl`); use the canonical definitions under `/docker/` for Compose and Bake.

### Latest Implementation Notes (2025-03-05)
- The static adapter now ships a unified asset explorer: left rail lists sources + projects with a shared search bar, right pane renders file cards with per-file menus (preview, download, copy stream URL, Resolve queue). Keep future UI tweaks contained to `public/index.html` and preserve the split-pane layout.

### Latest Implementation Notes (2025-03-06)
- A standalone DAM-style explorer now lives at `public/explorer.html` alongside the adapter, keeping the same API endpoints while adding grid/list toggle, inspector drawer, multi-select action bar, and Resolve/upload controls. Keep this page no-build and in sync with API shapes; prefer reusing the existing endpoints over adding new ones for UI-only tweaks.

### Latest Implementation Notes (2025-03-08)
- Stream URL copy actions in `public/index.html` and `public/explorer.html` now normalize to absolute URLs based on the current host origin so clipboard copies include the active domain.

### Latest Implementation Notes (2025-03-09)
- Added `/docker/packages/Explorer` as a Next.js App Router package with a standalone dev app and embeddable `ExplorerApp` component.
- The package mirrors `/public/explorer.html` behaviors, includes shared TS modules (`api`, `state`, `types`), and ships CSS with improved responsive header stacking.
- Added a minimal package README plus a Node test to validate exports and standalone entrypoints.

### Latest Implementation Notes (2025-03-10)
- Tests now insert the repo root into `sys.path` in `tests/conftest.py` so pytest can import `app` without requiring external PYTHONPATH tweaks.

### Latest Implementation Notes (2025-03-11)
- The Next.js Explorer now resolves media/thumb URLs against the configured API base to avoid cross-origin 404s when embedded.
- Explorer package tests assert that API URL resolution is wired in the component.

### Latest Implementation Notes (2025-03-12)
- Root compose now includes `docker/docker-compose.explorer.yaml`, which builds `/docker/Explorer/Dockerfile` to run the Next.js Explorer UI on port 8790 alongside the FastAPI service.
- Explorer UI container mounts the same projects volume and depends on the shared resolve-postgres service for parity with the rest of the stack.

### Latest Implementation Notes (2025-03-13)
- Added auto-reindexer background task (controlled by `MEDIA_SYNC_AUTO_REINDEX` + interval) to keep indexes synced with filesystem changes.
- Media API now supports delete and move operations; the UI explorers support drag-and-drop upload, download drag-out, and project-to-project move gestures.

### Latest Implementation Notes (2025-03-14)
- Updated `public/index.html` with OpenAPI links and curl examples covering schema discovery, uploads, downloads, and media move/delete endpoints.

### Latest Implementation Notes (2025-03-15)
- Normalized Explorer inspector tag/AI tag formatting with a shared helper to keep metadata rows strictly typed during Next.js builds.

### Latest Implementation Notes (2025-03-16)
- Ensured Explorer inspector metadata rows keep tuple typing through filtering to prevent Next.js type-check failures.

### Latest Implementation Notes (2025-03-17)
- Ensured the Explorer Docker build creates a public directory in the builder stage so runtime COPY steps always succeed.

### Latest Implementation Notes (2025-03-18)
- Explorer UIs now use solid inspector panels (no blur) with improved mobile topbar layout and horizontal action scrolling; Next.js explorer infers the LAN API base from the browser host when a container-only hostname is configured.
- Explorer side drawers now use fully opaque backgrounds and pointer-event isolation to prevent clicking through to the main canvas.

### Latest Implementation Notes (2025-03-19)
- Explorer badges/selector overlays drop remaining blur filters, the mobile topbar action row wraps again for small screens, and upload URLs no longer inject `source=undefined` when building upload requests.

### Latest Implementation Notes (2025-03-20)
- Explorer topbar spacing is tightened with a single mobile Projects toggle, drawer backdrops are lighter to keep previews clickable, select menus render with dark options, and grid cards are scaled down.

### Latest Implementation Notes (2025-03-21)
- Explorer topbar now keeps a single-row layout with an Actions dropdown panel, sidebar background opacity increased with scrollable content, and media grids shortened to reduce tall tiles.

### Latest Implementation Notes (2025-03-22)
- Explorer API base inference now preserves same-origin defaults when the base URL is empty, avoiding unintended :8787 overrides.

### Latest Implementation Notes (2025-03-23)
- Asset metadata sidecars are now stored under `ingest/_metadata/<sha256>.json`; uploads, moves, and reindex runs create or update them while deletes clean them up. Tests validate metadata creation on upload and reindex.

### Latest Implementation Notes (2025-03-24)
- Added `/api/projects/{project}/media/tags` to add/remove manual tags in metadata sidecars, and updated the explorer UI to expose tag controls for selected assets and the inspector drawer.

### Latest Implementation Notes (2025-03-25)
- Deleting or moving media now preserves metadata sidecars when another index entry shares the same sha256, removing sidecars only after the last path is removed.

### Latest Implementation Notes (2025-03-26)
- Explorer selection bar now focuses on tag, move, and copy stream URL actions while batch delete stays in the Actions panel; the drawer action pill remains Tag for focused assets.

### Latest Implementation Notes (2025-03-27)
- Explorer top bar now uses the brand/logo as the Projects toggle; the separate Projects pill has been removed so only search + Actions remain.

### Latest Implementation Notes (2025-03-28)
- Explorer move target selection now encodes source/name as JSON to avoid move failures, and topbar subtitle truncates to avoid overflowing the search/actions row.

### Latest Implementation Notes (2025-03-29)
- Drawer tagging panel now overlays the preview area instead of shrinking the media viewport; the Tag pill toggles the overlay.

### Latest Implementation Notes (2025-03-30)
- Added disabled-by-default NDI compose stubs under the `ndi` profile to prevent orphan warnings while keeping NDI containers off until explicitly enabled.

### Latest Implementation Notes (2025-03-31)
- Added clipboard copy fallbacks (execCommand + prompt) across the static explorers and the Next.js Explorer so copy actions work on restrictive mobile browsers.

### Latest Implementation Notes (2025-04-01)
- Refreshed `public/explorer.html` topbar branding to “Cdaprod’s Asset Explorer” with gradient text and a polished logo hover sheen while keeping the layout dimensions unchanged.

### Latest Implementation Notes (2025-04-02)
- Tuned `public/explorer.html` motion to use settle/snappy easing with transform/opacity-only transitions for drawer/sidebar/asset interactions plus reduced-motion safeguards.

### Latest Implementation Notes (2025-04-03)
- Reworked `public/explorer.html` topbar branding to a compact “Cdaprod’s Explorer” title with a toggle animation to “Cdaprod’s Projects,” removed the logo block, and simplified the subline to `media-sync-api`.

### Latest Implementation Notes (2025-04-04)
- Tightened the explorer topbar brand sizing and made the title button the sole projects-toggle trigger for a cleaner left-side footprint.

### Latest Implementation Notes (2025-04-05)
- Fixed the explorer topbar title gradient so the primary label remains visible by applying the gradient to the title spans instead of the heading container.

### Latest Implementation Notes (2025-04-06)
- Explorer UIs now load an all-projects media feed on first visit, sorting assets by most recent timestamps and annotating entries with project labels while keeping project-only actions disabled until a project is selected.

### Latest Implementation Notes (2025-04-07)
- Explorer media sorting now falls back to filename timestamps for camera-style names, and thumbnail rendering uses SVG fallbacks plus error handlers to avoid broken previews.

### Latest Implementation Notes (2025-04-08)
- Explorer thumbnail extraction now seeks near the start of videos and adds a time hint fragment to reduce slow loads while keeping fallback posters visible.

### Latest Implementation Notes (2025-04-09)
- Upload responses now include absolute `served.stream_url` and `served.download_url`, and batch upload sessions (`/upload-batch/start`, per-file `?batch_id=`, `/upload-batch/finalize`) aggregate served URLs for iOS Shortcut repeat loops.

### Latest Implementation Notes (2025-04-10)
- Consolidated batch handling into `POST /api/projects/{project}/upload` using `op=start|upload|finalize|snapshot`, added multi-file support via `files[]`, and kept legacy `/upload-batch/*` aliases pointing to the new flow.

### Latest Implementation Notes (2025-04-11)
- README now emphasizes batch start/finalize as the recommended Shortcut flow for getting aggregated served URLs from repeat uploads.

### Latest Implementation Notes (2025-04-12)
- The explorer inspector drawer now includes a “Send to OBS” pill that calls OBS WebSocket v5 to update the `ASSET_MEDIA` Browser Source URL and attempts a cache refresh.

### Latest Implementation Notes (2025-04-13)
- The explorer "Send to OBS" action now uses the configured OBS WebSocket password (`123456`) when connecting.

### Latest Implementation Notes (2025-04-14)
- Added a Program Monitor handoff action to the explorer multi-select bar, sending ordered selected stream URLs via postMessage using a dedicated handoff module and data attributes on media cards.

### Latest Implementation Notes (2025-04-15)
- Program Monitor handoff now reuses explorer DOM-order URL helpers, hides the button until selections exist, and aligns selection classes with `.is-selected` for DOM order traversal.

### Latest Implementation Notes (2025-04-16)
- Program Monitor handoff now uses a direct `window.open` and posts messages to the monitor origin to improve mobile Safari delivery.

### Latest Implementation Notes (2025-04-17)
- Updated the Program Monitor handoff URL to target `/program-monitor/index.html` for the monitor route.

### Latest Implementation Notes (2025-04-18)
- Program Monitor handoff now sends the import payload once per handoff to prevent duplicate nodes while still waiting for ACK.

### Latest Implementation Notes (2025-04-19)
- Program Monitor handoff clears the retry timer on ACK to stop duplicate postMessage sends.

### Latest Implementation Notes (2025-04-20)
- Explorer UIs now sort recent media using uploaded/indexed timestamps when available, keeping newest uploads first on initial load.

### Latest Implementation Notes (2025-04-21)
- Explorer media type definitions now include uploaded/indexed timestamp fields to keep Next.js builds passing.

### Latest Implementation Notes (2025-04-22)
- Explorer UIs now persist generated video thumbnails in Cache Storage (with localStorage fallback) keyed by sha256/relative path so refreshes reuse cached thumbs instead of re-extracting frames.

### Latest Implementation Notes (2025-04-23)
- Explorer video thumbnail caching now includes project/source in cache keys and retries failed frame extraction a few times instead of giving up after the first error.

### Latest Implementation Notes (2025-04-24)
- Explorer thumbnail persistence no longer writes base64 data into localStorage; Cache Storage now stores JPEG blobs and renders immediately before best-effort cache writes to avoid iOS quota stalls.

### Latest Implementation Notes (2025-04-25)
- Next.js Explorer MediaItem typing now includes optional project/source aliases to keep cache-key fallbacks building in production.

### Latest Implementation Notes (2025-04-26)
- Explorer UIs now queue thumbnail extraction with visibility sweeps and improved video frame capture fallbacks to reduce sparse thumbnail misses during scrolling or large lists.

### Latest Implementation Notes (2025-04-27)
- Explorer thumbnail sweeps now skip hidden list/grid targets to avoid double extraction, and the static explorer bundles obs-websocket-js locally with a loader to keep the Send to OBS action available on LAN-only hosts.

### Latest Implementation Notes (2025-04-28)
- The static explorer now resolves OBS input targets by name (including scene fallbacks and fuzzy matches) before sending URLs, reducing “specified source is not an input” errors.

### Latest Implementation Notes (2025-04-29)
- The static explorer now pushes media to a dedicated OBS Browser Source using a clean `/player.html` URL, applies base-resolution sizing + scene transforms, and warns when inputs are shared across scenes.

### Latest Implementation Notes (2025-04-30)
- OBS send workflow now uses a dedicated browser-source push helper with bounds-based transforms, rerouted audio, and optional exclusivity cleanup while relying solely on input lookups (no scene fallback).

### Latest Implementation Notes (2025-05-01)
- Split the static OBS helper into `public/js/obs-push.js` and kept `public/js/obs-websocket.js` as the vendor bundle, updating the explorer loader and tests accordingly.

### Latest Implementation Notes (2025-05-02)
- Made the OBS push helper idempotent by falling back to `SetInputSettings` when a Browser Source already exists with the target input name.

### Latest Implementation Notes (2025-05-03)
- Handle OBS “source is not an input” errors by generating a unique Browser Source name when a conflicting non-input source exists.

### Latest Implementation Notes (2025-05-04)
- Added a retrying Browser Source creator to avoid “already exists” errors even when OBS races on name creation.

### Latest Implementation Notes (2025-05-05)
- OBS Browser Source creation now accounts for scene name collisions when generating unique input names to avoid name conflicts with scenes.

### Latest Implementation Notes (2025-05-06)
- OBS player URLs now point at same-origin `/player.html` to avoid 404s when serving the explorer from the API host.

### Latest Implementation Notes (2025-05-07)
- The OBS player page is now served at `/player.html`, OBS transforms center on the canvas, and the helper sticks to a canonical input name while cleaning up `ASSET_MEDIA (n)` duplicates.

### Latest Implementation Notes (2025-05-08)
- OBS scene item transforms now snap to the actual canvas size via `GetVideoSettings`/`GetSceneItemTransform`, scaling to cover/contain without relying on hard-coded dimensions.

### Latest Implementation Notes (2025-05-09)
- OBS transforms now reset without zero-sized bounds and retry scene item sizing to avoid `boundsWidth` validation errors before scaling.

### Latest Implementation Notes (2025-05-10)
- OBS browser source snapping now uses `GetInputSettings` width/height and bounds scaling against the canvas to avoid transform-size drift.

### Latest Implementation Notes (2025-05-11)
- OBS push now warns when output resolution is far smaller than the canvas size to flag low-res output scaling.

### Latest Implementation Notes (2025-05-12)
- OBS browser-source push now builds player URLs from the media origin, uses a strict scene item lookup before creation, and only removes numbered duplicate inputs during cleanup.

### Latest Implementation Notes (2025-05-13)
- OBS browser-source transforms now anchor at the top-left with bounds alignment reset to avoid off-center positioning.

### Latest Implementation Notes (2025-05-14)
- OBS browser-source transforms now use explicit top-left alignment constants to prevent center-origin offsets in OBS scenes.

### Latest Implementation Notes (2025-05-15)
- OBS browser-source transforms now stretch to the canvas so the player handles cover/contain while edges align to the scene bounds.

### Latest Implementation Notes (2025-05-16)
- Reindexing and media listings now skip thumbnail-style assets (e.g., thumb directories or `.thumb.` filenames) so explorers do not index generated previews.

### Latest Implementation Notes (2025-05-17)
- Explorer UI search now includes an inline type filter, the Actions panel adds sort + quick filter toggles (selected/untagged), and both static + Next.js explorers persist these choices in localStorage; update type/sort options by editing `mediaType`/`sortMediaItems` in `public/explorer.html` and `getMediaType`/`sortMedia` in `docker/packages/Explorer/src/state.ts`, plus their option lists in the UI markup/components.

### Latest Implementation Notes (2025-05-18)
- The search type filter now uses a custom dropdown (details/summary + styled menu) to avoid native select styling; keep the type list in sync across `public/explorer.html` and `docker/packages/Explorer/src/ExplorerApp.tsx` along with shared dropdown styles in `docker/packages/Explorer/src/styles.css`.

### Latest Implementation Notes (2025-05-19)
- The action-panel sort control now uses a custom dropdown overlaying the hidden sort `<select>` (still driving state changes) so native select styling never shows; keep sort labels and option lists aligned in `public/explorer.html` and `docker/packages/Explorer/src/ExplorerApp.tsx`.

### Latest Implementation Notes (2025-05-20)
- Explorer type filtering now recognizes `.avi` as a video extension in both static and Next.js explorers to match backend video allowlists.

### Latest Implementation Notes (2025-05-21)
- Explorer grids now use responsive 3/5-column layouts with orientation-aware media frames, applying thumb-based orientation inference in both the static and Next.js explorers.

### Latest Implementation Notes (2025-05-22)
- Explorer topbars now auto-hide via a shared intent controller and reveal zone, reusing the same hover/intent logic for dropdown menus in both static and Next.js explorers.


### Latest Implementation Notes (2026-03-15)
- Explorer package now includes behavior-first typed migration primitives in `src/utils.ts`: Program Monitor handoff payloading/ACK flow, OBS push adapter guardrails, mock/preview boot decisions, and URL/copy fallbacks parity helpers (ported from static explorer scripts without cross-importing `/public`).
- Next.js Explorer now uses helper-driven mock boot fallback + idempotent selected action refs (`source|project|relative_path`) to keep repeated delete/handoff actions deterministic in all-project contexts.

### Latest Implementation Notes (2025-05-23)
- Explorer assets now use unified pointer handlers for tap/preview/long-press context menus, include drag-hover project assist on the brand toggle, and ship a shared context menu in static + Next.js explorers.

### Latest Implementation Notes (2025-05-24)
- Fixed Next.js explorer orientation inference typing with image/video guards and restored the static explorer topbar markup after context menu wiring.

### Latest Implementation Notes (2025-05-25)
- Explorer topbar/drag rules now honor hover-vs-touch intent, pointer-based drag/drop replaces HTML5 drag, and grids use column packing to avoid empty rows.

### Latest Implementation Notes (2025-05-26)
- Explorer drag/drop now resolves drop targets via pointer position instead of HTML5 drag events, with updated top-edge hotzones and thresholds.

### Latest Implementation Notes (2025-05-27)
- Fixed Next.js Explorer toast hook dependencies to avoid build-time scope errors.

### Latest Implementation Notes (2025-05-28)
- Metadata sidecar updates now persist ingest/schema/tag defaults when existing entries are missing or outdated, ensuring updates are written during ensure_metadata calls.

### Latest Implementation Notes (2025-05-29)
- Restored all-project preview taps in the explorers while keeping selection gated to active projects, and tightened context-menu item selection typing to keep Next.js builds green.

### Latest Implementation Notes (2025-05-30)
- Explorer grid tiles are now tighter and near-borderless with minimal rounding, and filename/path metadata renders as a translucent overlay on top of thumbnails in both static and Next.js explorers.

### Latest Implementation Notes (2025-05-31)
- Explorer grid overlays are now unified into a single HUD layout (badges, size, checkbox, metadata) to prevent collisions, with tighter gaps and landscape/portrait aspect ratios shifted toward near-square tiles.

### Latest Implementation Notes (2025-06-01)
- Explorer grids now cache asset orientation per thumbnail key and lock card ratios when cached or provided, reducing layout shifts while thumbs load and persisting orientation in localStorage for fast re-renders.

### Latest Implementation Notes (2025-06-02)
- Explorer thumbnails now prefetch earlier via expanded IntersectionObserver root margins and eager-load the first grid screenful to avoid “only after scroll” delays.

### Latest Implementation Notes (2025-06-03)
- Explorer layout now uses a single content surface with loading veil; eager thumbnails gate initial render to avoid placeholder pop-in, and grid density/radius tightened for a masonry-like feel.

### Latest Implementation Notes (2025-06-04)
- Next.js Explorer styles now match the tightened grid density and reduced tile radius used by the static explorer to keep the layout consistent.

### Latest Implementation Notes (2025-06-05)
- Explorer content surface styling is now fully transparent (no border/shadow) with a softened header strip, removing the remaining container outline so the grid sits directly on the ambient backdrop.

### Latest Implementation Notes (2025-06-06)
- Explorer headers now use translucent glass styling with backdrop blur to let scrolled assets subtly show behind the section header and topbar.

### Latest Implementation Notes (2025-06-07)
- Explorer scroll containers now live on the content surface so media can scroll beneath the fixed glass topbar/section headers in both the static and Next.js explorers.

### Latest Implementation Notes (2025-06-08)
- Added `/thumbnails/{project}/{sha256}.jpg` to serve cached JPEG thumbnails from `ingest/thumbnails`; thumbnails are generated on demand (ffmpeg) and cached with immutable headers, and project scaffolding now creates `ingest/thumbnails` alongside originals + metadata.
- Static and Next.js explorers now request server thumbnail URLs and load them with an in-order, concurrency-limited queue to avoid placeholder flashes on refresh while keeping thumbnail orientation caching intact.

### Latest Implementation Notes (2025-06-09)
- Explorer thumbnail loaders now normalize `thumb_url` values that point at `127.0.0.1`/`localhost` so mobile clients always fetch thumbnails from the current LAN origin.

### Latest Implementation Notes (2025-06-10)
- Thumbnail URLs are only advertised when a cached thumbnail exists or ffmpeg is available; missing ffmpeg now returns a 404 from the thumbnail endpoint to avoid persistent 503 noise.

### Latest Implementation Notes (2025-06-11)
- API container now installs ffmpeg in `/docker/Dockerfile` so video thumbnail generation works out of the box; rebuild the image if thumbnails report ffmpeg missing.

### Latest Implementation Notes (2025-06-12)
- Thumbnail generation now runs ffmpeg with no-stdin, audio disabled, and a timeout to avoid 40s hangs; timeouts surface as 500 errors while missing ffmpeg still returns 404.

### Latest Implementation Notes (2025-06-13)
- Media listings now always include thumbnail URLs for thumbable assets, and the thumbnail endpoint serves a short-lived SVG fallback when ffmpeg is unavailable or thumbnail generation fails/timeouts.

### Latest Implementation Notes (2025-06-14)
- Image thumbnails now render from the actual asset using Pillow (EXIF-aware) while videos continue to use ffmpeg; SVG fallbacks only apply when generation fails or ffmpeg is unavailable for videos.

### Latest Implementation Notes (2025-06-15)
- Video thumbnailing now logs ffmpeg stderr tail, uses fast-then-safe seeks with configurable timeouts and max width, and guards generation with per-thumb locks while fallback responses include an `X-Thumb-Status` header.

### Latest Implementation Notes (2025-06-16)
- ffmpeg failure logs now emit stderr tail inline for visibility, and image thumbnail scaling respects the same `MEDIA_SYNC_THUMB_MAX_W` cap as videos.

### Latest Implementation Notes (2025-06-17)
- Video thumbnailing adds a third slow ffmpeg fallback, maps the first video stream explicitly, and logs stdout tail alongside stderr; thumbnail seek/timeouts are now configurable via `MEDIA_SYNC_THUMB_SEEK_S` and `MEDIA_SYNC_THUMB_TIMEOUT_SLOW_S`.

### Latest Implementation Notes (2025-06-18)
- Thumbnail temp files now use a `.tmp.jpg` suffix and ffmpeg is forced to `image2` output to avoid muxer errors when writing temp thumbnails.

### Latest Implementation Notes (2025-06-19)
- Explorer grids now use responsive column widths for a justified masonry layout, keeping orientation-aware thumbnail aspect ratios intact in both static and Next.js explorers.

### Latest Implementation Notes (2025-06-20)
- Explorer sidebars now stay collapsed by default across viewports, with brand-title toggles to open the drawer and mobile no longer overriding masonry columns with fixed grid templates.

### Latest Implementation Notes (2025-06-21)
- Moved the Projects sidebar section header inside the explorer scroll container so it sticks and hands off cleanly to the other section headers.

### Latest Implementation Notes (2025-06-22)
- Sidebar section headers now stick to the top of the sidebar scroll region (no topbar offset) so the Projects header sits flush above the chips.

### Latest Implementation Notes (2025-06-23)
- Added in-place orientation normalization for rotated videos via `POST /api/projects/{project}/media/normalize-orientation` (dry-run supported). The flow uses ffprobe/ffmpeg, updates existing index + manifest rows without new assets, and cleans up old sha256 metadata/thumbnail sidecars when no longer referenced. Static explorers now include a Normalize Orientation action in their top-level controls.

### Latest Implementation Notes (2025-06-24)
- Reindexing and media listing now skip temporary artifacts (`.tmp.*`, `.bak.*`, `.lock`) so orientation normalization temp files are never indexed and normalize runs ignore temp entries instead of reporting missing_on_disk.

### Latest Implementation Notes (2025-06-25)
- Added a global orientation normalization endpoint at `/api/media/normalize-orientation` (all enabled sources by default) and updated the explorer UI to run normalization from the All Projects view with an in-UI modal instead of the browser confirm dialog.

### Latest Implementation Notes (2025-06-26)
- Explorer normalize-orientation flow avoids nullish coalescing in client JS to keep the All Projects boot path compatible with older Safari builds (prevents the projects/sources list from failing to render).

### Latest Implementation Notes (2025-06-27)
- Explorer HTML escaping now avoids the `??` operator to prevent syntax errors on older Safari builds that blocked project/source rendering.

### Latest Implementation Notes (2025-06-28)
- Explorer HTML escaping now uses regex replacements instead of `replaceAll` to keep the static explorer compatible with older Safari builds.

### Latest Implementation Notes (2025-06-29)
- Orientation normalization endpoints now accept GET fallbacks (query-driven dry_run) and the static explorers retry normalization requests via GET when POST returns 405.

### Latest Implementation Notes (2025-06-30)
- Explorer now falls back to the default API port (8787) if same-origin source/project fetches fail, ensuring projects/media still load when the UI is served from another port.

### Latest Implementation Notes (2025-07-01)
- Explorer boot now retries source/project loads once before rendering media, and normalization requests use the shared API fetch helper for POST/GET fallback handling.

### Latest Implementation Notes (2025-07-02)
- Reverted explorer-side orientation normalization controls and API-port fallback/retry boot logic; explorer boot again relies on direct same-origin source/project/media loading for stability.

### Latest Implementation Notes (2025-07-03)
- Reindex now runs orientation normalization for rotated videos before hashing/index upserts, keeping manifest/index SHA values aligned with post-normalized bytes while preserving temp-artifact skipping.

### Latest Implementation Notes (2025-07-04)
- Normalize-orientation GET endpoints now enforce `limit>=1` at query parsing, and batch normalization now updates in-memory sha→path tracking so shared-old-sha metadata/thumbnail sidecars are cleaned up once orphaned.

### Latest Implementation Notes (2025-07-05)
- Added `POST /api/projects/{project}/media/reconcile` to classify origin, detect display-matrix rotation, plan/apply canonical renames, and persist alias/origin metadata while reusing reindex orientation normalization.

### Latest Implementation Notes (2025-07-06)
- Project reconcile now avoids running reindex for `dry_run=true` requests and only allows reindex-time video normalization when `normalize_orientation=true` on apply runs.
- Reindex metadata cleanup now tracks in-index sha reference counts so shared sha sidecars are only removed when the last referencing path is gone.

### Latest Implementation Notes (2025-07-07)
- Reindex sha-sidecar cleanup now uses a dedicated refcount decrement helper so shared metadata removal logic is centralized and consistently applied for hash changes and missing-path cleanup.
- Reindex shared-sha regression coverage now verifies both behaviors: sidecar stays while one duplicate remains and is removed after the last duplicate changes.
- OBS player overlay now supports tap-to-toggle play/pause, grayscale + pause icon overlay when paused, and external control via BroadcastChannel, postMessage, or hash commands.

### Latest Implementation Notes (2025-06-24)
- OBS player/controller now derive pair keys from `src` (or explicit `pair`), announce presence on `obs-player-registry`, and use pair-scoped BroadcastChannels with idempotent commands; the player shows a copyable pair badge and the controller page provides pair-aware controls.

### Latest Implementation Notes (2025-06-25)
- Rebuilt the OBS player controller as a touch-first grid UI with scroll/gesture suppression, pair-aware discovery, and idempotent controls aligned to the player BroadcastChannel protocol.

### Latest Implementation Notes (2025-06-26)
- Player `setSrc` idempotency now normalizes media URLs before comparing current vs requested sources so relative `/media/...` inputs don't cause unnecessary reloads.

### Latest Implementation Notes (2025-06-27)
- OBS push helper and explorer UI now support selecting one of four ASSET_MEDIA slots, passing slot-aware pair keys into `/player.html` so each browser source can be controlled independently.

### Latest Implementation Notes (2025-06-28)
- OBS push helper now auto-creates missing ASSET_MEDIA_{n} scenes and uses slot-specific source names (ASSET_MEDIA_{n}_SOURCE) so multi-slot pushes are idempotent and correctly named.

### Latest Implementation Notes (2025-06-29)
- Player script now avoids optional chaining/nullish coalescing for broader browser-source compatibility while keeping the same defaults and channel behavior.

### Latest Implementation Notes (2025-06-30)
- Player badge copy action now places the full player controller URL (including pair/src/id/scope) on the clipboard for direct browser pastes.

### Latest Implementation Notes (2025-07-01)
- OBS player boot flow now suppresses the paused overlay on initial load, fades in from black via a curtain overlay, and re-arms boot when sources change to avoid flicker.

### Latest Implementation Notes (2025-07-02)
- Player badge copy now uses the current video source when building the controller URL so runtime setSrc updates are reflected.

### Latest Implementation Notes (2025-07-03)
- OBS player now defaults loop=0 so clips play once unless explicitly restarted or loop enabled.

### Latest Implementation Notes (2026-02-19)
- Added authoritative registry endpoints `GET /api/registry/{sha256}` and `POST /api/registry/resolve` so external consumers can resolve canonical path/origin/orientation/aliases from sha256 identity.
- Reconcile flags now support explicit `apply` semantics: `dry_run=true` is plan-only (no renames/normalization/metadata writes), while `apply=true` (or `dry_run=false`) enables canonical rename + metadata persistence and optional normalization.
- Canonical filenames now sanitize origin segments for deterministic naming; reconcile renames persist alias history in metadata sidecars and invalidate SHA thumbnails on rename.

### Latest Implementation Notes (2026-02-19, follow-up)
- Added `GET /api/projects/{project}/media/query` with origin/time window filters plus pagination (`limit`/`offset`) and stable ordering (`creation_time`, then `sha256`) for timeline assembly inventory lookups.
- Explorer Program Monitor handoff now includes `selected_assets` metadata (`asset_ids`, fallback relative paths, origin hints, creation times) alongside legacy node stream URLs so downstream assemblers can remain sha256-first while keeping backward compatibility.

### Latest Implementation Notes (2026-02-19, all-projects + legacy resolve)
- Explorer all-projects mode now keeps asset checkboxes and Program Monitor handoff enabled without requiring a project folder selection first.
- Program Monitor handoff payload now includes richer `selected_assets` metadata (`sha256`, per-item project/source/relative_path/stream_url`) while preserving legacy node URL payload compatibility.
- Registry batch resolve now accepts `fallback_paths` entries containing stream URLs or `project/relative_path` values and resolves them to full registry records for retroactive legacy node upgrades.
- Explorer inspector preview now appends a registry section (asset_id, canonical name, origin, creation, orientation, aliases, stream/download) using `/api/registry/{sha256}` when hash data is present.

### Latest Implementation Notes (2026-02-19, media facts + resolve hardening)
- Added `GET /api/media/facts` for best-effort ffprobe metadata (duration, dimensions, fps, codecs, audio channels) so explorer previews can show real media facts without blocking UI on failures.
- Registry fallback path normalization now explicitly supports full stream URLs, `/media/<project>/<relative>` paths, and `project/relative` strings for retroactive legacy node resolution.
- Explorer inspector now fetches media facts from `/api/media/facts` and renders unknown-safe values when probe data is unavailable.

### Latest Implementation Notes (2026-02-19, timeline anchors)
- Registry responses and `/api/media/facts` now include `timeline` anchors (`anchor_time`, `anchor_source`, `confidence`) so downstream timeline assembly can align clips deterministically.
- `/api/media/facts` now returns numeric `duration_seconds` (with legacy `duration_s` retained) plus existing media facts for compatibility.
- Timeline anchor selection is best-effort and deterministic: prefer creation tags, then timecode hints, then filesystem mtime fallback.

### Latest Implementation Notes (2026-02-19, inspector + iOS touch fixes)
- Explorer inspector details now use token/key-guarded section rendering so async facts/registry responses cannot duplicate rows or update stale assets after focus changes.
- Inspector Play button now rebinds stream source, calls `load()`, and then `play()` from the click gesture for improved iOS Safari reliability.
- Card interactions now suppress iOS callout/text-selection in grid/list surfaces and tighten pointer handlers to reduce flash-without-open cases while keeping checkbox multi-select behavior intact in all-projects mode.

### Latest Implementation Notes (2026-02-22)
- Added compose endpoints without changing existing upload semantics:
  - `POST /api/projects/{project}/compose` composes already-indexed project-relative inputs into one output.
  - `POST /api/projects/{project}/compose/upload` stages multipart clips under `MEDIA_SYNC_TEMP_ROOT`, composes one output, and always deletes the temp job directory in `finally`.
- Compose outputs are registered like normal assets (sha256 dedupe, metadata sidecar, index append, events) and returned with `served.stream_url` / `served.download_url` including source scoping.
- Added `MEDIA_SYNC_TEMP_ROOT` (default `/tmp/media-sync-api`) to keep compose staging outside project roots so explorers only discover final project artifacts.

### Latest Implementation Notes (2026-02-22, compose hardening follow-up)
- Hardened compose temp isolation: compose-upload now rejects `MEDIA_SYNC_TEMP_ROOT` values that are under any enabled source root to prevent temporary clips from being discovered by explorer scans.
- Compose endpoints now default to non-destructive output behavior with `allow_overwrite=false`; existing output names return HTTP 409 unless callers explicitly opt in.
- `auto` concat mode now uses ffprobe stream/format signatures (video + audio fields) before attempting stream copy, falling back to encode for incompatible inputs.
- Added compose tests for overwrite conflict handling, cleanup on compose failure, source-scoped URL query preservation, and temp-root isolation guardrails.


### Latest Implementation Notes (2026-02-22, compose guard/compatibility refinement)
- Compose environment validation now runs for both compose entrypoints (`/compose` and `/compose/upload`) and rejects temp roots that resolve under project/source roots (symlink-safe via resolved paths).
- Copy-mode compatibility checks now focus on stream-level ffprobe fields (video/audio codec params + timing/extradata) without container-format matching to reduce unnecessary encode fallback.


### Latest Implementation Notes (2026-02-22, compose robustness follow-up)
- Temp-root isolation now validates against enabled SourceRegistry roots as the primary scan surface and returns HTTP 503 for compose misconfiguration instead of generic 500 errors.
- Compose no longer reports speculative `temp_cleaned`; cleanup remains `finally`-enforced while tests assert no leftover `compose_*` job directories.
- `mode=auto|copy` compatibility checks were narrowed to practical stream invariants (video/audio codec + shape/rate layout fields), and ffmpeg failures now return both stderr/stdout tails for debugging.
- Compose-existing now requires inputs to already exist in `index.json` entries to enforce the indexed-asset contract.

### Latest Implementation Notes (2026-02-22, compose stability polish)
- Compose temp-root validation now falls back to the default source root when enabled-source enumeration returns empty, avoiding false 503 failures during bootstrap while still failing closed on source-enumeration exceptions.
- Compose temp job cleanup uses defensive `rmtree(..., ignore_errors=True)` so cleanup failures cannot mask the original upload/ffmpeg error.
- ffmpeg `-n` race failures that report existing output now map to HTTP 409, and compose-existing index-miss errors now cap the response preview to avoid oversized error bodies.

### Latest Implementation Notes (2026-02-22, compose race-detection polish)
- Compose existing-output race detection now also recognizes ffmpeg "not overwriting" wording in addition to "file exists/already exists" so `allow_overwrite=false` races consistently map to HTTP 409.
- Compose race mapping test now uses a realistic `subprocess.CompletedProcess` stub for clearer parity with production subprocess behavior.

### Latest Implementation Notes (2026-02-22, compose style cleanup)
- Added the missing blank line between compose helper definitions around ffmpeg race detection/error formatting to keep style/lint output clean and diffs easier to scan.

### Latest Implementation Notes (2026-02-22, compose overwrite correctness)
- Compose overwrite flows now clear stale manifest/index state for the destination `relative_path` before writing new output bytes (`allow_overwrite=true`), preventing duplicate index rows and outdated sha mappings from pointing to overwritten files.
- Added explicit compose output-name validation helper so invalid `output_name` inputs return HTTP 400 (matching upload-style validation) instead of bubbling as 500 errors.
- Added compose tests covering overwrite idempotency for a shared output path and invalid compose-upload output name handling.

### Latest Implementation Notes (2026-02-23, docs compose quickstart refresh)
- Updated `public/index.html` playbook steps to document compose endpoints alongside upload flow, including request examples for `/api/projects/{project}/compose` and `/api/projects/{project}/compose/upload`.
- Added iPhone Shortcut guidance for compose workflows (multipart repeated `files` fields, JSON body for indexed `relative_paths`, and overwrite/conflict semantics).
- Clarified that compose responses include `served.stream_url` / `served.download_url` and that `allow_overwrite=false` returns HTTP 409 when destination output already exists.


### Latest Implementation Notes (2026-02-23)
- Restored `public/explorer.html` bottom selection bar behavior by keying selection state with `source::project::relative_path`, allowing selection/actions in All Projects scope without requiring an active project.
- Selection-driven utilities (selected-only filter, DOM-order URL copy, context menu, drag/move) now use the composite selection key and `.is-selected` class consistently.
- Added a bottom-bar “Compose Video(s)” action that posts selected videos (in selection order) to `POST /api/projects/{project}/compose` and refreshes media after success.
- Updated static explorer regression tests to assert composite selection-key wiring and compose action presence.


### Latest Implementation Notes (2026-02-23, selection hidden-filter fix)
- Explorer selection resolution now falls back to the full `state.media` list when a selected item is hidden by active filters/search, preventing selected-action no-ops with non-zero selection counts.
- Selection-driven actions (tag/move/delete/resolve/compose and URL derivation) now use a shared `selectionItemByKey` helper so hidden-but-selected assets remain actionable until explicitly cleared.
- Added static regression assertions to verify the fallback selection resolver wiring in `public/explorer.html`.


### Latest Implementation Notes (2026-02-23, all-projects project-scope unlock)
- Explorer project-scoped bulk actions (Tag/Move/Delete/Compose/Resolve) now unlock in All Projects scope when the current selection resolves to exactly one project/source via selection-key parsing.
- Mixed-project selections remain selectable for cross-project actions (copy URLs/program monitor) but project-scoped actions now surface clear "Select items from one project first" guardrails instead of silently remaining disabled.
- Added selection-key parsing helpers and context-aware selected-relative-path extraction so action handlers can infer the target project/source without requiring `state.activeProject`.


### Latest Implementation Notes (2026-02-23, cross-project action bridge)
- Explorer selections now track both membership and explicit selection order (`selected` + `selectedOrder`) so bulk actions can preserve user-picked ordering independent of filter/DOM state.
- Tag/Delete/Move/Resolve actions now execute across mixed project selections by grouping selected assets per `source::project` and issuing per-project API calls, removing the single-project hard block for these workflows.
- Compose now supports mixed-project selections by streaming selected video assets in selection order into `/api/projects/{output}/compose/upload`; output target resolves from active project or inferred single-project selection.


### Latest Implementation Notes (2026-02-23, bulk assets API bridge)
- Added backend bulk asset endpoints `POST /api/assets/bulk/delete` and `POST /api/assets/bulk/tags` that accept ordered AssetRef payloads (`source`, `project`, `relative_path`) and execute grouped project-scoped operations server-side.
- Media listing now includes stable `asset_id` (`sha256:<hash>`) for each indexed entry so explorer selection payloads can carry forward a canonical identity.
- Explorer tag/delete actions now call the new bulk endpoints with ordered asset refs instead of issuing multiple per-project requests in browser code; cross-project order is preserved by `selectedOrder`.


### Latest Implementation Notes (2026-02-23, bulk move/compose API bridge)
- Added backend `POST /api/assets/bulk/move` and `POST /api/assets/bulk/compose` so ordered cross-project selections can be moved/composed via server-side grouped AssetRef execution without browser-side per-project orchestration.
- Explorer move/compose actions now call the bulk endpoints (`/api/assets/bulk/move`, `/api/assets/bulk/compose`) using ordered asset refs; compose no longer loops through stream-download + re-upload from the browser.
- Added tests covering bulk move + bulk compose endpoint behavior and static explorer assertions for new bulk endpoint wiring.


### Latest Implementation Notes (2026-02-23, asset_uuid bridge)
- Media listing and registry records now include `asset_uuid` alongside `asset_id` (`sha256:<hash>`), with UUIDs deterministically derived from content hashes as a compatibility bridge toward future catalog-stable identities.
- Bulk asset endpoints now accept `AssetRef` identity fallbacks (`asset_id` / `asset_uuid`) when `relative_path` is omitted, resolving paths from project indexes server-side.
- Explorer ordered asset refs now include `asset_uuid`, and tests cover asset-identity fallback deletion plus static explorer wiring for UUID-carrying refs.


### Latest Implementation Notes (2026-02-23, identity semantics guardrails)
- AssetRef identity resolution now enforces precedence `asset_uuid` → `asset_id` → `relative_path`, with explicit 409 ambiguity errors when hash/uuid identity matches multiple project paths unless `relative_path` disambiguates.
- Added server-side support for identity-only bulk operations across delete/tags/move/compose, so callers may omit `relative_path` when providing `asset_id`/`asset_uuid`.
- Explorer selection keys now prefer `asset_uuid` (`uuid::source::project::asset_uuid`) when available to reduce key churn/collision from path renames.

### Latest Implementation Notes (2026-02-23, topbar-only sticky layout)
- Updated `public/explorer.html` layout so only the TopBar remains sticky/fixed while media content scrolls in `.content .scroll`; the content header (`.section-h`) is no longer sticky.
- Moved main viewport spacing to `.main` via `padding-top: var(--topbar-offset)` so hiding/revealing the topbar no longer fights nested sticky offsets and the media pane can use full available height.
- Removed extra centered-shell spacing in explorer main layout (`max-width`, side padding, and inter-column gap) to allow full-bleed content and avoid wasted scroll area around the media grid/list.

### Latest Implementation Notes (2026-02-23, topbar section row integration)
- Moved the media status header (`#contentTitle` / `#mediaCount` / `#activePath`) into the fixed `.topbar` as a designed second row using the existing `.section-h` class so only the topbar remains the sticky header surface.
- Tuned topbar sizing tokens to account for the extra row (`--topbar-row-height` + `--topbar-subrow-height` => `--topbar-height`) and updated the drag-reveal threshold from `56` to `94` so reveal behavior matches the taller bar.
- Styled only `.topbar > .section-h` to match topbar visuals (same horizontal padding cadence, transparent shared background, subtle divider between rows) while leaving sidebar `.section-h` blocks unchanged.

### Latest Implementation Notes (2026-02-23, topbar second-row flush integration)
- Adjusted `.topbar` to a vertical flex container (`flex-direction: column; align-items: stretch`) so `.topbar-inner` (row 1) and `.topbar > .section-h` (row 2) stack flush inside the same topbar surface.
- Refined `.topbar > .section-h` to a fixed subrow height (`height: var(--topbar-subrow-height)`) with zero vertical padding and matched horizontal padding (`18px` desktop / `12px` mobile) so the second row aligns with topbar spacing instead of appearing detached.
- Kept existing IDs/classes and JS behavior intact; `--topbar-height` remains the combined row+subrow token to preserve layout/reveal offsets.

### Latest Implementation Notes (2026-02-23, topbar first-row regression rollback)
- Reverted the `.topbar` flex-column override so the first-row controls (`.topbar-inner` search/actions layout) return to their original behavior.
- Kept the second-row media header integration on `.topbar > .section-h` unchanged, including matching horizontal padding with the topbar row (`18px` desktop / `12px` mobile).
- Retained combined topbar sizing tokens (`--topbar-height = --topbar-row-height + --topbar-subrow-height`) so fixed-offset/reveal spacing still covers both rows.

### Latest Implementation Notes (2026-02-23, explorer shader asset effects wiring)
- Added `public/js/explorer-shaders.mjs` exporting `AssetFX` with WebGL-driven card effects for hover/touch chromatic glow, video scanline overlay, selection pulse, and thumbnail dissolve.
- Updated `public/explorer.html` to load the shader module as an ES module, instantiate `cardFX`, and wire effects at existing integration points: grid attach, thumbnail creation, video card append, and selection toggles.
- Added a `cssEscape` helper in explorer UI code for safe data-attribute selector targeting when pulsing newly selected cards.
- Extended `tests/test_public_explorer_program_monitor.py` with assertions that shader wiring and `AssetFX` export/methods are present.

### Latest Implementation Notes (2026-02-23, iPhone-visible shader fallback tuning)
- Refined `public/js/explorer-shaders.mjs` so asset effects remain visibly active on iPhone/Safari by combining WebGL where reliable (hover/dissolve) with explicit CSS-based fallbacks (scanline overlay, selection pulse, dissolve veil) when WebGL contexts are unavailable or constrained.
- Strengthened focus treatment for pointer/touch with immediate transform/box-shadow/filter styling so users can perceive card emphasis even before/without shader compositing.
- Added shared runtime keyframes (`fx-selection-pulse`, `fx-scanline-pan`) injected once by `AssetFX` and expanded static explorer tests to assert fallback effect hooks remain present.

### Latest Implementation Notes (2026-02-23, viewport re-entry asset FX replay)
- Added viewport re-entry effect replay support in `AssetFX` via `trackViewport()` + `IntersectionObserver`, so cards can show a brief visual hint again when scrolled back into view instead of only on initial load.
- Explorer card rendering now calls `cardFX.trackViewport(card, cardThumb)` alongside dissolve wiring so each grid card registers once for visibility-triggered replays within the media grid scroll container.
- Added a lightweight `fx-visible-hint` animation overlay with throttling (`fxLastVisibleAt`) to avoid excessive replays while still giving obvious feedback during iPhone scroll-back interactions.
- Updated static explorer tests to assert viewport-tracking methods/keyframes and HTML wiring are present.

### Latest Implementation Notes (2026-02-23, dissolve/scanline synchronization and replay fix)
- Replaced per-call explorer wiring (`dissolve` + `trackViewport` + `addScanline`) with a single `cardFX.bindCardMedia(card, img, { kind })` integration point so thumbnail lifecycle, scanline setup, and replay behavior stay synchronized.
- `AssetFX.dissolve` now supports replay-aware binding (`allowReplay`) and delegates to `_playDissolve`, letting dissolves run when thumbnails load/reload instead of only at first card render.
- Added dissolve throttling (`fxDissolveAt`) and scanline boost coordination (`_boostScanline`) so dissolve and scanline effects are visible together rather than placeholders visually overpowering dissolve transitions.
- Updated static explorer tests to validate the new binding API and replay/synchronization helper methods.

### Latest Implementation Notes (2026-02-23, continuous scroll replay sweep)
- Added a scroll-driven replay sweep in `AssetFX` (`_ensureScrollReplay` + `_scheduleScrollReplay` + `_runScrollReplaySweep`) so effects trigger continuously as assets move in/out of view during up/down scrolling, not only at initial load/intersection events.
- `trackViewport` now stores cards in a tracked set, enabling lightweight visibility checks against the grid scroll container on each scheduled animation-frame sweep.
- When a tracked card re-enters view with a loaded thumbnail, the sweep now replays dissolve (`_playDissolve`) and visible hint overlays immediately for steadier mobile feedback.
- Expanded static explorer assertions to include the new continuous replay methods.

### Latest Implementation Notes (2026-02-24, shared WebGL overlay + selection no-rerender)
- Refactored `AssetFX` to a shared-overlay renderer model: one canvas/WebGL context per grid container (`init`) with a single RAF loop that renders visible card overlays from mapped DOM rects, eliminating per-card context churn.
- Added WebGL lifecycle handling (`webglcontextlost` / `webglcontextrestored`) and CSS-only fallback overlays so effect behavior remains stable on constrained mobile browsers.
- Explorer checkbox selection now uses a cheap DOM/state update path (`updateSelectionDomForKey` + delegated handlers) and no longer calls `renderMedia()` inside `toggleSelected`, preventing repeated “Preparing thumbnails…” flashes during selection.
- Added pointer movement suppression for checkbox taps during scroll gestures to reduce accidental selections on mobile touch scroll.
- Updated explorer static tests to assert shared renderer lifecycle methods and verify toggle selection does not trigger full rerender logic.

### Latest Implementation Notes (2026-02-24, renderer singleton enforcement)
- Added module-level renderer registry (`RENDERERS` WeakMap) so `AssetFX.init(container)` reuses an existing shared overlay/context per grid root instead of re-creating renderer state.
- Added explicit renderer identity marker (`data-fx-renderer-id`) on the grid container for debugging/verification that rebinds keep the same shared renderer instance.
- Added `_getRenderer` / `_saveRenderer` helpers and synchronized RAF handle updates in the shared render loop to keep singleton lifecycle stable across repeated init/bind calls.
- Expanded static tests to assert singleton symbols/wiring are present and shared renderer teardown paths remain explicit.

### Latest Implementation Notes (2026-02-24, stable FX root binding)
- Explorer grid FX attachment now targets a stable scroll-root (`#mediaGridRoot` / `[data-fx-grid-root="1"]`) instead of the frequently re-rendered `#mediaGrid` node, preserving shared renderer identity across media refreshes.
- Updated static explorer shader wiring assertions to reflect root-resolution + `attachGrid(gridRoot, '.asset')` integration.

### Latest Implementation Notes (2026-02-24, WebGL singleton hardening + instrumentation)
- Hardened `AssetFX` renderer lifecycle with explicit attach/detach idempotency (`_attachedGridRoot` guard + `detachGrid()` cleanup for observers/listeners/tap guards) to prevent repeated binding churn from spawning duplicate runtime hooks.
- Added singleton instrumentation in `public/js/explorer-shaders.mjs`: renderer/context debug counters and `window.__assetfx_dbg` getters plus overlay marker `canvas[data-assetfx="overlay"]` to verify one shared overlay/context per grid root.
- `init()` now reuses connected overlay canvases per root, removes duplicate overlay nodes if present, and updates shared renderer state before/after WebGL lifecycle events so `_playDissolve()` remains CSS-only with no per-card WebGL context creation.
- Expanded static regression tests to assert debug export presence, attach idempotency guard, and `_playDissolve()` block exclusion of `getContext`/`createElement('canvas')`.

### Latest Implementation Notes (2026-02-24, global singleton guard + getContext call tracing)
- `AssetFX` now keeps renderer state in `window`-backed globals (`__assetfx_renderers`, sequence/debug counters) so singleton behavior survives module re-evaluation and remains one overlay/context per grid root.
- Added `markContextCall()` instrumentation for each WebGL context creation attempt and exposed recent call metadata via `window.__assetfx_dbg.calls` for runtime tracing when diagnosing context explosion regressions.
- Explorer now reuses a global `window.__assetfx_instance` singleton `AssetFX` instance to avoid duplicate renderer objects if the module script executes again.
- Updated static explorer tests to assert global renderer-map wiring, context-call instrumentation markers, and singleton instance reuse wiring in `public/explorer.html`.

### Latest Implementation Notes (2026-02-24, page-level context owner lock + runtime audit)
- Added a page-level AssetFX WebGL owner lock (`window.__assetfx_global_context_owner`) so `init()` prevents a second context when attach/init is invoked against a different root; the existing global overlay/context is reattached and reused instead.
- Added `window.__assetfx_audit()` to report overlay count, estimated active WebGL owner, context/render counters, and recent `getContext` call traces with root/canvas identifiers for fast console diagnosis.
- Root/canvas identity is now explicit (`data-assetfx-root-id`, `data-assetfx-overlay-id`), and context-call tracing (`markContextCall`) records those IDs so repeated initialization paths can be pinpointed.
- Static tests now assert owner-lock + audit wiring and include an opt-in Playwright runtime singleton assertion test (`RUN_PLAYWRIGHT_E2E=1`).

### Latest Implementation Notes (2026-02-24, opacity-storm throttling + lite FX mode)
- AssetFX dissolve replay now runs through a capped global queue (`maxActiveEffects = 6`) to prevent large scroll bursts from animating dozens of cards at once; replay requests enqueue and drain as active dissolves complete.
- Removed per-thumbnail opacity writes from `_playDissolve`; dissolve now uses queued veil + transform-only entry emphasis (`.asset.fx-entry-active`) to reduce compositor pressure during scroll.
- Added visibility/render workload limits (`visibleCards` tracking + `maxRenderCards` cap) so overlay RAF sampling targets a bounded visible subset instead of scanning all tracked cards each frame.
- Added low-motion controls: respects `prefers-reduced-motion` and URL `?fx=lite` mode to suppress heavy replay hints/dissolve behavior while keeping base grid interactions intact.
- Expanded static explorer tests to assert throttling/lite-mode symbols and ensure `_playDissolve` no longer performs image opacity style transitions.

### Latest Implementation Notes (2026-02-24, queue hygiene + disconnected-card pruning)
- Added `AssetFX._pruneDisconnected()` and call sites in both replay sweep and render loop so disconnected DOM nodes are removed from `trackedCards`, `visibleCards`, `activeDissolves`, and pending dissolve tasks.
- Dissolve queue now has bounded overflow policy (`maxPendingDissolves = 60`); newer requests are preferred and stale/offscreen tasks are dropped, including immediate pending-task removal when cards leave viewport.
- Dissolve finalize path now guarantees `activeDissolves` cleanup even on unexpected completion errors, preventing stuck active slots during long scroll sessions.
- Expanded runtime diagnostics (`window.__assetfx_dbg` + `window.__assetfx_audit()`) with live queue/active/visible counters for leak/starvation inspection.
- Updated static + gated Playwright tests to assert new queue hygiene symbols and runtime bounds (`pending <= 60`, `active <= 6`).

### Latest Implementation Notes (2026-02-24, tile readiness-gated FX synchronization)
- AssetFX card media binding now tracks per-tile readiness (`data-fx-ready` + `data-ready`) from image load/error events so overlay effects are deferred until thumbnails are actually decoded/ready.
- Visible-card inclusion and dissolve queue enqueueing now require ready tiles, preventing shader passes from running over placeholder/unloaded cards during progressive media loading.
- Added per-tile ready fade ramp (`fxReadyAt` + `readyFadeMs`) to smooth FX intensity as assets become ready, reducing apparent mismatch between DOM load timing and shader overlay timing.
- Updated static tests to assert readiness-gating symbols and ready-fade calculations in the shader module.

### Latest Implementation Notes (2026-02-24, tile-local material shader pass)
- Replaced the prior global-style overlay blend with tile-local material shading in `public/js/explorer-shaders.mjs`: shader now consumes per-tile arrays (`u_type`, `u_sel`, `u_energy`, `u_ready`) and computes `tileUV` per rect for tile-anchored effects.
- Added first-pass material presets driven by tile type and selection state (video scan/phosphor accents, audio shimmer accents, image vignette basis, and selection-glass highlight streak/fresnel) multiplied by ready fade.
- Render packing now uploads explicit per-tile material parameters from DOM state (`kind`, `.is-selected`, boost-derived energy, readiness fade) instead of the previous single `u_video` scalar.
- Updated static shader assertions to cover new material uniforms/tileUV anchoring and per-tile parameter packing symbols.

### Latest Implementation Notes (2026-02-24, readiness ownership cleanup: decode-aware + single loader path)
- Explorer card thumbs now use `loading="eager" decoding="async" fetchpriority="low"` in both grid/list markup to avoid mixing browser lazy-loading scheduling with the existing JS thumb queue (`loadThumbQueue`).
- Card thumbs are initialized with `data-thumb-state="pending"` so load state ownership remains explicit in JS and consistent with the existing queue/error updates.
- `AssetFX.bindCardMedia()` readiness marking is now decode-aware: `markReady` awaits `img.decode()` when available before setting `data-fx-ready`/`data-ready`, with safe fallback for Safari/cross-origin decode rejections.
- Static tests now assert the eager+decode thumb attributes and decode-aware readiness path to lock the lifecycle separation between structure CSS and JS/FX readiness.

### Latest Implementation Notes (2026-02-24, lifecycle split hardening: decode backpressure + geometry caching)
- `AssetFX.bindCardMedia()` now accepts a generic `mediaEl` and unifies readiness semantics across image/video/audio tiles (`load+decode`, `loadeddata`, `loadedmetadata`) before setting `data-fx-ready`.
- Added decode backpressure in `public/js/explorer-shaders.mjs` (`MAX_PARALLEL_DECODES = 3`) to limit concurrent `img.decode()` work and reduce iPhone/Safari decode spikes during large grid renders.
- Added layout invalidation + rect caching (`layoutDirty`, `cardRectCache`) with `ResizeObserver`/scroll-triggered invalidation so tile rects are not recomputed from `getBoundingClientRect()` for every visible card on every RAF tick.
- Removed CSS filter-driven per-tile appearance animation hooks on `.asset` / `.asset-thumb` (hover brightness + baked filter) so visual energy remains shader-owned rather than split across CSS and WebGL.
- Updated static tests to assert decode backpressure, media-element readiness unification, and layout/resize invalidation symbols.

### Latest Implementation Notes (2026-02-24, CSS motion ownership tightened for AssetFX)
- Removed hover transform motion from `.asset:hover` in `public/explorer.html` so per-tile movement is no longer split between CSS hover transforms and shader-driven FX state.
- `.asset` transitions now keep only border-color for hover affordance while geometric/energy motion remains owned by `AssetFX` animations.
- Added a regression test asserting the hover transform is absent and border-only hover styling remains, to prevent reintroducing CSS-vs-shader motion contention.

### Latest Implementation Notes (2026-02-24, GPU upload backpressure stage for thumbnail apply)
- Added a thumbnail apply scheduler in `public/explorer.html` (`THUMB_APPLY_PER_FRAME = 4`) so decoded thumbs are committed to DOM in small requestAnimationFrame batches instead of all-at-once updates.
- `loadThumbQueue()` now enqueues `src`/state/orientation apply work through `enqueueThumbApply()` + `flushThumbApplyQueue()`, reducing upload/layout spikes during large media lists.
- Added regression assertions covering the new staged thumbnail apply symbols in `tests/test_public_explorer_program_monitor.py`.

### Latest Implementation Notes (2026-02-24, tile parameter texture packing for shader locality)
- AssetFX fragment shader now reads per-tile material state from a packed parameter texture (`u_tile_params`) instead of separate uniform arrays for type/selection/energy/readiness.
- Render pass now packs tile params into a `Uint8Array` (RGBA: type, selected, energy, ready) and uploads as a 1D texture (`MAX_RECTS x 1`) each frame before drawing.
- Shared renderer state now persists `tileParamTexture` across singleton reuse/restores, preserving the one-overlay/one-context architecture while reducing uniform churn.
- Static tests were updated to assert packed tile-parameter texture symbols (`u_tile_params`, `tileParamTexture`, `Uint8Array`, `texImage2D` upload path).

### Latest Implementation Notes (2026-02-24, deterministic entry catch-up + center-priority sampling)
- Entry visuals are now unified through `_playEntry(...)`: every eligible tile runs the same top-to-bottom veil entry pass, with scanline boost applied only when `kind === 'video'`.
- Ready-in-view catch-up added: when media flips ready in `bindCardMedia()`, `_maybePlayEntryOnReady()` now schedules a one-time entry for visible tiles that missed initial enqueue windows.
- Overlay render sampling now prioritizes tiles nearest viewport center before applying `maxRenderCards`, reducing random-looking mixed FX in the same visible region.
- Runtime diagnostics expanded (`readyInViewNotPlayedCount`, `renderSampledCount`, `droppedByCapCount`) and surfaced in `window.__assetfx_dbg`/`window.__assetfx_audit()`.
- Static tests updated for unified entry hooks, center-priority sampling sort, and new audit counters.

### Latest Implementation Notes (2026-02-24, fxdebug webgl call tracing + sampling hysteresis)
- Added `?fxdebug=1` instrumentation in `public/explorer.html` that idempotently wraps `HTMLCanvasElement.prototype.getContext` and records WebGL context call stacks into `window.__webgl_ctx_calls` for on-device diagnostics.
- Expanded `window.__assetfx_audit()` in `public/js/explorer-shaders.mjs` to report copy/paste-friendly sanity metrics (`contextsCreated`, `contextsPrevented`, `overlayCanvases`, `allCanvases`, `webglCanvases`, `attachedRootId`, plus queue/sampling counters).
- Added `window.__assetfx_dump_canvases()` helper returning metadata for every canvas on the page to quickly locate non-AssetFX WebGL users.
- Added sampled-set hysteresis (`sampleHoldMs`, `sampledCardsUntil`) to reduce cap thrash holes when `maxRenderCards` is enforced during scroll.
- Added optional debug card badges (`RVPS`) in fxdebug mode to visualize per-tile ready/in-view/played/sampled state when validating entry behavior.


### Latest Implementation Notes (2026-02-24, maintenance: handoff refresh)
- Performed a no-code maintenance pass to refresh agent handoff continuity and confirm repository instructions are still aligned with the latest `fxdebug`/AssetFX diagnostics work.
- Verified tree state before/after the refresh to keep future commits anchored to an explicit AGENTS.md update checkpoint.


### Latest Implementation Notes (2026-02-24, AssetFX uniform pass + no lateral sweep)
- Simplified AssetFX tile shading to a single shared material path for all asset kinds so cards no longer render different per-type effects.
- Removed video-only scanline boost/state plumbing (`addScanline`, `_boostScanline`, `fxScanlineBoost`) and normalized per-card energy math to selection-only contribution.
- Replaced the entry veil animation from left-to-right scale transforms with a vertical fade-only dissolve to eliminate the right/left sweep behavior.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` to match the new unified `_playEntry(...)` signature and constant tile type packing.


### Latest Implementation Notes (2026-02-24, iOS Safari rect anchoring + gutter clamp diagnostics)
- AssetFX render rects are now computed in overlay-canvas local space (`overlay.getBoundingClientRect()` basis), with a fixed inset (`RECT_INSET_PX = 4`) and per-rect clamp/invalid-drop to prevent shader bleed into card gutters.
- Overlay ownership remains single-canvas but now includes an optional debug canvas (`data-assetfx="debug"`) layered above WebGL when `?fxdebug=1` for sampled-rect outline verification on device.
- Layout invalidation is now more aggressive: scroll, resize observer, window resize, visualViewport resize/scroll, track/bind readiness updates all mark layout dirty and clear rect cache.
- Runtime diagnostics now include `renderCandidatesCount` alongside sampled/dropped counters so cap behavior is easier to reason about during mobile troubleshooting.
- Static tests were updated to assert overlay-local rect math symbols, inset/clamp hooks, visualViewport invalidation listeners, and debug overlay wiring.


### Latest Implementation Notes (2026-02-24, viewport-leave exit FX pass)
- AssetFX now applies an explicit per-card exit veil (`_playExit`) when ready tiles leave the in-view set, so scroll behavior emphasizes FX-out instead of only FX-in on enter.
- Exit effects are cooldown-gated (`lastExitedAt`) for idempotence and to avoid rapid flicker during threshold jitter while scrolling.
- Added `.fx-exit-veil` + `@keyframes fx-exit-veil` shared styles and reduced-motion disable wiring alongside existing FX overlays.
- Static tests now assert the exit pathway symbols so future refactors preserve leave-behavior semantics.


### Latest Implementation Notes (2026-02-24, adaptive premium sampling + always-on pass)
- AssetFX shader now applies a subtle always-on global pass (low-amplitude vignette/grain/scanline) so all in-view tiles retain baseline FX presence even when premium tile sampling is capped.
- Premium tile sampling remains center-priority but now uses an adaptive cap (`minRenderCards`, `maxRenderCardsLowTier`, `maxRenderCardsHighTier`, `maxRenderCardsAdaptive`) driven by visible candidate count + coarse device tier heuristics for iPhone stability.
- Debug badges now include an always-on marker (`A`) and premium state (`S` sampled, `P` pending-not-sampled, `-` neither) to make cap behavior legible while validating mobile scroll behavior.
- Entry timing was smoothed/tightened (`entryMs = 260`, `readyFadeMs = 240`) and premium energy multipliers were reduced for less flashy transitions.
- Static tests were updated to assert the adaptive-cap/always-on symbols and the updated debug badge semantics.


### Latest Implementation Notes (2026-02-24, temporal smoothing: scroll damping + adaptive cap stabilization)
- AssetFX now tracks smoothed scroll velocity (`scrollVelocityEma`) and applies motion damping (`motionDamp`) so premium/entry intensity softens during fast flicks and settles smoothly when scroll velocity drops.
- Added coarse FPS EMA (`fpsEma`) driven cap tuning to the existing center-priority sampling, with visible-count-aware adaptive cap sizing to keep viewport coverage high while still backing off under load.
- Fragment shader now includes `u_motion_damp` to reduce scanline contrast during high-velocity scrolling; baseline always-on pass remains subtle and continuous.
- Runtime diagnostics expanded with `scrollVelocityEma`, `motionDamp`, `fpsEma`, and `capNow` to make temporal behavior auditable in `__assetfx_dbg`/`__assetfx_audit()`.
- Static tests were updated to assert scroll-damping symbols, motion-damp uniform wiring, and adaptive cap/FPS tuning hooks.


### Latest Implementation Notes (2026-02-24, selection delegation drag suppression fix)
- Fixed `wireSelectionDelegation()` pointer tracking in `public/explorer.html` to persist the active checkbox node (`input`) in `pointers` records.
- This restores drag-suppression behavior in `handlePointerUp` (`rec.input.dataset.fxSuppressToggle = '1'`) so accidental checkbox toggles are blocked after pointer movement, including list-view flows outside the AssetFX tap guard.
- Static tests now assert the pointer map payload includes `input` to prevent regressions in delegated selection handling.


### Latest Implementation Notes (2026-02-24, premium coverage stabilization: sweep + stickiness + entry guarantee)
- Added premium sampling hysteresis and stabilization constants (`SAMPLE_STICK_MS`, `SETTLE_DELAY_MS`, `FAST_SCROLL_THRESHOLD`) so sampled tiles persist briefly and sampling freezes during fast scroll / settle windows.
- Replaced pure center-priority slicing with a deterministic viewport sweep (`sampleCursor`) plus sticky retention and frozen-set reuse to distribute premium coverage across all visible tiles over time instead of favoring only initial rows.
- Added entry guarantee lifecycle (`_ensureEntryPending`, `fxEntryPending`, `fxEntryFrames`, `fxEntryPlayed`) so ready+visible tiles receive a one-time premium entry once sampling settles (sampled immediately or after two RAF frames).
- Expanded runtime diagnostics with `sampleCursor`, `samplingFrozen`, `stickyRetainedCount`, `sweepFilledCount`, and `entryPendingCount`, and updated fxdebug badge semantics to include sticky sampled state (`K`).
- Static tests were updated to assert sweep/hysteresis/entry-guarantee symbols and the updated debug badge output contract.

- Follow-up cleanup: removed duplicate constructor re-initialization of `lastSampledCards`/`sampleCursor` so sweep state is defined once and easier to reason about.


### Latest Implementation Notes (2026-02-26, prototype card skin + selection glow force-sampling)
- Explorer card shell visuals were updated to align with the prototype language (subtle glass badges, compact checkbox treatment, scrim-backed metadata, play overlay + preview pill) while preserving existing DOM/data flow and selection wiring.
- Added a fixed background impulse canvas that renders subtle tap ripples on pointerdown events so touch interactions feel responsive even when premium card sampling is capped/frozen.
- AssetFX premium sampling now force-includes all visible selected cards (even over cap), keeps scroll-freeze/stickiness behavior, and drives shader-level selection glow via `u_selected` + `u_select_pulse` with eased ramp down on deselect.
- Top bar hide/reveal transitions now include blur + mask-based material reveal while preserving existing pointer-event gating and intent-controller behavior.
- Selection checkboxes now render order numbers in-place (`.sel-order`) while preserving existing checkbox hit target size; numeric text is intentionally darkened for readability against selected glow styling.
- Selection order badge color now matches the selected asset glow accent for readability/consistency, selected card glow intensity was increased (CSS + shader energy tuning), and the bottom selection bar now includes a dedicated `✕ Clear` action while preserving the existing top actions clear control.
- Fixed topbar/action menu stacking so actions/dropdowns render above the asset grid (`z-index` layering), and reduced AssetFX overlay cost by lowering adaptive premium caps plus softening baseline scanline/pulse intensity for smoother scroll behavior on iPhone-class devices.

- Actions menu now uses a fixed `#ui-portal` host (body-level portal) for panel rendering so Safari stacking contexts from card/grid/FX layers cannot place it behind assets; open-state positioning now computes from the Actions trigger and includes optional `fxdebug` z-index/transform ancestry logging.

- AssetFX efficiency tuning: added low/high-tier per-frame pixel budgets (`maxRenderPixelsLowTier`/`maxRenderPixelsHighTier`) to bound premium card coverage cost, plus low-tier fast-scroll frame skipping so overlay rendering runs at half-rate during high-velocity flicks while preserving selected-card force sampling.

- Toast notifications now use a body-level fixed host (`ensureToastHost`) with very high z-index/isolation so they never render behind topbar/action UI, and AssetFX overlays were moved to viewport-fixed body canvases with `visualViewport` offset/size tracking so fxdebug coverage and ARVK sampling remain valid across full-page scroll ranges.
- Reduced scroll-entry glare cost/intensity by gating visible-hint overlays during active scroll/motion and downscaling hint opacity/duration so scanlines remain while reflection bursts are less expensive and less visually aggressive.

### Latest Implementation Notes (2026-02-27, maintenance: validation checkpoint)
- Ran the focused explorer static coverage suite (`pytest -q tests/test_public_explorer_program_monitor.py`) after the latest AssetFX/toast layering work; result remained green (`19 passed, 1 skipped`).
- Added this checkpoint entry to keep AGENTS handoff continuity explicit for the next agent per repo policy (update AGENTS.md on every commit).

### Latest Implementation Notes (2026-02-27, explorer FX layering/alignment follow-up)
- Re-anchored AssetFX overlay/debug canvases to the explorer scroll root (`[data-fx-grid-root="1"]`) with absolute in-root positioning and root-prepend attachment, replacing viewport-fixed body overlays to eliminate scroll drift and panel bleed-through.
- Added FX suspension wiring (`setFxSuspend`) so inspector/actions overlays temporarily clear+pause shader rendering while open, then resume when closed.
- Added shader-level scroll calm uniform (`u_scroll_fast`) driven by decayed scroll velocity to reduce selection glare/entry intensity during fast scrolling while keeping baseline scanline texture.
- Updated explorer static assertions and reran the focused monitor suite (`19 passed, 1 skipped`) after these fixes.

### Latest Implementation Notes (2026-03-03, AssetFX maskfield integration + explorer boot/inspector fixes)
- Integrated `MaskField` into `public/js/explorer-shaders.mjs` (hidden heatmap canvas + pointer impulses + hover decay) and wired it to shader uniforms (`u_mask`, `u_mask_enabled`) via a cached-uniform path and Texture1 uploads (`texSubImage2D`) for mask-driven modulation.
- Hardened WebGL init/restoration with explicit pixel-store normalization and shared renderer persistence of mask texture/allocation + uniform cache state.
- Updated explorer boot flow with a shared `refreshExplorerData()` helper so initial page load consistently performs the same source/project/media fetch sequence as the manual Refresh action.
- Adjusted inspector UX so tapping an asset while the drawer is open now closes the drawer first (instead of immediately re-opening preview focus), and `closeDrawer()` clears focused inspector state.
- Re-ran focused explorer static coverage after these changes (`19 passed, 1 skipped`).
- Follow-up hotfix: restored explicit `_cacheUniforms()` definition in `AssetFX` after integrating mask uniforms so cached uniform locations are populated before draw calls.

### Latest Implementation Notes (2026-03-03, explorer grid row-flow regression fix)
- Replaced masonry-style `.grid` columns layout (`column-width`/`break-inside`) with explicit row-first CSS grid (`grid-auto-flow: row`, `grid-template-columns: repeat(auto-fill, minmax(var(--grid-col-width), 1fr)))`) so assets flow left-to-right and wrap predictably on desktop + iPhone Safari.
- Hardened main viewport sizing with additional `min-width: 0` guards on `.main`, `.content`, and `.content .scroll`, plus `#mediaGridRoot` width/min-width constraints to prevent narrow-column collapse when drawer/topbar states change.
- Added optional `?layoutdebug=1` console diagnostics (`logLayoutDebug`) to print computed grid/root/content layout properties for field troubleshooting.
- Increased staged thumb apply budget (`THUMB_APPLY_PER_FRAME = 48`) and switched card thumb fetch priority to `high` while preserving existing loading overlay flow.
- Updated static explorer assertions to enforce row-flow layout contracts and verify the new layout debug symbol.

### Latest Implementation Notes (2026-03-03, checkbox no-preview hotfix + thumb readiness polish)
- Added `[data-no-preview="1"]` contracts to selection controls and capture-phase pointer/click/touch guards so tapping checkbox/order badges no longer triggers card preview open handlers.
- Updated delegated selection click handling so tapping the selector shell/order badge toggles the associated checkbox and dispatches change, preserving ordered badge updates without preview side effects.
- Added explicit `inNoPreviewZone(...)` guards inside asset pointer/context handlers as a second safety layer for iPhone Safari event propagation quirks.
- Improved thumbnail readiness perception by setting thumb state to `loading` during prefetch and adding CSS fade/filter transitions keyed to `data-thumb-state` (`loaded`/`error`) while keeping staged apply + loading overlay flow.
- Re-ran focused explorer static checks after the hotfix (`19 passed, 1 skipped`).

### Latest Implementation Notes (2026-03-03, selection hit-target + fixed overlay + novirt follow-up)
- Tightened explorer selection hit-targets to explicit `.sel-ui`/`.sel-shell` controls so card-body taps no longer toggle selection; delegated click handling now exits unless the tap originates inside selection UI affordances.
- Extended no-preview guards to treat `.sel-ui` as non-preview zones while preserving explicit checkbox/order-badge selection behavior and existing propagation safety stops.
- Re-anchored AssetFX overlay/debug canvases as viewport-fixed body overlays (`position: fixed; inset: 0; width/height: 100vw/100vh`) and updated render-space math to use viewport coordinates for full-scroll coverage.
- Added URL-controlled no-virtualization mode (`?novirt=1` or `?keep=1`) in AssetFX to keep cards/thumb states stable by bypassing offscreen in/out transitions and treating tracked cards as in-view during replay sweeps.
- Updated explorer static tests to assert `.sel-ui`-scoped toggles, fixed-overlay contracts, and novirt wiring symbols.

### Latest Implementation Notes (2026-03-03, sticky thumbnail cache follow-up for scroll stability)
- Added a persistent explorer thumbnail state cache (`thumbStateCache`) keyed by selection/thumb identity so once a thumbnail reaches `loaded`, subsequent renders rehydrate from cache immediately instead of returning to a pending/loading visual state.
- Updated staged thumbnail queue loading to consult cached states first (`loaded`/`error`) and to avoid setting `data-thumb-state="loading"` when a target is already marked `loaded`.
- Added `data-thumb-state-key` attributes to grid/list thumbnail nodes and wired `setThumbCachedState(...)` updates on successful and failed loads to keep card visuals stable across scroll and rerender cycles.
- Added static regression assertions to enforce sticky-cache symbols and guard against src-clearing regressions.

### Latest Implementation Notes (2026-03-03, overlay hit-test sanitizer + layoutdebug diagnostics)
- Added defensive overlay sanitization in `public/explorer.html` for rogue `html > div[style*="all: initial"]` nodes: marks them with `data-overlay-sanitized="1"`, forces `pointer-events: none`, and applies fixed/inset/z-index defaults to prevent full-page hit-test interception.
- Added a short-lived boot-time `MutationObserver` (4s) to re-apply sanitizer behavior if overlays are injected during early startup.
- Expanded `?layoutdebug=1` output to include overlay sanitizer count plus center `elementFromPoint(...)` diagnostics (`hitTag`, `hitId`, `hitClass`, `hitPath`) to accelerate iPhone Safari troubleshooting.
- Added CSS safety guards so `.fx-shared-overlay`, `.fx-debug-overlay`, and sanitized overlays always remain non-interactive (`pointer-events: none !important`).
- Updated static explorer tests to assert overlay sanitizer hooks and layoutdebug diagnostics.

### Latest Implementation Notes (2026-03-03, FX stacking order correction for Safari scroll occlusion)
- Lowered AssetFX overlay/debug canvas inline z-index to `0` in `public/js/explorer-shaders.mjs` so viewport-fixed FX layers remain behind explorer content instead of occluding cards during deep scroll.
- Raised `.app` stacking context (`z-index: 2`) and hardened `#mediaGridRoot` stacking (`position: relative; z-index: 1; isolation: isolate`) in `public/explorer.html` to keep card/grid content explicitly above fixed FX surfaces on iPhone Safari.
- Expanded `?layoutdebug=1` diagnostics to report `canvasZIndex`, `gridRootZIndex`, `canvasRect`, `canvasHeightPx`, and `gridScrollHeight` for fast validation of viewport-vs-scroll compositing issues.
- Updated explorer static tests to assert the stacking/z-index and layoutdebug telemetry contracts.

### Latest Implementation Notes (2026-03-03, runtime Playwright explorer FX regression suite)
- Added a new opt-in runtime E2E suite at `tests/e2e/test_explorer_assetfx_runtime.py` (gated by `RUN_PLAYWRIGHT_E2E=1`) covering overlay hit-test occlusion, FX debug-rect alignment vs DOM card rects, visible-card tracking bounds, and thumbnail state stability after scroll roundtrips.
- Exported debug rectangle telemetry from `AssetFX._renderDebugRects(...)` via `window.__assetfx_dbg.lastRects` / `FX_GLOBAL.__assetfx_dbg_last_rects` when `fxdebug` is enabled, and clear the export when debug rendering is disabled.
- Extended existing static explorer shader assertions to enforce presence of the new debug-rect export hooks.

### Latest Implementation Notes (2026-03-03, runtime FX diagnostics hardening follow-up)
- Expanded `tests/e2e/test_explorer_assetfx_runtime.py` with space-agnostic debug-rect centerpoint alignment checks that normalize CSS-vs-DPR telemetry before asserting card/FX rect containment.
- Added runtime guards for Safari-style `html > div[style*="all: initial"]` overlay interceptors to ensure any injected wrapper is pointer-inert (and effectively hidden when large).
- Added FX badge health assertions so settled runs require visible sampled cards (`S`/`K`) while preventing pending (`P`) states from dominating after settle.
- Added a stricter center hit-test assertion that rejects canvas/sanitized overlays and requires hit targets to resolve inside `.asset` cards.

### Latest Implementation Notes (2026-03-03, replay-sweep runtime error fix for stale FX boxes)
- Removed an unintended `_replaySweep()` tail assignment to `debugRects` in `public/js/explorer-shaders.mjs` that could throw `ReferenceError` during scroll replay and leave FX in stale/misaligned states under heavy scrolling.
- Added runtime Playwright coverage (`test_explorer_fx_scroll_replay_has_no_runtime_reference_errors`) to scroll down/up and fail if `pageerror` captures `ReferenceError`/`debugRects` faults during replay sweeps.
- Updated static explorer shader assertions to guard against reintroducing the stray `FX_GLOBAL.__assetfx_dbg_last_rects = debugRects;` replay-sweep assignment.

### Latest Implementation Notes (2026-03-03, iPhone viewport-stability follow-up for FX canvas sizing)
- Added `getStableViewportSize()` in `public/js/explorer-shaders.mjs` so overlay sizing now prefers `visualViewport` with client/inner fallbacks and avoids transient tiny-height canvas allocations during iPhone Safari URL-bar/viewport shifts.
- Updated card→FX rect mapping to subtract `canvasRect.left/top` before DPR scaling, ensuring shader/debug rectangles stay aligned with DOM card bounds when viewport origins shift.
- Expanded runtime E2E coverage with viewport-size sanity (`test_explorer_fx_overlay_canvas_matches_viewport_not_tiny`) and post-scroll-churn alignment checks (`test_explorer_fx_debug_rects_stay_aligned_after_scroll_churn`).
- Extended static shader contract assertions to enforce stable viewport helper presence and canvas-origin rect-mapping math.

### Latest Implementation Notes (2026-03-03, stale-debug rect suppression for unloaded cards)
- Added `_isRenderableMediaReady(cardEl)` in `public/js/explorer-shaders.mjs` so render candidates and debug badge readiness require a connected, actually ready media element (loaded image or ready video/audio), preventing FX rects from persisting on unloaded placeholder cards.
- AssetFX `_render()` now skips candidates failing renderable-media readiness even if `fxReady`/`fxInView` flags are set from earlier lifecycle stages.
- Added runtime regression `test_explorer_fx_debug_rects_change_after_scroll` to ensure debug rect exports update after scroll movement instead of staying frozen.
- Extended static shader assertions to enforce `_isRenderableMediaReady(...)` usage and image thumb-state readiness guardrails.

### Latest Implementation Notes (2026-03-03, geometry freshness + overscan tracking follow-up)
- Hardened layout invalidation with reason-aware `_markLayoutDirty(reason)` so scroll/viewport/resize events always reset `cardRectCache`, clear `_lastCanvasRect`, and increment debug counters (`layoutInvalidations`, `lastInvalidationReason`) for runtime inspection.
- Added vertical overscan tracking (`prefetchViewportY = 1.5`) to replay/observer visibility calculations (`_expandedRootRect`, IntersectionObserver `rootMargin`) so fast scrolling keeps near-viewport cards in FX tracking instead of dropping to stale rect state.
- Tightened image readiness gating to skip fallback posters when a real thumb URL exists (`src === data-thumb-fallback`) so placeholder tiles no longer produce debug FX rects.
- Added runtime regression `test_explorer_fx_layout_invalidation_ticks_on_scroll` and expanded static shader assertions for overscan, invalidation telemetry, and fallback-readiness guards.

### Latest Implementation Notes (2026-03-03, TDD freshness semantics for debug-rect snapshots)
- Added `_publishDebugRects(...)` to centralize debug-rect exports so every frame overwrites `lastRects`, increments `lastRectsFrame`, and records `lastRectsT` instead of leaving stale snapshots.
- `_render()` now reuses `_lastCanvasRect` only between stable frames and forces a fresh `getBoundingClientRect()` sample whenever layout is dirty, reducing scroll-churn drift.
- Runtime E2E suite now validates scroll-driven debug frame advancement (`lastRectsFrame`) and verifies rect exports clear after forcing cards out-of-view (`test_explorer_fx_debug_rects_clear_when_cards_marked_out_of_view`).
- Replaced the old viewport-only visibility cap assertion with a bounded-and-responsive tracking assertion that allows overscan while still guarding against leaks.

### Latest Implementation Notes (2026-03-03, iPhone fast-scroll debug rect freshness + viewport-offset follow-up)
- Updated `public/js/explorer-shaders.mjs` with `getViewportOffsets()` (from `window.visualViewport.offsetLeft/offsetTop`) and applied those offsets in card→FX rect mapping before DPR scaling, reducing Safari/iPhone toolbar/viewport-origin drift in debug/render alignment.
- Adjusted the low-tier fast-scroll frame-skip gate so throttling is disabled when `fxdebug` is active (`lowTierFrameSkip` now requires `!this.fxDebug`), ensuring debug rectangles continue to publish fresh frame-by-frame telemetry during rapid scrolling.
- Refreshed static explorer shader assertions in `tests/test_public_explorer_program_monitor.py` to enforce the new viewport-offset helper and fxdebug-aware frame-skip contract.

### Latest Implementation Notes (2026-03-03, AssetFX keyed-state + debug-freshness hardening follow-up)
- Added stable per-asset keyed runtime state in `public/js/explorer-shaders.mjs` (`stateByKey`, `keyByEl`, `_getCardKey`, `_getCardState`) so FX readiness/in-view/sampled truth survives DOM recycling and no longer relies on element-only weak state.
- Implemented bounded state retention with `_evictState(nowPerf)` and query-param override `fxevictms` (default `20000ms`) so off-band cards are evicted when not near view/selected/pending/active.
- Added `_bindInvalidations()`/`_unbindInvalidations()` and wired scroll, touchmove, window resize, and visualViewport resize/scroll invalidation through `_markLayoutDirty(...)` to force rect/canvas refresh during iOS viewport shifts.
- Updated render candidate selection and debug badges to consume keyed CardState (`nearView`, `inView`, `renderable`, `sampledUntil`) and to compute render candidates from tracked near-view cards while keeping caps (`pending<=60`, `active<=6`, adaptive render caps).
- Expanded debug export contract: `_publishDebugRects(debugRects, meta)` now overwrites snapshots every frame and exports `lastRects`, `lastRectsFrame`, `lastRectsT`, `stateSize`, `attachedRootId`, `canvasRect`, `dpr`, `vvOffset`, and `rootScrollTop`.
- Extended runtime Playwright tests with `test_explorer_fx_state_map_is_bounded_after_scroll_and_eviction` (`fxevictms=2000`) and added graceful browser-unavailable skips in Python Playwright fixtures/tests so CI environments without installed browser binaries skip instead of hard-failing.

### Latest Implementation Notes (2026-03-04, iOS visualViewport double-offset correction follow-up)
- Removed visualViewport offset subtraction from DOM→canvas rect mapping in `public/js/explorer-shaders.mjs`; mapping now consistently uses viewport-space `getBoundingClientRect()` deltas (`cardRect - canvasRect`) before DPR scaling to avoid iOS double-offset drift.
- Kept visualViewport offsets for diagnostics only and expanded debug telemetry with `sampleMapA`, `sampleMapC`, and `canvasTopPlusVvOy` so runtime checks can detect accidental reintroduction of toolbar offset double-application.
- Added Playwright regression `test_explorer_fx_ios_viewport_offset_mapping_stays_in_canvas_space` to validate viewport-space mapping behavior and iOS-style `canvasTop + vv.oy ≈ 0` sanity when visual viewport offsets are present.
- Updated static shader contract assertions to match viewport-space mapping lines and the additional debug telemetry exports.

### Latest Implementation Notes (2026-03-04, wrapper-key canonicalization + near-view set integrity follow-up)
- Canonicalized AssetFX key resolution to wrapper cards via `_getKeyEl(el)` so `_getCardKey(...)` always resolves through `.asset` containers and mirrors the same key onto associated media elements, preventing wrapper/img key divergence (`assetfx-key-*` fallbacks on imgs).
- Added explicit `nearViewCards` Set lifecycle in `public/js/explorer-shaders.mjs` (constructor/init/cleanup/prune updates) so near-view tracking is always initialized and exported as a numeric size for runtime diagnostics.
- Hardened render-loop candidate enumeration with `_iterCards(...)` and updated per-card visibility updates to compute `inView`/`nearView` directly from `card.getBoundingClientRect()` against the current `canvasRect` (plus overscan band), keeping visibility logic in one viewport-space coordinate system.
- Added runtime Playwright regression `test_explorer_fx_wrapper_and_media_share_same_key_and_nearview_is_initialized` to assert wrapper/media key identity and that `nearViewCards.size` is present.
- Updated static shader assertions to cover `_getKeyEl(...)`, `nearViewCards` initialization, and render-loop inView/nearView updates.

### Latest Implementation Notes (2026-03-04, system-contract hardening for churn, bounded state, and fetch diagnostics)
- Hardened AssetFX state retention policy in `public/js/explorer-shaders.mjs`: default stale-state TTL increased to `300000ms` with bounded LRU cap (`maxStateKeys`, default `1200`, override `fxmaxstate`) so FX state remains persistent under scroll churn without unbounded growth.
- Added bounded near-view policy (`nearViewCardsMax`, default `180`, override `fxnearmax`) with `_capNearViewCards()` to keep overscan tracking numerically stable and leak-resistant.
- Expanded debug snapshot exports with `lastRectsLen`, `visibleCards`, and `nearViewCards` counters so runtime probes can directly verify rect freshness and tracking set health.
- Added Playwright regression coverage for churn invariants (`test_explorer_fx_churn_invariants_hold_across_cycles`) and thumbnail resource fetch pressure (`test_explorer_thumbnail_resource_fetches_do_not_spike_after_roundtrip`) to separate FX-state persistence from thumbnail decode/network behavior.
- Updated static shader contract assertions to lock in the new bounded-state and near-view cap contracts.

### Latest Implementation Notes (2026-03-04, fxdebug reason banner + DOM overlay rect renderer)
- Added explicit fxdebug failure-reason telemetry in `public/js/explorer-shaders.mjs` via `lastRectsReason` / `lastEarlyReturnReason` and early-return publishing (`EARLY_RETURN:*`) so missing-rect states report deterministic causes instead of silently stalling.
- Added a DOM-based debug rectangle layer (`div[data-assetfx="debug-layer"]`) that renders per-rect fixed-position outlines from exported rect snapshots when `fxdebug=1`, decoupling debug-rect visibility from WebGL draw-path failures.
- Added an fxdebug reason banner (`div[data-assetfx="debug-banner"]`) that appears when visible cards exist but no debug rects persist for multiple frames or frame timestamps stall, showing attachment/canvas/candidate/early-return diagnostics.
- `_publishDebugRects(...)` now updates `lastRectsLen`, `visibleCards`, `nearViewCards`, and reason fields every frame (including empty snapshots), and drives banner synchronization so frame freshness failures are immediately visible on-device.

### Latest Implementation Notes (2026-03-04, tick survivability telemetry + IO-independent card discovery)
- Added render-loop survivability telemetry in `public/js/explorer-shaders.mjs` via `window.__assetfx_dbg` counters (`tickFrame`, `tickExitReason`, `candidatesBuilt`, `sampleWanted`, `sampleIssued`, `sampleDone`, `texturesAlive`, `mode`) so stalls can be diagnosed as throttling vs attachment/rect failures.
- Added URL switch `fxio=0` to disable IntersectionObserver hinting while preserving fallback tracking behavior, enabling direct isolation of IO callback health from the core render pipeline.
- Added `_discoverCardsFromDom(limit)` and invoked it in `_render()` so tracked cards are continuously repopulated from the attached grid/card selector when IO events are delayed/dropped under churn.
- Added `_setTickExit(...)` and wired early-return/throttle paths to publish deterministic per-frame exit reasons into debug state.
- Updated static monitor assertions in `tests/test_public_explorer_program_monitor.py` to track the throttled branch shape and tick-exit instrumentation contract.

### Latest Implementation Notes (2026-03-04, readonly-rect hardening + tick exception survivability)
- Hardened `public/js/explorer-shaders.mjs` against WebKit readonly-property traps by introducing `cloneRect(...)` and migrating layout/mask/render geometry reads to cloned plain objects before math/caching.
- Added `cloneVV(...)` and exported `vvState` telemetry through `window.__assetfx_dbg` so visualViewport diagnostics remain explicit without mutating browser-owned viewport structs.
- Wrapped the AssetFX RAF tick body in try/catch/finally; runtime exceptions are now recorded as `lastException`/`lastExceptionT` while scheduling continues so debug telemetry and frame loop survivability are preserved under transient errors.
- Updated static shader monitor assertions to enforce the clone-helper contract and tick exception reporting path.

### Latest Implementation Notes (2026-03-04, fallback renderability promotion for FX sampling/dissolve)
- Added `renderableFallbackMs` (`fxfallbackms` query override, default `680ms`) in `public/js/explorer-shaders.mjs` so cards with loaded fallback imagery are eventually promoted to renderable when in/near view even if thumbnail state remains non-`loaded`.
- Extended keyed card state with `thumbBlockedAt` and updated `_isRenderableMediaReady(...)` to track blocked duration (`thumbState`/fallback source) and unblock sampling once the grace window elapses.
- This prevents prolonged `A-V-` starvation on iOS/slow thumbnail extraction paths and restores pending→sampled progression required for entry dissolve playback.
- Updated static shader monitor assertions to enforce the fallback-promotion contract (`fxfallbackms`, blocked-state fields, and promotion condition).

### Latest Implementation Notes (2026-03-04, layoutdebug overlay sanitizer readonly-guard)
- Hardened `public/explorer.html` overlay sanitizer for iOS/WebKit by introducing guarded helpers `setNodeStyleSafe(...)` and `setNodeDataSafe(...)` and routing sanitizer writes through them.
- `sanitizeRootOverlayInterceptors()` now avoids direct brittle assignments to possibly readonly/interceptor-backed style/dataset properties and falls back safely without throwing.
- This addresses runtime `TypeError: Attempted to assign to readonly property` faults observed during `layoutdebug=1` runs while preserving inert overlay behavior.
- Updated static monitor assertions to require the new safe-setter contract in explorer HTML.

### Latest Implementation Notes (2026-03-04, FX-default view + scene-only dissolve demotion)
- Updated `public/explorer.html` view controls to support `fx|grid|list` with **FX as default** on load; FX mode uses the existing DOM grid as interaction/layout source while applying persistent glass/glow styling tuned by media kind.
- Added FX-mode styling (`#mediaGridRoot.view-fx ...`) to provide persistent blue/purple/yellow type glows and contiguous grid presentation (no hover-lift dependence) as a visual preview direction for shader-led explorer UX.
- Updated view switching to keep grid active for `fx` and route AssetFX dissolve policy by mode (`scene` for FX, `tile` for classic grid/list) via `cardFX.setDissolveMode(...)`.
- Added AssetFX dissolve policy controls in `public/js/explorer-shaders.mjs` (`dissolveMode`, `setDissolveMode`) and gated `_enqueueDissolve(...)` so per-tile wipe dissolves are no longer the default scroll-time behavior.
- Extended static monitor assertions for FX-default controls, dissolve-policy wiring, and FX visual contract markers.

### Latest Implementation Notes (2026-03-04, Hybrid TileFX renderer foundation)
- Added a new `TileFXRenderer` in `public/js/explorer-shaders.mjs` that renders FX-mode tiles via WebGL from DOM-provided rects, with persistent type-colored glow material and selection boost.
- Added internal `TextureCacheLRU` for FX tile textures (upload-once from ready thumbnail images, bounded by texture count/MB budget, with eviction telemetry) to reduce scroll churn flicker.
- Added `window.__tilefx_dbg` runtime telemetry (`mode`, visible count, uploads/sec, cache size/evictions, draw calls, frame timing, fail reason) and fail-safe fallback signaling.
- Updated `public/explorer.html` to instantiate TileFX, provide DOM tile scan source (`collectTileFxTiles` overscan scan), add dedicated `tilefxCanvas`, and keep FX mode as default while preserving existing grid/list behavior.
- View switching now routes both dissolve policy and renderer mode: FX stays scene-level dissolve, while grid/list can use tile dissolves; FX mode suspends legacy per-asset overlay path to avoid double-render contention.
- Updated static monitor assertions to cover TileFX import/wiring, tilefx canvas presence, and TileFX renderer contract markers.

### Latest Implementation Notes (2026-03-04, TileFX invariants + HUD + upload backpressure)
- Hardened FX mode in `public/explorer.html` with explicit TileFX invariants and runtime telemetry wiring: DOM swap validation (`domSwapOk`), scan coverage metrics (`scannedCount`, `culledCount`, `renderedCount`, `coverageRatio`), throttled event-driven scan scheduling (`scheduleTileFxCollect`) and on-screen `#tilefxHud` diagnostics.
- Updated FX CSS ownership so heavy DOM visuals are downgraded in `view-fx` (transparent/none backgrounds + shadows + backdrop filters), while thumbnails stay visible until texture readiness flips `tilefx-ready` to prevent premature blanking.
- Added TileFX coverage fail signaling (`COVERAGE_LOW`) and HUD fail-state rendering to make scan mismatch regressions visible without devtools.
- Enhanced `public/js/explorer-shaders.mjs` TileFX texture instrumentation with per-key upload counters (`totalReuploads`) and steady-state upload backpressure: uploads/sec budget, temporary upload pause, and adaptive DPR cap reduction/recovery (`dprCap`, `backpressureUntil`).
- Removed per-frame DOM rescans from `TileFXRenderer` (`_refreshTileList` now passive), ensuring tile collection runs from UI invalidation events only (scroll/resize/render/view changes), not from every RAF tick.
- Extended static contract assertions in `tests/test_public_explorer_program_monitor.py` to enforce new HUD/invariant hooks and TileFX upload/backpressure markers.

### Latest Implementation Notes (2026-03-04, TileFX texture-source readiness + culling overscan correction)
- Fixed TileFX texture pipeline in `public/js/explorer-shaders.mjs` so DOM thumbnails are treated as texture sources regardless of visibility: tiles now queue pending uploads for non-ready images, promote on `load`/`error`, and drain uploads once ready instead of relying only on immediate `img.complete` checks.
- Added cache/pipeline guards (`TextureCacheLRU.has(key)`, pending upload map, per-key dedupe) to avoid duplicate upload churn; texture readiness now toggles `tilefx-ready` only after a cache-backed texture exists.
- Expanded TileFX debug counters with `texturesUploaded` and `texturesPending` and exposed them in `public/explorer.html` HUD output for direct runtime confirmation of upload activity.
- Increased FX tile scan overscan in `collectTileFxTiles()` to reduce scroll-gap blank bands and switched coverage denominator to visible-expected tiles (`scanned - culled`) for more accurate culling diagnostics.
- Added frame-time adaptive DPR shaping in TileFX (`>18ms` lowers cap, `<10ms` slowly raises cap) to improve Safari/mobile smoothness under load.
- Updated static explorer assertions in `tests/test_public_explorer_program_monitor.py` for the new texture-pending/upload and queueing contract.

### Latest Implementation Notes (2026-03-05, TileFX source-discovery + per-tile readiness handshake)
- Updated `public/explorer.html` TileFX collection to classify thumbnail sources per tile (`img`, CSS background image, `video[poster]`, or `none`) and pass `thumbKind`/`thumbSrc` metadata into the TileFX renderer.
- Added explicit per-tile readiness handoff by writing `data-fx-ready="1|0"` alongside `.tilefx-ready`, and updated FX CSS so DOM thumbnail layers hide only when a tile is texture-ready.
- Added TileFX HUD counters for source discovery and upload-reject diagnostics (`thumbs.*`, `uploadReject.*`) so iOS/Safari blank-tile cases are visible without devtools.
- Added scan-rate throttling in `scheduleTileFxCollect()` (`TILEFX_SCAN_MIN_INTERVAL_MS=90`) to reduce scan churn during rapid scroll while keeping render loop independent.
- Updated `public/js/explorer-shaders.mjs` TileFX upload pipeline to resolve sources beyond inline `<img>`: URL-backed sources are now loaded/decode-gated, pending uploads are tracked, and uploads use cache guards plus `createImageBitmap` fallback paths when available.
- Expanded TileFX debug telemetry with `uploadOk`, `uploadFail`, and `lastUploadError`, and retained `texturesPending`/cache stats for runtime verification.
- Refreshed static explorer assertions in `tests/test_public_explorer_program_monitor.py` for the new FX readiness and telemetry contracts.

### Latest Implementation Notes (2026-03-05, in-view thumbnail vanish fix + stable FX texture readiness)
- Fixed FX blanking regression where tiles could hide DOM thumbs without persistent texture backing by introducing `TileFXRenderer.hasTexture(key)` and applying `data-fx-ready`/`.tilefx-ready` from renderer cache state during every tile collection pass.
- `collectTileFxTiles()` now guarantees a stable fallback key (`data-fx-card-id`) when media IDs are missing, preventing keyless tiles from bypassing upload and readiness logic.
- Tile source selection now prioritizes thumbnail URL metadata (`data-thumb-url`) for image-backed tiles so upload preparation no longer depends solely on DOM image completion/visibility timing.
- Hardened TileFX upload diagnostics: `uploadOk`, `uploadFail`, `lastUploadError`, and categorized reject counters now include `upsertFromImage` failure reasons (e.g., texture upload rejection) rather than silently dropping failed uploads.
- Upload drain path now records and exposes failed texture insert attempts so mobile Safari/WebGL edge cases are visible in HUD telemetry instead of appearing as zero-activity states.

### Latest Implementation Notes (2026-03-05, explicit TileFX upload state-machine telemetry)
- Added explicit TileFX upload state-machine counters in `public/js/explorer-shaders.mjs`: `uploadAttempt`, `pendingWaitLoad`, `pendingReady`, and `srcMissing`, alongside existing `uploadOk/uploadFail/lastUploadError` so stalled upload pipelines are diagnosable on-device.
- Hardened cache insertion fallback in `_drainPendingUploads(...)`: when `createImageBitmap`-backed uploads fail (`TEX_IMAGE_FAILED`), renderer retries texture upload using the original image source before declaring failure.
- Updated `public/explorer.html` HUD to show upload attempts/pending state and missing-source counts, not just final upload totals.
- Added `data-tex` per-tile swap marker in the FX collect loop and CSS readiness gating so DOM thumbnail visibility follows real cache-backed readiness state every scan.
- Extended scan-time card priming to set both `data-fx-ready` and `data-tex` from `tileFX.hasTexture(key)` using stable fallback keys (`fx-card-*`) to avoid stale hide states.
- Updated static explorer assertions for the new upload-state telemetry and `data-tex` swap contract.

### Latest Implementation Notes (2026-03-05, single-view FX ownership + swap conflict reduction)
- Removed FX thumbnail hide coupling to `data-fx-ready` CSS so DOM visibility is now controlled by TileFX-owned swap markers (`data-tex` / `.tilefx-ready`), reducing dual-renderer conflicts where non-TileFX readiness flags could blank cards.
- Added swap lifecycle HUD counters in `public/explorer.html` (`swappedTiles`, `evictedTiles`) and surfaced them in `#tilefxHud` to track in-view texture ownership transitions.
- Extended tile priming in `collectTileFxTiles()` to record eviction transitions (`data-tex: 1 -> 0`) and update swap counts each scan, while preserving stable fallback keys and viewport-space rect mapping.
- Added `lastFailReason` telemetry in `public/js/explorer-shaders.mjs` and synchronized it with upload failure paths so HUD diagnostics report the latest meaningful upload rejection reason.
- Updated static monitor assertions to match the refined FX swap contract and telemetry labels.

### Latest Implementation Notes (2026-03-06, agent handoff hygiene)
- Performed a branch hygiene pass with no API-contract changes; this commit is documentation-only and preserves runtime behavior.
- Confirmed the AGENTS handoff requirement remains active: every commit must include an AGENTS.md update entry for the next agent.
- No additional feature toggles or telemetry fields were introduced in this checkpoint.


### Latest Implementation Notes (2026-03-06, unified FX visual-viewport canvas contract)
- Unified FX canvas viewport contract across static explorer overlays (`fx-debug-overlay`, `fx-shared-overlay`, `#bgImpulseCanvas`, `#tilefxCanvas`) using fixed positioning, `100vw`, and `height: calc(var(--vvh) * 100)` with `!important` guards in `public/explorer.html` to prevent static/partial-width regressions.
- Added visual-viewport-driven sizing helpers in `public/js/explorer-shaders.mjs` (`_vvHeight`, `setVisualVhVar`, `resizeCanvasToCss`, `resizeAllFxCanvases`) and bound updates to `visualViewport.resize`, `visualViewport.scroll`, and `window.resize` so iOS toolbar transitions keep all FX canvases in sync.
- Wired GL resize hygiene by exposing `setResolution(...)` on both `TileFXRenderer` and `AssetFX`, calling `gl.viewport(...)` and refreshing resolution uniforms after canvas backing-size updates.
- Standardized FX DPR behavior at cap `2.0` for overlay/tile/background canvas resizing to avoid mixed-DPR seams; retained upload backpressure but removed adaptive DPR cap drift.
- Updated explorer static assertions in `tests/test_public_explorer_program_monitor.py` for the new viewport-height contract and resize helper hooks.

### Latest Implementation Notes (2026-03-06, FX mode lifecycle hard-disable + perf triage)
- Reworked explorer view switching in `public/explorer.html` so TileFX is an exclusive mode: `window.__explorer_view` and `window.__tilefx_enabled` are now the source of truth, FX canvas visibility is toggled explicitly, and non-FX modes call `tileFX.stop()`, `tileFX.clear()`, and `tileFX.updateTiles([])`.
- Added TileFX runtime lifecycle APIs in `public/js/explorer-shaders.mjs` (`setEnabled`, `start`, `stop`, `clear`, `noteScroll`) and enforced render short-circuiting when FX is disabled; upload draining now pauses during active scroll windows to reduce stutter.
- Simplified `#mediaGridRoot.view-fx` styling in `public/explorer.html` to avoid dimmed/smooshed cards while preserving thumbnail-only swap behavior (`data-tex`) and metadata/selection visibility.
- Changed default explorer startup view to Grid (`state.view='grid'`) as a temporary safety lever while FX mode remains opt-in.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` and added task tracking in `docs/todo/AGENTS.md` with checkbox completion state.

### Latest Implementation Notes (2026-03-06, FX renderer pipeline hardening + health invariants)
- Tightened TileFX pipeline limits in `public/explorer.html` + `public/js/explorer-shaders.mjs`: scan throttle raised to `TILEFX_SCAN_MIN_INTERVAL_MS=120` (~8.3/s), upload budget defaults set to `maxUploadsPerFrame=1` and `maxUploadsPerSecond=8`, and uploads remain deferred during active scroll idle windows.
- Extended `window.__tilefx_dbg` health telemetry with lifecycle/runtime fields (`rafRunning`, `tilesVisible`, `tilesFed`, `tilesDrawn`, `scrolling`, `scrollIdleMs`) and surfaced these in `#tilefxHud` for mobile diagnostics.
- Added fatal non-FX draw invariant handling in both shader/runtime loop and explorer HUD path: if draw calls are observed while mode is not FX, renderer force-stops and clears.
- Cleaned TileFX upload error bookkeeping in `_queueTileImageUpload(...)` to remove duplicated fail-reason writes introduced during prior patch churn.
- Updated `docs/todo/AGENTS.md` by prepending new carry-forward unchecked tasks and marking completed FX lifecycle/pipeline items as done.

### Latest Implementation Notes (2026-03-06, FX renderer-swap state machine + deterministic thumb ownership)
- Added a strict TileFX per-key state model in `public/js/explorer-shaders.mjs` (`DOM_ONLY`, `REQUESTED`, `UPLOADING`, `READY`, `EVICTED`) and now only commit DOM thumbnail swap (`data-tex="1"`) once a texture is actually bound/drawn in the render pass.
- Updated FX-mode CSS in `public/explorer.html` so only per-tile swapped thumbs are hidden (`body.fx-mode .asset[data-tex="1"]`), while card metadata/selection overlays remain visible and card surfaces are visually transparent for true WebGL tile ownership.
- Tightened tile key stability in `collectTileFxTiles()` by preferring durable asset/path/thumb identifiers over volatile fallbacks; tile entries now pass `tileEl` into TileFX for renderer-owned swap transitions.
- Added decode memoization (`decodedSrcSet`) in TileFX image preparation to avoid repeated `img.decode()` churn for identical sources during scroll/collect cycles.
- Extended TileFX HUD/debug counters with swap/state-machine telemetry (`stateCounts`, `readyTiles`, `pendingTiles`, `swapSetCalls`, `swapClearCalls`) and kept conservative mobile budgets (`scan=120ms`, `uploads=1/frame, 8/sec`).
- Refreshed `docs/todo/AGENTS.md` by prepending new carry-forward tasks and marking completed renderer-swap items as done.

### Latest Implementation Notes (2026-03-06, key-stability probe + cache eviction hysteresis + shader cover mapping)
- Added FX debug probe UX in `public/explorer.html` (`ensureTileFxProbeButton`) gated by `fxdebug=1`; one tap now logs the first 20 visible tiles with key source, key-change signal, tile state, texture presence, `data-tex`, and image readiness for on-device iOS diagnostics.
- Hardened key derivation in `collectTileFxTiles()` with explicit source precedence (`assetId`, `path`, `relative`, `thumbSrc`, ...) and per-card key-change tracking to diagnose key thrash.
- Updated `TextureCacheLRU` in `public/js/explorer-shaders.mjs` with `visibleKeySet`, minimum-age hysteresis, and no-visible-eviction behavior; cache telemetry now includes `cacheBytes`, `cacheBudgetBytes`, and `evictReason` in `window.__tilefx_dbg`/HUD.
- Separated upload drain from draw logic: `_drainPendingUploads(...)` is now invoked outside `_render(...)` and additionally gated by `enabled`, `mode==='fx'`, `document.visibilityState==='visible'`, and scroll-idle rules.
- Improved tile thumbnail rendering quality by adding cover-style UV mapping (`u_tex_size`) and rounded-rect masking in TileFX fragment shader so READY tiles better match DOM thumbnail framing while preserving glass treatment.
- Refreshed `docs/todo/AGENTS.md` with new carry-forward tasks and marked completed key-stability/probe/cache/shader work items.


### Latest Implementation Notes (2026-03-06, FX probe snapshot freeze + auto-capture)
- Initialized a persistent `window.__tilefx_probe` structure in `public/js/explorer-shaders.mjs` so probe data exists before explorer HUD updates and survives view toggles.
- Added `captureTileFxProbeSnapshot(reason)` in `public/explorer.html` and routed the FX Probe button through it, storing timestamped visible-tile rows plus readiness/swap/cache counters for deterministic diagnostics.
- Extended probe rows with `thumbSrc` metadata and normalized scalar typing (`String/Number/Boolean`) to keep console payloads stable across Safari and Chromium.
- Updated TileFX HUD rendering to freeze into an `FX PROBE SNAPSHOT` block whenever probe data is present, including summary counters and the first 10 captured rows.
- Added optional `?fxprobe=1` auto-capture after scroll idle in FX mode to support repeatable mobile repro captures without manual tapping.

### Latest Implementation Notes (2026-03-06, FX activation + upload starvation fix)
- Updated `public/explorer.html` FX view switching to call explicit TileFX lifecycle methods (`tileFX.enable()` on FX entry, `tileFX.disable()` on exit), and exposed `window.tileFX` for direct runtime diagnostics.
- Corrected FX suspend wiring in `setView(...)` to follow inspector/actions panel state rather than forcing suspend on every view change.
- Hardened `TileFXRenderer` lifecycle in `public/js/explorer-shaders.mjs`: `setEnabled(true)` now starts RAF immediately, loop exits when disabled, and `enable()/disable()` wrappers provide deterministic toggle semantics.
- Removed strict upload starvation gate by allowing `_drainPendingUploads(...)` during scrolling unless cache pressure is high (>=90% budget), keeping visibility/mode/enabled checks intact.
- Added upload pipeline counters (`uploadsQueued`, `uploadsAttempted`, `uploadsSucceeded`, `uploadsFailed`) and surfaced them to `window.__tilefx_dbg` + HUD for on-device verification that texture uploads are actually progressing.
- Updated `tests/test_public_explorer_program_monitor.py` static assertions for the new FX lifecycle hooks, cache-pressure upload gate, and upload counters.

### Latest Implementation Notes (2026-03-06, FX swap-surface coverage + texture-cap stabilization)
- Updated FX-mode swap CSS in `public/explorer.html` to hide the real thumbnail surface variants (`.thumb`, `img`, `picture`, `video`, thumb utility classes, `[data-thumb]`, and inline background-image holders) only when `data-tex="1"`, while preserving metadata/selection overlays.
- Added a temporary swap sanity signal (`body.fx-mode.fx-swap-sanity`) that outlines swapped tiles for 10 seconds after entering FX mode to verify renderer ownership without devtools.
- Introduced a TileFX upload size contract in `public/js/explorer-shaders.mjs` via `resizeImageForGL(...)`; textures are downscaled before `texImage2D` using runtime knob `?tilefxMaxTex=...` with defaults `320` on coarse pointers and `512` on desktop pointers.
- Updated `TextureCacheLRU` byte accounting to use uploaded (resized) dimensions and added average texture-size telemetry so HUD/probe now report `maxTex` and `avgTex` alongside cache bytes/budget.
- Reduced churn by adding dynamic scan pacing (`120ms` while scrolling, `1000ms` idle heartbeat) and idled upload drain short-circuit when READY coverage already exceeds visible tiles plus configurable margin (`tilefxIdleReadyMargin`).
- Extended static assertions in `tests/test_public_explorer_program_monitor.py` for swap-coverage CSS, texture-cap wiring, resize helper presence, and new maxTex telemetry strings.

### Latest Implementation Notes (2026-03-06, FX lifecycle isolation hard-stop)
- Added explicit mode-exit lifecycle teardown for TileFX: `destroyTileFX()` in `public/explorer.html` now runs whenever leaving FX mode and funnels through renderer teardown + canvas-state reset.
- Exposed runtime lifecycle controls `window.destroyTileFX` and `window.setViewMode` to simplify on-device mode-transition diagnostics.
- Added `TileFXRenderer.teardownForModeExit({ removeCanvas = false })` in `public/js/explorer-shaders.mjs` to hard-reset renderer state (RAF stop, tile lists, pending uploads, cache textures, and key debug counters) without requiring full page reload.
- Hardened RAF loop guard so frame scheduling exits unless `enabled`, `mode==='fx'`, and `document.body` currently has `.fx-mode`, preventing ghost draw loops behind Grid/List.
- Added CSS safety rule `body:not(.fx-mode) #tilefxCanvas { display:none !important; opacity:0 !important; }` so stale FX canvas visibility cannot leak across modes even if JS ordering regresses.
- Updated static explorer assertions for new lifecycle hooks, teardown wiring, and non-FX canvas visibility contract.

### Latest Implementation Notes (2026-03-06, direct thumb-surface swap ownership + telemetry cleanup)
- Updated `collectTileFxTiles()` in `public/explorer.html` to capture explicit thumbnail ownership pointers (`thumbSurfaceEl`, `thumbBgEl`) in addition to `thumbEl/thumbKind/thumbSrc`, removing reliance on broad CSS-guessing for swap control.
- Added TileFX canvas compositor diagnostics in explorer layout debug output (`tileFxCanvasTransformedAncestor`) to spot transformed-ancestor stacking issues behind “underlayer” artifacts.
- Implemented `TileFXRenderer.applyDomSwap(tile, swapped)` in `public/js/explorer-shaders.mjs` so swap visibility is applied directly to the actual thumb surface via inline styles (opacity/visibility and background-image restore handling), and restored on non-ready/evicted paths.
- Changed READY swap timing so DOM ownership flips only after a successful GL draw call in `_render(...)`, preventing pre-draw flashes when textures are bound but not yet rasterized.
- Raised default coarse-pointer texture cap to `512` (`tilefxMaxTex` override retained; desktop default now `640`) for improved iPhone sharpness while preserving capped uploads.
- Adjusted HUD eviction telemetry to avoid sticky `OVER_BUDGET` reporting by emitting `evictReason='none'` when cache bytes are comfortably below budget.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` for new thumb-surface fields, direct swap API, transformed-ancestor debug output, and updated default texture-cap expression.

### Latest Implementation Notes (2026-03-06, multi-surface thumb painter ownership)
- Reworked TileFX tile collection in `public/explorer.html` to emit explicit `thumbPaintEls` alongside `thumbSurfaceEl/thumbBgEl`, covering image/video/picture/background painter variants per asset card.
- Added `window.debugLogTilePainters(...)` (FX debug helper) to inspect computed painter visibility/opacity/background state on swapped cards directly from mobile Safari console.
- Updated `TileFXRenderer.applyDomSwap(...)` in `public/js/explorer-shaders.mjs` to operate on all painter nodes in `thumbPaintEls`, storing/restoring inline style state via WeakMaps and toggling `fx-swapped` class on the tile card.
- Tightened swap correctness by applying DOM hide only after the corresponding GL draw call and restoring all painter nodes immediately on non-ready/evicted paths.
- Narrowed CSS swap fallback to img-only (`.thumb > img.asset-thumb`) so JS ownership remains authoritative and metadata/overlay surfaces are not unintentionally hidden.
- Fixed thumbnail background URL parsing regression in `collectTileFxTiles()` (`/url\((['"]?)(.*?)\1\)/i`) and kept transformed-ancestor layout diagnostics for `#tilefxCanvas` in the layout debug payload.

### Latest Implementation Notes (2026-03-06, visual-viewport TileFX alignment fix)
- Updated `public/js/explorer-shaders.mjs` TileFX canvas sizing to use visual-viewport metrics (`visualViewport.width/height`) and fixed-position style dimensions, with resize hooks already wired for `visualViewport.resize|scroll` and `window.resize`.
- Reworked TileFX draw placement to subtract `visualViewport.offsetLeft/offsetTop` from live card rects before pixel mapping, preventing quad drift/misalignment during iOS URL bar collapse/expand.
- Implemented per-frame rect refresh for fed tiles (`tileEl.getBoundingClientRect()`) to remove stale cached layout coordinates during scroll/viewport animation transitions.
- Added `?tilefxDebugRects=1` truth-overlay outlines driven by the same mapped rects used for GL draws to verify alignment on-device.
- Changed TileFX debug-state initialization to merge existing `window.__tilefx_dbg` instead of replacing it, reducing HUD/probe stale-instance mismatches.

### Latest Implementation Notes (2026-03-06, TileFX disable-guard + swap persistence pass)
- Guarded `destroyTileFX(...)` in `public/explorer.html` so FX renderer teardown is blocked while `state.view === 'fx'` unless explicitly forced; non-FX view transitions now pass explicit teardown reasons for log traceability.
- Added FX viewport-event handling in explorer (`visualViewport.resize|scroll`) as collect-only signals (`visual-viewport-live` + debounced `visual-viewport`) with no mode-exit side effects.
- Added disable instrumentation in `TileFXRenderer.disable(reason)` (`[tilefx] DISABLE` + stack) to reveal any accidental shutdown path that flips `enabled/raf` during runtime.
- Added swapped-tile tracking (`_swappedTileRefs`) and `_restoreUntrackedSwaps(...)` so tiles leaving the active fed set are unswapped/restored, preventing hidden-thumb persistence after offscreen scroll.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` for guarded destroy signature/callsite and new TileFX disable + swap-restore symbols.

### Latest Implementation Notes (2026-03-06, FX painter-leak toast diagnostics)
- Added optional swapped-painter leak toast diagnostics in `public/explorer.html` behind `?fxdebug=1&tilefxPainterToast=1`, emitting a warning toast when swapped cards still report visible thumb painter surfaces.
- Hooked painter-leak checks into `scheduleTileFxCollect(...)` after DOM-swap verification so diagnostics run on the same scan cadence without affecting normal mode behavior.
- Kept diagnostics deduplicated per tile key and throttled via a short timer to avoid toast spam during continuous scrolling.
- Updated `docs/todo/AGENTS.md` and static assertions in `tests/test_public_explorer_program_monitor.py` for the new debug toast hook and query flag.

### Latest Implementation Notes (2026-03-06, FX runtime watchdog auto-recover)
- Added `maybeRecoverTileFxRuntime(reason)` in `public/explorer.html` to auto-recover TileFX in FX view when debug state indicates renderer/RAF has gone stale (`enabled/raf` false or stale draw counters after idle).
- Wired watchdog recovery to heartbeat interval (`TILEFX_WATCHDOG_INTERVAL_MS=900`) and visualViewport live events so recover attempts happen without mode-exit teardown side effects.
- Recovery path now reasserts `tileFX.setMode('fx')`, `tileFX.enable()`, and schedules fresh tile collection with a reason tag for traceable diagnostics.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` for watchdog constants, helper function, and recovery callsites.
- Updated `docs/todo/AGENTS.md` checklist to mark watchdog task complete and keep iPhone proof/perf profiling tasks open.

### Latest Implementation Notes (2026-03-06, authoritative swap-state + hysteresis)
- Upgraded `TileFXRenderer` swap ownership to an explicit WeakMap-backed swap state model (`TILE_SWAP_STATE.DOM_VISIBLE|FX_SWAPPED|RESTORING`) with reasoned transition breadcrumbs in `window.__tilefx_dbg.swapTransitions`.
- Kept DOM thumbnail suppression authoritative through `applyDomSwap(...)` inline style control on `thumbPaintEls` and background-image restoration snapshots, with `data-tex` retained as reflected state only.
- Added offscreen swap restore hysteresis in `_restoreUntrackedSwaps(activeTileEls, now)` (frame/time thresholds) and skip unswap churn during scrolling to prevent scroll-away disappear/reappear flashes.
- Added tile debug-rect mismatch logging (`[tilefx] rect mismatch` when >2px) and expanded explorer layout diagnostics with `tileFxCanvasTransformChain` to surface transformed/filter/backdrop ancestor stacks.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` and refreshed `docs/todo/AGENTS.md` task checklist for the new authoritative swap-state contract.

### Latest Implementation Notes (2026-03-06, compositor lock + rect source-of-truth pass)
- Hardened FX compositor behavior in `public/explorer.html` by forcing `#tilefxCanvas` to a top-level fixed layer contract (body-attached, transform/filter cleared), adding `fx-safemode` class toggles in FX mode, and disabling swapped pseudo-element painters.
- Added stricter layout diagnostics: `tileFxCanvasTransformChain` is now computed once per debug pass and emits an explicit `[tilefx] canvas transform-chain detected` error when non-empty in FX view.
- Centralized TileFX rect mapping in `public/js/explorer-shaders.mjs` with `_getTileRectInVisualViewport(...)` + `_cssRectToCanvasRect(...)` helpers so visualViewport offsets/DPR conversion are applied from one source-of-truth.
- Added swap minimum-hold gating (`_canReleaseSwap`, `_swapMinHoldMs`) on top of offscreen hysteresis to prevent edge-of-viewport swap thrash and transient DOM reappearance.
- Added fed/pending pressure controls: adaptive overscan+fed cap in `collectTileFxTiles()` and pending-cap telemetry (`pendingCap`, `pendingClamped`) in TileFX upload queueing/drain.
- Updated static assertions and TODO checklist for safemode CSS, rect helper APIs, pending cap telemetry, and FX mode safeties.

### Latest Implementation Notes (2026-03-06, FX lifecycle single-owner stabilization)
- Removed runtime watchdog auto-recovery in `public/explorer.html` (heartbeat + visualViewport recovery paths) so TileFX lifecycle changes now happen only through explicit `setView('fx'|'grid'|'list')` transitions.
- FX view entry now explicitly enables/starts TileFX and shows the canvas; non-FX view entry disables/stops/clears TileFX, restores all DOM swaps, clears fed tiles, and hides the canvas.
- Added `restoreAllDomSwaps(reason)` to `public/js/explorer-shaders.mjs` and reused it from teardown + non-FX transitions for deterministic DOM thumbnail restoration.
- Added explicit layer-contract diagnostics (`logTileFxLayerContract`) and z-index tokens (`--z-bg-canvas`, `--z-tilefx-canvas`, `--z-hud`) so HUD/probe/toast layers stay above the TileFX plane while retaining pointer-event isolation.
- HUD alert semantics now prioritize lifecycle invariants (`view===fx && !enabled` or `view!==fx && drawCalls>0`) to reduce misleading stale-failure noise during view switches.

### Latest Implementation Notes (2026-03-06, FX final stabilization proof + visible-set health)
- Added proof mode in `public/explorer.html` behind `?tilefxProof=1` with `window.captureTileFxProof(reason)` snapshots persisted at `window.__tilefx_proof` (view/liveness counters, visualViewport metrics, and top visible tile rows including rect/data-tex/texture state).
- Added non-recovering FX liveness assertions (`assertTileFxLiveness`) that record the first failure to `window.__tilefx_dbg.firstLivenessFailure` and emit one high-signal error without automatic re-arm/teardown behavior.
- Added lockstep rect mismatch probing (`computeTileFxRectLockstep`) to compare DOM tile rects, FX mapped rects, and metadata overlay anchors; mismatches >2px are stored in `window.__tilefx_dbg.rectMismatchRows` with HUD summary.
- Updated fed-set collection in `collectTileFxTiles()` to deterministic visible-first ordering with bounded overscan promotions while scrolling (`visiblePromotedThisPass`) and retained adaptive `collectOverscan`/`maxFed` telemetry.
- Added visible painter leak diagnostics and per-card `data-visiblePainterLeakCount`; swapped painter leaks now log once per tile in debug with optional toast only when `tilefxPainterToast=1`.
- Added compact-by-default HUD mode for non-debug runs, plus visible health telemetry (`visibleReady`, `visibleUploading`, `visibleDomOnly`, `visibleSwapped`) and swap release counters (`swapReleaseBlocked`, `swapReleaseAllowed`).
- Updated `TileFXRenderer` release gating with `_swapReleaseIdleMs` and idle checks so swap clears are blocked during transient churn, favoring stable visible ownership.

### Latest Implementation Notes (2026-03-06, lifecycle invariant guard + proof summary export)
- Added a hard disable guard in `public/js/explorer-shaders.mjs`: `TileFXRenderer.disable(reason, { allowInFxView = false })` now blocks illegal disable attempts while `window.__explorer_view === 'fx'`, logs stack traces, and records `illegalDisableBlocked`/`lastIllegalDisable` debug metadata.
- Added `computeTileFxHealthVerdict()` and `window.exportTileFxProofSummary()` in `public/explorer.html` so physical iPhone runs can export a compact proof payload (liveness, visible-set health, swap counters, cache metrics, viewport metrics, and row-level ownership/mismatch snapshots).
- Added a debug-only `Capture Proof` button (`fxdebug=1&tilefxProof=1`) that triggers proof capture plus summary export in one tap.
- Added defensive dead-overlay behavior in `assertTileFxLiveness(...)`: first FX liveness failure now hides `#tilefxCanvas` to avoid stale glow overlays when renderer is disabled.
- HUD compact/expanded output now includes renderer truth labels and health verdict lines (`health: ...`) to make lifecycle invariant failures explicit during runtime verification.

### Latest Implementation Notes (2026-03-06, physical-proof verdict + lockstep aggregate pass)
- Added `window.logTileFxProofSummary(reason)` in `public/explorer.html` as a read-only proof workflow helper that chains `captureTileFxProof(...)` + `exportTileFxProofSummary()` and logs `[tilefx-proof-summary]` output.
- Proof export now reports `proofPass`, `deadOverlayHidden`, `deadOverlayReason`, visible mismatch aggregates (`rectMismatchVisibleCount`, `rectMismatchMaxPx`, `rectMismatchAvgPx`), and visible ownership fields (`visibleReadyButNotSwapped`, `visibleSwappedButNoTexture`, `visibleUploadingCount`).
- `computeTileFxHealthVerdict()` now treats visible-set settle conditions as first-class (`scrollIdleMs` gate) and fails explicitly on ready-not-swapped / swapped-no-texture ownership anomalies.
- `computeTileFxRectLockstep()` now records per-axis mismatch components (`fxVsDomX/Y`, `overlayVsDomX/Y`) and aggregate mismatch statistics while preserving >2px mismatch capture semantics.
- `assertTileFxLiveness(...)` now tracks dead-overlay state (`deadOverlayHidden`/`deadOverlayReason`) and resets those markers automatically when FX liveness is healthy again.
- Added test assertions for the new proof helper/verdict fields and renderer illegal-disable telemetry in `tests/test_public_explorer_program_monitor.py`.

### Latest Implementation Notes (2026-03-06, lifecycle sync authority follow-up)
- Centralized FX lifecycle transitions in `public/explorer.html` via `syncTileFxLifecycleToView(...)` so both `setView(...)` and `destroyTileFX(...)` share a single authoritative enable/disable/start/stop/clear/restore path.
- `destroyTileFX(...)` now syncs lifecycle by current view instead of directly disabling renderer state, preserving FX-view disable guard behavior while still allowing explicit non-FX teardown.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` to check for the lifecycle sync helper + setView callsites instead of the removed direct `tileFX.enable('setView:fx')` / `tileFX.disable('setView:non-fx')` strings.

### Latest Implementation Notes (2026-03-06, lifecycle invariant lock pass)
- Refactored `syncTileFxLifecycleToView(view, reason, opts)` in `public/explorer.html` to be the single authority for FX lifecycle mutation (enable/disable/start/stop/canvas show-hide/restore+clear paths), with `setView(...)` and `destroyTileFX(...)` both routed through that helper.
- Added `assertTileFxViewLifecycle(reason)` to run immediately after lifecycle sync calls; it force-corrects mismatched runtime state and contains unrecoverable failures through `containTileFxInvariantFailure(...)` (hide canvas + restore DOM swaps + mark dead-overlay fields).
- Removed runtime liveness assertions from collect/heartbeat cadence so lifecycle assertion is sync-only rather than per-frame/per-scroll noise.
- Added explicit viewport contract comment and retained visualViewport handlers as resize/collect only (no lifecycle mutation).
- Tightened renderer-side illegal disable telemetry in `public/js/explorer-shaders.mjs` by logging one stack-bearing console error per illegal-disable streak while still counting every blocked attempt (`illegalDisableBlocked`, `lastIllegalDisable`).
- Updated static monitor tests for the new lifecycle helper signatures/containment helpers and for lifecycle-authority string checks.

### Latest Implementation Notes (2026-03-06, visible ownership + scroll stability pass)
- Added renderer ownership authority helpers in `public/js/explorer-shaders.mjs`: `syncVisibleTileOwnership(activeTiles, drawResults, now)` and `getVisibleOwnershipRows(limit)` so swap decisions are based on draw-truth (`wasDrawnThisPass`, valid rect, texture present) instead of cache presence alone.
- Added stricter swap-release guards to prevent visible tile unswaps: `_restoreUntrackedSwaps(...)` now accepts visible-tile sets and blocks release for currently visible tiles; new telemetry tracks `visibleSwapReleaseBlocked` and `offscreenSwapReleaseAllowed`.
- Kept lifecycle untouched in hot paths while tightening ownership behavior: post-draw ownership sync runs once per render commit and does not mutate lifecycle enable/disable/RAF state.
- Tuned fed-set behavior in `collectTileFxTiles()` for coarse-pointer/mobile scroll stability with smaller scrolling caps (`collectOverscan`, `maxFed`, `maxPromoted`) and added `fedVisibleRatio` telemetry.
- Added compact ownership probe `window.logVisibleTileOwnership(limit)` in `public/explorer.html` for on-device console truth checks of visible tile owner/state/draw/texture/data-tex fields.
- Added HUD lifecycle stability line (`lifecycleStable`) and surfaced new ownership counters in expanded rows.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` for the new ownership helper APIs/telemetry and revised fed-set constants.

### Latest Implementation Notes (2026-03-06, renderer behavior finish pass)
- Tightened thumbnail ownership authority in `public/js/explorer-shaders.mjs` so FX swap now requires draw truth (`visible && hasTexture && wasDrawnThisPass && rectValid`) instead of cache/READY state alone.
- Changed active/fed tile behavior to block swap release inside `syncVisibleTileOwnership(...)`; swap release is now restricted to untracked tiles only.
- Hardened `_restoreUntrackedSwaps(...)` with an additional near-visible guard set so release cannot touch currently visible or near-visible tiles.
- Re-tuned visible-first feed constants in `collectTileFxTiles()` (`overscan`, `maxFed`, `maxPromoted`) and sorted overscan candidates by viewport distance so near-visible tiles warm first and distant gradual takeover is reduced.
- Kept lifecycle and diagnostics surface unchanged for this pass; changes are renderer behavior + ownership/release policy only.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` for the tuned constants and updated untracked-swap call signature.

### Latest Implementation Notes (2026-03-06, lifecycle bootstrap deadlock fix)
- Fixed FX lifecycle bootstrap false-negative in `assertTileFxViewLifecycle(...)`: RAF is now considered healthy when a frame is scheduled (`tileFX.raf > 0`) even before `tileFxDbg.rafRunning` flips true on the first callback.
- This prevents immediate containment fallback during valid startup, which was hiding the TileFX canvas and restoring DOM swaps before the first render loop tick.
- Kept renderer architecture/features unchanged; this patch only corrects startup ordering so the existing scan→feed→upload→draw pipeline can proceed.

### Latest Implementation Notes (2026-03-06, thumb painter leak + ownership snapshot fix)
- Updated `collectTileFxTiles()` painter extraction in `public/explorer.html` so `thumbPaintEls` always includes `.thumb` alongside `img.asset-thumb`, and includes `.thumb .scrim` when present, ensuring swapped thumbnail suppression targets real paint surfaces (not just `<img>` nodes).
- Updated painter leak detector in `countVisibleThumbPainters(...)` to treat hidden nodes as non-painting even if they still have CSS background values, eliminating false-positive leak reports from hidden thumb wrappers.
- Expanded `TileFXRenderer.applyDomSwap(...)` background suppression/restoration in `public/js/explorer-shaders.mjs` to snapshot/restore `backgroundImage/background/backgroundColor` per thumb paint node and aggressively neutralize `.thumb` surface paint while swapped.
- Updated `TileFXRenderer.getVisibleOwnershipRows(limit)` fallback to return current fed tile ownership rows when no per-frame ownership rows are cached yet, so `window.logVisibleTileOwnership(...)` no longer returns an empty snapshot during active FX startup windows.
- Added one FX-active guard log in `window.logVisibleTileOwnership(...)` when rows are unexpectedly empty while FX is enabled.

### Latest Implementation Notes (2026-03-06, metadata-safe thumb/body split)
- Refactored grid tile markup in `public/explorer.html` so `.thumb` now contains sibling layers: `.thumb-body` (thumbnail painters only) and `.asset-ui` (metadata + controls), preventing FX thumbnail suppression from hiding metadata.
- Moved `.asset-overlay`, badges/title/subtitle, selector UI, play button, and preview pill into `.asset-ui` so DOM metadata remains visible/stable while FX swaps thumbnail body ownership.
- Updated tile painter collection to target `.thumb-body` surfaces (`img.asset-thumb`, body background, `.thumb-body .scrim`) and removed reliance on suppressing `.thumb` as a whole painter surface.
- Updated painter leak candidate scanning to include `.thumb-body` so leak detection aligns with the new ownership boundary.

### Latest Implementation Notes (2026-03-06, FX lifecycle runtime-truth alignment)
- Updated lifecycle/health/HUD runtime checks in `public/explorer.html` to treat renderer state as active when either debug flags or live renderer fields indicate activity (`tileFxDbg.enabled || tileFX.enabled`, `tileFxDbg.rafRunning || tileFX.raf > 0`).
- This removes false `lifecycle_invariant` states caused by debug-field lag while RAF is already scheduled/running and prevents misleading `enabled:0|raf:0` HUD output during valid FX startup.
- Kept lifecycle authority path unchanged (`syncTileFxLifecycleToView(...)`) and did not add new proof/hud/recovery surfaces.
- Updated static monitor expectations for the runtime-truth HUD strings in `tests/test_public_explorer_program_monitor.py`.

### Latest Implementation Notes (2026-03-06, visible batch-gated FX entry phase)
- Added a TileFX entry-phase tracker in `public/js/explorer-shaders.mjs` (`_fxEntryPhase`, `_fxEntryStartedAt`) and mode-transition handling in `setMode(...)` so entering FX starts in `bootstrap` and non-FX modes reset to `steady`.
- Added `getFxEntryPhase()` to expose renderer entry state to collector/lifecycle callers without coupling to private fields.
- Updated `syncVisibleTileOwnership(...)` to compute a visible readiness batch (`visibleReadyRatio`) from draw truth (`visible`, `hasTexture`, `wasDrawnThisPass`, `rectValid`) and auto-promote phase to `steady` only when readiness reaches all-visible or at least 80%.
- During `bootstrap`, visible tile swap commits are blocked (`blockVisibleSwapCommit`) so DOM→FX ownership transfer no longer occurs incrementally row-by-row; visible swaps are now committed as a synchronized batch after readiness threshold.
- Kept steady-state ownership logic and swap eligibility rules unchanged after phase promotion; this patch only changes FX entry behavior and first-visible commit timing.

### Latest Implementation Notes (2026-03-07, strict visible-batch FX entry completion)
- Replaced the single bootstrap phase with explicit phase sequencing in `public/js/explorer-shaders.mjs`: `bootstrap_collect` → `bootstrap_ready` → `bootstrap_commit` → `steady`.
- Tightened bootstrap exit to require **100% readiness** of the captured visible bootstrap set (`visible + hasTexture + wasDrawnThisPass + rectValid`) before entering commit; removed the prior >=80% ready promotion behavior.
- Added bootstrap visible-set stabilization (`_bootstrapVisibleTileEls`) and forced DOM ownership reset at bootstrap collect so visible tiles do not partially swap during entry.
- Implemented grouped visible-batch commit in `bootstrap_commit` (`applyDomSwap(..., true, 'bootstrap:batch-commit')`) so visible ownership switches coherently instead of row-order stagger.
- Froze offscreen promotion before steady by updating `collectTileFxTiles()` to detect non-steady entry phase and run visible-only collection (`maxPromoted = 0`, overscan loop break, minimal overscan).
- Protected bootstrap visible tiles from untracked cleanup release by extending `_restoreUntrackedSwaps(...)` with a protected tile set and blocking release while phase is non-steady.

### Latest Implementation Notes (2026-03-07, steady-state visible ownership discipline)
- Tightened TileFX steady behavior in `public/js/explorer-shaders.mjs` with an explicit visible-lock rule: visible draw-valid tiles in `steady` are force-kept FX-owned (`steady:visible-lock`) and do not drift back to DOM because of offscreen/queue churn.
- Added steady mismatch correction for visible swapped tiles that lose draw-truth (`steady:draw-truth-lost`) so invalid visible FX ownership is corrected on the next sync pass instead of persisting.
- Kept ownership sync order visible-first: visible ownership decisions are still applied before `_restoreUntrackedSwaps(...)` cleanup in render commit flow.
- Hardened swap release policy in `_restoreUntrackedSwaps(...)`: visible release remains blocked, while near-visible release now requires stronger hold windows (`_swapReleaseNearVisibleIdleMs`, `_swapReleaseNearVisibleDelayFrames`, `_swapReleaseNearVisibleDelayMs`) before release is allowed.
- Reduced steady-state warming churn in `collectTileFxTiles()` with more conservative non-bootstrap feed constants (lower steady overscan/maxFed/maxPromoted, especially for coarse-pointer/mobile) to prioritize visible stability under scroll-stop-scroll patterns.

### Latest Implementation Notes (2026-03-07, visible ownership truth-path repair)
- Fixed `window.logVisibleTileOwnership(limit)` in `public/explorer.html` to treat empty rows in active FX view with visible DOM cards as an ownership-truth bug (`visibleDomCards > 0 && rows.length === 0`) and return summary flags (`visibleDomCards`, `ownershipTruthBug`) without adding new HUD/diagnostic surfaces.
- Updated `TileFXRenderer.getVisibleOwnershipRows(limit)` in `public/js/explorer-shaders.mjs` to prefer a current visible DOM-set scan (`_collectVisibleDomOwnershipRows(...)`) before falling back to cached rows, preventing stale/empty cache returns when visible cards are present.
- Added per-frame draw-truth retention map (`_lastDrawByTileEl`) and wired render-pass updates so visible ownership rows can include current-frame truth even when cache rows are not yet populated.
- Expanded ownership row shape to include compact inspection fields required for visible truth checks: `fed`, `rectValid`, and `swapState` alongside existing state/owner/texture fields.
- Kept the fix scoped to ownership truth path only (no new proof exporters/HUD panels/recovery loops), and updated static assertions in `tests/test_public_explorer_program_monitor.py` accordingly.

### Latest Implementation Notes (2026-03-07, dual-owner collapse using live visible ownership truth)
- Added `_reconcileVisibleOwnerFromTruth(...)` in `public/js/explorer-shaders.mjs` to make visible ownership decisions binary and deterministic from draw-truth, collapsing visible tiles immediately to DOM or FX ownership without lingering mixed states.
- Updated `syncVisibleTileOwnership(...)` to route visible ownership transitions through the reconcile helper for both steady visible-lock and draw-truth-loss correction paths, preventing mixed visible owner persistence across frames.
- Tightened bootstrap visible-set stability by removing recapture-on-empty behavior during non-steady phases; bootstrap now keeps the captured visible set intersection and avoids incremental visible claiming resets that can reintroduce top-to-bottom takeover feel.
- Kept ownership hot-path order unchanged (visible ownership sync before untracked cleanup) and limited this pass to behavior correction using existing ownership truth surfaces.
- Updated static assertions in `tests/test_public_explorer_program_monitor.py` for the reconcile helper wiring and steady ownership reason markers.

### Latest Implementation Notes (2026-03-07, abstraction compression + visible FX ownership maturation)
- Compressed lifecycle mental model in `public/js/explorer-shaders.mjs` with `getFxLifecycleStage()` and `_isEnteringPhase()` so runtime behavior reads as `entering` vs `steady` while preserving internal bootstrap sub-phases as implementation detail.
- Kept bootstrap coherent-batch entry and added a guarded fallback commit path (`>=90% ready` after 1200ms) with inline comment, so one stalled visible tile on iPhone no longer blocks all visible FX ownership forever.
- Added bootstrap empty-set escape (`bootstrap_ready` with zero captured visible tiles advances to `steady`) to avoid getting stuck in entering state with permanent DOM ownership.
- Updated debug visible counters (`visibleReady`, `visibleSwapped`, `visibleDomOnly`, `visibleUploading`) to derive from current visible ownership rows rather than global tile-state counts, making ownership health reflect on-screen truth.
- Preserved DOM metadata ownership (`.asset-ui`) and existing visible ownership reconcile path (`_reconcileVisibleOwnerFromTruth(...)`) while keeping hot-path ordering unchanged (visible ownership resolution before untracked cleanup).

### Latest Implementation Notes (2026-03-07, visible upload/draw pipeline unblock)
- Identified the first visible FX-maturity blocker in `public/js/explorer-shaders.mjs` as upload-drain gating: `_drainPendingUploads(...)` could early-return when global ready counts looked sufficient even while currently visible tiles still lacked textures.
- Updated `_drainPendingUploads(...)` to compute `visibleMissingTextures` from the current visible tile set and skip the idle ready-count early-return while visible tiles remain texture-missing.
- Added `visibleMissingTextures` runtime telemetry in `window.__tilefx_dbg` for existing diagnostics consumption (no new HUD/proof surfaces).
- Hardened `_resolveTileSource(tile)` with fallback-to-`thumbSrc` when an image node exists but has no usable URL yet, preventing silent source stalls for visible cards that still carry non-img resolved thumb sources.
- Kept ownership policy/reconcile semantics unchanged for this pass; changes are targeted to source→upload→texture→draw maturation path only.
- Follow-up in same pass: queued visible tile uploads directly in `_render(...)` before rect-valid draw gating (`if (key && visible && !textureCache.has(key)) _queueTileImageUpload(...)`) so temporarily invalid visible rects no longer block source/upload progression.

### Latest Implementation Notes (2026-03-07, visible FX ownership truth verification + tiny cleanup)
- Verified the real explorer runtime truth loop (enter FX → settle → short scroll → stop) against `/public/explorer.html` and confirmed visible FX maturation is now occurring (`hasTexture:true`, `wasDrawnThisPass:true`, `owner:"FX"`) from `window.logVisibleTileOwnership(12)` output.
- Captured proof summary/runtime slice showing `visibleReady:1`, `visibleSwapped:1`, `visibleDomOnly:0`, `visibleMissingTextures:0` for the sampled settled run; no `dual_owner` was observed in the sampled visible rows.
- Per follow-up cleanup guidance, removed one redundant in-draw `_queueTileImageUpload(tile, key)` call in `_render(...)` now that visible upload-first queueing runs earlier (before rect-valid gating); behavior remains upload-first and texture progression is unchanged.
- Kept scope narrow: no new abstractions, proof systems, or telemetry surfaces were added in this pass.

### Latest Implementation Notes (2026-03-07, lifecycle dead-state elimination in FX view)
- Fixed the core contradiction in `public/explorer.html` lifecycle sync: FX view can no longer silently settle with a dead renderer (`enabled:0`, `raf:0`) as a “contained” steady state.
- Updated `assertTileFxViewLifecycle(...)` to use live runtime truth (`tileFX.enabled`, `tileFX.raf`) for startup checks and to retry one RAF before declaring a fatal lifecycle failure.
- Kept containment for true failures only and added explicit fatal exit (`forceExitFxAfterFatalLifecycle(...)`) that cleanly switches back to grid/DOM-safe mode instead of leaving `view === 'fx'` while renderer is stopped.
- Updated `syncTileFxLifecycleToView(...)` to return assertion truth in FX mode, keeping lifecycle authority behavior explicit.
- Pruned the top of `docs/todo/AGENTS.md` to behavior-first lifecycle tasks and collapsed repeated proof-capture chores into a deferred section.

### Latest Implementation Notes (2026-03-07, visible pending upload starvation fix)
- Found the next concrete post-lifecycle blocker in the visible pipeline: pending upload drain order could spend frame budget on non-visible work before visible pending keys, leaving visible cards texture-missing/DOM-only under queue pressure.
- Updated `_drainPendingUploads(...)` in `public/js/explorer-shaders.mjs` to build a visible-first pending work list (`visiblePendingKeys` then `otherPendingKeys`) so visible tiles get upload attempts first each drain cycle.
- Updated `_queueTileImageUpload(...)` image prep path to prefer preparing the existing DOM `img` element first (including load wait) and only fall back to URL preload when the element prep fails and a URL exists.
- Kept scope narrow to source→queue→upload→texture maturity; no new proof/HUD/watchdog surfaces were added in this pass.

### Latest Implementation Notes (2026-03-07, single-visible-card source/upload maturity)
- Narrowed the next blocker to the seeded 1-visible-card path: lifecycle remains alive, but the card could stay DOM-only when image-source prep stalled before texture upload.
- Adjusted `_queueTileImageUpload(...)` so `img` kind prep is deterministic for visible cards: use DOM image when immediately usable, otherwise preload via URL first and only fall back to DOM image prep if URL preload fails.
- Retained visible-first pending drain ordering in `_drainPendingUploads(...)` so single visible keys are serviced before non-visible warm items.
- Added minimal runtime pipeline breadcrumb (`window.__tilefx_dbg.lastVisiblePipeline`) and row `pipeline` reflection for existing ownership rows, without adding new HUD/proof/toast/watchdog surfaces.

### Latest Implementation Notes (2026-03-07, queue-stage fix in collector path)
- Confirmed the seeded single-card runtime key/source binding is valid (`ingest/originals/img0.jpg` with thumbnail URL/currentSrc) and that prior null diagnostics were caused by detached context, not missing DOM card data.
- Fixed queue-stage gating by allowing visible upload queueing from `updateTiles(...)` (collector-fed path) so a visible texture-missing tile can enter `_queueTileImageUpload(...)` even when render-loop visibility gating is stale.
- Triggered `_drainPendingUploads(...)` from `updateTiles(...)` after visible queueing so queued visible work can progress without waiting for later render-loop timing.
- Kept the patch narrow to queue/drain stage progression; no new HUD/proof/toast/watchdog surfaces were added.
- Runtime in this container still reports `tileFX.gl` unavailable / renderer failed in headless Firefox (`glReady:false`, `failed:true`), which prevents texture creation/draw ownership confirmation in this environment despite queue-path changes.

### Latest Implementation Notes (2026-03-07, queue truth reflection + null-texturecache guard)
- Found a concrete queue-path defect after binding to the real visible key: `_queueTileImageUpload(...)` still dereferenced `this.textureCache.has(key)` even when texture cache was unavailable, preventing reliable queue insertion for the seeded visible key path.
- Fixed `_queueTileImageUpload(...)` guard to use null-safe cache checks (`this.textureCache?.has?.(key)`), allowing queue state to populate even before texture cache initialization.
- Fixed queue truth reflection for visible ownership rows by adding `queued` from `_pendingUploads.has(key)` in `getVisibleOwnershipRows(...)` / `_collectVisibleDomOwnershipRows(...)` payloads.
- Fixed render-path pipeline metadata writeback bug (`key` undefined in `_lastDrawByTileEl` snapshot) by binding pipeline stage to `meta.key`.
- Runtime truth now shows queue as real for the seeded key (`inPendingUploads:true`, `queued:true`), with next blocker moved to downstream drain/texture in this headless environment (`WEBGL_UNAVAILABLE`).

## 2026-03-07 — Seeded drain-stage settlement pass (new)
- Narrowed the follow-up to the proven next stage (`drain`) for seeded key `ingest/originals/img0.jpg`; avoided lifecycle/bootstrap/ownership policy churn in this pass.
- Hardened `TileFXRenderer._drainPendingUploads(...)` to settle pending uploads into a terminal failure when FX drain is unavailable (e.g., `WEBGL_UNAVAILABLE`), preventing perpetual in-flight hangs.
- Added per-key drain trace truth (`drainEvaluated`, `drainAttempted`, `failureReason`) and threaded it into existing ownership/live-state readouts for truthful runtime debugging without adding new HUD/proof systems.
- Added `getUploadLiveState(key)` to report pending/in-flight/texture terminal truth for the seeded runtime key checks.
- Seeded runtime check now advances beyond drain in headless run: `inPendingUploads:false`, `inUploadInFlight:false`, `inTextureCache:true`, row shows `hasTexture:true`, `wasDrawnThisPass:true`, `owner:"FX"`.

## 2026-03-07 — Multi-visible entry coherence pass (new)
- Advanced from seeded single-card proof to multi-visible viewport stability checks using the same runtime truth path (`window.logVisibleTileOwnership(...)`).
- Updated bootstrap entry behavior in `TileFXRenderer.syncVisibleTileOwnership(...)` to commit only when the captured bootstrap-visible set is fully ready (`bootstrapReady === bootstrapTotal`), removing the partial 90% fallback commit that could leave mixed visible DOM/FX ownership after entry.
- Verified in-container multi-visible run that multiple visible rows matured to `hasTexture:true`, `wasDrawnThisPass:true`, and `owner:"FX"`, with no persistent `dual_owner` rows after settle.
- Verified short scroll-stop cycles (down/stop, up/stop) preserved visible FX ownership stability without persistent edge flip-flop rows.
- Kept scope narrow: no new lifecycle architecture, HUD/proof/toast/watchdog/screenshot tooling added.

## 2026-03-07 — Post-proof cleanup pass (new)
- Kept scope on device-parity readiness and cleanup only; no new HUD/proof/toast/watchdog/screenshot surfaces were introduced.
- Removed dead pending-upload cleanup code in `TileFXRenderer.destroy()` that referenced legacy `pending.img/onLoad/onError` listeners no longer attached by the current queue pipeline.
- Removed unused `pending.promise` field/assignments from `_queueTileImageUpload(...)`; queue prep still runs identically via direct promise chains.
- Preserved strict bootstrap-visible batch commit (`bootstrapReady === bootstrapTotal`) and re-validated multi-visible scroll-stop stability in-container.
- Updated `docs/todo/AGENTS.md` top section to a concise post-proof checklist (real iPhone parity + one final concrete visual issue).

## 2026-03-07 — Device parity support handoff (new)
- Shifted focus from container-only refinement to a physical iPhone Safari parity run using existing truth surfaces only.
- Locked handoff commands to `window.logVisibleTileOwnership(12)` and `window.exportTileFxProofSummary?.()` before/after a short scroll-stop cycle.
- Explicitly deferred further renderer changes until one concrete on-device issue is observed, to avoid speculative complexity growth.

## 2026-03-07 — Health verdict + domSwap/leak reconciliation pass (new)
- Fixed verdict-layer mismatch where healthy visible FX ownership could still show `health: dual_owner` by prioritizing current visible truth in `computeTileFxHealthVerdict()`.
- Updated DOM swap validity checks to evaluate currently swapped tiles and thumb-body paint leakage instead of unrelated card-shell CSS, reducing stale `domSwapOk` contradictions.
- Tightened `countVisibleThumbPainters(...)` to count only actual paint contributors (visible media/background with drawable area), reducing false-positive leak noise.
- Cleared stale leak counters when no swapped tiles are present to prevent historical leak state from contaminating current verdicts.
- Kept solved layers frozen (lifecycle/queue/drain/texture/draw/ownership pipeline unchanged) and limited this pass to truth reconciliation + detector noise reduction.

## 2026-03-07 — Visible placeholder ownership policy pass (new)
- Found the remaining visible fallback path in `collectTileFxTiles()` / tile `onTextureReady(...)`: non-ready cards could drop to `data-tex="0"`, exposing full DOM thumbnail bodies during FX mode.
- Updated policy so FX-visible and FX-near-visible non-ready cards use `data-tex="pending"` (placeholder) instead of full DOM thumb body; only fully culled cards clear back to `0`.
- Added explicit placeholder CSS for `data-tex="pending"` that hides thumb-body painter nodes and shows a lightweight FX placeholder gradient while keeping `.asset-ui` metadata DOM-owned.
- Kept solved pipeline/lifecycle layers unchanged and limited this pass to visible ownership paint policy + warm re-entry retention.

## 2026-03-07 — Full visible-window coherence pass (new)
- Remaining mixed-window issue was a timing gap: some visible cards stayed `data-tex="0"` until collector ownership assignment ran, producing partial top/bottom FX takeover perception.
- Added `markVisibleFxWindowPending('setView:fx')` in `setView(...)` after render to immediately stamp currently visible cards to `pending` unless already texture-owned.
- Updated collector visible assignment to set `pending` in FX view without waiting on `window.__tilefx_enabled` timing, ensuring visible cards resolve to placeholder or texture consistently.
- In-container runtime check now shows immediate coherent visible window on entry (`pending` for all visible cards, `zero` none) before texture maturation.

## 2026-03-08 — Near-visible pre-cull tracking fix (new)
- Addressed PR #94 review feedback in `public/js/explorer-shaders.mjs`: `nearVisibleTileEls` is now populated before the visible-only cull path returns.
- Kept ownership semantics tight: `visibleTileEls` still receives only truly visible tiles while near-visible edge tiles remain eligible for `_restoreUntrackedSwaps(...)` hysteresis protection.
- Preserved existing non-visible render candidate culling (`if (!visible) return;`) so rendering behavior remains unchanged outside this tracking fix.
- Added regression coverage in `tests/test_public_explorer_program_monitor.py` to assert near-visible registration occurs before the visible-cull return.

## 2026-03-08 — Non-FX disable warning-noise cleanup (new)
- Investigated console spam path and confirmed `[tilefx] DISABLE sync:setView:non-fx` is a legitimate call from `setView(...)`/startup non-FX transitions, not an illegal lifecycle breach.
- Updated `TileFXRenderer.disable(...)` logging policy: legal disables are now debug-level (`fxdebug=1` only) and no longer emit warning stack traces; illegal disable attempts while view is still FX continue to emit error-level logs with stack and are blocked.
- Preserved lifecycle semantics and scope (no ownership/drain/watchdog architecture changes), while retaining `window.__tilefx_dbg.lastDisable` bookkeeping for truth inspection.
- Removed redundant startup `setView('grid')` invocation when already in grid mode after initial refresh, preventing duplicate legitimate disable calls from polluting console output.
- Added/updated tests to lock the new policy and startup guard behavior.

## 2026-03-08 — Pending-to-texture pipeline stall fix (new)
- Investigated the remaining visual defect (cards stuck `data-tex="pending"`) as a texture-readiness pipeline issue, separate from lifecycle/logging.
- Identified the concrete gate in `public/js/explorer-shaders.mjs`: `tile.onTextureReady(...)` ran only inside the visible+rect-valid draw path, so cards could keep placeholder ownership even when cache texture truth was already ready.
- Updated renderer ordering so per-tile cache truth (`entry?.texture`) drives `onTextureReady(...)` before visible/rect culls; draw culling and swap eligibility remain unchanged.
- Resulting behavior: fed visible/near-visible tiles now receive readiness promotion to `data-tex="1"` as soon as texture exists, instead of waiting for draw-eligibility timing.
- Added regression coverage in `tests/test_public_explorer_program_monitor.py` to lock callback-before-cull ordering.

## 2026-03-08 — Visible thumb-body ownership policy cleanup (new)
- Followed up after verdict/logging fixes and targeted the remaining patchy visual layer: some visible cards could still show normal DOM thumb bodies during FX mode while neighbors were FX/placeholder.
- Root cause at policy layer: placeholder painter suppression was keyed only to `data-tex="pending"`, so transient non-texture states in near-visible FX window could leak full DOM thumb body paint.
- Tightened CSS ownership policy in `public/explorer.html`: any `data-fx-near-visible="1"` card that is not `data-tex="1"` now suppresses thumb-body/thumb-image painters and shows the existing FX placeholder treatment.
- Kept `.asset-ui` and card structure fully DOM-owned (titles/subtitles/badges/selectors/affordances unchanged); no lifecycle, queue, or renderer architecture changes were made.
- Added test coverage in `tests/test_public_explorer_program_monitor.py` for the near-visible non-textured placeholder selector.

## 2026-03-08 — Feed pipeline starvation fix after policy stabilization (new)
- Investigated the “renderer alive but uploads/cache/swap all zero” state as a collect→feed pipeline continuity issue (not lifecycle/logging/UI ownership).
- Found the blocking gate in `TileFXRenderer._render(...)`: non-null-safe `this.textureCache.has/get` reads could execute before cache bootstrap was guaranteed, tripping render-loop failure and preventing ongoing tile feed progression.
- Switched render feed/cache reads to null-safe access (`this.textureCache?.has?.(key)`, `this.textureCache?.get?.(key, now)`) so fed tiles still queue and advance while cache initialization catches up.
- Kept scope minimal: no card overlay changes, no lifecycle architecture changes, no new debug subsystems.
- Added regression assertions in `tests/test_public_explorer_program_monitor.py` for null-safe texture-cache usage in render path.

## 2026-03-08 — Proof export stale-capture guard (new)
- Accepted settled runtime evidence that FX feed/upload/cache/swap pipeline is alive; stopped treating renderer pipeline as the active blocker in this pass.
- Identified remaining contradiction as truth-surface timing: `exportTileFxProofSummary()` could export an older non-settled `window.__tilefx_proof` snapshot while runtime was already FX-enabled and drawing.
- Added a narrow refresh guard in `exportTileFxProofSummary()` to re-capture proof (`captureTileFxProof('export:refresh')`) when runtime indicates active FX but captured proof indicates non-running/zero-visible state.
- Kept fix scoped to proof snapshot consistency only (no lifecycle, queue/drain, or UI ownership rewrites).
- Added regression assertion in `tests/test_public_explorer_program_monitor.py` for the export refresh line.

## 2026-03-08 — Explorer mock asset module + fixture seed (new)
- Added `public/js/explorer-mock-assets.mjs` with explicit mock activation detection (`?mock=1` or `window.__EXPLORER_MOCK__`), fixture loading, normalization, and deterministic embedded fallback generation.
- Added `public/fixtures/explorer-mock-assets.json` as a baseline fixture payload for explorer-side mock data workflows.
- Kept this pass scoped to asset-mock data plumbing only; no API contract or backend storage behavior changes.

## 2026-03-08 — Explorer mock-mode early boot short-circuit (new)
- Root cause of preview failure: `DOMContentLoaded` always entered API-first `refreshExplorerData()` (`/api/sources`, `/api/projects`) before any mock takeover, so preview/webview hosts surfaced boot error cards and stayed empty.
- Added early boot mock routing in `public/explorer.html`: explicit mock activation now runs before API boot, with direct mock source/project/media hydration and API boot bypass.
- Added preview fallback guard for local embedded preview contexts (`window.opener` / iframe + local host) so API boot errors in editor previews reroute to mock hydration instead of showing source/project failure toasts.
- Expanded mock activation helper in `public/js/explorer-mock-assets.mjs` to include common webview protocols (`vscode-webview:`, `capacitor:`, `ionic:`) in addition to `file:` and explicit flags.
- Preserved deployed safety by keeping real `http/https` non-preview boot on API path unless explicit mock activation is requested.

## 2026-03-08 — Localhost top-level preview mock fallback widening (new)
- Addressed remaining preview gap where top-level editor-hosted localhost previews could fail API boot without `?mock=1` and still miss mock fallback because preview detection previously required opener/iframe context.
- Updated `isLikelyPreviewEnvironment()` in `public/js/explorer-mock-assets.mjs` to classify localhost/loopback/local-test hostnames as preview contexts directly.
- Maintained production safety: this heuristic is only used in boot error fallback routing, so deployed non-local hosts continue real API behavior unless explicit mock activation is requested.
- Added regression assertion in `tests/test_public_explorer_program_monitor.py` for direct localhost preview detection branch.

## 2026-03-08 — TileFX bootstrap non-ready timeout safeguard (new)
- Addressed review feedback on `bootstrap_ready` stalling: entry phase previously required all bootstrap-visible tiles to become ready (`bootstrapReady === bootstrapTotal`), so a single never-ready tile could block steady state indefinitely.
- Added bounded timeout escape hatch in `public/js/explorer-shaders.mjs` via `tilefxBootstrapReadyMs` (default `1200ms`): once elapsed in `bootstrap_ready`, renderer advances to `bootstrap_commit` so FX entry cannot deadlock on one failed tile.
- Preserved full-ready fast path and existing batch commit semantics for ready tiles; timeout path is a safety valve, not a behavior rewrite.
- Added timeout telemetry fields under `window.__tilefx_dbg` (`bootstrapReadyTimedOut`, `bootstrapReadyElapsedMs`, `bootstrapReadyPending`, `bootstrapReadyTimeoutMs`) and regression assertions in `tests/test_public_explorer_program_monitor.py`.

## 2026-03-15 — Explorer delete confirmation + scope-safe refresh (new)
- Added explicit delete confirmation in `public/explorer.html` (`confirmDeleteAction`) so destructive deletes require user acknowledgment before API calls.
- Fixed delete target resolution for drawer-initiated deletes by resolving refs from focused item and current media when selection state is empty.
- Added `reloadMediaForCurrentScope()` and switched delete success flow to scope-aware reload (`loadMedia` for active project, `loadAllMedia` for all-project mode) to avoid post-delete fake-empty/no-project UI drift.
- Added regression coverage in `tests/test_public_explorer_program_monitor.py` to assert confirmation wiring and scope-aware post-delete reload hooks remain present.

## 2026-03-15 — Explorer custom delete modal (new)
- Replaced native `window.confirm` in `public/explorer.html` delete flow with a custom Promise-based confirm modal (`#confirmDeleteModal`) to match Explorer styling and avoid blocking the render loop.
- Added modal interactions for Cancel/Confirm, backdrop-tap cancel, and Escape-key cancel; modal toggles `body.confirm-open` while active and restores listeners/state on cleanup.
- Updated delete path to `await confirmDeleteAction(...)` while preserving scope-aware post-delete reload behavior (`reloadMediaForCurrentScope`) from the previous fix.
- Expanded static explorer regression assertions in `tests/test_public_explorer_program_monitor.py` to lock modal markup, async confirmation wiring, and scope-aware reload hooks.

## 2026-03-15 — Explorer delete identity-key hardening (new)
- Addressed all-project delete collision risk in `public/explorer.html` by replacing path-only delete matching with `assetIdentityKey(...)` lookups.
- Resolver now prefers explicit asset identity (`asset_uuid`/`asset_id`, else `source+project+relative_path`) and no longer performs `wanted.has(ref.relative_path)` path-only inclusion against selected refs.
- Updated delete callsites to pass asset objects (`selectedItemsOrdered`, drawer `state.focused`, context-menu `items`) so requested deletes preserve full identity across sources/projects.
- Kept compatibility for legacy string-path requests with focused/active-project narrowing and retained scope-aware post-delete reload behavior.
- Expanded regression assertions in `tests/test_public_explorer_program_monitor.py` to lock identity-key matching and guard against relative-path-only regressions.

## 2026-03-15 — Explorer parity checklist matrix in docs/todo AGENTS (new)
- Added a dedicated parity-buckets matrix under `docs/todo/AGENTS.md` → `## 2026-03-07 — Physical iPhone parity handoff (active)` to keep Static vs Next.js scope tracking consistent for future commits.
- Matrix rows now cover shell/layout, media behavior, integrations, and data/API with explicit `Static` / `Next.js` / `Parity` checklist columns.
- Each bucket row includes concrete grep locators in both codepaths (`public/explorer.html` and `docker/packages/Explorer/src/ExplorerApp.tsx` + related JS modules) so parity patches are idempotent and easy to anchor.

### Latest Implementation Notes (2026-03-15)
- Next.js Explorer migration slice 1 landed in `docker/packages/Explorer/src/ExplorerApp.tsx` + `src/styles.css`: topbar brand now mirrors the static explorer title-toggle treatment and the actions trigger/panel positioning was aligned to the fixed topbar behavior.
- Added/updated migration checkboxes in `docs/todo/AGENTS.md`; keep marking slices complete one-by-one with isolated commits.

### Latest Implementation Notes (2026-03-15)
- Next.js Explorer migration slice 2 updated card rendering parity in `docker/packages/Explorer/src/ExplorerApp.tsx` + `src/styles.css`: grid uses responsive CSS-grid cards, selection uses `.is-selected` affordances with selection-order badges, and list rows now reflect selected state consistently.

### Latest Implementation Notes (2026-03-15)
- Next.js Explorer migration slice 3 added inspector parity structure in `docker/packages/Explorer/src/ExplorerApp.tsx`: drawer action pills now include a Tag toggle and a drawer tag panel section for focused manual/AI tags, with matching panel styles in `src/styles.css`.

### Latest Implementation Notes (2026-03-15)
- Next.js Explorer migration slice 4 now routes delete triggers through an in-app confirmation modal (context menu, selection bar, and drawer delete pill) and upgraded upload affordances to explicit choose/upload controls in the sidebar panel.

### Latest Implementation Notes (2026-03-15)
- Next.js Explorer bulk asset actions now call ordered-ref endpoints in `docker/packages/Explorer/src/api.ts` (`/api/assets/bulk/delete|tags|move|compose`) with typed helpers and explicit error extraction.
- `docker/packages/Explorer/src/ExplorerApp.tsx` now uses a shared ordered asset-ref mapper (`mapOrderedAssetRefs`) that resolves refs from current selection plus drawer-focused assets (including legacy relative-path fallback), then routes delete/move/tag/compose actions through bulk APIs with explicit user-safe toasts.
- Added targeted package tests in `docker/packages/Explorer/tests/bulk-actions.test.mjs` covering mixed all-project ordered payloads, single-project move payload routing, and explicit empty-selection guardrail/action wiring assertions.

### Latest Implementation Notes (2026-03-15)
- Explorer package compose parity now uses the existing bulk endpoint (`POST /api/assets/bulk/compose`) with a modal-driven output project/source/name prompt in `docker/packages/Explorer/src/ExplorerApp.tsx`.
- Compose controls in both the Actions panel and select bar are enabled only when selected assets include at least one video, while payload ordering remains deterministic via ordered asset-ref mapping.
- Successful compose requests now show artifact summary details and trigger scope-aware media refresh plus project reload; package README + tests were updated for compose guardrails/order/refresh coverage.

### Latest Implementation Notes (2026-03-15)
- Preview/inspector convergence in the Next.js Explorer now adopts static-parity drawer deltas only: drawer action set includes Program Monitor + OBS affordances with explicit unavailable-state disabling/toasts, preview media sizing adds audio + minimum height parity, and drawer tags stay as an overlay panel in `docker/packages/Explorer/src/ExplorerApp.tsx` + `src/styles.css`; intentionally deferred this pass are static-only FX/tile renderer/debug controls and full inline tag-editor parity (prompt-based tag edits remain in package explorer).

### Latest Implementation Notes (2026-03-15)
- Stabilized the Explorer package API client contract in `docker/packages/Explorer/src/api.ts` with a shared error extractor that consistently surfaces actionable `detail`, nested `detail.message`, or `message` text for list/upload/resolve/delete/move and bulk asset endpoints.
- Added a focused fetch-mocked API contract suite at `docker/packages/Explorer/tests/api-contract.test.mjs` covering request URL/query/body construction for sources/projects/media/upload/resolve/delete/move/bulk-delete/bulk-tags/bulk-move/bulk-compose, including ordered `assets` array invariants.
- Updated `docs/todo/AGENTS.md` with a completed checklist for this API contract stabilization slice.

### Latest Implementation Notes (2026-03-15)
- Explorer feature work now follows a dual-track parity protocol: each feature commit must classify scope (shared vs single-path exception), include paired static/package path locators, verify UI + API parity per slice, and record static/package test coverage before marking tasks complete in `docs/todo/AGENTS.md`.

### Latest Implementation Notes (2026-03-15)
- Added one consolidated preview convergence epic in `docs/todo/AGENTS.md` with phased, non-overlapping execution rows (Phase A baseline inventories + explicit static/package deltas; Phase B primitive-first implementation via `api.ts`/`state.ts`/`utils.ts` before JSX/CSS reshaping; Phase C validation/docs updates across package tests, static regression hooks, and Explorer README updates).
- Preview delta intent is now explicitly tracked as shared across both stacks (static `public/explorer.html` and package `docker/packages/Explorer/src/ExplorerApp.tsx` + `src/styles.css`) with ordered completion gates to prevent overlap and state-desync regressions.

### Latest Implementation Notes (2026-03-15)
- Static TileFX (`public/js/explorer-shaders.mjs`) now enforces explicit performance guardrails with frame-time bands (`target/warm/degrade/critical`), bounded adaptive quality profiles (`high/balanced/low/safe`), and coarse-pointer fallback behavior that holds safe quality during sustained critical frame pressure before recovery.
- TileFX debug telemetry now publishes guardrail policy/runtime fields on `window.__tilefx_dbg` (`perfGuardrails`, `perfFrameEmaMs`, `perfFrameBand`, `perfQuality`, `perfAdaptiveState`, `mobileFallbackActive`, `mobileFallbackReason`) to keep runtime diagnosis deterministic.
- Next.js Explorer package remains intentionally grid/list-only for FX policy: no package TileFX mode is exposed, and unsupported view tokens must normalize to deterministic grid/list fallback (`normalizeExplorerView` in `docker/packages/Explorer/src/state.ts`) until a future explicit parity migration.


### Latest Implementation Notes (2026-03-15)
- Explorer package bulk parity slice now uses typed bulk request contracts in `src/api.ts`, stable cross-project asset-ref builders in `ExplorerApp.tsx`, and drawer/select-bar wiring for tag/move/delete/compose using source+project+relative_path refs.
