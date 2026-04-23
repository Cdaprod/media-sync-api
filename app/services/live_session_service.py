"""Runtime live session orchestration service.

Example:
    session = service.start_session(node_id="runner-a", source_kind="camera")
    service.accept_chunk(session_id=session.session_id, chunk_bytes=b"...", mime_type="video/webm")
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.domain.ingest.contracts import SubmitAssetClaimRequest
from app.domain.live_sessions.models import LiveSession, LiveSessionControlAction, LiveSourceKind
from app.runtime.live_sessions import LiveSessionRegistry


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_str_metadata(metadata: dict[str, Any]) -> dict[str, str]:
    return {key: str(value) for key, value in metadata.items()}


class LiveSessionService:
    """Runtime-owned live session service."""

    def __init__(
        self,
        *,
        session_registry: LiveSessionRegistry,
        spool_root: Path,
        ingest_claim_service: Any | None = None,
    ) -> None:
        self.session_registry = session_registry
        self.spool_root = Path(spool_root).expanduser().resolve()
        self.ingest_claim_service = ingest_claim_service

    def start_session(
        self,
        *,
        node_id: str,
        source_kind: LiveSourceKind,
        metadata: dict[str, Any] | None = None,
    ) -> LiveSession:
        now = _utc_now_iso()
        session_id = f"sess-{uuid.uuid4().hex}"
        session = LiveSession(
            session_id=session_id,
            node_id=node_id,
            source_kind=source_kind,
            status="previewing",
            started_at=now,
            last_heartbeat_at=now,
            chunk_count=0,
            claim_id=None,
            latest_chunk_path=None,
            desired_action=None,
            last_control_at=None,
            metadata=dict(metadata or {}),
        )
        return self.session_registry.upsert(session)

    def heartbeat(self, session_id: str) -> LiveSession:
        session = self.session_registry.require(session_id)
        updated = LiveSession(
            session_id=session.session_id,
            node_id=session.node_id,
            source_kind=session.source_kind,
            status=session.status,
            started_at=session.started_at,
            last_heartbeat_at=_utc_now_iso(),
            chunk_count=session.chunk_count,
            claim_id=session.claim_id,
            latest_chunk_path=session.latest_chunk_path,
            desired_action=session.desired_action,
            last_control_at=session.last_control_at,
            metadata=dict(session.metadata),
        )
        return self.session_registry.upsert(updated)

    def accept_chunk(
        self,
        *,
        session_id: str,
        chunk_bytes: bytes,
        mime_type: str | None,
    ) -> Path:
        session = self.session_registry.require(session_id)
        chunk_dir = self.spool_root / "live_sessions" / session_id
        chunk_dir.mkdir(parents=True, exist_ok=True)

        ext = ".webm"
        normalized = (mime_type or "").lower()
        if "mp4" in normalized:
            ext = ".mp4"

        next_index = session.chunk_count + 1
        chunk_path = chunk_dir / f"chunk-{next_index:05d}{ext}"
        chunk_path.write_bytes(chunk_bytes)

        updated_status = "recording" if session.status in {"previewing", "recording"} else session.status
        updated = LiveSession(
            session_id=session.session_id,
            node_id=session.node_id,
            source_kind=session.source_kind,
            status=updated_status,
            started_at=session.started_at,
            last_heartbeat_at=_utc_now_iso(),
            chunk_count=next_index,
            claim_id=session.claim_id,
            latest_chunk_path=str(chunk_path),
            desired_action=session.desired_action,
            last_control_at=session.last_control_at,
            metadata=dict(session.metadata),
        )
        self.session_registry.upsert(updated)
        return chunk_path

    def control_session(self, session_id: str, action: LiveSessionControlAction) -> LiveSession:
        session = self.session_registry.require(session_id)
        updated = LiveSession(
            session_id=session.session_id,
            node_id=session.node_id,
            source_kind=session.source_kind,
            status=session.status,
            started_at=session.started_at,
            last_heartbeat_at=session.last_heartbeat_at,
            chunk_count=session.chunk_count,
            claim_id=session.claim_id,
            latest_chunk_path=session.latest_chunk_path,
            desired_action=action,
            last_control_at=_utc_now_iso(),
            metadata=dict(session.metadata),
        )
        return self.session_registry.upsert(updated)

    def get_latest_chunk(self, session_id: str) -> bytes | None:
        session = self.session_registry.require(session_id)
        if not session.latest_chunk_path:
            return None
        path = Path(session.latest_chunk_path)
        if not path.exists():
            return None
        return path.read_bytes()

    def get_latest_chunk_payload(self, session_id: str) -> tuple[bytes, str] | None:
        session = self.session_registry.require(session_id)
        if not session.latest_chunk_path:
            return None
        path = Path(session.latest_chunk_path)
        if not path.exists():
            return None
        content_type = "video/webm" if path.suffix.lower() == ".webm" else "video/mp4"
        return path.read_bytes(), content_type

    def end_session(self, session_id: str) -> LiveSession:
        session = self.session_registry.require(session_id)

        claim_id: str | None = session.claim_id
        if self.ingest_claim_service is not None and session.latest_chunk_path:
            latest_path = Path(session.latest_chunk_path)
            content_type = "video/webm" if latest_path.suffix == ".webm" else "video/mp4"
            claim_request = SubmitAssetClaimRequest(
                node_id=session.node_id,
                source_name="primary",
                kind="file",
                local_ref=str(latest_path),
                materialization_mode="upload",
                content_type=content_type,
                size_bytes=latest_path.stat().st_size if latest_path.exists() else None,
                metadata=_as_str_metadata(
                    {
                        **session.metadata,
                        "session_id": session.session_id,
                        "source_kind": session.source_kind,
                        "transport": "mediarecorder-chunk",
                    }
                ),
            )
            report = self.ingest_claim_service.submit_claim(claim_request)
            claim_id = report.claim_id

        ended = LiveSession(
            session_id=session.session_id,
            node_id=session.node_id,
            source_kind=session.source_kind,
            status="ended",
            started_at=session.started_at,
            last_heartbeat_at=_utc_now_iso(),
            chunk_count=session.chunk_count,
            claim_id=claim_id,
            latest_chunk_path=session.latest_chunk_path,
            desired_action=session.desired_action,
            last_control_at=session.last_control_at,
            metadata=dict(session.metadata),
        )
        return self.session_registry.upsert(ended)
