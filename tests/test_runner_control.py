from __future__ import annotations

import asyncio
from pathlib import Path

from app.runtime.runner_control import RunnerControlPlane
from app.runtime.source_records import build_primary_source_record
from app.runtime.types import (
    AppRuntime,
    RuntimeCapabilities,
    RuntimeIdentity,
    RuntimePaths,
    RuntimeServices,
)


class FakeUpstreamClient:
    def __init__(self) -> None:
        self.register_calls = 0
        self.heartbeat_calls = 0

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None

    async def register_self(self, runtime: AppRuntime):
        self.register_calls += 1
        return {"ok": True, "node_id": runtime.identity.node_id}

    async def heartbeat_self(self, runtime: AppRuntime):
        self.heartbeat_calls += 1
        return {"ok": True, "node_id": runtime.identity.node_id}


class DummySettings:
    node_base_url = "http://127.0.0.1:8787"


def _run(coro):
    return asyncio.run(coro)


def test_runner_control_registers_and_heartbeats(tmp_path: Path):
    upstream = FakeUpstreamClient()
    runtime = AppRuntime(
        identity=RuntimeIdentity(
            runtime_id="runner-test-1",
            role="runner",
            node_id="runner-test",
            node_name="runner-test-host",
            instance_name="Runner Test",
        ),
        paths=RuntimePaths(
            data_root=tmp_path / "data",
            temp_root=tmp_path / "temp",
            cache_root=tmp_path / "cache",
            spool_root=tmp_path / "spool",
            logs_root=tmp_path / "logs",
        ),
        settings=DummySettings(),
        logger=None,
        capabilities=RuntimeCapabilities(
            can_index_local_sources=True,
            can_stage_uploads=True,
            can_compose_media=False,
            can_proxy_streams=True,
            can_record_local_media=True,
            can_publish_canonical_library=False,
            can_push_upstream=True,
            can_accept_node_registrations=False,
            can_serve_live_assets=True,
        ),
        services=RuntimeServices(
            source_registry=None,
            node_registry=None,
            source_adapters=None,
            library_service=None,
            compose_service=None,
            upload_service=None,
            upstream_client=upstream,
            runner_control=None,
            auto_reindexer=None,
        ),
        metadata={
            "runtime_version": "0.1.0",
            "source_records": [
                build_primary_source_record(
                    project_root=tmp_path / "data",
                    owner_node_id="runner-test",
                    runtime_role="runner",
                )
            ],
        },
    )

    control = RunnerControlPlane(runtime=runtime, heartbeat_interval_seconds=1)
    runtime.services.runner_control = control

    async def _exercise() -> None:
        await runtime.start()
        await asyncio.sleep(5.2)
        await runtime.stop()

    _run(_exercise())

    assert upstream.register_calls == 1
    assert upstream.heartbeat_calls >= 1
