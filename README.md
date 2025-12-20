# media-sync-api

LAN-first, Dockerized Python API for deterministic media ingest and project hygiene.

## What it does
- Creates and lists projects stored on the host filesystem
- Streams uploads into project folders with sha256 de-duplication backed by sqlite
- Maintains `index.json` per project and reconciles manual filesystem edits
- Records sync events for iOS Shortcuts auditing

The container is stateless; the host path is the source of truth.

## Network & storage
- Default LAN URL: `http://192.168.0.25:8787`
- Host path: `B:\\Video\\Projects`
- Container mount: `/data/projects`

## Running with Docker Compose
```bash
docker compose build
docker compose up -d
```

Verify the service:
```bash
curl http://localhost:8787/api/projects
```

Troubleshooting:
- Ensure Docker Desktop has file sharing enabled for drive `B:`
- Bind to `0.0.0.0` so iOS devices on `192.168.0.x` can reach the API
- If requests fail, check local firewall rules and `docker compose logs -f`

## API overview
- `GET /api/projects` – list projects
- `POST /api/projects` – create project `{ "name": "demo", "notes": "optional" }`
- `GET /api/projects/{project}` – fetch project index
- `POST /api/projects/{project}/upload` – multipart upload `file=<UploadFile>` with sha256 de-dupe
- `POST /api/projects/{project}/sync-album` – record audit event
- `POST /api/projects/{project}/reindex` – rescan ingest/originals for missing hashes/index entries

## iPhone Shortcut notes
1. Fetch `/api/projects` to select or create a project
2. Prompt for notes/labels if needed
3. Choose videos from Photos
4. Upload each file to `/api/projects/{project}/upload`
5. Optionally call `/api/projects/{project}/sync-album` once per run

The API is idempotent; repeating uploads is safe due to content-hash de-dupe.

## Development
Create a virtual environment and install dependencies:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run the API locally:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8787
```

Run tests:
```bash
pytest
```

## License
MIT
