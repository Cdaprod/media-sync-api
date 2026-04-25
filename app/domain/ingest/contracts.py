"""API contracts for ingest claim submission and query.

Example:
    payload = SubmitAssetClaimRequest(
        node_id='runner-1', source_name='primary', kind='file', local_ref='/mnt/a.mov', materialization_mode='upload'
    )
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.ingest.models import AcceptanceStatus, CandidateKind, ClaimStatus, MaterializationMode


class SubmitAssetClaimRequest(BaseModel):
    node_id: str = Field(min_length=1)
    source_name: str = Field(min_length=1)
    kind: CandidateKind
    local_ref: str = Field(min_length=1)
    materialization_mode: MaterializationMode
    fingerprint: str | None = None
    content_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    metadata: dict[str, str] = Field(default_factory=dict)


class AcceptanceReportResponse(BaseModel):
    claim_id: str
    status: AcceptanceStatus
    claim_status: ClaimStatus
    decision_reason: str
    canonical_asset_id: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    decided_at: str


class SubmitAssetClaimResponse(BaseModel):
    claim_id: str
    status: ClaimStatus
    node_id: str
    source_name: str
    kind: CandidateKind
    local_ref: str
    materialization_mode: MaterializationMode
    fingerprint: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    acceptance: AcceptanceReportResponse
