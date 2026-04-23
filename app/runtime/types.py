"""Runtime composition types for media-sync-api.

Example:
    from app.runtime.types import AppRuntime
    runtime: AppRuntime
    await runtime.start()
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

RuntimeRole = Literal["authority", "runner"]


@dataclass(slots=True)
class RuntimeIdentity:
    """Stable identity for the current backend process."""

    runtime_id: str
    role: RuntimeRole
    node_id: str
    node_name: str
    instance_name: str | None = None


@dataclass(slots=True)
class RuntimePaths:
    """Long-lived process paths managed by the runtime."""

    data_root: Path
    temp_root: Path
    cache_root: Path
    spool_root: Path
    logs_root: Path


@dataclass(slots=True)
class RuntimeCapabilities:
    """Feature declarations for the active runtime process."""

    can_index_local_sources: bool = True
    can_stage_uploads: bool = True
    can_compose_media: bool = True
    can_proxy_streams: bool = True
    can_record_local_media: bool = False
    can_publish_canonical_library: bool = True
    can_push_upstream: bool = False
    can_accept_node_registrations: bool = False
    can_serve_live_assets: bool = False


@dataclass(slots=True)
class RuntimeServices:
    """Long-lived service container owned by AppRuntime."""

    source_registry: Any
    node_registry: Any | None = None
    source_adapters: Any | None = None
    library_service: Any | None = None
    ingest_registry: Any | None = None
    ingest_claim_service: Any | None = None
    live_session_registry: Any | None = None
    live_session_service: Any | None = None
    compose_service: Any | None = None
    upload_service: Any | None = None
    upstream_client: Any | None = None
    runner_control: Any | None = None
    auto_reindexer: Any | None = None


@dataclass(slots=True)
class AppRuntime:
    """Single process composition root built at startup."""

    identity: RuntimeIdentity
    paths: RuntimePaths
    settings: Any
    logger: Any
    capabilities: RuntimeCapabilities
    services: RuntimeServices
    metadata: dict[str, Any] = field(default_factory=dict)
    started: bool = False

    async def start(self) -> None:
        """Start runtime-owned resources."""

        if self.started:
            return

        for path in (
            self.paths.data_root,
            self.paths.temp_root,
            self.paths.cache_root,
            self.paths.spool_root,
            self.paths.logs_root,
        ):
            path.mkdir(parents=True, exist_ok=True)

        upstream = self.services.upstream_client
        if upstream is not None:
            await upstream.start()

        runner_control = self.services.runner_control
        if runner_control is not None:
            await runner_control.start()

        self.metadata.setdefault("boot_role", self.identity.role)
        self.metadata.setdefault("node_id", self.identity.node_id)
        self.metadata.setdefault("node_name", self.identity.node_name)
        self.started = True

    async def stop(self) -> None:
        """Stop runtime-owned resources."""

        if not self.started:
            return

        runner_control = self.services.runner_control
        if runner_control is not None:
            await runner_control.stop()

        upstream = self.services.upstream_client
        if upstream is not None:
            await upstream.stop()
        self.started = False
