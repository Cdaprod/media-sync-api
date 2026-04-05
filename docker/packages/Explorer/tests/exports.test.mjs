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
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'PendingComposeAssetCard.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'composeJobs.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'usePendingComposeJobs.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'gsap.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'topbarMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'drawerMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'modalMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'toastMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'topbarSnapBand.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'explorer', 'density', 'createExplorerDensityController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'explorer', 'density', 'createPinchDensityController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'explorer', 'focus', 'focusWorldMotion.ts')));
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
  const globalsPath = path.join(packageRoot, 'app', 'globals.css');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  const notFound = fs.readFileSync(notFoundPath, 'utf8');
  const globals = fs.readFileSync(globalsPath, 'utf8');
  assert.ok(layout.includes('fonts.googleapis.com'));
  assert.ok(layout.includes('fonts.gstatic.com'));
  assert.ok(layout.includes("viewportFit: 'cover'"));
  assert.ok(layout.includes("width: 'device-width'"));
  assert.ok(layout.includes('initialScale: 1'));
  assert.ok(globals.includes('--safe-area-top: env(safe-area-inset-top, 0px);'));
  assert.ok(globals.includes('html,'));
  assert.ok(globals.includes('height: 100dvh;'));
  assert.ok(globals.includes('#__next,'));
  assert.ok(globals.includes('overflow: hidden;'));
  assert.ok(globals.includes('touch-action: manipulation;'));
  assert.ok(globals.includes('-webkit-text-size-adjust: 100%;'));
  assert.ok(globals.includes('text-size-adjust: 100%;'));
  assert.ok(globals.includes('padding-top: var(--safe-area-top);'));
  assert.ok(globals.includes('font-size: 16px;'));
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
  assert.ok(panel.includes('proxy-focused-details-panel'));
  assert.ok(panel.includes('metadataRows?: Array<[string, string]>;'));
  assert.ok(panel.includes('.map(([label, value], idx) => ('));
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
  assert.ok(!hookContent.includes('focusAsset(item, itemKey);\n        onTapFeedback?.({ x: event.clientX, y: event.clientY });'));
  assert.ok(hookContent.includes('focusAsset(item, itemKey);'));
  assert.ok(hookContent.includes('if (isSecondTap) {'));
  assert.ok(hookContent.includes("focusAsset(item, itemKey);\n          onTapStage?.('second', itemKey);"));
  assert.ok(hookContent.includes('openPreview(item);'));
  assert.ok(hookContent.includes("onTapStage?.('first', itemKey);"));
  assert.ok(hookContent.includes("onTapStage?.('second', itemKey);"));
  assert.ok(hookContent.includes('onHoldEmphasis?.(itemKey, true);'));
  assert.ok(explorer.includes("const [activeAssetKey, setActiveAssetKey] = useState('');"));
  assert.ok(explorer.includes("const [previewActivationKey, setPreviewActivationKey] = useState('');"));
  assert.ok(explorer.includes('const commitPreviewActivationKey = useCallback((nextKey: string) => {'));
  assert.ok(explorer.includes('setTapOverlayTrigger((prev) => prev + 1);'));
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
  assert.ok(explorer.includes('const isSecondTapReinforced = reinforcedActiveKey === selectionKey;'));
  assert.ok(explorer.includes('const isHoldEmphasis = holdEmphasisKey === selectionKey;'));
  assert.ok(explorer.includes('const isActivated = previewActivationKey === selectionKey;'));
  assert.ok(explorer.includes("const previewPlaybackKey = isActivated ? `${selectionKey}:${previewPlaybackToken}` : '';"));
  assert.ok(explorer.includes('const selectionOrderIndex = selectedOrderMap.get(selectionKey) ?? 0;'));
  assert.ok(grid.includes('<img'));
  assert.ok(grid.includes('activeVideoPreviewUrl'));
  assert.ok(explorer.includes("isActivated && kind === 'video'"));
  assert.ok(grid.includes('className="asset-thumb-preview"'));
  assert.ok(grid.includes('key={viewModel.previewPlaybackKey}'));
  assert.ok(list.includes('<img'));
  assert.ok(list.includes('activeVideoPreviewUrl'));
  assert.ok(list.includes('className="asset-thumb-preview"'));
  assert.ok(list.includes('key={viewModel.previewPlaybackKey}'));
  assert.ok(grid.includes("data-active={viewModel.isActive ? 'true' : 'false'}"));
  assert.ok(list.includes("data-active={viewModel.isActive ? 'true' : 'false'}"));
  assert.ok(explorer.includes("commitPreviewActivationKey('');"));
  assert.ok(explorer.includes('commitPreviewActivationKey(itemKey);'));
  assert.ok(list.includes('data-no-preview="1"'));
  assert.ok(grid.includes('is-active-reinforced'));
  assert.ok(grid.includes('is-hold-emphasis'));
});

