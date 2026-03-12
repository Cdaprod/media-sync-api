"""Compose endpoints for media-sync-api.

Internal architecture (single file, layered):
1. Imports / Constants
2. Request & Response Models
3. Value Objects (dataclasses)
4. Pure Helpers
5. Project / Environment Helpers
6. ComposeSession
7. ComposePlanner
8. ComposeExecutor
9. ComposeRegistrar
10. ComposeService
11. FastAPI Routes

Example (existing files):
curl -X POST http://localhost:8787/api/projects/demo/compose   
-H 'Content-Type: application/json'   
-d '{"inputs":["ingest/originals/a.mp4","ingest/originals/b.mp4"]}'

Example (upload then compose):
curl -X POST 'http://localhost:8787/api/projects/demo/compose/upload?output_name=final.mp4'   
-F 'files=@/path/a.mp4' -F 'files=@/path/b.mp4'
"""

from __future__ import annotations

# =============================================================================

# 1. IMPORTS / CONSTANTS

# =============================================================================

import hashlib
import json
import logging
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.dedupe import (
compute_sha256_from_path,
lookup_file_hash,
record_file_hash,
)
from app.storage.index import (
append_event,
append_file_entry,
bump_count,
load_index,
save_index,
)
from app.storage.metadata import ensure_metadata
from app.storage.paths import ensure_subdirs, project_path, safe_filename, validate_project_name
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["compose"])
logger = logging.getLogger("media_sync_api.compose")

COMPOSE_SESSION_PREFIX = "compose_session_"
SESSION_MAX_AGE_SECONDS = 3600

# =============================================================================

# 2. REQUEST & RESPONSE MODELS

# =============================================================================

class ComposeRequest(BaseModel):
"""Request body for composing already-ingested project clips."""


inputs: list[str] = Field(..., min_length=1, description="Project-relative media paths to concatenate.")
output_name: str = Field(default="compiled.mp4", description="Target filename base label.")
target_dir: str = Field(default="exports", description="Project-relative destination folder.")
mode: Literal["auto", "copy", "encode"] = Field(default="auto")


# =============================================================================

# 3. VALUE OBJECTS

# =============================================================================

@dataclass(frozen=True)
class ProjectContext:
"""Resolved project + source context. Replaces the (name, source, project) tuple."""


project_name: str
source_name: str
project_root: Path       # absolute path to the project directory
source_root: Path        # absolute path to the source root


@dataclass(frozen=True)
class ComposeSpec:
"""Normalized user intent for a compose operation."""


inputs: list[str]                               # normalized relative paths (or empty for upload flows)
output_name: str                                # raw base label, not the final filename
target_dir: str
mode: Literal["auto", "copy", "encode"]


@dataclass(frozen=True)
class ComposePlan:
"""Execution plan. The seam between policy and ffmpeg."""


input_paths: list[Path]
output_path: Path
strategy: Literal["copy", "encode"]
requested_mode: Literal["auto", "copy", "encode"]


@dataclass(frozen=True)
class ComposeResult:
"""What the executor returns after ffmpeg completes."""


output_path: Path
mode_used: Literal["copy", "encode"]


# =============================================================================

# 4. PURE HELPERS

# =============================================================================

def _now_iso() -> str:
return datetime.now(timezone.utc).isoformat()

def _safe_filename_or_400(value: str | None, *, default: str) -> str:
raw = (value or "").strip() or default
try:
return safe_filename(raw)
except ValueError as exc:
raise HTTPException(status_code=400, detail=str(exc)) from exc

def _error_tail(value: str | None) -> str:
return (value or "").strip()[-1000:]

def _ffmpeg_indicates_existing_output(result: subprocess.CompletedProcess[str]) -> bool:
combined = ((result.stderr or "") + "\n" + (result.stdout or "")).lower()
return "file exists" in combined or "already exists" in combined or "not overwriting" in combined

def _probe_signature(path: Path) -> dict[str, str]:
"""Collect stream compatibility facts for concat-copy safety checks."""
command = ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)]
result = subprocess.run(command, capture_output=True, text=True)
if result.returncode != 0:
return {}
try:
payload = json.loads(result.stdout)
except json.JSONDecodeError:
return {}


