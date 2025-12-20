Below is a **complete minimal-but-solid repo skeleton** for `Cdaprod/media-sync-api` with all required files: **Dockerfile**, **docker-compose.yaml**, **requirements.txt**, plus the Python app modules (FastAPI), manifest/indexing, de-dupe (SQLite + SHA256), and reindexing so **manual changes outside the API are respected**.

---

/Dockerfile
```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app

# Default settings (override via docker-compose environment)
ENV MEDIA_SYNC_HOST=0.0.0.0 \
    MEDIA_SYNC_PORT=8787 \
    MEDIA_SYNC_PROJECTS_ROOT=/data/projects \
    MEDIA_SYNC_MAX_UPLOAD_MB=4096 \
    MEDIA_SYNC_CORS_ORIGINS=*

EXPOSE 8787

CMD ["python", "-m", "app.main"]
```

---

/docker-compose.yaml
```yaml
services:
  media-sync-api:
    build: .
    container_name: media-sync-api
    restart: always

    # Bind to LAN so iPhone can hit: http://192.168.0.25:8787
    ports:
      - "8787:8787"

    environment:
      - MEDIA_SYNC_HOST=0.0.0.0
      - MEDIA_SYNC_PORT=8787
      - MEDIA_SYNC_PROJECTS_ROOT=/data/projects
      - MEDIA_SYNC_MAX_UPLOAD_MB=4096
      - MEDIA_SYNC_CORS_ORIGINS=*

    # Windows host path mount (Docker Desktop must have drive B: shared/allowed)
    volumes:
      - "B:/Video/Projects:/data/projects"

    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/health').read()"]
      interval: 20s
      timeout: 5s
      retries: 5
```

---

/requirements.txt
```txt
fastapi==0.115.6
uvicorn[standard]==0.32.1
pydantic==2.10.3
python-multipart==0.0.20
```

---

/.dockerignore
```gitignore
__pycache__/
*.pyc
*.pyo
*.pyd
*.db
*.sqlite
*.log
.env
.venv/
venv/
dist/
build/
.cache/
.DS_Store
.idea/
.vscode/
```

---

/.env.example
```bash
# Bind address + port
MEDIA_SYNC_HOST=0.0.0.0
MEDIA_SYNC_PORT=8787

# Container path where host storage is mounted
MEDIA_SYNC_PROJECTS_ROOT=/data/projects

# Upload limit (MB)
MEDIA_SYNC_MAX_UPLOAD_MB=4096

# CORS (LAN-only use; tighten later if you want)
MEDIA_SYNC_CORS_ORIGINS=*
```

---

/app/__init__.py
```python
__all__ = ["__version__"]
__version__ = "0.1.0"
```

---

/app/config.py
```python
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    host: str = _env("MEDIA_SYNC_HOST", "0.0.0.0")
    port: int = int(_env("MEDIA_SYNC_PORT", "8787"))
    projects_root: Path = Path(_env("MEDIA_SYNC_PROJECTS_ROOT", "/data/projects"))
    max_upload_mb: int = int(_env("MEDIA_SYNC_MAX_UPLOAD_MB", "4096"))
    cors_origins: str = _env("MEDIA_SYNC_CORS_ORIGINS", "*")


settings = Settings()
```

---

/app/main.py
```python
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.projects import router as projects_router
from app.api.upload import router as upload_router
from app.api.sync import router as sync_router
from app.api.reindex import router as reindex_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="media-sync-api",
        version="0.1.0",
        description="LAN-first project ingest, de-dupe, indexing, and reindexing API for content workflows.",
    )

    origins = [o.strip() for o in settings.cors_origins.split(",")] if settings.cors_origins else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins != ["*"] else ["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"ok": True, "service": "media-sync-api"}

    app.include_router(projects_router, prefix="/api")
    app.include_router(upload_router, prefix="/api")
    app.include_router(sync_router, prefix="/api")
    app.include_router(reindex_router, prefix="/api")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)
```

---

/app/api/__init__.py
```python
# API package
```

---

