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
from app.runtime.nodes import NodeRegistry
from app.runtime.types import (
    AppRuntime,
    RuntimeCapabilities,
    RuntimeIdentity,
    RuntimePaths,
    RuntimeServices,
)
from app.services.library_service import LibraryService
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
    }


def build_services(*, settings, data_root: Path, source_registry: SourceRegistry, node_registry: NodeRegistry) -> RuntimeServices:
    """Create long-lived service objects for runtime composition."""

    reindexer = AutoReindexer(
        data_root,
        interval_seconds=settings.auto_reindex_interval_seconds,
        enabled=settings.auto_reindex_enabled,
    )
    return RuntimeServices(
        source_registry=source_registry,
        node_registry=node_registry,
        source_adapters=None,
        library_service=LibraryService(source_registry=source_registry),
        compose_service=None,
        upload_service=None,
        upstream_client=None,
        auto_reindexer=reindexer,
    )


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
    assert isinstance(source_registry, SourceRegistry)
    assert isinstance(node_registry, NodeRegistry)

    services = build_services(
        settings=settings,
        data_root=data_root,
        source_registry=source_registry,
        node_registry=node_registry,
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

    return AppRuntime(
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
        },
    )
