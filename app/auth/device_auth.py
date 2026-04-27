"""Device authentication scaffolding.

Example
-------
Use in a route dependency without changing existing route auth behavior yet::

    from fastapi import Depends
    from app.auth.device_auth import DeviceAuthContext, require_device_auth

    @app.post("/api/ingest/claims")
    def create_claim(auth: DeviceAuthContext = Depends(require_device_auth)):
        return {"node_id": auth.node_id, "scopes": sorted(auth.scopes)}
"""

from dataclasses import dataclass

from fastapi import Header, HTTPException


@dataclass(frozen=True)
class DeviceAuthContext:
    """Resolved device identity from bearer token + node header."""

    node_id: str
    scopes: set[str]


def require_device_auth(
    authorization: str | None = Header(default=None),
    x_media_sync_node_id: str | None = Header(default=None),
) -> DeviceAuthContext:
    """Validate baseline device auth headers and return auth context.

    This is intentionally minimal scaffolding. Token verification against a
    persisted node-token registry should be added in a later pass.
    """

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_device_token")
    if not x_media_sync_node_id:
        raise HTTPException(status_code=401, detail="missing_node_id")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="invalid_device_token")

    return DeviceAuthContext(
        node_id=x_media_sync_node_id,
        scopes={"ingest:write", "live:write"},
    )
