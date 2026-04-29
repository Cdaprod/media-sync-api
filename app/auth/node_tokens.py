"""Node bearer-token issuing and verification helpers.

Example
-------
Issue and verify a node credential::

    from app.auth.node_tokens import issue_node_token, verify_node_token

    issued = issue_node_token()
    assert verify_node_token(issued.token, issued.token_hash)
"""

import hashlib
import secrets
from dataclasses import dataclass


@dataclass(frozen=True)
class IssuedNodeToken:
    token: str
    token_hash: str
    token_preview: str


def hash_node_token(token: str) -> str:
    normalized = (token or "").strip()
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def preview_node_token(token: str) -> str:
    normalized = (token or "").strip()
    if len(normalized) <= 16:
        return "****"
    return f"{normalized[:8]}…{normalized[-6:]}"


def issue_node_token() -> IssuedNodeToken:
    token = secrets.token_urlsafe(48)
    return IssuedNodeToken(
        token=token,
        token_hash=hash_node_token(token),
        token_preview=preview_node_token(token),
    )


def verify_node_token(candidate_token: str, stored_token_hash: str) -> bool:
    candidate_hash = hash_node_token(candidate_token)
    expected_hash = (stored_token_hash or "").strip()
    if not candidate_hash or not expected_hash:
        return False
    return secrets.compare_digest(candidate_hash, expected_hash)
