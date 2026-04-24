"""Runtime node control-plane endpoints.

Example:
    curl -X POST http://localhost:8787/api/nodes \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-a","label":"Runner A","base_url":"http://runner-a:8787"}'
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.runtime import get_runtime
from app.runtime.nodes import NodeRecord, NodeStatus, validate_node_id
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


class NodeRegisterRequest(BaseModel):
    node_id: str
    label: str
    base_url: str | None = None
    roles: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    source_name: str | None = None
    enabled: bool = True
    status: NodeStatus = "unknown"
    version: str | None = None
    advertised_source_kinds: list[str] = Field(default_factory=list)
    ephemeral: bool = False
    metadata: dict[str, str] = Field(default_factory=dict)


class NodeClaimRequest(BaseModel):
    roles: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    source_name: str | None = None
    status: NodeStatus | None = None
    version: str | None = None
    advertised_source_kinds: list[str] = Field(default_factory=list)
    ephemeral: bool | None = None
    metadata: dict[str, str] = Field(default_factory=dict)


@router.get("", response_model=List[NodeRecord])
async def list_nodes(runtime: AppRuntime = Depends(get_runtime)) -> List[NodeRecord]:
    registry = runtime.services.node_registry
    if registry is None:
        return []
    return registry.list_all()


@router.get("/{node_id}", response_model=NodeRecord)
async def get_node(node_id: str, runtime: AppRuntime = Depends(get_runtime)) -> NodeRecord:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")

    try:
        return registry.require(node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", response_model=NodeRecord, status_code=201)
async def register_node(payload: NodeRegisterRequest, runtime: AppRuntime = Depends(get_runtime)) -> NodeRecord:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")

    try:
        validate_node_id(payload.node_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        normalized_base_url = payload.base_url.strip() if isinstance(payload.base_url, str) else None
        if normalized_base_url == "":
            normalized_base_url = None
        record = NodeRecord(
            node_id=payload.node_id,
            label=payload.label,
            base_url=normalized_base_url,
            roles=payload.roles,
            capabilities=payload.capabilities,
            source_name=payload.source_name,
            enabled=payload.enabled,
            status=payload.status,
            version=payload.version,
            advertised_source_kinds=payload.advertised_source_kinds,
            ephemeral=payload.ephemeral,
            metadata=payload.metadata,
        ).with_heartbeat()
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return registry.upsert(record)


@router.post("/{node_id}/heartbeat", response_model=NodeRecord)
async def heartbeat_node(node_id: str, runtime: AppRuntime = Depends(get_runtime)) -> NodeRecord:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")

    try:
        return registry.heartbeat(node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{node_id}/claim", response_model=NodeRecord)
async def claim_node(
    node_id: str,
    payload: NodeClaimRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> NodeRecord:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")

    try:
        current = registry.require(node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    updates = {
        "roles": payload.roles or current.roles,
        "capabilities": payload.capabilities or current.capabilities,
        "source_name": payload.source_name if payload.source_name is not None else current.source_name,
        "status": payload.status or current.status,
        "version": payload.version if payload.version is not None else current.version,
        "advertised_source_kinds": payload.advertised_source_kinds or current.advertised_source_kinds,
        "ephemeral": payload.ephemeral if payload.ephemeral is not None else current.ephemeral,
        "metadata": {**current.metadata, **payload.metadata},
    }
    merged_payload = {**current.model_dump(mode="python"), **updates}
    try:
        validated_record = NodeRecord(**merged_payload).with_heartbeat()
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return registry.upsert(validated_record)
