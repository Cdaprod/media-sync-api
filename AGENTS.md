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
  docker-compose.yml
  Dockerfile
  requirements.txt
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
6. ⏭ Optional OBS integration + Resolve bridge (separate services).

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
