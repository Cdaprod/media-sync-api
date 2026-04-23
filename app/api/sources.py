"""Source management endpoints for media-sync-api.

Example call (register a NAS path):
    curl -X POST http://localhost:8787/api/sources \
        -H 'Content-Type: application/json' \
        -d '{"name":"nas","root":"/mnt/nas/projects","type":"smb"}'
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.runtime import get_runtime
from app.runtime.source_records import SourceRecord
from app.runtime.types import AppRuntime
from app.storage.sources import SourceRegistry, validate_source_name


logger = logging.getLogger("media_sync_api.sources")

router = APIRouter(prefix="/api/sources", tags=["sources"])


class SourceCreateRequest(BaseModel):
    name: str = Field(description="Logical identifier for the source")
    root: Path = Field(description="Absolute path to the projects root for this source")
    type: str = Field(default="local", description="Source type hint (e.g., local, smb, nfs)")
    enabled: bool = Field(default=True, description="Whether the source should be indexed and listed")


class SourceResponse(BaseModel):
    name: str
    root: str | None
    type: str
    enabled: bool
    accessible: bool
    instructions: str | None = None

    # runtime-aware enrichments
    kind: str | None = None
    authority: str | None = None
    owner_node_id: str | None = None
    local_only: bool | None = None
    can_index: bool | None = None
    can_proxy: bool | None = None
    can_record: bool | None = None
    metadata: dict[str, str] = Field(default_factory=dict)

    @classmethod
    def from_registry(cls, payload) -> "SourceResponse":
        return cls(
            name=payload.name,
            root=str(payload.root),
            type=payload.type,
            enabled=payload.enabled,
            accessible=payload.accessible,
            instructions="Use ?source={name} on project endpoints to target this root.".format(
                name=payload.name
            ),
            kind="filesystem",
            authority="canonical" if payload.name == "primary" else "canonical",
            owner_node_id=None,
            local_only=False,
            can_index=True,
            can_proxy=False,
            can_record=False,
            metadata={},
        )

    @classmethod
    def from_source_record(cls, payload: SourceRecord) -> "SourceResponse":
        return cls(
            name=payload.name,
            root=str(payload.root) if payload.root is not None else None,
            type=payload.kind,
            enabled=payload.enabled,
            accessible=payload.accessible,
            instructions=(
                "Remote source-bearing participant registered through /connect/register. "
                "Use node/source metadata to drive later ingest and preview flows."
            ),
            kind=payload.kind,
            authority=payload.authority,
            owner_node_id=payload.owner_node_id,
            local_only=payload.local_only,
            can_index=payload.can_index,
            can_proxy=payload.can_proxy,
            can_record=payload.can_record,
            metadata=dict(payload.metadata),
        )


def _runtime_registry(runtime: AppRuntime) -> SourceRegistry:
    registry = runtime.services.source_registry
    if registry is None:
        raise RuntimeError("Source registry is not configured")
    return registry


def _remote_source_records(runtime: AppRuntime) -> list[SourceRecord]:
    records = runtime.metadata.get("remote_source_records", [])
    return [record for record in records if isinstance(record, SourceRecord)]


def _merge_source_rows(runtime: AppRuntime) -> list[SourceResponse]:
    registry = _runtime_registry(runtime)
    local_sources = [SourceResponse.from_registry(source) for source in registry.list_all()]
    remote_sources = [SourceResponse.from_source_record(record) for record in _remote_source_records(runtime)]

    merged: dict[tuple[str, str | None], SourceResponse] = {}

    for source in local_sources:
        merged[(source.name, source.owner_node_id)] = source

    for source in remote_sources:
        merged[(source.name, source.owner_node_id)] = source

    return sorted(
        merged.values(),
        key=lambda item: (
            item.authority or "",
            item.owner_node_id or "",
            item.name,
        ),
    )


@router.get("", response_model=List[SourceResponse])
async def list_sources(runtime: AppRuntime = Depends(get_runtime)) -> List[SourceResponse]:
    sources = _merge_source_rows(runtime)
    logger.info("listed_sources", extra={"count": len(sources)})
    return sources


@router.post("", response_model=SourceResponse, status_code=201)
async def register_source(payload: SourceCreateRequest, runtime: AppRuntime = Depends(get_runtime)) -> SourceResponse:
    registry = _runtime_registry(runtime)
    try:
        validate_source_name(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.name == "primary":
        raise HTTPException(status_code=400, detail="Primary source is managed automatically")

    root = Path(payload.root).expanduser().resolve()
    if not root.exists():
        raise HTTPException(status_code=400, detail="Source root does not exist or is not reachable")

    source = registry.upsert(name=payload.name, root=root, type=payload.type, enabled=payload.enabled)
    logger.info("source_registered", extra={"source": source.name, "root": str(source.root)})
    return SourceResponse.from_registry(source)


@router.post("/{source_name}/toggle", response_model=SourceResponse)
async def toggle_source(
    source_name: str,
    enabled: bool = True,
    runtime: AppRuntime = Depends(get_runtime),
) -> SourceResponse:
    registry = _runtime_registry(runtime)
    try:
        validate_source_name(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if source_name == "primary":
        raise HTTPException(status_code=400, detail="Primary source cannot be disabled")

    try:
        current = registry.require(source_name, include_disabled=True)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    updated = registry.upsert(name=current.name, root=current.root, type=current.type, enabled=enabled)
    logger.info("source_toggled", extra={"source": updated.name, "enabled": updated.enabled})
    return SourceResponse.from_registry(updated)