streams = payload.get("streams", [])
v = next((s for s in streams if s.get("codec_type") == "video"), {})
a = next((s for s in streams if s.get("codec_type") == "audio"), {})
return {
    "video_codec": str(v.get("codec_name", "")),
    "video_profile": str(v.get("profile", "")),
    "video_pix_fmt": str(v.get("pix_fmt", "")),
    "video_width": str(v.get("width", "")),
    "video_height": str(v.get("height", "")),
    "video_sar": str(v.get("sample_aspect_ratio", "")),
    "video_dar": str(v.get("display_aspect_ratio", "")),
    "audio_codec": str(a.get("codec_name", "")),
    "audio_sample_rate": str(a.get("sample_rate", "")),
    "audio_channels": str(a.get("channels", "")),
    "audio_channel_layout": str(a.get("channel_layout", "")),
}


def _inputs_compatible_for_copy(input_paths: list[Path]) -> bool:
signatures = [_probe_signature(p) for p in input_paths]
if not signatures or any(not s for s in signatures):
return False
return all(s == signatures[0] for s in signatures[1:])

def _header_str(request: Request, key: str) -> str | None:
val = request.headers.get(key)
return val.strip() or None if val else None

def _header_int(request: Request, key: str) -> int | None:
raw = _header_str(request, key)
if raw is None:
return None
try:
return int(raw)
except ValueError:
return None

def _build_absolute_media_url(
base_url: str,
project_name: str,
relative_path: str,
*,
source: str | None,
download: bool,
) -> str:
encoded_path = quote(relative_path.lstrip("/"), safe="/")
encoded_project = quote(project_name, safe="")
suffix = f"?source={quote(source)}" if source is not None else ""
path = (
f"/media/{encoded_project}/download/{encoded_path}"
if download
else f"/media/{encoded_project}/{encoded_path}"
)
return f"{base_url.rstrip('/')}{path}{suffix}"

# =============================================================================

# 5. PROJECT / ENVIRONMENT HELPERS

# =============================================================================

def _resolve_project_context(project_name: str, source_name: str | None) -> tuple[ProjectContext, Any]:
"""
Validate project name, resolve source, ensure project layout.
Returns (ProjectContext, active_source_object).
"""
try:
name = validate_project_name(project_name)
except ValueError as exc:
raise HTTPException(status_code=400, detail=str(exc)) from exc


settings = get_settings()
registry = SourceRegistry(settings.project_root)
try:
    active_source = registry.require(source_name)
except ValueError as exc:
    raise HTTPException(status_code=404, detail=str(exc)) from exc
if not active_source.accessible:
    raise HTTPException(status_code=503, detail="Source root is not reachable")

proj_root = project_path(active_source.root, name)
ensure_subdirs(proj_root, ["ingest/originals", "ingest/_metadata", "ingest/thumbnails", "_manifest", "exports"])
if not (proj_root / "index.json").exists():
    raise HTTPException(status_code=404, detail="Project index missing")

ctx = ProjectContext(
    project_name=name,
    source_name=active_source.name,
    project_root=proj_root,
    source_root=active_source.root,
)
return ctx, active_source


def _validate_compose_environment() -> None:
"""Reject temp roots that overlap any enabled source root."""
settings = get_settings()
registry = SourceRegistry(settings.project_root)
resolved_temp = Path(settings.temp_root).expanduser().resolve()


try:
    enabled = registry.list_enabled()
except Exception as exc:
    raise HTTPException(status_code=503, detail=f"Cannot enumerate source roots: {exc}") from exc

if not enabled:
    try:
        enabled = [registry.require(None)]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Cannot determine default source root: {exc}") from exc

for src in enabled:
    src_root = src.root.expanduser().resolve()
    if resolved_temp == src_root or src_root in resolved_temp.parents:
        raise HTTPException(
            status_code=503,
            detail=(
                f"MEDIA_SYNC_TEMP_ROOT ({resolved_temp}) must resolve outside enabled SourceRegistry roots "
                f"(conflicts with '{src.name}' at {src_root})"
            ),
        )


