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
    assert 'grid-template-columns: repeat(auto-fill, minmax(var(--grid-col-width), 1fr));' in html
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

    assert "import { AssetFX, ExplorerShaders, TileFXRenderer } from './js/explorer-shaders.mjs';" in html
    assert 'window.__assetfx_instance instanceof AssetFX' in html
    assert "const gridRoot = el('mediaGridRoot') || document.querySelector('[data-fx-grid-root=\"1\"]') || g;" in html
    assert "cardFX.attachGrid(gridRoot, '.asset');" in html
    assert 'cardFX.bindCardMedia(card, cardThumb, { kind });' in html
    assert 'cardFX.pulse(selectedCard);' in html
    assert 'data-no-preview="1"' in html
    assert 'loading="eager" decoding="async" fetchpriority="high"' in html
    assert 'const THUMB_APPLY_PER_FRAME = 48;' in html
    assert 'function enqueueThumbApply(task)' in html
    assert 'requestAnimationFrame(flushThumbApplyQueue);' in html
    assert 'loading="lazy"' not in html
    assert "const FX_DEBUG = new URLSearchParams(window.location.search).get('fxdebug') === '1';" in html
    assert '<canvas id="tilefxCanvas" data-tilefx="1" aria-hidden="true"></canvas>' in html
    assert 'const tileFX = new TileFXRenderer({' in html
    assert 'tileFX.setTileSource(collectTileFxTiles);' in html
    assert 'window.__tilefx_dbg' in html
    assert 'domSwapOk' in html
    assert 'function ensureTileFxHud()' in html
    assert 'window.debugLogTilePainters = debugLogTilePainters;' in html
    assert "const TILEFX_PAINTER_TOAST_DEBUG = new URLSearchParams(window.location.search).get('tilefxPainterToast') === '1';" in html
    assert "function maybeToastTileFxPainterLeak(reason = 'scan'){" in html
    assert "toast('warn', 'FX painter leak'" in html
    assert 'function ensureTileFxProbeButton(){' in html
    assert "const TILEFX_PROOF_MODE = new URLSearchParams(window.location.search).get('tilefxProof') === '1';" in html
    assert "function captureTileFxProof(reason = 'manual'){" in html
    assert 'window.captureTileFxProof = captureTileFxProof;' in html
    assert 'function exportTileFxProofSummary(){' in html
    assert 'window.exportTileFxProofSummary = exportTileFxProofSummary;' in html
    assert "function logTileFxProofSummary(reason = 'manual'){" in html
    assert 'window.logTileFxProofSummary = logTileFxProofSummary;' in html
    assert 'window.logVisibleTileOwnership = logVisibleTileOwnership;' in html
    assert 'ownership truth bug: visible cards present but ownership rows empty' in html
    assert 'ownershipTruthBug: stillEmpty,' in html
    assert 'visibleDomCards,' in html
    assert 'function computeTileFxHealthVerdict(){' in html
    assert "function assertTileFxViewLifecycle(reason = 'sync'){" in html
    assert "function containTileFxInvariantFailure(reason = 'lifecycle', details = {}){" in html
    assert "function forceExitFxAfterFatalLifecycle(reason = 'lifecycle_fatal') {" in html
    assert "btn.id = 'tilefxProbeBtn';" in html
    assert "proofBtn.textContent = 'Capture Proof';" in html
    assert "hud.id = 'tilefxHud';" in html
    assert "scheduleTileFxCollect('scroll')" in html
    assert "scheduleTileFxCollect('resize')" in html
    assert "scheduleTileFxCollect('render-media')" in html
    assert "card.classList.toggle('tilefx-ready', !!ready);" in html
    assert 'COVERAGE_LOW' in html
    assert 'visiblePromotedThisPass' in html
    assert "const entryPhase = (typeof tileFX.getFxEntryPhase === 'function')" in html
    assert "const inBootstrap = entryPhase !== 'steady';" in html
    assert 'const maxPromoted = inBootstrap ? 0 : (scrolling ? (coarsePointer ? 2 : 4) : (coarsePointer ? 6 : 10));' in html
    assert 'if (inBootstrap) break;' in html
    assert 'visibleCards.forEach((tile) => addTile(tile));' in html
    assert 'texturesUploaded' in html
    assert 'texturesPending' in html
    assert 'thumbs: img' in html
    assert 'rectMismatch:' in html
    assert 'rectMismatchVisibleCount' in html
    assert 'rectMismatchMaxPx' in html
    assert 'rectMismatchAvgPx' in html
    assert 'lifecycleStable' in html
    assert 'fedVisibleRatio' in html
    assert 'visibleSwapReleaseBlocked' in html
    assert 'offscreenSwapReleaseAllowed' in html
    assert 'fxLifecycleStage' in shader_module
    assert 'visibleReadyButNotSwapped' in html
    assert 'visibleSwappedButNoTexture' in html
    assert "proofPass: health === 'ok'" in html
    assert 'deadOverlayHidden' in html
    assert 'deadOverlayReason' in html
    assert "renderer:${runtimeEnabled ? 'enabled' : 'disabled'}" in html
    assert 'health:${healthVerdict}' in html
    assert 'visiblePainterLeakCount' in html
    assert "card.dataset.fxReady = ready ? '1' : '0';" in html
    assert 'swapOps: set' in html
    assert 'data-tex="1"' in html
    assert 'upload: queued' in html
    assert 'pending: wait' in html
    assert 'window.__webgl_ctx_calls = window.__webgl_ctx_calls || [];' in html

    assert 'export class TileFXRenderer' in shader_module
    assert 'const TILE_STATE = Object.freeze({' in shader_module
    assert 'const TILE_SWAP_STATE = Object.freeze({' in shader_module
    assert '_getTileRectInVisualViewport(tileRect, viewportMetrics)' in shader_module
    assert '_cssRectToCanvasRect(localRect, dpr = 1)' in shader_module
    assert '_canReleaseSwap(tileEl, now = performance.now())' in shader_module
    assert 'syncVisibleTileOwnership(activeTiles = [], drawResults = new Map(), now = performance.now())' in shader_module
    assert '_isEnteringPhase() {' in shader_module
    assert 'getFxLifecycleStage() {' in shader_module
    assert '_reconcileVisibleOwnerFromTruth(tile, {' in shader_module
    assert "this._fxEntryPhase = 'bootstrap_collect';" in shader_module
    assert "this._fxEntryPhase = 'bootstrap_ready';" in shader_module
    assert "this._fxEntryPhase = 'bootstrap_commit';" in shader_module
    assert 'bootstrapReady === bootstrapTotal' in shader_module
    assert "this.applyDomSwap(tile, true, 'bootstrap:batch-commit');" in shader_module
    assert "reasonFx: 'steady:visible-lock'," in shader_module
    assert "reasonDom: 'steady:draw-truth-lost'," in shader_module
    assert 'this._bootstrapVisibleTileEls = new Set();' in shader_module
    assert 'getVisibleOwnershipRows(limit = 12)' in shader_module
    assert '_collectVisibleDomOwnershipRows(limit = 12)' in shader_module
    assert 'this._lastDrawByTileEl = new WeakMap();' in shader_module
    assert 'swapState: String(swapState || TILE_SWAP_STATE.DOM_VISIBLE),' in shader_module
    assert 'rectValid,' in shader_module
    assert 'fed: true,' in shader_module
    assert 'tileStateByKey = new Map();' in shader_module
    assert 'decodedSrcSet = new Set();' in shader_module
    assert '_setTileState(key, TILE_STATE.READY);' in shader_module
    assert 'class TextureCacheLRU {' in shader_module
    assert 'setVisibleKeys(keys) {' in shader_module
    assert 'this.visibleKeySet = new Set();' in shader_module
    assert 'window.__tilefx_dbg = {' in shader_module
    assert 'const prevDbg = window.__tilefx_dbg || {};' in shader_module
    assert '...prevDbg,' in shader_module
    assert 'rafRunning: false,' in shader_module
    assert 'tilesVisible: 0,' in shader_module
    assert 'tilesFed: 0,' in shader_module
    assert 'tilesDrawn: 0,' in shader_module
    assert 'reuploadsTotal: 0,' in shader_module
    assert 'uploadBudgetPerSecond' in shader_module
    assert 'backpressureUntil' in shader_module
    assert 'totalReuploads()' in shader_module
    assert 'has(key)' in shader_module
    assert "if (!this.enabled || this.mode !== 'fx' || !Array.isArray(this.tiles) || this.tiles.length === 0) return;" in shader_module
    assert 'this._queueTileImageUpload(tile, key);' in shader_module
    assert 'this._drainPendingUploads(performance.now());' in shader_module
    assert '_queueTileImageUpload(tile, key)' in shader_module
    assert 'this._queueUrlImage(resolved.url).catch(() => this._prepareImageForUpload(imgEl))' in shader_module
    assert 'const pendingWork = visiblePendingKeys.concat(otherPendingKeys);' in shader_module
    assert 'if (visible) visiblePendingKeys.push([key, pending]);' in shader_module
    assert "window.__tilefx_dbg.lastVisiblePipeline = { key, stage: 'queued', kind: resolved.kind }" in shader_module
    assert "window.__tilefx_dbg.lastVisiblePipeline = { key, stage: 'texture_uploaded' }" in shader_module
    assert 'pipeline:' in shader_module
    assert "window.__tilefx_dbg.lastVisiblePipeline.key === String(meta.key || '')" in shader_module
    assert 'const queued = key ? this._pendingUploads.has(key) : false;' in shader_module
    assert 'queued,' in shader_module
    assert 'Fed tiles are upload-first: queue texture prep even if visibility/rect state is temporarily stale.' in shader_module
    assert 'window.__tilefx_dbg.visibleMissingTextures = visibleMissingTextures;' in shader_module
    assert 'if (!this.isScrolling && readyCount >= visibleTarget && visibleMissingTextures <= 0) return;' in shader_module
    assert "if (thumbSrc) return { kind: kind || 'url', source: null, url: thumbSrc };" in shader_module
    assert 'getViewportMetrics()' in shader_module
    assert 'resizeTileFxCanvasToViewport(canvas, dprCap = 2)' in shader_module
    assert 'this.debugRectsEnabled = new URLSearchParams(window.location.search).get(\'tilefxDebugRects\') === \'1\';' in shader_module
    assert '_renderDebugRects(debugRects = []) {' in shader_module
    assert '_getSwapState(tileEl)' in shader_module
    assert "_setSwapState(tileEl, nextState = TILE_SWAP_STATE.DOM_VISIBLE, reason = '')" in shader_module
    assert '_drainPendingUploads(now)' in shader_module
    assert 'teardownForModeExit({ removeCanvas = false } = {}) {' in shader_module
    assert "restoreAllDomSwaps(reason = 'restore:all') {" in shader_module
    assert "applyDomSwap(tile, swapped = false, reason = '') {" in shader_module
    assert "disable(reason = '', { allowInFxView = false } = {})" in shader_module
    assert "console.warn('[tilefx] DISABLE'" in shader_module
    assert "console.error('[tilefx] illegal disable during FX view'" in shader_module
    assert 'illegalDisableBlocked: 0,' in shader_module
    assert 'lastIllegalDisable: null,' in shader_module
    assert "console.warn('[tilefx] rect mismatch'" in shader_module
    assert 'window.__tilefx_dbg.pendingCap = maxPending;' in shader_module
    assert 'this._swapReleaseNearVisibleIdleMs = 520;' in shader_module
    assert 'this._swapReleaseNearVisibleDelayFrames = 20;' in shader_module
    assert '_restoreUntrackedSwaps(activeTileEls, now, visibleTileEls, nearVisibleTileEls, this._bootstrapVisibleTileEls);' in shader_module
    assert 'const paintEls = Array.isArray(tile?.thumbPaintEls) && tile.thumbPaintEls.length' in shader_module
    assert "tileEl.classList.toggle('fx-swapped', !!swapped);" in shader_module
    assert "document.body?.classList?.contains('fx-mode')" in shader_module
    assert "document.visibilityState !== 'visible'" in shader_module
    assert 'if (this.isScrolling && cachePressure) return;' in shader_module
    assert 'texturesUploaded: 0,' in shader_module
    assert 'texturesPending: 0,' in shader_module
    assert 'uploadOk: 0,' in shader_module
    assert 'uploadAttempt: 0,' in shader_module
    assert 'uploadsQueued: 0,' in shader_module
    assert 'uploadsAttempted: 0,' in shader_module
    assert 'uploadsSucceeded: 0,' in shader_module
    assert 'uploadsFailed: 0,' in shader_module
    assert 'resizeImageForGL(img, maxEdge = 320)' in shader_module
    assert "new URLSearchParams(window.location.search).get('tilefxMaxTex')" in shader_module
    assert 'this.maxTexEdge = Math.max(64, maxTexParam || (coarse ? 512 : 640));' in shader_module
    assert 'averageTextureSize() {' in shader_module
    assert 'pendingWaitLoad: 0,' in shader_module
    assert 'pendingReady: 0,' in shader_module
    assert 'srcMissing: 0,' in shader_module
    assert 'uploadFail: 0,' in shader_module
    assert 'lastUploadError' in shader_module
    assert 'lastFailReason' in shader_module
    assert 'export class AssetFX' in shader_module
    assert "attachGrid(gridRoot, cardSelector = '.asset')" in shader_module
    assert 'pulse(cardEl' in shader_module
    assert 'dissolve(cardEl, imgEl' in shader_module
    assert "this.dissolveMode = (dissolveParam === '1' || dissolveParam === 'tile') ? 'tile' : 'scene';" in shader_module
    assert "if (this.dissolveMode !== 'tile' && cardEl?.dataset?.fxForceDissolve !== '1') return;" in shader_module
    assert "setDissolveMode(mode = 'scene')" in shader_module
    assert 'trackViewport(cardEl, imgEl = null)' in shader_module
    assert 'bindCardMedia(cardEl, mediaEl, { kind = \'' in shader_module
    assert '_playDissolve(cardEl, imgEl, duration, allowReplay)' in shader_module
    assert '_playExit(cardEl, { duration = 260 } = {})' in shader_module
    assert "_playEntry(cardEl, imgEl, duration, allowReplay)" in shader_module
    assert "_maybePlayEntryOnReady(cardEl, mediaEl, kind = '')" in shader_module
    assert 'const RENDERERS = FX_GLOBAL.__assetfx_renderers || new WeakMap();' in shader_module
    assert "container.dataset.fxRendererId = String(++RENDERER_SEQ);" in shader_module
    assert '_getRenderer(container)' in shader_module
    assert '_saveRenderer(container)' in shader_module
    assert '@keyframes fx-visible-hint' in shader_module
    assert '@keyframes fx-selection-pulse' in shader_module
    assert '.fx-debug-overlay {' in shader_module
    assert '.fx-exit-veil {' in shader_module
    assert '@keyframes fx-exit-veil' in shader_module