/app/api/projects.py
```python
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.storage.paths import (
    ensure_root_exists,
    list_projects,
    safe_project_name,
    get_project_dir,
)
from app.storage.index import ensure_project_layout, read_index, write_index
from app.storage.timeutil import now_iso
from app.storage.events import record_event


router = APIRouter(tags=["projects"])


class CreateProject(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    notes: str | None = None


@router.get("/projects")
def api_list_projects():
    ensure_root_exists()
    return {"projects": list_projects()}


@router.post("/projects")
def api_create_project(payload: CreateProject):
    ensure_root_exists()
    pname = safe_project_name(payload.name)
    pdir = get_project_dir(pname)
    pdir.mkdir(parents=True, exist_ok=True)

    ensure_project_layout(pdir)

    idx = read_index(pdir)
    if payload.notes:
        idx["notes"] = payload.notes
    idx["updated_at"] = now_iso()
    write_index(pdir, idx)

    record_event(pdir, {"type": "project_created", "project": pname, "notes": payload.notes or ""})
    return {"ok": True, "project": pname}


@router.get("/projects/{project}")
def api_get_project(project: str):
    ensure_root_exists()
    pname = safe_project_name(project)
    pdir = get_project_dir(pname)
    if not pdir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    ensure_project_layout(pdir)
    idx = read_index(pdir)
    return {"project": pname, "index": idx}
```

---

/app/api/upload.py
```python
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from app.config import settings
from app.storage.paths import ensure_root_exists, safe_project_name, get_project_dir, is_supported_media
from app.storage.index import ensure_project_layout, bump_counts
from app.storage.dedupe import (
    ensure_db,
    compute_sha256_stream_to_tempfile,
    find_existing_by_sha,
    insert_file_record,
    find_existing_by_relpath,
)
from app.storage.events import record_event
from app.storage.timeutil import now_iso
from app.storage.files import safe_filename, unique_dest_path, move_into_place, relpath_posix


router = APIRouter(tags=["upload"])


@router.post("/projects/{project}/upload")
async def upload_media(project: str, file: UploadFile = File(...)):
    ensure_root_exists()
    pname = safe_project_name(project)
    pdir = get_project_dir(pname)
    if not pdir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    ensure_project_layout(pdir)
    ensure_db(pdir)

    filename = safe_filename(file.filename or "upload.bin")
    if not is_supported_media(filename):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {Path(filename).suffix.lower()}")

    max_bytes = int(settings.max_upload_mb) * 1024 * 1024

    tmp_path, sha256, size_bytes = await compute_sha256_stream_to_tempfile(file, max_bytes=max_bytes)

    # Fast duplicate by hash
    existing = find_existing_by_sha(pdir, sha256)
    if existing:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

        bump_counts(pdir, dup_delta=1)
        record_event(pdir, {
            "type": "upload_duplicate_skipped",
            "sha256": sha256,
            "filename": filename,
            "size_bytes": size_bytes,
            "existing_rel_path": existing["rel_path"],
        })
        return {"ok": True, "duplicate": True, "sha256": sha256, "existing_rel_path": existing["rel_path"]}

    # Store into ingest/originals
    dest_dir = pdir / "ingest" / "originals"
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_abs = unique_dest_path(dest_dir / filename, suffix=f"__{sha256[:10]}")
    stored_abs = move_into_place(tmp_path, dest_abs)

    stored_rel = relpath_posix(stored_abs, pdir)

    # Guard: if rel_path already exists in DB from old history, still accept; update record
    prior = find_existing_by_relpath(pdir, stored_rel)
    if prior:
        # Extremely rare, but keep consistent
        record_event(pdir, {
            "type": "upload_relpath_collision",
            "sha256": sha256,
            "stored_rel_path": stored_rel,
            "note": "rel_path existed in db; record overwritten logically by sha index",
        })

    insert_file_record(
        pdir,
        sha256=sha256,
        rel_path=stored_rel,
        size_bytes=size_bytes,
        mtime_ns=(pdir / stored_rel).stat().st_mtime_ns,
        created_at=now_iso(),
    )

    bump_counts(pdir, videos_delta=1)
    record_event(pdir, {
        "type": "upload_ingested",
        "sha256": sha256,
        "filename": filename,
        "size_bytes": size_bytes,
        "stored_rel_path": stored_rel,
    })

    return {"ok": True, "duplicate": False, "sha256": sha256, "stored_rel_path": stored_rel}
```

---

/app/api/sync.py
```python
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.storage.paths import ensure_root_exists, safe_project_name, get_project_dir
from app.storage.index import ensure_project_layout
from app.storage.events import record_event


router = APIRouter(tags=["sync"])


class SyncTrigger(BaseModel):
    album_name: str
    device: str | None = "iphone"
    note: str | None = ""


@router.post("/projects/{project}/sync-album")
def sync_album(project: str, payload: SyncTrigger):
    ensure_root_exists()
    pname = safe_project_name(project)
    pdir = get_project_dir(pname)
    if not pdir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    ensure_project_layout(pdir)

    record_event(pdir, {
        "type": "sync_album_triggered",
        "album_name": payload.album_name,
        "device": payload.device or "iphone",
        "note": payload.note or "",
    })

    return {"ok": True, "project": pname, "album_name": payload.album_name}
```

