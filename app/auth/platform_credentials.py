"""Platform credential reference scaffolding.

Example
-------
Resolve a publishing credential reference for a queued share/export worker::

    from app.auth.platform_credentials import get_platform_credential

    cred = get_platform_credential(owner_user="alice", platform="youtube")
    # Worker uses cred.credential_id to fetch encrypted token server-side.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PlatformCredentialRef:
    """Reference metadata for a platform credential stored server-side."""

    owner_user: str
    platform: str
    credential_id: str
    scopes: list[str]


def get_platform_credential(owner_user: str, platform: str) -> PlatformCredentialRef:
    """Return a credential reference without exposing raw platform tokens."""

    normalized_owner = owner_user.strip()
    normalized_platform = platform.strip().lower()
    return PlatformCredentialRef(
        owner_user=normalized_owner,
        platform=normalized_platform,
        credential_id=f"{normalized_owner}:{normalized_platform}:default",
        scopes=["publish"],
    )
