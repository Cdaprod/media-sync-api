# media-sync-api

LAN-first, Dockerized Python API for deterministic media ingest and project hygiene.

## What it does
- Creates and lists projects stored on the host filesystem (auto-prefixed as `P{n}-<label>`)
- Streams uploads into project folders with sha256 de-duplication backed by sqlite
- Maintains `index.json` per project and reconciles manual filesystem edits
- Records sync events for iOS Shortcuts auditing
- Serves `/public/index.html` as a lightweight adapter UI with copy-paste examples, a browser-native media explorer, and upload controls
- Tracks multiple storage sources so additional NAS paths can be indexed without redeploying the container
- Shows configured sources in the adapter UI so you can confirm mounts or register a new destination path without touching the API directly
- Streams indexed media directly from `/media/<project>/<relative_path>` for in-browser playback
- Forces direct downloads from `/media/<project>/download/<relative_path>` so files listed in the UI can be saved offline
- Sweeps loose files sitting in the projects root into an `Unsorted-Loose` project so uploads that land in the wrong spot are still indexed

The container is stateless; the host path is the source of truth.

## LAN & storage defaults
- LAN URL: `http://192.168.0.25:8787`
- Host path: `B:\\Video\\Projects`
- Container mount: `/data/projects`
- Default source name: `primary` (points to `/data/projects`); register new sources via `/api/sources`

## Quick start with Docker Compose
```bash
docker compose build
docker compose up -d
```

The Compose file intentionally omits the legacy `version` key and sets `pull_policy: never` so it builds locally without needing a Docker Hub login. It also mounts the working directory into `/app` and runs Uvicorn with `--reload` so code edits on the host trigger hot reloads without rebuilding the image.

Verify the service and volume:
```bash
curl http://localhost:8787/health
curl http://localhost:8787/api/projects
curl http://localhost:8787/api/sources
```
Existing folders under `B:\\Video\\Projects` that follow the `P{n}-<name>` pattern are bootstrapped automatically on the first `/api/projects` call: missing indexes are created and files under `ingest/originals` are recorded idempotently. If `/api/projects` is empty, create one project and confirm `index.json`, `ingest/`, and `_manifest/` appear under your host Projects folder.

Troubleshooting:
- Ensure Docker Desktop has file sharing enabled for drive `B:`
- Bind to `0.0.0.0` so iOS devices on `192.168.0.x` can reach the API
- If requests fail, check firewall rules and `docker compose logs -f`

## Usage playbook (verify → create → ingest → dedupe → reindex)
1) Verify it is running
- Health: `http://192.168.0.25:8787/health`
- List projects: `http://192.168.0.25:8787/api/projects`

2) Create your first project (API)
```bash
curl -X POST http://127.0.0.1:8787/api/projects \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Public-Accountability\",\"notes\":\"Main production ingest\"}"
```
Project names are assigned as `P{n}-<label>` automatically (e.g., `P1-Public-Accountability`, `P2-New-Project`). Then confirm: `curl http://127.0.0.1:8787/api/projects`

3) Build the iPhone Shortcut
- GET `/api/projects` and append "➕ Create New Project"
- If creating: POST `/api/projects` with `{ "name": NewName, "notes": Notes }`
- Ask for input `EntryLabel` and choose videos
- Optional audit: POST `/api/projects/{Project}/sync-album` with `{ "album_name": EntryLabel, "device": "iphone", "note": "Shortcut ingest" }`
- For each file: POST `/api/projects/{Project}/upload` form field `file`
- The API handles duplicate detection; no client-side hashing required

4) Prove de-dupe is working
- Upload 2–3 videos via the Shortcut, then rerun with the same files
- Expect `"status": "duplicate"`, `duplicates_skipped` to increment in `index.json`, and no extra media stored

5) What “sync album → project folder” means
- Pick the album in Photos, upload through the Shortcut, and let the API de-dupe
- Future improvement: send filename/size/date fingerprints to receive "upload-needed" decisions

6) Reindex after manual changes (only media files are indexed)
```bash
curl http://127.0.0.1:8787/api/projects/Project-1-Public-Accountability/reindex
```
Reconcile disk ↔ sqlite, update counts, prune missing records, and automatically relocate any supported media that was dropped outside `ingest/originals/` back into that folder tree.

7) Reindex everything in one sweep
```bash
curl http://127.0.0.1:8787/reindex
```
Run this to reconcile every enabled source and project after bulk filesystem edits.

8) Recommended daily workflow
- Create/select project before recording
- Use the Shortcut to push clips; let the API de-dupe
- Run `/reindex` if you reorganize manually
- Use `_manifest/files.jsonl` for auditing
- Treat `ingest/originals/` as the source of truth

8) Quick troubleshooting
- iPhone cannot reach API: ensure container binds `0.0.0.0:8787` and firewall allows it
- Projects not appearing: verify the volume mount points to your Projects folder
- Upload fails: file exceeds `MEDIA_SYNC_MAX_UPLOAD_MB` or extension unsupported
- Secondary source missing: confirm the additional path is mounted on the host and `enabled` in `/api/sources`
- Loose files appear in the projects root: POST `/api/projects/auto-organize` to relocate them into `Unsorted-Loose` and browse via `/public/index.html`

## API overview
- `GET /api/projects` – list projects (includes `upload_url` for browser uploads)
- `POST /api/projects` – create project `{ "name": "Label", "notes": "optional" }` (auto-prefixes to `P{n}-Label`)
- `GET /api/projects/{project}` – fetch project index
- `GET /api/projects/{project}/media` – list indexed media with streamable URLs
- `GET /media/{project}/download/{relative_path}` – download a stored media file with `Content-Disposition: attachment`
- `POST /api/projects/{project}/upload` – multipart upload `file=<UploadFile>` with sha256 de-dupe
- `POST /api/projects/{project}/sync-album` – record audit event
- `GET|POST /api/projects/{project}/reindex` – rescan ingest/originals for missing hashes/index entries
- `GET|POST /reindex` – reconcile every enabled source and project in one sweep
- `POST /api/projects/auto-organize` – move loose files sitting in the projects root into `Unsorted-Loose` and reindex
- `GET /api/sources` – list configured project roots and their accessibility
- `POST /api/sources` – register an additional source (e.g., NAS share mounted on the host)
- `POST /api/sources/{name}/toggle` – enable/disable an existing source
- The `_sources` registry directory is reserved for source metadata and is excluded from project listings and upload UI.
- All project endpoints accept `?source=<name>` to target a specific root (defaults to `primary`)
- `GET /media/{project}/{relative_path}` – stream a stored media file directly (respects `?source=`)
- `GET /public/index.html` – static adapter/reference page (also served at `/`)

## Response guidance & logging
- Most responses include an `instructions` field with next-step hints (mounts, reindexing, adapter URL)
- Logs stream to stdout; configure collectors via Docker. Uploads, duplicates, project creation, and reindex runs emit INFO entries under the `media_sync_api.*` namespaces.

## Development
Create a virtual environment and install dependencies:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

Run the API locally:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8787
```

Run tests:
```bash
make test
```

## License
MIT
