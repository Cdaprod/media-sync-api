"""LAN-first WebRTC signaling endpoints.

Example:
    curl -X POST http://localhost:8787/api/live/sess-1/offer \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-1","offer":{"type":"offer","sdp":"v=0"}}'
"""

from __future__ import annotations

from typing import Any
from datetime import datetime, timedelta, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.runtime import get_runtime
from app.runtime.live_sessions import WebRtcLiveSession, WebRtcLiveSessionRegistry
from app.runtime.types import AppRuntime
from app.models.recording_session import RecordingSession
from app.runtime.assets import RuntimeAsset

router = APIRouter(prefix="/api/live", tags=["live-webrtc"])
"""Route ownership:
- Audience: Explorer/operator read + browser WebRTC signaling.
- Auth boundary: browser same-origin gateway/Caddy operator boundary; viewer reads stay non-node-bearer.
- State owner: runtime.live_sessions / WebRtcLiveSessionRegistry.
- Naming policy: /api/live is browser WebRTC signaling transport, not durable capture lifecycle.
"""


WEBRTC_LIVE_SESSION_TTL_SECONDS = 60


def _parse_utc_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


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
    recording_count: int = 0
    active_recording_id: str | None = None
    recording_state: str | None = None
    asset_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class LiveWebRtcSessionListResponse(BaseModel):
    sessions: list[LiveWebRtcSessionResponse] = Field(default_factory=list)


class LiveRecordStartPayload(BaseModel):
    project: str = "Live"
    source: str = "primary"
    target_dir: str = "ingest/live"
    recording_id: str | None = None


class LiveRecordStopPayload(BaseModel):
    error: str | None = None


def _assets_registry(runtime: AppRuntime):
    registry = getattr(runtime, "assets", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="runtime_assets_unavailable")
    return registry


def _recordings_registry(runtime: AppRuntime):
    registry = getattr(runtime, "recording_sessions", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="recording_registry_unavailable")
    return registry


def _active_recording_for_session(runtime: AppRuntime, session_id: str):
    registry = _recordings_registry(runtime)
    for rec in registry.list():
        if rec.session_id == session_id and rec.state in {"recording", "stopping", "uploading"}:
            return rec
    return None

def _serialize_live_session(session: WebRtcLiveSession, runtime: AppRuntime | None = None) -> dict[str, Any]:
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
    active_recording = _active_recording_for_session(runtime, session.session_id) if runtime is not None else None
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
        "recording_count": 1 if active_recording else 0,
        "active_recording_id": active_recording.recording_id if active_recording else None,
        "recording_state": active_recording.state if active_recording else None,
        "asset_url": active_recording.asset_url if active_recording else None,
    }

def _registry(runtime: AppRuntime) -> WebRtcLiveSessionRegistry:
    registry = runtime.live_sessions
    if not isinstance(registry, WebRtcLiveSessionRegistry):
        raise HTTPException(status_code=503, detail="live_registry_unavailable")
    return registry




def _prune_stale_live_sessions(runtime: AppRuntime) -> list[str]:
    service = runtime.services.live_session_service
    if service is None:
        return []
    pruned_ids = service.prune_stale_sessions()
    registry = runtime.live_sessions
    if isinstance(registry, WebRtcLiveSessionRegistry):
        for session_id in pruned_ids:
            registry.delete(session_id)
    return pruned_ids


def _session_is_durable_inactive(runtime: AppRuntime, session_id: str) -> bool:
    registry = runtime.services.live_session_registry
    if registry is None:
        return False
    session = registry.get(session_id)
    return bool(session and (not session.is_active or dict(session.metadata).get("superseded_by_session_id")))


def _prune_orphaned_webrtc_sessions(runtime: AppRuntime) -> list[str]:
    registry = _registry(runtime)
    current = datetime.now(timezone.utc)
    cutoff = current - timedelta(seconds=WEBRTC_LIVE_SESSION_TTL_SECONDS)
    removed: list[str] = []
    for session in list(registry.list()):
        updated_at = _parse_utc_iso(session.updated_at)
        durable_inactive = _session_is_durable_inactive(runtime, session.session_id)
        transport_stale = updated_at is None or updated_at < cutoff
        if not durable_inactive and not transport_stale:
            continue
        registry.delete(session.session_id)
        removed.append(session.session_id)
    return removed