test('topbar interaction boundaries protect header controls and nearby asset selectors', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const utilsPath = path.join(packageRoot, 'src', 'utils.ts');
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const utils = fs.readFileSync(utilsPath, 'utf8');
  const hook = fs.readFileSync(hookPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const list = fs.readFileSync(listPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.ok(utils.includes('export function isInteractiveTarget'));
  assert.ok(utils.includes('export function isTopbarOwnedTarget'));
  assert.ok(utils.includes("'[data-topbar-control=\"true\"]'"));
  assert.ok(utils.includes("'summary'"));
  assert.ok(utils.includes("'[data-interactive=\"true\"]'"));
  assert.ok(explorer.includes("const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;"));
  assert.ok(explorer.includes("const isTouchPrimary = window.matchMedia('(hover: none) and (pointer: coarse)').matches;"));
  assert.ok(explorer.includes('if (isTouchPrimary) return;'));
  assert.ok(explorer.includes('if (!isTouchPrimary) {'));
  assert.ok(explorer.includes("document.addEventListener('pointerdown', handleOutside);"));
  assert.ok(explorer.includes("document.removeEventListener('pointerdown', handleOutside);"));
  assert.ok(explorer.includes('if (isTopbarOwnedTarget(event.target)) return;'));
  assert.ok(explorer.includes('const pinTopbarTemporarily = useCallback((ms = 900) => {'));
  assert.ok(explorer.includes('topbarIntentRef.current?.setPinned(true);'));
  assert.ok(explorer.includes('topbarIntentRef.current?.setPinned(false);'));
  assert.ok(explorer.includes('onPointerDown={() => pinTopbarTemporarily(900)}'));
  assert.ok(explorer.includes('const mediaContentRef = useRef<HTMLDivElement | null>(null);'));
  assert.ok(explorer.includes('const mediaScrollViewportRef = useRef<HTMLDivElement | null>(null);'));
  assert.ok(explorer.includes("const [topbarMeasuredHeight, setTopbarMeasuredHeight] = useState(0);"));
  assert.ok(explorer.includes('const [topbarHasOpenDropdown, setTopbarHasOpenDropdown] = useState(false);'));
  assert.ok(explorer.includes('const [topbarFocusWithin, setTopbarFocusWithin] = useState(false);'));
  assert.ok(explorer.includes('const topbarInsetPrevRef = useRef(0);'));
  assert.ok(explorer.includes('const updateTopbarMeasuredHeight = () => {'));
  assert.ok(explorer.includes('const observer = new ResizeObserver(() => updateTopbarMeasuredHeight());'));
  assert.ok(explorer.includes("document.addEventListener('gesturestart', blockGesture, listenerOptions);"));
  assert.ok(explorer.includes("document.addEventListener('gesturechange', blockGesture, listenerOptions);"));
  assert.ok(explorer.includes("document.addEventListener('gestureend', blockGesture, listenerOptions);"));
  assert.ok(explorer.includes("document.addEventListener('touchstart', blockMultiTouch, listenerOptions);"));
  assert.ok(explorer.includes('const topbarGap = Number.parseFloat(styles.getPropertyValue(\'--topbar-gap\')) || 0;'));
  assert.ok(explorer.includes('const nextInset = Math.max(0, topbarMeasuredHeight + topbarGap);'));
  assert.ok(explorer.includes('const delta = nextInset - topbarInsetPrevRef.current;'));
  assert.ok(explorer.includes('suppressAutoToggle();'));
  assert.ok(explorer.includes('scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);'));
  assert.ok(explorer.includes('|| actionsOpen'));
  assert.ok(explorer.includes('|| topbarHasOpenDropdown'));
  assert.ok(explorer.includes('|| topbarFocusWithin'));
  assert.ok(explorer.includes("topbar.addEventListener('toggle', handleDropdownToggle, true);"));
  assert.ok(explorer.includes("topbar.removeEventListener('toggle', handleDropdownToggle, true);"));
  assert.ok(explorer.includes('rootRef: mediaContentRef,'));
  assert.ok(explorer.includes('scrollRef: mediaScrollViewportRef,'));
  assert.ok(explorer.includes('ref={mediaContentRef}'));
  assert.ok(explorer.includes('ref={mediaScrollViewportRef}'));
  assert.ok(explorer.includes('className="scroll"'));
  assert.ok(explorer.includes("data-topbar-hidden={topbarHidden ? 'true' : 'false'}"));
  assert.ok(explorer.includes("style={{ '--topbar-measured-height': `${topbarMeasuredHeight}px` } as React.CSSProperties}"));
  assert.ok(explorer.includes('data-topbar-root="true"'));
  assert.ok(explorer.includes('data-topbar-panel="true"'));
  assert.ok(explorer.includes('<div className="topbar-anchor" aria-hidden="true">'));
  assert.ok(explorer.includes('className="scroll-content"'));
  assert.ok(explorer.includes("'--scroll-content-top-inset': 'calc(var(--topbar-measured-height) + var(--topbar-gap))'"));
  assert.ok(explorer.includes("'calc(var(--topbar-measured-height) + var(--topbar-gap))'"));
  assert.ok(explorer.includes('data-topbar-control="true"'));
  assert.ok(explorer.includes('data-interactive="true"'));
  assert.ok(explorer.includes('<div className="search" role="search" data-interactive="true" data-topbar-control="true">'));
  assert.ok(explorer.includes('className={`actions-panel ${actionsOpen ? \'open\' : \'\'}`} role="region" aria-label="Explorer actions" data-interactive="true" data-topbar-panel="true"'));
  assert.ok(hook.includes('if (isInteractiveTarget(event.target)) {'));
  assert.ok(grid.includes('onPointerDown={handleTogglePointerDown}'));
  assert.ok(grid.includes('event.stopPropagation();'));
  assert.ok(list.includes('data-interactive="true"'));
  assert.ok(styles.includes('.topbar-anchor{'));
  assert.ok(styles.includes('position: sticky;'));
  assert.ok(styles.includes('height: 0;'));
  assert.ok(styles.includes('z-index: 120;'));
  assert.ok(styles.includes('.topbar > .section-h{'));
  assert.ok(styles.includes('pointer-events: none;'));
  assert.ok(styles.includes('z-index: 31;'));
  assert.ok(styles.includes('z-index: 30;'));
  assert.ok(styles.includes('pointer-events: auto;'));
  assert.ok(styles.includes('.content .scroll{'));
  assert.ok(styles.includes('.masonry-columns{'));
});

test('pending compose recovery reconciles stale restored jobs and prefers real assets over zombie placeholders', () => {
  const hookPath = path.join(packageRoot, 'src', 'usePendingComposeJobs.ts');
  const jobsPath = path.join(packageRoot, 'src', 'composeJobs.ts');
  const hook = fs.readFileSync(hookPath, 'utf8');
  const jobs = fs.readFileSync(jobsPath, 'utf8');

  assert.ok(hook.includes('RESTORED_PENDING_COMPOSE_RECOVERY_MS = 8_000'));
  assert.ok(hook.includes('RESTORED_PENDING_COMPOSE_MAX_ATTEMPTS = 2'));
  assert.ok(hook.includes('pendingComposeMatchesMediaItem'));
  assert.ok(hook.includes('const hasConfirmedOutput = useCallback'));
  assert.ok(hook.includes('item.recoveredFromStorage'));
  assert.ok(hook.includes('hasConfirmedOutput(item)'));
  assert.ok(hook.includes('setItems((prev) => prev.filter((x) => x.jobId !== item.jobId))'));
  assert.ok(jobs.includes('status?: PendingComposeViewStatus;'));
  assert.ok(jobs.includes('recoveredFromStorage?: boolean;'));
  assert.ok(jobs.includes('pendingComposeCandidateOutputPaths'));
  assert.ok(jobs.includes('pendingComposeMatchesMediaItem'));
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
  assert.ok(content.includes('{composeModalRendered ? ('));
  assert.ok(content.includes('className="compose-modal open"'));
  assert.ok(content.includes('const [composeSubmitting, setComposeSubmitting] = useState(false);'));
  assert.ok(content.includes('data-compose-project-picker="1"'));
  assert.ok(content.includes('onSubmit={(event) => {'));
  assert.ok(content.includes('className="btn good" type="submit" disabled={composeSubmitting}'));
  assert.ok(content.includes("registerAcceptedJob({ envelope: response as ComposeJobEnvelope });"));
  assert.ok(content.includes("addToast('good', 'Compose', 'Compose started');"));
  assert.ok(content.includes("addToast('good', 'Compose', 'Compose completed');"));
  assert.ok(content.includes("addToast('bad', 'Compose', 'Compose failed');"));
  assert.ok(content.includes('target_dir: \'exports\''));
  assert.ok(content.includes("mode: 'encode'"));
  assert.ok(content.includes('allow_overwrite: false,'));
  assert.ok(content.includes('if (composeSubmitting) {'));
  assert.ok(content.includes('setComposeSubmitting(true);'));
  assert.ok(content.includes('setComposeSubmitting(false);'));
  assert.ok(content.includes("{composeSubmitting ? 'Composing...' : 'Compose'}"));
  assert.ok(content.includes('disabled={composeSubmitting}'));
  assert.ok(content.includes('aria-busy={composeSubmitting}'));
  assert.ok(content.includes("pollIntervalMs: 2000,"));
  assert.ok(content.includes("const visiblePendingComposeItems = useMemo(() => {"));
  assert.ok(content.includes("return sortPendingComposeItemsForDisplay(relevant);"));
  assert.ok(content.includes("const pendingEntries = useMemo<PendingRenderedEntry[]>(() => visiblePendingComposeItems.map((pendingItem) => ({"));
  assert.ok(content.includes("...pendingEntries,"));
  assert.ok(content.includes("...assetEntries,"));
  assert.ok(content.includes("if (item.status === 'finalizing' && previousStatus && previousStatus !== 'finalizing') {"));
  assert.ok(content.includes("if (item.status !== 'finalizing') return;"));
  assert.ok(content.includes("if (visible) {"));
  assert.ok(content.includes("removePendingJob(item.jobId);"));
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
  assert.ok(confirmBlock.includes("registerAcceptedJob({ envelope: response as ComposeJobEnvelope });"));
  assert.ok(!confirmBlock.includes('await loadProjects();'));
  assert.ok(!confirmBlock.includes('await loadAllMedia();'));
  assert.ok(!confirmBlock.includes('await loadMedia(activeProject);'));
  assert.ok(confirmBlock.includes('} finally {'));
});

test('pending compose modules and render wiring are present', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const cardPath = path.join(packageRoot, 'src', 'components', 'PendingComposeAssetCard.tsx');
  const hookPath = path.join(packageRoot, 'src', 'usePendingComposeJobs.ts');
  const jobsPath = path.join(packageRoot, 'src', 'composeJobs.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const list = fs.readFileSync(listPath, 'utf8');
  const card = fs.readFileSync(cardPath, 'utf8');
  const hook = fs.readFileSync(hookPath, 'utf8');
  const jobs = fs.readFileSync(jobsPath, 'utf8');

  assert.ok(explorer.includes("const {\n    pendingComposeItems,\n    registerAcceptedJob,\n    removePendingJob,\n  } = usePendingComposeJobs({"));
  assert.ok(explorer.includes("fetchJson: fetchComposeJobJson,"));
  assert.ok(explorer.includes("onCompletedRefreshScope: async (refreshScope) => {"));
  assert.ok(explorer.includes("entries={renderedMediaEntries}"));
  assert.ok(explorer.includes("items={renderedMediaEntries}"));
  assert.ok(explorer.includes("onDismissPendingJob={removePendingJob}"));
  assert.ok(!explorer.includes("prependItemsIntoMasonryColumns<RenderedMediaEntry>"));
  assert.ok(explorer.includes("const hydrateProjectMediaItems = useCallback((items: MediaItem[], project: { name: string; source?: string | null }): MediaItem[] => ("));
  assert.ok(explorer.includes('mergeMediaItemsPreservingIdentity(current, hydratedItems)'));
  assert.ok(explorer.includes('buildMediaIdentityKey(item, projectOverride)'));
  assert.ok(explorer.includes("const safeThumbUrl = thumbUrl && getThumbLoadState(thumbJobKey) !== 'error'"));
  assert.ok(grid.includes("import PendingComposeAssetCard, { type PendingComposeAsset } from './PendingComposeAssetCard';"));
  assert.ok(grid.includes("if (entry.kind === 'pending') {"));
  assert.ok(list.includes("import PendingComposeAssetCard, { type PendingComposeAsset } from './PendingComposeAssetCard';"));
  assert.ok(list.includes("if (entry.kind === 'pending') {"));
  assert.ok(card.includes('data-pending-compose-card="true"'));
  assert.ok(card.includes('function PendingComposeWaterSvg({'));
  assert.ok(card.includes('data-water-svg="true"'));
  assert.ok(card.includes('const REAR_WAVE_PATH ='));
  assert.ok(card.includes('const FRONT_WAVE_PATH ='));
  assert.ok(card.includes('window.requestAnimationFrame(tick)'));
  assert.ok(card.includes('status !== "failed"'));
  assert.ok(card.includes('badge: "QUEUED"'));
  assert.ok(card.includes('badge: "TAKING LONGER"'));
  assert.ok(card.includes('badge: "RECONNECTING"'));
  assert.ok(card.includes('badge: "FINALIZING"'));
  assert.ok(card.includes('badge: "FAILED"'));
  assert.ok(card.includes('footer: "waiting to resume"'));
  assert.ok(card.includes('data-pending-compose-dismiss="true"'));
  assert.ok(card.includes('debug artifacts preserved'));
  assert.ok(card.includes('.pending-compose-water-svg'));
  assert.ok(card.includes('const BODY_FILL_FLOOR = 420;'));
  assert.ok(card.includes('linearGradient id={bodyGradientId}'));
  assert.ok(card.includes('stopOpacity="0.8"'));
  assert.ok(card.includes('stopOpacity="0.04"'));
  assert.ok(card.includes('stroke="#ffffff"'));
  assert.ok(card.includes('strokeOpacity="0.18"'));
  assert.ok(card.includes('transform="translate(0 -1.5)"'));
  assert.ok(card.includes('const bobAmplitude = status === "running_long" ? 3.5 : 4.75;'));
  assert.ok(card.includes('solid: "#2aa8ff"'));
  assert.ok(card.includes('solid: "#ff9b1e"'));
  assert.ok(card.includes('solid: "#7868ff"'));
  assert.ok(card.includes('solid: "#db4343"'));
  assert.ok(!card.includes('solid: "rgba('));
  assert.ok(!card.includes('pending-compose-water-wrap'));
  assert.ok(!card.includes('function Wave({'));
  assert.ok(!card.includes('const WAVE_PATH ='));
  assert.ok(hook.includes('pollIntervalMs = 2000'));
  assert.ok(hook.includes('const [items, setItems] = useState<PendingComposeItem[]>(() => readPersistedPendingComposeItems());'));
  assert.ok(hook.includes('window.localStorage.getItem(PENDING_COMPOSE_STORAGE_KEY)'));
  assert.ok(hook.includes('window.localStorage.setItem('));
  assert.ok(hook.includes('window.localStorage.removeItem(PENDING_COMPOSE_STORAGE_KEY);'));
  assert.ok(hook.includes('const active = current.filter('));
  assert.ok(hook.includes('|| item.status === "reconnecting"'));
  assert.ok(hook.includes('if (nextStatus === "completed") {'));
  assert.ok(hook.includes('status: "finalizing"'));
  assert.ok(hook.includes('status: "reconnecting"'));
  assert.ok(hook.includes('pendingComposeReconnectDelayMs(attemptCount, pollIntervalMs)'));
  assert.ok(hook.includes('error: undefined,'));
  assert.ok(jobs.includes('if (elapsedMs > 45_000) return "running_long";'));
  assert.ok(jobs.includes('|| status === "reconnecting"'));
  assert.ok(jobs.includes('PENDING_COMPOSE_STORAGE_KEY'));
  assert.ok(jobs.includes('restorePendingComposeItemsFromStorage'));
  assert.ok(jobs.includes('serializePendingComposeItemsForStorage'));
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
  assert.ok(content.includes('{deleteModalRendered ? ('));
  assert.ok(content.includes('className="confirm-modal open"'));
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
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
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
  assert.ok(explorer.includes('className={`backdrop sidebar-backdrop ${sidebarOpen ? \'show\' : \'\'}`}'));
  assert.ok(styles.includes('.sidebar-backdrop{'));
  assert.ok(styles.includes('left: min(420px, calc(100vw - 24px));'));
  assert.ok(styles.includes('@media (max-width: 860px){'));
  assert.ok(styles.includes('body{ overflow:hidden; }'));
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
  assert.ok(!styles.includes('.topbar-reveal{'));
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
  assert.ok(gridContent.includes('computeMasonryLayout({'));
  assert.ok(gridContent.includes('renderedLayoutItems.map(({ item, x, y, width, height }, index) => {'));
  assert.ok(gridContent.includes('const renderedLayoutItems = layout.items;'));
  assert.ok(gridContent.includes('const renderBufferPx = ENABLE_MOTION_AWARE_BUFFER && densityMotionActive'));
  assert.ok(gridContent.includes('const renderWindowTop = renderWindow.top - renderBufferPx;'));
  assert.ok(gridContent.includes('const renderWindowBottom = renderWindow.bottom + renderBufferPx;'));
  assert.ok(gridContent.includes('if (width > 0 && height > 0) {'));
  assert.ok(gridContent.includes('return Math.max(0.3, height / width);'));
  assert.ok(gridContent.includes('data-layout-top={layoutTop}'));
  assert.ok(gridContent.includes('data-layout-bottom={layoutBottom}'));
  assert.ok(gridContent.includes('data-cinematic-card="true"'));
  assert.ok(gridContent.includes('data-cinematic-hit-target="true"'));
  assert.ok(gridContent.includes('data-card-shell="true"'));
  assert.ok(gridContent.includes('data-card-shell-depth="true"'));
  assert.ok(gridContent.includes('data-card-ui-top="true"'));
  assert.ok(gridContent.includes('data-card-ui-chip="true"'));
  assert.ok(gridContent.includes('data-card-ui-nav="true"'));
  assert.ok(gridContent.includes('data-card-ui-bottom="true"'));
  assert.ok(gridContent.includes('data-card-ui-actions="true"'));
  assert.ok(gridContent.includes('--masonry-column-count'));
  assert.ok(stateContent.includes('export function buildMasonryColumns'));
  assert.ok(styles.includes('.masonry-columns{'));
  assert.ok(styles.includes('.masonry-host{'));
  assert.ok(styles.includes('.asset-cinematic-shell{'));
  assert.ok(styles.includes('.asset-cinematic-ui-top{'));
  assert.ok(styles.includes('.asset-cinematic-ui-bottom{'));
  assert.ok(styles.includes('.asset-cinematic-ui-actions{'));
  assert.ok(styles.includes('.asset-cinematic-ui-chip{'));
  assert.ok(styles.includes('.asset-cinematic-ui-nav{'));
  assert.ok(styles.includes('.grid-cinematic-root{'));
  assert.ok(styles.includes('.grid-cinematic-header{'));
  assert.ok(styles.includes('.grid-cinematic-chip{'));
  assert.ok(styles.includes('.grid-cinematic-media{'));
  assert.ok(styles.includes('.grid-cinematic-scrim{'));
  assert.ok(styles.includes('.grid-cinematic-nav{'));
  assert.ok(styles.includes('.grid-cinematic-top{'));
  assert.ok(styles.includes('.grid-cinematic-bottom{'));
  assert.ok(styles.includes('.grid-cinematic-bars{'));
  assert.ok(styles.includes('.grid-cinematic-bar.top'));
  assert.ok(styles.includes('.focus-proxy-root{'));
  assert.ok(styles.includes('.app:not(.grid-focused) .grid-cinematic-root{'));
  assert.ok(styles.includes('.app.proxy-travel-active .grid-cinematic-root{'));
  assert.ok(styles.includes('.app.proxy-travel-active .drawer{'));
  assert.ok(styles.includes('.proxy-render-world{'));
  assert.ok(styles.includes('--proxy-world-scale'));
  assert.ok(styles.includes('transform: scale(calc(1 / var(--proxy-world-scale, 1)));'));
  assert.ok(styles.includes('.scroll.focus-proxy-scroll-lock{'));
  assert.ok(styles.includes('overflow-x: hidden;'));
  assert.ok(styles.includes('overflow-x: clip;'));
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
  assert.ok(block.includes('openPreview(item);'));
  assert.ok(block.includes('openContextMenu(event.clientX, event.clientY, resolveContextItems())'));
  assert.ok(block.includes('event.stopPropagation();'));
  assert.ok(!block.includes('setPendingDataLoadOverlay('));
  assert.ok(!block.includes('setContentLoading(true)'));
});

test('package explorer context menu opens only on deliberate long press or context click', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const pointerSessionPath = path.join(packageRoot, 'src', 'explorer', 'interactions', 'pointerSession.ts');
  const explorerContent = fs.readFileSync(explorerPath, 'utf8');
  const content = fs.readFileSync(hookPath, 'utf8');
  const pointerSessionContent = fs.readFileSync(pointerSessionPath, 'utf8');
  const start = content.indexOf('const buildAssetPointerHandlers = useCallback(');
  const end = content.indexOf('return {', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const block = content.slice(start, end);
  assert.ok(content.includes('const LONG_PRESS_MS = 620;'));
  assert.ok(pointerSessionContent.includes('export const LONG_PRESS_MOVE_CANCEL_PX_BASE = 12;'));
  assert.ok(pointerSessionContent.includes('export const TOUCH_TAP_CANCEL_PX_BASE = 18;'));
  assert.ok(block.includes('if (isTouchLikePointer(event.pointerType)) {'));
  assert.ok(block.includes('longPressTimerRef.current = window.setTimeout(() => {'));
  assert.ok(block.includes('longPressFiredRef.current = true;'));
  assert.ok(block.includes('const metrics = computePointerMoveMetrics(session, {'));
  assert.ok(block.includes('if (metrics.movedFarForLongPress) {'));
  assert.ok(block.includes('session.moved = true;'));
  assert.ok(block.includes('cancelPendingLongPress();'));
  assert.ok(block.includes('thresholdReason: `long_press_move_cancel>${metrics.longPressMoveCancelPx}px`,'));
  assert.ok(block.includes("kind: 'pointermove:tap_cancel'"));
  assert.ok(block.includes('thresholdReason: `touch_tap_cancel>${metrics.touchTapCancelPx}px`,'));
  assert.ok(block.includes('const session = pointerSessionRef.current;'));
  assert.ok(block.includes('if (session.pointerId !== event.pointerId || session.itemKey !== itemKey) return;'));
  assert.ok(block.includes('if (longPressFired) {'));
  assert.ok(block.includes('if (isTouchLikePointer(event.pointerType)) {'));
  assert.ok(block.includes('if (event.pointerType === \'mouse\' && event.button !== 0) {'));
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
  assert.ok(hookContent.includes('if (inNoPreviewZone(event.target)) {'));
  assert.ok(hookContent.includes('if (inspectorOpen) {'));
  assert.ok(!hookContent.includes('closeDrawer();'));
  assert.ok(hookContent.includes('openPreview(item);'));
  assert.ok(hookContent.includes("onTapStage?.('first', itemKey);"));
  assert.ok(hookContent.includes("onTapStage?.('second', itemKey);"));
  assert.ok(hookContent.includes('onHoldEmphasis?.(itemKey, true);'));
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
  assert.ok(content.includes('className="topbar"'));
  assert.ok(content.includes('<div className="section-h">'));
  assert.ok(content.includes('aria-label="Toggle projects panel"'));
  assert.ok(!content.includes('className="btn mobile-only"'));
  assert.ok(styles.includes('--topbar-subrow-height'));
  assert.ok(styles.includes('--topbar-gap: 12px;'));
  assert.ok(styles.includes('--topbar-measured-height: var(--topbar-height);'));
  assert.ok(!styles.includes('--topbar-offset-open'));
  assert.ok(!styles.includes('--topbar-offset-hidden'));
  assert.ok(!styles.includes('.app.topbar-hidden{'));
  assert.ok(styles.includes('margin: 0;'));
  assert.ok(styles.includes('.topbar::before{'));
  assert.ok(styles.includes('background: transparent;'));
  assert.ok(styles.includes('.topbar-inner{'));
  assert.ok(styles.includes('z-index: 4;'));
  assert.ok(styles.includes('.section-h{'));
  assert.ok(styles.includes('.topbar > .section-h{'));
  assert.ok(styles.includes('pointer-events: none;'));
  assert.ok(styles.includes('.brand.projects-open .brand-title.is-secondary'));
  assert.ok(styles.includes('padding: 0;'));
  assert.ok(styles.includes('.scroll-content{'));
  assert.ok(styles.includes('transition: none;'));
  assert.ok(styles.includes('padding-top: var(--scroll-content-top-inset, 0px);'));
  assert.ok(!styles.includes('.scroll-content.topbar-open{'));
  assert.ok(!styles.includes('.scroll-content.topbar-hidden{'));
  assert.ok(styles.includes('.content .scroll{'));
  assert.ok(styles.includes('padding: 0;'));
  assert.ok(styles.includes('touch-action: pan-y;'));
  assert.ok(content.includes('useTopbarScrollState({'));
  assert.ok(content.includes('createTopbarMotion(topbarEl)'));
  assert.ok(content.includes('createTopbarSnapBand({'));
  assert.ok(content.includes('createDrawerMotion(drawerEl, backdropEl, {'));
  assert.ok(content.includes('const modeQuery = window.matchMedia(\'(max-width: 860px)\');'));
  assert.ok(content.includes("getMode: () => (modeQuery.matches ? 'sheet' : 'side')"));
  assert.ok(content.includes('controller.syncLayoutMode();'));
  assert.ok(content.includes('let hasBootstrappedExplorerSession = false;'));
  assert.ok(content.includes('if (hasBootstrappedExplorerSession) return;'));
  assert.ok(content.includes('hasBootstrappedExplorerSession = true;'));
  assert.ok(content.includes('const liveIds = new Set(toasts.map((toast) => toast.id));'));
  assert.ok(content.includes('if (!liveIds.has(key)) toastNodeMapRef.current.delete(key);'));
  assert.ok(content.includes('if (!liveIds.has(key)) toastExitingRef.current.delete(key);'));
  assert.ok(content.includes('createExplorerDensityController({'));
  assert.ok(content.includes('createPinchDensityController({'));
  assert.ok(content.includes('getClassHostEl: () => mediaContentRef.current,'));
  assert.ok(content.includes('id="asset-density-slider"'));
  assert.ok(content.includes('const OVERLAY_VIS_PREFS_KEY = \'media-sync-explorer-overlay-enabled-v1\';'));
  assert.ok(content.includes('const [overlayEnabled, setOverlayEnabled] = useState(true);'));
  assert.ok(content.includes('window.localStorage.getItem(OVERLAY_VIS_PREFS_KEY)'));
  assert.ok(content.includes('window.localStorage.setItem(OVERLAY_VIS_PREFS_KEY, overlayEnabled ? \'1\' : \'0\');'));
  assert.ok(content.includes('Overlays: {overlayEnabled ? \'On\' : \'Off\'}'));
  assert.ok(content.includes("overlayEnabled ? '' : 'overlay-hidden'"));
  assert.ok(content.includes('data-density-pinch-surface="true"'));
  assert.ok(hookContent.includes('window.requestAnimationFrame(processScroll)'));
  assert.ok(hookContent.includes('const TOPBAR_REVEAL_HYSTERESIS_PX = 20;'));
  assert.ok(hookContent.includes('const suppressAutoToggle = useCallback((ms = TOPBAR_COMPENSATION_SUPPRESS_MS) => {'));
  assert.ok(hookContent.includes('const openInsetPx = getOpenInsetPx();'));
  assert.ok(hookContent.includes('const currentInsetPx = openInsetPx;'));
  assert.ok(hookContent.includes('const contentTopPx = currentTop - currentInsetPx;'));
  assert.ok(!hookContent.includes('if (hiddenRef.current && currentTop <= TOPBAR_REVEAL_AT_TOP_PX) {'));
  assert.ok(hookContent.includes('if (!hiddenRef.current && delta > 0 && contentTopPx >= 0) {'));
  assert.ok(hookContent.includes('if (hiddenRef.current && delta < 0 && contentTopPx <= -TOPBAR_REVEAL_HYSTERESIS_PX) {'));
  assert.ok(content.includes('useLayoutEffect(() => {'));
  assert.ok(styles.includes('will-change: transform, opacity;'));
  assert.ok(styles.includes('transition: opacity 120ms ease;'));
  assert.ok(!styles.includes('transition: transform 160ms ease, opacity 160ms ease;'));
  assert.ok(styles.includes('.topbar,'));
  assert.ok(styles.includes('touch-action: manipulation;'));
  assert.ok(styles.includes('transform: translate3d(0, calc(-1 * var(--topbar-measured-height)), 0);'));
  assert.ok(styles.includes('@media (max-width: 860px){'));
  assert.ok(styles.includes('--topbar-gap: 14px;'));
  assert.ok(!styles.includes('padding-top: 8px;'));
  assert.ok(!styles.includes('padding-top: 6px;'));
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


test('package explorer conditionally mounts confirm and compose modals with exit presence', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('{deleteModalRendered ? ('));
  assert.ok(content.includes('if (deleteModalOpen) setDeleteModalRendered(true);'));
  assert.ok(content.includes('motion.close(() => setDeleteModalRendered(false));'));
  assert.ok(content.includes('className="confirm-modal open"'));
  assert.ok(!content.includes('aria-hidden={!deleteModalOpen}'));
  assert.ok(content.includes('{composeModalRendered ? ('));
  assert.ok(content.includes('if (composeModalOpen) setComposeModalRendered(true);'));
  assert.ok(content.includes('motion.close(() => setComposeModalRendered(false));'));
  assert.ok(content.includes('className="compose-modal open"'));
  assert.ok(!content.includes('aria-hidden={!composeModalOpen}'));
});


test('package explorer toast layer stays above the fixed topbar stack', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(styles.includes('.toasts{'));
  assert.ok(styles.includes('top: calc(env(safe-area-inset-top, 0px) + 74px);'));
  assert.ok(styles.includes('z-index: 140;'));
});

