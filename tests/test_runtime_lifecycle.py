from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.domain.ingest.models import IngestClaim
from app.runtime.ingest_registry import IngestClaimRegistry
from app.runtime.lifecycle import RuntimeLifecycleController, RuntimeLifecycleSettings
from app.runtime.nodes import NodeRecord, NodeRegistry
from app.services.ingest_claim_service import IngestClaimService


def _iso_ago(seconds: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()


def _runtime(tmp_path):
    node_registry = NodeRegistry(tmp_path)
    ingest_registry = IngestClaimRegistry(tmp_path)
    claim_service = IngestClaimService(ingest_registry=ingest_registry, runtime_role="authority")
    return SimpleNamespace(services=SimpleNamespace(node_registry=node_registry, ingest_claim_service=claim_service))


def test_lifecycle_start_is_idempotent_and_stops_cleanly(tmp_path):
    runtime = _runtime(tmp_path)
    controller = RuntimeLifecycleController(
        runtime,
        RuntimeLifecycleSettings(sweep_interval_seconds=600),
    )

    async def run():
        await controller.start()
        first_task = controller._task
        await controller.start()
        assert controller._task is first_task
        assert controller.running is True
        await controller.stop()
        assert controller.running is False

    asyncio.run(run())


def test_lifecycle_marks_recent_heartbeat_node_online(tmp_path):
    runtime = _runtime(tmp_path)
    registry: NodeRegistry = runtime.services.node_registry
    registry.upsert(
        NodeRecord(
            node_id="node-recent",
            label="Node Recent",
            base_url="http://127.0.0.1:8787",
            status="offline",
            last_heartbeat_at=_iso_ago(5),
        )
    )

    controller = RuntimeLifecycleController(
        runtime,
        RuntimeLifecycleSettings(node_offline_after_seconds=30, node_stale_after_seconds=300),
    )

    result = asyncio.run(controller.sweep_once())
    assert result["node_updates"] == 1
    assert registry.require("node-recent").status == "online"


def test_lifecycle_marks_stale_heartbeat_node_offline(tmp_path):
    runtime = _runtime(tmp_path)
    registry: NodeRegistry = runtime.services.node_registry
    registry.upsert(
        NodeRecord(
            node_id="node-stale",
            label="Node Stale",
            base_url="http://127.0.0.1:8788",
            status="online",
            last_heartbeat_at=_iso_ago(120),
        )
    )

    controller = RuntimeLifecycleController(
        runtime,
        RuntimeLifecycleSettings(node_offline_after_seconds=30, node_stale_after_seconds=3600),
    )

    asyncio.run(controller.sweep_once())
    assert registry.require("node-stale").status == "offline"


def test_lifecycle_prunes_stale_ephemeral_node(tmp_path):
    runtime = _runtime(tmp_path)
    registry: NodeRegistry = runtime.services.node_registry
    registry.upsert(
        NodeRecord(
            node_id="node-ephemeral-old",
            label="Node Ephemeral Old",
            base_url=None,
            metadata={"transport_hint": "session", "session_node": "true"},
            ephemeral=True,
            status="offline",
            last_heartbeat_at=_iso_ago(7200),
        )
    )

    controller = RuntimeLifecycleController(
        runtime,
        RuntimeLifecycleSettings(node_offline_after_seconds=60, node_stale_after_seconds=300),
    )

    result = asyncio.run(controller.sweep_once())
    assert result["pruned_nodes"] == 1
    assert registry.get_node("node-ephemeral-old") is None


def test_lifecycle_prunes_stale_pending_failed_claims_only(tmp_path):
    runtime = _runtime(tmp_path)
    registry: IngestClaimRegistry = runtime.services.ingest_claim_service.ingest_registry

    old = _iso_ago(20000)
    recent = _iso_ago(10)

    registry.upsert(
        IngestClaim(
            claim_id="claim-old-pending",
            candidate_id="cand-1",
            node_id="node-1",
            source_name="primary",
            kind="file",
            local_ref="/tmp/a.mp4",
            materialization_mode="upload",
            status="materialization_pending",
            created_at=old,
            updated_at=old,
        )
    )
    registry.upsert(
        IngestClaim(
            claim_id="claim-old-failed",
            candidate_id="cand-2",
            node_id="node-1",
            source_name="primary",
            kind="file",
            local_ref="/tmp/b.mp4",
            materialization_mode="upload",
            status="failed",  # runtime lifecycle supports this transitional status
            created_at=old,
            updated_at=old,
        )
    )
    registry.upsert(
        IngestClaim(
            claim_id="claim-old-review",
            candidate_id="cand-3",
            node_id="node-1",
            source_name="primary",
            kind="file",
            local_ref="/tmp/c.mp4",
            materialization_mode="upload",
            status="under_review",
            created_at=old,
            updated_at=old,
        )
    )
    registry.upsert(
        IngestClaim(
            claim_id="claim-recent-pending",
            candidate_id="cand-4",
            node_id="node-1",
            source_name="primary",
            kind="file",
            local_ref="/tmp/d.mp4",
            materialization_mode="upload",
            status="materialization_pending",
            created_at=recent,
            updated_at=recent,
        )
    )

    controller = RuntimeLifecycleController(
        runtime,
        RuntimeLifecycleSettings(
            prune_claims_after_seconds=3600,
            prune_claim_statuses=("materialization_pending", "failed"),
        ),
    )

    result = asyncio.run(controller.sweep_once())
    assert result["pruned_claims"] == 2

    claim_ids = {claim.claim_id for claim in registry.list_all()}
    assert "claim-old-pending" not in claim_ids
    assert "claim-old-failed" not in claim_ids
    assert "claim-old-review" in claim_ids
    assert "claim-recent-pending" in claim_ids