def _emit_event(runtime: AppRuntime, event_type: str, payload: dict[str, object]) -> None:
    bus = getattr(runtime, "events", None)
    if bus is None:
        return
    if hasattr(bus, "publish"):
        bus.publish(event_type, payload)
        return
    if hasattr(bus, "emit"):
        bus.emit(event_type, payload)


@router.post("/{session_id}/offer")
async def publish_offer(
    session_id: str,
    payload: LiveOfferPayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    _prune_stale_live_sessions(runtime)
    registry = _registry(runtime)
    for existing in list(registry.list()):
        if existing.session_id != session_id and existing.node_id == payload.node_id:
            registry.delete(existing.session_id)
    session = registry.get(session_id)
    if session is None:
        session = registry.create(session_id=session_id, node_id=payload.node_id)
    elif session.node_id != payload.node_id:
        raise HTTPException(status_code=409, detail="session_node_mismatch")
    registry.set_offer(session_id, payload.offer)
    _assets_registry(runtime).upsert(RuntimeAsset(
        id=f"runtime-live-{session_id}",
        kind="live",
        state="previewable",
        session_id=session_id,
        node_id=session.node_id,
        source_kind="camera",
        project="Live",
        source="primary",
        metadata={"session_id": session_id, "node_id": session.node_id},
    ))
    _emit_event(runtime, "live_session.updated", {"session_id": session_id, "node_id": session.node_id, "action": "offer_published"})
    _emit_event(runtime, "runtime_asset.updated", {"asset_id": f"runtime-live-{session_id}", "state": "previewable"})
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
    _prune_stale_live_sessions(runtime)
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    normalized_viewer_id = (viewer_id or "default").strip() or "default"
    registry.set_answer(session_id, payload.answer, normalized_viewer_id)
    _emit_event(runtime, "live_session.updated", {"session_id": session_id, "viewer_id": normalized_viewer_id, "action": "viewer_answer"})
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
    _emit_event(runtime, "live_session.updated", {"session_id": session_id, "action": "device_ice"})
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
    _emit_event(runtime, "live_session.updated", {"session_id": session_id, "viewer_id": normalized_viewer_id, "action": "viewer_ice"})
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
    _emit_event(runtime, "live_session.updated", {"session_id": session_id, "viewer_id": normalized_viewer_id, "state": payload.state, "action": "viewer_state"})
    return {"ok": True, "session_id": session_id, "viewer_id": normalized_viewer_id}


@router.get("", response_model=LiveWebRtcSessionListResponse)
async def list_live_sessions(runtime: AppRuntime = Depends(get_runtime)) -> LiveWebRtcSessionListResponse:
    _prune_stale_live_sessions(runtime)
    _prune_orphaned_webrtc_sessions(runtime)
    registry = _registry(runtime)
    sessions = [LiveWebRtcSessionResponse(**_serialize_live_session(session, runtime)) for session in registry.list()]
    return LiveWebRtcSessionListResponse(sessions=sessions)




@router.post("/{session_id}/record/start")
async def start_live_recording(
    session_id: str,
    payload: LiveRecordStartPayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    _prune_stale_live_sessions(runtime)
    registry = _registry(runtime)
    session = registry.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    recording_registry = _recordings_registry(runtime)
    active = _active_recording_for_session(runtime, session_id)
    if active is not None:
        return {"recording": active.model_dump(mode="json"), "idempotent": True}
    recording_id = (payload.recording_id or f"rec-{uuid.uuid4().hex}").strip()
    recording = RecordingSession(
        recording_id=recording_id,
        session_id=session_id,
        node_id=session.node_id,
        state="recording",
        project=(payload.project or "Live").strip() or "Live",
        source=(payload.source or "primary").strip() or "primary",
        target_dir=(payload.target_dir or "ingest/live").strip() or "ingest/live",
    )
    recording_registry.create(recording)
    _assets_registry(runtime).upsert(RuntimeAsset(
        id=f"runtime-recording-{recording.recording_id}",
        kind="recording",
        state="recording",
        project=recording.project,
        source=recording.source,
        target_dir=recording.target_dir,
        session_id=recording.session_id,
        recording_id=recording.recording_id,
        node_id=recording.node_id,
        source_kind="camera",
        metadata={"session_id": recording.session_id, "recording_id": recording.recording_id},
    ))
    _emit_event(runtime, "recording.updated", {"recording_id": recording.recording_id, "session_id": session_id, "state": "recording"})
    _emit_event(runtime, "runtime_asset.updated", {"asset_id": f"runtime-recording-{recording.recording_id}", "state": "recording"})
    return {"recording": recording.model_dump(mode="json"), "idempotent": False}


@router.post("/{session_id}/record/stop")
async def stop_live_recording(
    session_id: str,
    payload: LiveRecordStopPayload,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    active = _active_recording_for_session(runtime, session_id)
    if active is None:
        raise HTTPException(status_code=404, detail="recording_not_found")
    registry = _recordings_registry(runtime)
    assets = _assets_registry(runtime)

    if payload.error:
        updated = registry.update_state(
            active.recording_id,
            "failed",
            error=payload.error,
            updated_at=datetime.now(timezone.utc),
        )
        assets.fail(f"runtime-recording-{updated.recording_id}", str(payload.error))
        _emit_event(runtime, "recording.updated", {"recording_id": updated.recording_id, "session_id": session_id, "state": "failed"})
        _emit_event(runtime, "runtime_asset.updated", {"asset_id": f"runtime-recording-{updated.recording_id}", "state": "failed"})
        return {"recording": updated.model_dump(mode="json")}

    assets.transition(f"runtime-recording-{active.recording_id}", "materializing")
    if active.asset_url:
        updated = registry.update_state(
            active.recording_id,
            "completed",
            error=None,
            updated_at=datetime.now(timezone.utc),
        )
        assets.transition(f"runtime-recording-{updated.recording_id}", "ready", asset_url=updated.asset_url, error=None)
        _emit_event(runtime, "recording.updated", {"recording_id": updated.recording_id, "session_id": session_id, "state": "completed"})
        _emit_event(runtime, "runtime_asset.updated", {"asset_id": f"runtime-recording-{updated.recording_id}", "state": "ready"})
        return {"recording": updated.model_dump(mode="json")}

    updated = registry.update_state(
        active.recording_id,
        "failed",
        error="recording_not_materialized",
        updated_at=datetime.now(timezone.utc),
    )
    assets.fail(f"runtime-recording-{updated.recording_id}", "recording_not_materialized")
    _emit_event(runtime, "recording.updated", {"recording_id": updated.recording_id, "session_id": session_id, "state": "failed"})
    _emit_event(runtime, "runtime_asset.updated", {"asset_id": f"runtime-recording-{updated.recording_id}", "state": "failed"})
    return {"recording": updated.model_dump(mode="json")}


@router.get("/{session_id}/recordings")
async def list_live_recordings(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, object]:
    _registry(runtime).require(session_id)
    registry = _recordings_registry(runtime)
    records = [r.model_dump(mode="json") for r in registry.list() if r.session_id == session_id]
    return {"recordings": records}

@router.delete("/{session_id}")
async def delete_live_session(session_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, object]:
    registry = _registry(runtime)
    deleted = registry.delete(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="session_not_found")
    _assets_registry(runtime).remove(f"runtime-live-{session_id}")
    _emit_event(runtime, "live_session.updated", {"session_id": session_id, "action": "deleted"})
    _emit_event(runtime, "runtime_asset.updated", {"asset_id": f"runtime-live-{session_id}", "state": "removed"})
    return {"ok": True, "deleted": True, "session_id": session_id}