def test_explorer_asset_fx_debug_and_attach_idempotency_present():
    shader_module = Path('public/js/explorer-shaders.mjs').read_text(encoding='utf-8')
    assert 'window.__assetfx_dbg = {' in shader_module
    assert 'get calls() { return [...__DBG_GL_CONTEXT_CALLS]; }' in shader_module
    assert 'FX_GLOBAL.__assetfx_dbg_last_rects = [];' in shader_module
    assert '  _publishDebugRects(debugRects, meta = {}) {' in shader_module
    assert 'window.__assetfx_dbg.lastRects = safeRects;' in shader_module
    assert 'window.__assetfx_dbg.lastRectsFrame = Number(window.__assetfx_dbg.lastRectsFrame || 0) + 1;' in shader_module
    assert "markContextCall('AssetFX.init:webgl', { rootId, canvasId: canvas.dataset.assetfxOverlayId });" in shader_module
    assert 'if (this._attachedGridRoot === gridRoot) return;' in shader_module
    assert 'window.__assetfx_audit = () =>' in shader_module
    assert 'contextsCreated:' in shader_module
    assert 'overlayCanvases:' in shader_module
    assert 'webglCanvases:' in shader_module
    assert 'attachedRootId:' in shader_module
    assert 'window.__assetfx_dump_canvases = () =>' in shader_module
    assert 'readyInViewNotPlayedCount:' in shader_module
    assert 'renderSampledCount:' in shader_module
    assert 'droppedByCapCount:' in shader_module
    assert 'FX_GLOBAL.__assetfx_global_context_owner' in shader_module
    assert "console.info('AssetFX: prevented second WebGL context; reusing global overlay');" in shader_module
    assert 'const rootId = ensureRootId(gridRoot);' in shader_module
    assert 'this.maxActiveEffects = 6;' in shader_module
    assert 'this.maxPendingDissolves = 60;' in shader_module
    assert "cardEl.dataset.fxReady = '0';" in shader_module
    assert "cardEl.dataset.ready = '1';" in shader_module
    assert 'await imgEl.decode();' in shader_module
    assert 'const MAX_PARALLEL_DECODES = 3;' in shader_module
    assert 'const DECODE_QUEUE = [];' in shader_module
    assert 'function getStableViewportSize() {' in shader_module
    assert 'const vv = window.visualViewport;' in shader_module
    assert 'function getViewportOffsets() {' in shader_module
    assert 'function cloneRect(r) {' in shader_module
    assert 'function cloneVV(vv) {' in shader_module
    assert 'function decodeImageWithBackpressure(imgEl)' in shader_module
    assert '  _isRenderableMediaReady(cardEl) {' in shader_module
    assert "const thumbBlocked = !!(thumbState && thumbState !== 'loaded');" in shader_module
    assert "this.renderableFallbackMs = Math.max(120, Number(new URLSearchParams(window.location.search).get('fxfallbackms') || 680));" in shader_module
    assert 'this.layoutDirty = true;' in shader_module
    assert 'this.cardRectCache = new WeakMap();' in shader_module
    assert 'this.readyInViewNotPlayedCount = 0;' in shader_module
    assert 'this.renderSampledCount = 0;' in shader_module
    assert 'this.droppedByCapCount = 0;' in shader_module
    assert 'this.prefetchViewportY = 1.5;' in shader_module
    assert "if (typeof ResizeObserver !== 'undefined') {" in shader_module
    assert 'this.readyFadeMs = 240;' in shader_module
    assert 'this.entryMs = 260;' in shader_module
    assert 'this._pruneDisconnected();' in shader_module
    assert "    FX_GLOBAL.__assetfx_dbg_last_rects = debugRects;\n    if (window.__assetfx_dbg) window.__assetfx_dbg.lastRects = debugRects;\n  }\n\n  _showVisibleHint(cardEl) {" not in shader_module
    assert "new URLSearchParams(window.location.search).get('fx') === 'lite'" in shader_module
    assert "window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true" in shader_module
    assert "if (card.dataset.fxReady !== '1') continue;" in shader_module
    assert 'if (!this._isRenderableMediaReady(card)) continue;' in shader_module
    assert 'const fallbackBlocked = !!(hasThumbUrl && thumbFallback && src === thumbFallback);' in shader_module
    assert 'if (visibleLike && blockedFor >= this.renderableFallbackMs) ready = true;' in shader_module
    assert "const readyFade = readyAt > 0 ? Math.min(1, (performance.now() - readyAt) / this.readyFadeMs) : 1;" in shader_module
    assert 'uniform sampler2D u_tile_params;' in shader_module
    assert 'this.tileParamTexture = gl.createTexture();' in shader_module
    assert "position: 'absolute'" in shader_module
    assert "if (!canvas.isConnected || canvas.parentElement !== document.body) document.body.prepend(canvas);" in shader_module
    assert 'const tileParamData = new Uint8Array(MAX_RECTS * 4);' in shader_module
    assert "gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_RECTS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, tileParamData);" in shader_module
    assert 'vec2 tileUV = (px - r.xy)' in shader_module
    assert 'const visibleOrder = [...renderCandidates].sort((a, b) => ((a[1] - b[1]) || (a[0] - b[0])));' in shader_module
    assert 'this._lastCanvasRect = null;' in shader_module
    assert 'window.__assetfx_dbg.lastInvalidationReason = reason;' in shader_module
    assert 'this.stateByKey = new Map();' in shader_module
    assert 'this.nearViewCards = new Set();' in shader_module
    assert "this.maxStateKeys = Math.max(120, Number(new URLSearchParams(window.location.search).get('fxmaxstate') || STATE_MAX_KEYS));" in shader_module
    assert "this.nearViewCardsMax = Math.max(24, Number(new URLSearchParams(window.location.search).get('fxnearmax') || NEAR_VIEW_MAX));" in shader_module
    assert '  _getKeyEl(el) {' in shader_module
    assert "return el.closest?.('.asset') || el;" in shader_module
    assert 'this.keyByEl = new WeakMap();' in shader_module
    assert 'thumbBlockedAt: 0,' in shader_module
    assert '  _bindInvalidations() {' in shader_module
    assert '  _evictState(nowPerf = performance.now()) {' in shader_module
    assert 'window.__assetfx_dbg.stateSize = this.stateByKey.size;' in shader_module
    assert 'window.__assetfx_dbg.lastRectsLen = safeRects.length;' in shader_module
    assert 'window.__assetfx_dbg.nearViewCards = this.nearViewCards.size;' in shader_module
    assert '  _capNearViewCards() {' in shader_module
    assert 'window.__assetfx_dbg.canvasRect = meta.canvasRect || null;' in shader_module
    assert 'this.sampleHoldMs = SAMPLE_STICK_MS;' in shader_module
    assert 'this.sampledCardsUntil = new WeakMap();' in shader_module
    assert 'const RECT_INSET_PX = 4;' in shader_module
    assert 'let x1 = (cr.left - canvasRect.left) * dpr;' in shader_module
    assert 'let y1 = (cr.top - canvasRect.top) * dpr;' in shader_module
    assert "if (this.container.dataset.fxSuspend === '1') {" in shader_module
    assert 'this.gl.clear(this.gl.COLOR_BUFFER_BIT);' in shader_module
    assert 'let canvasRect = this._lastCanvasRect || cloneRect(this.overlay.getBoundingClientRect());' in shader_module
    assert 'let x2 = (cr.right - canvasRect.left) * dpr;' in shader_module
    assert 'let y2 = (cr.bottom - canvasRect.top) * dpr;' in shader_module
    assert 'x1 += RECT_INSET_PX * dpr;' in shader_module
    assert 'x1 = Math.max(0, Math.min(width, x1));' in shader_module
    assert "window.visualViewport.addEventListener('resize', this._boundVisualViewportChange, { passive: true });" in shader_module
    assert "window.visualViewport.addEventListener('scroll', this._boundVisualViewportChange, { passive: true });" in shader_module
    assert 'this._bindInvalidations();' in shader_module
    assert 'rootMargin: `${overscanY}px 0px ${overscanY}px 0px`,' in shader_module
    assert "const debugOverlay = debugCanvases.shift() || createNode('canvas', 'fx-debug-overlay');" in shader_module
    assert "debugOverlay.dataset.assetfx = 'debug';" in shader_module
    assert '_renderDebugRects(cards, width, height);' in shader_module
    assert 'this._publishDebugRects([], {' in shader_module
    assert 'for (const card of this._iterCards(this.trackedCards)) {' in shader_module
    assert 'state.inView = inViewNow;' in shader_module
    assert 'state.nearView = nearViewNow;' in shader_module
    assert 'this.renderCandidatesCount = totalCandidates;' in shader_module
    assert 'const ALWAYS_ON_PASS_ENABLED = true;' in shader_module
    assert 'const dynamicCap = lowTier ? this.maxRenderCardsLowTier : this.maxRenderCardsHighTier;' in shader_module
    assert 'const lowTierFrameSkip = !this.fxDebug && ((deviceMemory > 0 && deviceMemory <= 4) || smallScreen) && this.scrollVelocityEma > 0.85;' in shader_module
    assert 'this.maxRenderPixelsLowTier = 1450000;' in shader_module
    assert 'this.maxRenderPixelsHighTier = 2400000;' in shader_module
    assert 'const pixelBudget = Math.min(pixelBudgetCap, pixelBudgetDynamic);' in shader_module
    assert 'if (!force && (this.renderPixelsNow + rowPixels) > pixelBudget) return;' in shader_module
    assert 'this.maxRenderCardsLowTier = 22;' in shader_module
    assert 'this.maxRenderCardsHighTier = 30;' in shader_module
    assert 'let adaptiveMaxRenderCards = Math.min(totalCandidates, Math.min(dynamicCap, visibleDrivenCap));' in shader_module
    assert 'this.maxRenderCardsAdaptive = adaptiveMaxRenderCards;' in shader_module
    assert 'const sampledCards = new Set();' in shader_module
    assert 'uniform float u_motion_damp;' in shader_module
    assert 'uniform float u_scroll_fast;' in shader_module
    assert 'export class MaskField {' in shader_module
    assert 'uniform sampler2D u_mask;' in shader_module
    assert 'uniform float u_mask_enabled;' in shader_module
    assert 'this._maskField = null;' in shader_module
    assert 'this._maskTexture = null;' in shader_module
    assert 'this._cacheUniforms();' in shader_module
    assert 'gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._maskField.canvas);' in shader_module
    assert 'this._recordScrollMotion(event);' in shader_module
    assert 'this._updateMotionDamp();' in shader_module
    assert 'this.scrollVelocityEma = (this.scrollVelocityEma * 0.82) + (v * 0.18);' in shader_module
    assert 'this.motionDamp = 1.0 - smoothstep(0.2, 1.2, vDecayed);' in shader_module
    assert 'this.fpsEma = (this.fpsEma * 0.9) + (fps * 0.1);' in shader_module
    assert 'const lowTierFrameSkip = !this.fxDebug && ((deviceMemory > 0 && deviceMemory <= 4) || smallScreen) && this.scrollVelocityEma > 0.85;' in shader_module
    assert 'if (this.scrollVelocityEma > 0.35 || this.motionDamp < 0.8) return;' in shader_module
    assert 'if (Math.random() > 0.35) return;' in shader_module
    assert 'if (!lowTierFrameSkip || (this._frameCounter % 2) === 0) {' in shader_module
    assert "this._setTickExit('EARLY_RETURN:THROTTLED');" in shader_module
    assert 'window.__assetfx_dbg.lastException = String(e && (e.stack || e.message || e));' in shader_module
    assert 'const visibleDrivenCap = Math.min(MAX_RECTS, Math.max(this.minRenderCards, totalCandidates + 4));' in shader_module
    assert 'if (this.fpsEma > 55) adaptiveMaxRenderCards =' in shader_module
    assert 'const SAMPLE_STICK_MS = 420;' in shader_module
    assert 'const SETTLE_DELAY_MS = 120;' in shader_module
    assert 'const FAST_SCROLL_THRESHOLD = 0.95;' in shader_module
    assert 'this.sampleCursor = 0;' in shader_module
    assert 'this.samplingFrozen = false;' in shader_module
    assert 'this.samplingSettleUntil = 0;' in shader_module
    assert 'this.lastSampledCards = [];' in shader_module
    assert 'this.stickyRetainedCount = 0;' in shader_module
    assert 'this.sweepFilledCount = 0;' in shader_module
    assert 'this.entryPendingCount = 0;' in shader_module
    assert 'this._ensureEntryPending(cardEl, imgEl, duration);' in shader_module
    assert "cardEl.dataset.fxEntryPending = '1';" in shader_module
    assert "card.dataset.fxEntryPlayed = '1';" in shader_module
    assert 'const freezeByVelocity = this.scrollVelocityEma > FAST_SCROLL_THRESHOLD;' in shader_module
    assert 'const freezeBySettle = nowPerf < this.samplingSettleUntil;' in shader_module
    assert 'const frozenCards = this.samplingFrozen ? this.lastSampledCards.filter((card) => rowsByCard.has(card)) : [];' in shader_module
    assert 'this.lastSampledCards = [...sampledCards];' in shader_module
    assert 'this.stickyRetainedCount = 0;' in shader_module
    assert 'this.sweepFilledCount = Math.max(0, cards.length - this.stickyRetainedCount);' in shader_module
    assert 'this.entryPendingCount += 1;' in shader_module
    assert '_renderDebugBadge(card, { ready, inView, sampled, pending, sticky, alwaysOn: ALWAYS_ON_PASS_ENABLED });' in shader_module
    assert 'gl.uniform1f(U.u_motion_damp, this.motionDamp);' in shader_module
    assert 'gl.uniform1f(U.u_scroll_fast, this.scrollFast);' in shader_module
    assert "uniform float u_selected;" in shader_module
    assert "uniform float u_select_pulse;" in shader_module
    assert "float selectedEnergy = sel * (0.95 + (u_selected * 0.35) + (u_select_pulse * 0.75));" in shader_module
    assert "selectedVisibleCards.forEach((card) => {" in shader_module
    assert "if (sampledCards.has(card)) return;" in shader_module
    assert 'gl.uniform1f(U.u_selected, selectedVisibleCards.length > 0 ? 1 : 0);' in shader_module
    assert 'gl.uniform1f(U.u_select_pulse, this.selectPulse * (0.5 + 0.5 * Math.sin((nowPerf - this.start) * (Math.PI * 2 / 2500))));' in shader_module
    assert 'this.lastExitedAt = new WeakMap();' in shader_module
    assert "if (card.dataset.fxReady === '1' && !this.noVirtualization) this._playExit(card);" in shader_module
    assert '_renderDebugBadge(cardEl' in shader_module
    assert '.fx-debug-badge {' in shader_module
    assert "badge.textContent = `${alwaysOn ? 'A' : '-'}${ready ? 'R' : '-'}${inView ? 'V' : '-'}${sampled ? (sticky ? 'K' : 'S') : (pending ? 'P' : '-')}`;" in shader_module
    assert "const typeCode = 0;" in shader_module


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
    assert 'pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false, t: Date.now(), input });' in html
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


