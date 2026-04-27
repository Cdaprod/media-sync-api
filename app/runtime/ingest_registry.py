"""Persisted ingest-claim registry.

Example:
    registry = IngestClaimRegistry(Path('/data/projects'))
    registry.upsert(claim)
    print(registry.list_all())
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from app.domain.ingest.models import IngestClaim


class IngestClaimRegistry:
    """File-backed ingest-claim ledger stored per claim."""

    def __init__(self, data_root: Path):
        self.data_root = Path(data_root).expanduser().resolve()
        self.claims_dir = self.data_root / "_runtime" / "ingest_claims"
        self.claims_dir.mkdir(parents=True, exist_ok=True)

    def _claim_path(self, claim_id: str) -> Path:
        return self.claims_dir / f"{claim_id}.json"

    @staticmethod
    def _deserialize(payload: dict) -> IngestClaim:
        return IngestClaim(**payload)

    def upsert(self, claim: IngestClaim) -> IngestClaim:
        path = self._claim_path(claim.claim_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(claim), indent=2, sort_keys=True), encoding="utf-8")
        return claim

    def get(self, claim_id: str) -> IngestClaim | None:
        path = self._claim_path(claim_id)
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return None
        return self._deserialize(payload)

    def require(self, claim_id: str) -> IngestClaim:
        claim = self.get(claim_id)
        if claim is None:
            raise ValueError(f"Ingest claim '{claim_id}' not found")
        return claim

    def list_all(self) -> list[IngestClaim]:
        claims: list[IngestClaim] = []
        for path in sorted(self.claims_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    claims.append(self._deserialize(payload))
            except (json.JSONDecodeError, TypeError, ValueError):
                continue
        return claims

    def list_by_status(self, status: str) -> list[IngestClaim]:
        return [claim for claim in self.list_all() if claim.status == status]

    def remove(self, claim_id: str) -> bool:
        path = self._claim_path(claim_id)
        if not path.exists():
            return False
        path.unlink()
        return True

    def delete_claim(self, claim_id: str) -> bool:
        normalized = (claim_id or "").strip()
        if not normalized:
            return False
        return self.remove(normalized)

    def prune_claims(self, *, older_than_seconds: int, statuses: set[str] | None = None) -> list[str]:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(0, int(older_than_seconds)))
        allowed_statuses = set(statuses or set())
        removed: list[str] = []

        for claim in self.list_all():
            if allowed_statuses and claim.status not in allowed_statuses:
                continue
            try:
                updated_at = datetime.fromisoformat(claim.updated_at.replace("Z", "+00:00"))
            except ValueError:
                continue
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
            if updated_at < cutoff and self.remove(claim.claim_id):
                removed.append(claim.claim_id)

        return removed

    def bulk_upsert(self, claims: Iterable[IngestClaim]) -> None:
        for claim in claims:
            self.upsert(claim)
