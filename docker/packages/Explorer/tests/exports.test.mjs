import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

test('package exports include entrypoints', () => {
  const pkg = readJson(path.join(packageRoot, 'package.json'));
  assert.ok(pkg.exports['.']);
  assert.equal(pkg.exports['./styles.css'], './src/styles.css');
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'thumbnailLoader.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'useThumbnailQueue.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'useAssetInteractions.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'useTopbarScrollState.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'AssetList.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'styles.css')));
});

test('standalone app entry exists', () => {
  assert.ok(fs.existsSync(path.join(packageRoot, 'app', 'page.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'app', 'layout.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'app', 'not-found.tsx')));
});

test('package app layout owns default App Router not-found fonts and wiring', () => {
  const layoutPath = path.join(packageRoot, 'app', 'layout.tsx');
  const notFoundPath = path.join(packageRoot, 'app', 'not-found.tsx');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  const notFound = fs.readFileSync(notFoundPath, 'utf8');
  assert.ok(layout.includes('fonts.googleapis.com'));
  assert.ok(layout.includes('fonts.gstatic.com'));
  assert.ok(layout.includes("viewportFit: 'cover'"));
  assert.ok(!layout.includes("from 'next/font/google'"));
  assert.ok(notFound.includes('data-explorer-default-not-found="true"'));
  assert.ok(notFound.includes('data-explorer-not-found-scene="multi-phase"'));
  assert.ok(notFound.includes("type Phase = 'idle' | 'warp' | 'arrival' | 'exit';"));
  assert.ok(notFound.includes('uniform float u_envMix;'));
  assert.ok(notFound.includes('uniform float u_warp;'));
  assert.ok(notFound.includes('uniform float u_camZ;'));
  assert.ok(notFound.includes('const didNavigateRef = useRef(false);'));
  assert.ok(notFound.includes("const prefersReducedMotion = useReducedMotionPreference();"));
  assert.ok(notFound.includes("phaseRef.current = 'warp'"));
  assert.ok(notFound.includes("phaseRef.current = 'arrival'"));
  assert.ok(notFound.includes("phaseRef.current = 'exit'"));
  assert.ok(notFound.includes("router.push('/')"));
  assert.ok(notFound.includes("canvas.addEventListener('webglcontextrestored', handleContextRestored);"));
  assert.ok(notFound.includes("arrivalWrap?.classList.add('show');"));
  assert.ok(notFound.includes("voidWrap?.classList.add('arrival-ready');"));
  assert.ok(notFound.includes('requestAnimationFrame(renderScene)'));
  assert.ok(notFound.includes('data-webgl-fallback="true"'));
  assert.ok(notFound.includes('data-webgl-canvas="phase-scene"'));
  assert.ok(!notFound.includes("@import url('https://fonts.googleapis.com"));
});

test('explorer resolves media urls against api base', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('api.buildUrl'));
  assert.ok(content.includes('resolveAssetUrl'));
  assert.ok(content.includes('formatListValue'));
  assert.ok(content.includes('buildUploadUrl'));
  assert.ok(content.includes('handleBulkTag'));
  assert.ok(content.includes('handleComposeSelected'));
  assert.ok(content.includes('AssetPreviewPanel'));
  assert.ok(content.includes('normalizePreviewAsset'));
});