---

/app/api/reindex.py
```python
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.storage.paths import ensure_root_exists, safe_project_name, get_project_dir
from app.storage.index import ensure_project_layout, set_counts_from_db
from app.storage.dedupe import ensure_db
from app.storage.reindex import reindex_project
from app.storage.events import record_event


router = APIRouter(tags=["reindex"])


@router.post("/projects/{project}/reindex")
def reindex(project: str):
    ensure_root_exists()
    pname = safe_project_name(project)
    pdir = get_project_dir(pname)
    if not pdir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    ensure_project_layout(pdir)
    ensure_db(pdir)

    result = reindex_project(pdir)

    # Sync human-facing counters after DB reconciliation
    set_counts_from_db(pdir)

    record_event(pdir, {"type": "reindex_completed", **result})
    return {"ok": True, "project": pname, "result": result}
```

---

/app/storage/__init__.py
```python
# Storage helpers
```

---

/app/storage/timeutil.py
```python
from __future__ import annotations

from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
```

---

/app/storage/paths.py
```python
from __future__ import annotations

import re
from pathlib import Path

from app.config import settings


_VALID_PROJECT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_MEDIA_EXTS = {".mp4", ".mov", ".m4v", ".mxf", ".avi", ".mp3", ".wav", ".aac", ".m4a"}


def ensure_root_exists() -> None:
    settings.projects_root.mkdir(parents=True, exist_ok=True)


def safe_project_name(name: str) -> str:
    name = name.strip()
    if not _VALID_PROJECT.match(name):
        raise ValueError("Invalid project name. Use letters/numbers plus . _ - and no spaces/slashes.")
    return name


def get_project_dir(project: str) -> Path:
    # project is already validated by safe_project_name
    return (settings.projects_root / project).resolve()


def list_projects() -> list[dict]:
    root = settings.projects_root
    out: list[dict] = []
    if not root.exists():
        return out
    for p in root.iterdir():
        if p.is_dir():
            out.append({"name": p.name, "has_index": (p / "index.json").exists()})
    out.sort(key=lambda x: x["name"].lower())
    return out


def is_supported_media(filename: str) -> bool:
    return Path(filename).suffix.lower() in _MEDIA_EXTS
```

---

/app/storage/index.py
```python
from __future__ import annotations

import json
from pathlib import Path

from app.storage.timeutil import now_iso


def ensure_project_layout(pdir: Path) -> None:
    (pdir / "ingest" / "originals").mkdir(parents=True, exist_ok=True)
    (pdir / "ingest" / "proxies").mkdir(parents=True, exist_ok=True)
    (pdir / "exports").mkdir(parents=True, exist_ok=True)
    (pdir / "_manifest").mkdir(parents=True, exist_ok=True)

    idx = pdir / "index.json"
    if not idx.exists():
        idx.write_text(
            json.dumps(
                {
                    "project": pdir.name,
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                    "counts": {"videos": 0, "duplicates_skipped": 0},
                    "notes": "",
                },
                indent=2,
            ),
            encoding="utf-8",
        )


def read_index(pdir: Path) -> dict:
    path = pdir / "index.json"
    return json.loads(path.read_text(encoding="utf-8"))


def write_index(pdir: Path, data: dict) -> None:
    path = pdir / "index.json"
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def bump_counts(pdir: Path, *, videos_delta: int = 0, dup_delta: int = 0) -> None:
    data = read_index(pdir)
    data.setdefault("counts", {}).setdefault("videos", 0)
    data.setdefault("counts", {}).setdefault("duplicates_skipped", 0)
    data["counts"]["videos"] += int(videos_delta)
    data["counts"]["duplicates_skipped"] += int(dup_delta)
    data["updated_at"] = now_iso()
    write_index(pdir, data)


def set_counts_from_db(pdir: Path) -> None:
    # videos count comes from DB rows; duplicates is an operational stat kept as-is
    from app.storage.dedupe import count_db_rows  # local import to avoid cycles

    data = read_index(pdir)
    data.setdefault("counts", {}).setdefault("duplicates_skipped", 0)
    data.setdefault("counts", {})
    data["counts"]["videos"] = count_db_rows(pdir)
    data["updated_at"] = now_iso()
    write_index(pdir, data)
```

---

