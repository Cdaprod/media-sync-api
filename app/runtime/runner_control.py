"""Runner control loop for self-registration and heartbeat.

Example:
    control = RunnerControlPlane(runtime=runtime, heartbeat_interval_seconds=30)
    await control.start()
    await control.stop()
"""

from __future__ import annotations

import asyncio
import logging

from app.runtime.types import AppRuntime

logger = logging.getLogger("media_sync_api.runtime.runner_control")


class RunnerControlPlane:
    """Background self-registration + heartbeat loop for runner runtimes."""

    def __init__(
        self,
        *,
        runtime: AppRuntime,
        heartbeat_interval_seconds: int = 30,
    ) -> None:
        self.runtime = runtime
        self.heartbeat_interval_seconds = max(5, int(heartbeat_interval_seconds))
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run(), name=f"runner-control:{self.runtime.identity.node_id}")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stop_event.set()
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        upstream = self.runtime.services.upstream_client
        if upstream is None:
            return

        try:
            await upstream.register_self(self.runtime)
            self.runtime.metadata["last_registration_ok"] = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("runner_register_failed", extra={"detail": str(exc)})
            self.runtime.metadata["last_registration_ok"] = False

        while not self._stop_event.is_set():
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.heartbeat_interval_seconds)
                break
            except asyncio.TimeoutError:
                pass

            try:
                await upstream.heartbeat_self(self.runtime)
                self.runtime.metadata["last_heartbeat_ok"] = True
            except Exception as exc:  # noqa: BLE001
                logger.warning("runner_heartbeat_failed", extra={"detail": str(exc)})
                self.runtime.metadata["last_heartbeat_ok"] = False
