"""Runtime in-memory live session registries.

Example:
    registry = LiveSessionRegistry()
    registry.upsert(session)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.domain.live_sessions.models import LiveSession

LIVE_SESSION_EXPIRY_SECONDS = 60


def _parse_utc_iso(raw: str) -> datetime | None:
    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class LiveSessionRegistry:
    """Runtime-owned in-memory live recording session registry."""

    def __init__(self) -> None:
        self._sessions: dict[str, LiveSession] = {}

    def list_all(self) -> list[LiveSession]:
        return list(self._sessions.values())

    def list_active(self) -> list[LiveSession]:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=LIVE_SESSION_EXPIRY_SECONDS)
        next_sessions: dict[str, LiveSession] = {}
        active: list[LiveSession] = []
        for session_id, session in self._sessions.items():
            if not session.is_active:
                next_sessions[session_id] = session
                continue
            last_heartbeat = _parse_utc_iso(session.last_heartbeat_at)
            if last_heartbeat is None or last_heartbeat < cutoff:
                continue
            next_sessions[session_id] = session
            active.append(session)
        self._sessions = next_sessions
        return active

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
                desired_action=session.desired_action,
                last_control_at=session.last_control_at,
                metadata=dict(session.metadata),
            )
            self.upsert(session)
        return session


@dataclass(slots=True)
class WebRtcLiveSession:
    """Runtime-owned lightweight WebRTC signaling session."""

    session_id: str
    node_id: str
    offer: dict | None = None
    answers: dict[str, dict] = field(default_factory=dict)
    viewer_ice: dict[str, list[dict]] = field(default_factory=dict)
    device_ice: list[dict] = field(default_factory=list)
    connection_states: dict[str, str] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def answer(self) -> dict | None:
        if "default" in self.answers:
            return self.answers["default"]
        for value in self.answers.values():
            return value
        return None


class WebRtcLiveSessionRegistry:
    """In-memory signaling registry for LAN-first WebRTC offer/answer exchange."""

    def __init__(self) -> None:
        self._sessions: dict[str, WebRtcLiveSession] = {}

    def create(self, session_id: str, node_id: str) -> WebRtcLiveSession:
        session = WebRtcLiveSession(session_id=session_id, node_id=node_id)
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> WebRtcLiveSession | None:
        return self._sessions.get(session_id)

    def require(self, session_id: str) -> WebRtcLiveSession:
        session = self.get(session_id)
        if session is None:
            raise ValueError(f"Live WebRTC session '{session_id}' not found")
        return session

    def set_offer(self, session_id: str, offer: dict) -> WebRtcLiveSession:
        session = self.require(session_id)
        session.offer = offer
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return session

    def set_answer(self, session_id: str, answer: dict, viewer_id: str = "default") -> WebRtcLiveSession:
        session = self.require(session_id)
        viewer_key = (viewer_id or "default").strip() or "default"
        session.answers[viewer_key] = answer
        session.connection_states.setdefault(viewer_key, "answer-posted")
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return session

    def get_answer(self, session_id: str, viewer_id: str = "default") -> dict | None:
        session = self.require(session_id)
        viewer_key = (viewer_id or "default").strip() or "default"
        if viewer_key in session.answers:
            return session.answers[viewer_key]
        return session.answer

    def add_device_ice(self, session_id: str, candidate: dict) -> WebRtcLiveSession:
        session = self.require(session_id)
        session.device_ice.append(candidate)
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return session

    def add_viewer_ice(self, session_id: str, viewer_id: str, candidate: dict) -> WebRtcLiveSession:
        session = self.require(session_id)
        viewer_key = (viewer_id or "default").strip() or "default"
        session.viewer_ice.setdefault(viewer_key, []).append(candidate)
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return session

    def list_device_ice(self, session_id: str) -> list[dict]:
        session = self.require(session_id)
        return list(session.device_ice)

    def list_viewer_ice(self, session_id: str, viewer_id: str = "default") -> list[dict]:
        session = self.require(session_id)
        viewer_key = (viewer_id or "default").strip() or "default"
        return list(session.viewer_ice.get(viewer_key, []))

    def set_connection_state(self, session_id: str, viewer_id: str, state: str) -> WebRtcLiveSession:
        session = self.require(session_id)
        viewer_key = (viewer_id or "default").strip() or "default"
        session.connection_states[viewer_key] = (state or "unknown").strip() or "unknown"
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return session

    def delete(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    def list(self) -> list[WebRtcLiveSession]:
        return list(self._sessions.values())