def _resolve_path_within_project(ctx: ProjectContext, relative: str, *, require_exists: bool) -> Path:
candidate = (ctx.project_root / relative.lstrip("/")).resolve()
if candidate != ctx.project_root and ctx.project_root not in candidate.parents:
raise HTTPException(status_code=400, detail="Path escapes project root")
if require_exists and not candidate.exists():
raise HTTPException(status_code=404, detail=f"Missing path: {relative}")
return candidate

def _indexed_path_set(ctx: ProjectContext) -> set[str]:
index = load_index(ctx.project_root)
files = index.get("files", []) if isinstance(index, dict) else []
result: set[str] = set()
for entry in files:
rel = entry.get("relative_path") if isinstance(entry, dict) else None
if isinstance(rel, str):
result.add(rel.replace("\\", "/").lstrip("/"))
return result

# =============================================================================

# 6. COMPOSE SESSION

# =============================================================================

async def _write_upload(upload: UploadFile, target: Path, max_bytes: int) -> None:
"""Shared upload writer used by both batch staging and incremental session staging."""
written = 0
with target.open("wb") as handle:
while True:
chunk = await upload.read(1024 * 1024)
if not chunk:
break
written += len(chunk)
if written > max_bytes:
raise HTTPException(status_code=413, detail="Upload exceeds configured limit")
handle.write(chunk)

@dataclass
class ComposeSession:
"""
Manages incremental (one-clip-per-POST) upload state.
Replaces all *session** free functions + route-local session logic.
"""


session_dir: Path
run_id: str
project_name: str
source_name: str
count: int
received: list[int] = field(default_factory=list)
closed: bool = False
closed_at: str | None = None
created_at: str = field(default_factory=_now_iso)
created_ts: float = field(default_factory=lambda: datetime.now(timezone.utc).timestamp())

# ------------------------------------------------------------------
# State queries
# ------------------------------------------------------------------

def is_complete(self) -> bool:
    return len(self.received) >= self.count and self.missing_indices() == []

def missing_indices(self) -> list[int]:
    received_set = set(self.received)
    return [i for i in range(self.count) if i not in received_set]

def ordered_inputs(self) -> list[Path]:
    inputs: list[Path] = []
    for i in range(self.count):
        match = sorted(self.session_dir.glob(f"{i:04d}_*"))
        if not match:
            raise HTTPException(status_code=500, detail=f"Session file missing on disk for index {i}")
        inputs.append(match[0])
    return inputs

# ------------------------------------------------------------------
# Persistence
# ------------------------------------------------------------------

def _meta_path(self) -> Path:
    return self.session_dir / "meta.json"

def save(self) -> None:
    meta = {
        "project": self.project_name,
        "source": self.source_name,
        "run_id": self.run_id,
        "created_at": self.created_at,
        "created_ts": self.created_ts,
        "count": self.count,
        "received": self.received,
        "closed": self.closed,
        "closed_at": self.closed_at,
    }
    tmp = self.session_dir / "meta.json.tmp"
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(self._meta_path())

# ------------------------------------------------------------------
# Lifecycle
# ------------------------------------------------------------------

async def stage_clip(self, upload: UploadFile, idx0: int, max_bytes: int) -> Path:
    safe_name = safe_filename(upload.filename or f"clip-{idx0}.mp4")
    target = self.session_dir / f"{idx0:04d}_{safe_name}"
    # Last-write-wins for duplicate index posts (iOS Shortcuts retry-safe).
    # The file is overwritten and received list remains deduplicated.
    await _write_upload(upload, target, max_bytes)
    if idx0 not in self.received:
        self.received.append(idx0)
        self.received.sort()
    self.save()
    return target

def close(self) -> None:
    self.closed = True
    self.closed_at = _now_iso()
    self.save()

def cleanup(self) -> None:
    shutil.rmtree(self.session_dir, ignore_errors=True)

