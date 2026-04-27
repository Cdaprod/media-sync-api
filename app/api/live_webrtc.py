"""LAN-first WebRTC signaling endpoints.

Example:
    curl -X POST http://localhost:8787/api/live/sess-1/offer \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-1","offer":{"type":"offer","sdp":"v=0"}}'
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.runtime import get_runtime
from app.runtime.live_sessions import WebRtcLiveSession, WebRtcLiveSessionRegistry
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/live", tags=["live-webrtc"])


class LiveOfferPayload(BaseModel):
    node_id: str
    offer: dict[str, Any]


class LiveAnswerPayload(BaseModel):
    answer: dict[str, Any]




def _serialize_live_session(session: WebRtcLiveSession) -> dict[str, Any]:
    has_offer = session.offer is not None
    has_answer = session.answer is not None
    if has_offer and not has_answer:
        state = "waiting_for_answer"
    elif has_offer and has_answer:
        state = "connected"
    else:
        state = "inactive"
    return {
        "session_id": session.session_id,
        "node_id": session.node_id,
        "has_offer": has_offer,
        "has_answer": has_answer,
        "state": state,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }

def _registry(runtime: AppRuntime) -> WebRtcLiveSessionRegistry:
    registry = runtime.live_sessions
    if not isinstance(registry, WebRtcLiveSessionRegistry):
        raise HTTPException(status_code=503, detail="live_registry_unavailable")
    return registry


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
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    registry.set_answer(session_id, payload.answer)
    return {"ok": True, "session_id": session_id}


@router.get("/{session_id}/answer")
async def fetch_answer(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, Any]:
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None or session.answer is None:
        raise HTTPException(status_code=404, detail="answer_not_found")
    return {"answer": session.answer}


@router.get("")
async def list_live_sessions(runtime: AppRuntime = Depends(get_runtime)) -> dict[str, list[dict[str, Any]]]:
    registry = _registry(runtime)
    sessions = [_serialize_live_session(session) for session in registry.list()]
    return {"sessions": sessions}


@router.delete("/{session_id}")
async def delete_live_session(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, object]:
    registry = _registry(runtime)
    deleted = registry.delete(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="session_not_found")
    return {"ok": True, "deleted": True, "session_id": session_id}
