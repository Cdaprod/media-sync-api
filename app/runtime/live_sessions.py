"""Runtime in-memory live session registry.

Example:
    registry = LiveSessionRegistry()
    registry.upsert(session)
"""

from __future__ import annotations

from app.domain.live_sessions.models import LiveSession


class LiveSessionRegistry:
    """Runtime-owned in-memory live session registry."""

    def __init__(self) -> None:
        self._sessions: dict[str, LiveSession] = {}

    def list_all(self) -> list[LiveSession]:
        return list(self._sessions.values())

    def list_active(self) -> list[LiveSession]:
        return [session for session in self._sessions.values() if session.is_active]

    def get(self, session_id: str) -> LiveSession | None:
        return self._sessions.get(session_id)

    def require(self, session_id: str) -> LiveSession:
        session = self.get(session_id)
        if session is None:
            raise ValueError(f"Live session '{session_id}' not found")
        return session

    def upsert(self, session: LiveSession) -> LiveSession:
        self._sessions[session.session_id] = session
        return session

    def end_session(self, session_id: str) -> LiveSession:
        session = self.require(session_id)
        if session.status != "ended":
            session = LiveSession(
                session_id=session.session_id,
                node_id=session.node_id,
                source_kind=session.source_kind,
                status="ended",
                started_at=session.started_at,
                last_heartbeat_at=session.last_heartbeat_at,
                chunk_count=session.chunk_count,
                claim_id=session.claim_id,
                latest_chunk_path=session.latest_chunk_path,
                metadata=dict(session.metadata),
            )
            self.upsert(session)
        return session
