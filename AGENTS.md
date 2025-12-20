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
5. ⏭ Minimal web UI (optional) for local admin.
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