"""Runtime-backed bearer auth dependencies for registered device nodes.

Example
-------
Protect a mutation route using node scopes::

    from fastapi import APIRouter, Depends
    from app.auth.runtime_device_auth import RuntimeDeviceAuthContext, require_device_scope

    router = APIRouter()

    @router.post('/api/protected')
    def protected(ctx: RuntimeDeviceAuthContext = Depends(require_device_scope('ingest:write'))):
        return {'node_id': ctx.node_id}
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from fastapi import Depends, Header, HTTPException, Request, status

from app.auth.device_auth import DeviceAuthContext, extract_bearer_token
from app.auth.node_tokens import verify_node_token


@dataclass(frozen=True)
class RuntimeDeviceAuthContext:
    node_id: str
    token_preview: str | None
    scopes: set[str]
    node: Any

    def can(self, scope: str) -> bool:
        return scope in self.scopes or "*" in self.scopes


def _get_runtime(request: Request) -> Any:
    runtime = getattr(request.app.state, "runtime", None)
    if runtime is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="runtime_not_available",
        )
    return runtime


def _get_node_registry(runtime: Any) -> Any:
    services = getattr(runtime, "services", None)
    registry = getattr(services, "node_registry", None) if services is not None else None
    if registry is None:
        registry = getattr(runtime, "node_registry", None)
    if registry is None:
        registry = getattr(runtime, "nodes", None)
    if registry is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="node_registry_not_available",
        )
    return registry


def _lookup_node(registry: Any, node_id: str) -> Any | None:
    if hasattr(registry, "get_node"):
        return registry.get_node(node_id)
    if hasattr(registry, "get"):
        return registry.get(node_id)
    if hasattr(registry, "nodes"):
        nodes = getattr(registry, "nodes")
        if isinstance(nodes, dict):
            return nodes.get(node_id)
    return None


def _read_attr(obj: Any, name: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _normalize_scopes(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        return {value} if value else set()
    if isinstance(value, Iterable):
        return {str(item) for item in value if str(item)}
    return set()


def require_registered_node(
    request: Request,
    authorization: str | None = Header(default=None),
    x_media_sync_node_id: str | None = Header(default=None),
) -> RuntimeDeviceAuthContext:
    token = extract_bearer_token(authorization)
    node_id = (x_media_sync_node_id or "").strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing_device_bearer_token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not node_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing_x_media_sync_node_id",
            headers={"WWW-Authenticate": "Bearer"},
        )

    runtime = _get_runtime(request)
    registry = _get_node_registry(runtime)
    node = _lookup_node(registry, node_id)

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unknown_node",
            headers={"WWW-Authenticate": "Bearer"},
        )

    enabled = bool(_read_attr(node, "enabled", True))
    if not enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="node_disabled",
        )

    token_hash = _read_attr(node, "token_hash", None)
    if not token_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="node_has_no_bearer_credential",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_node_token(token, token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_device_token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scopes = _normalize_scopes(_read_attr(node, "auth_scopes", []))
    return RuntimeDeviceAuthContext(
        node_id=node_id,
        token_preview=_read_attr(node, "token_preview", None),
        scopes=scopes,
        node=node,
    )


def require_device_scope(scope: str):
    def dependency(ctx: RuntimeDeviceAuthContext = Depends(require_registered_node)) -> RuntimeDeviceAuthContext:
        if not ctx.can(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "insufficient_device_scope",
                    "required": scope,
                    "node_id": ctx.node_id,
                },
            )
        return ctx

    return dependency


def to_legacy_context(ctx: RuntimeDeviceAuthContext) -> DeviceAuthContext:
    return DeviceAuthContext(
        node_id=ctx.node_id,
        token="",
        scopes=set(ctx.scopes),
    )
