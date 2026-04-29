"""Runtime lifecycle controller for node status and stale-data sweeps.

Example:
    controller = RuntimeLifecycleController(runtime, RuntimeLifecycleSettings())
    await controller.start()
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger("media_sync_api.runtime.lifecycle")


@dataclass(frozen=True, slots=True)
class RuntimeLifecycleSettings:
    """Configuration for periodic runtime lifecycle sweeps."""

    enabled: bool = True
    sweep_interval_seconds: int = 60
    node_offline_after_seconds: int = 180
    node_stale_after_seconds: int = 900
    prune_claims_after_seconds: int = 86400
    prune_claim_statuses: tuple[str, ...] = ("materialization_pending", "failed")


class RuntimeLifecycleController:
    """Periodic lifecycle sweeper for runtime node/claim state transitions."""

    def __init__(self, runtime: Any, settings: RuntimeLifecycleSettings):
        self.runtime = runtime
        self.settings = settings
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if not self.settings.enabled:
            logger.info("lifecycle_disabled")
            return
        if self.running:
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="runtime-lifecycle")
        logger.info("lifecycle_started")

    async def stop(self) -> None:
        self._stop_event.set()
        task = self._task
        self._task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("lifecycle_stopped")

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.sweep_once()
            except Exception:
                logger.exception("lifecycle_sweep_error")
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.settings.sweep_interval_seconds)
            except asyncio.TimeoutError:
                continue

    async def sweep_once(self) -> dict[str, int]:
        now = datetime.now(timezone.utc)

        node_updates = self._sweep_nodes(now)
        pruned_nodes = self._prune_stale_ephemeral_nodes(now)
        pruned_claims = self._prune_stale_claims(now)

        result = {
            "node_updates": node_updates,
            "pruned_nodes": pruned_nodes,
            "pruned_claims": pruned_claims,
        }
        logger.info("lifecycle_sweep_result %s", result)
        return result

    def _sweep_nodes(self, now: datetime) -> int:
        registry = getattr(getattr(self.runtime, "services", None), "node_registry", None)
        if registry is None:
            return 0

        updates = 0
        for node in registry.list_all():
            heartbeat_at = self._parse_iso(getattr(node, "last_heartbeat_at", None))
            if heartbeat_at is None:
                continue
            age_seconds = (now - heartbeat_at).total_seconds()
            next_status = "offline" if age_seconds > self.settings.node_offline_after_seconds else "online"
            if node.status == next_status:
                continue
            registry.upsert(node.model_copy(update={"status": next_status}))
            updates += 1
        return updates

    def _prune_stale_ephemeral_nodes(self, now: datetime) -> int:
        registry = getattr(getattr(self.runtime, "services", None), "node_registry", None)
        if registry is None:
            return 0

        removed = 0
        cutoff = now - timedelta(seconds=self.settings.node_stale_after_seconds)
        for node in registry.list_all():
            if not node.ephemeral:
                continue
            heartbeat_at = self._parse_iso(getattr(node, "last_heartbeat_at", None))
            if heartbeat_at is None or heartbeat_at >= cutoff:
                continue
            if registry.delete_node(node.node_id):
                removed += 1
        return removed

    def _prune_stale_claims(self, now: datetime) -> int:
        service = getattr(getattr(self.runtime, "services", None), "ingest_claim_service", None)
        if service is None:
            return 0
        cutoff = now - timedelta(seconds=self.settings.prune_claims_after_seconds)
        return int(service.prune_claims(older_than=cutoff, statuses=set(self.settings.prune_claim_statuses)))

    @staticmethod
    def _parse_iso(raw: str | None) -> datetime | None:
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
