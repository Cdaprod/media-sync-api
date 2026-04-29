import pytest
from fastapi import HTTPException

from app.auth.device_auth import (
    build_device_auth_context,
    extract_bearer_token,
    require_device_bearer_headers,
    require_scope,
)
from app.auth.node_tokens import issue_node_token


def test_extract_bearer_token() -> None:
    assert extract_bearer_token("Bearer abc") == "abc"
    assert extract_bearer_token("bearer abc") == "abc"
    assert extract_bearer_token("Basic abc") == ""
    assert extract_bearer_token(None) == ""


def test_build_device_auth_context_accepts_valid_token() -> None:
    issued = issue_node_token()

    auth = build_device_auth_context(
        node_id="node-1",
        token=issued.token,
        stored_token_hash=issued.token_hash,
        scopes=["ingest:write"],
    )

    assert auth.node_id == "node-1"
    assert auth.can("ingest:write") is True


def test_build_device_auth_context_rejects_invalid_token() -> None:
    issued = issue_node_token()

    with pytest.raises(HTTPException) as exc:
        build_device_auth_context(
            node_id="node-1",
            token="wrong",
            stored_token_hash=issued.token_hash,
            scopes=["ingest:write"],
        )

    assert exc.value.status_code == 401


def test_require_scope_rejects_missing_scope() -> None:
    issued = issue_node_token()
    auth = build_device_auth_context(
        node_id="node-1",
        token=issued.token,
        stored_token_hash=issued.token_hash,
        scopes=["node:heartbeat"],
    )

    with pytest.raises(HTTPException) as exc:
        require_scope(auth, "ingest:write")

    assert exc.value.status_code == 403


def test_require_device_bearer_headers_requires_token_and_node_id() -> None:
    with pytest.raises(HTTPException) as missing_token:
        require_device_bearer_headers(authorization=None, x_media_sync_node_id="node-1")
    assert missing_token.value.status_code == 401

    with pytest.raises(HTTPException) as missing_node:
        require_device_bearer_headers(authorization="Bearer abc", x_media_sync_node_id=None)
    assert missing_node.value.status_code == 401