/app/storage/events.py
```python
from __future__ import annotations

import json
from pathlib import Path

from app.storage.timeutil import now_iso


def record_event(pdir: Path, event: dict) -> None:
    logp = pdir / "_manifest" / "files.jsonl"
    logp.parent.mkdir(parents=True, exist_ok=True)
    payload = {"ts": now_iso(), **event}
    with logp.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")
```

---

/app/storage/files.py
```python
from __future__ import annotations

import os
import shutil
from pathlib import Path


def safe_filename(name: str) -> str:
    # Minimal sanitization: keep basename, remove nulls
    name = Path(name).name.replace("\x00", "")
    if not name:
        return "upload.bin"
    return name


def unique_dest_path(path: Path, *, suffix: str) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    ext = path.suffix
    candidate = path.with_name(f"{stem}{suffix}{ext}")
    if not candidate.exists():
        return candidate
    # If still colliding, add counter
    for i in range(1, 9999):
        c = path.with_name(f"{stem}{suffix}_{i}{ext}")
        if not c.exists():
            return c
    raise RuntimeError("Unable to pick unique destination filename")


def move_into_place(tmp_path: str, dest_path: Path) -> Path:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(tmp_path, str(dest_path))
    return dest_path


def relpath_posix(abs_path: Path, root: Path) -> str:
    rel = abs_path.resolve().relative_to(root.resolve())
    return rel.as_posix()


def walk_files(root: Path) -> list[Path]:
    out: list[Path] = []
    for dp, _, files in os.walk(root):
        for fn in files:
            out.append(Path(dp) / fn)
    return out
```

---

/app/storage/dedupe.py
```python
from __future__ import annotations

import hashlib
import os
import sqlite3
import tempfile
from pathlib import Path

from fastapi import UploadFile


DB_NAME = "hashes.sqlite"


def _db_path(pdir: Path) -> Path:
    return pdir / "_manifest" / DB_NAME


def ensure_db(pdir: Path) -> None:
    db = _db_path(pdir)
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS files (
              sha256 TEXT PRIMARY KEY,
              rel_path TEXT UNIQUE NOT NULL,
              size_bytes INTEGER NOT NULL,
              mtime_ns INTEGER NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_rel_path ON files(rel_path)")
        conn.commit()
    finally:
        conn.close()


def count_db_rows(pdir: Path) -> int:
    db = _db_path(pdir)
    if not db.exists():
        return 0
    conn = sqlite3.connect(db)
    try:
        row = conn.execute("SELECT COUNT(1) FROM files").fetchone()
        return int(row[0] if row else 0)
    finally:
        conn.close()


async def compute_sha256_stream_to_tempfile(file: UploadFile, *, max_bytes: int) -> tuple[str, str, int]:
    h = hashlib.sha256()
    size = 0

    fd, tmp_path = tempfile.mkstemp(prefix="media-sync-", suffix=".upload")
    os.close(fd)

    try:
        with open(tmp_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError(f"Upload too large (>{max_bytes} bytes)")
                h.update(chunk)
                f.write(chunk)
        return tmp_path, h.hexdigest(), size
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise


def find_existing_by_sha(pdir: Path, sha256: str) -> dict | None:
    db = _db_path(pdir)
    conn = sqlite3.connect(db)
    try:
        row = conn.execute(
            "SELECT sha256, rel_path, size_bytes, mtime_ns, created_at FROM files WHERE sha256=?",
            (sha256,),
        ).fetchone()
        if not row:
            return None
        return {
            "sha256": row[0],
            "rel_path": row[1],
            "size_bytes": row[2],
            "mtime_ns": row[3],
            "created_at": row[4],
        }
    finally:
        conn.close()


def find_existing_by_relpath(pdir: Path, rel_path: str) -> dict | None:
    db = _db_path(pdir)
    conn = sqlite3.connect(db)
    try:
        row = conn.execute(
            "SELECT sha256, rel_path, size_bytes, mtime_ns, created_at FROM files WHERE rel_path=?",
            (rel_path,),
        ).fetchone()
        if not row:
            return None
        return {
            "sha256": row[0],
            "rel_path": row[1],
            "size_bytes": row[2],
            "mtime_ns": row[3],
            "created_at": row[4],
        }
    finally:
        conn.close()


def insert_file_record(pdir: Path, *, sha256: str, rel_path: str, size_bytes: int, mtime_ns: int, created_at: str) -> None:
    db = _db_path(pdir)
    conn = sqlite3.connect(db)
    try:
        conn.execute(
            """
            INSERT INTO files (sha256, rel_path, size_bytes, mtime_ns, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (sha256, rel_path, int(size_bytes), int(mtime_ns), created_at),
        )
        conn.commit()
    finally:
        conn.close()


def upsert_by_relpath(pdir: Path, *, rel_path: str, sha256: str, size_bytes: int, mtime_ns: int, created_at: str) -> None:
    # If file moved/changed, we keep rel_path as unique key and refresh its sha.
    db = _db_path(pdir)
    conn = sqlite3.connect(db)
    try:
        conn.execute(
            """
            INSERT INTO files (sha256, rel_path, size_bytes, mtime_ns, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(rel_path) DO UPDATE SET
              sha256=excluded.sha256,
              size_bytes=excluded.size_bytes,
              mtime_ns=excluded.mtime_ns
            """,
            (sha256, rel_path, int(size_bytes), int(mtime_ns), created_at),
        )
        conn.commit()
    finally:
        conn.close()


def delete_missing_relpaths(pdir: Path, *, existing_relpaths: set[str]) -> int:
    # Remove DB entries for relpaths that no longer exist on disk
    db = _db_path(pdir)
    conn = sqlite3.connect(db)
    try:
        rows = conn.execute("SELECT rel_path FROM files").fetchall()
        rels = {r[0] for r in rows}
        missing = rels - existing_relpaths
        if not missing:
            return 0
        conn.executemany("DELETE FROM files WHERE rel_path=?", [(m,) for m in missing])
        conn.commit()
        return len(missing)
    finally:
        conn.close()
```

