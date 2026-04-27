"""Live media session API.

Example:
    curl -X POST http://localhost:8787/api/live_sessions/start \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-a","source_kind":"camera"}'
"""

from __future__ import annotations

from dataclasses import asdict
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.auth.runtime_device_auth import RuntimeDeviceAuthContext, require_device_scope, require_registered_node
from app.domain.live_sessions.models import LiveSessionControlAction, LiveSourceKind
from app.runtime import get_runtime
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/live_sessions", tags=["live_sessions"])
"""Route ownership:
- Audience: operator/read + registered node mutation for durable capture lifecycle.
- Auth boundary: Caddy/operator boundary for reads; node bearer token for node-owned writes.
- State owner: runtime.services.live_session_registry (durable lifecycle lane).
- Naming policy: /api/live_sessions owns durable live capture lifecycle; keep browser signaling on /api/live.
"""


class StartLiveSessionRequest(BaseModel):
    node_id: str
    source_kind: LiveSourceKind
    metadata: dict[str, Any] = Field(default_factory=dict)


class LiveSessionResponse(BaseModel):
    session_id: str
    node_id: str
    source_kind: LiveSourceKind
    status: Literal["idle", "previewing", "recording", "ended"]
    started_at: str
    last_heartbeat_at: str
    chunk_count: int
    claim_id: str | None = None
    latest_chunk_path: str | None = None
    desired_action: LiveSessionControlAction | None = None
    last_control_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EndLiveSessionResponse(BaseModel):
    session: LiveSessionResponse
    claim_id: str | None = None


class LiveSessionRecordingUploadResponse(BaseModel):
    recording_id: str
    session_id: str
    state: str
    project: str
    source: str
    target_dir: str
    filename: str
    output_path: str
    asset_url: str
    size_bytes: int
    content_type: str


class LiveSessionControlRequest(BaseModel):
    action: LiveSessionControlAction


class LiveSessionControlAckRequest(BaseModel):
    action: LiveSessionControlAction


class LiveSignalDescription(BaseModel):
    sdp: str
    type: Literal["offer", "answer"]


class LiveSignalIceCandidate(BaseModel):
    candidate: str
    sdpMid: str | None = None
    sdpMLineIndex: int | None = None
    usernameFragment: str | None = None


class LiveSignalOfferRequest(BaseModel):
    offer: LiveSignalDescription


class LiveSignalAnswerRequest(BaseModel):
    viewer_id: str
    answer: LiveSignalDescription


class LiveSignalIceRequest(BaseModel):
    role: Literal["device", "viewer"]
    viewer_id: str
    candidate: LiveSignalIceCandidate


class LiveSignalStateResponse(BaseModel):
    session_id: str
    viewer_id: str | None = None
    viewer_ids: list[str] = Field(default_factory=list)
    primary_viewer_id: str | None = None
    offer: LiveSignalDescription | None = None
    answer: LiveSignalDescription | None = None
    ice_from_device: list[LiveSignalIceCandidate] = Field(default_factory=list)
    ice_from_viewer: list[LiveSignalIceCandidate] = Field(default_factory=list)
    updated_at: str | None = None


def _session_service(runtime: AppRuntime):
    service = runtime.services.live_session_service
    if service is None:
        raise HTTPException(status_code=503, detail="Live session service is unavailable")
    return service