test('motion architecture keeps density, drawer, toast, and topbar contracts explicit', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const densityControllerPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createExplorerDensityController.ts');
  const pinchControllerPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createPinchDensityController.ts');
  const densityConstantsPath = path.join(packageRoot, 'src', 'explorer', 'density', 'constants.ts');
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const drawerMotionPath = path.join(packageRoot, 'src', 'ui', 'motion', 'drawerMotion.ts');
  const topbarMotionPath = path.join(packageRoot, 'src', 'ui', 'motion', 'topbarMotion.ts');
  const focusMotionPath = path.join(packageRoot, 'src', 'explorer', 'focus', 'focusWorldMotion.ts');
  const renderTypesPath = path.join(packageRoot, 'src', 'render', 'renderTypes.ts');
  const sceneSnapshotPath = path.join(packageRoot, 'src', 'render', 'SceneSnapshot.ts');
  const cameraControllerPath = path.join(packageRoot, 'src', 'render', 'CameraController.ts');
  const proxyRendererPath = path.join(packageRoot, 'src', 'render', 'ViewportProxyRenderer.ts');
  const orchestratorPath = path.join(packageRoot, 'src', 'render', 'FocusTransitionOrchestrator.ts');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const densityController = fs.readFileSync(densityControllerPath, 'utf8');
  const pinchController = fs.readFileSync(pinchControllerPath, 'utf8');
  const densityConstants = fs.readFileSync(densityConstantsPath, 'utf8');
  const flip = fs.readFileSync(flipPath, 'utf8');
  const drawerMotion = fs.readFileSync(drawerMotionPath, 'utf8');
  const topbarMotion = fs.readFileSync(topbarMotionPath, 'utf8');
  const focusMotion = fs.readFileSync(focusMotionPath, 'utf8');
  const renderTypes = fs.readFileSync(renderTypesPath, 'utf8');
  const sceneSnapshot = fs.readFileSync(sceneSnapshotPath, 'utf8');
  const cameraController = fs.readFileSync(cameraControllerPath, 'utf8');
  const proxyRenderer = fs.readFileSync(proxyRendererPath, 'utf8');
  const orchestrator = fs.readFileSync(orchestratorPath, 'utf8');

  assert.ok(content.includes("if (view !== 'grid') {"));
  assert.ok(content.includes('const gridEl = gridSurfaceEl;'));
  assert.ok(content.includes('const commitDensityColumns = useCallback((nextColumns: number, animated = true) => {'));
  assert.ok(content.includes('const scrubDensityColumns = useCallback((nextColumns: number) => {'));
  assert.ok(content.includes('const computeFocusWorldTransform = useCallback((selectionKey: string, options?: { continueFromCurrent?: boolean }) => {'));
  assert.ok(content.includes('const startFocusMotionForSelectionKey = useCallback((selectionKey: string): StartFocusMotionResult => {'));
  assert.ok(content.includes("type FocusPresentationState ="));
  assert.ok(content.includes("type StartFocusMotionResult ="));
  assert.ok(content.includes("type FocusMeasurementFailureReason ="));
  assert.ok(content.includes("type StartFocusFailureReason = 'not-grid' | 'density-unsafe' | 'inspector-closed' | FocusMeasurementFailureReason;"));
  assert.ok(content.includes("{ mode: 'world-focus'; key: string; overlayReady: boolean }"));
  assert.ok(content.includes("{ mode: 'drawer-fallback'; key: string }"));
  assert.ok(content.includes('const moveFocusPresentationToFallbackOrIdle = useCallback((candidateKey?: string | null, reason = \'unspecified\') => {'));
  assert.ok(content.includes("setFocusPresentationState({ mode: 'idle' });"));
  assert.ok(content.includes("setFocusPresentationState({ mode: 'drawer-fallback', key: candidateKey });"));
  assert.ok(content.includes('__explorerPreviewDebug'));
  assert.ok(content.includes("recordPreviewDebug({ stage: 'openPreview-request'"));
  assert.ok(content.includes("reason: initialStart.ok ? undefined : initialStart.reason,"));
  assert.ok(content.includes("stage: 'focus-retry-scheduled'"));
  assert.ok(content.includes("stage: 'focus-retry-attempt'"));
  assert.ok(content.includes('if (!inspectorOpenRef.current) return { ok: false, reason: \'inspector-closed\' };'));
  assert.ok(content.includes('const computeFromUntransformedFocusWorldStage = useCallback((measure: () => FocusMeasurementResult): FocusMeasurementResult => {'));
  assert.ok(content.includes("stageEl.style.transform = 'none';"));
  assert.ok(content.includes('const stageRect = stageEl.getBoundingClientRect();'));
  assert.ok(content.includes('stageRect,'));
  assert.ok(content.includes('__explorerFocusWorldDebug'));
  assert.ok(content.includes('guardFailureReason: diagnostics.guardFailureReason,'));
  assert.ok(content.includes('guardDiagnostics: diagnostics.guardDiagnostics,'));
  assert.ok(content.includes('reason: diagnostics.transform ? null : \'unsafe-transform\','));
  assert.ok(content.includes('stagePresent,'));
  assert.ok(content.includes('cardPresent: false,'));
  assert.ok(content.includes('reason: measurement.reason,'));
  assert.ok(content.includes('const focusWorldActive = ('));
  assert.ok(content.includes('&& view === \'grid\''));
  assert.ok(content.includes('&& focusPresentationState.mode === \'world-focus\''));
  assert.ok(content.includes('&& focusPresentationState.key === activeAssetKey'));
  assert.ok(content.includes('if (!inspectorOpen) {'));
  assert.ok(content.includes("moveFocusPresentationToFallbackOrIdle(fallbackKey, keyMismatch ? 'key-mismatch' : 'presentation-invalidated');"));
  assert.ok(content.includes('const initialStart = startFocusMotionForSelectionKey(selectionKey);'));
  assert.ok(content.includes('if (!isReadinessFocusReason(initialStart.reason)) {'));
  assert.ok(content.includes('focusStartRetryFrameRef.current = window.requestAnimationFrame(() => {'));
  assert.ok(content.includes('const retryStart = startFocusMotionForSelectionKey(selectionKey);'));
  assert.ok(content.includes("from './explorer/focus/focusWorldMotion'"));
  assert.ok(content.includes('className="focus-world-stage"'));
  assert.ok(content.includes('ref={focusWorldStageRef}'));
  assert.ok(content.includes("data-focus-world={focusWorldActive ? 'true' : 'false'}"));
  assert.ok(content.includes('data-grid-cinematic-root="true"'));
  assert.ok(content.includes('data-grid-cinematic-media="true"'));
  assert.ok(content.includes('data-grid-cinematic-scrim="true"'));
  assert.ok(content.includes('data-grid-cinematic-top="true"'));
  assert.ok(content.includes('data-grid-cinematic-nav="true"'));
  assert.ok(content.includes('data-grid-cinematic-bottom="true"'));
  assert.ok(content.includes('data-grid-cinematic-actions="true"'));
  assert.ok(content.includes('const [cinematicRevealState, setCinematicRevealState] = useState<CinematicRevealState>({'));
  assert.ok(content.includes('const createGridCinematicTimeline = ({'));
  assert.ok(content.includes('const stageCinematicReveal = useCallback((mode: \'open\' | \'refocus\' = \'open\') => {'));
  assert.ok(content.includes('gridCinematicTimelineRef.current?.playClose();'));
  assert.ok(content.includes("type ProxyTravelState = 'idle' | 'open-travel' | 'refocus-travel';"));
  assert.ok(content.includes("type GridCinematicMode = 'grid-rest' | 'grid-opening' | 'grid-focused' | 'grid-refocusing' | 'grid-closing';"));
  assert.ok(content.includes("const [proxyTravelState, setProxyTravelState] = useState<ProxyTravelState>('idle');"));
  assert.ok(content.includes("const [gridCinematicMode, setGridCinematicMode] = useState<GridCinematicMode>('grid-rest');"));
  assert.ok(content.includes('const proxyTravelActive = proxyTravelState !== \'idle\';'));
  assert.ok(content.includes('const focusOrchestratorRef = useRef<FocusTransitionOrchestrator | null>(null);'));
  assert.ok(content.includes("const runProxyFocusTransition = useCallback(("));
  assert.ok(content.includes("mode: 'open' | 'refocus',"));
  assert.ok(content.includes('setGridCinematicMode(mode === \'open\' ? \'grid-opening\' : \'grid-refocusing\');'));
  assert.ok(content.includes('setGridCinematicMode(\'grid-focused\');'));
  assert.ok(content.includes('focusOrchestratorRef.current?.closeFocusTransition({'));
  assert.ok(content.includes('closeGridFocusToRest'));
  assert.ok(content.includes("setGridCinematicMode('grid-closing');"));
  assert.ok(content.includes("setGridCinematicMode('grid-rest');"));
  assert.ok(content.includes('recordPreviewDebug({ stage: event, selectionKey, requestedMode: view });'));
  assert.ok(content.includes("const cardEl = targetEl.closest<HTMLElement>('.masonry-card[data-select-key]');"));
  assert.ok(content.includes('if (!cardEl) {'));
  assert.ok(content.includes('closeDrawer();'));
  assert.ok(content.includes("const proxyOpened = runProxyFocusTransition(nextKey, 'refocus');"));
  assert.ok(content.includes('__explorerFocusLayerDebug'));
  assert.ok(content.includes("recordPreviewDebug({ stage: 'proxy-open-failed-no-fallback', selectionKey: nextKey, requestedMode: view, finalMode: 'idle' });"));
  assert.ok(content.includes('className={`focus-proxy-root ${gridCinematicMode !== \'grid-rest\' ? \'is-active\' : \'\'}`}'));
  assert.ok(content.includes('data-focus-proxy-root="true"'));
  assert.ok(content.includes('className={`app ${proxyTravelActive ? \'proxy-travel-active\' : \'\'} ${gridCinematicMode}`}'));
  assert.ok(content.includes('data-grid-cinematic-nav="true"'));
  assert.ok(content.includes('const gridCinematicActive = !proxyTravelActive && focusWorldActive && view === \'grid\' && gridCinematicMode === \'grid-rest\';'));
  assert.ok(content.includes('const drawerVisibleOwner = !proxyTravelActive && inspectorOpen && (view === \'list\' || focusPresentationState.mode === \'drawer-fallback\');'));
  assert.ok(content.includes("const proxyPreviewVisible = !proxyTravelActive && view === 'grid' && inspectorOpen && gridCinematicMode === 'grid-focused';"));
  assert.ok(content.includes("playable={Boolean(normalizedPreviewAsset && (normalizedPreviewAsset.kind === 'video' || normalizedPreviewAsset.kind === 'audio'))}"));
  assert.ok(content.includes('metadataRows={previewMetadataRows}'));
  assert.ok(content.includes('}, [activeProxyCardEl, proxyPreviewVisible, previewAutoPlayToken]);'));
  assert.ok(content.includes("if (target.closest('.proxy-preview-ui')) return;"));
  assert.ok(content.includes('className="proxy-preview-ui"'));
  assert.ok(content.includes("'--focus-world-origin-x': `${focusWorldTransform.originX}%`"));
  assert.ok(content.includes("'--focus-world-origin-y': `${focusWorldTransform.originY}%`"));
  assert.ok(content.includes("focusPresentationState.mode === 'world-focus' ? 'world-focus-suppressed' : ''"));
  assert.ok(focusMotion.includes('export function computeFocusWorldTransformWithDiagnostics'));
  assert.ok(focusMotion.includes('projectedWithinSaneBounds'));
  assert.ok(focusMotion.includes('guardFailureReason'));
  assert.ok(focusMotion.includes('export function computeFocusWorldTransform'));
  assert.ok(focusMotion.includes('FOCUS_SAFE_FRAME_DRAWER_RESERVE_PX = 320'));
  assert.ok(focusMotion.includes('MAX_TRANSLATE_VIEWPORT_FACTOR = 1.5'));
  assert.ok(focusMotion.includes('stageRect: DOMRect;'));
  assert.ok(focusMotion.includes('computeFocusSafeFrame'));
  assert.ok(focusMotion.includes('computeFocusScale'));
  assert.ok(focusMotion.includes('computeFocusTransformOrigin'));
  assert.ok(focusMotion.includes('computeContinuityAdjustedTranslation'));
  assert.ok(focusMotion.includes('if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(scale)) {'));
  assert.ok(renderTypes.includes('export type FocusSceneSnapshot'));
  assert.ok(sceneSnapshot.includes('export function captureFocusSceneSnapshot'));
  assert.ok(sceneSnapshot.includes('const ambientNeighborLimit = Math.min(Math.max(0, maxCards - 1), 8);'));
  assert.ok(sceneSnapshot.includes('sampledEls = [activeEl, ...neighbors];'));
  assert.ok(cameraController.includes('export function computeCameraStateForTarget'));
  assert.ok(cameraController.includes('viewportLeft?: number;'));
  assert.ok(cameraController.includes('viewportTop?: number;'));
  assert.ok(cameraController.includes('x: safeCenterX - (target.centerX * scale),'));
  assert.ok(cameraController.includes('y: safeCenterY - (target.centerY * scale),'));
  assert.ok(proxyRenderer.includes('export class ViewportProxyRenderer'));
  assert.ok(proxyRenderer.includes('const selectedClass = card.selected ? \'is-selected\' : \'\';'));
  assert.ok(proxyRenderer.includes('const showActiveChrome = opts?.showActiveChrome ?? true;'));
  assert.ok(proxyRenderer.includes('const activeChrome = showActiveChrome && card.active'));
  assert.ok(proxyRenderer.includes('? \'<div class=\"proxy-render-scrim\"></div><div class=\"proxy-render-ui-slot\" data-proxy-ui-slot=\"true\"></div>\''));
  assert.ok(proxyRenderer.includes("world.style.setProperty('--proxy-world-scale', String(Math.max(0.001, camera.scale)));"));
  assert.ok(proxyRenderer.includes('void activeVideo.play().catch(() => {});'));
  assert.ok(proxyRenderer.includes("const ambientClass = card.active ? '' : 'is-ambient';"));
  assert.ok(proxyRenderer.includes('class=\"proxy-render-card ${activeClass} ${ambientClass} ${selectedClass}\"'));
  assert.ok(proxyRenderer.includes('data-proxy-active="${activeMarker}"'));
  assert.ok(orchestrator.includes('export class FocusTransitionOrchestrator'));
  assert.ok(orchestrator.includes('openFocusTransition(args: {'));
  assert.ok(orchestrator.includes('refocusTransition(args: {'));
  assert.ok(orchestrator.includes('closeFocusTransition(args?: {'));
  assert.ok(orchestrator.includes('this.timeline = gsap.timeline('));
  assert.ok(orchestrator.includes('proxy-open-start'));
  assert.ok(orchestrator.includes('proxy-open-complete'));
  assert.ok(orchestrator.includes('proxy-refocus-start'));
  assert.ok(orchestrator.includes('proxy-refocus-complete'));
  assert.ok(orchestrator.includes('proxy-failed'));
  assert.ok(orchestrator.includes('__explorerProxyCenterDebug'));
  assert.ok(orchestrator.includes('this.renderer.render(snapshot, startCamera, { showActiveChrome: false });'));
  assert.ok(orchestrator.includes('this.renderer.render(snapshot, camera, { showActiveChrome: true });'));
  assert.ok(orchestrator.includes('.proxy-render-top, .proxy-render-bottom, .proxy-render-scrim'));
  assert.ok(content.includes('density.scrubTo(nextColumns);'));
  assert.ok(content.includes('scrubDensityColumns(nextColumns);'));
  assert.ok(content.includes('density?.settleScrub();'));
  assert.ok(content.includes('step={1}'));
  assert.ok(content.includes('if (touchPinchCapable) {'));
  assert.ok(content.includes('toastMotionRef.current?.exit(node, () => removeToast(toast.id));'));
  assert.ok(content.includes('if (inDensityPinchSurface(event.target)) return;'));
  assert.ok(content.includes('data-density-pinch-surface="true"'));
  assert.ok(content.includes('topbarMotionRef.current?.refresh();'));
  assert.ok(content.includes('inspector-backdrop'));
  assert.ok(content.includes('data-inspector-backdrop="true"'));
  assert.ok(content.includes('data-inspector-drawer="true"'));
  assert.ok(content.includes("const modeQuery = window.matchMedia('(max-width: 860px)');"));
  assert.ok(content.includes("modeQuery.addEventListener('change', handleModeChange);"));
  assert.ok(content.includes('inspectorOpenRef.current = inspectorOpen;'));
  assert.ok(content.includes('focusPresentationStateRef.current = focusPresentationState;'));
  assert.ok(!content.includes("import { flushSync } from 'react-dom';"));
  assert.ok(content.includes('__explorerFlushSyncDebug'));
  assert.ok(content.includes("strategy: 'microtask-grid-column-commit'"));
  assert.ok(content.includes('if (hasBootstrappedExplorerSession) return;'));
  assert.ok(content.includes('hasBootstrappedExplorerSession = true;'));
  assert.ok(content.includes('if (!node) return;'));
  assert.ok(content.includes('const knownNode = toastNodeMapRef.current.get(toast.id);'));
  assert.ok(content.includes('} else if (knownNode !== node) {'));
  assert.ok(!content.includes('toastNodeMapRef.current.delete(toast.id);'));
  assert.ok(drawerMotion.includes('getSuppressOpen?: () => boolean;'));
  assert.ok(drawerMotion.includes('if (getSuppressOpen?.()) {'));
  assert.ok(drawerMotion.includes('const setSuppressedOpenState = () => {'));
  assert.ok(drawerMotion.includes('autoAlpha: 0,'));

  assert.ok(densityController.includes("gridEl.style.setProperty('--masonry-column-count', String(currentColumns));"));
  assert.ok(densityController.includes('scrubTo: (nextValue: number) => void;'));
  assert.ok(densityController.includes('if (!Number.isFinite(value)) return minColumns;'));
  assert.ok(!densityController.includes('currentColumns = safeColumns;'));
  assert.ok(densityController.includes('commitLayoutColumns(safeColumns);'));
  assert.ok(densityController.includes('runAnimatedCommit(nextColumns, \'scrub\');'));
  assert.ok(densityController.includes('runAnimatedCommit(safeColumns, \'settle\');'));
  assert.ok(densityController.includes('setColumnsForPinch: (nextColumns: number) => void;'));
  assert.ok(densityController.includes('runAnimatedCommit(safeColumns, \'pinch\');'));
  assert.ok(densityController.includes('let pinchAnimationActive = false;'));
  assert.ok(densityController.includes('let queuedPinchColumns: number | null = null;'));
  assert.ok(densityController.includes('__explorerPinchPerfDebug'));
  assert.ok(densityController.includes('if (pinchAnimationActive) {'));
  assert.ok(densityController.includes('queuedPinchColumns = safeColumns;'));
  assert.ok(densityController.includes('destroyed = true;'));
  assert.ok(densityController.includes('let scrubFrameId = 0;'));
  assert.ok(densityController.includes('pendingScrubColumns: number | null = null;'));
  assert.ok(densityController.includes('scrubFrameId = window.requestAnimationFrame(() => {'));
  assert.ok(densityController.includes('runAnimatedCommit(nextColumns, \'scrub\');'));
  assert.ok(densityController.includes('window.cancelAnimationFrame(scrubFrameId);'));
  assert.ok(content.includes('scheduleGridColumnCommit(nextColumns);'));
  assert.ok(content.includes('setGridColumnCount((prev) => (prev === pendingColumns ? prev : pendingColumns));'));
  assert.ok(content.includes('const [touchPinchCapable, setTouchPinchCapable] = useState(false);'));
  assert.ok(content.includes('const hasMultiTouch = (window.navigator.maxTouchPoints || 0) > 1;'));
  assert.ok(content.includes('setTouchPinchCapable(coarsePointer || hasMultiTouch);'));
  assert.ok(!densityController.includes('setTimeout('));
  assert.ok(!densityController.includes("quickSetter(gridEl, 'scale')"));
  assert.ok(!densityController.includes('DENSITY_STEP_HYSTERESIS'));
  assert.ok(densityConstants.includes('export const MIN_COLUMNS_MOBILE = 1;'));
  assert.ok(densityConstants.includes('export const MAX_COLUMNS_MOBILE = 6;'));
  assert.ok(pinchController.includes('outwardThreshold = 1.1'));
  assert.ok(pinchController.includes('inwardThreshold = 0.9'));
  assert.ok(pinchController.includes('const STEP_COOLDOWN_MS = 80;'));
  assert.ok(pinchController.includes('const rearmMin = 0.96;'));
  assert.ok(pinchController.includes('const rearmMax = 1.04;'));
  assert.ok(pinchController.includes('let canStep = true;'));
  assert.ok(pinchController.includes('const resolveClassHostEl = () => getClassHostEl?.() ?? visualScaleTargetEl.closest<HTMLElement>(\'.content\');'));
  assert.ok(pinchController.includes('const setGestureActiveClass = (gestureActive: boolean) => {'));
  assert.ok(pinchController.includes("contentEl.classList.add('density-gesture-active');"));
  assert.ok(pinchController.includes("contentEl.classList.remove('density-gesture-active');"));
  assert.ok(pinchController.includes('const handoffMotionAfterRelease = () => {'));
  assert.ok(pinchController.includes("if (!contentEl.classList.contains('density-motion-active')) return;"));
  assert.ok(pinchController.includes("contentEl.classList.remove('density-motion-active');"));
  assert.ok(pinchController.includes("contentEl.classList.add('density-motion-settling');"));
  assert.ok(pinchController.includes('releaseMotionHandoffTimer = window.setTimeout(() => {'));
  assert.ok(pinchController.includes('handoffMotionAfterRelease();'));
  assert.ok(pinchController.includes('if (!canStep) {'));
  assert.ok(pinchController.includes('if ((now - lastStepAt) < STEP_COOLDOWN_MS) {'));
  assert.ok(pinchController.includes('density.setColumnsForPinch(currentColumns - 1);'));
  assert.ok(pinchController.includes('density.setColumnsForPinch(currentColumns + 1);'));
  assert.ok(!pinchController.includes('let stepped = false;'));

  assert.ok(flip.includes('window.requestAnimationFrame(() => {'));
  assert.ok(flip.includes('const ENABLE_DENSITY_FLIP_ANIMATION = false;'));
  assert.ok(flip.includes('const ENABLE_VISIBLE_ILLUSION_LAYER = true;'));
  assert.ok(flip.includes('const ILLUSION_MAX_CARDS = 8;'));
  assert.ok(flip.includes('const ILLUSION_SETTLE_MS = 36;'));
  assert.ok(flip.includes('const createVisibleIllusionLayer = (cards: HTMLElement[]) => {'));
  assert.ok(flip.includes("const scrollHost = gridEl.closest<HTMLElement>('.scroll');"));
  assert.ok(flip.includes('const visibleSlice = rankedVisible.slice(0, ILLUSION_MAX_CARDS);'));
  assert.ok(flip.includes("layer.className = 'density-illusion-layer';"));
  assert.ok(flip.includes("shell.className = 'density-illusion-card';"));
  assert.ok(flip.includes('illusionCardCount'));
  assert.ok(flip.includes('lastRunUsedIllusion'));
  assert.ok(flip.includes('if (!ENABLE_DENSITY_FLIP_ANIMATION) {'));
  assert.ok(flip.includes('setDensityMotionActive(true);'));
  assert.ok(flip.includes("contentEl.classList.add('density-overlay-out');"));
  assert.ok(flip.includes("contentEl.classList.remove('density-overlay-out');"));
  assert.ok(flip.includes("contentEl.classList.add('density-overlay-in');"));
  assert.ok(flip.includes('}, 210);'));
  assert.ok(!pinchController.includes('requestAnimationFrame'));
  assert.ok(pinchController.includes("contentEl.classList.remove('density-motion-active');"));

  const noFlipGateIndex = flip.indexOf('if (!ENABLE_DENSITY_FLIP_ANIMATION) {');
  const earlyMotionIndex = flip.indexOf('setDensityMotionActive(true);', noFlipGateIndex);
  const itemsQueryIndex = flip.indexOf('const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));', noFlipGateIndex);
  const targetPickIndex = flip.indexOf('const animationTargets = pickAnimatedTargets(items);', noFlipGateIndex);
  const illusionIndex = flip.indexOf('const illusion = createVisibleIllusionLayer(items);', noFlipGateIndex);
  assert.ok(noFlipGateIndex >= 0);
  assert.ok(earlyMotionIndex > noFlipGateIndex);
  assert.ok(itemsQueryIndex > earlyMotionIndex);
  assert.ok(targetPickIndex > earlyMotionIndex);
  assert.ok(illusionIndex > earlyMotionIndex);
  assert.ok(flip.includes('motionActive: true,'));
  assert.ok(flip.includes('lastRunUsedFlipByGrid.set(gridEl, false);'));
  assert.ok(flip.includes('flipIsolationEnabled: true,'));
  assert.ok(flip.includes('lastRunUsedFlip: false,'));
  assert.ok(flip.includes('const settleDelayMs = ILLUSION_SETTLE_MS;'));
  assert.ok(flip.includes('window.setTimeout(() => {'));
  assert.ok(flip.includes("if (interactionMode === 'pinch') {"));
  assert.ok(flip.includes("if (interactionMode === 'scrub') {"));
  assert.ok(flip.includes('startFlip();'));
  assert.ok(!flip.includes('const queuedByGrid = new WeakMap<HTMLElement, Omit<AnimateDensityFlipOptions, \'gridEl\'>>();'));
  assert.ok(!flip.includes('queuedByGrid.set(gridEl, {'));
  assert.ok(!flip.includes('const replayQueued = () => {'));
  assert.ok(flip.includes('const state = Flip.getState(animationTargets);'));
  assert.ok(flip.includes('const animationTargets = pickAnimatedTargets(items);'));
  assert.ok(flip.includes('const maxTargets = 72;'));
  assert.ok(flip.includes('const bufferPx = 320;'));
  assert.ok(flip.includes('__explorerDensityMotionDebug'));
  assert.ok(flip.includes('animatedTargetCount'));
  assert.ok(flip.includes('targetReductionActive'));
  assert.ok(flip.includes('commitLayout();'));
  assert.ok(flip.includes('const runIdByGrid = new WeakMap<HTMLElement, number>();'));
  assert.ok(flip.includes('if (runIdByGrid.get(gridEl) !== nextRunId) {'));
  assert.ok(flip.includes('Flip.from(state, {'));
  assert.ok(flip.includes("itemSelector = '.masonry-card'"));
  assert.ok(!flip.includes('MAX_ANIMATED_ITEMS'));
  assert.ok(!flip.includes('pickVisibleAnimationTargets'));
  assert.ok(flip.includes('Flip.killFlipsOf(animationTargets);'));
  assert.ok(flip.includes('gsap.killTweensOf(animationTargets);'));
  assert.ok(flip.includes('targets: animationTargets,'));
  assert.ok(flip.includes('absolute: false,'));
  assert.ok(flip.includes('nested: false,'));
  assert.ok(flip.includes('prune: false,'));
  assert.ok(flip.includes('scale: false,'));
  assert.ok(flip.includes('? 0.14'));
  assert.ok(flip.includes("? 'power2.out'"));
  assert.ok(flip.includes('if (isPinch) return invariantFixups;'));
  assert.ok(flip.includes('overwrite: true,'));
  assert.ok(flip.includes("clearProps: 'transform'"));
  assert.ok(!flip.includes('onEnter: (elements) => {'));
  assert.ok(flip.includes('const previous = activeByGrid.get(gridEl);'));
  assert.ok(flip.includes('previous.kill();'));
  assert.ok(flip.includes("suppressInterruptCleanupByGrid.set(gridEl, true);"));
  assert.ok(flip.includes('onInterrupt: () => {'));
  assert.ok(flip.includes('__explorerDensityFlipDebug'));
  assert.ok(flip.includes('lastRunUsedFlipByGrid.set(gridEl, true);'));

  assert.ok(drawerMotion.includes("export type DrawerPresentationMode = 'side' | 'sheet';"));
  assert.ok(drawerMotion.includes("if (mode === 'sheet') {"));
  assert.ok(drawerMotion.includes('function syncLayoutMode() {'));
  assert.ok(drawerMotion.includes('function setClosedState() {'));
  assert.ok(drawerMotion.includes("drawerEl.dataset.drawerMotionOwned = 'true';"));
  assert.ok(drawerMotion.includes("backdropEl.dataset.drawerMotionOwned = 'true';"));

  assert.ok(topbarMotion.includes('refresh: () => void;'));
  assert.ok(topbarMotion.includes('function refresh() {'));
  assert.ok(topbarMotion.includes('y: -topbarEl.offsetHeight,'));
});

