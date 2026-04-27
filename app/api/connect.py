"""Connect-plane discovery and onboarding endpoints.

Example:
    curl http://localhost:8787/connect
    curl -X POST http://localhost:8787/connect/register \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"capture-rpi5-1","label":"RPI5 Capture Node","base_url":"http://192.168.0.21:8787"}'
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field, ValidationError

from app.config import get_settings
from app.runtime import get_runtime
from app.auth.node_tokens import issue_node_token
from app.runtime.nodes import NodeRecord, NodeStatus, public_node_record_dict, validate_node_id
from app.runtime.source_records import SourceRecord, merge_remote_source_record
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/connect", tags=["connect"])

ConnectResponseKind = Literal["html", "json", "text"]


class ConnectRegisterRequest(BaseModel):
    """Public-facing connection/bootstrap registration payload."""

    node_id: str
    label: str
    base_url: str | None = None
    roles: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)

    source_name: str = Field(default="primary")
    source_kind: Literal["filesystem", "capture", "proxy", "virtual"] = "filesystem"
    source_authority: Literal["canonical", "runner-local", "ephemeral"] = "runner-local"

    enabled: bool = True
    status: NodeStatus = "unknown"
    version: str | None = None
    advertised_source_kinds: list[str] = Field(default_factory=list)
    ephemeral: bool = False
    metadata: dict[str, str] = Field(default_factory=dict)


class ConnectRegisterAuthResponse(BaseModel):
    type: str
    token: str
    token_preview: str
    scopes: list[str] = Field(default_factory=list)
    header: str
    node_id_header: str
    shown_once: bool = True


class ConnectRegisterResponse(BaseModel):
    ok: bool
    registered_node: dict[str, Any]
    source_record: dict[str, Any]
    authority: dict[str, Any]
    device_url: str
    message: str
    auth: ConnectRegisterAuthResponse


def _preferred_response_kind(accept: str | None) -> ConnectResponseKind:
    raw = (accept or "").lower()
    if "text/html" in raw:
        return "html"
    if "application/json" in raw or "application/*" in raw:
        return "json"
    if "text/plain" in raw or "*/*" in raw:
        return "text"
    return "text"


def _runtime_capabilities(runtime: AppRuntime) -> list[str]:
    caps = runtime.capabilities
    raw = asdict(caps) if is_dataclass(caps) else dict(vars(caps))
    return sorted(key for key, value in raw.items() if value)


def _runtime_source_records(runtime: AppRuntime) -> list[SourceRecord]:
    records = runtime.metadata.get("source_records", [])
    return [record for record in records if isinstance(record, SourceRecord)]


def _remote_source_records(runtime: AppRuntime) -> list[SourceRecord]:
    records = runtime.metadata.get("remote_source_records", [])
    return [record for record in records if isinstance(record, SourceRecord)]


def _all_source_records(runtime: AppRuntime) -> list[SourceRecord]:
    return [*_runtime_source_records(runtime), *_remote_source_records(runtime)]


def _source_record_to_dict(record: SourceRecord) -> dict[str, Any]:
    return {
        "name": record.name,
        "root": str(record.root) if record.root is not None else None,
        "kind": record.kind,
        "authority": record.authority,
        "owner_node_id": record.owner_node_id,
        "enabled": record.enabled,
        "accessible": record.accessible,
        "local_only": record.local_only,
        "can_index": record.can_index,
        "can_proxy": record.can_proxy,
        "can_record": record.can_record,
        "metadata": dict(record.metadata),
    }




def _normalize_origin(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip().rstrip('/')
    return stripped or None


def _preferred_authority_base_url(request: Request) -> str:
    settings = get_settings()
    configured_authority = _normalize_origin(settings.authority_origin)
    configured_public = _normalize_origin(settings.public_origin)
    request_base = _normalize_origin(str(request.base_url))
    return configured_authority or configured_public or request_base or ''


def _connect_device_url(request: Request, node_id: str) -> str:
    configured_origin = _normalize_origin(get_settings().authority_origin) or _normalize_origin(get_settings().public_origin)
    relative = f"/connect/device?node_id={node_id}"
    if configured_origin:
        return f"{configured_origin}{relative}"
    return relative

def _connect_manifest(request: Request, runtime: AppRuntime) -> dict[str, Any]:
    source_records = [_source_record_to_dict(record) for record in _all_source_records(runtime)]
    base_url = _preferred_authority_base_url(request)
    return {
        "service": "media-sync-api",
        "connect_version": "1",
        "role": runtime.identity.role,
        "runtime_id": runtime.identity.runtime_id,
        "node_id": runtime.identity.node_id,
        "node_name": runtime.identity.node_name,
        "instance_name": runtime.identity.instance_name,
        "started": runtime.started,
        "authority": {
            "node_id": runtime.identity.node_id,
            "node_name": runtime.identity.node_name,
            "role": runtime.identity.role,
            "base_url": base_url,
        },
        "capabilities": _runtime_capabilities(runtime),
        "paths": {
            "data_root": str(runtime.paths.data_root),
            "temp_root": str(runtime.paths.temp_root),
            "cache_root": str(runtime.paths.cache_root),
            "spool_root": str(runtime.paths.spool_root),
            "logs_root": str(runtime.paths.logs_root),
        },
        "endpoints": {
            "self": f"{base_url}/connect",
            "register": f"{base_url}/connect/register",
            "health": f"{base_url}/health",
            "nodes": f"{base_url}/api/nodes",
            "ingest_claims": f"{base_url}/api/ingest/claims",
            "library": f"{base_url}/api/library?scope=all",
        },
        "source_records": source_records,
        "supported_source_kinds": ["filesystem", "capture", "proxy", "virtual"],
        "supported_source_authorities": ["canonical", "runner-local", "ephemeral"],
        "notes": [
            "This endpoint is the discovery and onboarding surface for runtime-backed nodes.",
            "Use /connect/register to register a non-authority node as a source-bearing participant.",
            "This endpoint does not yet submit ingest claims or negotiate live media sessions.",
            "Registered source-bearing nodes may later submit ingest claims through /api/ingest/claims.",
        ],
    }


def _manifest_as_text(manifest: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("media-sync-api connect")
    lines.append(f"service: {manifest['service']}")
    lines.append(f"role: {manifest['role']}")
    lines.append(f"node_id: {manifest['node_id']}")
    lines.append(f"node_name: {manifest['node_name']}")
    lines.append(f"started: {manifest['started']}")
    lines.append(f"connect: {manifest['endpoints']['self']}")
    lines.append(f"register: {manifest['endpoints']['register']}")
    lines.append(f"health: {manifest['endpoints']['health']}")
    lines.append(f"nodes: {manifest['endpoints']['nodes']}")
    lines.append(f"ingest_claims: {manifest['endpoints']['ingest_claims']}")
    lines.append(f"library: {manifest['endpoints']['library']}")

    source_records = manifest.get("source_records", [])
    lines.append(f"source_records: {len(source_records)}")
    for record in source_records:
        lines.append(
            f"  - {record['name']} "
            f"(kind={record['kind']}, authority={record['authority']}, owner={record['owner_node_id']})"
        )
    return "\n".join(lines)


def _manifest_as_html(manifest: dict[str, Any]) -> str:
    source_items = "\n".join(
        (
            "<li>"
            f"<strong>{record['name']}</strong> "
            f"(kind={record['kind']}, authority={record['authority']}, owner={record['owner_node_id']})"
            "</li>"
        )
        for record in manifest.get("source_records", [])
    ) or "<li>No source records available.</li>"

    capability_items = "\n".join(f"<li>{cap}</li>" for cap in manifest.get("capabilities", [])) or "<li>None</li>"
    notes = "\n".join(f"<li>{note}</li>" for note in manifest.get("notes", []))

    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>media-sync-api connect</title>
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <style>
    body {{ font-family: Arial, sans-serif; margin: 2rem; background: #0b0d10; color: #f3f4f6; }}
    .card {{ background: #141922; border: 1px solid #2b3442; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1rem; }}
    code {{ background: #0f1720; padding: 0.15rem 0.35rem; border-radius: 6px; }}
    a {{ color: #7dd3fc; }}
    ul {{ margin-top: 0.5rem; }}
  </style>
</head>
<body>
  <h1>media-sync-api connect</h1>

  <div class=\"card\">
    <h2>Authority</h2>
    <p><strong>role:</strong> {manifest['role']}</p>
    <p><strong>node_id:</strong> {manifest['node_id']}</p>
    <p><strong>node_name:</strong> {manifest['node_name']}</p>
    <p><strong>started:</strong> {manifest['started']}</p>
    <p><strong>register endpoint:</strong> <code>{manifest['endpoints']['register']}</code></p>
    <p><strong>ingest claims endpoint:</strong> <code>{manifest['endpoints']['ingest_claims']}</code></p>
    <p><strong>library endpoint:</strong> <code>{manifest['endpoints']['library']}</code></p>
  </div>

  <div class=\"card\"><h2>Capabilities</h2><ul>{capability_items}</ul></div>
  <div class=\"card\"><h2>Source Records</h2><ul>{source_items}</ul></div>
  <div class=\"card\"><h2>Notes</h2><ul>{notes}</ul></div>
</body>
</html>"""