test('preview adapter and panel keep drawer-based preview contract', () => {
  const adapterPath = path.join(packageRoot, 'src', 'previewAdapter.ts');
  const panelPath = path.join(packageRoot, 'src', 'AssetPreviewPanel.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const adapter = fs.readFileSync(adapterPath, 'utf8');
  const panel = fs.readFileSync(panelPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(adapter.includes('normalizePreviewAsset'));
  assert.ok(adapter.includes('id:'));
  assert.ok(adapter.includes('quick'));
  assert.ok(panel.includes('preview-overlay'));
  assert.ok(panel.includes('onMediaReady'));
  assert.ok(panel.includes('preview-wave'));
  assert.ok(styles.includes('.preview-shell'));
  assert.ok(styles.includes('.preview-overlay.fade'));
  assert.ok(!panel.includes('preview-center-play'));
  assert.ok(panel.includes('preview-scrubber'));
  assert.ok(panel.includes('preview-icon-btn'));
  assert.ok(panel.includes('onObs'));
  assert.ok(panel.includes('onTag'));
  assert.ok(panel.includes('onResolve'));
  assert.ok(panel.includes('onProgramMonitor'));
  assert.ok(panel.includes('stopMediaPlayback'));
  assert.ok(panel.includes('handleOverlayTapToggle'));
  assert.ok(panel.includes('onClick={handleClose}'));
  assert.ok(panel.includes('preview-obs-row'));
  assert.ok(panel.includes('obsMode'));
  assert.ok(styles.includes('.preview-shell'));
  assert.ok(styles.includes('.preview-overlay.fade'));
  assert.ok(styles.includes('.preview-control-row'));
  assert.ok(styles.includes('.preview-center-play'));
  assert.ok(styles.includes('.preview-obs-row'));
  assert.ok(styles.includes('width: min(640px, 100vw);'));
  assert.ok(styles.includes('.preview-shell::after'));
  assert.ok(styles.includes('@media (max-width: 860px){'));
  assert.ok(!styles.includes('max-height: 70vh;'));
});


test('package preview overlay wires semantic action callbacks from ExplorerApp', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('handleFocusedObs'));
  assert.ok(content.includes('handleFocusedTag'));
  assert.ok(content.includes('handleFocusedResolve'));
  assert.ok(content.includes('handleFocusedProgramMonitor'));
  assert.ok(content.includes('onObs={() => { void handleFocusedObs(); }}'));
  assert.ok(content.includes('onTag={() => { void handleFocusedTag(); }}'));
  assert.ok(content.includes('onResolve={() => { void handleFocusedResolve(); }}'));
  assert.ok(content.includes('onProgramMonitor={() => { void handleFocusedProgramMonitor(); }}'));
  assert.ok(content.includes('obsMode={previewObsMode}'));
  assert.ok(content.includes('onObsModeChange={setPreviewObsMode}'));
});

test('normalized preview asset declaration is placed after resolveAssetUrl callback', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const resolveIndex = content.indexOf('const resolveAssetUrl = useCallback');
  const thumbSignatureIndex = content.indexOf('const thumbDatasetSignature = useMemo');
  const normalizedIndex = content.indexOf('const normalizedPreviewAsset = useMemo');
  assert.ok(resolveIndex >= 0);
  assert.ok(thumbSignatureIndex > resolveIndex);
  assert.ok(normalizedIndex > resolveIndex);
});

test('explorer api client includes bulk media action endpoints', () => {
  const apiPath = path.join(packageRoot, 'src', 'api.ts');
  const content = fs.readFileSync(apiPath, 'utf8');
  assert.ok(content.includes('bulkDeleteMedia'));
  assert.ok(content.includes("/api/assets/bulk/delete"));
  assert.ok(content.includes('bulkMoveMedia'));
  assert.ok(content.includes("/api/assets/bulk/move"));
  assert.ok(content.includes('bulkTagMedia'));
  assert.ok(content.includes("/api/assets/bulk/tags"));
  assert.ok(content.includes('bulkComposeMedia'));
  assert.ok(content.includes("/api/assets/bulk/compose"));
});

test('api base inference keeps LAN host reachable', () => {
  const utilsPath = path.join(packageRoot, 'src', 'utils.ts');
  const content = fs.readFileSync(utilsPath, 'utf8');
  assert.ok(content.includes('inferApiBaseUrl'));
  assert.ok(content.includes('media-sync-api'));
  assert.ok(content.includes(':8787'));
  assert.ok(content.includes("if (!trimmed) {"));
  assert.ok(content.includes("currentPort !== '8787'"));
});