test('local density/context/preview interactions stay network-quiet and do not invoke boot loaders', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');

  const sliderStart = content.indexOf('const commitDensityColumns = useCallback((nextColumns: number, animated = true) => {');
  const sliderBlock = sliderStart >= 0 ? content.slice(sliderStart, sliderStart + 420) : '';
  assert.ok(sliderBlock.includes('density.setColumns(nextColumns, animated);'));
  assert.ok(content.includes('scrubDensityColumns(nextColumns);'));
  assert.ok(!sliderBlock.includes('loadSources('));
  assert.ok(!sliderBlock.includes('loadProjects('));
  assert.ok(!sliderBlock.includes('loadMedia('));
  assert.ok(!sliderBlock.includes('loadAllMedia('));

  const contextStart = content.indexOf('const openContextMenu = useCallback((x: number, y: number, items: MediaItem[]) => {');
  const contextBlock = contextStart >= 0 ? content.slice(contextStart, contextStart + 220) : '';
  assert.ok(contextBlock.includes('setContextMenu({ x, y, items });'));
  assert.ok(!contextBlock.includes('loadSources('));
  assert.ok(!contextBlock.includes('loadProjects('));
  assert.ok(!contextBlock.includes('loadMedia('));
  assert.ok(!contextBlock.includes('loadAllMedia('));

  const previewStart = content.indexOf('const openPreview = useCallback((item: MediaItem) => {');
  const previewBlock = previewStart >= 0 ? content.slice(previewStart, previewStart + 520) : '';
  assert.ok(previewBlock.includes('setInspectorOpen(true);'));
  assert.ok(!previewBlock.includes('loadSources('));
  assert.ok(!previewBlock.includes('loadProjects('));
  assert.ok(!previewBlock.includes('loadMedia('));
  assert.ok(!previewBlock.includes('loadAllMedia('));
});

