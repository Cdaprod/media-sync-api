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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
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
    root: str
    type: str
    enabled: bool
    accessible: bool
    instructions: str | None = None

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
        )


def _registry() -> SourceRegistry:
    settings = get_settings()
    return SourceRegistry(settings.project_root)


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

    if payload.name == "primary":
        raise HTTPException(status_code=400, detail="Primary source is managed automatically")

    root = Path(payload.root).expanduser().resolve()
    if not root.exists():
        raise HTTPException(status_code=400, detail="Source root does not exist or is not reachable")

    source = registry.upsert(name=payload.name, root=root, type=payload.type, enabled=payload.enabled)
    logger.info("source_registered", extra={"source": source.name, "root": str(source.root)})
    return SourceResponse.from_registry(source)


@router.post("/{source_name}/toggle", response_model=SourceResponse)
async def toggle_source(source_name: str, enabled: bool = True) -> SourceResponse:
    registry = _registry()
    try:
        validate_source_name(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if source_name == "primary":
        raise HTTPException(status_code=400, detail="Primary source cannot be disabled")

    try:
        current = registry.require(source_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    updated = registry.upsert(name=current.name, root=current.root, type=current.type, enabled=enabled)
    logger.info("source_toggled", extra={"source": updated.name, "enabled": updated.enabled})
    return SourceResponse.from_registry(updated)

