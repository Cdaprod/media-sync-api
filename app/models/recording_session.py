from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


RecordingSessionState = Literal[
    "recording",
    "stopping",
    "uploading",
    "completed",
    "failed",
]


class RecordingSession(BaseModel):
    recording_id: str
    session_id: str
    node_id: str
    state: RecordingSessionState = "recording"

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    project: str
    source: str = "primary"
    target_dir: str = "ingest/live"

    filename: str | None = None
    asset_url: str | None = None
    error: str | None = None

