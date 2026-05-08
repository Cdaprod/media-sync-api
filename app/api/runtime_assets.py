"""Runtime asset representation API.

Example:
    curl http://localhost:8787/api/runtime/assets
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.runtime import get_runtime
from app.runtime.assets import RuntimeAsset
from app.runtime.types import AppRuntime

router = APIRouter(prefix='/api/runtime/assets', tags=['runtime-assets'])


def _registry(runtime: AppRuntime):
    registry = getattr(runtime, 'assets', None)
    if registry is None:
        raise HTTPException(status_code=503, detail='runtime_assets_unavailable')
    return registry


@router.get('')
async def list_runtime_assets(
    project: str | None = None,
    source: str | None = None,
    state: str | None = None,
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, list[RuntimeAsset]]:
    registry = _registry(runtime)
    return {'assets': registry.list(project=project, source=source, state=state)}


@router.get('/stream')
async def stream_runtime_assets() -> StreamingResponse:
    async def _iter():
        yield 'event: heartbeat\ndata: {"ok": true}\n\n'
    return StreamingResponse(_iter(), media_type='text/event-stream')


@router.get('/{asset_id}')
async def get_runtime_asset(asset_id: str, runtime: AppRuntime = Depends(get_runtime)) -> RuntimeAsset:
    asset = _registry(runtime).get(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail='runtime_asset_not_found')
    return asset
