"""Source management endpoints for media-sync-api.

Example call (register a NAS path):
    curl -X POST http://localhost:8787/api/sources \
        -H 'Content-Type: application/json' \
        -d '{"name":"nas","root":"/mnt/nas/projects","type":"smb"}'
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.sources import SourceCapabilities, SourceRegistry, normalize_source_name, validate_source_name


logger = logging.getLogger("media_sync_api.sources")

router = APIRouter(prefix="/api/sources", tags=["sources"])


class SourceCreateRequest(BaseModel):
    name: str = Field(description="Logical identifier for the source")
    root: Path = Field(description="Absolute path to the projects root for this source")
    mode: str = Field(default="library", description="project or library")
    read_only: bool = Field(default=True, description="Library sources must be read-only")
    type: str = Field(default="local", description="Source type hint (e.g., local, smb, nfs)")
    enabled: bool = Field(default=True, description="Whether the source should be indexed and listed")
    capabilities: Optional[SourceCapabilities] = None
    id_strategy: str = Field(default="sha256_source_relpath", description="Asset ID strategy")


class SourceUpdateRequest(BaseModel):
    root: Optional[Path] = None
    enabled: Optional[bool] = None
    read_only: Optional[bool] = None
    mode: Optional[str] = None
    type: Optional[str] = None
    capabilities: Optional[SourceCapabilities] = None
    id_strategy: Optional[str] = None


class SourceResponse(BaseModel):
    name: str
    root: str
    type: str
    enabled: bool
    mode: str
    read_only: bool
    capabilities: SourceCapabilities
    id_strategy: str
    accessible: bool
    instructions: str | None = None

    @classmethod
    def from_registry(cls, payload) -> "SourceResponse":
        return cls(
            name=payload.name,
            root=str(payload.root),
            type=payload.type,
            enabled=payload.enabled,
            mode=payload.mode,
            read_only=payload.read_only,
            capabilities=payload.capabilities,
            id_strategy=payload.id_strategy,
            accessible=payload.accessible,
            instructions="Use ?source={name} on project endpoints to target this root.".format(
                name=payload.name
            ),
        )


def _registry() -> SourceRegistry:
    settings = get_settings()
    return SourceRegistry(settings.project_root, settings.sources_parent_root)


@router.get("", response_model=List[SourceResponse])
async def list_sources() -> List[SourceResponse]:
    registry = _registry()
    sources = registry.list_all()
    logger.info("listed_sources", extra={"count": len(sources)})
    return [SourceResponse.from_registry(source) for source in sources]


@router.post("", response_model=SourceResponse, status_code=201)
async def register_source(payload: SourceCreateRequest) -> SourceResponse:
    registry = _registry()
    try:
        validate_source_name(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if normalize_source_name(payload.name) == "primary":
        raise HTTPException(status_code=400, detail="Primary source is managed automatically")

    root = Path(payload.root).expanduser().resolve()
    if not root.exists():
        raise HTTPException(status_code=400, detail="Source root does not exist or is not reachable")

    try:
        source = registry.upsert(
            name=payload.name,
            root=root,
            type=payload.type,
            enabled=payload.enabled,
            mode=payload.mode,
            read_only=payload.read_only,
            capabilities=payload.capabilities or SourceCapabilities(),
            id_strategy=payload.id_strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    logger.info("source_registered", extra={"source": source.name, "root": str(source.root)})
    return SourceResponse.from_registry(source)


@router.patch("/{source_name}", response_model=SourceResponse)
async def update_source(source_name: str, payload: SourceUpdateRequest) -> SourceResponse:
    """Update a registered source (enable/disable or change root).

    Example:
        curl -X PATCH http://localhost:8787/api/sources/nas -d '{"enabled":false}'
    """

    registry = _registry()
    try:
        validate_source_name(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if normalize_source_name(source_name) == "primary":
        raise HTTPException(status_code=400, detail="Primary source cannot be modified")

    try:
        current = registry.require(source_name, include_disabled=True)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    root = Path(payload.root or current.root).expanduser().resolve()
    if payload.root and not root.exists():
        raise HTTPException(status_code=400, detail="Source root does not exist or is not reachable")

    mode = payload.mode or current.mode
    read_only = payload.read_only if payload.read_only is not None else current.read_only
    try:
        updated = registry.upsert(
            name=current.name,
            root=root,
            type=payload.type or current.type,
            enabled=payload.enabled if payload.enabled is not None else current.enabled,
            mode=mode,
            read_only=read_only,
            capabilities=payload.capabilities or current.capabilities,
            id_strategy=payload.id_strategy or current.id_strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    logger.info("source_updated", extra={"source": updated.name})
    return SourceResponse.from_registry(updated)


@router.delete("/{source_name}", status_code=204, response_model=None)
async def delete_source(source_name: str) -> Response:
    """Remove a source registration.

    Example:
        curl -X DELETE http://localhost:8787/api/sources/nas
    """

    registry = _registry()
    try:
        validate_source_name(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if normalize_source_name(source_name) == "primary":
        raise HTTPException(status_code=400, detail="Primary source cannot be deleted")
    try:
        registry.remove(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(status_code=204)


@router.post("/{source_name}/toggle", response_model=SourceResponse)
async def toggle_source(source_name: str, enabled: bool = True) -> SourceResponse:
    registry = _registry()
    try:
        validate_source_name(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if normalize_source_name(source_name) == "primary":
        raise HTTPException(status_code=400, detail="Primary source cannot be disabled")

    try:
        current = registry.require(source_name, include_disabled=True)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    updated = registry.upsert(
        name=current.name,
        root=current.root,
        type=current.type,
        enabled=enabled,
        mode=current.mode,
        read_only=current.read_only,
        capabilities=current.capabilities,
        id_strategy=current.id_strategy,
    )
    logger.info("source_toggled", extra={"source": updated.name, "enabled": updated.enabled})
    return SourceResponse.from_registry(updated)
