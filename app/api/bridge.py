"""Bridge endpoints for staged library registration.

Example calls:
    curl http://localhost:8787/api/bridge/status
    curl http://localhost:8787/api/bridge/candidates
    curl -X POST http://localhost:8787/api/bridge/stage-scan \
      -H "Content-Type: application/json" \
      -d '{"junction_name":"Audio"}'
    curl -X POST http://localhost:8787/api/bridge/commit \
      -H "Content-Type: application/json" \
      -d '{"junction_name":"Audio","selected_roots":["."]}'
"""

from __future__ import annotations

import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings
from app.storage.buckets import Bucket, BucketStore, bucket_id_for
from app.storage.bridge import BridgeStore, LibraryRoot, collect_scan_paths, stage_scan_tree
from app.storage.paths import validate_relative_path
from app.storage.sources import SourceRegistry, validate_source_name

logger = logging.getLogger("media_sync_api.bridge")

router = APIRouter(prefix="/api/bridge", tags=["bridge"])




@router.get("/status")
async def bridge_status():
    """Return bridge root status and configured paths."""

    settings = get_settings()
    return {
        "bridge_root_container": settings.sources_parent_root.as_posix(),
        "bridge_root_host": settings.bridge_root_host,
        "ok": settings.sources_parent_root.exists(),
    }


def _junction_container_root(settings, junction_name: str) -> Path:
    normalized = validate_source_name(junction_name)
    return settings.sources_parent_root / normalized


def _reject_uploads(request: Request) -> None:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        raise HTTPException(
            status_code=400,
            detail="Bridge registers server-visible paths; use /api/projects/*/upload for files.",
        )


def _require_bridge_candidate(settings, junction_name: str) -> Path:
    candidate = _junction_container_root(settings, junction_name)
    if not candidate.exists() or not candidate.is_dir():
        raise HTTPException(status_code=404, detail="Bridge candidate not found")
    return candidate


def _normalize_junction_name(raw: str) -> str:
    try:
        return validate_source_name(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/candidates")
async def list_candidates():
    """List bridge candidates under the configured parent root.

    Example:
        curl http://localhost:8787/api/bridge/candidates
    """

    settings = get_settings()
    root = settings.sources_parent_root
    candidates = []
    if root.exists():
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            candidates.append(
                {
                    "name": child.name,
                    "relative_path": child.name,
                    "root": child.as_posix(),
                }
            )
    return {"candidates": candidates}


@router.post("/stage-scan")
async def stage_scan(request: Request):
    """Stage a scan for a server-visible junction.

    Example:
        curl -X POST http://localhost:8787/api/bridge/stage-scan \
          -H "Content-Type: application/json" \
          -d '{"junction_name":"Audio"}'
    """

    _reject_uploads(request)
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="junction_name is required") from exc
    junction_name = _normalize_junction_name(payload.get("junction_name") or "")
    settings = get_settings()
    root = _require_bridge_candidate(settings, junction_name)

    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    tree = stage_scan_tree(
        root,
        max_depth=settings.stage_scan_max_depth,
        min_files=settings.stage_scan_min_files,
    )
    scan_id = bridge_store.create_scan(
        source_name=junction_name,
        tree=tree,
        target_path=root.as_posix(),
        name_hint=junction_name,
    )
    logger.info(
        "bridge_stage_scan_completed",
        extra={"scan_id": scan_id, "junction": junction_name},
    )
    return {
        "scan_id": scan_id,
        "junction_name": junction_name,
        "tree": tree,
    }


@router.post("/commit")
async def commit_stage_scan(request: Request):
    """Commit staged junctions and register library sources."""

    _reject_uploads(request)
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="junction_name is required") from exc

    junction_name = _normalize_junction_name(payload.get("junction_name") or "")
    selected_roots = payload.get("selected_roots") or []
    scan_id = payload.get("scan_id")
    if not selected_roots:
        raise HTTPException(status_code=400, detail="selected_roots is required")

    settings = get_settings()
    container_root = _require_bridge_candidate(settings, junction_name)

    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    bucket_store = BucketStore(settings.project_root / "_sources" / "buckets.sqlite")

    scan = None
    if scan_id:
        scan = bridge_store.get_scan(scan_id, ttl_minutes=settings.stage_scan_ttl_minutes)
        if not scan:
            raise HTTPException(status_code=404, detail=f"Stage scan {scan_id} not found or expired")
        scan_paths = collect_scan_paths(scan.tree)
        for raw_path in selected_roots:
            safe = validate_relative_path(raw_path)
            normalized = "." if safe in {".", ""} else safe
            if normalized not in scan_paths:
                raise HTTPException(status_code=400, detail=f"Path not in staged scan: {normalized}")

    registry.upsert(
        name=junction_name,
        root=container_root,
        mode="library",
        read_only=True,
    )

    safe_paths = []
    for raw_path in selected_roots:
        safe = validate_relative_path(raw_path)
        normalized = "." if safe in {".", ""} else safe
        safe_paths.append(normalized)

    selected_roots = [
        LibraryRoot(
            root_id="",
            source_name=junction_name,
            rel_root=path,
            stats={},
            selected_at="",
        )
        for path in safe_paths
    ]
    committed = bridge_store.replace_library_roots(junction_name, selected_roots)
    bucket_roots = [
        Bucket(
            bucket_id=bucket_id_for(junction_name, root.rel_root),
            source_name=junction_name,
            bucket_rel_root=root.rel_root,
            title=Path(root.rel_root).name if root.rel_root != "." else "Root",
            stats=root.stats,
            pinned=True,
        )
        for root in committed
    ]
    bucket_store.seed_roots(junction_name, bucket_roots)
    if scan and scan_id:
        bridge_store.delete_scan(scan_id)

    logger.info("bridge_commit_completed", extra={"source": junction_name, "count": len(committed)})
    return {
        "source": junction_name,
        "committed": [root.rel_root for root in committed],
    }
