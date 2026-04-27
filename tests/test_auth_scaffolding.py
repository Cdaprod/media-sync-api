from fastapi import HTTPException

from app.auth.device_auth import DeviceAuthContext, require_device_auth
from app.auth.platform_credentials import PlatformCredentialRef, get_platform_credential


def test_require_device_auth_accepts_minimal_headers() -> None:
    auth = require_device_auth(
        authorization="Bearer test-token",
        x_media_sync_node_id="node-123",
    )

    assert isinstance(auth, DeviceAuthContext)
    assert auth.node_id == "node-123"
    assert auth.scopes == {"ingest:write", "live:write"}


def test_require_device_auth_rejects_missing_headers() -> None:
    try:
        require_device_auth(authorization=None, x_media_sync_node_id="node-1")
    except HTTPException as exc:
        assert exc.status_code == 401
        assert exc.detail == "missing_device_token"
    else:  # pragma: no cover - guard
        raise AssertionError("missing_device_token check should raise")

    try:
        require_device_auth(authorization="Bearer valid", x_media_sync_node_id=None)
    except HTTPException as exc:
        assert exc.status_code == 401
        assert exc.detail == "missing_node_id"
    else:  # pragma: no cover - guard
        raise AssertionError("missing_node_id check should raise")


def test_get_platform_credential_returns_reference_only() -> None:
    cred = get_platform_credential(owner_user="alice", platform="YouTube")

    assert isinstance(cred, PlatformCredentialRef)
    assert cred.owner_user == "alice"
    assert cred.platform == "youtube"
    assert cred.credential_id == "alice:youtube:default"
    assert cred.scopes == ["publish"]
