"""Ingest domain models for node-observed asset claims.

Example:
    candidate = AssetCandidate(node_id='runner-1', source_name='primary', kind='file', local_ref='/tmp/a.mov')
    claim = IngestClaim.from_candidate(candidate, materialization_mode='upload')
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

CandidateKind = Literal["file", "stream", "capture-session", "compose-output", "virtual"]
ClaimStatus = Literal[
    "observed",
    "submitted",
    "materialization_pending",
    "under_review",
    "accepted",
    "accepted_duplicate",
    "rejected",
    "expired",
]
AcceptanceStatus = Literal[
    "accepted",
    "accepted_duplicate",
    "rejected_invalid",
    "rejected_policy",
    "deferred_materialization",
    "deferred_pending_review",
]
MaterializationMode = Literal["upload", "shared-path", "pull", "stream-ref"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class AssetCandidate:
    """A local observation from a node that is not canonical yet."""

    node_id: str
    source_name: str
    kind: CandidateKind
    local_ref: str
    fingerprint: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    metadata: dict[str, str] = field(default_factory=dict)
    candidate_id: str = field(default_factory=lambda: f"cand_{uuid4().hex}")
    observed_at: str = field(default_factory=_utc_now)


@dataclass(slots=True)
class IngestClaim:
    """A persisted claim sent to authority for canonical acceptance consideration."""

    claim_id: str
    candidate_id: str
    node_id: str
    source_name: str
    kind: CandidateKind
    local_ref: str
    materialization_mode: MaterializationMode
    fingerprint: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    status: ClaimStatus = "submitted"
    metadata: dict[str, str] = field(default_factory=dict)
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)

    @classmethod
    def from_candidate(cls, candidate: AssetCandidate, *, materialization_mode: MaterializationMode) -> "IngestClaim":
        return cls(
            claim_id=f"claim_{uuid4().hex}",
            candidate_id=candidate.candidate_id,
            node_id=candidate.node_id,
            source_name=candidate.source_name,
            kind=candidate.kind,
            local_ref=candidate.local_ref,
            materialization_mode=materialization_mode,
            fingerprint=candidate.fingerprint,
            content_type=candidate.content_type,
            size_bytes=candidate.size_bytes,
            status="submitted",
            metadata=dict(candidate.metadata),
            created_at=_utc_now(),
            updated_at=_utc_now(),
        )


@dataclass(slots=True)
class AcceptanceReport:
    """Authority-side decision or deferral for an ingest claim."""

    claim_id: str
    status: AcceptanceStatus
    claim_status: ClaimStatus
    decision_reason: str
    canonical_asset_id: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)
    decided_at: str = field(default_factory=_utc_now)
