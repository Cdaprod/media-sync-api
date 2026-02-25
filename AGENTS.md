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
