# media-sync-api

LAN-first, Dockerized Python API for deterministic media ingest and project hygiene.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-green.svg)
![DaVinci Resolve](https://img.shields.io/badge/DaVinci%20Resolve-18%2B-red.svg)

A LAN/VPN-aware multi-camera + media-ingest control plane where phones, browsers, Raspberry Pis, desktops, and camera daemons register as nodes, publish capabilities, create claims, stream/capture media, and materialize assets into Explorer.

Open Explorer → see devices/cameras/sources → start capture or ingest → watch claims/live sessions → resulting media appears as assets → preview/compose/export/share.

Authority API = source of truth
Nodes = devices/runners/camera agents
Claims = work assignments
Leases = safety against stuck work
Assets = completed media objects
Explorer = operator UI/control surface

Mobile devices + computer-attached cameras + Pi capture daemons
→ registered as nodes
→ authenticated by bearer tokens
→ managed through Explorer
→ usable across LAN/VPN
→ writing into local/remote storage
→ browsed as an asset library

ThatDAMToolbox / Explorer is a private local production studio dashboard.

1. iPhone joins as a capture node.
2. Desktop joins as authority/storage-primary.
3. Raspberry Pi joins as camera/HDMI capture daemon.
4. Nikon/USB/HDMI capture becomes a live session.
5. Each recording/upload becomes an ingest claim.
6. Claim completes into a canonical asset.
7. Explorer shows thumbnails, stream URLs, source, node, status.
8. You compose/export from selected assets.
9. VPN/Tailscale lets trusted devices participate remotely.

Explorer is the control room.

To do:

Register Device
→ Show Device Online
→ Start Capture
→ Create Claim
→ Show Claim Progress
→ Materialize Asset
→ Show Asset in Grid
→ Export/Share

---

A distributed node-based ingest system where agents (“runners”) observe local sources (filesystems/devices), produce asset candidates, and submit claims to a central authority for canonical acceptance and reconciliation mirrored in an explorer web application.

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
- Generates and serves cached thumbnails from `ingest/thumbnails` via `/thumbnails/<project>/<sha256>.jpg` to keep explorer refreshes fast
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
- If Explorer UI is served on `:8790`, set `MEDIA_SYNC_CORS_ORIGINS` (for example `http://192.168.0.25:8790,http://localhost:8790,http://127.0.0.1:8790`) or `*` for LAN-wide testing so cross-origin `/api/*` fetches succeed.
- Video thumbnails require `ffmpeg` in the API container; rebuild the image if `/thumbnails/*` returns "ffmpeg is not available"

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
- Recommended batch start (for aggregate results): POST `/api/projects/{Project}/upload?op=start` → store `batch_id`
- For each file: POST `/api/projects/{Project}/upload` form field `file` (include `?batch_id=...` if batching)
- Recommended batch finalize: POST `/api/projects/{Project}/upload?op=finalize` with `{ "batch_id": "..." }` to receive all served URLs
- Each upload response includes `served.stream_url` and `served.download_url` for the stored or deduped asset
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

8) Normalize rotated camera videos (in-place)
```bash
curl -X POST http://127.0.0.1:8787/api/projects/P1-Public-Accountability/media/normalize-orientation \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
curl -X POST http://127.0.0.1:8787/api/projects/P1-Public-Accountability/media/normalize-orientation \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false}'
curl -X POST http://127.0.0.1:8787/api/media/normalize-orientation \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```
This rewrites files in place (same relative path) and updates the existing index + manifest entries, removing the old sha256 when it is no longer referenced.

9) Recommended daily workflow
- Create/select project before recording
- Use the Shortcut to push clips; let the API de-dupe
- Run `/reindex` if you reorganize manually
- Use `_manifest/files.jsonl` for auditing
- Treat `ingest/originals/` as the source of truth

10) Quick troubleshooting
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

## Runtime control-plane, connect-plane, ingest-plane, and source inventory

The backend separates four related but distinct concerns:

### `/api/nodes` — control-plane
Use this for node identity, role, capabilities, liveness, heartbeat, and node metadata claims.

### `/connect` and `/connect/register` — connect-plane
Use this for authority discovery and onboarding of source-bearing participants. A remote runtime may register itself as a node that owns a local source surface without directly becoming canonical library truth.

### `/api/ingest/claims` — ingest-plane
Use this for asset observation and authority-reviewed ingest claims. Local runner observations are not canonical by default; they must be submitted and later accepted through the ingest claim flow.

### `/api/sources` — runtime-aware source inventory
Use this for the merged source view consumed by Explorer and operational tooling. This response may include:
- canonical/local authority-backed sources from `SourceRegistry`
- runtime-memory remote source-bearing participants registered through `/connect/register`

This separation is intentional:

