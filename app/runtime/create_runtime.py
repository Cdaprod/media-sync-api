"""Runtime assembly functions for media-sync-api.

Example:
    runtime = create_runtime()
    await runtime.start()
"""

from __future__ import annotations

import socket
import uuid
from pathlib import Path

from app.config import get_settings
from app.runtime.ingest_registry import IngestClaimRegistry
from app.runtime.lifecycle import RuntimeLifecycleController, RuntimeLifecycleSettings
from app.runtime.live_sessions import LiveSessionRegistry, WebRtcLiveSessionRegistry
from app.runtime.nodes import NodeRegistry
from app.runtime.recording_sessions import RecordingSessionRegistry
from app.runtime.runner_control import RunnerControlPlane
from app.runtime.source_records import build_primary_source_record
from app.runtime.types import (
    AppRuntime,
    RuntimeCapabilities,
    RuntimeIdentity,
    RuntimePaths,
    RuntimeServices,
)
from app.runtime.upstream import ControlPlaneClient
from app.services.ingest_claim_service import IngestClaimService
from app.services.library_service import LibraryService
from app.services.live_session_service import LiveSessionService
from app.storage.auto_reindex import AutoReindexer
from app.storage.sources import SourceRegistry


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def build_registries(data_root: Path) -> dict[str, object]:
    """Create persisted registries used by runtime services."""

    return {
        "source_registry": SourceRegistry(data_root),
        "node_registry": NodeRegistry(data_root),
        "ingest_registry": IngestClaimRegistry(data_root),
        "live_session_registry": LiveSessionRegistry(),
    }


def build_services(
    *,
    settings,
    data_root: Path,
    source_registry: SourceRegistry,
    node_registry: NodeRegistry,
    ingest_registry: IngestClaimRegistry,
    live_session_registry: LiveSessionRegistry,
    spool_root: Path,
    role: str,
    node_id: str,
) -> tuple[RuntimeServices, list[object]]:
    """Create long-lived service objects for runtime composition."""

    reindexer = AutoReindexer(
        data_root,
        interval_seconds=settings.auto_reindex_interval_seconds,
        enabled=settings.auto_reindex_enabled,
    )

    upstream_client = None
    if role == "runner" and settings.control_plane_url and settings.runner_register_enabled:
        upstream_client = ControlPlaneClient(
            base_url=settings.control_plane_url,
            token=settings.upstream_token,
        )

    source_records = [
        build_primary_source_record(
            project_root=data_root,
            owner_node_id=node_id,
            runtime_role=role,
        )
    ]

    ingest_claim_service = IngestClaimService(ingest_registry=ingest_registry, runtime_role=role)
    live_session_service = LiveSessionService(
        session_registry=live_session_registry,
        spool_root=spool_root,
        ingest_claim_service=ingest_claim_service,
    )

    services = RuntimeServices(
        source_registry=source_registry,
        node_registry=node_registry,
        source_adapters=None,
        library_service=LibraryService(source_registry=source_registry),
        ingest_registry=ingest_registry,
        ingest_claim_service=ingest_claim_service,
        live_session_registry=live_session_registry,
        live_session_service=live_session_service,
        compose_service=None,
        upload_service=None,
        upstream_client=upstream_client,
        runner_control=None,
        auto_reindexer=reindexer,
    )
    return services, source_records


def create_runtime() -> AppRuntime:
    """Build the single process-owned runtime object."""

    settings = get_settings()

    role = settings.runtime_role if settings.runtime_role in {"authority", "runner"} else "authority"
    node_name = socket.gethostname()
    runtime_id = f"{role}-{uuid.uuid4().hex[:12]}"
    node_id = settings.node_id or f"{role}-{node_name}"

    data_root = _ensure_dir(Path(settings.project_root).expanduser().resolve())
    temp_root = _ensure_dir(Path(settings.temp_root).expanduser().resolve())
    cache_root = _ensure_dir(Path(settings.cache_root).expanduser().resolve())
    spool_root = _ensure_dir(Path(settings.spool_root).expanduser().resolve())
    logs_root = _ensure_dir(Path(settings.logs_root).expanduser().resolve())

    registries = build_registries(data_root)
    source_registry = registries["source_registry"]
    node_registry = registries["node_registry"]
    ingest_registry = registries["ingest_registry"]
    live_session_registry = registries["live_session_registry"]
    assert isinstance(source_registry, SourceRegistry)
    assert isinstance(node_registry, NodeRegistry)
    assert isinstance(ingest_registry, IngestClaimRegistry)
    assert isinstance(live_session_registry, LiveSessionRegistry)

    services, source_records = build_services(
        settings=settings,
        data_root=data_root,
        source_registry=source_registry,
        node_registry=node_registry,
        ingest_registry=ingest_registry,
        live_session_registry=live_session_registry,
        spool_root=spool_root,
        role=role,
        node_id=node_id,
    )

    capabilities = RuntimeCapabilities(
        can_index_local_sources=True,
        can_stage_uploads=True,
        can_compose_media=True,
        can_proxy_streams=True,
        can_record_local_media=(role == "runner"),
        can_publish_canonical_library=(role == "authority"),
        can_push_upstream=(role == "runner"),
        can_accept_node_registrations=(role == "authority"),
        can_serve_live_assets=(role == "runner"),
    )

    runtime = AppRuntime(
        identity=RuntimeIdentity(
            runtime_id=runtime_id,
            role=role,
            node_id=node_id,
            node_name=node_name,
            instance_name=settings.instance_name,
        ),
        paths=RuntimePaths(
            data_root=data_root,
            temp_root=temp_root,
            cache_root=cache_root,
            spool_root=spool_root,
            logs_root=logs_root,
        ),
        settings=settings,
        logger=None,
        capabilities=capabilities,
        services=services,
        metadata={
            "runtime_version": "0.1.0",
            "boot_role": role,
            "node_id": node_id,
            "node_name": node_name,
            "source_records": source_records,
            "remote_source_records": [],
        },
    )
    runtime.live_sessions = WebRtcLiveSessionRegistry()
    runtime.recording_sessions = RecordingSessionRegistry()
    runtime.lifecycle = RuntimeLifecycleController(runtime=runtime, settings=RuntimeLifecycleSettings())

    if role == "runner" and services.upstream_client is not None:
        runtime.services.runner_control = RunnerControlPlane(runtime=runtime)

    return runtime