test('density setup rebinds on grid surface availability and hidden topbar refreshes on height changes', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const topbarMotionPath = path.join(packageRoot, 'src', 'ui', 'motion', 'topbarMotion.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const topbarMotion = fs.readFileSync(topbarMotionPath, 'utf8');

  assert.ok(explorer.includes('const [gridSurfaceEl, setGridSurfaceEl] = useState<HTMLDivElement | null>(null);'));
  assert.ok(explorer.includes('const bindGridSurface = useCallback((node: HTMLDivElement | null) => {'));
  assert.ok(explorer.includes('const gridEl = gridSurfaceEl;'));
  assert.ok(explorer.includes('if (!gridEl || !scrollerEl) return;'));
  assert.ok(explorer.includes('}, [gridSurfaceEl, scheduleGridColumnCommit, touchPinchCapable, view]);'));

  assert.ok(explorer.includes('if (!topbarHidden) return;'));
  assert.ok(explorer.includes('topbarMotionRef.current?.refresh();'));
  assert.ok(explorer.includes('}, [topbarHidden, topbarMeasuredHeight]);'));

  assert.ok(topbarMotion.includes('refresh: () => void;'));
  assert.ok(topbarMotion.includes('function refresh() {'));
  assert.ok(topbarMotion.includes('if (!hidden) return;'));
  assert.ok(topbarMotion.includes('y: -topbarEl.offsetHeight,'));
});

test('persistent-node masonry layout engine exists and uses deterministic shortest-column packing', () => {
  const layoutPath = path.join(packageRoot, 'src', 'explorer', 'masonry', 'computeMasonryLayout.ts');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');

  assert.ok(fs.existsSync(layoutPath), 'computeMasonryLayout.ts should exist');

  const layout = fs.readFileSync(layoutPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');

  assert.ok(layout.includes('export function computeMasonryLayout'));
  assert.ok(layout.includes('containerWidth'));
  assert.ok(layout.includes('columnCount'));
  assert.ok(layout.includes('gutter'));
  assert.ok(layout.includes('const columnHeights'));
  assert.ok(layout.includes('let shortest = 0'));
  assert.ok(layout.includes('if (columnHeights[c] < columnHeights[shortest]) shortest = c;'));
  assert.ok(layout.includes('const x ='));
  assert.ok(layout.includes('const y = columnHeights[shortest]'));
  assert.ok(layout.includes('const width ='));
  assert.ok(layout.includes('const height ='));
  assert.ok(layout.includes('columnHeights[shortest] += height + gutter;'));
  assert.ok(layout.includes('totalHeight'));
  assert.ok(layout.includes('items:'));

  assert.ok(grid.includes('computeMasonryLayout({'));
  assert.ok(grid.includes('entries=') || grid.includes('entries,'));
});

test('asset grid uses persistent flat-list positioned masonry stage instead of per-column subtree buckets', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');

  const grid = fs.readFileSync(gridPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  const explorer = fs.readFileSync(explorerPath, 'utf8');

  assert.ok(grid.includes('className="masonry-host"'));
  assert.ok(grid.includes('className="masonry-columns"'));
  assert.ok(grid.includes('className={`masonry-card'));
  assert.ok(grid.includes('position: \'absolute\'') || grid.includes("position: 'absolute'"));
  assert.ok(grid.includes('left: x'));
  assert.ok(grid.includes('top: y'));
  assert.ok(grid.includes('width'));
  assert.ok(grid.includes('height'));
  assert.ok(grid.includes('data-layout-top={layoutTop}'));
  assert.ok(grid.includes('data-layout-bottom={layoutBottom}'));
  assert.ok(!grid.includes('masonryColumns.map((column'));
  assert.ok(!explorer.includes('prependItemsIntoMasonryColumns<RenderedMediaEntry>'));

  assert.ok(styles.includes('.masonry-host{'));
  assert.ok(styles.includes('.masonry-columns{'));
  assert.ok(styles.includes('.masonry-card{'));
  assert.ok(styles.includes('position: relative;'));
  assert.ok(styles.includes('position: absolute;'));
});

test('asset grid host width measurement is explicitly tied to positioned masonry lifecycle', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const grid = fs.readFileSync(gridPath, 'utf8');

  assert.ok(grid.includes('ResizeObserver'));
  assert.ok(grid.includes('hostRef'));
  assert.ok(grid.includes('setHostWidth'));
  assert.ok(grid.includes('measureHostWidth'));
  assert.ok(grid.includes('window.requestAnimationFrame(() => measureHostWidth())'));
  assert.ok(grid.includes('entries.length'));
  assert.ok(grid.includes('gridColumnCount'));
  assert.ok(
    grid.includes('offsetWidth') || grid.includes('getBoundingClientRect().width'),
    'grid should explicitly measure host width'
  );
});

test('density flip pipeline is continuity-safe for persistent masonry cards', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const flip = fs.readFileSync(flipPath, 'utf8');

  assert.ok(flip.includes("itemSelector = '.masonry-card'"));
  assert.ok(flip.includes('const state = Flip.getState(animationTargets);'));
  assert.ok(flip.includes('commitLayout();'));
  assert.ok(flip.includes('window.requestAnimationFrame(() => {'));
  assert.ok(flip.includes('Flip.from(state, {'));
  assert.ok(flip.includes('targets: animationTargets,'));
  assert.ok(flip.includes('absolute: false,'));
  assert.ok(flip.includes('nested: false,'));
  assert.ok(flip.includes('prune: false,'));
  assert.ok(flip.includes('scale: false,'));
  assert.ok(flip.includes('overwrite: true,'));
  assert.ok(flip.includes('Flip.killFlipsOf(animationTargets);'));
  assert.ok(flip.includes('gsap.killTweensOf(animationTargets);'));
  assert.ok(flip.includes("clearProps: 'transform'"));
  assert.ok(!flip.includes('onEnter: (elements) => {'));
  assert.ok(!flip.includes("clearProps: 'transform,opacity'"));
  assert.ok(!flip.includes("clearProps: 'opacity'"));
  assert.ok(!flip.includes('absolute: true,'));
  assert.ok(!flip.includes('prune: true,'));
});

test('density controller keeps committed columns as single truth and mobile clamp stays 1..6', () => {
  const controllerPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createExplorerDensityController.ts');
  const constantsPath = path.join(packageRoot, 'src', 'explorer', 'density', 'constants.ts');
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');

  const controller = fs.readFileSync(controllerPath, 'utf8');
  const constants = fs.readFileSync(constantsPath, 'utf8');
  const explorer = fs.readFileSync(explorerPath, 'utf8');

  assert.ok(constants.includes('export const MIN_COLUMNS_MOBILE = 1;'));
  assert.ok(constants.includes('export const MAX_COLUMNS_MOBILE = 6;'));

  assert.ok(controller.includes("gridEl.style.setProperty('--masonry-column-count', String(currentColumns));"));
  assert.ok(!controller.includes('currentColumns = safeColumns;'));
  assert.ok(controller.includes('commitLayoutColumns(safeColumns);'));
  assert.ok(controller.includes('syncSlider'));
  assert.ok(controller.includes('onColumnsCommit'));
  assert.ok(controller.includes('scrubTo'));
  assert.ok(controller.includes('settle'));
  assert.ok(!controller.includes('setTimeout('));
  assert.ok(!controller.includes("quickSetter(gridEl, 'scale')"));

  assert.ok(explorer.includes('value={gridColumnCount}'));
  assert.ok(explorer.includes('min={MIN_COLUMNS_MOBILE}'));
  assert.ok(explorer.includes('max={MAX_COLUMNS_MOBILE}'));
});

test('density-related local interactions remain layout-only and do not trigger boot/data loaders', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const hook = fs.readFileSync(hookPath, 'utf8');

  const commitStart = explorer.indexOf('const commitDensityColumns = useCallback');
  const commitBlock = commitStart >= 0 ? explorer.slice(commitStart, commitStart + 700) : '';

  assert.ok(commitBlock.includes('density.setColumns(nextColumns, animated);'));
  assert.ok(!commitBlock.includes('loadSources('));
  assert.ok(!commitBlock.includes('loadProjects('));
  assert.ok(!commitBlock.includes('loadMedia('));
  assert.ok(!commitBlock.includes('loadAllMedia('));

  const contextStart = explorer.indexOf('const openContextMenu = useCallback');
  const contextBlock = contextStart >= 0 ? explorer.slice(contextStart, contextStart + 280) : '';
  assert.ok(contextBlock.includes('setContextMenu({ x, y, items });'));
  assert.ok(!contextBlock.includes('loadSources('));
  assert.ok(!contextBlock.includes('loadProjects('));

  const previewStart = explorer.indexOf('const openPreview = useCallback');
  const previewBlock = previewStart >= 0 ? explorer.slice(previewStart, previewStart + 900) : '';
  assert.ok(previewBlock.includes('setInspectorOpen(true);'));
  assert.ok(!previewBlock.includes('loadSources('));
  assert.ok(!previewBlock.includes('loadProjects('));

  assert.ok(hook.includes('openPreview(item);'));
  assert.ok(hook.includes('openContextMenu(event.clientX, event.clientY, resolveContextItems())'));
});