- node identity/capability/liveness stays in the control-plane
- onboarding/discovery stays in the connect-plane
- observed assets and intake decisions stay in the ingest-plane
- canonical and remote-visible source inventory stays in the source plane
- canonical truth continues to flow into the library plane

## API overview

- `GET /api/projects` – list projects (includes `upload_url` for browser uploads)
- `POST /api/projects` – create project `{ "name": "Label", "notes": "optional" }` (auto-prefixes to `P{n}-Label`)
- `GET /api/projects/{project}` – fetch project index
- `GET /api/projects/{project}/media` – list indexed media with streamable URLs
- `GET /api/projects/{project}/media/query` – filtered inventory query for timeline assembly (`origin`, `created_after`, `created_before`, `limit`, `offset`)
- `GET /api/media/facts` – best-effort ffprobe facts lookup (`project`, `relative_path`, optional `source`) for preview/inspector media details
- `GET /thumbnails/{project}/{sha256}.jpg` – serve (and cache) a generated thumbnail for explorer grids
- `GET /media/{project}/download/{relative_path}` – download a stored media file with `Content-Disposition: attachment`
- `POST /api/projects/{project}/upload` – multipart upload `file=<UploadFile>` (or `files[]=...`) with sha256 de-dupe (returns `served.stream_url` + `served.download_url`)
- `POST /api/projects/{project}/upload?op=start` – start a batch session for Shortcut repeats
- `POST /api/projects/{project}/upload?op=finalize` – finalize batch and return aggregated served URLs
- `POST /api/projects/{project}/upload?op=snapshot` – fetch batch snapshot
- `POST /api/projects/{project}/compose` – accept an existing-assets compose job quickly and return `202 Accepted` with a `job_id`; poll `GET /api/projects/{project}/compose/jobs/{job_id}` for `queued|running|completed|failed` state and final registration details
- `POST /api/projects/{project}/compose/upload` – upload clips into temp staging outside project roots, then return `202 Accepted` with a background compose `job_id` instead of holding the request open through ffmpeg/finalization
- `GET /api/projects/{project}/compose/jobs/{job_id}` – fetch compose job state, scoped refresh metadata, `mode_requested`, `input_count`, `input_preview`, status-specific instructions, error details, and the final stored asset payload once background compose finishes
- Explorer multi-select compose now submits `mode: "encode"` for correctness-first ordered output; backend `auto` remains available for API callers but now falls back away from concat-copy much more conservatively.
- Compose API logs now emit end-to-end lifecycle events (`compose_request_received`, `compose_probe_*`, `compose_strategy_*`, `compose_normalize_*`, `compose_concat_started`, `compose_output_probe`, `compose_job_*`) so requested mode, selected strategy, normalization, concat path, and output validation are visible in server logs.
- Encode jobs now emit `compose_normalized_probe` events for each intermediate and fail before registration when normalized segments or final outputs violate canonical expectations (codec/pix_fmt/dimensions/fps/audio/timestamp invariants).
- `MEDIA_SYNC_TEMP_ROOT` controls compose staging and must resolve outside every enabled SourceRegistry root; compose returns HTTP 503 when this is misconfigured to prevent Explorer indexing of temp clips.

- `POST /api/projects/{project}/sync-album` – record audit event
- `POST /api/projects/{project}/media/normalize-orientation` – normalize rotated videos in place (`dry_run` supported)
- `POST /api/projects/{project}/media/reconcile` – classify origin + rotation, plan/apply canonical renames, and persist aliases (`dry_run` + `apply` flags)
- `GET /api/registry/{sha256}` – authoritative sha256 registry lookup for canonical path/origin/orientation/aliases
- `POST /api/registry/resolve` – batch registry lookup for `asset_ids` using `sha256:<hash>` identifiers
  - also supports `fallback_paths` keyed by caller IDs where values are either full stream URLs or `project/relative_path` strings for legacy URL->sha resolution
- `POST /api/media/normalize-orientation` – normalize rotated videos across all projects (uses all enabled sources when `source` is omitted)
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

### Real compose repro harness
Use `scripts/compose_repro.py` to submit a known-bad existing-assets compose set, poll the background `job_id`, and optionally save only the correlated lifecycle lines from `docker compose logs`. This is the recommended next-step validation path for the remaining real-device failure shapes (repeated first clip, frozen later video, audio continuing after video freeze, rotation/orientation mismatches).

```bash
python scripts/compose_repro.py \
  --project P1-Demo \
  --output-name repro-portrait-set.mp4 \
  --mode encode \
  --relative-path ingest/originals/clip-a.mov \
  --relative-path ingest/originals/clip-b.mov \
  --docker-service media-sync-api \
  --save-log-block /tmp/compose-repro.log
```