test('clipboard helper includes fallback copy behavior', () => {
  const utilsPath = path.join(packageRoot, 'src', 'utils.ts');
  const content = fs.readFileSync(utilsPath, 'utf8');
  assert.ok(content.includes('copyTextWithFallback'));
  assert.ok(content.includes("document.execCommand('copy')"));
});

test('media sorting helper orders by recent timestamps', () => {
  const statePath = path.join(packageRoot, 'src', 'state.ts');
  const content = fs.readFileSync(statePath, 'utf8');
  assert.ok(content.includes('sortMediaByRecent'));
  assert.ok(content.includes('updated_at'));
  assert.ok(content.includes('created_at'));
  assert.ok(content.includes('uploaded_at'));
  assert.ok(content.includes('indexed_at'));
  assert.ok(content.includes('filenameTimestamp'));
});

test('explorer supports all-project media view', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('loadAllMedia'));
  assert.ok(content.includes('Media — All Projects'));
  assert.ok(content.includes('buildThumbFallback'));
});

test('asset tile preview open path requires second tap intent and keeps focus separate from selection', () => {
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const list = fs.readFileSync(listPath, 'utf8');
  assert.ok(hookContent.includes('lastTileTapRef'));
  assert.ok(hookContent.includes('const isSecondTap = prevTap.key === itemKey'));
  assert.ok(hookContent.includes('focusAsset(item, itemKey);'));
  assert.ok(hookContent.includes('if (isSecondTap) {'));
  assert.ok(hookContent.includes('openDrawer(item);'));
  assert.ok(explorer.includes("const [activeAssetKey, setActiveAssetKey] = useState('');"));
  assert.ok(explorer.includes('const focusAsset = useCallback((item: MediaItem, itemKey?: string) => {'));
  assert.ok(explorer.includes('setActiveAssetKey(nextKey);'));
  assert.ok(!explorer.includes(`const focusAsset = useCallback((item: MediaItem, itemKey?: string) => {
    const nextKey = itemKey || assetSelectionKey(item, activeProject);
    if (!nextKey) return;
    setActiveAssetKey(nextKey);
    setFocused(item);`));
  assert.ok(explorer.includes('if (!inspectorOpen || !focused) return null;'));
  assert.ok(explorer.includes('if (!inspectorOpen || !focused) return [];'));
  assert.ok(explorer.includes('const isActive = activeAssetKey === selectionKey;'));
  assert.ok(explorer.includes('const selectionOrderIndex = selectedOrderMap.get(selectionKey) ?? 0;'));
  assert.ok(grid.includes('<img'));
  assert.ok(!grid.includes('<video'));
  assert.ok(list.includes('<img'));
  assert.ok(!list.includes('<video'));
  assert.ok(grid.includes("data-active={viewModel.isActive ? 'true' : 'false'}"));
  assert.ok(list.includes("data-active={viewModel.isActive ? 'true' : 'false'}"));
  assert.ok(list.includes('data-no-preview="1"'));
});