test('preview drawer and inspector backdrop maintain explicit ownership contract', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const drawerMotionPath = path.join(packageRoot, 'src', 'ui', 'motion', 'drawerMotion.ts');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const drawerMotion = fs.readFileSync(drawerMotionPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.ok(explorer.includes('inspector-backdrop'));
  assert.ok(explorer.includes('data-inspector-backdrop="true"'));
  assert.ok(explorer.includes('data-inspector-drawer="true"'));
  assert.ok(explorer.includes('createDrawerMotion(drawerEl, backdropEl, {'));
  assert.ok(explorer.includes("getMode: () => (modeQuery.matches ? 'sheet' : 'side')"));
  assert.ok(explorer.includes('controller.syncLayoutMode();'));

  assert.ok(drawerMotion.includes("export type DrawerPresentationMode = 'side' | 'sheet';"));
  assert.ok(drawerMotion.includes('function syncLayoutMode() {'));
  assert.ok(drawerMotion.includes('function setClosedState() {'));
  assert.ok(drawerMotion.includes("drawerEl.dataset.drawerMotionOwned = 'true';"));
  assert.ok(drawerMotion.includes("backdropEl.dataset.drawerMotionOwned = 'true';"));

  assert.ok(styles.includes('.inspector-backdrop'));
});

test('topbar hidden offset refresh and density setup rebinding remain explicitly guarded', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const topbarMotionPath = path.join(packageRoot, 'src', 'ui', 'motion', 'topbarMotion.ts');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const topbarMotion = fs.readFileSync(topbarMotionPath, 'utf8');

  assert.ok(explorer.includes('const [gridSurfaceEl, setGridSurfaceEl] = useState<HTMLDivElement | null>(null);'));
  assert.ok(explorer.includes('const bindGridSurface = useCallback((node: HTMLDivElement | null) => {'));
  assert.ok(explorer.includes('const gridEl = gridSurfaceEl;'));
  assert.ok(explorer.includes('if (!gridEl || !scrollerEl) return;'));

  assert.ok(explorer.includes('if (!topbarHidden) return;'));
  assert.ok(explorer.includes('topbarMotionRef.current?.refresh();'));

  assert.ok(topbarMotion.includes('refresh: () => void;'));
  assert.ok(topbarMotion.includes('function refresh() {'));
  assert.ok(topbarMotion.includes('if (!hidden) return;'));
});

test('masonry stage and scroll container explicitly suppress horizontal overflow', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.ok(styles.includes('.content .scroll{'));
  assert.ok(styles.includes('overflow-x: hidden;'));
  assert.ok(styles.includes('.masonry-host{'));
  assert.ok(styles.includes('overflow-x: clip;'));
  assert.ok(styles.includes('.masonry-columns{'));
  assert.ok(styles.includes('max-width: 100%;') || styles.includes('overflow-x: clip;'));
});

test('masonry cards do not keep baseline CSS transform transitions that conflict with density flip ownership', () => {
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.ok(styles.includes('.masonry-card.asset{'));
  assert.ok(styles.includes('transition: filter 120ms ease, border-color 120ms ease;'));
  assert.ok(styles.includes('.masonry-card.asset.asset-interactive-surface{'));
  assert.ok(styles.includes('touch-action: pan-y;'));
  assert.ok(styles.includes('.masonry-card.asset:hover{'));
  assert.ok(styles.includes('transform: none;'));
  assert.ok(styles.includes('.masonry-card.page-load-enter{'));
  assert.ok(styles.includes('animation: masonryPageLoadIn 320ms cubic-bezier(0.16, 1, 0.3, 1) forwards;'));
  assert.ok(styles.includes('.masonry-card.scroll-reveal-visible{'));
  assert.ok(styles.includes('opacity 380ms cubic-bezier(0.16, 1, 0.3, 1),'));
  assert.ok(styles.includes('.asset .asset-overlay{'));
  assert.ok(styles.includes('touch-action: none;'));
  assert.ok(styles.includes('@keyframes masonryPageLoadIn{'));
});

test('computeMasonryLayout unit contracts are present for deterministic geometry output', () => {
  const layoutPath = path.join(packageRoot, 'src', 'explorer', 'masonry', 'computeMasonryLayout.ts');
  const content = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(content.includes('export function computeMasonryLayout'));
  assert.ok(content.includes('cards') || content.includes('entries'));
  assert.ok(content.includes('containerWidth'));
  assert.ok(content.includes('columnCount'));
  assert.ok(content.includes('gutter'));
  assert.ok(content.includes('const safeWidth'));
  assert.ok(content.includes('const count'));
  assert.ok(content.includes('const usableWidth'));
  assert.ok(content.includes('const columnWidth'));
  assert.ok(content.includes('new Array(count).fill'));
  assert.ok(content.includes('Math.max(0'));
  assert.ok(content.includes('Math.round'));
  assert.ok(content.includes('return {'));
  assert.ok(content.includes('items'));
  assert.ok(content.includes('totalHeight'));
});

test('computeMasonryLayout uses stable identity and aspect-driven height math', () => {
  const layoutPath = path.join(packageRoot, 'src', 'explorer', 'masonry', 'computeMasonryLayout.ts');
  const content = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(content.includes('id:'));
  assert.ok(content.includes('aspectRatio') || content.includes('heightRatio'));
  assert.ok(
    content.includes('width /') || content.includes('/ aspectRatio') || content.includes('height = Math.round'),
    'layout should derive height from width and ratio'
  );
  assert.ok(content.includes('x:'));
  assert.ok(content.includes('y:'));
  assert.ok(content.includes('width:'));
  assert.ok(content.includes('height:'));
});

test('computeMasonryLayout shortest-column packing and stage height aggregation remain explicit', () => {
  const layoutPath = path.join(packageRoot, 'src', 'explorer', 'masonry', 'computeMasonryLayout.ts');
  const content = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(content.includes('columnHeights'));
  assert.ok(content.includes('shortest'));
  assert.ok(content.includes('if (columnHeights[c] < columnHeights[shortest])'));
  assert.ok(content.includes('columnHeights[shortest] +='));
  assert.ok(content.includes('Math.max(...columnHeights') || content.includes('Math.max(...'));
});

test('positioned masonry renderer keeps card geometry in data attributes for continuity/debugging', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const content = fs.readFileSync(gridPath, 'utf8');

  assert.ok(content.includes('data-card-id=') || content.includes('data-card-id={'));
  assert.ok(content.includes('data-layout-top={layoutTop}'));
  assert.ok(content.includes('data-layout-bottom={layoutBottom}'));
  assert.ok(content.includes("'--card-index': String(index)"));
  assert.ok(content.includes('data-density-columns=') || content.includes('data-density-columns={'));
  assert.ok(content.includes('left: x'));
  assert.ok(content.includes('top: y'));
  assert.ok(content.includes('width'));
  assert.ok(content.includes('height'));
});

test('positioned masonry renderer no longer depends on per-column React bucket regrouping', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const statePath = path.join(packageRoot, 'src', 'state.ts');
  const content = fs.readFileSync(gridPath, 'utf8');
  const state = fs.readFileSync(statePath, 'utf8');

  assert.ok(!content.includes('masonryColumns.map('));
  assert.ok(!content.includes('className="masonry-column"'));
  assert.ok(content.includes('entries.map(') || content.includes('layout.items.map('));
  assert.ok(state.includes('buildMasonryColumns'), 'legacy bucket helper may still exist for other paths');
});

test('density animation pipeline avoids ordinary-card enter-fade behavior and opacity cleanup', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(!content.includes('onEnter:'));
  assert.ok(!content.includes('autoAlpha'));
  assert.ok(!content.includes("clearProps: 'opacity'"));
  assert.ok(!content.includes("shell.style.opacity = '0.96';"));
  assert.ok(content.includes("clearProps: 'transform'"));
  assert.ok(content.includes('onComplete'));
  assert.ok(content.includes('onInterrupt'));
});

test('density animation pipeline interrupts stale transitions before new layout animation', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(content.includes('const previous = activeByGrid.get(gridEl);'));
  assert.ok(content.includes('previous.kill();'));
  assert.ok(content.includes('activeByGrid.delete(gridEl);'));
  assert.ok(content.includes("suppressInterruptCleanupByGrid.set(gridEl, true);"));
  assert.ok(content.includes('Flip.killFlipsOf(animationTargets);'));
  assert.ok(content.includes('gsap.killTweensOf(animationTargets);'));
  assert.ok(content.includes('const state = Flip.getState(animationTargets);'));
  assert.ok(content.includes('const runIdByGrid = new WeakMap<HTMLElement, number>();'));
});

test('density settle callbacks explicitly report no queued replay in immediate retarget mode', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(content.includes('onSettled?.({ invariantFixups, queuedReplay: false });'));
  assert.ok(!content.includes('const queuedReplay = replayQueued();'));
});

test('density animation targets are reduced to visible/near-visible cards while keeping global layout commits', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(content.includes('const pickAnimatedTargets = (items: HTMLElement[]) => {'));
  assert.ok(content.includes("const scrollHost = gridEl.closest<HTMLElement>('.scroll');"));
  assert.ok(content.includes('const maxTargets = 72;'));
  assert.ok(content.includes('const bufferPx = 320;'));
  assert.ok(content.includes('const reducedTargets = targets.length ? targets : items.slice(0, maxTargets);'));
  assert.ok(content.includes('const animationTargets = pickAnimatedTargets(items);'));
  assert.ok(content.includes('commitLayout();'));
});

test('density animation sequencing explicitly captures old state before commit and starts animation after commit path', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  const stateIndex = content.indexOf('const state = Flip.getState(animationTargets);');
  const commitIndex = content.indexOf('commitLayout();');
  const immediateIndex = content.indexOf("if (interactionMode === 'pinch') {");
  const delayedIndex = content.indexOf('window.requestAnimationFrame(() => {', immediateIndex + 1);
  const fromIndex = content.indexOf('const animation = Flip.from(state, {');

  assert.ok(stateIndex >= 0);
  assert.ok(commitIndex > stateIndex);
  assert.ok(immediateIndex > commitIndex);
  assert.ok(delayedIndex > immediateIndex);
  assert.ok(fromIndex > commitIndex);
});

test('density controls preserve slider UI and do not regress to mobile stepper-only control', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');

  assert.ok(content.includes('id="asset-density-slider"'));
  assert.ok(content.includes('type="range"'));
  assert.ok(content.includes('value={gridColumnCount}'));
  assert.ok(content.includes('step={1}'));
  assert.ok(content.includes('min={MIN_COLUMNS_MOBILE}'));
  assert.ok(content.includes('max={MAX_COLUMNS_MOBILE}'));
  assert.ok(!content.includes('Density</span>') || content.includes('asset-density-slider'));
});

test('committed density value is mirrored consistently into layout UI attributes and readout', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const controllerPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createExplorerDensityController.ts');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const controller = fs.readFileSync(controllerPath, 'utf8');

  assert.ok(explorer.includes('const [gridColumnCount, setGridColumnCount] = useState('));
  assert.ok(explorer.includes('onColumnsCommit: (next) => {') || explorer.includes('onColumnsCommit'));
  assert.ok(grid.includes('data-density-columns={gridColumnCount}'));
  assert.ok(controller.includes('gridEl.dataset.columns = String(currentColumns);') || controller.includes('gridEl.dataset.columns'));
  assert.ok(controller.includes('if (sliderEl && sliderEl.value !== String(columns))'));
});

test('pinch density path is discrete and supports repeated notch snaps within one gesture', () => {
  const pinchPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createPinchDensityController.ts');
  const content = fs.readFileSync(pinchPath, 'utf8');

  assert.ok(content.includes('outwardThreshold = 1.1'));
  assert.ok(content.includes('inwardThreshold = 0.9'));
  assert.ok(content.includes('function onViewportBoundaryChange() {'));
  assert.ok(content.includes("window.addEventListener('resize', onViewportBoundaryChange, { passive: true });"));
  assert.ok(content.includes("window.addEventListener('orientationchange', onViewportBoundaryChange, { passive: true });"));
  assert.ok(content.includes("window.removeEventListener('resize', onViewportBoundaryChange);"));
  assert.ok(content.includes("window.removeEventListener('orientationchange', onViewportBoundaryChange);"));
  assert.ok(content.includes('const resetGestureLifecycle = () => {'));
  assert.ok(content.includes("contentEl.classList.remove('density-gesture-active');"));
  assert.ok(content.includes('density.settleScrub();'));
  assert.ok(content.includes('let canStep = true;'));
  assert.ok(content.includes('if (!canStep) {'));
  assert.ok(content.includes('ratio >= rearmMin && ratio <= rearmMax'));
  assert.ok(content.includes('const STEP_COOLDOWN_MS = 80;'));
  assert.ok(content.includes('if ((now - lastStepAt) < STEP_COOLDOWN_MS) {'));
  assert.ok(content.includes('density.setColumnsForPinch(currentColumns - 1);'));
  assert.ok(content.includes('density.setColumnsForPinch(currentColumns + 1);'));
  assert.ok(content.includes('__explorerPinchDebug'));
  assert.ok(content.includes('startsRejectedSingleTouch'));
  assert.ok(content.includes("pinchDebug.lastReason = 'touchstart_without_pair';"));
  assert.ok(content.includes("pinchDebug.lastReason = 'step_out';"));
  assert.ok(content.includes("pinchDebug.lastReason = 'step_in';"));
  assert.ok(!content.includes('let stepped = false;'));
  assert.ok(!content.includes('quickSetter'));
  assert.ok(!content.includes('scaleThresholdPerStep'));
});

test('preview/backdrop styles and ownership markers remain explicit enough to prevent dimmer-only state', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const drawerMotionPath = path.join(packageRoot, 'src', 'ui', 'motion', 'drawerMotion.ts');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  const drawerMotion = fs.readFileSync(drawerMotionPath, 'utf8');

  assert.ok(explorer.includes('data-inspector-backdrop="true"'));
  assert.ok(explorer.includes('data-inspector-drawer="true"'));
  assert.ok(explorer.includes('inspector-backdrop'));
  assert.ok(drawerMotion.includes("drawerEl.dataset.drawerMotionOwned = 'true';"));
  assert.ok(drawerMotion.includes("backdropEl.dataset.drawerMotionOwned = 'true';"));
  assert.ok(styles.includes('.inspector-backdrop'));
  assert.ok(styles.includes('.drawer'));
});

test('no generic load-failure console spam contract should remain in explorer-facing source', () => {
  const filesToCheck = [
    path.join(packageRoot, 'src', 'ExplorerApp.tsx'),
    path.join(packageRoot, 'src', 'thumbnailLoader.ts'),
    path.join(packageRoot, 'src', 'useThumbnailQueue.ts'),
    path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx'),
    path.join(packageRoot, 'src', 'AssetPreviewPanel.tsx'),
  ];

  const combined = filesToCheck
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n');

  assert.ok(!combined.includes("console.log('Load failed')"));
  assert.ok(!combined.includes('console.log("Load failed")'));
});

test('layout interactions do not require grid-list view toggle as part of intended recompute path', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');

  const commitStart = explorer.indexOf('const commitDensityColumns = useCallback');
  const commitBlock = commitStart >= 0 ? explorer.slice(commitStart, commitStart + 900) : '';

  assert.ok(!commitBlock.includes("setView('list')"));
  assert.ok(!commitBlock.includes("setView('grid')"));
  assert.ok(grid.includes('measureHostWidth'));
  assert.ok(grid.includes('gridColumnCount'));
});