def test_explorer_near_visible_tracking_happens_before_visible_cull():
    shader_module = Path('public/js/explorer-shaders.mjs').read_text(encoding='utf-8')
    near_idx = shader_module.index('if (nearVisible) nearVisibleTileEls.add(tileEl);')
    visible_cull_idx = shader_module.index('if (!visible) return;', near_idx)
    visible_add_idx = shader_module.index('if (visible) visibleTileEls.add(tileEl);', near_idx)
    assert near_idx < visible_cull_idx
    assert visible_add_idx < visible_cull_idx




def test_explorer_asset_css_visual_animation_is_minimized():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '.asset:hover{' in html
    assert 'transform: translateY(-2px);' in html
    assert '@media (pointer: coarse){' in html
    assert '.selector .sel-order{' in html
    assert 'color: var(--asset-accent);' in html
    assert 'syncSelectionOrderBadges();' in html
    assert '.topbar{' in html and 'z-index: var(--z-topbar);' in html
    assert '.actions-panel{' in html and 'z-index: var(--z-modal);' in html
    assert '.dropdown-menu{' in html and 'z-index: var(--z-dropdown);' in html
    assert '#ui-portal{' in html and 'z-index: var(--z-dropdown);' in html
    assert '.toasts{' in html and 'z-index: var(--z-toast);' in html
    assert 'function ensureToastHost()' in html
    assert 'if (host.parentElement !== document.body) document.body.appendChild(host);' in html
    assert '#ui-portal .actions-panel{' in html and 'pointer-events: auto;' in html
    assert 'function setFxSuspend(suspend)' in html
    assert "function logTileFxLayerContract(reason = 'runtime') {" in html
    assert 'function inNoPreviewZone(target)' in html
    assert "if (inNoPreviewZone(event.target)) return;" in html
    assert "target.closest('[data-no-preview], .sel-ui')" in html
    assert 'async function refreshExplorerData({ toastOnSuccess = true } = {})' in html
    assert "<button id=\"viewFx\" class=\"active\" type=\"button\">FX</button>" in html
    assert "if (typeof cardFX?.setDissolveMode === 'function') {" in html
    assert "cardFX.setDissolveMode('tile');" in html
    assert 'window.__tilefx_enabled = fxMode;' in html
    assert "document.body.classList.toggle('fx-safemode', fxEnabled);" in html
    assert 'window.__explorer_view = nextView;' in html
    assert "function syncTileFxLifecycleToView(view = state.view, reason = 'sync', { forceDisableInNonFx = false } = {}){" in html
    assert "syncTileFxLifecycleToView(nextView, 'setView:fx');" in html
    assert 'tileFX.start();' in html
    assert 'window.tileFX = tileFX;' in html
    assert 'window.destroyTileFX = destroyTileFX;' in html
    assert 'window.setViewMode = setView;' in html
    assert "function destroyTileFX(reason = 'manual', { force = false } = {}){" in html
    assert "syncTileFxLifecycleToView(nextView, 'setView:non-fx');" in html
    assert "syncTileFxLifecycleToView(state.view, `destroy:${reason}`, { forceDisableInNonFx: true });" in html
    assert html.count('tileFX.enable(') >= 2
    assert html.count('tileFX.disable(') >= 2
    assert html.count('tileFX.start();') >= 2
    assert html.count('tileFX.stop();') >= 2
    assert 'return assertTileFxViewLifecycle(`sync:${reason}`);' in html
    assert 'tileFX.restoreAllDomSwaps?.();' in html
    assert 'tileFX.noteScroll();' in html
    assert 'const TILEFX_SCAN_MIN_INTERVAL_MS = 120;' in html
    assert "`mode: ${state.view} | enabled: ${runtimeEnabled ? '1' : '0'} | raf: ${runtimeRafRunning ? '1' : '0'}`" in html
    assert "console.error('TileFX invariant breach: drawCalls > 0 while not in FX mode');" in html
    assert "const activeContainer = (state.view === 'list') ? l : g;" in html
    assert 'await refreshExplorerData({ toastOnSuccess: false });' in html
    assert 'if (ui.inspectorOpen) {' in html
    assert 'state.focused = null;' in html
    assert "const LAYOUT_DEBUG = new URLSearchParams(window.location.search).get('layoutdebug') === '1';" in html
    assert 'function logLayoutDebug()' in html
    assert 'function setNodeStyleSafe(node, prop, value)' in html
    assert 'function setNodeDataSafe(node, key, value)' in html
    assert 'function sanitizeRootOverlayInterceptors()' in html
    assert 'html > div[style*="all: initial"]' in html
    assert 'overlaySanitizedCount: offenders.length' in html
    assert "hitPath: path.join(' > ')," in html
    assert 'canvasZIndex: fxCanvasStyle?.zIndex || null,' in html
    assert 'gridRootZIndex: rs.zIndex,' in html
    assert 'canvasHeightPx: fxCanvas?.height || null,' in html
    assert "scheduleTileFxCollect('visual-viewport-live');" in html
    assert 'gridScrollHeight: gridRoot.scrollHeight,' in html
    assert 'tileFxCanvasTransformedAncestor:' in html
    assert 'tileFxCanvasTransformChain:' in html
    assert '#mediaGridRoot{' in html and 'isolation: isolate;' in html
    assert '#mediaGridRoot.view-fx .asset[data-tex="1"] .thumb > img.asset-thumb,' in html
    assert 'body.fx-mode #mediaGridRoot.view-fx .asset.fx-swapped .thumb::before,' in html
    assert 'body.fx-safemode .content,' in html
    assert 'body:not(.fx-mode) #tilefxCanvas{ display: none !important; opacity: 0 !important; }' in html
    assert 'body.fx-mode.fx-swap-sanity #mediaGridRoot.view-fx .asset[data-tex="1"]{' in html
    assert 'armTileFxSwapSanity()' in html
    assert 'maybeToastTileFxPainterLeak(reason);' in html
    assert 'const TILEFX_SCAN_IDLE_INTERVAL_MS = 1000;' in html
    assert "scheduleTileFxCollect('idle-heartbeat')" in html
    assert "setInterval(() => {\n      if (state.view !== 'fx' || !window.__tilefx_enabled) return;\n      if (tileFxDbg.scrolling) return;" in html
    assert '// visualViewport handlers are resize/collect only; never mutate lifecycle state.' in html
    assert 'maxTex ${Number(tileFxDbg.maxTexEdge || 0)}' in html
    assert '.app{ position: relative; z-index: 2; }' in html
    assert 'z-index: var(--z-tilefx-canvas);' in html
    assert 'z-index: var(--z-hud);' in html
    assert 'overlaySanitizerObserver.observe(document.documentElement, { childList: true });' in html
    assert "setTimeout(() => overlaySanitizerObserver.disconnect(), 4000);" in html
    assert "setFxSuspend(open || ui.inspectorOpen);" in html
    assert '.asset:hover{ transform: translateY(-1px) scale(1.005);' not in html
    assert '.grid{' in html and 'grid-auto-flow: row;' in html
    assert '.grid{' in html and 'grid-template-columns: repeat(auto-fill, minmax(var(--grid-col-width), 1fr));' in html
    assert 'column-width: var(--grid-col-width);' not in html
    assert 'column-count:' not in html
    assert 'grid-auto-flow: column' not in html
    assert 'min-width: 0;' in html

@pytest.mark.skipif(os.environ.get("RUN_PLAYWRIGHT_E2E") != "1", reason="set RUN_PLAYWRIGHT_E2E=1 to run browser assertion")
def test_explorer_assetfx_context_singleton_runtime_with_playwright():
    playwright = pytest.importorskip("playwright.sync_api")
    with playwright.sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception as exc:
            pytest.skip(f"playwright browser unavailable: {exc}")
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
            pending = page.evaluate("window.__assetfx_dbg?.pendingDissolves ?? null")
            active = page.evaluate("window.__assetfx_dbg?.activeDissolves ?? null")
            assert contexts is not None
            assert contexts <= 1
            assert overlays <= 1
            assert pending is not None
            assert pending <= 60
            assert active is not None
            assert active <= 6
        finally:
            browser.close()


def test_explorer_card_shell_skin_and_bg_impulse_present():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '.asset .scrim{' in html
    assert '.asset .play-btn{' in html
    assert '.asset .preview-pill{' in html
    assert 'id="bgImpulseCanvas" class="bg-impulse-canvas"' in html
    assert 'function wireBackgroundImpulse()' in html
    assert "document.addEventListener('pointerdown', pushImpulse, { passive: true });" in html


def test_explorer_selection_order_badge_wiring_present():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '<span class="sel-order" data-no-preview="1" aria-hidden="true"></span>' in html
    assert 'function selectionOrderIndexMap()' in html
    assert 'function syncSelectionOrderBadges()' in html
    assert "badge.textContent = order ? String(Math.min(order, 99)) : '';" in html
    assert '<button id="clearSelBtn" class="btn" type="button" disabled>✕ Clear</button>' in html
    assert '<button id="clearSelBtnTop" class="btn" type="button" disabled>✕ Clear</button>' in html
    assert "if (clearBtnTop) clearBtnTop.disabled = !show;" in html
    assert '<div id="ui-portal" aria-hidden="false"></div>' in html
    assert "if (actionsPanel && actionsPanel.parentElement !== uiPortal) uiPortal.appendChild(actionsPanel);" in html
    assert "console.debug('[actions-panel]', { zIndex: getComputedStyle(actionsPanel).zIndex, transformedAncestor });" in html


def test_explorer_selection_click_is_scoped_to_sel_ui_only():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'class="selector sel-ui"' in html
    assert "const selUi = event.target.closest('.sel-ui[data-no-preview=\"1\"]');" in html
    assert "if (!event.target.closest('.sel-shell, .sel-order, input[type=\"checkbox\"][data-select-key]')) return;" in html


def test_explorer_assetfx_overlay_is_viewport_fixed_and_novirt_wired():
    shader_module = Path('public/js/explorer-shaders.mjs').read_text(encoding='utf-8')
    assert "position: 'fixed'" in shader_module
    assert "inset: '0'" in shader_module
    assert "width: '100vw'" in shader_module
    assert "height: 'calc(var(--vvh, 1vh) * 100)'" in shader_module
    assert 'function _vvHeight() {' in shader_module
    assert 'function setVisualVhVar() {' in shader_module
    assert 'function resizeCanvasToCss(canvas, dprCap = 2) {' in shader_module
    assert 'function resizeAllFxCanvases({ dprCap = 2, tilefxRenderer = null, assetfxRenderer = null } = {}) {' in shader_module
    assert "vv.addEventListener('scroll', () => resizeAllFxCanvases({ dprCap: 2 }), { passive: true });" in shader_module
    assert 'tilefxRenderer.setResolution?.(tilefxCanvas.width, tilefxCanvas.height, tilefxSize.dpr);' in shader_module
    assert 'assetfxRenderer.setResolution?.(sharedCanvas.width, sharedCanvas.height, sharedSize.dpr);' in shader_module
    assert "zIndex: '0'" in shader_module
    assert 'document.body.prepend(canvas)' in shader_module
    assert "params.get('novirt') === '1' || params.get('keep') === '1'" in shader_module
    assert 'if (this.noVirtualization && !visible) return false;' in shader_module


def test_explorer_fx_canvas_css_contract_uses_visual_viewport_var():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '--vvh: 1vh;' in html
    assert 'canvas.fx-debug-overlay,' in html
    assert '#bgImpulseCanvas,' in html
    assert '#tilefxCanvas{' in html
    assert 'position: fixed !important;' in html
    assert 'width: 100vw !important;' in html
    assert 'height: calc(var(--vvh) * 100) !important;' in html


def test_explorer_thumb_cache_sticky_loaded_contract_present():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert 'const thumbStateCache = new Map();' in html
    assert "function thumbStateKey(item, selectKey = '', thumbKey = ''){" in html
    assert 'const cachedThumbState = getThumbCachedState(thumbStateKeyValue);' in html
    assert "if (job.target?.dataset && job.target.dataset.thumbState !== 'loaded') job.target.dataset.thumbState = 'loading';" in html
    assert "setThumbCachedState(job.stateKey, 'loaded', job.url);" in html
    assert 'data-thumb-state-key="${escapeHtml(thumbStateKeyValue)}"' in html
    assert 'img.src = ""' not in html
    assert "removeAttribute('src')" not in html


def test_explorer_overlay_sanitizer_inert_contract_present():
    html = Path('public/explorer.html').read_text(encoding='utf-8')
    assert '.fx-shared-overlay,' in html
    assert '[data-overlay-sanitized="1"]{' in html
    assert "setNodeStyleSafe(node, 'pointerEvents', 'none');" in html
    assert "setNodeDataSafe(node, 'overlaySanitized', '1');" in html