def derive_node_auth_scopes(roles: list[str], capabilities: list[str]) -> list[str]:
    scopes: set[str] = {"node:heartbeat"}

    if "capture" in roles or "runner" in roles:
        scopes.add("ingest:write")
        scopes.add("live:write")

    if "indexer" in roles or "can_index" in capabilities:
        scopes.add("index:write")

    if "can_proxy_streams" in capabilities:
        scopes.add("stream:proxy")

    if "can_record" in capabilities or "can_record_local_media" in capabilities:
        scopes.add("record:write")

    return sorted(scopes)


@router.get("")
async def get_connect(
    request: Request,
    runtime: AppRuntime = Depends(get_runtime),
    accept: str | None = Header(default=None),
):
    """Universal authority discovery entrypoint."""

    manifest = _connect_manifest(request, runtime)
    kind = _preferred_response_kind(accept)

    if kind == "html":
        return HTMLResponse(content=_manifest_as_html(manifest))
    if kind == "json":
        return JSONResponse(content=manifest)
    return PlainTextResponse(content=_manifest_as_text(manifest))


@router.post("/register", response_model=ConnectRegisterResponse)
async def register_connected_source(
    payload: ConnectRegisterRequest,
    request: Request,
    runtime: AppRuntime = Depends(get_runtime),
) -> ConnectRegisterResponse:
    """Register a non-authority runtime-backed node as a source-bearing participant."""

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
            advertised_source_kinds=payload.advertised_source_kinds or [payload.source_kind],
            ephemeral=payload.ephemeral,
            metadata=payload.metadata,
        ).with_heartbeat()
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    issued = issue_node_token()
    auth_scopes = derive_node_auth_scopes(payload.roles, payload.capabilities)
    record = record.model_copy(update={
        "token_hash": issued.token_hash,
        "token_preview": issued.token_preview,
        "auth_type": "bearer",
        "auth_scopes": auth_scopes,
    })
    registered = registry.upsert(record)

    source_record = SourceRecord(
        name=payload.source_name,
        root=None,
        kind=payload.source_kind,
        authority=payload.source_authority,
        owner_node_id=payload.node_id,
        enabled=payload.enabled,
        accessible=True,
        local_only=True,
        can_index=(payload.source_kind == "filesystem"),
        can_proxy=(payload.source_kind in {"capture", "proxy", "virtual"}),
        can_record=(payload.source_kind == "capture"),
        metadata={
            "registered_via": "/connect/register",
            "node_label": payload.label,
            "node_base_url": normalized_base_url or "",
            **payload.metadata,
        },
    )
    merge_remote_source_record(runtime, source_record)
    base_url = _preferred_authority_base_url(request)

    return ConnectRegisterResponse(
        ok=True,
        registered_node=public_node_record_dict(registered),
        source_record=_source_record_to_dict(source_record),
        authority={
            "node_id": runtime.identity.node_id,
            "node_name": runtime.identity.node_name,
            "role": runtime.identity.role,
            "base_url": base_url,
        },
        device_url=_connect_device_url(request, payload.node_id),
        message=(
            "Node registered as a source-bearing participant. "
            "Authority now knows this runtime-backed node and its declared source surface. "
            "Ingest claims are still separate and must be submitted later via /api/ingest/claims."
        ),
        auth=ConnectRegisterAuthResponse(
            type="bearer",
            token=issued.token,
            token_preview=issued.token_preview,
            scopes=auth_scopes,
            header="Authorization: Bearer <token>",
            node_id_header=f"X-Media-Sync-Node-Id: {registered.node_id}",
            shown_once=True,
        ),
    )