test('host width + layout recompute path remains coupled to density and entry-count changes', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const content = fs.readFileSync(gridPath, 'utf8');

  assert.ok(content.includes('useLayoutEffect(() => {'));
  assert.ok(content.includes('measureHostWidth();'));
  assert.ok(content.includes('window.requestAnimationFrame(() => measureHostWidth())'));
  assert.ok(content.includes('entries.length'));
  assert.ok(content.includes('gridColumnCount'));
  assert.ok(content.includes('const layout = useMemo('));
  assert.ok(content.includes('computeMasonryLayout({'));
  assert.ok(content.includes('shouldIncludeItem: ({ y, height }) => {'));
  assert.ok(content.includes('renderWindowTop'));
  assert.ok(content.includes('renderWindowBottom'));
  assert.ok(content.includes('containerWidth: hostWidth') || content.includes('containerWidth:'));
});

test('positioned masonry stage exposes enough hooks for future real runtime tests', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const content = fs.readFileSync(gridPath, 'utf8');

  assert.ok(content.includes('hostRef'));
  assert.ok(content.includes('gridRef'));
  assert.ok(content.includes('data-card-id'));
  assert.ok(content.includes('data-layout-top'));
  assert.ok(content.includes('data-layout-bottom'));
  assert.ok(content.includes('className="masonry-host"'));
  assert.ok(content.includes('className="masonry-columns"'));
  assert.ok(content.includes('className={`masonry-card'));
  assert.ok(content.includes('__explorerDensityLayoutDebug'));
  assert.ok(content.includes('getSnapshot: () => {'));
  assert.ok(content.includes('layoutRecomputeCount'));
  assert.ok(content.includes('layoutComputedItemCount'));
  assert.ok(content.includes("const layoutComputationScope = layout.includedItemCount < layout.totalItemCount ? 'windowed' : 'global';"));
  assert.ok(content.includes('layoutComputationScope,'));
  assert.ok(content.includes('totalLogicalCount: layout.totalItemCount'));
  assert.ok(content.includes('layoutComputedItemCount: layout.includedItemCount'));
  assert.ok(content.includes('motionBufferEverUsedRef'));
  assert.ok(content.includes('lastBufferModeUsedRef'));
  assert.ok(content.includes('lastLayoutScopeUsedRef'));
  assert.ok(content.includes('lastMotionActiveAtMsRef'));
  assert.ok(content.includes('const ENABLE_MOTION_AWARE_BUFFER = false;'));
  assert.ok(content.includes('const ENABLE_SIMPLIFIED_CARD_SUBTREE_ISOLATION = true;'));
  assert.ok(content.includes('const [simplifiedCardSubtreeActive, setSimplifiedCardSubtreeActive] = useState(false);'));
  assert.ok(content.includes('const [pageLoadEntranceActive, setPageLoadEntranceActive] = useState(true);'));
  assert.ok(content.includes('const [revealedCards, setRevealedCards] = useState<Set<string>>(() => new Set());'));
  assert.ok(content.includes('const [visibleCards, setVisibleCards] = useState<Set<string>>(() => new Set());'));
  assert.ok(content.includes('const revealedCardsRef = useRef<Set<string>>(new Set());'));
  assert.ok(content.includes('const visibleCardsRef = useRef<Set<string>>(new Set());'));
  assert.ok(content.includes('revealedCardsRef.current = revealedCards;'));
  assert.ok(content.includes('visibleCardsRef.current = visibleCards;'));
  assert.ok(content.includes('const revealFailSafeTimersRef = useRef<Map<string, number>>(new Map());'));
  assert.ok(content.includes('const revealVisibilityRafByKeyRef = useRef<Map<string, { raf1: number; raf2: number }>>(new Map());'));
  assert.ok(content.includes('new IntersectionObserver((entries) => {'));
  assert.ok(content.includes("threshold: 0,"));
  assert.ok(content.includes("rootMargin: '240px 0px 360px 0px',"));
  assert.ok(content.includes("pageLoadEntranceActive ? 'page-load-enter' : ''"));
  assert.ok(content.includes("!isScrollRevealVisible ? 'scroll-reveal-pending' : ''"));
  assert.ok(content.includes("isScrollRevealVisible ? 'scroll-reveal-visible' : ''"));
  assert.ok(content.includes("'--page-load-delay': `${pageLoadDelayMs}ms`"));
  assert.ok(content.includes("'--scroll-reveal-delay': `${Math.min(index, 6) * 12}ms`"));
  assert.ok(content.includes('const inPrewarmViewport = bottom >= (viewportTop - 80) && top <= (viewportBottom + 160);'));
  assert.ok(content.includes('const failSafeTimer = window.setTimeout(() => {'));
  assert.ok(content.includes('setVisibleCards((prev) => {'));
  assert.ok(content.includes('}, 220);'));
  assert.ok(content.includes('return changed ? next : prev;'));
  assert.ok(content.includes('if (pending.size) {'));
  assert.ok(content.includes('window.requestAnimationFrame(() => {'));
  assert.ok(content.includes('if (prewarmFlushRafId) {'));
  assert.ok(content.includes('window.cancelAnimationFrame(prewarmFlushRafId);'));
  assert.ok(content.includes('revealFailSafeTimersRef.current.forEach((timer) => window.clearTimeout(timer));'));
  assert.ok(content.includes('revealVisibilityRafByKeyRef.current.forEach(({ raf1, raf2 }) => {'));
  assert.ok(content.includes('lastDensityTransitionUsedSimplifiedRef'));
  assert.ok(content.includes('motionBufferEverUsed: motionBufferEverUsedRef.current'));
  assert.ok(content.includes('lastBufferModeUsed: lastBufferModeUsedRef.current'));
  assert.ok(content.includes('lastLayoutScopeUsed: lastLayoutScopeUsedRef.current'));
  assert.ok(content.includes('isolationMotionAwareBufferEnabled'));
  assert.ok(content.includes('motionObserverCallbackCount'));
  assert.ok(content.includes('renderWindowUpdateCount'));
  assert.ok(content.includes('simplifiedCardIsolationEnabled'));
  assert.ok(content.includes('simplifiedCardSubtreeActive'));
  assert.ok(content.includes('lastDensityTransitionUsedSimplified'));
  assert.ok(content.includes("cardSubtreeMode: simplifiedCardSubtreeActive ? 'simplified' : 'full'"));
  assert.ok(content.includes("className={`asset-overlay ${simplifiedCardSubtreeActive ? 'is-simplified' : ''}`}"));
  assert.ok(content.includes('renderBufferMode'));
  assert.ok(content.includes("contentEl.classList.contains('density-motion-active')"));
  assert.ok(content.includes('sampleCards'));
  assert.ok(content.includes('flipActive'));
});

test('density motion debug hook exposes target-reduction and viewport bounds', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(content.includes('__explorerDensityMotionDebug'));
  assert.ok(content.includes('getSnapshot: () => {'));
  assert.ok(content.includes('totalCardCount'));
  assert.ok(content.includes('animatedTargetCount'));
  assert.ok(content.includes('visibleCardCount'));
  assert.ok(content.includes('targetReductionActive'));
  assert.ok(content.includes('viewportTop'));
  assert.ok(content.includes('viewportBottom'));
  assert.ok(content.includes('motionActive'));
  assert.ok(content.includes('simplifiedCardMode'));
  assert.ok(content.includes('classHostTag'));
  assert.ok(content.includes('classHostClassName'));
  assert.ok(content.includes('gestureClassApplied'));
  assert.ok(content.includes('motionClassApplied'));
  assert.ok(content.includes('settlingClassApplied'));
  assert.ok(content.includes('setDensityMotionActive(true);'));
  assert.ok(content.includes('setDensityMotionActive(false);'));
  assert.ok(content.includes("contentEl.classList.remove('density-motion-settling');"));
  assert.ok(content.includes("contentEl.classList.add('density-motion-active');"));
  assert.ok(content.includes("contentEl.classList.remove('density-motion-active');"));
  assert.ok(content.includes("if (contentEl.classList.contains('density-gesture-active')) {"));
  assert.ok(content.includes('void contentEl.offsetHeight;'));
  assert.ok(content.includes("contentEl.classList.add('density-motion-settling');"));
  assert.ok(content.includes("contentEl.classList.remove('density-motion-settling');"));
  assert.ok(content.includes('const settleTimer = window.setTimeout(() => {'));
  assert.ok(content.includes('}, 360);'));
});

test('density flip cleanup path re-queries current masonry nodes to prevent stale transforms after repeated commits', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(content.includes('const clearTransforms = () => {'));
  assert.ok(content.includes('const currentItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));'));
  assert.ok(content.includes('if (!currentItems.length) return 0;'));
  assert.ok(content.includes("gsap.set(currentItems, { clearProps: 'transform' });"));
  assert.ok(content.includes('if (isPinch) return invariantFixups;'));
  assert.ok(content.includes('clearTransforms();'));
  assert.ok(content.includes('onComplete: () => {'));
  assert.ok(content.includes('onInterrupt: () => {'));
});

test('density flip no-item and stale-frame paths still enforce single settled layout truth', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(content.includes('const previous = activeByGrid.get(gridEl);'));
  assert.ok(content.includes('previous.kill();'));
  assert.ok(content.includes('activeByGrid.delete(gridEl);'));
  assert.ok(content.includes('if (!items.length) {'));
  assert.ok(content.includes('const applyCommit = commitLayout;'));
  assert.ok(content.includes('applyCommit();'));
  assert.ok(content.includes('if (runIdByGrid.get(gridEl) !== nextRunId) {'));
  assert.ok(content.includes('clearTransforms();'));
});

test('density flip clear path explicitly forces transform/transition reset on live cards', () => {
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const content = fs.readFileSync(flipPath, 'utf8');

  assert.ok(content.includes("card.style.transition = 'none';"));
  assert.ok(content.includes("card.style.transform = 'none';"));
  assert.ok(content.includes("card.style.removeProperty('transition');"));
  assert.ok(content.includes('window.requestAnimationFrame(() => {'));
});

test('asset grid does not run global post-render transform reset that conflicts with flip motion ownership', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const content = fs.readFileSync(gridPath, 'utf8');

  assert.ok(!content.includes("card.style.transition = 'none';"));
  assert.ok(!content.includes("card.style.transform = 'none';"));
  assert.ok(!content.includes("card.style.removeProperty('transform');"));
  assert.ok(!content.includes("card.style.removeProperty('transition');"));
});

test('density controller/flip tuning keeps jump-distance-aware motion timing under animation-layer ownership', () => {
  const controllerPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createExplorerDensityController.ts');
  const flipPath = path.join(packageRoot, 'src', 'explorer', 'density', 'animateDensityFlip.ts');
  const controller = fs.readFileSync(controllerPath, 'utf8');
  const flip = fs.readFileSync(flipPath, 'utf8');

  assert.ok(controller.includes('const jumpDistance = Math.abs(safeColumns - currentColumns);'));
  assert.ok(controller.includes('jumpDistance,'));
  assert.ok(flip.includes('jumpDistance = 1'));
  assert.ok(flip.includes('jumpDistance >= 2 ? 0.16 : 0.2'));
  assert.ok(flip.includes('jumpDistance >= 2 ? 0.22 : 0.28'));
  assert.ok(flip.includes("? 'power2.out'"));
  assert.ok(flip.includes("if (interactionMode === 'pinch') {"));
  assert.ok(flip.includes("if (interactionMode === 'scrub') {"));
  assert.ok(flip.includes('scale: false,'));
  assert.ok(flip.includes('duration: isPinch'));
  assert.ok(flip.includes('? 0.14'));
  assert.ok(flip.includes("? 'power2.out'"));
});

test('pinch shader overlay mounts as a visual-only layer and exposes safe pulse/release lifecycle', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const controllerPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createPinchDensityController.ts');
  const hookPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'pinch', 'usePinchShaderOverlay.ts');
  const overlayPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'pinch', 'PinchShaderOverlay.tsx');
  const vertPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'pinch', 'pinchFeedback.vert');
  const fragPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'pinch', 'pinchFeedback.frag');
  const coreDir = path.join(packageRoot, 'src', 'ui', 'shaders', 'core');
  const tapDir = path.join(packageRoot, 'src', 'ui', 'shaders', 'tap');
  const holdDir = path.join(packageRoot, 'src', 'ui', 'shaders', 'hold');
  const sharedDir = path.join(packageRoot, 'src', 'ui', 'shaders', 'shared');
  const tapHookPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'tap', 'useTapShaderOverlay.ts');
  const tapOverlayPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'tap', 'TapShaderOverlay.tsx');
  const holdHookPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'hold', 'useHoldShaderOverlay.ts');
  const holdOverlayPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'hold', 'HoldShaderOverlay.tsx');
  const coreHelperPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'core', 'createFullscreenWebGLProgram.ts');
  const sharedTypesPath = path.join(packageRoot, 'src', 'ui', 'shaders', 'shared', 'interactionShaderTypes.ts');
  const interactionsPath = path.join(packageRoot, 'src', 'useAssetInteractions.ts');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');

  assert.ok(fs.existsSync(vertPath));
  assert.ok(fs.existsSync(fragPath));
  assert.ok(fs.existsSync(hookPath));
  assert.ok(fs.existsSync(overlayPath));
  assert.ok(fs.existsSync(coreDir));
  assert.ok(fs.existsSync(tapDir));
  assert.ok(fs.existsSync(holdDir));
  assert.ok(fs.existsSync(sharedDir));
  assert.ok(fs.existsSync(tapHookPath));
  assert.ok(fs.existsSync(tapOverlayPath));
  assert.ok(fs.existsSync(holdHookPath));
  assert.ok(fs.existsSync(holdOverlayPath));
  assert.ok(fs.existsSync(coreHelperPath));
  assert.ok(fs.existsSync(sharedTypesPath));

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const controller = fs.readFileSync(controllerPath, 'utf8');
  const hook = fs.readFileSync(hookPath, 'utf8');
  const overlay = fs.readFileSync(overlayPath, 'utf8');
  const interactions = fs.readFileSync(interactionsPath, 'utf8');
  const tapHook = fs.readFileSync(tapHookPath, 'utf8');
  const tapOverlay = fs.readFileSync(tapOverlayPath, 'utf8');
  const holdHook = fs.readFileSync(holdHookPath, 'utf8');
  const holdOverlay = fs.readFileSync(holdOverlayPath, 'utf8');
  const coreHelper = fs.readFileSync(coreHelperPath, 'utf8');
  const sharedTypes = fs.readFileSync(sharedTypesPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');

  assert.ok(explorer.includes('<PinchShaderOverlay'));
  assert.ok(explorer.includes('<TapShaderOverlay'));
  assert.ok(explorer.includes('tapTrigger={tapOverlayTrigger}'));
  assert.ok(explorer.includes('<HoldShaderOverlay'));
  assert.ok(explorer.includes('progress={holdOverlayProgress}'));
  assert.ok(explorer.includes('completionBeat={holdOverlayCompleteBeat}'));
  assert.ok(explorer.includes("import PinchShaderOverlay from './ui/shaders/pinch/PinchShaderOverlay';"));
  assert.ok(explorer.includes("import TapShaderOverlay from './ui/shaders/tap/TapShaderOverlay';"));
  assert.ok(explorer.includes("import HoldShaderOverlay from './ui/shaders/hold/HoldShaderOverlay';"));
  assert.ok(explorer.includes('onPulse={(trigger) => {'));
  assert.ok(explorer.includes('pinchPulseTriggerRef.current?.(dir);'));
  assert.ok(explorer.includes('fingerA={pinchFingerA}'));
  assert.ok(explorer.includes('fingerB={pinchFingerB}'));
  assert.ok(explorer.includes('nodeCount={pinchDisplayNodeCount}'));
  assert.ok(explorer.includes('pinchOverlayGestureActiveRef.current'));
  assert.ok(explorer.includes('pinchOverlayPendingNodeCountRef.current = gridColumnCount;'));
  assert.ok(explorer.includes('const pendingCount = pinchOverlayPendingNodeCountRef.current;'));
  assert.ok(explorer.includes('const nextNodeCount = pendingCount ?? density.getColumns();'));
  assert.ok(explorer.includes('setPinchPerfActive(true);'));
  assert.ok(explorer.includes("pinchPerfTimeoutRef.current = window.setTimeout(() => {"));
  assert.ok(explorer.includes('pinch-perf-active'));
  assert.ok(explorer.includes('window.requestAnimationFrame(() => {'));
  assert.ok(explorer.includes("scrollerEl.addEventListener('wheel', onWheel, { passive: false });"));
  assert.ok(explorer.includes('if (!event.ctrlKey) return;'));
  assert.ok(explorer.includes('event.preventDefault();'));
  assert.ok(explorer.includes('let ctrlWheelPendingColumns: number | null = null;'));
  assert.ok(explorer.includes('const deltaColumns = nextStep < 0 ? -1 : 1;'));
  assert.ok(explorer.includes('const nextColumns = clampDensityColumns(seededColumns + deltaColumns);'));
  assert.ok(explorer.includes('ctrlWheelPendingColumns = nextColumns;'));
  assert.ok(explorer.includes('densityControllerRef.current?.setColumnsForPinch(nextColumns);'));
  assert.ok(explorer.includes('const CTRL_WHEEL_IDLE_RESET_MS = 140;'));
  assert.ok(explorer.includes('ctrlWheelIdleTimer = window.setTimeout(() => {'));
  assert.ok(explorer.includes('resetCtrlWheelSession();'));
  assert.ok(explorer.includes('__explorerCtrlWheelDensityDebug'));

  assert.ok(controller.includes('onPinchFrame?:'));
  assert.ok(controller.includes('onPinchStep?:'));
  assert.ok(controller.includes('onPinchRelease?:'));
  assert.ok(controller.includes('onPinchFrame?.('));
  assert.ok(controller.includes('onPinchStep?.(1);'));
  assert.ok(controller.includes('onPinchStep?.(-1);'));
  assert.ok(controller.includes('onPinchFrame?.(null, null, false);'));

  assert.ok(hook.includes('alpha: true, premultipliedAlpha: false'));
  assert.ok(hook.includes('gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);'));
  assert.ok(hook.includes('uniform float u_nodes;'));
  assert.ok(hook.includes('float nodeCount=max(0.,min(u_nodes,12.));'));
  assert.ok(hook.includes('state.pulse = Math.max(0, state.pulse - dt * 5.6);'));
  assert.ok(hook.includes('state.fade = Math.max(0, state.fade - dt * 5.5);'));
  assert.ok(hook.includes('const setNodeCount = useCallback((count: number) => {'));
  assert.ok(hook.includes('const triggerPulse = useCallback((dir: number) => {'));
  assert.ok(hook.includes('state.pulse = Math.max(state.pulse, 0.76);'));
  assert.ok(hook.includes('const release = useCallback(() => {'));
  assert.ok(!hook.includes('state.fingerA = null;'));
  assert.ok(!hook.includes('state.fingerB = null;'));
  assert.ok(hook.includes('window.cancelAnimationFrame(rafId);'));

  assert.ok(overlay.includes('data-pinch-shader-overlay=\"true\"'));
  assert.ok(overlay.includes("pointerEvents: 'none'"));
  assert.ok(overlay.includes('position: \'fixed\''));
  assert.ok(overlay.includes('nodeCount: number;'));
  assert.ok(overlay.includes('setNodeCount(nodeCount);'));
  assert.ok(overlay.includes('if (active) return;'));
  assert.ok(overlay.includes('release();'));

  assert.ok(interactions.includes("type GestureMode = Exclude<InteractionMode, 'cancelled'>;"));
  assert.ok(interactions.includes('pinchSuppressRef.current = true;'));
  assert.ok(interactions.includes("const wasPinchGesture = gestureModeRef.current === 'pinch' || pinchSuppressRef.current;"));
  assert.ok(interactions.includes('if (wasPinchGesture) {'));
  assert.ok(interactions.includes('pinchSuppressUntilRef.current = Date.now() + 220;'));
  assert.ok(interactions.includes('pinchSuppressRef.current'));
  assert.ok(interactions.includes("gestureModeRef.current === 'pinch'"));
  assert.ok(interactions.includes('Date.now() < pinchSuppressUntilRef.current'));
  assert.ok(interactions.includes('onTapFeedback?.({ x: event.clientX, y: event.clientY });'));
  assert.ok(interactions.includes('onHoldFeedback?.(holdPoint, true, 1, true);'));
  assert.ok(interactions.includes('onHoldFeedback?.({ x: session.pressX, y: session.pressY }, true, 0, false);'));
  assert.ok(interactions.includes('const progress = Math.max(0, Math.min(0.92, elapsed / LONG_PRESS_MS));'));
  assert.ok(interactions.includes('longPressProgressFrameRef.current = window.requestAnimationFrame(updateHoldProgress);'));
  assert.ok(interactions.includes('onHoldFeedback?.(null, false, 0, false);'));
  assert.ok(interactions.includes('const cancelPendingLongPress = useCallback(() => {'));
  assert.ok(interactions.includes('const resetPointerSession = useCallback(() => {'));
  assert.ok(interactions.includes('const classifyTargetZone = useCallback((target: EventTarget | null):'));
  assert.ok(interactions.includes('const recordGestureDebugEvent = useCallback((params: {'));
  assert.ok(interactions.includes('const pointerSession = pointerSessionRef.current.pointerId == null ? null : pointerSessionRef.current;'));
  assert.ok(interactions.includes('const trackMoveStateUpdate = useCallback((reason: \'dragging\' | \'asset_drag_active\') => {'));
  assert.ok(interactions.includes("kind: 'viewport_boundary_reset'"));
  assert.ok(interactions.includes('window.addEventListener(\'orientationchange\', clearTransientGestureState, { passive: true });'));
  assert.ok(interactions.includes('__explorerGestureDebug'));
  assert.ok(interactions.includes('computePointerMoveMetrics'));
  assert.ok(interactions.includes('touchActionTarget: targetEl ? window.getComputedStyle(targetEl).touchAction : \'unknown\','));
  assert.ok(interactions.includes('touchActionCurrent: currentTargetEl ? window.getComputedStyle(currentTargetEl).touchAction : \'unknown\','));
  assert.ok(interactions.includes("kind: 'pointerdown:start'"));
  assert.ok(interactions.includes("kind: 'pointerdown:blocked'"));
  assert.ok(interactions.includes("kind: 'pointercapture:set'"));
  assert.ok(interactions.includes("kind: 'pointercapture:release'"));
  assert.ok(interactions.includes("kind: 'pointermove:cancel_long_press'"));
  assert.ok(interactions.includes("kind: 'pointermove:drag_start'"));
  assert.ok(interactions.includes("kind: 'pointermove:tap_cancel'"));
  assert.ok(interactions.includes('thresholdReason: `drag_start>${metrics.pointerThresholdPx}px`,'));
  assert.ok(interactions.includes('cancelPendingLongPress();'));
  assert.ok(interactions.includes('resetPointerSession();'));
  assert.ok(interactions.includes('if (metrics.movedFarForLongPress) {'));
  assert.ok(interactions.includes('session.moved = true;'));
  assert.ok(interactions.includes("kind: 'pointermove:cancel_long_press'"));
  assert.ok(interactions.includes('clearPendingLongPress();'));
  assert.ok(interactions.includes('assignPointerDownSession(session, {'));

  assert.ok(coreHelper.includes('export function createFullscreenWebGLProgram('));
  assert.ok(coreHelper.includes('gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);'));
  assert.ok(sharedTypes.includes('export type OverlayPoint = { x: number; y: number } | null;'));
  assert.ok(tapHook.includes('createFullscreenWebGLProgram'));
  assert.ok(tapHook.includes('const triggerTap = useCallback'));
  assert.ok(tapHook.includes('float ringR = mix(0.022, 0.040, u_phase);'));
  assert.ok(tapHook.includes('float coreR = mix(0.012, 0.007, u_phase);'));
  assert.ok(tapHook.includes('intensityRef.current = Math.max(0, intensityRef.current - dt * 4.8);'));
  assert.ok(tapHook.includes('uniform float u_phase;'));
  assert.ok(tapHook.includes('phaseRef.current = 0;'));
  assert.ok(tapHook.includes('if (uPhase) gl.uniform1f(uPhase, phaseRef.current);'));
  assert.ok(tapOverlay.includes('data-tap-shader-overlay="true"'));
  assert.ok(tapOverlay.includes('tapTrigger: number;'));
  assert.ok(tapOverlay.includes('className="tap-debug-marker"'));
  assert.ok(tapOverlay.includes('zIndex: 160'));
  assert.ok(tapOverlay.includes('triggerTap(tapPoint);'));
  assert.ok(tapOverlay.includes('[tapPoint, tapTrigger, triggerTap]'));
  assert.ok(holdHook.includes('createFullscreenWebGLProgram'));
  assert.ok(holdHook.includes('uniform float u_progress;'));
  assert.ok(holdHook.includes('uniform float u_complete;'));
  assert.ok(holdHook.includes('uniform float u_confirm;'));
  assert.ok(holdHook.includes('float clockwise = fract(1.25 - angle / (2.0 * pi));'));
  assert.ok(holdHook.includes('float head = clamp(u_progress, 0.0, 1.0);'));
  assert.ok(holdHook.includes('float completionSweep = ring * u_confirm * 0.78;'));
  assert.ok(holdHook.includes('float completionPop = u_complete * (0.55 + halo * 0.55);'));
  assert.ok(holdHook.includes('float visibility = max(u_active * 0.85, u_confirm);'));
  assert.ok(holdHook.includes('completionRef.current = Math.max(0, completionRef.current - dt * 3.8);'));
  assert.ok(holdHook.includes('completionVisibilityRef.current = Math.max(0, completionVisibilityRef.current - dt * 2.1);'));
  assert.ok(holdHook.includes('if (uConfirm) gl.uniform1f(uConfirm, completionVisibilityRef.current);'));
  assert.ok(holdHook.includes('completionRef.current = 1;'));
  assert.ok(holdHook.includes('completionVisibilityRef.current = 1;'));
  assert.ok(holdHook.includes('const setHoldState = useCallback((point: OverlayPoint, active: boolean, progress: number, completionBeat: number) => {'));
  assert.ok(holdOverlay.includes('data-hold-shader-overlay="true"'));
  assert.ok(holdOverlay.includes('setHoldState(holdPoint, active, progress, completionBeat);'));
  assert.ok(styles.includes('.asset[data-active="true"] .thumb::after{'));
  assert.ok(styles.includes('.asset.is-active:not(.is-selected){'));
  assert.ok(styles.includes('.asset.is-active-reinforced:not(.is-selected){'));
  assert.ok(styles.includes('.asset.is-hold-emphasis:not(.is-selected){'));
  assert.ok(styles.includes('.row.is-active-reinforced:not(.is-selected){'));
  assert.ok(styles.includes('.row.is-hold-emphasis:not(.is-selected){'));
  assert.ok(styles.includes('.asset.is-selected .thumb::before{'));
  assert.ok(styles.includes('.asset-thumb-preview{'));
  assert.ok(styles.includes('.content.pinch-perf-active .asset-thumb-preview{'));
  assert.ok(styles.includes('.content.overlay-hidden .asset .asset-ol-bottom,'));
  assert.ok(styles.includes('.content.overlay-hidden .asset .asset-overlay{'));
  assert.ok(styles.includes('.content.density-overlay-out .asset .asset-ol-bottom,'));
  assert.ok(styles.includes('.content.density-overlay-in:not(.density-overlay-out):not(.density-motion-active):not(.density-gesture-active):not(.overlay-hidden) .asset .asset-ol-bottom,'));
  assert.ok(styles.includes('--overlay-fade-duration: 300ms;'));
  assert.ok(styles.includes('--density-overlay-out-duration: 140ms;'));
  assert.ok(styles.includes('--density-overlay-in-duration: 210ms;'));
  assert.ok(styles.includes('--overlay-fade-ease: cubic-bezier(0.76, 0, 0.24, 1);'));
  assert.ok(styles.includes('.content.density-motion-active .asset .asset-ol-bottom,'));
  assert.ok(styles.includes('.content.density-gesture-active .asset .asset-ol-bottom,'));
  assert.ok(styles.includes('.content.density-motion-active .asset .asset-ol-tr,'));
  assert.ok(styles.includes('transform: translateY(4px) !important;'));
  assert.ok(styles.includes('transition: none !important;'));
  assert.ok(styles.includes('.asset .asset-ol-tl{'));
  assert.ok(styles.includes('.asset .asset-ol-tr{'));
  assert.ok(styles.includes('.asset .asset-ol-bl{'));
  assert.ok(styles.includes('.asset .asset-ol-bottom{'));
  assert.ok(styles.includes('.asset .asset-overlay.is-simplified .asset-ol-bottom,'));
  assert.ok(styles.includes('.content:not(.overlay-hidden):not(.density-motion-active):not(.density-gesture-active) .asset .asset-overlay{'));
  assert.ok(styles.includes('opacity var(--overlay-fade-duration) var(--overlay-fade-ease),'));
  assert.ok(styles.includes('transform var(--overlay-fade-duration) var(--overlay-fade-ease);'));
  assert.ok(styles.includes('.content.density-motion-active .asset .asset-overlay,'));
  assert.ok(styles.includes('.content.density-gesture-active .asset .asset-overlay{'));
  assert.ok(styles.includes('.content.density-motion-settling:not(.density-gesture-active) .asset .asset-ol-bottom,'));
  assert.ok(styles.includes('opacity 220ms ease calc(140ms + var(--card-index, 0) * 12ms),'));
  assert.ok(styles.includes('transform 220ms ease calc(140ms + var(--card-index, 0) * 12ms);'));
  assert.ok(styles.includes('.tap-debug-marker{'));
  assert.ok(grid.includes('className="asset-thumb-preview"'));
  assert.ok(styles.includes('.masonry-card.asset{'));
  assert.ok(styles.includes('transition: filter 120ms ease, border-color 120ms ease;'));
  assert.ok(styles.includes('.masonry-card.asset:hover{'));
  assert.ok(styles.includes('transform: none;'));
});