test('compose action filters selected assets to videos', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes("selectionItems.filter((item) => guessKind(item) === 'video')"));
  assert.ok(content.includes('Select one or more video clips'));
  assert.ok(content.includes("addToast('warn', 'Compose', 'Select one or more clips')"));
  assert.ok(content.includes('const buildComposeTimestampName = () => {'));
  assert.ok(content.includes("entry?.name === 'P5-SHARED-Exported-Media'"));
  assert.ok(content.includes('setComposeModalOpen(true);'));
  assert.ok(content.includes('className={`compose-modal ${composeModalOpen ? \'open\' : \'\'}`}'));
  assert.ok(content.includes('const [composeSubmitting, setComposeSubmitting] = useState(false);'));
  assert.ok(content.includes('data-compose-project-picker="1"'));
  assert.ok(content.includes('onSubmit={(event) => {'));
  assert.ok(content.includes('className="btn good" type="submit" disabled={composeSubmitting}'));
  assert.ok(content.includes("addToast('good', 'Compose', `Created ${composedPath}`)"));
  assert.ok(content.includes('target_dir: \'exports\''));
  assert.ok(content.includes("mode: 'encode'"));
  assert.ok(content.includes('allow_overwrite: false,'));
  assert.ok(content.includes('if (composeSubmitting) {'));
  assert.ok(content.includes('setComposeSubmitting(true);'));
  assert.ok(content.includes('setComposeSubmitting(false);'));
  assert.ok(content.includes("{composeSubmitting ? 'Composing...' : 'Compose'}"));
  assert.ok(content.includes('disabled={composeSubmitting}'));
  assert.ok(content.includes('aria-busy={composeSubmitting}'));
  const composeStart = content.indexOf('const handleComposeSelected = useCallback(async () => {');
  const composeEnd = content.indexOf('const handleComposeConfirm = useCallback(async () => {', composeStart);
  assert.ok(composeStart >= 0);
  assert.ok(composeEnd > composeStart);
  const composeBlock = content.slice(composeStart, composeEnd);
  assert.ok(!composeBlock.includes('window.prompt('));
  const confirmEnd = content.indexOf('const handleResolve = useCallback(async () => {', composeEnd);
  const confirmBlock = content.slice(composeEnd, confirmEnd);
  assert.ok(confirmBlock.includes("mode: 'encode'"));
  assert.ok(!confirmBlock.includes("mode: 'auto'"));
  assert.ok(!confirmBlock.includes("Select one or more video clips');\n      setComposeModalOpen(false);"));
  assert.ok(confirmBlock.includes('} finally {'));
});

test('package explorer delete actions route through custom confirmation modal', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(content.includes('const [deleteModalOpen, setDeleteModalOpen] = useState(false);'));
  assert.ok(content.includes('const [pendingDeleteSelectionKeys, setPendingDeleteSelectionKeys] = useState<string[]>([]);'));
  assert.ok(content.includes('const performDeleteMediaSelection = useCallback('));
  assert.ok(content.includes('const deleteMediaSelection = useCallback((selectionKeys: string[]) => {'));
  assert.ok(content.includes('setPendingDeleteSelectionKeys(resolveSelectionKeysForItems(items));'));
  assert.ok(content.includes('setDeleteModalOpen(true);'));
  assert.ok(content.includes('const handleDeleteConfirm = useCallback(async () => {'));
  assert.ok(content.includes('await performDeleteMediaSelection(selectionKeys);'));
  assert.ok(content.includes('const handleDeleteCancel = useCallback(() => {'));
  assert.ok(content.includes('setPendingDeleteSelectionKeys([]);'));
  assert.ok(content.includes("className={`confirm-modal ${deleteModalOpen ? 'open' : ''}`}"));
  assert.ok(content.includes('id="confirmDeleteTitle" className="confirm-title"'));
  assert.ok(content.includes("pendingDeleteSelectionKeys.length === 1 ? 'Delete this asset?' : `Delete ${Math.max(1, pendingDeleteSelectionKeys.length)} assets?`"));
  assert.ok(content.includes('onClick={() => deleteMediaSelection(selectedKeysOrdered)}'));
  assert.ok(content.includes("handler: () => deleteMediaSelection(resolveSelectionKeysForItems(items)),"));
  assert.ok(content.includes("onDelete={() => { if (focused) void deleteMediaSelection([assetSelectionKey(focused, activeProject)]); }}"));
  assert.ok(content.includes('if (deleteSubmitting) return;'));
  assert.ok(content.includes("{deleteSubmitting ? 'Deleting...' : 'Delete'}"));
  assert.ok(!content.includes('window.confirm'));
  const deleteStart = content.indexOf('const deleteMediaSelection = useCallback((selectionKeys: string[]) => {');
  const confirmStart = content.indexOf('const handleDeleteConfirm = useCallback(async () => {', deleteStart);
  assert.ok(deleteStart >= 0);
  assert.ok(confirmStart > deleteStart);
  const deleteBlock = content.slice(deleteStart, confirmStart);
  assert.ok(!deleteBlock.includes('await api.bulkDeleteMedia(refs);'));
  const confirmEnd = content.indexOf('const handleDeleteCancel = useCallback(() => {', confirmStart);
  const confirmBlock = content.slice(confirmStart, confirmEnd);
  assert.ok(confirmBlock.includes('await performDeleteMediaSelection(selectionKeys);'));
  assert.ok(styles.includes('.confirm-modal{'));
  assert.ok(styles.includes('.confirm-card{'));
  assert.ok(styles.includes('z-index: 126;'));
  assert.ok(styles.includes('pointer-events: auto;'));
});

