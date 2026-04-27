from app.auth.device_auth import extract_bearer_token
from app.auth.platform_credentials import PlatformCredentialRef, get_platform_credential


def test_extract_bearer_token_scaffolding() -> None:
    assert extract_bearer_token("Bearer scaffold") == "scaffold"


def test_get_platform_credential_returns_reference_only() -> None:
    cred = get_platform_credential(owner_user="alice", platform="YouTube")

    assert isinstance(cred, PlatformCredentialRef)
    assert cred.owner_user == "alice"
    assert cred.platform == "youtube"
    assert cred.credential_id == "alice:youtube:default"
    assert cred.scopes == ["publish"]
