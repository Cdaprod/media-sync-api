from pathlib import Path


def test_explorer_includes_program_monitor_button():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'btnProgramMonitor' in html
    assert 'program_monitor_handoff.js' in html
    assert 'hidden' in html
    assert 'getSelectedStreamUrlsInDomOrder' in html


def test_program_monitor_handoff_module_payload_shape():
    module_path = Path('public/js/program_monitor_handoff.js')
    assert module_path.exists()
    module_text = module_path.read_text(encoding='utf-8')
    assert 'PROGRAM_MONITOR_URL' in module_text
    assert 'CDAPROD_PROGRAM_MONITOR_IMPORT' in module_text
    assert 'CDAPROD_PROGRAM_MONITOR_ACK' in module_text
    assert 'durationOverride' in module_text
    assert 'nodes' in module_text
    assert 'meta' in module_text
    assert 'new URL(PROGRAM_MONITOR_URL)' in module_text
    assert 'sendCount' in module_text
    assert 'clearInterval' in module_text


def test_program_monitor_handoff_ordering_and_url_resolution():
    module_text = Path('public/js/program_monitor_handoff.js').read_text(encoding='utf-8')
    assert '.asset.is-selected' in module_text
    assert '.row.is-selected' in module_text
    assert 'dataset.streamUrl' in module_text
    assert 'dataset.project' in module_text
    assert 'dataset.relative' in module_text
    assert '/media/' in module_text


def test_explorer_grid_responsive_rules_and_orientation_hooks():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '--grid-cols' in html
    assert '--grid-gap' in html
    assert 'column-count: var(--grid-cols)' in html
    assert 'dataset.kind' in html
    assert 'dataset.orient' in html
    assert 'updateCardOrientation' in html


def test_explorer_grid_overlay_metadata():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'asset-overlay' in html
    assert 'asset-ol-tl' in html
    assert 'asset-ol-tr' in html
    assert 'asset-ol-bl' in html
    assert 'asset-ol-bottom' in html
    assert 'asset-title' in html
    assert 'asset-subtitle' in html
    assert 'media-sync-orient-cache-v1' in html
    assert "rootMargin: '1200px 0px'" in html
    assert 'content-loading' in html
    assert 'Preparing thumbnails' in html


def test_explorer_topbar_intent_controller():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'topbar-reveal' in html
    assert 'createIntentController' in html
    assert 'wireTopbarIntent' in html
    assert 'wireDropdownIntents' in html


def test_explorer_context_menu_and_drag_assist():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'context-menu' in html
    assert 'contextMenu' in html
    assert 'wireProjectDragAssist' in html
    assert 'openContextMenu' in html
