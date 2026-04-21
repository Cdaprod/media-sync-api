from __future__ import annotations

from pathlib import Path

SCRIPT_PATHS = [
    Path("scriptable/ComposeStatefulJobDashboard-2.js"),
    Path("scriptable/ComposeStatefulJobDashboard.js"),
    Path("scriptable/ComposeJobDashboard.js"),
]


def test_submit_mode_uses_current_selection_authority_tokens() -> None:
    for path in SCRIPT_PATHS:
        content = path.read_text()
        assert 'submissionSource = "current_selection"' in content
        assert 'recoveryPathUsed = "current_selection"' in content
        assert 'importSourceUsed = "current_selection"' in content


def test_dashboard_calls_shared_current_selection_importer() -> None:
    for path in SCRIPT_PATHS:
        content = path.read_text()
        assert 'loadCurrentSelectionImporter' in content
        assert 'stageCurrentSelectionFromArgs' in content
        assert 'CurrentSelectionImporter' in content


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
        assert '"current_selection_staged"' in content
        assert '"current_selection_unreadable"' in content