test('package explorer compose modal styles are present', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(styles.includes('.compose-modal{'));
  assert.ok(styles.includes('.compose-card{'));
  assert.ok(styles.includes('.compose-field select{'));
  assert.ok(styles.includes('env(safe-area-inset-top)'));
});

test('topbar dropdown and sidebar scroll contracts avoid clipping and preserve pane-owned scrolling', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(styles.includes('.topbar{'));
  assert.ok(styles.includes('isolation: isolate;'));
  assert.ok(styles.includes('overflow: visible;'));
  assert.ok(!styles.includes('contain: paint;'));
  assert.ok(styles.includes('.sidebar.sidebar-drawer{'));
  assert.ok(styles.includes('touch-action: pan-y;'));
  assert.ok(styles.includes('.sidebar .scroll{'));
  assert.ok(styles.includes('height: 100%;'));
  assert.ok(styles.includes('overflow-y: auto;'));
  assert.ok(styles.includes('overscroll-behavior-y: contain;'));
  assert.ok(styles.includes(`@media (max-width: 860px){
  body{ overflow:hidden; }`));
});

test('brand area still toggles the project panel and is not blocked by reveal layers', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(explorer.includes('const toggleSidebarOpen = useCallback(() => {'));
  assert.ok(explorer.includes("className={`brand ${sidebarOpen ? 'projects-open' : ''}`}"));
  assert.ok(explorer.includes('role="button"'));
  assert.ok(explorer.includes('tabIndex={0}'));
  assert.ok(explorer.includes('onClick={toggleSidebarOpen}'));
  assert.ok(explorer.includes("if (event.key !== 'Enter' && event.key !== ' ') return;"));
  assert.ok(styles.includes('.brand{'));
  assert.ok(styles.includes('cursor: pointer;'));
  assert.ok(styles.includes('pointer-events: auto;'));
  assert.ok(styles.includes('.app:not(.topbar-hidden) .topbar-reveal{'));
  assert.ok(styles.includes('pointer-events: none;'));
});

test('static explorer uses OBS push helper', () => {
  const explorerPath = path.resolve(packageRoot, '..', '..', '..', 'public', 'explorer.html');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('obsPushBrowserMedia'));
  assert.ok(!content.includes('resolveObsInputName'));
});

test('static OBS player page exists', () => {
  const playerPath = path.resolve(packageRoot, '..', '..', '..', 'public', 'player.html');
  const content = fs.readFileSync(playerPath, 'utf8');
  assert.ok(content.includes('OBS Player'));
  assert.ok(content.includes('object-fit'));
});

test('OBS websocket helper includes browser source defaults', () => {
  const obsPath = path.resolve(packageRoot, '..', '..', '..', 'public', 'js', 'obs-push.js');
  const content = fs.readFileSync(obsPath, 'utf8');
  assert.ok(content.includes('obsPushBrowserMedia'));
  assert.ok(content.includes('CreateInput'));
  assert.ok(content.includes('SetInputSettings'));
  assert.ok(content.includes('already exists'));
  assert.ok(content.includes('resolveInputName'));
  assert.ok(content.includes('cleanupExtraInputs'));
  assert.ok(content.includes('ensureBrowserInput'));
  assert.ok(content.includes('GetVideoSettings'));
  assert.ok(content.includes('GetInputSettings'));
  assert.ok(content.includes('snapBrowserSourceToCanvas'));
  assert.ok(content.includes('outputWidth'));
  assert.ok(content.includes('TOP_LEFT_ALIGNMENT'));
  assert.ok(content.includes('SetSceneItemTransform'));
  assert.ok(content.includes('reroute_audio'));
});