The script prints the submit envelope, polls `GET /api/projects/{project}/compose/jobs/{job_id}`, and when `--docker-service` is provided filters the log stream down to lifecycle entries for that exact `job_id` (`compose_request_received`, `compose_probe_*`, `compose_strategy_*`, `compose_normalize_*`, `compose_normalized_probe`, `compose_concat_started`, `compose_output_probe`, and terminal `compose_job_*`).

The harness now submits the current backend request contract (`inputs`) and the backend encode path additionally records per-stream normalized/output durations (`video_duration_seconds`, `audio_duration_seconds`, `av_duration_delta_seconds`) so reproduced iPhone boundary A/V drift can be correlated with stricter validation and timing behavior on this branch.

Encode mode now also prefers a concat-demuxer copy over the already-normalized intermediates (`mechanism=concat_demuxer_copy_normalized`) and only falls back to the heavier filter-concat re-encode when that normalized join fails, making it easier to tell from logs whether the remaining bug lives in normalization or the old final concat path.

For the current iPhone HEVC portrait repro follow-up, normalized probe logs now expose both `video_avg_frame_rate` and `video_r_frame_rate`, and the harness log filter matches any lifecycle line containing the `job_id` so JSON-shaped logger output is still captured during failures that occur before final output registration.

Add `--debug-keep-intermediates` when you want the backend to preserve that job’s temp work dir under `MEDIA_SYNC_TEMP_ROOT/compose_debug/<job_id>`; successful and failed job payloads now surface `debug_keep_intermediates` and include `result.debug_artifacts` when preserved intermediates are available.

### Compose mode semantics
- `encode` — correctness-first path for user-facing multi-asset timelines. Inputs are normalized into canonical intermediates, validated, and then joined with observable final-join strategy logging.
- `copy` — strict fast-path only for genuinely copy-safe inputs. If a caller explicitly requests `copy`, incompatibilities surface as errors instead of silently acting like `encode`.
- `auto` — deterministic strategy selection. The backend logs why it chose `copy` or `encode`, and all compose job envelopes now echo `mode_requested`, `input_count`, and `input_preview` so operators and UIs can reason about the same request contract.



### Registry contract examples
Set `MEDIA_SYNC_REGISTRY_BASE_URL` in external consumers to this API base (for LAN defaults, `http://192.168.0.25:8787`).

```bash
curl http://192.168.0.25:8787/api/registry/<64hex-sha256>

curl -X POST http://192.168.0.25:8787/api/registry/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "asset_ids": ["sha256:<64hex-sha256>"],
    "fallback_paths": {}
  }'
```

### Program Monitor selection payload
The explorer “Program Monitor” handoff now sends selected stream nodes plus a `selected_assets` block:

```json
{
  "selected_assets": {
    "asset_ids": ["sha256:<64hex>"],
    "sha256": ["<64hex>"],
    "fallback_relative_paths": ["ingest/originals/<name>.mov"],
    "origins": ["obs"],
    "creation_times": ["2026-01-17T18:57:14+00:00"],
    "items": [{
      "asset_id": "sha256:<64hex>",
      "sha256": "<64hex>",
      "project": "P1-demo",
      "source": "primary",
      "relative_path": "ingest/originals/<name>.mov",
      "stream_url": "http://.../media/P1-demo/ingest/originals/<name>.mov?source=primary"
    }]
  }
}
```

In all-projects view, checkbox selection now remains enabled and Program Monitor handoff works without first entering a single project folder.

### Media facts example
```bash
curl "http://192.168.0.25:8787/api/media/facts?project=P1-demo&relative_path=ingest/originals/clip.mov"
```

Returns best-effort values (duration, dimensions, fps, codecs, audio channels) and reports `unknown` values in the explorer inspector when probe data is unavailable.

Explorer inspector UX notes:
- Inspector detail rows are rendered idempotently (facts/registry enrichments replace stale sections instead of duplicating rows).
- Touch interactions on cards now suppress iOS callout/text-selection and use pointer gesture guards so tap-to-open remains reliable while scrolling.
- The inspector Play action now reloads and plays the current stream URL from an explicit user gesture for better iOS Safari compatibility.

`/api/media/facts` and `/api/registry/*` now also include a timeline anchor object:

```json
{
  "timeline": {
    "anchor_time": "2026-02-16T19:12:23+00:00",
    "anchor_source": "quicktime_creation_time",
    "confidence": 0.95
  }
}
```

`anchor_source` values: `quicktime_creation_time`, `stream_timecode`, `format_timecode`, `filesystem_mtime`, `unknown`.

### Reconcile flag semantics
- `dry_run=true` (default) is strictly non-mutating (plan only).
- `apply=true` enables mutations (renames + metadata writes).
- `normalize_orientation=true` only normalizes bytes when mutations are enabled.

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
