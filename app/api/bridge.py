"""Bridge helper endpoints for staged junction creation.

Example calls:
    curl http://localhost:8787/api/bridge/status
    curl -X POST http://localhost:8787/api/bridge/stage-scan \
      -H "Content-Type: application/json" \
      -d '{"target_path":"Z:\\Audio","name_hint":"Audio"}'
    curl -X POST http://localhost:8787/api/bridge/commit \
      -H "Content-Type: application/json" \
      -d '{"items":[{"junction_name":"Audio","target_path":"Z:\\Audio","selected_paths":["."]}]}'
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath
from typing import List

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.buckets import Bucket, BucketStore, bucket_id_for
from app.storage.bridge import BridgeStore, LibraryRoot, collect_scan_paths
from app.storage.paths import validate_relative_path
from app.storage.sources import SourceRegistry, validate_source_name

logger = logging.getLogger("media_sync_api.bridge")

router = APIRouter(prefix="/api/bridge", tags=["bridge"])


class StageScanRequest(BaseModel):
    target_path: str = Field(..., min_length=1)
    name_hint: str | None = Field(default=None)


class StageCommitItem(BaseModel):
    junction_name: str = Field(..., min_length=1)
    target_path: str = Field(..., min_length=1)
    selected_paths: List[str] = Field(default_factory=list)
    scan_id: str | None = Field(default=None)


class StageCommitRequest(BaseModel):
    items: List[StageCommitItem] = Field(default_factory=list)


@dataclass(frozen=True)
class BridgeAgentStatus:
    ok: bool
    detail: str | None = None


class BridgeAgentClient:
    """Client for the host bridge helper."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def health(self, timeout: float = 2.0) -> BridgeAgentStatus:
        try:
            response = httpx.get(f"{self.base_url}/health", timeout=timeout)
        except httpx.RequestError as exc:
            return BridgeAgentStatus(ok=False, detail=str(exc))
        return BridgeAgentStatus(ok=response.status_code == 200, detail=response.text)

    def scan_tree(self, target_path: str, max_depth: int | None = None, min_files: int | None = None, timeout: float = 30.0) -> dict:
        response = httpx.post(
            f"{self.base_url}/scan",
            json={
                "target": target_path,
                "max_depth": max_depth,
                "min_files": min_files,
            },
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json()

    def create_junction(self, link_path: str, target_path: str, timeout: float = 20.0) -> None:
        response = httpx.post(
            f"{self.base_url}/junction/create",
            json={"link": link_path, "target": target_path},
            timeout=timeout,
        )
        response.raise_for_status()

    def delete_junction(self, link_path: str, timeout: float = 20.0) -> None:
        response = httpx.post(
            f"{self.base_url}/junction/delete",
            json={"link": link_path},
            timeout=timeout,
        )
        response.raise_for_status()


def get_bridge_agent(settings=None) -> BridgeAgentClient:
    settings = settings or get_settings()
    return BridgeAgentClient(settings.bridge_agent_url)


@router.get("/status")
async def bridge_status():
    """Return bridge helper status and configured roots."""

    settings = get_settings()
    agent = get_bridge_agent(settings)
    status = agent.health()
    return {
        "bridge_root_host": settings.bridge_root_host,
        "bridge_root_container": settings.sources_parent_root.as_posix(),
        "agent_url": settings.bridge_agent_url,
        "agent_ok": status.ok,
        "agent_detail": status.detail or "",
    }


def _junction_link_path(bridge_root_host: str, junction_name: str) -> str:
    normalized = validate_source_name(junction_name)
    root = PureWindowsPath(bridge_root_host)
    link = root / normalized
    return str(link)


def _junction_container_root(settings, junction_name: str) -> Path:
    normalized = validate_source_name(junction_name)
    return settings.sources_parent_root / normalized


@router.post("/stage-scan")
async def stage_scan(payload: StageScanRequest):
    """Stage a scan for a host path without creating a junction.

    Example:
        curl -X POST http://localhost:8787/api/bridge/stage-scan \
          -H "Content-Type: application/json" \
          -d '{"target_path":"Z:\\Audio","name_hint":"Audio"}'
    """

    settings = get_settings()
    target_path = payload.target_path.strip()
    if not target_path:
        raise HTTPException(status_code=400, detail="target_path is required")

    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    agent = get_bridge_agent(settings)
    try:
        tree = agent.scan_tree(
            target_path,
            max_depth=settings.stage_scan_max_depth,
            min_files=settings.stage_scan_min_files,
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Bridge agent scan failed: {exc}") from exc

    scan_id = bridge_store.create_scan(
        source_name="bridge",
        tree=tree,
        target_path=target_path,
        name_hint=payload.name_hint or "",
    )
    logger.info(
        "bridge_stage_scan_completed",
        extra={"scan_id": scan_id, "target": target_path},
    )
    suggested_name = payload.name_hint or Path(target_path).name or "library"
    return {
        "scan_id": scan_id,
        "target_path": target_path,
        "name_hint": payload.name_hint or "",
        "suggested_name": suggested_name,
        "tree": tree,
    }


@router.post("/commit")
async def commit_stage_scan(payload: StageCommitRequest):
    """Commit staged junctions and register library sources."""

    if not payload.items:
        raise HTTPException(status_code=400, detail="items is required")

    settings = get_settings()
    bridge_store = BridgeStore(settings.project_root / "_sources" / "bridge.sqlite")
    agent = get_bridge_agent(settings)
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    bucket_store = BucketStore(settings.project_root / "_sources" / "buckets.sqlite")

    committed_sources: list[dict] = []
    for item in payload.items:
        scan = None
        if not item.selected_paths:
            raise HTTPException(status_code=400, detail="selected_paths is required per item")
        try:
            validate_source_name(item.junction_name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if item.scan_id:
            scan = bridge_store.get_scan(item.scan_id, ttl_minutes=settings.stage_scan_ttl_minutes)
            if not scan:
                raise HTTPException(status_code=404, detail=f"Stage scan {item.scan_id} not found or expired")
            if scan.target_path and scan.target_path != item.target_path:
                raise HTTPException(status_code=400, detail="target_path does not match staged scan")
            scan_paths = collect_scan_paths(scan.tree)
            for raw_path in item.selected_paths:
                safe = validate_relative_path(raw_path)
                normalized = "." if safe in {".", ""} else safe
                if normalized not in scan_paths:
                    raise HTTPException(status_code=400, detail=f"Path not in staged scan: {normalized}")

        link_path = _junction_link_path(settings.bridge_root_host, item.junction_name)
        try:
            agent.create_junction(link_path, item.target_path)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Bridge agent failed: {exc}") from exc

        container_root = _junction_container_root(settings, item.junction_name)
        container_root.mkdir(parents=True, exist_ok=True)
        registry.upsert(
            name=item.junction_name,
            root=container_root,
            mode="library",
            read_only=True,
        )

        safe_paths = []
        for raw_path in item.selected_paths:
            safe = validate_relative_path(raw_path)
            normalized = "." if safe in {".", ""} else safe
            safe_paths.append(normalized)

        selected_roots = [
            LibraryRoot(
                root_id="",
                source_name=item.junction_name,
                rel_root=path,
                stats={},
                selected_at="",
            )
            for path in safe_paths
        ]
        committed = bridge_store.replace_library_roots(item.junction_name, selected_roots)
        bucket_roots = [
            Bucket(
                bucket_id=bucket_id_for(item.junction_name, root.rel_root),
                source_name=item.junction_name,
                bucket_rel_root=root.rel_root,
                title=Path(root.rel_root).name if root.rel_root != "." else "Root",
                stats=root.stats,
                pinned=True,
            )
            for root in committed
        ]
        bucket_store.seed_roots(item.junction_name, bucket_roots)
        if scan and item.scan_id:
            bridge_store.delete_scan(item.scan_id)
        committed_sources.append(
            {
                "source": item.junction_name,
                "target_path": item.target_path,
                "junction_path": link_path,
                "committed": [root.rel_root for root in committed],
            }
        )

    logger.info("bridge_commit_completed", extra={"count": len(committed_sources)})
    return {"sources": committed_sources}
