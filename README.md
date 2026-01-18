# media-sync-api

LAN-first, Dockerized Python API for deterministic media ingest and project hygiene.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-green.svg)
![DaVinci Resolve](https://img.shields.io/badge/DaVinci%20Resolve-18%2B-red.svg)

## What it does
- Creates and lists projects stored on the host filesystem (auto-prefixed as `P{n}-<label>`)
- Streams uploads into project folders with sha256 de-duplication backed by sqlite
- Maintains `index.json` per project and reconciles manual filesystem edits
- Records sync events for iOS Shortcuts auditing
- Serves `/public/index.html` as a lightweight adapter UI with copy-paste examples, a browser-native media explorer, and upload controls
- Tracks multiple storage sources so additional NAS paths can be indexed without redeploying the container
- Shows configured sources in the adapter UI so you can confirm mounts or register a new destination path without touching the API directly
- Persists generated thumbnails under `ingest/thumbnails/` so explorer previews load quickly without re-generating frames
- Streams indexed media directly from `/media/<project>/<relative_path>` for in-browser playback
- Forces direct downloads from `/media/<project>/download/<relative_path>` so files listed in the UI can be saved offline
- Sweeps loose files sitting in the projects root into an `Unsorted-Loose` project so uploads that land in the wrong spot are still indexed
- Queues Resolve host actions so a local resolve-agent can open/import selected media deterministically

The container is stateless; the host path is the source of truth.

## LAN & storage defaults
- LAN URL: `http://192.168.0.25:8787`
- Host path: `B:\\Video\\Projects`
- Container mount: `/data/projects`
- Default source name: `primary` (points to `/data/projects`); register new sources via `/api/sources`

## Quick start with Docker Compose
```bash
docker compose -f docker/docker-compose.yaml up -d --build
```

For multi-platform image builds, use Buildx Bake from the repo root:

```bash
docker buildx bake -f docker/docker-bake.hcl
```

The Compose file lives under `/docker/` and builds from the repo root using `docker/Dockerfile` so COPY paths remain valid while keeping the build context anchored at the project root.

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
- If requests fail, check firewall rules and `docker compose -f docker/docker-compose.yaml logs -f`

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

## DaVinci Resolve bridge (resolve-agent)
Browsers cannot launch Resolve directly. The supported pattern is:

1. Browser UI → `POST /api/resolve/open`
2. Local `resolve-agent` (running on the Resolve workstation) polls `POST /api/resolve/jobs/next`
3. Agent opens/creates the Resolve project and imports the selected `media_rel_paths`, then calls `/complete` or `/fail`

Endpoint notes:
- `POST /api/resolve/open` body: `{ "project": "Project-1" | "__select__" | "__new__", "new_project_name": "optional", "media_rel_paths": ["ingest/originals/clip.mp4"], "mode": "import" | "reveal_in_explorer" }`
- `POST /api/resolve/jobs/next?limit=1&claimed_by=resolve-agent` – claims pending jobs for the polling agent
- `POST /api/resolve/jobs/{id}/complete` or `/fail` – mark outcome

Path alignment for Resolve:
- Keep media on the shared Projects mount (e.g., host `B:\\Video\\Projects` ⇄ macOS `/Volumes/Video/Projects`)
- Configure Resolve "Mapped Mounts" to translate the Windows root to the macOS root so shared Postgres libraries can relink automatically
- Do **not** mount `/data/projects` into `resolve-postgres`; only the API uses the media mount. Resolve desktop accesses media through your SMB/NAS mapping.

## API overview
- `GET /api/projects` – list projects (includes `upload_url` for browser uploads)
- `POST /api/projects` – create project `{ "name": "Label", "notes": "optional" }` (auto-prefixes to `P{n}-Label`)
- `GET /api/projects/{project}` – fetch project index
- `GET /api/projects/{project}/media` – list indexed media with streamable URLs
- `POST /api/projects/{project}/media/thumbnail` – store a generated thumbnail for reuse in explorer UIs
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
- Resolve bridge endpoints: `POST /api/resolve/open`, `POST /api/resolve/jobs/next`, `POST /api/resolve/jobs/{id}/complete`, `POST /api/resolve/jobs/{id}/fail`

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

---

## Stay Connected

<div align="center">
  <p>
    <a href="https://youtube.com/@Cdaprod"><img src="https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube" /></a>
    <a href="https://twitter.com/cdasmktcda"><img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white" alt="Twitter" /></a>
    <a href="https://www.linkedin.com/in/cdasmkt"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" /></a>
    <a href="https://github.com/Cdaprod"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>
    <a href="https://blog.min.io/author/david-cannan"><img src="https://img.shields.io/badge/Blog-FF5722?style=for-the-badge&logo=blogger&logoColor=white" alt="Blog" /></a>
  </p>
</div>

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSES.md) notice for bundled dependencies.

---

<div align="center">
  <p>
    <img src="https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2FCdaprod%2FThatDAMToolbox&count_bg=%230051FF&title_bg=%23000000&icon=github.svg&icon_color=%23FFFFFF&title=Visits&edge_flat=false" alt="Repository visitors" />
  </p>
  <p><strong>Built with ❤️ by <a href="https://github.com/Cdaprod">David Cannan</a></strong><br/>Transforming how we discover, process, and manage digital media through AI.</p>
</div>