def _ensure_node(runtime: AppRuntime, node_id: str) -> None:
    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Node registry is unavailable")
    try:
        registry.require(node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _require_session_owner(runtime: AppRuntime, session_id: str, node_id: str) -> None:
    registry = runtime.services.live_session_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Live session registry is unavailable")
    try:
        session = registry.require(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if session.node_id != node_id:
        raise HTTPException(status_code=403, detail="session_not_owned_by_node")


def _resolve_source_record(registry: Any, source: str) -> Any:
    for method_name in ("require", "get", "get_source", "resolve"):
        method = getattr(registry, method_name, None)
        if not callable(method):
            continue
        try:
            candidate = method(source)
        except TypeError:
            continue
        except Exception:
            continue
        if candidate is not None:
            return candidate
    return None


def _extract_source_root(source_record: Any) -> Path | None:
    if source_record is None:
        return None
    for field_name in ("root", "root_path", "path", "base_path"):
        value = getattr(source_record, field_name, None)
        if value:
            return Path(value).expanduser().resolve()
    if isinstance(source_record, dict):
        for field_name in ("root", "root_path", "path", "base_path"):
            value = source_record.get(field_name)
            if value:
                return Path(value).expanduser().resolve()
    return None


def _normalize_target_dir(target_dir: str) -> Path:
    candidate = Path((target_dir or "ingest/live").strip())
    if candidate.is_absolute():
        raise HTTPException(status_code=400, detail="target_dir_must_be_relative")
    if any(part in {"..", ""} for part in candidate.parts):
        raise HTTPException(status_code=400, detail="target_dir_contains_parent_segment")
    return candidate


def _normalize_project_name(project: str) -> str:
    candidate = (project or "").strip()
    if not candidate:
        raise HTTPException(status_code=400, detail="project_required")
    parsed = Path(candidate)
    if parsed.is_absolute() or ".." in parsed.parts or len(parsed.parts) != 1:
        raise HTTPException(status_code=400, detail="invalid_project_name")
    return candidate


def _normalize_filename(filename: str | None, recording_id: str) -> str:
    proposed = Path((filename or "").strip()).name
    if not proposed:
        proposed = f"{recording_id}.webm"
    if not proposed.lower().endswith(".webm"):
        raise HTTPException(status_code=400, detail="recording_filename_must_end_with_webm")
    return proposed


@router.post("/start", response_model=LiveSessionResponse)
async def start_live_session(
    payload: StartLiveSessionRequest,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("live:write")),
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSessionResponse:
    _ensure_node(runtime, ctx.node_id)
    payload = payload.model_copy(update={"node_id": ctx.node_id})
    session = _session_service(runtime).start_session(
        node_id=payload.node_id,
        source_kind=payload.source_kind,
        metadata=payload.metadata,
    )
    return LiveSessionResponse(**asdict(session))


@router.post("/{session_id}/heartbeat", response_model=LiveSessionResponse)
async def heartbeat_live_session(
    session_id: str,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("live:write")),
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSessionResponse:
    _require_session_owner(runtime, session_id, ctx.node_id)
    try:
        session = _session_service(runtime).heartbeat(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LiveSessionResponse(**asdict(session))


@router.post("/{session_id}/chunk")
async def upload_live_session_chunk(
    session_id: str,
    request: Request,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("live:write")),
    runtime: AppRuntime = Depends(get_runtime),
):
    _require_session_owner(runtime, session_id, ctx.node_id)
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Chunk body cannot be empty")

    mime_type = request.headers.get("content-type")
    try:
        path = _session_service(runtime).accept_chunk(
            session_id=session_id,
            chunk_bytes=raw,
            mime_type=mime_type,
        )
        session_registry = runtime.services.live_session_registry
        if session_registry is None:
            raise HTTPException(status_code=503, detail="Live session registry is unavailable")
        session = session_registry.require(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return JSONResponse(
        {
            "ok": True,
            "session_id": session_id,
            "chunk_count": session.chunk_count,
            "latest_chunk_path": str(path),
        }
    )


@router.post("/{session_id}/end", response_model=EndLiveSessionResponse)
async def end_live_session(
    session_id: str,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("live:write")),
    runtime: AppRuntime = Depends(get_runtime),
) -> EndLiveSessionResponse:
    _require_session_owner(runtime, session_id, ctx.node_id)
    try:
        session = _session_service(runtime).end_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    payload = LiveSessionResponse(**asdict(session))
    return EndLiveSessionResponse(session=payload, claim_id=session.claim_id)


@router.post("/{session_id}/recording/upload", response_model=LiveSessionRecordingUploadResponse)
async def upload_live_session_recording(
    session_id: str,
    file: UploadFile = File(...),
    project: str = Form(...),
    source: str = Form("primary"),
    target_dir: str = Form("ingest/live"),
    recording_id: str | None = Form(default=None),
    filename: str | None = Form(default=None),
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSessionRecordingUploadResponse:
    """Recording persistence/upload endpoint for durable asset writes.

    Route ownership:
    - Audience: browser recording upload lifecycle.
    - Auth boundary: browser same-origin gateway/Caddy operator boundary.
    - State owner: source registry/filesystem/index write path.
    """
    registry = runtime.services.live_session_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Live session registry is unavailable")
    try:
        registry.require(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    normalized_project = _normalize_project_name(project)
    normalized_target_dir = _normalize_target_dir(target_dir)
    normalized_recording_id = (recording_id or f"rec-{uuid.uuid4().hex}").strip()
    normalized_filename = _normalize_filename(filename, normalized_recording_id)

    content_type = (file.content_type or "").lower()
    if content_type not in {"video/webm", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="unsupported_recording_content_type")

    source_registry = runtime.services.source_registry
    source_record = _resolve_source_record(source_registry, source) if source_registry is not None else None
    source_root = _extract_source_root(source_record)
    if source_root is None:
        raise HTTPException(status_code=404, detail=f"Source '{source}' not found")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="recording_file_empty")

    output_dir = (source_root / normalized_project / normalized_target_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = (output_dir / normalized_filename).resolve()
    output_path.write_bytes(payload)

    relative_target_dir = normalized_target_dir.as_posix()
    asset_url = f"/media/{normalized_project}/{relative_target_dir}/{normalized_filename}?source={source}"
    response_payload = {
        "recording_id": normalized_recording_id,
        "session_id": session_id,
        "state": "completed",
        "project": normalized_project,
        "source": source,
        "target_dir": relative_target_dir,
        "filename": normalized_filename,
        "output_path": str(output_path),
        "asset_url": asset_url,
        "size_bytes": len(payload),
        "content_type": content_type or "application/octet-stream",
    }
    return LiveSessionRecordingUploadResponse(**response_payload)


@router.get("", response_model=list[LiveSessionResponse])
async def list_live_sessions(runtime: AppRuntime = Depends(get_runtime)) -> list[LiveSessionResponse]:
    registry = runtime.services.live_session_registry
    if registry is None:
        return []
    return [LiveSessionResponse(**asdict(session)) for session in registry.list_active()]


@router.get("/{session_id}", response_model=LiveSessionResponse)
async def get_live_session(
    session_id: str,
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSessionResponse:
    registry = runtime.services.live_session_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Live session registry is unavailable")
    try:
        session = registry.require(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LiveSessionResponse(**asdict(session))


@router.post("/{session_id}/control")
async def control_live_session(
    session_id: str,
    payload: LiveSessionControlRequest,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("live:write")),
    runtime: AppRuntime = Depends(get_runtime),
) -> JSONResponse:
    _require_session_owner(runtime, session_id, ctx.node_id)
    try:
        session = _session_service(runtime).control_session(session_id, payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return JSONResponse({"ok": True, "action": payload.action, "session_id": session.session_id})


@router.post("/{session_id}/control/ack")
async def acknowledge_live_session_control(
    session_id: str,
    payload: LiveSessionControlAckRequest,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("live:write")),
    runtime: AppRuntime = Depends(get_runtime),
) -> JSONResponse:
    _require_session_owner(runtime, session_id, ctx.node_id)
    try:
        session = _session_service(runtime).acknowledge_control_action(session_id, payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return JSONResponse({"ok": True, "action": payload.action, "session_id": session.session_id})


@router.post("/{session_id}/signal/offer", response_model=LiveSignalStateResponse)
async def publish_live_signal_offer(
    session_id: str,
    payload: LiveSignalOfferRequest,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("live:write")),
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSignalStateResponse:
    _require_session_owner(runtime, session_id, ctx.node_id)
    try:
        state = _session_service(runtime).publish_signal_offer(session_id, payload.offer.model_dump(mode="python"))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LiveSignalStateResponse(**state)


@router.post("/{session_id}/signal/answer", response_model=LiveSignalStateResponse)
async def publish_live_signal_answer(
    session_id: str,
    payload: LiveSignalAnswerRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSignalStateResponse:
    try:
        state = _session_service(runtime).publish_signal_answer(
            session_id,
            payload.viewer_id,
            payload.answer.model_dump(mode="python"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LiveSignalStateResponse(**state)


@router.post("/{session_id}/signal/ice", response_model=LiveSignalStateResponse)
async def publish_live_signal_ice(
    session_id: str,
    payload: LiveSignalIceRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_media_sync_node_id: str | None = Header(default=None),
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSignalStateResponse:
    if payload.role == "device":
        ctx = require_registered_node(
            request=request,
            authorization=authorization,
            x_media_sync_node_id=x_media_sync_node_id,
        )
        if not ctx.can("live:write"):
            raise HTTPException(status_code=403, detail="insufficient_device_scope")
        _require_session_owner(runtime, session_id, ctx.node_id)
    try:
        state = _session_service(runtime).publish_signal_ice(
            session_id,
            payload.role,
            payload.viewer_id,
            payload.candidate.model_dump(mode="python"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LiveSignalStateResponse(**state)


@router.get("/{session_id}/signal", response_model=LiveSignalStateResponse)
async def get_live_signal_state(
    session_id: str,
    viewer_id: str | None = None,
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSignalStateResponse:
    try:
        state = _session_service(runtime).get_signal_state(session_id, viewer_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LiveSignalStateResponse(**state)


@router.get("/{session_id}/preview/latest")
async def preview_latest_chunk(
    session_id: str,
    runtime: AppRuntime = Depends(get_runtime),
) -> FileResponse:
    """Return latest chunk bytes for low-fi live preview polling.

    Example:
        curl -v http://localhost:8787/api/live_sessions/sess-123/preview/latest
    """

    registry = runtime.services.live_session_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="Live session registry is unavailable")
    try:
        session = registry.require(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    chunk_path = session.latest_chunk_path
    if not chunk_path or not Path(chunk_path).exists():
        raise HTTPException(status_code=404, detail="No preview available")

    return FileResponse(
        chunk_path,
        media_type="video/webm",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )
