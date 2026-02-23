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
    assert 'selected_assets' in module_text
    assert 'asset_ids' in module_text
    assert 'sha256' in module_text
    assert 'items' in module_text
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
    assert 'dataset.sha256' in module_text
    assert 'dataset.origin' in module_text
    assert 'dataset.creationTime' in module_text
    assert '/media/' in module_text


def test_all_projects_selection_and_registry_preview_wiring_present():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert "const canSelect = !!state.activeProject || allMode;" in html
    assert "/api/registry/" in html
    assert "Registry Asset ID" in html
    assert "/api/media/facts" in html
    assert "inspectorRequestToken" in html
    assert "currentInspectorKey" in html
    assert "const detailSections =" in html
    assert "renderDetails()" in html
    assert "detailSections.registry = regRows" in html


def test_explorer_ios_touch_guards_and_play_handler():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '-webkit-touch-callout: none' in html
    assert 'target.addEventListener(\'contextmenu\'' in html
    assert "if (target.hasPointerCapture(pointerId))" in html
    assert "media.load?.();" in html
    assert "media.play?.().catch(() => {});" in html


def test_explorer_grid_responsive_rules_and_orientation_hooks():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '--grid-col-width' in html
    assert '--grid-gap' in html
    assert 'column-width: var(--grid-col-width)' in html
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
    assert 'content-loading' in html
    assert 'Preparing thumbnails' in html
    assert 'backdrop-filter: blur(8px)' in html


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


def test_explorer_selection_keys_support_all_projects_scope():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'function selectionKey(item)' in html
    assert 'uuid::${source}::${project}::${item.asset_uuid}' in html
    assert "selected: new Set(),   // `${source}::${project}::${relative_path}`" in html
    assert "if (!canSelectAcrossProjects) return;" in html
    assert "if (selectedOnly && !state.selected.has(selectionKey(it))) return false;" in html
    assert 'function selectionItemByKey(key)' in html
    assert 'return state.media.find((entry) => selectionKey(entry) === key) || null;' in html
    assert 'function selectedProjectContextIfSingle()' in html
    assert 'selectedOrder: []' in html
    assert 'function selectedProjectGroups()' in html
    assert 'function selectedAssetRefsOrdered()' in html
    assert 'asset_uuid: item.asset_uuid || null' in html
    assert 'const canProjectScopedAction = true;' in html
    assert "toast('warn','Compose','Choose an output project, or select clips from one project.');" in html
    assert '/api/assets/bulk/delete' in html
    assert '/api/assets/bulk/tags' in html
    assert '/api/assets/bulk/move' in html
    assert '/api/assets/bulk/compose' in html


def test_explorer_selection_bar_compose_action_present():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'id="selCompose"' in html
    assert 'Compose Video(s)' in html
    assert 'async function composeSelectedVideos()' in html
    assert '/compose' in html


def test_explorer_shader_asset_fx_wiring_present():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    shader_module = Path('public/js/explorer-shaders.mjs').read_text(encoding='utf-8')

    assert "import { AssetFX, ExplorerShaders } from './js/explorer-shaders.mjs';" in html
    assert 'const cardFX = new AssetFX();' in html
    assert "cardFX.attachGrid(g, '.asset');" in html
    assert 'cardFX.dissolve(card, cardThumb);' in html
    assert "if (kind === 'video') cardFX.addScanline(card);" in html
    assert 'cardFX.pulse(selectedCard);' in html

    assert 'export class AssetFX' in shader_module
    assert "attachGrid(gridEl, cardSelector = '.asset')" in shader_module
    assert 'addScanline(cardEl)' in shader_module
    assert 'pulse(cardEl' in shader_module
    assert 'dissolve(cardEl, imgEl' in shader_module
    assert '_cssDissolve(cardEl, imgEl, duration)' in shader_module
    assert '@keyframes fx-selection-pulse' in shader_module
    assert 'fx-scanline-overlay' in shader_module
