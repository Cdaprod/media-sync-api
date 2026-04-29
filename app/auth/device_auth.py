"""Device authentication scaffolding.

Example
-------
Build and scope-check an authenticated node context::

    from app.auth.device_auth import build_device_auth_context, require_scope
    from app.auth.node_tokens import issue_node_token

    issued = issue_node_token()
    auth = build_device_auth_context(
        node_id="capture-node-1",
        token=issued.token,
        stored_token_hash=issued.token_hash,
        scopes=["ingest:write"],
    )
    require_scope(auth, "ingest:write")
"""

from dataclasses import dataclass, field
from typing import Iterable

from fastapi import Header, HTTPException, status

from app.auth.node_tokens import verify_node_token


@dataclass(frozen=True)
class DeviceAuthContext:
    node_id: str
    token: str
    scopes: set[str] = field(default_factory=set)

    def can(self, scope: str) -> bool:
        return scope in self.scopes or "*" in self.scopes


def extract_bearer_token(authorization: str | None) -> str:
    raw = (authorization or "").strip()
    if not raw:
        return ""
    scheme, _, value = raw.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return value.strip()


def require_scope(auth: DeviceAuthContext, required: str) -> None:
    if not auth.can(required):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "insufficient_device_scope",
                "required": required,
                "node_id": auth.node_id,
            },
        )


def build_device_auth_context(
    *,
    node_id: str,
    token: str,
    stored_token_hash: str,
    scopes: Iterable[str],
) -> DeviceAuthContext:
    if not verify_node_token(token, stored_token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_device_token",
        )

    return DeviceAuthContext(
        node_id=node_id,
        token=token,
        scopes=set(scopes),
    )


def require_device_bearer_headers(
    authorization: str | None = Header(default=None),
    x_media_sync_node_id: str | None = Header(default=None),
) -> tuple[str, str]:
    token = extract_bearer_token(authorization)
    node_id = (x_media_sync_node_id or "").strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing_device_bearer_token",
        )

    if not node_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing_x_media_sync_node_id",
        )

    return node_id, token
