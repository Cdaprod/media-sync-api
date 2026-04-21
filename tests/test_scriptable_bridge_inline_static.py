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


def test_bridge_report_fallback_debug_gate_is_removed() -> None:
    forbidden = [
        "DEBUG_REQUIRE_LIVE_CURRENT_SELECTION",
        "bridge_fallback_disabled_require_live_current_selection",
        "requireLiveCurrentSelection",
        "Bridge report fallback is disabled while live current-selection contract debugging is active.",
    ]
    for path in SCRIPT_PATHS:
        content = path.read_text()
        for needle in forbidden:
            assert needle not in content
        assert "ENABLE_SUBMIT_IMPORT_RESULT_ALERT" in content
        assert "Submit source:" in content
