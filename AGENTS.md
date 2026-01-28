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
