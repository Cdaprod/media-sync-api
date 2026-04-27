"""Authentication scaffolding for user, device, and platform auth layers."""

from .device_auth import (
    DeviceAuthContext,
    build_device_auth_context,
    extract_bearer_token,
    require_device_bearer_headers,
    require_scope,
)
from .node_tokens import IssuedNodeToken, hash_node_token, issue_node_token, preview_node_token, verify_node_token
from .platform_credentials import PlatformCredentialRef, get_platform_credential

__all__ = [
    "DeviceAuthContext",
    "IssuedNodeToken",
    "PlatformCredentialRef",
    "build_device_auth_context",
    "extract_bearer_token",
    "get_platform_credential",
    "hash_node_token",
    "issue_node_token",
    "preview_node_token",
    "require_device_bearer_headers",
    "require_scope",
    "verify_node_token",
]