test('explorer queues thumbnail loads from server urls', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const loaderPath = path.join(packageRoot, 'src', 'thumbnailLoader.ts');
  const hookPath = path.join(packageRoot, 'src', 'useThumbnailQueue.ts');
  const statePath = path.join(packageRoot, 'src', 'state.ts');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const gridContent = fs.readFileSync(gridPath, 'utf8');
  const loaderContent = fs.readFileSync(loaderPath, 'utf8');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const stateContent = fs.readFileSync(statePath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(content.includes('useThumbnailQueue({'));
  assert.ok(content.includes('thumbDatasetSignature'));
  assert.ok(content.includes('buildThumbJobKey('));
  assert.ok(gridContent.includes('data-thumb-url'));
  assert.ok(content.includes('CONTENT_LOADING_DELAY_MS'));
  assert.ok(content.includes('pendingDataLoadOverlay'));
  assert.ok(content.includes('dynamicOrientations'));
  assert.ok(content.includes('resolveItemOrientation'));
  assert.ok(content.includes('buildMasonryColumns'));
  assert.ok(gridContent.includes('masonryColumns.map((column, columnIndex) => ('));
  assert.ok(gridContent.includes('--masonry-column-count'));
  assert.ok(stateContent.includes('export function buildMasonryColumns'));
  assert.ok(styles.includes('.masonry-columns{'));
  assert.ok(styles.includes('.masonry-column{'));
  assert.ok(styles.includes('-webkit-touch-callout: none;'));
  assert.ok(!styles.includes('column-fill: balance;'));
  assert.ok(content.includes('beginContentLoading'));
  assert.ok(content.includes('endContentLoading'));
  assert.ok(loaderContent.includes('export const THUMB_LOAD_TIMEOUT_MS = 8000;'));
  assert.ok(loaderContent.includes('thumbLoadStateCache'));
  assert.ok(loaderContent.includes('thumbLoadedKey'));
  assert.ok(hookContent.includes('requiresThumbNodeSync'));
  assert.ok(hookContent.includes('hasPendingThumbNetworkLoad'));
  assert.ok(content.includes('project_source'));
});

