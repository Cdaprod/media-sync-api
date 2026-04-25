"""Runtime live session domain models.

Example:
    session = LiveSession(
        session_id="sess-1",
        node_id="runner-a",
        source_kind="camera",
        status="previewing",
        started_at="2026-01-01T00:00:00+00:00",
        last_heartbeat_at="2026-01-01T00:00:00+00:00",
    )
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

LiveSourceKind = Literal["camera", "screen"]
LiveSessionStatus = Literal["idle", "previewing", "recording", "ended"]
LiveSessionControlAction = Literal["start_recording", "stop_recording"]


@dataclass(slots=True)
class LiveSession:
    """Single runtime-owned live capture session."""

    session_id: str
    node_id: str
    source_kind: LiveSourceKind
    status: LiveSessionStatus
    started_at: str
    last_heartbeat_at: str
    chunk_count: int = 0
    claim_id: str | None = None
    latest_chunk_path: str | None = None
    desired_action: LiveSessionControlAction | None = None
    last_control_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_active(self) -> bool:
        return self.status in {"previewing", "recording"}
