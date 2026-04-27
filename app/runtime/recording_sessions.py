"""In-memory runtime registry for recording sessions.

Example:
    registry = RecordingSessionRegistry()
    registry.create(RecordingSession(recording_id="rec-1", session_id="sess-1", node_id="node-a", project="demo"))
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.recording_session import RecordingSession, RecordingSessionState


class RecordingSessionRegistry:
    def __init__(self):
        self._sessions: dict[str, RecordingSession] = {}

    def create(self, session: RecordingSession) -> RecordingSession:
        self._sessions[session.recording_id] = session
        return session

    def get(self, recording_id: str) -> RecordingSession | None:
        return self._sessions.get((recording_id or "").strip())

    def require(self, recording_id: str) -> RecordingSession:
        session = self.get(recording_id)
        if session is None:
            raise KeyError(recording_id)
        return session

    def list(self) -> list[RecordingSession]:
        return sorted(
            self._sessions.values(),
            key=lambda item: item.updated_at,
            reverse=True,
        )

    def update_state(self, recording_id: str, state: RecordingSessionState, **updates) -> RecordingSession:
        session = self.require(recording_id)
        data = session.model_dump() if hasattr(session, "model_dump") else session.dict()
        data.update(updates)
        data["state"] = state
        data["updated_at"] = datetime.now(timezone.utc)
        updated = RecordingSession(**data)
        self._sessions[recording_id] = updated
        return updated

    def delete(self, recording_id: str) -> bool:
        return self._sessions.pop((recording_id or "").strip(), None) is not None