test('package explorer interaction handlers do not trigger loading overlay state', () => {
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const content = fs.readFileSync(hookPath, 'utf8');
  const start = content.indexOf('const buildAssetPointerHandlers = useCallback(');
  const end = content.indexOf('return {', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const block = content.slice(start, end);
  assert.ok(block.includes('openDrawer(item);'));
  assert.ok(block.includes('openContextMenu(event.clientX, event.clientY, resolveContextItems())'));
  assert.ok(block.includes('event.stopPropagation();'));
  assert.ok(!block.includes('setPendingDataLoadOverlay('));
  assert.ok(!block.includes('setContentLoading(true)'));
});

test('package explorer context menu opens only on deliberate long press or context click', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const explorerContent = fs.readFileSync(explorerPath, 'utf8');
  const content = fs.readFileSync(hookPath, 'utf8');
  const start = content.indexOf('const buildAssetPointerHandlers = useCallback(');
  const end = content.indexOf('return {', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const block = content.slice(start, end);
  assert.ok(content.includes('const LONG_PRESS_MS = 620;'));
  assert.ok(content.includes('const LONG_PRESS_MOVE_CANCEL_PX = 12;'));
  assert.ok(block.includes("if (event.pointerType === 'touch' || event.pointerType === 'pen')"));
  assert.ok(block.includes('longPressTimerRef.current = window.setTimeout(() => {'));
  assert.ok(block.includes('longPressFiredRef.current = true;'));
  assert.ok(block.includes('const movedFar = (dx * dx + dy * dy) > LONG_PRESS_MOVE_CANCEL_PX * LONG_PRESS_MOVE_CANCEL_PX;'));
  assert.ok(block.includes('if (movedFar) {'));
  assert.ok(block.includes('if (longPressFired) {'));
  assert.ok(block.includes('if (event.pointerType === \'touch\' || event.pointerType === \'pen\') {'));
  assert.ok(block.includes('if (event.pointerType === \'mouse\' && event.button !== 0) return;'));
  assert.ok(explorerContent.includes('onScroll={clearPendingLongPress}'));
});

test('package explorer grid capture suppresses native context menu in asset zones', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const gridContent = fs.readFileSync(gridPath, 'utf8');
  const listContent = fs.readFileSync(listPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(content.includes('onContextMenuCapture={(event) => {'));
  assert.ok(content.includes("if (!target?.closest('.asset, .row')) return;"));
  assert.ok(content.includes('event.preventDefault();'));
  assert.ok(content.includes('event.stopPropagation();'));
  assert.ok(gridContent.includes('onContextMenu={(event) => {'));
  assert.ok(gridContent.includes('onDragStart={(event) => event.preventDefault()}'));
  assert.ok(gridContent.includes('draggable={false}'));
  assert.ok(listContent.includes('onContextMenu={(event) => {'));
  assert.ok(listContent.includes('onDragStart={(event) => event.preventDefault()}'));
  assert.ok(gridContent.includes('asset-interactive-surface'));
  assert.ok(listContent.includes('asset-interactive-surface'));
  assert.ok(content.includes('custom-ui-surface'));
  assert.ok(styles.includes('.asset-interactive-surface,'));
  assert.ok(styles.includes('.custom-ui-surface,'));
  assert.ok(styles.includes('-webkit-touch-callout: none;'));
  assert.ok(styles.includes('-webkit-tap-highlight-color: transparent;'));
  assert.ok(styles.includes('.tile-ui-text{'));
});


test('package explorer keeps form controls usable while suppressing native selection on custom surfaces', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const previewPath = path.join(packageRoot, 'src', 'AssetPreviewPanel.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  const preview = fs.readFileSync(previewPath, 'utf8');
  assert.ok(content.includes('className={`content custom-ui-surface'));
  assert.ok(content.includes('className={`selectbar custom-ui-surface'));
  assert.ok(content.includes('className="context-menu open custom-ui-surface"'));
  assert.ok(styles.includes('.custom-ui-surface input,'));
  assert.ok(styles.includes('.custom-ui-surface textarea,'));
  assert.ok(styles.includes('.custom-ui-surface select,'));
  assert.ok(styles.includes('.custom-ui-surface [contenteditable="true"],'));
  assert.ok(styles.includes('-webkit-user-select: text;'));
  assert.ok(styles.includes('.custom-ui-surface button,'));
  assert.ok(preview.includes('draggable={false}'));
  assert.ok(preview.includes('onDragStart={(event) => event.preventDefault()}'));
});

test('package explorer context menu styles are explicit and stable', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(styles.includes('.context-menu{'));
  assert.ok(styles.includes('font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;'));
  assert.ok(styles.includes('font-size: 17px;'));
  assert.ok(styles.includes('line-height: 1.3;'));
  assert.ok(styles.includes('-webkit-text-size-adjust: 100%;'));
  assert.ok(styles.includes('text-size-adjust: 100%;'));
  assert.ok(styles.includes('width: min(320px, calc(100vw - 24px));'));
  assert.ok(styles.includes('.context-menu button:focus-visible'));
});

