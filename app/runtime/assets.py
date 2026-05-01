"""Runtime in-memory representation-plane assets.

Example:
    registry = RuntimeAssetRegistry()
    registry.upsert(RuntimeAsset(id='rt-1', kind='recording', state='recording'))
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

RuntimeAssetState = Literal['pending', 'staging', 'previewable', 'recording', 'materializing', 'ready', 'failed']
RuntimeAssetKind = Literal['compose', 'recording', 'live', 'upload']


class RuntimeAsset(BaseModel):
    id: str
    kind: RuntimeAssetKind
    state: RuntimeAssetState
    project: str | None = None
    source: str | None = None
    target_dir: str | None = None
    session_id: str | None = None
    recording_id: str | None = None
    run_id: str | None = None
    node_id: str | None = None
    source_kind: str | None = None
    preview_url: str | None = None
    thumb_url: str | None = None
    asset_url: str | None = None
    progress: float | None = None
    error: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RuntimeAssetRegistry:
    def __init__(self) -> None:
        self._assets: dict[str, RuntimeAsset] = {}

    def upsert(self, asset: RuntimeAsset) -> RuntimeAsset:
        self._assets[asset.id] = asset
        return asset

    def get(self, asset_id: str) -> RuntimeAsset | None:
        return self._assets.get((asset_id or '').strip())

    def list(self, project: str | None = None, source: str | None = None, state: RuntimeAssetState | None = None) -> list[RuntimeAsset]:
        items = list(self._assets.values())
        if project:
            items = [i for i in items if i.project == project]
        if source:
            items = [i for i in items if i.source == source]
        if state:
            items = [i for i in items if i.state == state]
        return sorted(items, key=lambda i: i.updated_at, reverse=True)

    def transition(self, asset_id: str, state: RuntimeAssetState, **patch: object) -> RuntimeAsset:
        current = self.get(asset_id)
        if current is None:
            raise KeyError(asset_id)
        payload = current.model_dump()
        payload.update(patch)
        payload['state'] = state
        payload['updated_at'] = datetime.now(timezone.utc)
        asset = RuntimeAsset(**payload)
        self._assets[asset_id] = asset
        return asset

    def fail(self, asset_id: str, error: str) -> RuntimeAsset:
        return self.transition(asset_id, 'failed', error=error)

    def remove(self, asset_id: str) -> bool:
        return self._assets.pop((asset_id or '').strip(), None) is not None
