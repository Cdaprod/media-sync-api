"""Authority-side ingest claim intake service.

Example:
    response = service.submit_claim(request)
    print(response.acceptance.status)
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone

from app.domain.ingest.contracts import (
    AcceptanceReportResponse,
    SubmitAssetClaimRequest,
    SubmitAssetClaimResponse,
)
from app.domain.ingest.models import AcceptanceReport, AssetCandidate, IngestClaim
from app.runtime.ingest_registry import IngestClaimRegistry


class IngestClaimService:
    """Accept, persist, and classify ingest claims for authority runtimes."""

    def __init__(self, *, ingest_registry: IngestClaimRegistry, runtime_role: str):
        self.ingest_registry = ingest_registry
        self.runtime_role = runtime_role

    def submit_claim(self, payload: SubmitAssetClaimRequest) -> SubmitAssetClaimResponse:
        if self.runtime_role != "authority":
            raise PermissionError("Ingest claim intake is only available on authority runtimes")

        candidate = AssetCandidate(
            node_id=payload.node_id,
            source_name=payload.source_name,
            kind=payload.kind,
            local_ref=payload.local_ref,
            fingerprint=payload.fingerprint,
            content_type=payload.content_type,
            size_bytes=payload.size_bytes,
            metadata=payload.metadata,
        )
        claim = IngestClaim.from_candidate(candidate, materialization_mode=payload.materialization_mode)
        claim, acceptance = self._classify(claim)
        self.ingest_registry.upsert(claim)
        return self._to_response(claim, acceptance)

    def list_claims(self) -> list[IngestClaim]:
        return self.ingest_registry.list_all()

    def get_claim(self, claim_id: str) -> IngestClaim:
        return self.ingest_registry.require(claim_id)

    def _classify(self, claim: IngestClaim) -> tuple[IngestClaim, AcceptanceReport]:
        now = datetime.now(timezone.utc).isoformat()
        if claim.size_bytes is not None and claim.size_bytes < 0:
            rejected = replace(claim, status="rejected", updated_at=now)
            return rejected, AcceptanceReport(
                claim_id=claim.claim_id,
                status="rejected_invalid",
                claim_status="rejected",
                decision_reason="size_bytes must be non-negative",
            )

        if claim.materialization_mode in {"upload", "pull", "stream-ref"}:
            pending = replace(claim, status="materialization_pending", updated_at=now)
            return pending, AcceptanceReport(
                claim_id=claim.claim_id,
                status="deferred_materialization",
                claim_status="materialization_pending",
                decision_reason="Awaiting bytes/materialization verification",
            )

        under_review = replace(claim, status="under_review", updated_at=now)
        return under_review, AcceptanceReport(
            claim_id=claim.claim_id,
            status="deferred_pending_review",
            claim_status="under_review",
            decision_reason="Claim recorded and queued for authority review",
        )

    @staticmethod
    def _to_response(claim: IngestClaim, acceptance: AcceptanceReport) -> SubmitAssetClaimResponse:
        return SubmitAssetClaimResponse(
            claim_id=claim.claim_id,
            status=claim.status,
            node_id=claim.node_id,
            source_name=claim.source_name,
            kind=claim.kind,
            local_ref=claim.local_ref,
            materialization_mode=claim.materialization_mode,
            fingerprint=claim.fingerprint,
            content_type=claim.content_type,
            size_bytes=claim.size_bytes,
            metadata=claim.metadata,
            created_at=claim.created_at,
            updated_at=claim.updated_at,
            acceptance=AcceptanceReportResponse(
                claim_id=acceptance.claim_id,
                status=acceptance.status,
                claim_status=acceptance.claim_status,
                decision_reason=acceptance.decision_reason,
                canonical_asset_id=acceptance.canonical_asset_id,
                metadata=acceptance.metadata,
                decided_at=acceptance.decided_at,
            ),
        )