test('package explorer data load paths explicitly request loading overlay ownership', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'useThumbnailQueue.ts');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  assert.ok(content.includes('setPendingDataLoadOverlay(true);'));
  assert.ok(content.includes('setPendingDataLoadOverlay(false);'));
  assert.ok(hookContent.includes('const shouldShowOverlay = pendingDataLoadOverlay && syncTargets.some((target) => hasPendingThumbNetworkLoad(target));'));
  assert.ok(hookContent.includes('const loadingToken = shouldShowOverlay ? beginContentLoading() : 0;'));
  assert.ok(hookContent.includes('clearPendingDataLoadOverlay();'));
});


test('package explorer uses static-parity asset interaction semantics', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const gridContent = fs.readFileSync(gridPath, 'utf8');
  assert.ok(gridContent.includes('data-no-preview="1"'));
  assert.ok(hookContent.includes('if (inNoPreviewZone(event.target)) return;'));
  assert.ok(hookContent.includes('if (inspectorOpen) {'));
  assert.ok(hookContent.includes('closeDrawer();'));
  assert.ok(hookContent.includes('openDrawer(item);'));
  assert.ok(content.includes('toggleSelectionWithOrder'));
  assert.ok(content.includes('selectionOrderIndexMap'));
  assert.ok(content.includes('selectedOrderMap.get(selectionKey)'));
});

test('package explorer suppresses default context menu in tile preview zone', () => {
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const content = fs.readFileSync(hookPath, 'utf8');
  assert.ok(content.includes('const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {'));
  assert.ok(content.includes('event.preventDefault();'));
  assert.ok(content.includes('openContextMenu(event.clientX, event.clientY, resolveContextItems())'));
});

test('package explorer styles include static-parity selected glow and order badge', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(styles.includes('.asset.is-selected'));
  assert.ok(styles.includes('rgba(74,240,192,0.92)'));
  assert.ok(styles.includes('.selector .sel-order'));
  assert.ok(styles.includes('.asset.is-selected .selector .sel-order'));
});


test('package explorer topbar layout follows static two-row structure', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'useTopbarScrollState.ts');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(content.includes('<div className="topbar"'));
  assert.ok(content.includes('<div className="section-h">'));
  assert.ok(content.includes('aria-label="Toggle projects panel"'));
  assert.ok(!content.includes('className="btn mobile-only"'));
  assert.ok(styles.includes('--topbar-subrow-height'));
  assert.ok(styles.includes('.brand.projects-open .brand-title.is-secondary'));
  assert.ok(styles.includes('padding: var(--topbar-offset) 0 0;'));
  assert.ok(styles.includes('.content .scroll{'));
  assert.ok(content.includes('useTopbarScrollState({'));
  assert.ok(hookContent.includes('window.requestAnimationFrame(processScroll)'));
  assert.ok(hookContent.includes('scrollDeltaBudgetRef.current += delta;'));
  assert.ok(hookContent.includes('TOPBAR_HIDE_DELTA_PX'));
  assert.ok(hookContent.includes('TOPBAR_REVEAL_DELTA_PX'));
  assert.ok(styles.includes('will-change: transform, opacity;'));
  assert.ok(styles.includes('transform: translate3d(0, calc(-1 * var(--topbar-height)), 0);'));
});


test('package explorer project chips toggle selected project off to restore all-projects scope', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('const alreadySelected = Boolean(activeProject)'));
  assert.ok(content.includes("activeProject?.name === project.name"));
  assert.ok(content.includes("setActiveProject(null);"));
  assert.ok(content.includes("setMediaScope('all');"));
  assert.ok(content.includes("addToast('good', 'Project', 'Showing all projects');"));
  assert.ok(content.includes("setActiveProject(project);"));
  assert.ok(content.includes("setMediaScope('project');"));
});

test('package explorer sidebar scroll keeps touch scrolling enabled for project panel', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(styles.includes('.sidebar .scroll{'));
  assert.ok(styles.includes('-webkit-overflow-scrolling: touch;'));
  assert.ok(styles.includes('overscroll-behavior: contain;'));
  assert.ok(styles.includes('touch-action: pan-y;'));
});
