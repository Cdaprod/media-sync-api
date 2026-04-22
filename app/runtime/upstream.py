"""Async upstream control-plane client for runner registration.

Example:
    client = ControlPlaneClient(base_url='http://authority:8787')
    await client.start()
    await client.register_self(runtime)
    await client.stop()
"""

from __future__ import annotations

import logging
from dataclasses import asdict, is_dataclass
from typing import Any

import httpx

from app.runtime.types import AppRuntime

logger = logging.getLogger("media_sync_api.runtime.upstream")


class ControlPlaneClient:
    """Lightweight async client for authority node registration/heartbeat."""

    def __init__(
        self,
        *,
        base_url: str,
        token: str | None = None,
        timeout_seconds: float = 5.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        if self._client is not None:
            return
        headers: dict[str, str] = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=self.timeout_seconds,
        )

    async def stop(self) -> None:
        if self._client is None:
            return
        await self._client.aclose()
        self._client = None

    async def register_self(self, runtime: AppRuntime) -> dict[str, Any]:
        client = self._require_client()
        node_base_url = (runtime.settings.node_base_url or "").strip()
        payload = {
            "node_id": runtime.identity.node_id,
            "label": runtime.identity.instance_name or runtime.identity.node_name,
            "base_url": node_base_url,
            "roles": [runtime.identity.role],
            "capabilities": _runtime_capabilities(runtime),
            "source_name": "primary",
            "enabled": True,
            "status": "healthy" if runtime.started else "unknown",
            "version": runtime.metadata.get("runtime_version"),
            "advertised_source_kinds": _runtime_source_kinds(runtime),
            "ephemeral": runtime.identity.role == "runner",
            "metadata": {
                "runtime_id": runtime.identity.runtime_id,
                "node_name": runtime.identity.node_name,
            },
        }
        response = await client.post("/api/nodes", json=payload)
        response.raise_for_status()
        return response.json()

    async def heartbeat_self(self, runtime: AppRuntime) -> dict[str, Any]:
        client = self._require_client()
        response = await client.post(f"/api/nodes/{runtime.identity.node_id}/heartbeat")
        response.raise_for_status()
        return response.json()

    def _require_client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("ControlPlaneClient has not been started")
        return self._client


def _runtime_capabilities(runtime: AppRuntime) -> list[str]:
    raw_caps = asdict(runtime.capabilities) if is_dataclass(runtime.capabilities) else dict(vars(runtime.capabilities))
    return sorted(key for key, value in raw_caps.items() if value)


def _runtime_source_kinds(runtime: AppRuntime) -> list[str]:
    records = runtime.metadata.get("source_records", [])
    kinds = {str(getattr(record, "kind", "")) for record in records if getattr(record, "kind", None)}
    return sorted(kind for kind in kinds if kind)