---

/app/storage/reindex.py
```python
from __future__ import annotations

import hashlib
from pathlib import Path

from app.storage.files import walk_files, relpath_posix
from app.storage.dedupe import (
    find_existing_by_relpath,
    upsert_by_relpath,
    delete_missing_relpaths,
)
from app.storage.timeutil import now_iso
from app.storage.paths import is_supported_media


def _hash_file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def reindex_project(pdir: Path) -> dict:
    """
    Reconciles disk state -> sqlite:
    - walks project directory (excluding _manifest and index.json)
    - hashes supported media files if new/changed (size/mtime)
    - removes db relpaths that no longer exist
    """
    scanned = 0
    hashed = 0
    skipped = 0

    # Walk everything under project, but skip internal metadata
    all_files = walk_files(pdir)
    disk_relpaths: set[str] = set()

    for abs_path in all_files:
        # skip manifest + index
        if "_manifest" in abs_path.parts:
            continue
        if abs_path.name == "index.json":
            continue

        rel = relpath_posix(abs_path, pdir)
        disk_relpaths.add(rel)

        # only hash supported media files
        if not is_supported_media(abs_path.name):
            skipped += 1
            continue

        st = abs_path.stat()
        scanned += 1

        prior = find_existing_by_relpath(pdir, rel)
        if prior and int(prior["size_bytes"]) == int(st.st_size) and int(prior["mtime_ns"]) == int(st.st_mtime_ns):
            # unchanged
            skipped += 1
            continue

        sha = _hash_file_sha256(abs_path)
        upsert_by_relpath(
            pdir,
            rel_path=rel,
            sha256=sha,
            size_bytes=int(st.st_size),
            mtime_ns=int(st.st_mtime_ns),
            created_at=prior["created_at"] if prior else now_iso(),
        )
        hashed += 1

    removed = delete_missing_relpaths(pdir, existing_relpaths=disk_relpaths)

    return {
        "scanned_media_files": scanned,
        "hashed_or_updated": hashed,
        "skipped": skipped,
        "removed_missing_records": removed,
    }
```

---

/README.md
```md
# media-sync-api

See repo README you already drafted; keep it high level. This file intentionally not expanded here since you’re editing it separately.
```

---

/AGENTS.md
```md
# See the AGENTS.md you requested earlier.
# Keep it updated on every commit as the agent handoff contract.
```

---

## What you run

- Build + run: `docker compose build && docker compose up -d`
- iPhone hits: `http://192.168.0.25:8787/api/projects`
- Reindex a project: `POST http://192.168.0.25:8787/api/projects/<project>/reindex`

---

## Notes for Windows (important)
- Docker Desktop must be allowed to mount the **B:** drive.
- Your volume line uses: `B:/Video/Projects:/data/projects`

If you want, I can also generate:
- a **minimal "admin UI"** single HTML page served by FastAPI (list projects, create project, drag/drop upload)
- a **Shortcuts-friendly response format** (more human readable + notifications)
- a **project "index.html" generator** per project folder (optional)