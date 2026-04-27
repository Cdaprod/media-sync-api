"""LAN-first WebRTC signaling endpoints.

Example:
    curl -X POST http://localhost:8787/api/live/sess-1/offer \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-1","offer":{"type":"offer","sdp":"v=0"}}'
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.runtime import get_runtime
from app.runtime.live_sessions import WebRtcLiveSession, WebRtcLiveSessionRegistry
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/live", tags=["live-webrtc"])
"""Route ownership:
- Audience: Explorer/operator read + browser WebRTC signaling.
- Auth boundary: browser same-origin gateway/Caddy operator boundary; viewer reads stay non-node-bearer.
- State owner: runtime.live_sessions / WebRtcLiveSessionRegistry.
- Naming policy: /api/live is browser WebRTC signaling transport, not durable capture lifecycle.
"""


class LiveOfferPayload(BaseModel):
    node_id: str
    offer: dict[str, Any]


class LiveAnswerPayload(BaseModel):
    answer: dict[str, Any]


class LiveIcePayload(BaseModel):
    candidate: dict[str, Any]


class LiveViewerStatePayload(BaseModel):
    state: str


class LiveWebRtcSessionResponse(BaseModel):
    session_id: str
    node_id: str
    has_offer: bool = False
    has_answer: bool = False
    viewer_count: int = 0
    viewer_ids: list[str] = Field(default_factory=list)
    state: str
    connection_states: dict[str, str] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class LiveWebRtcSessionListResponse(BaseModel):
    sessions: list[LiveWebRtcSessionResponse] = Field(default_factory=list)




def _serialize_live_session(session: WebRtcLiveSession) -> dict[str, Any]:
    has_offer = session.offer is not None
    has_answer = bool(session.answers)
    viewer_ids = sorted(session.answers.keys())
    viewer_count = len(viewer_ids)
    if has_offer and viewer_count == 0:
        state = "waiting_for_answer"
    elif has_offer and viewer_count > 0:
        state = "connected"
    else:
        state = "inactive"
    return {
        "session_id": session.session_id,
        "node_id": session.node_id,
        "has_offer": has_offer,
        "has_answer": has_answer,
        "viewer_count": viewer_count,
        "viewer_ids": viewer_ids,
        "state": state,
        "connection_states": dict(session.connection_states),
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }

def _registry(runtime: AppRuntime) -> WebRtcLiveSessionRegistry:
    registry = runtime.live_sessions
    if not isinstance(registry, WebRtcLiveSessionRegistry):
        raise HTTPException(status_code=503, detail="live_registry_unavailable")
    return registry


def _emit_event(runtime: AppRuntime, event_type: str, payload: dict[str, object]) -> None:
    bus = getattr(runtime, "events", None)
    if bus is None or not hasattr(bus, "emit"):
        return
    bus.emit(event_type, payload)


@router.post("/{session_id}/offer")
async def publish_offer(
    session_id: str,
    payload: LiveOfferPayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None:
        session = registry.create(session_id=session_id, node_id=payload.node_id)
    elif session.node_id != payload.node_id:
        raise HTTPException(status_code=409, detail="session_node_mismatch")
    registry.set_offer(session_id, payload.offer)
    _emit_event(runtime, "live.offer", {"session_id": session_id, "node_id": session.node_id})
    return {"ok": True, "session_id": session_id, "node_id": session.node_id}


@router.get("/{session_id}/offer")
async def fetch_offer(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, Any]:
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None or session.offer is None:
        raise HTTPException(status_code=404, detail="offer_not_found")
    return session.offer


@router.post("/{session_id}/answer")
async def publish_answer(
    session_id: str,
    payload: LiveAnswerPayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    return await publish_viewer_answer(session_id, "default", payload, runtime)


@router.post("/{session_id}/viewers/{viewer_id}/answer")
async def publish_viewer_answer(
    session_id: str,
    viewer_id: str,
    payload: LiveAnswerPayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    normalized_viewer_id = (viewer_id or "default").strip() or "default"
    registry.set_answer(session_id, payload.answer, normalized_viewer_id)
    _emit_event(runtime, "live.answer", {"session_id": session_id, "viewer_id": normalized_viewer_id})
    return {"ok": True, "session_id": session_id, "viewer_id": normalized_viewer_id}


@router.get("/{session_id}/answer")
async def fetch_answer(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, Any]:
    return await fetch_viewer_answer(session_id, "default", runtime)


@router.get("/{session_id}/viewers/{viewer_id}/answer")
async def fetch_viewer_answer(
    session_id: str,
    viewer_id: str,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, Any]:
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="answer_not_found")
    answer = registry.get_answer(session_id, viewer_id)
    if answer is None:
        raise HTTPException(status_code=404, detail="answer_not_found")
    return {"answer": answer}


@router.post("/{session_id}/ice/device")
async def publish_device_ice(
    session_id: str,
    payload: LiveIcePayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    registry = _registry(runtime)
    if registry.get(session_id) is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    registry.add_device_ice(session_id, payload.candidate)
    return {"ok": True, "session_id": session_id}


@router.get("/{session_id}/ice/device")
async def fetch_device_ice(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, Any]:
    registry = _registry(runtime)
    if registry.get(session_id) is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    return {"candidates": registry.list_device_ice(session_id)}


@router.post("/{session_id}/viewers/{viewer_id}/ice")
async def publish_viewer_ice(
    session_id: str,
    viewer_id: str,
    payload: LiveIcePayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    registry = _registry(runtime)
    if registry.get(session_id) is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    normalized_viewer_id = (viewer_id or "default").strip() or "default"
    registry.add_viewer_ice(session_id, normalized_viewer_id, payload.candidate)
    return {"ok": True, "session_id": session_id, "viewer_id": normalized_viewer_id}


@router.get("/{session_id}/viewers/{viewer_id}/ice")
async def fetch_viewer_ice(
    session_id: str,
    viewer_id: str,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, Any]:
    registry = _registry(runtime)
    if registry.get(session_id) is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    normalized_viewer_id = (viewer_id or "default").strip() or "default"
    return {"viewer_id": normalized_viewer_id, "candidates": registry.list_viewer_ice(session_id, normalized_viewer_id)}


@router.post("/{session_id}/viewers/{viewer_id}/state")
async def publish_viewer_state(
    session_id: str,
    viewer_id: str,
    payload: LiveViewerStatePayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    registry = _registry(runtime)
    if registry.get(session_id) is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    normalized_viewer_id = (viewer_id or "default").strip() or "default"
    registry.set_connection_state(session_id, normalized_viewer_id, payload.state)
    return {"ok": True, "session_id": session_id, "viewer_id": normalized_viewer_id}


@router.get("", response_model=LiveWebRtcSessionListResponse)
async def list_live_sessions(runtime: AppRuntime = Depends(get_runtime)) -> LiveWebRtcSessionListResponse:
    registry = _registry(runtime)
    sessions = [LiveWebRtcSessionResponse(**_serialize_live_session(session)) for session in registry.list()]
    return LiveWebRtcSessionListResponse(sessions=sessions)


@router.delete("/{session_id}")
async def delete_live_session(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, object]:
    registry = _registry(runtime)
    deleted = registry.delete(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="session_not_found")
    return {"ok": True, "deleted": True, "session_id": session_id}
