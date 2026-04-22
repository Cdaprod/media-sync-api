"""Runtime dependencies for FastAPI route injection.

Example:
    @router.get('/whoami')
    async def whoami(runtime: AppRuntime = Depends(get_runtime)):
        return {'node_id': runtime.identity.node_id}
"""

from __future__ import annotations

from fastapi import Request

from app.runtime.types import AppRuntime


def get_runtime(request: Request) -> AppRuntime:
    """Return app runtime from FastAPI state."""

    runtime = getattr(request.app.state, "runtime", None)
    if runtime is None:
        raise RuntimeError("App runtime is not initialized")
    return runtime
