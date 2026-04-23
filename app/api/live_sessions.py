"""Live media session API.

Example:
    curl -X POST http://localhost:8787/api/live_sessions/start \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-a","source_kind":"camera"}'
"""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.domain.live_sessions.models import LiveSessionControlAction, LiveSourceKind
from app.runtime import get_runtime
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/live_sessions", tags=["live_sessions"])


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


class LiveSessionControlRequest(BaseModel):
    action: LiveSessionControlAction


class LiveSessionControlAckRequest(BaseModel):
    action: LiveSessionControlAction


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


@router.post("/start", response_model=LiveSessionResponse)
async def start_live_session(
    payload: StartLiveSessionRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSessionResponse:
    _ensure_node(runtime, payload.node_id)
    session = _session_service(runtime).start_session(
        node_id=payload.node_id,
        source_kind=payload.source_kind,
        metadata=payload.metadata,
    )
    return LiveSessionResponse(**asdict(session))


@router.post("/{session_id}/heartbeat", response_model=LiveSessionResponse)
async def heartbeat_live_session(
    session_id: str,
    runtime: AppRuntime = Depends(get_runtime),
) -> LiveSessionResponse:
    try:
        session = _session_service(runtime).heartbeat(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LiveSessionResponse(**asdict(session))


@router.post("/{session_id}/chunk")
async def upload_live_session_chunk(
    session_id: str,
    request: Request,
    runtime: AppRuntime = Depends(get_runtime),
):
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
    runtime: AppRuntime = Depends(get_runtime),
) -> EndLiveSessionResponse:
    try:
        session = _session_service(runtime).end_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    payload = LiveSessionResponse(**asdict(session))
    return EndLiveSessionResponse(session=payload, claim_id=session.claim_id)


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
    runtime: AppRuntime = Depends(get_runtime),
) -> JSONResponse:
    try:
        session = _session_service(runtime).control_session(session_id, payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return JSONResponse({"ok": True, "action": payload.action, "session_id": session.session_id})


@router.post("/{session_id}/control/ack")
async def acknowledge_live_session_control(
    session_id: str,
    payload: LiveSessionControlAckRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> JSONResponse:
    try:
        session = _session_service(runtime).acknowledge_control_action(session_id, payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return JSONResponse({"ok": True, "action": payload.action, "session_id": session.session_id})


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