# ------------------------------------------------------------------
# Class-level factory / loader
# ------------------------------------------------------------------

@classmethod
def _session_key(cls, project_name: str, run_id: str) -> str:
    h = hashlib.sha1(f"{project_name}::{run_id}".encode()).hexdigest()[:16]
    return f"{COMPOSE_SESSION_PREFIX}{project_name}_{h}"

@classmethod
def _session_dir_path(cls, settings: Any, project_name: str, run_id: str) -> Path:
    return Path(settings.temp_root) / cls._session_key(project_name, run_id)

@classmethod
def load(cls, settings: Any, project_name: str, run_id: str) -> "ComposeSession | None":
    session_dir = cls._session_dir_path(settings, project_name, run_id)
    meta_path = session_dir / "meta.json"
    if not meta_path.exists():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    # Reject corrupt sessions rather than loading a broken zero-count object.
    count_raw = meta.get("count")
    if not isinstance(count_raw, (int, float)) or int(count_raw) <= 0:
        return None
    count = int(count_raw)

    return cls(
        session_dir=session_dir,
        run_id=run_id,
        project_name=meta.get("project", project_name),
        source_name=meta.get("source", ""),
        count=count,
        received=sorted({
            int(x) for x in meta.get("received", [])
            if isinstance(x, int) or (isinstance(x, str) and str(x).isdigit())
        }),
        closed=bool(meta.get("closed", False)),
        closed_at=meta.get("closed_at") or None,
        created_at=meta.get("created_at") or _now_iso(),
        created_ts=float(meta["created_ts"]) if isinstance(meta.get("created_ts"), (int, float)) else datetime.now(timezone.utc).timestamp(),
    )

@classmethod
def create(cls, settings: Any, ctx: ProjectContext, run_id: str, count: int) -> "ComposeSession":
    session_dir = cls._session_dir_path(settings, ctx.project_name, run_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    session = cls(
        session_dir=session_dir,
        run_id=run_id,
        project_name=ctx.project_name,
        source_name=ctx.source_name,
        count=count,
    )
    session.save()
    return session

@classmethod
def prune_stale(cls, temp_root: Path) -> None:
    now = datetime.now(timezone.utc).timestamp()
    try:
        for child in temp_root.iterdir():
            if not child.is_dir() or not child.name.startswith(COMPOSE_SESSION_PREFIX):
                continue
            meta_path = child / "meta.json"
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                created = meta.get("created_ts")
                if not isinstance(created, (int, float)) or (now - float(created)) > SESSION_MAX_AGE_SECONDS:
                    shutil.rmtree(child, ignore_errors=True)
            except Exception:
                shutil.rmtree(child, ignore_errors=True)
    except Exception:
        return


# =============================================================================

# 7. COMPOSE PLANNER

# =============================================================================

class ComposePlanner:
"""
Translates a ComposeSpec into a ComposePlan.
Owns: output naming, path resolution, index validation, strategy selection.
Future: segment selection, album clip rules.
"""


def build_existing_plan(self, ctx: ProjectContext, spec: ComposeSpec) -> ComposePlan:
    indexed = _indexed_path_set(ctx)
    normalized = [v.replace("\\", "/").lstrip("/") for v in spec.inputs]
    missing = [v for v in normalized if v not in indexed]
    if missing:
        preview = missing[:10]
        suffix = f" (+{len(missing) - len(preview)} more)" if len(missing) > 10 else ""
        raise HTTPException(
            status_code=400,
            detail=f"Compose inputs must be indexed project assets. Missing (up to 10): {preview}{suffix}",
        )

    input_paths = [_resolve_path_within_project(ctx, rel, require_exists=True) for rel in normalized]
    output_path = self._resolve_output_path(ctx, spec)
    strategy = self._select_strategy(spec.mode, input_paths)
    return ComposePlan(
        input_paths=input_paths,
        output_path=output_path,
        strategy=strategy,
        requested_mode=spec.mode,
    )

def build_staged_plan(self, ctx: ProjectContext, staged_inputs: list[Path], spec: ComposeSpec) -> ComposePlan:
    output_path = self._resolve_output_path(ctx, spec)
    strategy = self._select_strategy(spec.mode, staged_inputs)
    return ComposePlan(
        input_paths=staged_inputs,
        output_path=output_path,
        strategy=strategy,
        requested_mode=spec.mode,
    )

def _select_strategy(
    self,
    mode: Literal["auto", "copy", "encode"],
    input_paths: list[Path],
) -> Literal["copy", "encode"]:
    if mode == "encode":
        return "encode"
    compatible = _inputs_compatible_for_copy(input_paths)
    if mode == "copy" and not compatible:
        raise HTTPException(status_code=400, detail="Inputs are incompatible for concat copy mode")
    return "copy" if compatible else "encode"

def _resolve_output_path(self, ctx: ProjectContext, spec: ComposeSpec) -> Path:
    target_dir = _resolve_path_within_project(ctx, spec.target_dir.strip() or "exports", require_exists=False)
    target_dir.mkdir(parents=True, exist_ok=True)
    final_name = self._resolve_final_name(ctx.project_root, spec.output_name)
    output_path = _resolve_path_within_project(
        ctx,
        f"{target_dir.relative_to(ctx.project_root).as_posix()}/{final_name}",
        require_exists=False,
    )
    if output_path.exists():
        raise HTTPException(
            status_code=409,
            detail="Output already exists (unexpected with incremental naming). Try again.",
        )
    return output_path

def _resolve_final_name(self, project_root: Path, requested: str | None) -> str:
    normalized = (requested or "").strip().lower()
    base = "compiled.mp4" if normalized in {"", "auto", "compiled.mp4"} else (
        _safe_filename_or_400(requested, default="compiled.mp4")
    )
    if not base.lower().endswith(".mp4"):
        base = f"{base}.mp4"
    seq = self._next_sequence(project_root)
    stem = Path(base).stem
    return f"{stem}-{seq:04d}.mp4"

@staticmethod
def _next_sequence(project_root: Path) -> int:
    # Sequence numbers are monotonic but not gapless by design.
    # Failed compose attempts still advance the counter.
    # This is intentional: log/filename clarity over dense numbering.
    index = load_index(project_root)
    if not isinstance(index, dict):
        index = {}
    counts = index.setdefault("counts", {})
    current = counts.get("compose_compiled_seq")
    current = (int(current) if isinstance(current, int) else 0) + 1
    counts["compose_compiled_seq"] = current
    index["counts"] = counts
    save_index(project_root, index)
    return current


# =============================================================================

# 8. COMPOSE EXECUTOR

# =============================================================================

class ComposeExecutor:
"""
Accepts a ComposePlan and invokes ffmpeg.
Owns: concat list file, ffmpeg subprocess, error translation.
"""


def execute(self, plan: ComposePlan) -> ComposeResult:
    list_path = self._write_concat_list(plan)
    try:
        if plan.strategy == "copy":
            return self._run_copy(plan, list_path)
        return self._run_encode(plan, list_path)
    finally:
        list_path.unlink(missing_ok=True)

def _concat_list_path(self, plan: ComposePlan) -> Path:
    return plan.output_path.parent / f".{plan.output_path.stem}.concat.txt"

def _write_concat_list(self, plan: ComposePlan) -> Path:
    list_path = self._concat_list_path(plan)
    with list_path.open("w", encoding="utf-8") as handle:
        for path in plan.input_paths:
            safe = str(path).replace("'", "'\\''")
            handle.write(f"file '{safe}'\n")
    return list_path

def _run_copy(self, plan: ComposePlan, list_path: Path) -> ComposeResult:
    command = [
        "ffmpeg", "-n",
        "-f", "concat", "-safe", "0",
        "-i", str(list_path),
        "-c", "copy",
        str(plan.output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        if _ffmpeg_indicates_existing_output(result):
            self._raise_error("ffmpeg copy blocked existing output", result, status_code=409)
        if plan.requested_mode == "copy":
            self._raise_error("ffmpeg copy failed", result)
        # auto mode: fall through to encode using the same list_path
        return self._run_encode(plan, list_path)
    return ComposeResult(output_path=plan.output_path, mode_used="copy")

def _run_encode(self, plan: ComposePlan, list_path: Path) -> ComposeResult:
    command = [
        "ffmpeg", "-n",
        "-f", "concat", "-safe", "0",
        "-i", str(list_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
        str(plan.output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        if _ffmpeg_indicates_existing_output(result):
            self._raise_error("ffmpeg encode blocked existing output", result, status_code=409)
        self._raise_error("ffmpeg encode failed", result)
    return ComposeResult(output_path=plan.output_path, mode_used="encode")

@staticmethod
def _raise_error(prefix: str, result: subprocess.CompletedProcess[str], *, status_code: int = 500) -> None:
    stderr_tail = _error_tail(result.stderr)
    stdout_tail = _error_tail(result.stdout)
    detail = f"{prefix}; stderr_tail={stderr_tail or '<empty>'}; stdout_tail={stdout_tail or '<empty>'}"
    raise HTTPException(status_code=status_code, detail=detail)


# =============================================================================

# 9. COMPOSE REGISTRAR

# =============================================================================

class ComposeRegistrar:
"""
Hashes output, deduplicates, writes index/manifest/metadata, shapes response.
Owns: sha256, dedupe, index append, event append, metadata, response DTO.
"""


def register(
    self,
    ctx: ProjectContext,
    result: ComposeResult,
    request: Request,
) -> dict[str, Any]:
    project = ctx.project_root
    manifest_db = project / "_manifest/manifest.db"
    output_rel = result.output_path.relative_to(project).as_posix()
    sha256 = compute_sha256_from_path(result.output_path)
    base_url = str(request.base_url)

    existing = lookup_file_hash(manifest_db, sha256)
    if existing and existing != output_rel:
        return self._handle_duplicate(ctx, existing, sha256, result.output_path, result.mode_used, base_url)

    return self._handle_new(ctx, output_rel, sha256, result, base_url)

def _handle_duplicate(
    self,
    ctx: ProjectContext,
    existing_rel: str,
    sha256: str,
    new_output_path: Path,
    mode_used: str,
    base_url: str,
) -> dict[str, Any]:
    project = ctx.project_root

    # The new output is a duplicate of an already-registered asset.
    # Discard the new file — the canonical copy lives at existing_rel.
    new_output_path.unlink(missing_ok=True)

    index = load_index(project)
    bump_count(index, "duplicates_skipped", amount=1)
    save_index(project, index)
    append_event(project, "compose_duplicate_skipped", {"relative_path": existing_rel, "sha256": sha256})

    return {
        "status": "duplicate",
        "project": ctx.project_name,
        "source": ctx.source_name,
        "path": existing_rel,
        "sha256": sha256,
        "mode_used": mode_used,
        "served": self._served_urls(base_url, ctx.project_name, existing_rel, ctx.source_name),
    }

def _handle_new(
    self,
    ctx: ProjectContext,
    output_rel: str,
    sha256: str,
    result: ComposeResult,
    base_url: str,
) -> dict[str, Any]:
    project = ctx.project_root
    manifest_db = project / "_manifest/manifest.db"

    record_file_hash(manifest_db, sha256, output_rel)
    entry = {
        "relative_path": output_rel,
        "sha256": sha256,
        "size": result.output_path.stat().st_size,
        "uploaded_at": _now_iso(),
    }
    ensure_metadata(project, output_rel, sha256, result.output_path, source=ctx.source_name, method="compose")
    append_file_entry(project, entry)
    append_event(project, "compose_created", {"relative_path": output_rel, "sha256": sha256, "mode": result.mode_used})

    return {
        "status": "stored",
        "project": ctx.project_name,
        "source": ctx.source_name,
        "path": output_rel,
        "sha256": sha256,
        "size": entry["size"],
        "mode_used": result.mode_used,
        "served": self._served_urls(base_url, ctx.project_name, output_rel, ctx.source_name),
    }

@staticmethod
def _served_urls(base_url: str, project_name: str, relative_path: str, source_name: str) -> dict[str, str]:
    return {
        "stream_url": _build_absolute_media_url(
            base_url, project_name, relative_path, source=source_name, download=False
        ),
        "download_url": _build_absolute_media_url(
            base_url, project_name, relative_path, source=source_name, download=True
        ),
    }


# =============================================================================

# 10. COMPOSE SERVICE

# =============================================================================

class ComposeService:
"""
Orchestration facade. Routes call this. Nothing else does.
Owns: flow coordination only — no ffmpeg, no index, no sessions directly.
"""


def __init__(self) -> None:
    self.planner = ComposePlanner()
    self.executor = ComposeExecutor()
    self.registrar = ComposeRegistrar()

# ------------------------------------------------------------------
# Flow A: Compose existing indexed clips
# ------------------------------------------------------------------

def compose_existing(
    self,
    ctx: ProjectContext,
    spec: ComposeSpec,
    request: Request,
) -> dict[str, Any]:
    plan = self.planner.build_existing_plan(ctx, spec)
    result = self.executor.execute(plan)
    logger.info(
        "compose_existing_complete project=%s source=%s output=%s mode=%s",
        ctx.project_name, ctx.source_name,
        result.output_path.relative_to(ctx.project_root).as_posix(),
        result.mode_used,
    )
    return self.registrar.register(ctx, result, request)

# ------------------------------------------------------------------
# Flow B: Upload batch (all files in one POST)
# ------------------------------------------------------------------

async def compose_upload_batch(
    self,
    ctx: ProjectContext,
    spec: ComposeSpec,
    files: list[UploadFile],
    request: Request,
    settings: Any,
) -> dict[str, Any]:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    temp_dir = Path(tempfile.mkdtemp(prefix="compose_", dir=settings.temp_root))
    try:
        staged: list[Path] = []
        for index, upload in enumerate(files):
            safe_name = safe_filename(upload.filename or f"clip-{index}.mp4")
            target = temp_dir / f"{index:04d}_{safe_name}"
            await _write_upload(upload, target, max_bytes)
            staged.append(target)

        plan = self.planner.build_staged_plan(ctx, staged, spec)
        result = self.executor.execute(plan)
        response = self.registrar.register(ctx, result, request)
        logger.info(
            "compose_upload_batch_complete project=%s source=%s output=%s mode=%s",
            ctx.project_name, ctx.source_name, response.get("path"), result.mode_used,
        )
        return response
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

# ------------------------------------------------------------------
# Flow C: Incremental upload (one clip per POST, X-Compose-* headers)
# ------------------------------------------------------------------

async def compose_upload_incremental(
    self,
    ctx: ProjectContext,
    spec: ComposeSpec,
    upload: UploadFile,
    request: Request,
    settings: Any,
    run_id: str,
    idx: int,
    total: int,
) -> JSONResponse | dict[str, Any]:
    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid X-Compose-Count (must be > 0)")

    # Normalize index (Shortcuts is 1-based)
    idx0 = (idx - 1) if 1 <= idx <= total else idx
    if idx0 < 0 or idx0 >= total:
        raise HTTPException(status_code=400, detail=f"Invalid X-Compose-Index (idx={idx}, total={total})")

    max_bytes = settings.max_upload_mb * 1024 * 1024

    # Load or create session
    session = ComposeSession.load(settings, ctx.project_name, run_id)
    if session is None:
        session = ComposeSession.create(settings, ctx, run_id, total)
    elif session.closed:
        raise HTTPException(
            status_code=409,
            detail="Compose session already closed (X-Compose-Time reused). Use millisecond precision.",
        )
    elif session.count != total:
        raise HTTPException(
            status_code=409,
            detail=f"Session count mismatch: existing={session.count}, header={total}",
        )

    await session.stage_clip(upload, idx0, max_bytes)

    is_last = (idx0 == total - 1)
    if not is_last:
        return JSONResponse(
            status_code=202,
            content={
                "status": "staged",
                "project": ctx.project_name,
                "source": ctx.source_name,
                "run_id": run_id,
                "received": len(session.received),
                "count": total,
                "missing_preview": session.missing_indices()[:25],
                "note": "Send remaining clips; final clip triggers compose immediately.",
            },
        )

    # Last clip: verify all parts present
    missing = session.missing_indices()
    if missing:
        raise HTTPException(status_code=409, detail=f"Last clip received but session missing indices: {missing[:50]}")

    staged_inputs = session.ordered_inputs()
    plan = self.planner.build_staged_plan(ctx, staged_inputs, spec)

    try:
        result = self.executor.execute(plan)
    except HTTPException as exc:
        # Compose failed. Session stays open on disk for potential retry.
        # Caller may repost the final clip to trigger another attempt.
        logger.warning(
            "compose_upload_incremental_failed project=%s run_id=%s status=%s detail=%s",
            ctx.project_name, run_id, exc.status_code, exc.detail,
        )
        raise

    response = self.registrar.register(ctx, result, request)
    session.close()
    session.cleanup()

    logger.info(
        "compose_upload_incremental_complete project=%s source=%s run_id=%s output=%s mode=%s",
        ctx.project_name, ctx.source_name, run_id, response.get("path"), result.mode_used,
    )
    return response


# =============================================================================

# 11. FASTAPI ROUTES

# =============================================================================

# Module-level singleton — ComposeService is stateless, no reason to rebuild per request.

_compose_service = ComposeService()

@router.post("/{project_name}/compose")
async def compose_existing(
project_name: str,
request: Request,
payload: ComposeRequest,
source: str | None = Query(default=None),
):
"""Compose one output from existing indexed project media paths.


Naming policy: output_name is treated as a base label only.
Final filename is always server-managed: <stem>-NNNN.mp4.
Overwrite is intentionally unsupported — outputs are always unique.
"""
_validate_compose_environment()
ctx, _ = _resolve_project_context(project_name, source)

spec = ComposeSpec(
    inputs=payload.inputs,
    output_name=payload.output_name,
    target_dir=payload.target_dir,
    mode=payload.mode,
)

return _compose_service.compose_existing(ctx, spec, request)


@router.post("/{project_name}/compose/upload")
async def compose_upload(
project_name: str,
request: Request,
files: list[UploadFile] = File(...),
source: str | None = Query(default=None),
output_name: str = Query(default="compiled.mp4"),
target_dir: str = Query(default="exports"),
mode: Literal["auto", "copy", "encode"] = Query(default="auto"),
):
"""Upload clips and compose into one artifact.


Naming policy: output_name is treated as a base label only.
Final filename is always server-managed: <stem>-NNNN.mp4.
Overwrite is intentionally unsupported — outputs are always unique.

TWO flows:
  Legacy:      single POST with multiple files
  Incremental: one POST per clip with X-Compose-Time / X-Compose-Index / X-Compose-Count headers
               Final clip (index == count - 1) triggers immediate compose.
               If compose fails, session stays open for retry.
"""
_validate_compose_environment()
ctx, _ = _resolve_project_context(project_name, source)

if not files:
    raise HTTPException(status_code=400, detail="files must include at least one upload")

settings = get_settings()
ComposeSession.prune_stale(Path(settings.temp_root))

run_id = _header_str(request, "X-Compose-Time")
idx = _header_int(request, "X-Compose-Index")
total = _header_int(request, "X-Compose-Count")
is_incremental = run_id is not None and idx is not None and total is not None and len(files) == 1

logger.info(
    "compose_upload_received project=%s source=%s incremental=%s file_count=%s run_id=%s idx=%s total=%s",
    ctx.project_name, ctx.source_name, is_incremental, len(files), run_id, idx, total,
)

spec = ComposeSpec(
    inputs=[],
    output_name=output_name,
    target_dir=target_dir,
    mode=mode,
)

if is_incremental:
    return await _compose_service.compose_upload_incremental(
        ctx, spec, files[0], request, settings,
        run_id=run_id, idx=idx, total=total,
    )

return await _compose_service.compose_upload_batch(ctx, spec, files, request, settings)
