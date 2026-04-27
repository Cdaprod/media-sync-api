"""Authentication scaffolding for user, device, and platform auth layers."""

from .device_auth import DeviceAuthContext, require_device_auth
from .platform_credentials import PlatformCredentialRef, get_platform_credential

__all__ = [
    "DeviceAuthContext",
    "PlatformCredentialRef",
    "get_platform_credential",
    "require_device_auth",
]
