"""Bridge staging endpoints for curated library sources.

Example calls:
    curl -X POST http://localhost:8787/api/sources/nas/stage-scan
    curl http://localhost:8787/api/stage-scans/<scan_id>
    curl -X POST http://localhost:8787/api/stage-scans/<scan_id>/commit \
      -H "Content-Type: application/json" -d '{"selected_paths":["Audio/SFX"]}'
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.buckets import Bucket, BucketStore, bucket_id_for
from app.storage.bridge import BridgeStore, LibraryRoot, collect_scan_paths, index_scan_tree, stage_scan_tree
from app.storage.paths import validate_relative_path
from app.storage.sources import SourceRegistry


logger = logging.getLogger("media_sync_api.bridge")

router = APIRouter(prefix="/api", tags=["bridge"])


class StageCommitRequest(BaseModel):
    selected_paths: List[str] = Field(default_factory=list)


@router.post("/sources/{source_name}/stage-scan")
async def stage_scan(source_name: str):
    """Run a staging scan for a library source without indexing assets."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        source = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source.mode != "library":
        raise HTTPException(status_code=400, detail="Selected source is not a library source")
    if not source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")

    tree = stage_scan_tree(
        source.root,
        max_depth=settings.stage_scan_max_depth,
        min_files=settings.stage_scan_min_files,
    )
    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    scan_id = bridge_store.create_scan(source.name, tree)
    logger.info(
        "stage_scan_completed",
        extra={
            "source": source.name,
            "scan_id": scan_id,
            "depth": settings.stage_scan_max_depth,
        },
    )
    return {"scan_id": scan_id, "source": source.name, "instructions": "GET /api/stage-scans/{scan_id} to inspect."}


@router.get("/stage-scans/{scan_id}")
async def get_stage_scan(scan_id: str):
    """Fetch a staging scan tree."""

    settings = get_settings()
    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    scan = bridge_store.get_scan(scan_id, ttl_minutes=settings.stage_scan_ttl_minutes)
    if not scan:
        raise HTTPException(status_code=404, detail="Stage scan not found or expired")
    return {
        "scan_id": scan.scan_id,
        "source": scan.source_name,
        "created_at": scan.created_at,
        "tree": scan.tree,
    }


@router.post("/stage-scans/{scan_id}/commit")
async def commit_stage_scan(scan_id: str, payload: StageCommitRequest):
    """Commit selected paths as library roots for indexing."""

    settings = get_settings()
    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    scan = bridge_store.get_scan(scan_id, ttl_minutes=settings.stage_scan_ttl_minutes)
    if not scan:
        raise HTTPException(status_code=404, detail="Stage scan not found or expired")

    if not payload.selected_paths:
        raise HTTPException(status_code=400, detail="selected_paths is required")

    scan_paths = collect_scan_paths(scan.tree)
    scan_index = index_scan_tree(scan.tree)
    selected: list[LibraryRoot] = []
    for raw_path in payload.selected_paths:
        safe = validate_relative_path(raw_path)
        normalized = "." if safe in {".", ""} else safe
        if normalized not in scan_paths:
            raise HTTPException(status_code=400, detail=f"Path not found in scan: {normalized}")
        stats = scan_index.get(normalized, {})
        selected.append(
            LibraryRoot(
                root_id="",
                source_name=scan.source_name,
                rel_root=normalized,
                stats={
                    "count": stats.get("descendant_media_count", 0),
                    "depth": stats.get("depth", 0),
                    "media_kinds": stats.get("media_kinds", []),
                    "mixed": stats.get("mixed", False),
                    "score": stats.get("score", 0),
                },
                selected_at="",
            )
        )

    committed = bridge_store.replace_library_roots(scan.source_name, selected)
    bucket_store = BucketStore(settings.project_root / "_sources" / "buckets.sqlite")
    bucket_roots = [
        Bucket(
            bucket_id=bucket_id_for(scan.source_name, root.rel_root),
            source_name=scan.source_name,
            bucket_rel_root=root.rel_root,
            title=Path(root.rel_root).name if root.rel_root != "." else "Root",
            stats=root.stats,
            pinned=True,
        )
        for root in committed
    ]
    bucket_store.seed_roots(scan.source_name, bucket_roots)
    bridge_store.delete_scan(scan_id)
    logger.info(
        "stage_scan_committed",
        extra={"source": scan.source_name, "count": len(committed)},
    )
    return {
        "source": scan.source_name,
        "committed": [root.rel_root for root in committed],
        "instructions": "Browse /api/sources/{source}/buckets or run discover-buckets for clustering.",
    }
