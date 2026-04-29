from app.auth.node_tokens import (
    hash_node_token,
    issue_node_token,
    preview_node_token,
    verify_node_token,
)


def test_issue_node_token_returns_hash_and_preview() -> None:
    issued = issue_node_token()

    assert issued.token
    assert issued.token_hash == hash_node_token(issued.token)
    assert issued.token_preview
    assert issued.token not in issued.token_preview


def test_verify_node_token_accepts_matching_token() -> None:
    issued = issue_node_token()

    assert verify_node_token(issued.token, issued.token_hash) is True


def test_verify_node_token_rejects_non_matching_token() -> None:
    issued = issue_node_token()

    assert verify_node_token("wrong-token", issued.token_hash) is False


def test_preview_node_token_never_returns_full_token() -> None:
    token = "a" * 64
    preview = preview_node_token(token)

    assert preview != token
    assert preview.startswith("aaaaaaaa")
    assert preview.endswith("aaaaaa")
