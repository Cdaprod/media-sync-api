import os
from pathlib import Path

import pytest


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
    assert 'window.__assetfx_instance instanceof AssetFX' in html
    assert "const gridRoot = el('mediaGridRoot') || document.querySelector('[data-fx-grid-root=\"1\"]') || g;" in html
    assert "cardFX.attachGrid(gridRoot, '.asset');" in html
    assert 'cardFX.bindCardMedia(card, cardThumb, { kind });' in html
    assert 'cardFX.pulse(selectedCard);' in html

    assert 'export class AssetFX' in shader_module
    assert "attachGrid(gridRoot, cardSelector = '.asset')" in shader_module
    assert 'addScanline(cardEl)' in shader_module
    assert 'pulse(cardEl' in shader_module
    assert 'dissolve(cardEl, imgEl' in shader_module
    assert 'trackViewport(cardEl, imgEl = null)' in shader_module
    assert 'bindCardMedia(cardEl, imgEl, { kind = \'' in shader_module
    assert '_playDissolve(cardEl, imgEl, duration, allowReplay)' in shader_module
    assert 'const RENDERERS = FX_GLOBAL.__assetfx_renderers || new WeakMap();' in shader_module
    assert "container.dataset.fxRendererId = String(++RENDERER_SEQ);" in shader_module
    assert '_getRenderer(container)' in shader_module
    assert '_saveRenderer(container)' in shader_module
    assert '@keyframes fx-visible-hint' in shader_module
    assert '@keyframes fx-selection-pulse' in shader_module




def test_explorer_asset_fx_debug_and_attach_idempotency_present():
    shader_module = Path('public/js/explorer-shaders.mjs').read_text(encoding='utf-8')
    assert 'window.__assetfx_dbg = {' in shader_module
    assert 'get calls() { return [...__DBG_GL_CONTEXT_CALLS]; }' in shader_module
    assert "markContextCall('AssetFX.init:webgl', { rootId, canvasId: canvas.dataset.assetfxOverlayId });" in shader_module
    assert 'if (this._attachedGridRoot === gridRoot) return;' in shader_module
    assert 'window.__assetfx_audit = () =>' in shader_module
    assert 'FX_GLOBAL.__assetfx_global_context_owner' in shader_module
    assert "console.info('AssetFX: prevented second WebGL context; reusing global overlay');" in shader_module
    assert 'const rootId = ensureRootId(gridRoot);' in shader_module
    assert 'this.maxActiveEffects = 6;' in shader_module
    assert "new URLSearchParams(window.location.search).get('fx') === 'lite'" in shader_module
    assert "window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true" in shader_module


def test_explorer_play_dissolve_has_no_webgl_creation():
    shader_module = Path('public/js/explorer-shaders.mjs').read_text(encoding='utf-8')
    start = shader_module.index('_playDissolve(cardEl, imgEl, duration, allowReplay) {')
    end = shader_module.index('_ensureObserver(rootEl) {')
    block = shader_module[start:end]
    assert 'getContext(' not in block
    assert "createElement('canvas')" not in block
    assert 'imgEl.style.opacity' not in block

def test_explorer_selection_toggle_does_not_full_rerender():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'function updateSelectionDomForKey(key, checked)' in html
    assert 'function wireSelectionDelegation()' in html
    assert 'renderMedia();' in html
    toggle_idx = html.index('function toggleSelected(')
    clear_idx = html.index('function clearSelection(')
    toggle_block = html[toggle_idx:clear_idx]
    assert 'renderMedia();' not in toggle_block
    assert 'setContentLoading(true);' not in toggle_block
    assert 'loadThumbQueue' not in toggle_block


def test_explorer_shared_renderer_singleton_symbols_present():
    shader_module = Path('public/js/explorer-shaders.mjs').read_text(encoding='utf-8')
    assert "if (this.container && RENDERERS.has(this.container))" in shader_module
    assert 'RENDERERS.set(container, {' in shader_module
    assert 'if (this.container && RENDERERS.has(this.container)) RENDERERS.delete(this.container);' in shader_module


@pytest.mark.skipif(os.environ.get("RUN_PLAYWRIGHT_E2E") != "1", reason="set RUN_PLAYWRIGHT_E2E=1 to run browser assertion")
def test_explorer_assetfx_context_singleton_runtime_with_playwright():
    playwright = pytest.importorskip("playwright.sync_api")
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            page.goto("http://127.0.0.1:8787/public/explorer.html", wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            page.evaluate("""() => {
              const root = document.getElementById('mediaGridRoot');
              if (!root) return;
              for (let i = 0; i < 6; i++) {
                root.scrollTop = i % 2 ? 0 : root.scrollHeight;
                root.dispatchEvent(new Event('scroll'));
              }
              document.querySelectorAll('input[type=\"checkbox\"][data-select-key]').forEach((el, idx) => {
                if (idx < 5) el.click();
              });
            }""")
            page.wait_for_timeout(500)
            contexts = page.evaluate("window.__assetfx_dbg?.contexts ?? null")
            overlays = page.evaluate("document.querySelectorAll('canvas[data-assetfx=\"overlay\"]').length")
            assert contexts is not None
            assert contexts <= 1
            assert overlays <= 1
        finally:
            browser.close()
