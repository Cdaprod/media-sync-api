"""Runtime-backed recording session API.

Example:
    curl -X POST http://localhost:8787/api/recordings/start \
      -H 'Content-Type: application/json' \
      -d '{"session_id":"sess-1","node_id":"node-a","project":"Demo"}'
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.recording_session import RecordingSession
from app.runtime import get_runtime
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/recordings", tags=["recordings"])


class RecordingSessionResponse(BaseModel):
    recording: RecordingSession


class RecordingSessionListResponse(BaseModel):
    recordings: list[RecordingSession]


class RecordingStartRequest(BaseModel):
    session_id: str
    node_id: str
    project: str
    source: str = "primary"
    target_dir: str = "ingest/live"
    recording_id: str | None = None


class RecordingCompleteRequest(BaseModel):
    asset_url: str | None = None
    filename: str | None = None


class RecordingFailRequest(BaseModel):
    error: str


def _require_registry(runtime: AppRuntime):
    registry = getattr(runtime, "recording_sessions", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="Recording session registry is unavailable")
    return registry


@router.get("", response_model=RecordingSessionListResponse)
async def list_recording_sessions(runtime: AppRuntime = Depends(get_runtime)) -> RecordingSessionListResponse:
    registry = _require_registry(runtime)
    return RecordingSessionListResponse(recordings=registry.list())


@router.post("/start", response_model=RecordingSessionResponse)
async def start_recording_session(
    payload: RecordingStartRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> RecordingSessionResponse:
    registry = _require_registry(runtime)
    recording_id = (payload.recording_id or f"rec-{uuid.uuid4().hex}").strip()
    session = RecordingSession(
        recording_id=recording_id,
        session_id=payload.session_id.strip(),
        node_id=payload.node_id.strip(),
        project=payload.project.strip(),
        source=(payload.source or "primary").strip() or "primary",
        target_dir=(payload.target_dir or "ingest/live").strip() or "ingest/live",
        state="recording",
    )
    return RecordingSessionResponse(recording=registry.create(session))


@router.post("/{recording_id}/complete", response_model=RecordingSessionResponse)
async def complete_recording_session(
    recording_id: str,
    payload: RecordingCompleteRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> RecordingSessionResponse:
    registry = _require_registry(runtime)
    try:
        updated = registry.update_state(
            recording_id,
            "completed",
            asset_url=payload.asset_url,
            filename=payload.filename,
            error=None,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Recording session not found: {recording_id}") from exc
    return RecordingSessionResponse(recording=updated)


@router.post("/{recording_id}/fail", response_model=RecordingSessionResponse)
async def fail_recording_session(
    recording_id: str,
    payload: RecordingFailRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> RecordingSessionResponse:
    registry = _require_registry(runtime)
    try:
        updated = registry.update_state(
            recording_id,
            "failed",
            error=(payload.error or "").strip() or "Recording failed.",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Recording session not found: {recording_id}") from exc
    return RecordingSessionResponse(recording=updated)


@router.delete("/{recording_id}")
async def delete_recording_session(
    recording_id: str,
    runtime: AppRuntime = Depends(get_runtime),
):
    registry = _require_registry(runtime)
    deleted = registry.delete(recording_id)
    return {"ok": True, "recording_id": recording_id, "deleted": deleted}

