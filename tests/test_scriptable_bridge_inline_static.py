from __future__ import annotations

from pathlib import Path

SCRIPT_PATHS = [
    Path("scriptable/ComposeStatefulJobDashboard-2.js"),
    Path("scriptable/ComposeStatefulJobDashboard.js"),
    Path("scriptable/ComposeJobDashboard.js"),
]


def test_bridge_inline_submission_tokens_are_canonical() -> None:
    for path in SCRIPT_PATHS:
        content = path.read_text()
        assert 'submissionSource = "inline_bridge"' not in content
        assert 'recoveryPathUsed = "inline_bridge"' not in content
        assert 'importSourceUsed = "bridge_inline"' in content


def test_bridge_inline_source_channel_uses_canonical_name() -> None:
    for path in SCRIPT_PATHS:
        content = path.read_text()
        assert 'sourceChannel: "inline_bridge"' not in content
        assert 'sourceChannel: "bridge_inline"' in content
