"""Runtime node control-plane endpoints.

Example:
    curl -X POST http://localhost:8787/api/nodes \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-a","label":"Runner A","base_url":"http://runner-a:8787"}'
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ValidationError

from app.auth.runtime_device_auth import RuntimeDeviceAuthContext, require_registered_node
from app.runtime import get_runtime
from app.runtime.nodes import NodeRecord, NodeStatus, public_node_record_dict, validate_node_id
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


class NodeRecordPublic(BaseModel):
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
    last_heartbeat_at: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    token_preview: str | None = None
    auth_type: str | None = None
    auth_scopes: list[str] = Field(default_factory=list)


def _to_public_node(record: NodeRecord) -> NodeRecordPublic:
    return NodeRecordPublic(**public_node_record_dict(record))


class NodeClaimRequest(BaseModel):
    roles: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    source_name: str | None = None
    status: NodeStatus | None = None
    version: str | None = None
    advertised_source_kinds: list[str] = Field(default_factory=list)
    ephemeral: bool | None = None
    metadata: dict[str, str] = Field(default_factory=dict)


@router.get("", response_model=List[NodeRecordPublic])
async def list_nodes(runtime: AppRuntime = Depends(get_runtime)) -> List[NodeRecordPublic]:
    registry = runtime.services.node_registry
    if registry is None:
        return []
    return [_to_public_node(record) for record in registry.list_all()]


@router.get("/{node_id}", response_model=NodeRecordPublic)
async def get_node(node_id: str, runtime: AppRuntime = Depends(get_runtime)) -> NodeRecordPublic:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")

    try:
        return _to_public_node(registry.require(node_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", response_model=NodeRecordPublic, status_code=201)
async def register_node(payload: NodeRegisterRequest, runtime: AppRuntime = Depends(get_runtime)) -> NodeRecordPublic:
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
    return _to_public_node(registry.upsert(record))


@router.post("/{node_id}/heartbeat", response_model=NodeRecordPublic)
async def heartbeat_node(
    node_id: str,
    ctx: RuntimeDeviceAuthContext = Depends(require_registered_node),
    runtime: AppRuntime = Depends(get_runtime),
) -> NodeRecordPublic:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")
    if ctx.node_id != node_id:
        raise HTTPException(status_code=403, detail="node_mismatch")

    try:
        current = registry.require(node_id)
        updated = current.with_heartbeat().model_copy(update={"status": "online"})
        return _to_public_node(registry.upsert(updated))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{node_id}/claim", response_model=NodeRecordPublic)
async def claim_node(
    node_id: str,
    payload: NodeClaimRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> NodeRecordPublic:
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
    return _to_public_node(registry.upsert(validated_record))


@router.delete("/{node_id}")
async def delete_node(node_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, object]:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")

    deleted = registry.delete_node(node_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="node_not_found")

    return {
        "ok": True,
        "deleted": True,
        "node_id": node_id,
    }


@router.post("/prune")
async def prune_nodes(
    older_than_seconds: int = Query(default=86400, ge=1),
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")

    removed = registry.prune_ephemeral_nodes(older_than_seconds=older_than_seconds)
    return {
        "ok": True,
        "removed": removed,
        "count": len(removed),
        "older_than_seconds": older_than_seconds,
    }
