import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..', '..');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const readSourceFiles = (rootDir) => {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        visit(fullPath);
        continue;
      }
      if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(fullPath);
    }
  };
  visit(rootDir);
  return files;
};

test('package exports include entrypoints', () => {
  const pkg = readJson(path.join(packageRoot, 'package.json'));
  assert.ok(pkg.exports['.']);
  assert.equal(pkg.exports['./styles.css'], './src/styles.css');
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'thumbnailLoader.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'useThumbnailQueue.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'useTopbarScrollState.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'useLiveRecordingAssets.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'useRecordingSessions.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'useWebRtcLiveSessions.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'useRuntimeEvents.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'contracts', 'live.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'contracts', 'liveSessions.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'contracts', 'recordings.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'contracts', 'assets.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'AssetList.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'LiveRecorder.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'PendingRecordingAssetCard.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'live', 'LivePreview.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'components', 'PendingComposeAssetCard.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'composeJobs.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'hooks', 'usePendingComposeJobs.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'gsap.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'topbarMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'drawerMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'modalMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'toastMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'ui', 'motion', 'topbarSnapBand.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'explorer', 'density', 'createExplorerDensityController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'explorer', 'density', 'createPinchDensityController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'explorer', 'focus', 'focusWorldMotion.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'utils', 'awaitVisibleVideoPaint.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'utils', 'runtimeChips.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'runtime', 'StreamHub.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'runtime', 'useRuntimeController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'runtime', 'useLivePreviewState.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'runtime', 'useRuntimeEventReactions.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'pending', 'pendingArtifacts.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'pending', 'usePendingArtifactController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'render', 'renderedEntries.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'render', 'useExplorerRenderController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'selection', 'useSelectionPreviewController.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'utils', 'playbackResumeStore.ts')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'liveRecordings.ts')));
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
  assert.ok(layout.includes('minimumScale: 1'));
  assert.ok(layout.includes('maximumScale: 1'));
  assert.ok(layout.includes('userScalable: false'));
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
  assert.ok(content.includes("['Content Address', focused.content_address || '']"));
});

test('explorer exposes per-lane raf debug breakdown and idle blockers', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes("type ExplorerRafLaneName ="));
  assert.ok(content.includes("'raf-lane-proxy-active-card'"));
  assert.ok(content.includes("'raf-lane-focus-world'"));
  assert.ok(content.includes("'raf-lane-cinematic-reveal'"));
  assert.ok(content.includes("'raf-lane-measurement'"));
  assert.ok(content.includes("'raf-lane-other'"));
  assert.ok(content.includes('__explorerRafDebug?: {'));
  assert.ok(content.includes('lanes: Record<ExplorerRafLaneName, ExplorerRafLaneDebug>;'));
  assert.ok(content.includes("recordPreviewDebug({ stage: 'focus-world-stage-idle-raf-blocked'"));
  assert.ok(content.includes("recordPreviewDebug({ stage: 'focus-world-stage-idle-measure-blocked'"));
});

test('focus transition orchestrator interruption kills tweens and marks continuity event', () => {
  const orchestratorPath = path.join(packageRoot, 'src', 'render', 'FocusTransitionOrchestrator.ts');
  const content = fs.readFileSync(orchestratorPath, 'utf8');
  assert.ok(content.includes('interruptActiveTransition()'));
  assert.ok(content.includes('gsap.killTweensOf(world);'));
  assert.ok(content.includes('proxy-transition-interrupted'));
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
  assert.ok(panel.includes('data-proxy-focused-chrome="true" data-focus-proxy-layer="true"'));
  assert.ok(panel.includes('className="proxy-focused-chrome-top" data-focus-proxy-layer="true"'));
  assert.ok(panel.includes('className="proxy-focused-chrome-bottom" data-focus-proxy-layer="true"'));
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
  const nodeAuthPath = path.join(packageRoot, 'src', 'lib', 'browserRuntimeIdentity.ts');
  const content = fs.readFileSync(apiPath, 'utf8');
  assert.ok(content.includes('bulkDeleteMedia'));
  assert.ok(content.includes("/api/assets/bulk/delete"));
  assert.ok(content.includes('bulkMoveMedia'));
  assert.ok(content.includes("/api/assets/bulk/move"));
  assert.ok(content.includes('bulkTagMedia'));
  assert.ok(content.includes("/api/assets/bulk/tags"));
  assert.ok(content.includes('bulkComposeMedia'));
  assert.ok(content.includes("/api/assets/bulk/compose"));
  assert.ok(content.includes('heartbeatNode'));
  assert.ok(content.includes('/api/nodes/${encodeURIComponent(nodeId)}/heartbeat'));
  assert.ok(content.includes('deleteNode'));
  assert.ok(content.includes("buildUrl(`/api/nodes/${encodeURIComponent(nodeId)}`)"));
  assert.ok(content.includes('listIngestClaims'));
  assert.ok(content.includes('/api/ingest/claims'));
  assert.ok(content.includes('getIngestClaim'));
  assert.ok(content.includes('deleteIngestClaim'));
  assert.ok(content.includes("buildUrl(`/api/ingest/claims/${encodeURIComponent(claimId)}`)"));
  assert.ok(content.includes('normalizeWebRtcLiveSessions'));
  assert.ok(content.includes('normalizeRecordingSessions'));
  assert.ok(content.includes('normalizeRecordingSession'));
  assert.ok(content.includes('normalizeLiveSessionList'));
  assert.ok(content.includes('listRuntimeAssets'));
  assert.ok(content.includes('/api/runtime/assets'));
});

test('contract normalizers keep compatibility payload support', () => {
  const liveContractsPath = path.join(packageRoot, 'src', 'contracts', 'live.ts');
  const recordingsContractsPath = path.join(packageRoot, 'src', 'contracts', 'recordings.ts');
  const liveContent = fs.readFileSync(liveContractsPath, 'utf8');
  const recordingsContent = fs.readFileSync(recordingsContractsPath, 'utf8');
  assert.ok(liveContent.includes('Array.isArray(payload)'));
  assert.ok(liveContent.includes('Array.isArray(maybe.sessions)'));
  assert.ok(recordingsContent.includes('Array.isArray(payload)'));
  assert.ok(recordingsContent.includes("const obj = payload as { recording?: RecordingSession };"));
  assert.ok(recordingsContent.includes("if ('recording_id' in (payload as Record<string, unknown>))"));
});

test('api base inference uses centralized Explorer URL policy', () => {
  const utilsPath = path.join(packageRoot, 'src', 'utils.ts');
  const policyPath = path.join(packageRoot, 'src', 'config', 'urlPolicy.ts');
  const content = fs.readFileSync(utilsPath, 'utf8');
  const policy = fs.readFileSync(policyPath, 'utf8');
  assert.ok(content.includes('inferExplorerApiBaseUrl'));
  assert.ok(content.includes('normalizeBrowserAssetUrl'));
  assert.ok(policy.includes('inferExplorerApiBaseUrl'));
  assert.ok(policy.includes("if (location.protocol === 'https:') {"));
  assert.ok(policy.includes("currentPort !== '8787'"));
  assert.ok(policy.includes('isBrowserAssetPath'));
  assert.ok(policy.includes('resolveBrowserRenderableUrl'));
});

test('media item type supports optional CAS metadata fields', () => {
  const typesPath = path.join(packageRoot, 'src', 'types.ts');
  const content = fs.readFileSync(typesPath, 'utf8');
  assert.ok(content.includes('sha256?: string;'));
  assert.ok(content.includes('content_address?: string;'));
  assert.ok(content.includes('content_mtime?: string;'));
  assert.ok(content.includes('indexed_at?: string;'));
});

test('register modal redirects directly to device activation and keeps session-node payload contract', () => {
  const modalPath = path.join(packageRoot, 'src', 'components', 'RegisterNodeModal.tsx');
  const content = fs.readFileSync(modalPath, 'utf8');
  assert.ok(content.includes('setBrowserRuntimeIdentity(payload.node_id, token);'));
  assert.ok(content.includes('const resolveResponseUrl = useCallback((url: string | undefined, preferredOrigin?: string | null) => {'));
  assert.ok(content.includes("const responseAuthority = typeof response.authority?.base_url === 'string' ? response.authority.base_url : null;"));
  assert.ok(content.includes('const nextDeviceUrl = resolveResponseUrl(response.device_url, responseAuthority);'));
  assert.ok(content.includes('openDeviceTab(existingNodeId);'));
  assert.ok(content.includes('window.location.href = nextDeviceUrl;'));
  assert.ok(content.includes('if (response.device_url) {'));
  assert.ok(content.includes("base_url: null,"));
  assert.ok(content.includes("transport_hint: 'session'"));
  assert.ok(content.includes("session_node: 'true'"));
  assert.ok(content.includes("browser_push: 'true'"));
  assert.ok(content.includes("type DeviceClass = 'iphone-browser' | 'ipad-browser' | 'ios-browser' | 'android-browser' | 'desktop-browser';"));
  assert.ok(content.includes("const isIPhoneUa = /iPhone|iPod/i.test(ua);"));
  assert.ok(content.includes("const isIPadMacTouch = /MacIntel/i.test(platform) && maxTouchPoints > 1;"));
  assert.ok(content.includes("const isIPad = !isIPhone && (isIPadUa || isIPadMacTouch);"));
  assert.ok(content.includes("if (isIPhone) deviceClass = 'iphone-browser';"));
  assert.ok(content.includes("else if (isIPad) deviceClass = 'ipad-browser';"));
  assert.ok(content.includes("else if (isLikelyIOS) deviceClass = 'ios-browser';"));
  assert.ok(!content.includes('Use this device →'));
  assert.ok(!content.includes('getUserMedia('));
});

test('connect device page and live-session hook guard media APIs for insecure iOS contexts', () => {
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSession.ts');
  const pagePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const appPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const sourcePanelsPath = path.join(packageRoot, 'src', 'source-control', 'SourceControlPanels.tsx');
  const livePanelPath = path.join(packageRoot, 'src', 'source-control', 'LiveDeviceInstancesPanel.tsx');
  const hook = fs.readFileSync(hookPath, 'utf8');
  const page = fs.readFileSync(pagePath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  const sourcePanels = fs.readFileSync(sourcePanelsPath, 'utf8');
  const livePanel = fs.readFileSync(livePanelPath, 'utf8');

  assert.ok(hook.includes('const mediaDevices = typeof navigator !== \'undefined\' ? navigator.mediaDevices : undefined;'));
  assert.ok(hook.includes('Camera API is unavailable in this browser context. Use HTTPS or open this device page from a secure origin.'));
  assert.ok(hook.includes('Screen capture is unavailable on this device/browser.'));
  assert.ok(hook.includes('if (sourceKind === \'screen\' && !hasGetDisplayMedia) {'));
  assert.ok(hook.includes('await mediaDevices.getUserMedia({ video: true, audio: true })'));
  assert.ok(!hook.includes('await navigator.mediaDevices.getUserMedia'));
  assert.ok(hook.includes("acknowledgeLiveSessionControl(latest.session_id, 'stop_recording')"));

  assert.ok(page.includes('const capability = useMemo(() => {'));
  assert.ok(page.includes('isSecureContext: window.isSecureContext,'));
  assert.ok(page.includes('iOS Safari requires HTTPS for camera access on LAN IP addresses.'));
  assert.ok(page.includes('Serve Explorer/API over HTTPS for device camera activation.'));
  assert.ok(page.includes('disabled={!capability.hasGetUserMedia}'));
  assert.ok(page.includes('const shouldShowScreenAction = capability.hasGetDisplayMedia && !capability.isLikelyIOS;'));
  assert.ok(page.includes('Share Screen unavailable'));

  assert.ok(sourcePanels.includes('Remote source surfaces'));
  assert.ok(sourcePanels.includes('Registered runtimes'));
  assert.ok(livePanel.includes('LIVE DEVICE INSTANCES'));
  assert.ok(app.includes('listRuntimeAssets'));
  assert.ok(app.includes('listWebRtcLiveSessions'));
  assert.ok(app.includes('Promise.allSettled(['));
  assert.ok(app.includes('refreshControlPlaneSurfaces'));
  assert.ok(app.includes('scheduleExplorerObservabilityRefresh'));
  assert.ok(sourcePanels.includes('source.owner_node_id'));
  assert.ok(sourcePanels.includes('session.node_id'));
  assert.ok(sourcePanels.includes('onWatchLive(session)'));
});

test('live session signaling API and peer-viewer hooks are wired', () => {
  const apiPath = path.join(packageRoot, 'src', 'api.ts');
  const nodeAuthPath = path.join(packageRoot, 'src', 'lib', 'browserRuntimeIdentity.ts');
  const devicePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const appPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const liveCardPath = path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx');
  const registerModalPath = path.join(packageRoot, 'src', 'components', 'RegisterNodeModal.tsx');
  const api = fs.readFileSync(apiPath, 'utf8');
  const nodeAuth = fs.readFileSync(nodeAuthPath, 'utf8');
  const device = fs.readFileSync(devicePath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  const card = fs.readFileSync(liveCardPath, 'utf8');
  const registerModal = fs.readFileSync(registerModalPath, 'utf8');

  assert.ok(api.includes('getLiveSignalState'));
  assert.ok(api.includes('publishLiveSignalOffer'));
  assert.ok(api.includes('publishLiveSignalAnswer'));
  assert.ok(api.includes('publishLiveSignalIce'));
  assert.ok(api.includes('/signal/offer'));
  assert.ok(api.includes('/signal/answer'));
  assert.ok(api.includes('/signal/ice'));
  assert.ok(nodeAuth.includes('explorer_capture_node_id'));
  assert.ok(nodeAuth.includes('getStoredNodeToken'));
  assert.ok(nodeAuth.includes('explorer_capture_node_token'));
  assert.ok(nodeAuth.includes("throw new Error('missing_device_bearer_token')"));
  assert.ok(nodeAuth.includes('tokenSource'));
  assert.ok(nodeAuth.includes('pruneLegacyNodeIdentityKeys'));
  assert.ok(api.includes('requireNodeAuthHeaders(nodeId)'));
  assert.ok(api.includes('missing_device_bearer_token'));

  assert.ok(device.includes('webrtc: {peerStatus}'));
  assert.ok(device.includes('new RTCPeerConnection()'));
  assert.ok(device.includes("api.publishLiveSignalOffer(sessionId"));
  assert.ok(device.includes("api.publishLiveSignalIce(sessionId, 'device', activeViewerIdRef.current"));
  assert.ok(device.includes('setBrowserRuntimeIdentity(nodeId, queryToken);'));
  assert.ok(device.includes("const queryNodeId = searchParams.get('node_id');"));
  assert.ok(device.includes("const nodeId = queryNodeId || storedNodeId;"));
  assert.ok(device.includes("traceDevice('node-identity:resolved'"));
  assert.ok(device.includes("source: queryNodeId ? 'query' : 'localStorage'"));
  assert.ok(device.includes('const resolveActiveCameraStream = (): MediaStream | null => {'));
  assert.ok(device.includes('const getUsableCameraStream = resolveActiveCameraStream;'));
  assert.ok(device.includes('const stream = await ensureCameraStreamReady();'));
  assert.ok(device.includes('const enabled = await handleEnableCamera();'));
  assert.ok(device.includes("source: existingStream ? 'existing-camera-session' : 'new-camera-session'"));
  assert.ok(device.includes("setPeerStatus('offer-published')"));
  assert.ok(device.includes("setPeerStatus('connected')"));
  assert.ok(device.includes("setPeerStatus('failed')"));

  assert.ok(card.includes('Open peer view'));
  assert.ok(card.includes('Hide peer view'));
  assert.ok(card.includes('Reconnect peer view'));
  assert.ok(card.includes("api.publishLiveSignalIce(sessionId, 'viewer', viewerId"));
  assert.ok(card.includes('api.getLiveSignalState(sessionId, viewerId)'));
  assert.ok(card.includes('api.publishLiveSignalAnswer(sessionId, viewerId'));
  assert.ok(card.includes('peerVideoRef'));
  assert.ok(app.includes('openDeviceTab(node.node_id);'));
  assert.ok(nodeAuth.includes("const CHANNEL_NAME = 'thatdamtoolbox-ui';"));
  assert.ok(nodeAuth.includes("export const EXPLORER_WINDOW_NAME = 'thatdamtoolbox:explorer';"));
  assert.ok(nodeAuth.includes("export const CONNECT_DEVICE_WINDOW_NAME = 'thatdamtoolbox:connect-device';"));
  assert.ok(nodeAuth.includes('openNamedWindow'));
  assert.ok(nodeAuth.includes('requestExplorerRefresh'));
  assert.ok(device.includes("registerWindowName('device');"));
  assert.ok(device.includes("publishBrowserRuntimeTabActive('device');"));
  assert.ok(device.includes("requestExplorerRefresh('device-focus');"));
  assert.ok(device.includes('openExplorerTab(\'/\');'));
  assert.ok(app.includes("registerWindowName('explorer');"));
  assert.ok(app.includes("message.type === 'request-refresh'"));
  assert.ok(app.includes("scheduleExplorerObservabilityRefresh"));
  assert.ok(app.includes('pruneLegacyNodeIdentityKeys();'));
  assert.ok(registerModal.includes('const existingNodeId = getStoredNodeId();'));
  assert.ok(registerModal.includes('const nextNodeId = existingNodeId || buildDefaultNodeId(nextContext.deviceClass);'));
  assert.ok(registerModal.includes('setBrowserRuntimeIdentity(payload.node_id, token);'));
  assert.ok(registerModal.includes("throw new Error('register response missing bearer token')"));
  assert.ok(registerModal.includes('token_preview'));
  assert.ok(registerModal.includes('Open Device Tab'));
  assert.ok(registerModal.includes('Re-register'));
});

test('device live session start uses POST device lane and never GETs start as a session id', () => {
  const apiPath = path.join(packageRoot, 'src', 'api.ts');
  const liveHookPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSession.ts');
  const devicePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const api = fs.readFileSync(apiPath, 'utf8');
  const liveHook = fs.readFileSync(liveHookPath, 'utf8');
  const device = fs.readFileSync(devicePath, 'utf8');
  const startMethodStart = api.indexOf('async startLiveSession');
  const startMethodEnd = api.indexOf('async getLiveSession', startMethodStart);
  assert.ok(startMethodStart >= 0 && startMethodEnd > startMethodStart);
  const startBody = api.slice(startMethodStart, startMethodEnd);
  assert.ok(startBody.includes("buildUrl('/api/live_sessions/start')"));
  assert.ok(startBody.includes("method: 'POST'"));
  assert.ok(startBody.includes('const authHeaders = requireNodeAuthHeaders(nodeId);'));
  assert.ok(startBody.includes('...authHeaders'));
  assert.ok(api.includes('async heartbeatLiveSession(sessionId: string, nodeId?: string | null)'));
  assert.ok(api.includes("headers: { Accept: 'application/json', ...authHeaders }"));
  assert.ok(api.includes('async publishLiveSignalOffer'));
  assert.ok(api.includes("const authHeaders = role === 'device' ? requireNodeAuthHeaders(nodeId) : {};"));
  assert.ok(startBody.includes('startLiveSessionMethod'));
  assert.ok(startBody.includes("startLiveSessionUrl: '/api/live_sessions/start'"));
  assert.ok(startBody.includes('startLiveSessionWrongGetDetected: false'));
  assert.ok(api.includes("if (sessionId === 'start')"));
  assert.ok(api.includes('invalid_get_live_session_start'));
  assert.ok(liveHook.includes('api.startLiveSession(nodeId, sourceKind'));
  assert.ok(device.includes("await startPreview('camera', { stream"));
  assert.ok(device.includes('cameraStreamResolved: true'));
  assert.ok(device.includes('startLiveSessionSessionId: nextSession.session_id'));
  for (const filePath of readSourceFiles(path.join(packageRoot, 'src')).concat(readSourceFiles(path.join(packageRoot, 'app', 'connect', 'device')))) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(!content.includes("getLiveSession('start')"), `${filePath} must not call getLiveSession('start')`);
    assert.ok(!content.includes('getLiveSession("start")'), `${filePath} must not call getLiveSession("start")`);
    assert.ok(!content.includes("fetch(buildUrl('/api/live_sessions/start'), {\n        method: 'GET'"), `${filePath} must not GET /api/live_sessions/start`);
    assert.ok(!content.includes("fetch(buildUrl(\"/api/live_sessions/start\"), {\n        method: 'GET'"), `${filePath} must not GET /api/live_sessions/start`);
  }
});

test('explorer live sessions panel renders durable and webrtc sessions independently of preview chunks', () => {
  const appPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const cardPath = path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx');
  const app = fs.readFileSync(appPath, 'utf8');
  const card = fs.readFileSync(cardPath, 'utf8');
  assert.ok(app.includes('const livePanelSessions = useMemo<LiveSession[]>'));
  assert.ok(app.includes('const canonicalLiveSessions = useMemo<LiveSession[]>'));
  assert.ok(app.includes('const preferredSessionByNodeSource = useMemo(() =>'));
  assert.ok(app.includes('{livePanelSessions.length > 0 ? ('));
  assert.ok(app.includes('{livePanelSessions.map((session) => ('));
  assert.ok(app.includes('liveSignalSession={livePanelSignalBySessionId.get(session.session_id) ?? null}'));
  assert.ok(app.includes('__explorerLivePanelDebug'));
  assert.ok(app.includes('latestPreviewStatus'));
  assert.ok(app.includes('webRtcPreviewAvailable'));
  assert.ok(app.includes('webRtcPreviewableSessionIds'));
  assert.ok(app.includes('webRtcLiveSessions.some(isWebRtcLivePreviewable)'));
  assert.ok(card.includes('recording preview: waiting for chunks'));
  assert.ok(card.includes('WebRTC preview available'));
  assert.ok(card.includes('!shouldPollChunkPreview ?'));
  assert.ok(card.includes('offer:yes'));
  assert.ok(card.includes('answer:yes'));
  assert.ok(card.includes('viewers:{signalViewerCount}'));
  assert.ok(card.includes('previewable:yes'));
  assert.ok(card.includes("webRtcPreviewAvailable ? 'yes' : 'pending'"));
});

test('live WebRTC peer actors own publisher/viewer media-plane transitions', () => {
  const devicePagePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const fullscreenPath = path.join(packageRoot, 'app', 'connect', 'device', 'FullscreenDevicePreview.tsx');
  const liveCardPath = path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx');
  const apiPath = path.join(packageRoot, 'src', 'api.ts');
  const liveSessionsServicePath = path.join(repoRoot, 'app', 'services', 'live_session_service.py');
  const backendTestPath = path.join(repoRoot, 'tests', 'test_live_sessions_api.py');
  const device = fs.readFileSync(devicePagePath, 'utf8');
  const fullscreen = fs.readFileSync(fullscreenPath, 'utf8');
  const card = fs.readFileSync(liveCardPath, 'utf8');
  const api = fs.readFileSync(apiPath, 'utf8');
  const service = fs.readFileSync(liveSessionsServicePath, 'utf8');
  const backendTest = fs.readFileSync(backendTestPath, 'utf8');

  assert.ok(device.includes('__connectDevicePublisherPeerDebug'));
  assert.ok(device.includes('peerClosedBy: publisherPeerClosedByRef.current'));
  assert.ok(device.includes("publisherPeerClosedByRef.current = 'component-unmount'"));
  assert.ok(device.includes('clearPublisherSignalPoll'));
  assert.ok(device.includes('signalPollTimerRef.current = window.setInterval(pollSignal, 1000)'));
  assert.ok(device.includes('pollSignal();'));
  assert.ok(device.includes('api.getLiveSignalState(sessionId)'));
  assert.ok(device.includes('await activePeer.setRemoteDescription(new RTCSessionDescription(signal.answer))'));
  assert.ok(device.includes("setPeerStatus('answer_applied')"));
  assert.ok(device.includes('await activePeer.addIceCandidate(candidate)'));
  assert.ok(device.includes("peer.connectionState === 'connected' || peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed'"));
  const answerApplyBlock = device.slice(device.indexOf('if (signal.answer?.sdp'), device.indexOf('for (const candidate of signal.ice_from_viewer'));
  assert.ok(!answerApplyBlock.includes("setPeerStatus('connected')"), 'publisher must not mark connected from answer existence');
  assert.ok(device.includes('pollingLoopCount: publisherSignalPollLoopCountRef.current'));
  assert.ok(device.includes('activePeerCount: peerConnectionRef.current ? 1 : 0'));
  assert.ok(fullscreen.includes('peerStatus: string'));

  assert.ok(card.includes('__explorerViewerPeerDebug'));
  assert.ok(card.includes("'answer_published'"));
  assert.ok(card.includes("'answer_confirmed'"));
  assert.ok(card.includes("'waiting_for_track'"));
  assert.ok(card.includes("'track_attached'"));
  assert.ok(card.includes("'set_remote_description_failed'"));
  assert.ok(card.includes("'set_local_description_failed'"));
  assert.ok(card.includes("'src_object_missing'"));
  assert.ok(card.includes('await peerConnRef.current.setRemoteDescription(new RTCSessionDescription(signal.offer))'));
  assert.ok(card.includes('await peerConnRef.current.setLocalDescription(answer)'));
  assert.ok(card.includes('await api.publishLiveSignalAnswer(sessionId, viewerId'));
  assert.ok(card.includes('await peerConnRef.current.addIceCandidate(candidate)'));
  assert.ok(card.includes('video.srcObject = stream'));
  assert.ok(card.includes('video.onloadedmetadata'));
  assert.ok(card.includes('video.oncanplay'));
  assert.ok(card.includes('video.onplaying'));
  assert.ok(card.includes('videoPlayRejectedName'));
  assert.ok(card.includes('Tap to play live stream'));
  assert.ok(card.includes('video_playback_failed'));
  assert.ok(card.includes('remote_track_not_emitted'));
  assert.ok(card.includes("publishViewerState('playing', 'remote-track-playing'"));
  assert.ok(card.includes("setPeerStatus(stale ? 'stale_session_not_found'"));
  assert.ok(card.includes('pollingLoopCount: viewerPollLoopCountRef.current'));
  assert.ok(card.includes('activePeerCount: 1'));
  assert.ok(!card.includes("setPeerStatus('connected');\n              setPeerDiagnostic('answer-posted')"));

  assert.ok(api.includes("method: 'GET'"));
  assert.ok(api.includes('/signal${query}'));
  assert.ok(api.includes('/signal/answer'));
  assert.ok(api.includes('/signal/ice'));

  assert.ok(service.includes('superseded_by_session_id'));
  assert.ok(service.includes('existing.status in {"previewing", "recording"}'));
  assert.ok(backendTest.includes('test_starting_second_live_session_supersedes_previous_active_same_node_source'));
});

test('explorer separates durable live sessions from runtime viewer events', () => {
  const appPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const liveSessionsContractPath = path.join(packageRoot, 'src', 'contracts', 'liveSessions.ts');
  const liveSessionsHookPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSessions.ts');
  const webRtcContractPath = path.join(packageRoot, 'src', 'contracts', 'live.ts');
  const webRtcHookPath = path.join(packageRoot, 'src', 'hooks', 'useWebRtcLiveSessions.ts');
  const detailsModalPath = path.join(packageRoot, 'src', 'components', 'RuntimeDetailsModal.tsx');
  const liveDeviceBuilderPath = path.join(packageRoot, 'src', 'source-control', 'buildLiveDeviceInstances.ts');
  const app = fs.readFileSync(appPath, 'utf8');
  const contract = fs.readFileSync(liveSessionsContractPath, 'utf8');
  const liveHook = fs.readFileSync(liveSessionsHookPath, 'utf8');
  const webRtcContract = fs.readFileSync(webRtcContractPath, 'utf8');
  const webRtcHook = fs.readFileSync(webRtcHookPath, 'utf8');
  const detailsModal = fs.readFileSync(detailsModalPath, 'utf8');
  const liveDeviceBuilder = fs.readFileSync(liveDeviceBuilderPath, 'utf8');

  assert.ok(contract.includes('export function isDurableLiveSessionRecord'));
  assert.ok(contract.includes('export function isLiveRuntimeEventPayload'));
  assert.ok(contract.includes('export function isLiveSignalOverlay'));
  assert.ok(contract.includes('if (isLiveRuntimeEventPayload(record)) return false'));
  assert.ok(contract.includes('const sourceKind = readString(record.source_kind) || readString(record.sourceKind)'));
  assert.ok(contract.includes('return Boolean(sessionId && nodeId && sourceKind && status)'));
  assert.ok(contract.includes("const action = readString(record.action)"));
  assert.ok(contract.includes("const viewerId = readString(record.viewer_id)"));
  assert.ok(contract.includes("const state = readString(record.state)"));
  assert.ok(liveHook.includes('if (!isDurableLiveSessionRecord(payload)) return;'));
  assert.ok(liveHook.includes('next.filter(isDurableLiveSessionRecord)'));
  assert.ok(webRtcContract.includes('!isLiveRuntimeEventPayload(entry)'));
  assert.ok(webRtcHook.includes('if (isLiveRuntimeEventPayload(payload)) return;'));

  assert.ok(app.includes('const canonicalLiveSessions = useMemo<LiveSession[]>'));
  assert.ok(app.includes('if (!isDurableLiveSessionRecord(session)) continue;'));
  assert.ok(!app.includes("origin: 'webrtc-live-session'"), 'WebRTC overlays must not synthesize durable LiveSession records');
  assert.ok(app.includes('setLiveRuntimeEventsBySessionId'));
  assert.ok(app.includes('if (isLiveRuntimeEventPayload(payload))'));
  assert.ok(app.includes('} else if (isDurableLiveSessionRecord(payload))'));
  assert.ok(app.includes('applyLiveSessionUpdate(payload)'));
  assert.ok(app.includes('__explorerLiveMergeDebug'));
  assert.ok(app.includes('runtimeEventsBySessionId: liveRuntimeEventsBySessionId'));
  assert.ok(app.includes('rejectedRuntimeEventAsSessionIds'));
  assert.ok(app.includes('duplicateRenderedSessionIds'));
  assert.ok(app.includes('viewerStateBySessionViewer'));
  assert.ok(app.includes("event.action !== 'viewer_state'"));
  assert.ok(!app.includes("status: 'disconnected'"), 'viewer_state disconnected must not become durable session status');

  assert.ok(app.includes('openLiveSessionDetails(contextMenu.session)'));
  assert.ok(app.includes('const canonicalSession = canonicalLiveSessions.find'));
  assert.ok(app.includes('payload: canonicalSession'));
  assert.ok(app.includes('runtimeActivity: liveRuntimeEventsBySessionId[canonicalSession.session_id] || []'));
  assert.ok(detailsModal.includes('runtimeActivity?: unknown[]'));
  assert.ok(detailsModal.includes('Runtime activity'));

  assert.ok(liveDeviceBuilder.includes('const preferredLiveSessions = new Map<string, WebRtcLiveSession>()'));
  assert.ok(liveDeviceBuilder.includes('preferWebRtcSession'));
  assert.ok(liveDeviceBuilder.includes("const key = `${nodeId}::${sourceKind}`"));
  assert.ok(liveDeviceBuilder.includes('return nextRank > currentRank ? next : current'));
  assert.ok(liveDeviceBuilder.includes('return nextHasAnswer ? next : current'));
});

test('explorer viewer attach uses signal lane only and exposes precise diagnostics', () => {
  const apiPath = path.join(packageRoot, 'src', 'api.ts');
  const appPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const liveCardPath = path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx');
  const api = fs.readFileSync(apiPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  const card = fs.readFileSync(liveCardPath, 'utf8');
  const publishAnswerStart = api.indexOf('async publishLiveSignalAnswer');
  const publishAnswerEnd = api.indexOf('async publishLiveSignalIce', publishAnswerStart);
  assert.ok(publishAnswerStart >= 0 && publishAnswerEnd > publishAnswerStart);
  const publishAnswerBody = api.slice(publishAnswerStart, publishAnswerEnd);
  assert.ok(publishAnswerBody.includes('/signal/answer'));
  assert.ok(publishAnswerBody.includes("method: 'POST'"));
  assert.ok(!/method:\s*['"]GET['"]/.test(publishAnswerBody));
  assert.ok(!/fetch\([^)]*signal\/answer[\s\S]*method:\s*['"]GET['"]/.test(api));
  assert.ok(api.includes("const authHeaders = role === 'device' ? requireNodeAuthHeaders(nodeId) : {};"));
  assert.ok(!card.includes('heartbeatLiveSession'));
  for (const reason of ['no_offer', 'answer_post_failed', 'answer_not_confirmed', 'no_track', 'play_failed', 'ice_failed', 'peer_failed', 'stale_session_not_found']) {
    assert.ok(card.includes(reason), `missing diagnostic ${reason}`);
  }
  assert.ok(card.includes('__explorerLiveFlowDebug'));
  assert.ok(card.includes('invalidAnswerGetDetected: false'));
  assert.ok(card.includes('invalidViewerHeartbeatDetected: false'));
  assert.ok(card.includes('await confirmAnswer();'));
  assert.ok(card.includes('dropStaleSession'));
  assert.ok(card.includes('staleSessionDroppedAt'));
  assert.ok(card.includes('onStaleSession?.(sessionId, endpoint)'));
  const watchStart = app.indexOf('const openLivePeerViewer = useCallback');
  const watchEnd = app.indexOf('const heartbeatNodeNow', watchStart);
  assert.ok(watchStart >= 0 && watchEnd > watchStart);
  const watchBody = app.slice(watchStart, watchEnd);
  assert.ok(watchBody.includes('__explorerLiveFlowDebug'));
  assert.ok(app.includes('const dropStaleLiveSession = useCallback'));
  assert.ok(app.includes('removeLiveSession({ session_id: sessionId })'));
  assert.ok(app.includes('onStaleSession={dropStaleLiveSession}'));
  assert.ok(!watchBody.includes('heartbeatLiveSession'));
});

test('runtime SSE hook exists and uses EventSource /api/runtime/events', () => {
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useRuntimeEvents.ts');
  const runtimeControllerPath = path.join(packageRoot, 'src', 'runtime', 'useRuntimeController.ts');
  const appPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const runtimeEventsApiPath = path.join(repoRoot, 'app', 'api', 'runtime_events.py');
  const hook = fs.readFileSync(hookPath, 'utf8');
  const runtimeController = fs.readFileSync(runtimeControllerPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  const runtimeEventsApi = fs.readFileSync(runtimeEventsApiPath, 'utf8');
  assert.ok(hook.includes("new EventSource('/api/runtime/events')"));
  assert.ok(hook.includes('es.onopen = () => {'));
  assert.ok(hook.includes('lastEventStreamOpenAt'));
  assert.ok(hook.includes('lastEventStreamMessageAt'));
  assert.ok(hook.includes('lastEventStreamErrorAt'));
  assert.ok(hook.includes('lastEventStreamReadyState'));
  assert.ok(hook.includes('lastEventStreamUrl'));
  assert.ok(hook.includes('eventStreamReconnecting'));
  assert.ok(hook.includes('EventSource.CLOSED'));
  assert.ok(hook.includes('EventSource.CONNECTING'));
  assert.ok(hook.includes("new CustomEvent('runtime:event'"));
  assert.ok(hook.includes('__explorerRuntimeEventsOpen'));
  assert.ok(!app.includes("scheduleExplorerObservabilityRefresh(`sse:${event.type}`"));
  assert.ok(!app.includes("scheduleExplorerObservabilityRefresh('runtime-event'"));
  assert.ok(!app.includes("scheduleExplorerObservabilityRefresh('live-event'"));
  assert.ok(app.includes("case 'node.updated'"));
  assert.ok(app.includes("case 'source.updated'"));
  assert.ok(app.includes("case 'live_session.updated'"));
  assert.ok(app.includes("case 'runtime_asset.updated'"));
  assert.ok(app.includes("case 'recording.updated'"));
  assert.ok(app.includes("case 'ingest_claim.updated'"));
  assert.ok(app.includes("case 'live_session.deleted'"));
  assert.ok(app.includes("case 'ingest_claim.deleted'"));
  assert.ok(app.includes("case 'reconnect'"));
  assert.ok(app.includes("case 'missed_sequence'"));
  assert.ok(app.includes("case 'snapshot_required'"));
  assert.ok(app.includes("scheduleExplorerObservabilityRefresh('sse-recovery', 0);"));
  assert.ok(app.includes("const allowed = reason === 'initial' || reason === 'manual' || reason === 'sse-recovery';"));
  assert.ok(app.includes("console.warn('[OBSERVABILITY FETCH]', lane, reason);"));
  assert.ok(app.includes("console.warn(allowed ? '[REFRESH TRIGGER]' : '[BLOCKED REFRESH]', reason);"));
  assert.ok(app.includes("scheduleExplorerObservabilityRefresh('initial', 0);"));
  assert.ok(app.includes("eventStreamConnected: true"));
  assert.ok(app.includes("new BroadcastChannel('thatdamtoolbox-ui')"));
  assert.ok(!app.includes('setInterval(() => {\n      const hasActiveLiveWork'));
  assert.ok(app.includes('useRuntimeController'));
  assert.ok(runtimeEventsApi.includes('SSE_HEARTBEAT_INTERVAL_SECONDS = 5.0'));
  assert.ok(runtimeEventsApi.includes('await asyncio.sleep(0)'));
  assert.ok(runtimeEventsApi.includes('except asyncio.CancelledError:'));
  assert.ok(runtimeEventsApi.includes('"Cache-Control": "no-cache, no-transform"'));
  assert.ok(runtimeEventsApi.includes('"X-Accel-Buffering": "no"'));
});

test('live polling is visibility-gated and throttled', () => {
  const liveSessionsPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSessions.ts');
  const recordingSessionsPath = path.join(packageRoot, 'src', 'hooks', 'useRecordingSessions.ts');
  const pendingControllerPath = path.join(packageRoot, 'src', 'pending', 'usePendingArtifactController.ts');
  const pollingPath = path.join(packageRoot, 'src', 'utils', 'polling.ts');
  const liveSessions = fs.readFileSync(liveSessionsPath, 'utf8');
  const recordingSessions = fs.readFileSync(recordingSessionsPath, 'utf8');
  const pendingController = fs.readFileSync(pendingControllerPath, 'utf8');
  const polling = fs.readFileSync(pollingPath, 'utf8');
  const sourceControl = fs.readFileSync(path.join(packageRoot, 'src', 'hooks', 'useSourceControlData.ts'), 'utf8');
  const webRtcSessions = fs.readFileSync(path.join(packageRoot, 'src', 'hooks', 'useWebRtcLiveSessions.ts'), 'utf8');
  assert.ok(polling.includes('document.visibilityState === \'visible\''));
  assert.ok(liveSessions.includes("document.visibilityState === 'hidden'"));
  assert.ok(liveSessions.includes('}, 5000);'));
  assert.ok(recordingSessions.includes("document.visibilityState === 'hidden'"));
  assert.ok(recordingSessions.includes('window.setTimeout(run, 5000);'));
  assert.ok(pendingController.includes("document.visibilityState === 'hidden'"));
  assert.ok(pendingController.includes('activeRecordingIntentRef.current.size === 0'));
  assert.ok(pendingController.includes('window.setInterval(() => { void poll(); }, 3000);'));
  assert.ok(sourceControl.includes('initialLoad = false'));
  assert.ok(!sourceControl.includes('setInterval('));
  assert.ok(webRtcSessions.includes('poll = false'));
  assert.ok(webRtcSessions.includes('initialLoad = false'));
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

test('library snapshot hook owns authoritative snapshot state and single-flight refresh', () => {
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useLibrarySnapshot.ts');
  const content = fs.readFileSync(hookPath, 'utf8');
  assert.ok(content.includes('const inflightRef = useRef<Promise<LibrarySnapshot> | null>(null);'));
  assert.ok(content.includes('const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);'));
  assert.ok(content.includes('const [sources, setSources] = useState<Source[]>([]);'));
  assert.ok(content.includes('const [projects, setProjects] = useState<Project[]>([]);'));
  assert.ok(content.includes('const [assets, setAssets] = useState<MediaItem[]>([]);'));
  assert.ok(content.includes('const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);'));
  assert.ok(content.includes('const [generatedAt, setGeneratedAt] = useState<string | null>(null);'));
  assert.ok(content.includes('const [isLoading, setIsLoading] = useState(false);'));
  assert.ok(content.includes('const [error, setError] = useState(\'\');'));
  assert.ok(content.includes('const applySnapshot = useCallback((nextSnapshot: LibrarySnapshot) => {'));
  assert.ok(content.includes('const refreshLibrarySnapshot = useCallback(async (options: LoadLibraryOptions = {}) => {'));
  assert.ok(content.includes('const clearSnapshotError = useCallback(() => {'));
});

test('explorer boot + refresh use one aggregate snapshot authority path', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('void refreshLibrarySnapshot({ scope: \'all\' }).finally(() => {'));
  assert.ok(content.includes('const refreshAll = useCallback(async () => {'));
  assert.ok(content.includes('const snapshot = await refreshLibrarySnapshot({ scope: \'all\' });'));
  assert.ok(content.includes('addToast(\'good\', \'Refresh\', \'Reloaded projects + media\', \'explorer-refresh\');'));
  assert.ok(!content.includes('Promise.allSettled([loadSources(), loadProjects()])'));
});

test('explorer command extraction exists and scoped aggregate refresh is wired', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const commandsHookPath = path.join(packageRoot, 'src', 'hooks', 'useExplorerCommands.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const commands = fs.readFileSync(commandsHookPath, 'utf8');
  assert.ok(explorer.includes("import { useExplorerCommands } from './hooks/useExplorerCommands';"));
  assert.ok(explorer.includes("import { useExplorerUiState } from './hooks/useExplorerUiState';"));
  assert.ok(explorer.includes('} = useExplorerUiState({'));
  assert.ok(explorer.includes('const {\n    handleComposeCompletion,\n    composeMediaCommand,\n    uploadMediaCommand,\n    uploadMediaBatchCommand,\n    sendToProgramMonitorCommand,\n    pushToObsCommand,\n    resolveMediaCommand,\n    performDeleteMediaSelection,\n    moveMediaSelection,\n    tagMediaSelection,\n    tagSingleMediaItem,\n  } = useExplorerCommands({'));
  assert.ok(explorer.includes('usePendingArtifactController({'));
  assert.ok(explorer.includes('handleComposeCompletion,'));
  assert.ok(explorer.includes('scope: \'project\''));
  assert.ok(explorer.includes('await tagSingleMediaItem(focused, addTags, removeTags, \'Tag\');'));
  assert.ok(explorer.includes('const response = await composeMediaCommand({'));
  assert.ok(explorer.includes('const result = await uploadMediaCommand({'));
  assert.ok(explorer.includes('await uploadMediaBatchCommand({'));
  assert.ok(explorer.includes('await sendToProgramMonitorCommand({'));
  assert.ok(explorer.includes('await pushToObsCommand({'));
  assert.ok(explorer.includes('await resolveMediaCommand({'));
  assert.ok(!explorer.includes('window.open(monitorUrl,'));
  assert.ok(!explorer.includes('obsPushBrowserMedia'));
  assert.ok(commands.includes('export function useExplorerCommands(args: UseExplorerCommandsArgs) {'));
  assert.ok(commands.includes('const refreshAfterScopedMutation = useCallback(async (scope: RefreshScope | null) => {'));
  assert.ok(commands.includes('const refreshAfterMutation = useCallback(async (scope: RefreshScope | null | undefined) => {'));
  assert.ok(commands.includes('const tagSingleMediaItem = useCallback(async ('));
  assert.ok(commands.includes('const handleComposeCompletion = useCallback(async (scope: RefreshScope | null | undefined) => {'));
  assert.ok(commands.includes('const composeMediaCommand = useCallback(async (command: ComposeMediaCommand) => {'));
  assert.ok(commands.includes('const uploadMediaCommand = useCallback(async (command: UploadMediaCommand) => {'));
  assert.ok(commands.includes('const uploadMediaBatchCommand = useCallback(async (command: UploadMediaBatchCommand) => {'));
  assert.ok(commands.includes('const sendToProgramMonitorCommand = useCallback(async (command: ProgramMonitorCommand) => {'));
  assert.ok(commands.includes('const pushToObsCommand = useCallback(async (command: ObsPushCommand) => {'));
  assert.ok(commands.includes('const resolveMediaCommand = useCallback(async (command: ResolveMediaCommand) => {'));
  assert.ok(commands.includes('await refreshLibrarySnapshot({ scope: \'project\', project: projectName, source: sourceName || undefined });'));
  assert.ok(commands.includes('await refreshMediaForScope(scope);'));
  const pendingComposeHookIndex = explorer.indexOf('const pending = usePendingArtifactController({');
  const visiblePendingComposeIndex = explorer.indexOf('const pending = usePendingArtifactController({');
  const pendingComposeEntriesMemoIndex = explorer.indexOf('pendingComposeEntries');
  const pendingComposeEntriesDependencyIndex = explorer.indexOf('pendingComposeEntries.length');
  assert.ok(pendingComposeHookIndex >= 0);
  assert.ok(visiblePendingComposeIndex >= pendingComposeHookIndex);
  assert.ok(pendingComposeEntriesMemoIndex > visiblePendingComposeIndex);
  assert.ok(pendingComposeEntriesDependencyIndex > pendingComposeEntriesMemoIndex);
});

test('explorer ui-state seam owns root-local modal/surface/runtime state cluster', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const uiStatePath = path.join(packageRoot, 'src', 'hooks', 'useExplorerUiState.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const content = fs.readFileSync(uiStatePath, 'utf8');
  assert.ok(content.includes('export function useExplorerUiState(options: UseExplorerUiStateOptions = {}) {'));
  assert.ok(content.includes('const [view, setView] = useState<ExplorerView>(defaultView);'));
  assert.ok(content.includes("const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');"));
  assert.ok(content.includes("const [sortKey, setSortKey] = useState<SortKey>('newest');"));
  assert.ok(content.includes('const [gridColumnCount, setGridColumnCount] = useState(defaultGridColumns);'));
  assert.ok(content.includes('const [overlayEnabled, setOverlayEnabled] = useState(true);'));
  assert.ok(content.includes('const [topbarHasOpenDropdown, setTopbarHasOpenDropdown] = useState(false);'));
  assert.ok(content.includes('const [topbarFocusWithin, setTopbarFocusWithin] = useState(false);'));
  assert.ok(content.includes('const [sidebarOpen, setSidebarOpen] = useState(false);'));
  assert.ok(content.includes('const [actionsOpen, setActionsOpen] = useState(false);'));
  assert.ok(content.includes('const [dragActive, setDragActive] = useState(false);'));
  assert.ok(content.includes('const [isMobile, setIsMobile] = useState(false);'));
  assert.ok(content.includes('const [touchPinchCapable, setTouchPinchCapable] = useState(false);'));
  assert.ok(content.includes("const [uploadStatus, setUploadStatus] = useState('');"));
  assert.ok(content.includes('const [contentLoading, setContentLoading] = useState(false);'));
  assert.ok(content.includes('const [pendingDataLoadOverlay, setPendingDataLoadOverlay] = useState(false);'));
  assert.ok(content.includes("const [resolveProjectMode, setResolveProjectMode] = useState('current');"));
  assert.ok(content.includes("const [resolveProjectName, setResolveProjectName] = useState('');"));
  assert.ok(content.includes("const [resolveNewName, setResolveNewName] = useState('');"));
  assert.ok(content.includes("const [resolveMode, setResolveMode] = useState('import');"));
  assert.ok(content.includes("const [previewObsMode, setPreviewObsMode] = useState<'cover' | 'fit' | 'fill'>('cover');"));
  assert.ok(content.includes("const [previewObsSlot, setPreviewObsSlot] = useState('1');"));
  assert.ok(content.includes('const [previewObsExclusive, setPreviewObsExclusive] = useState(false);'));
  assert.ok(content.includes('const [inspectorOpen, setInspectorOpen] = useState(false);'));
  assert.ok(content.includes('const [previewDetailsOpen, setPreviewDetailsOpen] = useState(false);'));
  assert.ok(content.includes('export type ExplorerContextMenu ='));
  assert.ok(content.includes("kind: 'media_asset';"));
  assert.ok(content.includes("kind: 'source';"));
  assert.ok(content.includes("kind: 'runtime';"));
  assert.ok(content.includes("kind: 'live_session';"));
  assert.ok(content.includes("kind: 'ingest_claim';"));
  assert.ok(content.includes('const [contextMenu, setContextMenu] = useState<ExplorerContextMenu | null>(null);'));
  assert.ok(content.includes('const [composeModalOpen, setComposeModalOpen] = useState(false);'));
  assert.ok(content.includes('const [deleteModalOpen, setDeleteModalOpen] = useState(false);'));
  assert.ok(content.includes('const [pendingDeleteSelectionKeys, setPendingDeleteSelectionKeys] = useState<string[]>([]);'));
  assert.ok(content.includes('return {'));
  assert.ok(!explorer.includes('const [sidebarOpen, setSidebarOpen] = useState(false);'));
  assert.ok(!explorer.includes('const [actionsOpen, setActionsOpen] = useState(false);'));
  assert.ok(!explorer.includes('const [dragActive, setDragActive] = useState(false);'));
  assert.ok(!explorer.includes('const [isMobile, setIsMobile] = useState(false);'));
  assert.ok(!explorer.includes('const [touchPinchCapable, setTouchPinchCapable] = useState(false);'));
  assert.ok(!explorer.includes("const [uploadStatus, setUploadStatus] = useState('');"));
  assert.ok(!explorer.includes('const [contentLoading, setContentLoading] = useState(false);'));
  assert.ok(!explorer.includes('const [pendingDataLoadOverlay, setPendingDataLoadOverlay] = useState(false);'));
  assert.ok(!explorer.includes("const [resolveProjectMode, setResolveProjectMode] = useState('current');"));
  assert.ok(!explorer.includes("const [resolveProjectName, setResolveProjectName] = useState('');"));
  assert.ok(!explorer.includes("const [resolveNewName, setResolveNewName] = useState('');"));
  assert.ok(!explorer.includes("const [resolveMode, setResolveMode] = useState('import');"));
  assert.ok(!explorer.includes("const [previewObsMode, setPreviewObsMode] = useState<'cover' | 'fit' | 'fill'>('cover');"));
  assert.ok(!explorer.includes("const [previewObsSlot, setPreviewObsSlot] = useState('1');"));
  assert.ok(!explorer.includes('const [previewObsExclusive, setPreviewObsExclusive] = useState(false);'));
  assert.ok(!explorer.includes('const [inspectorOpen, setInspectorOpen] = useState(false);'));
});

test('asset tile preview open path requires second tap intent and keeps focus separate from selection', () => {
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const handoffHookPath = path.join(packageRoot, 'src', 'hooks', 'useVideoOwnershipHandoff.ts');
  const playbackResumeStorePath = path.join(packageRoot, 'src', 'utils', 'playbackResumeStore.ts');
  const awaitVisibleVideoPaintPath = path.join(packageRoot, 'src', 'utils', 'awaitVisibleVideoPaint.ts');
  const proxyRendererPath = path.join(packageRoot, 'src', 'render', 'ViewportProxyRenderer.ts');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const handoffHookContent = fs.readFileSync(handoffHookPath, 'utf8');
  const playbackResumeStore = fs.readFileSync(playbackResumeStorePath, 'utf8');
  const awaitVisibleVideoPaint = fs.readFileSync(awaitVisibleVideoPaintPath, 'utf8');
  const proxyRenderer = fs.readFileSync(proxyRendererPath, 'utf8');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const list = fs.readFileSync(listPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
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
  assert.ok(explorer.includes('useSelectionPreviewController({'));
  assert.ok(explorer.includes('activeAssetKey,'));
  assert.ok(explorer.includes('previewActivationKey,'));
  assert.ok(explorer.includes('commitPreviewActivationKey,'));
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
  assert.ok(explorer.includes("const streamUrl = resolveAssetUrl(getBestStreamUrl(item) || getBestDownloadUrl(item));"));
  assert.ok(explorer.includes("const previewPlaybackKey = isActivated ? `${selectionKey}:${previewPlaybackToken}` : '';"));
  assert.ok(explorer.includes('? streamUrl'));
  assert.ok(explorer.includes('const selectionOrderIndex = selectedOrderMap.get(selectionKey) ?? 0;'));
  assert.ok(grid.includes('<img'));
  assert.ok(grid.includes('activeVideoPreviewUrl'));
  assert.ok(explorer.includes("isActivated && kind === 'video'"));
  assert.ok(grid.includes('className="asset-thumb-preview"'));
  assert.ok(grid.includes('data-stream-url={viewModel.streamUrl}'));
  assert.ok(grid.includes('key={viewModel.previewPlaybackKey}'));
  assert.ok(list.includes('<img'));
  assert.ok(list.includes('activeVideoPreviewUrl'));
  assert.ok(list.includes('className="asset-thumb-preview"'));
  assert.ok(list.includes('key={viewModel.previewPlaybackKey}'));
  assert.ok(grid.includes("data-active={viewModel.isActive ? 'true' : 'false'}"));
  assert.ok(list.includes("data-active={viewModel.isActive ? 'true' : 'false'}"));
  assert.ok(explorer.includes('commitPreviewActivationKey(itemKey);'));
  assert.ok(explorer.includes('playGridThumbForSelectionKey(itemKey);'));
  assert.ok(explorer.includes('const previewPlaybackHandoffRef = useRef<{'));
  assert.ok(explorer.includes('preview-selection-interrupt-previous'));
  assert.ok(explorer.includes('preview-selection-new-authority'));
  assert.ok(explorer.includes('preview-selection-play-rearm'));
  assert.ok(explorer.includes('const getGridThumbVideoBySelectionKey = useCallback((selectionKey: string) => {'));
  assert.ok(explorer.includes('previewPlaybackHandoffRef.current = {'));
  assert.ok(explorer.includes('const proxyPrewarmVideoRef = useRef<HTMLVideoElement | null>(null);'));
  assert.ok(explorer.includes("const proxyPrewarmSelectionKey = useMemo(() => ("));
  assert.ok(explorer.includes('const proxyPrewarmUrl = useMemo(() => {'));
  assert.ok(explorer.includes('if (!proxyPrewarmUrl) {'));
  assert.ok(explorer.includes('if (focusedProxyPlaybackOwned) {'));
  assert.ok(explorer.includes('prewarmVideo.loop = true;'));
  assert.ok(explorer.includes("prewarmVideo.preload = 'metadata';"));
  assert.ok(!explorer.includes('prewarmVideo.pause();\n          proxyPrewarmReadyStateRef.current = prewarmVideo.readyState;'));
  assert.ok(explorer.includes("className=\"proxy-prewarm-video\""));
  assert.ok(explorer.includes('useVideoOwnershipHandoff({'));
  assert.ok(explorer.includes('const handoffTime = hasMatchingHandoff && handoff ? Math.max(0, handoff.currentTime) : null;'));
  assert.ok(explorer.includes('const activeThumbnailVideoEl = activeProxySelectionKey'));
  assert.ok(explorer.includes('const proxyAsset = useMemo(() => {'));
  assert.ok(explorer.includes('const proxyStreamUrl = useMemo(() => {'));
  assert.ok(explorer.includes('const proxyPlaybackSessionKey = useMemo(() => ('));
  assert.ok(explorer.includes('const absolutizeMediaUrl = useCallback((path?: string) => {'));
  assert.ok(explorer.includes("const datasetStream = activeProxyCardEl?.dataset.streamUrl || activeProxyVideoEl?.dataset.streamUrl || '';"));
  assert.ok(explorer.includes("const elementSrc = activeProxyVideoEl?.currentSrc || activeProxyVideoEl?.src || '';"));
  assert.ok(explorer.includes("return absolutizeMediaUrl(datasetStream || elementSrc || proxyAsset?.src || '');"));
  assert.ok(explorer.includes('onHandoffConsumed: () => {'));
  assert.ok(explorer.includes('onPromoted: () => {'));
  assert.ok(explorer.includes('pauseGridThumbForSelectionKey(activeProxySelectionKey);'));
  assert.ok(explorer.includes('pauseNonAuthoritativeGridVideos(activeProxySelectionKey);'));
  assert.ok(explorer.includes('publishMediaInvariantDebug(\'proxy-promoted-authority\');'));
  assert.ok(explorer.includes('}, [activeAssetKey, gridCinematicMode, inspectorOpen, view]);'));
  const pauseNonAuthoritativeIndex = explorer.indexOf('const pauseNonAuthoritativeGridVideos = useCallback((authoritativeSelectionKey: string) => {');
  const runProxyFocusTransitionIndex = explorer.indexOf('const runProxyFocusTransition = useCallback((');
  assert.ok(pauseNonAuthoritativeIndex >= 0);
  assert.ok(runProxyFocusTransitionIndex > pauseNonAuthoritativeIndex);
  assert.ok(explorer.includes('streamUrl: proxyStreamUrl,'));
  assert.ok(explorer.includes('streamUrl: proxyStreamUrl,'));
  assert.ok(explorer.includes('thumbnailVideoEl: activeThumbnailVideoEl,'));
  assert.ok(explorer.includes('hasPoster: proxyHasPoster,'));
  assert.ok(explorer.includes('posterShown: proxyPosterShown,'));
  assert.ok(explorer.includes('posterUrl: proxyPosterUrl,'));
  assert.ok(explorer.includes("activeProxyCardEl.dataset.videoReady = (proxyVideoReady || proxyFirstFramePresented) ? 'true' : 'false';"));
  assert.ok(explorer.includes("activeProxyCardEl.dataset.firstFramePresented = proxyFirstFramePresented ? 'true' : 'false';"));
  assert.ok(explorer.includes('activeProxyCardEl.dataset.promotionStrategy = proxyPromotionStrategy;'));
  assert.ok(explorer.includes('activeProxyCardEl.dataset.streamUrl = proxyStreamUrl;'));
  assert.ok(explorer.includes('activeProxyCardEl.dataset.proxySessionId = proxyPlaybackSessionKey;'));
  assert.ok(explorer.includes("activeProxyCardEl.dataset.posterShown = proxyPosterShown ? 'true' : 'false';"));
  assert.ok(explorer.includes('activeProxyCardEl.dataset.posterUrl = proxyPosterUrl;'));
  assert.ok(explorer.includes("activeProxyCardEl.dataset.hasPoster = proxyHasPoster ? 'true' : 'false';"));
  assert.ok(explorer.includes('activeProxyVideoEl.dataset.proxySessionId = proxyPlaybackSessionKey;'));
  assert.ok(explorer.includes("activeProxyVideoEl.dataset.posterShown = proxyPosterShown ? 'true' : 'false';"));
  assert.ok(proxyRenderer.includes("activeCardEl.dataset.streamUrl = card.mediaUrl || '';"));
  assert.ok(proxyRenderer.includes('videoEl.dataset.streamUrl = card.mediaUrl;'));
  assert.ok(proxyRenderer.includes("videoEl.dataset.proxyMountedState = this.proxyMountedState;"));
  assert.ok(proxyRenderer.includes("this.proxyMountedState = 'proxy-reused-mounted';"));
  assert.ok(proxyRenderer.includes("this.proxyMountedState = 'proxy-detached';"));
  assert.ok(proxyRenderer.includes('proxy-video-released'));
  assert.ok(proxyRenderer.includes('proxy-video-removed-src'));
  assert.ok(proxyRenderer.includes('proxy-video-load-reset'));
  assert.ok(proxyRenderer.includes('videoEl.removeAttribute(\'src\');'));
  assert.ok(proxyRenderer.includes('videoEl.load();'));
  assert.ok(handoffHookContent.includes('sessionKey: string;'));
  assert.ok(handoffHookContent.includes('continuityKey: string;'));
  assert.ok(handoffHookContent.includes('playbackIntentKey: string;'));
  assert.ok(handoffHookContent.includes('const latestSessionKeyRef = useRef(\'\');'));
  assert.ok(handoffHookContent.includes('const continuityKey = makeVideoResumeKey(selectionKey, streamUrl);'));
  assert.ok(handoffHookContent.includes('const isSessionChanged = latestSessionKeyRef.current !== continuityKey;'));
  assert.ok(handoffHookContent.includes('onPromotedRef.current?.();'));
  assert.ok(handoffHookContent.includes('onHandoffConsumedRef.current?.();'));
  assert.ok(handoffHookContent.includes("cardEl.dataset.proxySessionId = continuityKey;"));
  assert.ok(handoffHookContent.includes('videoNodeFound: boolean;'));
  assert.ok(handoffHookContent.includes('playRequested: boolean;'));
  assert.ok(handoffHookContent.includes('playPromiseRejected: boolean;'));
  assert.ok(handoffHookContent.includes('const activeRunTokenRef = useRef<symbol | null>(null);'));
  assert.ok(handoffHookContent.includes('loadedMetadataSeen: boolean;'));
  assert.ok(handoffHookContent.includes('loadedDataSeen: boolean;'));
  assert.ok(handoffHookContent.includes('canPlaySeen: boolean;'));
  assert.ok(handoffHookContent.includes('playingSeen: boolean;'));
  assert.ok(handoffHookContent.includes('promotionBlockedReason: string;'));
  assert.ok(handoffHookContent.includes('releaseProxyVideoResources'));
  assert.ok(handoffHookContent.includes('proxy-video-released-disconnected'));
  assert.ok(handoffHookContent.includes('thumbnailVideoNodeFound: boolean;'));
  assert.ok(handoffHookContent.includes('timeDeltaFromThumbnail: number | null;'));
  assert.ok(handoffHookContent.includes("resumeSourceUsed: 'handoff-live' | 'focused-session-warm-reopen' | 'resume-store-cold-reopen' | 'none-start-at-zero';"));
  assert.ok(handoffHookContent.includes('hasPoster: boolean;'));
  assert.ok(handoffHookContent.includes('posterUrl: string;'));
  assert.ok(handoffHookContent.includes('posterShown: boolean;'));
  assert.ok(handoffHookContent.includes('const posterState = useMemo(() => {'));
  assert.ok(handoffHookContent.includes("posterShown: visualOwner === 'poster' || !firstFramePresented,"));
  assert.ok(handoffHookContent.includes('const activeResumeWriterVersionRef = useRef(0);'));
  assert.ok(handoffHookContent.includes('const resumeWriterVersionByContinuityRef = useRef(new Map<string, number>());'));
  assert.ok(handoffHookContent.includes('const resumeSnapshot = getVideoResumeSnapshot(continuityKey);'));
  assert.ok(handoffHookContent.includes('const tryApplyResumeTargetTime = () => {'));
  assert.ok(handoffHookContent.includes("setVisualOwner('proxy-preparing');"));
  assert.ok(handoffHookContent.includes("setVisualOwner('proxy-overlap');"));
  assert.ok(handoffHookContent.includes('setVideoReady(true);'));
  assert.ok(handoffHookContent.includes('awaitVisibleVideoPaint(proxyVideoEl, { timeoutMs: 420 });'));
  assert.ok(handoffHookContent.includes("publishDebug('audio-owner-granted', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('audio-owner-denied-hidden', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('audio-owner-denied-detached', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('audio-owner-revoked-close', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('poster-held-same-asset-reopen', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('poster-release-same-asset-reopen', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('poster-stuck-guard-fired', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes('persistResumeSnapshot(proxyVideoEl, !proxyVideoEl.paused);'));
  assert.ok(handoffHookContent.includes("tryFallbackPromote('loadeddata-fallback');"));
  assert.ok(handoffHookContent.includes("tryFallbackPromote('canplay-fallback');"));
  assert.ok(handoffHookContent.includes("tryFallbackPromote('playing-fallback');"));
  assert.ok(handoffHookContent.includes("tryFallbackPromote('timeupdate-fallback');"));
  assert.ok(handoffHookContent.includes("tryFallbackPromote('immediate-readiness-fallback');"));
  assert.ok(handoffHookContent.includes('const sourceAlreadyBound = isSameStream(proxyVideoEl.currentSrc) || isSameStream(proxyVideoEl.src);'));
  assert.ok(handoffHookContent.includes("syncPlaybackState('source-bound');"));
  assert.ok(handoffHookContent.includes("publishDebug('source-reused', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('inactive-no-selection', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('inactive-focused-closed', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('focus-close-cleanup', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes('const shouldStartPlayback = shouldPlay;'));
  assert.ok(handoffHookContent.includes('if (!isLatestRun()) return;'));
  assert.ok(handoffHookContent.includes('if (latestSessionKeyRef.current !== currentSession) return;'));
  assert.ok(handoffHookContent.includes("if (err?.name === 'AbortError') return;"));
  assert.ok(handoffHookContent.includes("publishDebug('first-open-poster-hold', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('first-open-no-live-thumbnail', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('poster-release-after-paint', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes("publishDebug('same-asset-grid-reentry', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes('const canUseLiveHandoff = pendingHandoff != null && hasLiveThumbnailFrame && wasPlayingBeforeHandoff;'));
  assert.ok(handoffHookContent.includes('writerVersion: activeResumeWriterVersionRef.current,'));
  assert.ok(handoffHookContent.includes('if (!proxyVideoEl.isConnected) {'));
  assert.ok(handoffHookContent.includes("releaseProxyVideoResources(proxyVideoEl, 'play-skipped-disconnected');"));
  assert.ok(handoffHookContent.includes("publishDebug('play-threw-sync', proxyVideoEl);"));
  assert.ok(handoffHookContent.includes('preview-session-interrupted'));
  assert.ok(handoffHookContent.includes('preview-session-superseded'));
  assert.ok(handoffHookContent.includes('preview-session-commit-blocked-stale'));
  assert.ok(handoffHookContent.includes('preview-session-latest-commit'));
  assert.ok(!handoffHookContent.includes('if (shouldStartPlayback) {\n      proxyVideoEl.load();'));
  assert.ok(playbackResumeStore.includes('const playbackResumeStore = new Map<VideoResumeKey, VideoResumeSnapshot>();'));
  assert.ok(playbackResumeStore.includes('writerVersion?: number;'));
  assert.ok(playbackResumeStore.includes('const existingWriterVersion = existing?.writerVersion;'));
  assert.ok(playbackResumeStore.includes('const nextWriterVersion = snapshot.writerVersion;'));
  assert.ok(playbackResumeStore.includes('export function makeVideoResumeKey(selectionKey: string, streamUrl: string): VideoResumeKey {'));
  assert.ok(playbackResumeStore.includes('export function maybeNormalizeResumeTime(currentTime: number, duration: number): number {'));
  assert.ok(awaitVisibleVideoPaint.includes('export async function awaitVisibleVideoPaint('));
  assert.ok(awaitVisibleVideoPaint.includes("reason: 'painted' | 'timeout';"));
  assert.ok(list.includes('data-no-preview="1"'));
  assert.ok(grid.includes('is-active-reinforced'));
  assert.ok(grid.includes('is-hold-emphasis'));
  assert.ok(styles.includes('.proxy-render-card[data-first-frame-presented=\"true\"] .proxy-render-poster'));
  assert.ok(styles.includes('.proxy-render-card[data-first-frame-presented=\"true\"] .proxy-render-video'));
  assert.ok(styles.includes('.proxy-render-card[data-first-frame-presented=\"true\"] .proxy-render-scrim'));
});

test('topbar interaction boundaries protect header controls and nearby asset selectors', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const uiStatePath = path.join(packageRoot, 'src', 'hooks', 'useExplorerUiState.ts');
  const utilsPath = path.join(packageRoot, 'src', 'utils.ts');
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const uiState = fs.readFileSync(uiStatePath, 'utf8');
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
  assert.ok(uiState.includes('const [topbarHasOpenDropdown, setTopbarHasOpenDropdown] = useState(false);'));
  assert.ok(uiState.includes('const [topbarFocusWithin, setTopbarFocusWithin] = useState(false);'));
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
  assert.ok(explorer.includes('scrollEl: mediaScrollViewportEl,'));
  assert.ok(explorer.includes('ref={mediaContentRef}'));
  assert.ok(explorer.includes('ref={setMediaScrollViewportNode}'));
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
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'usePendingComposeJobs.ts');
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
  const commandsHookPath = path.join(packageRoot, 'src', 'hooks', 'useExplorerCommands.ts');
  const pendingControllerPath = path.join(packageRoot, 'src', 'pending', 'usePendingArtifactController.ts');
  const renderControllerPath = path.join(packageRoot, 'src', 'render', 'useExplorerRenderController.ts');
  const uiStatePath = path.join(packageRoot, 'src', 'hooks', 'useExplorerUiState.ts');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const commands = fs.readFileSync(commandsHookPath, 'utf8');
  const pendingController = fs.readFileSync(pendingControllerPath, 'utf8');
  const renderController = fs.readFileSync(renderControllerPath, 'utf8');
  const uiState = fs.readFileSync(uiStatePath, 'utf8');
  assert.ok(content.includes("selectionItems.filter((item) => guessKind(item) === 'video')"));
  assert.ok(content.includes('Select one or more video clips'));
  assert.ok(content.includes("addToast('warn', 'Compose', 'Select one or more clips')"));
  assert.ok(content.includes('const buildComposeTimestampName = () => {'));
  assert.ok(content.includes("entry?.name === 'P5-SHARED-Exported-Media'"));
  assert.ok(content.includes('setComposeModalOpen(true);'));
  assert.ok(content.includes('{composeModalRendered ? ('));
  assert.ok(content.includes('className="compose-modal open"'));
  assert.ok(uiState.includes('const [composeSubmitting, setComposeSubmitting] = useState(false);'));
  assert.ok(content.includes('data-compose-project-picker="1"'));
  assert.ok(content.includes('onSubmit={(event) => {'));
  assert.ok(content.includes('className="btn good" type="submit" disabled={composeSubmitting}'));
  assert.ok(content.includes("registerAcceptedJob({ envelope: response as ComposeJobEnvelope });"));
  assert.ok(content.includes('const response = await composeMediaCommand({'));
  assert.ok(commands.includes("addToast('good', title, 'Compose started');"));
  assert.ok(commands.includes("addToast('good', 'Compose', 'Compose completed');"));
  assert.ok(commands.includes("const message = err instanceof Error ? err.message : 'Compose failed';"));
  assert.ok(commands.includes('target_dir: \'exports\''));
  assert.ok(commands.includes("mode: 'encode'"));
  assert.ok(commands.includes('allow_overwrite: false,'));
  assert.ok(content.includes('if (composeSubmitting) {'));
  assert.ok(content.includes('setComposeSubmitting(true);'));
  assert.ok(content.includes('setComposeSubmitting(false);'));
  assert.ok(content.includes("{composeSubmitting ? 'Composing...' : 'Compose'}"));
  assert.ok(content.includes('disabled={composeSubmitting}'));
  assert.ok(content.includes('aria-busy={composeSubmitting}'));
  assert.ok(content.includes('usePendingArtifactController({'));
  assert.ok(content.includes('handleComposeCompletion,'));
  assert.ok(pendingController.includes('registerAcceptedJob: ({ envelope }: { envelope: ComposeJobEnvelope }) => registerAcceptedJob({ envelope }),'));
  assert.ok(content.includes('const {\n    pendingComposeEntries,'));
  assert.ok(renderController.includes('...pendingRecordingEntries,'));
  assert.ok(renderController.includes('...pendingComposeEntries,'));
  assert.ok(content.includes('const renderController = useExplorerRenderController({'));
  assert.ok(content.includes('const renderedMediaEntries = renderController.renderedEntries;'));
  assert.ok(content.includes("const pending = usePendingArtifactController({"));
  assert.ok(content.includes('onDismissPendingJob={removePendingJob}'));
  const composeStart = content.indexOf('const handleComposeSelected = useCallback(async () => {');
  const composeEnd = content.indexOf('const handleComposeConfirm = useCallback(async () => {', composeStart);
  assert.ok(composeStart >= 0);
  assert.ok(composeEnd > composeStart);
  const composeBlock = content.slice(composeStart, composeEnd);
  assert.ok(!composeBlock.includes('window.prompt('));
  const confirmEnd = content.indexOf('const handleResolve = useCallback(async () => {', composeEnd);
  const confirmBlock = content.slice(composeEnd, confirmEnd);
  assert.ok(confirmBlock.includes('const response = await composeMediaCommand({'));
  assert.ok(!confirmBlock.includes("mode: 'auto'"));
  assert.ok(confirmBlock.includes("registerAcceptedJob({ envelope: response as ComposeJobEnvelope });"));
  assert.ok(!confirmBlock.includes('await loadProjects();'));
  assert.ok(!confirmBlock.includes('await loadAllMedia();'));
  assert.ok(!confirmBlock.includes('await loadMedia(activeProject);'));
  assert.ok(confirmBlock.includes('setComposeSubmitting(false);'));
});

test('pending compose modules and render wiring are present', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const cardPath = path.join(packageRoot, 'src', 'components', 'PendingComposeAssetCard.tsx');
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'usePendingComposeJobs.ts');
  const jobsPath = path.join(packageRoot, 'src', 'composeJobs.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const list = fs.readFileSync(listPath, 'utf8');
  const card = fs.readFileSync(cardPath, 'utf8');
  const hook = fs.readFileSync(hookPath, 'utf8');
  const jobs = fs.readFileSync(jobsPath, 'utf8');

  assert.ok(explorer.includes("const pending = usePendingArtifactController({"));
  assert.ok(explorer.includes("fetchComposeJobJson,"));
  assert.ok(explorer.includes("handleComposeCompletion,"));
  assert.ok(explorer.includes("entries={renderedMediaEntries}"));
  assert.ok(explorer.includes("items={renderedMediaEntries}"));
  assert.ok(explorer.includes("onDismissPendingJob={removePendingJob}"));
  assert.ok(!explorer.includes("prependItemsIntoMasonryColumns<RenderedMediaEntry>"));
  assert.ok(explorer.includes("const hydrateProjectMediaItems = useCallback((items: MediaItem[], project: { name: string; source?: string | null }): MediaItem[] => ("));
  assert.ok(explorer.includes('mergeMediaItemsPreservingIdentity(current, hydratedItems)'));
  assert.ok(explorer.includes('buildMediaIdentityKey(item, projectOverride)'));
  assert.ok(explorer.includes('const fallbackThumb = buildThumbFallback(kind);'));
  assert.ok(!explorer.includes("const safeThumbUrl = thumbUrl && getThumbLoadState(thumbJobKey) !== 'error'"));
  assert.ok(grid.includes("import PendingComposeAssetCard, { type PendingComposeAsset } from './PendingComposeAssetCard';"));
  assert.ok(grid.includes("if (entry.kind === 'pending-compose') {"));
  assert.ok(grid.includes("if (entry.kind === 'pending-recording') {"));
  assert.ok(list.includes("import PendingComposeAssetCard, { type PendingComposeAsset } from './PendingComposeAssetCard';"));
  assert.ok(list.includes("if (entry.kind === 'pending-compose') {"));
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
  const uiStatePath = path.join(packageRoot, 'src', 'hooks', 'useExplorerUiState.ts');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const uiState = fs.readFileSync(uiStatePath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(uiState.includes('const [deleteModalOpen, setDeleteModalOpen] = useState(false);'));
  assert.ok(uiState.includes('const [pendingDeleteSelectionKeys, setPendingDeleteSelectionKeys] = useState<string[]>([]);'));
  assert.ok(content.includes('performDeleteMediaSelection,'));
  assert.ok(content.includes('} = useExplorerCommands({'));
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
  const deleteStart = content.indexOf('const deleteMediaSelection = useCallback((selectionKeys: string[]) => {');
  const confirmStart = content.indexOf('const handleDeleteConfirm = useCallback(async () => {', deleteStart);
  assert.ok(deleteStart >= 0);
  assert.ok(confirmStart > deleteStart);
  const deleteBlock = content.slice(deleteStart, confirmStart);
  assert.ok(!deleteBlock.includes('window.confirm'));
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
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const loaderPath = path.join(packageRoot, 'src', 'thumbnailLoader.ts');
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useThumbnailQueue.ts');
  const statePath = path.join(packageRoot, 'src', 'state.ts');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const gridContent = fs.readFileSync(gridPath, 'utf8');
  const list = fs.readFileSync(listPath, 'utf8');
  const loaderContent = fs.readFileSync(loaderPath, 'utf8');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const stateContent = fs.readFileSync(statePath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(content.includes('useThumbnailQueue({'));
  assert.ok(content.includes('isThumbableRelativePath(item.relative_path)'));
  assert.ok(content.includes('thumbDatasetSignature'));
  assert.ok(content.includes('buildThumbJobKey('));
  assert.ok(content.includes('const thumbPlan = resolveThumbCandidatePlan(item, kind);'));
  assert.ok(content.includes("const thumbUrl = thumbPlan.primary ? absolutizeMediaUrl(resolveAssetUrl(thumbPlan.primary) || '') : '';"));
  assert.ok(content.includes("const thumbUrl = thumbPlan.primary ? absolutizeMediaUrl(resolveAssetUrl(thumbPlan.primary) || '') : undefined;"));
  assert.ok(gridContent.includes('data-thumb-url'));
  assert.ok(gridContent.includes('src={viewModel.fallbackThumb}'));
  assert.ok(list.includes('src={viewModel.fallbackThumb}'));
  assert.ok(!gridContent.includes('src={viewModel.safeThumbUrl}'));
  assert.ok(!list.includes('src={viewModel.safeThumbUrl}'));
  assert.ok(!content.includes('const safeThumbUrl = thumbUrl && getThumbLoadState(thumbJobKey) !== \'error\''));
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
  assert.ok(!gridContent.includes('<span className="badge tile-ui-text">Cinematic</span>'));
  assert.ok(!gridContent.includes('<span className="badge tile-ui-text">Scene</span>'));
  assert.ok(!gridContent.includes('<span className="badge tile-ui-text">{viewModel.kind}</span>'));
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
  assert.ok(styles.includes('.focus-proxy-root.is-active{'));
  assert.ok(styles.includes('.app:not(.grid-focused) .grid-cinematic-root{'));
  assert.ok(styles.includes('.app.proxy-travel-active .grid-cinematic-root{'));
  assert.ok(styles.includes('.app.proxy-travel-active .drawer{'));
  assert.ok(styles.includes('.proxy-render-surface{'));
  assert.ok(styles.includes('.proxy-render-world{'));
  assert.ok(styles.includes('.proxy-render-card{'));
  assert.ok(styles.includes('.proxy-preview-ui{'));
  assert.ok(styles.includes('.proxy-preview-ui .preview-interactive{'));
  assert.ok(styles.includes('pointer-events: none;'));
  assert.ok(styles.includes('pointer-events: auto;'));
  assert.ok(styles.includes('.proxy-prewarm-video{'));
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
  assert.ok(loaderContent.includes('const THUMBNAILABLE_EXTENSIONS = new Set'));
  assert.ok(loaderContent.includes('export const isThumbableRelativePath = (relativePath?: string): boolean => {'));
  assert.ok(loaderContent.includes('const ensureThumbLoad = ('));
  assert.ok(loaderContent.includes("target.addEventListener('load', handleLoad, { once: true });"));
  assert.ok(loaderContent.includes("target.addEventListener('error', handleError, { once: true });"));
  assert.ok(!loaderContent.includes('const loader = new Image();'));
  assert.ok(loaderContent.includes('thumbLoadedKey'));
  assert.ok(hookContent.includes('requiresThumbNodeSync'));
  assert.ok(hookContent.includes('hasPendingThumbNetworkLoad'));
  assert.ok(hookContent.includes('const THUMB_QUEUE_VIEWPORT_BUFFER_PX = 320;'));
  assert.ok(hookContent.includes('const THUMB_QUEUE_BOOT_MAX_TARGETS = 24;'));
  assert.ok(hookContent.includes('const THUMB_QUEUE_REQUEUE_DELAY_MS = 90;'));
  assert.ok(hookContent.includes('const THUMB_QUEUE_IDLE_REQUEUE_MS = 1400;'));
  assert.ok(hookContent.includes('const nearViewportTargets = syncTargets.filter((target) => isNearViewportTarget(target, root));'));
  assert.ok(hookContent.includes('const relevantTargets = nearViewportTargets.length ? nearViewportTargets : syncTargets;'));
  assert.ok(hookContent.includes('const hasRemaining = relevantTargets.some((target) => requiresThumbNodeSync(target));'));
  assert.ok(hookContent.includes('scrollHost?.addEventListener(\'scroll\', onViewportActivity, { passive: true });'));
  assert.ok(hookContent.includes('const idleInterval = window.setInterval(() => scheduleQueuePass(), THUMB_QUEUE_IDLE_REQUEUE_MS);'));
  assert.ok(hookContent.includes('const domObserver = new MutationObserver(() => scheduleQueuePass());'));
  assert.ok(hookContent.includes('remainingSyncTargets: Math.max(0, relevantTargets.length - queueTargets.length),'));
  assert.ok(hookContent.includes('__explorerThumbQueueDebug'));
  assert.ok(content.includes('project_source'));
});

test('package explorer interaction handlers do not trigger loading overlay state', () => {
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');
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
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');
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
  assert.ok(styles.includes('.context-menu button:disabled'));
  assert.ok(styles.includes('.context-menu button.danger'));
});

test('runtime and ingest context menus expose operator delete actions with live-aware device guards', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('const deleteNodeFromSidebar = useCallback(async (nodeId: string) => {'));
  assert.ok(content.includes('await api.deleteNode(nodeId);'));
  assert.ok(content.includes("scheduleExplorerObservabilityRefresh('manual', 0);"));
  assert.ok(content.includes('Delete node'));
  assert.ok(content.includes('const canOpenDeviceForNode = useCallback((node: NodeControlRecord) => {'));
  assert.ok(content.includes('return webRtcSessionsByNodeId.has(node.node_id);'));
  assert.ok(content.includes('disabled={!canOpenDeviceForNode(contextMenu.node)}'));
  assert.ok(content.includes('Answer Live'));
  assert.ok(content.includes('const deleteIngestClaimFromSidebar = useCallback(async (claimId: string) => {'));
  assert.ok(content.includes('await api.deleteIngestClaim(claimId);'));
  assert.ok(content.includes('await reloadIngestClaims();'));
  assert.ok(content.includes('Delete claim'));
  const openPayloadDetailsIndex = content.indexOf('const openPayloadDetails = useCallback');
  const openDeviceForNodeIndex = content.indexOf('const openDeviceForNode = useCallback');
  assert.ok(openPayloadDetailsIndex >= 0);
  assert.ok(openDeviceForNodeIndex > openPayloadDetailsIndex);
  const deleteNodeIndex = content.indexOf('const deleteNodeFromSidebar = useCallback');
  const runtimeMenuIndex = content.indexOf("{contextMenu?.kind === 'runtime' ? (");
  assert.ok(deleteNodeIndex >= 0);
  assert.ok(runtimeMenuIndex > deleteNodeIndex);
  const deleteClaimIndex = content.indexOf('const deleteIngestClaimFromSidebar = useCallback');
  const claimMenuIndex = content.indexOf("{contextMenu?.kind === 'ingest_claim' ? (");
  assert.ok(deleteClaimIndex >= 0);
  assert.ok(claimMenuIndex > deleteClaimIndex);
});

test('package explorer data load paths explicitly request loading overlay ownership', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useThumbnailQueue.ts');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  assert.ok(content.includes('setPendingDataLoadOverlay(true);'));
  assert.ok(content.includes('setPendingDataLoadOverlay(false);'));
  assert.ok(hookContent.includes('const shouldShowOverlay = pendingDataLoadOverlay && queueTargets.some((target) => hasPendingThumbNetworkLoad(target));'));
  assert.ok(hookContent.includes('const loadingToken = shouldShowOverlay ? beginContentLoading() : 0;'));
  assert.ok(hookContent.includes('clearPendingDataLoadOverlay();'));
  assert.ok(hookContent.includes('queueThumbLoads(queueTargets, THUMB_LOAD_TIMEOUT_MS, updateCardOrientation)'));
  assert.ok(hookContent.includes('window.clearInterval(idleInterval);'));
  assert.ok(hookContent.includes('domObserver.disconnect();'));
});


test('package explorer uses static-parity asset interaction semantics', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const selectionControllerPath = path.join(packageRoot, 'src', 'selection', 'useSelectionPreviewController.ts');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const gridContent = fs.readFileSync(gridPath, 'utf8');
  const selectionController = fs.readFileSync(selectionControllerPath, 'utf8');
  assert.ok(gridContent.includes('data-no-preview="1"'));
  assert.ok(hookContent.includes('if (inNoPreviewZone(event.target)) {'));
  assert.ok(hookContent.includes('if (inspectorOpen) {'));
  assert.ok(!hookContent.includes('closeDrawer();'));
  assert.ok(hookContent.includes('openPreview(item);'));
  assert.ok(hookContent.includes("onTapStage?.('first', itemKey);"));
  assert.ok(hookContent.includes("onTapStage?.('second', itemKey);"));
  assert.ok(hookContent.includes('onHoldEmphasis?.(itemKey, true);'));
  assert.ok(selectionController.includes('toggleSelectionWithOrder'));
  assert.ok(content.includes('selectionOrderIndexMap'));
  assert.ok(content.includes('selectedOrderMap.get(selectionKey)'));
});

test('package explorer suppresses default context menu in tile preview zone', () => {
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');
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
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useTopbarScrollState.ts');
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
  assert.ok(content.includes('const RETAINED_UI_PREFS_KEY = \'media-sync-explorer-ui-prefs-v1\';'));
  assert.ok(content.includes('const parseStoredJsonObject = (raw: string | null): Record<string, unknown> | null => {'));
  assert.ok(content.includes('const resolveThumbCandidatePlan = useCallback((item: MediaItem, kind: ReturnType<typeof guessKind>): ThumbnailCandidatePlan => {'));
  assert.ok(content.includes('if (!isThumbableRelativePath(item.relative_path)) {'));
  assert.ok(content.includes("return { primary: normalizeThumbUrl(getBestStreamUrl(item)), fallbackReason: 'image-stream' };"));
  assert.ok(content.includes('const [retainedPrefsHydrated, setRetainedPrefsHydrated] = useState(false);'));
  assert.ok(content.includes('window.localStorage.getItem(RETAINED_UI_PREFS_KEY)'));
  assert.ok(content.includes('setRetainedPrefsHydrated(false);'));
  assert.ok(content.includes('setRetainedPrefsHydrated(true);'));
  assert.ok(content.includes('if (!retainedPrefsHydrated) {'));
  assert.ok(content.includes('const retainedParsed = parseStoredJsonObject(retainedRaw);'));
  assert.ok(content.includes('malformedRetainedPayload: Boolean(retainedRaw) && !retainedParsed,'));
  assert.ok(content.includes('restoreSource: \'retained\' | \'legacy\' | \'none\';'));
  assert.ok(content.includes('hydrated: true,'));
  assert.ok(content.includes('saveSkippedUntilHydrated: true,'));
  assert.ok(content.includes('saveSkippedUntilHydrated: false,'));
  assert.ok(content.includes('hydrated: retainedPrefsHydrated,'));
  assert.ok(content.includes('__explorerRetainedPrefsDebug'));
  assert.ok(content.includes('gridColumnCount: clampLayoutColumns(gridColumnCount),'));
  assert.ok(content.includes('const restoredColumns = clampLayoutColumns(retainedParsed.gridColumnCount);'));
  assert.ok(content.includes('lastCommittedColumnsRef.current = restoredColumns;'));
  assert.ok(content.includes('setGridColumnCount(restoredColumns);'));
  assert.ok(content.includes('if (storedView === \'grid\' || storedView === \'list\') {'));
  assert.ok(content.includes('if (VALID_SORT_KEYS.has(retainedParsed.sortKey as SortKey)) {'));
  assert.ok(content.includes('if (VALID_TYPE_FILTERS.has(retainedParsed.typeFilter as MediaTypeFilter)) {'));
  assert.ok(content.includes('if (typeof retainedParsed.selectedOnly === \'boolean\') {'));
  assert.ok(content.includes('if (typeof retainedParsed.untaggedOnly === \'boolean\') {'));
  assert.ok(content.includes('if (typeof retainedParsed.overlayEnabled === \'boolean\') {'));
  assert.ok(content.includes('sortKey,'));
  assert.ok(content.includes('typeFilter,'));
  assert.ok(content.includes('selectedOnly,'));
  assert.ok(content.includes('untaggedOnly,'));
  assert.ok(content.includes('overlayEnabled,'));
  assert.ok(content.includes('retainedPrefsHydrated,'));
  assert.ok(content.includes('if (kind === \'video\') {'));
  assert.ok(content.includes("fallbackReason: 'generated-sha',"));
  assert.ok(content.includes('const legacyFilterParsed = parseStoredJsonObject(window.localStorage.getItem(LEGACY_FILTER_PREFS_KEY));'));
  assert.ok(content.includes('window.localStorage.getItem(LEGACY_OVERLAY_VIS_PREFS_KEY)'));
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
  const focusedTapResolverPath = path.join(packageRoot, 'src', 'explorer', 'focus', 'resolveFocusedTapTarget.ts');
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
  const focusedTapResolver = fs.readFileSync(focusedTapResolverPath, 'utf8');
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
  assert.ok(content.includes("focusStartRetryFrameRef.current = scheduleExplorerRaf('raf-lane-focus-world', () => {"));
  assert.ok(content.includes('const retryStart = startFocusMotionForSelectionKey(selectionKey);'));
  assert.ok(content.includes("from './explorer/focus/focusWorldMotion'"));
  assert.ok(content.includes("from './explorer/focus/resolveFocusedTapTarget'"));
  assert.ok(content.includes('const tapTarget = resolveFocusedTapTarget(target);'));
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
  assert.ok(content.includes("mode: 'open' | 'refocus' | 'retarget',"));
  assert.ok(content.includes('setGridCinematicMode(mode === \'open\' ? \'grid-opening\' : \'grid-refocusing\');'));
  assert.ok(content.includes('setGridCinematicMode(\'grid-focused\');'));
  assert.ok(content.includes('focusOrchestratorRef.current?.closeFocusTransition({'));
  assert.ok(content.includes('closeGridFocusToRest'));
  assert.ok(content.includes("setGridCinematicMode('grid-closing');"));
  assert.ok(content.includes("setGridCinematicMode('grid-rest');"));
  assert.ok(content.includes('recordPreviewDebug({ stage: event, selectionKey, requestedMode: view });'));
  assert.ok(content.includes("const cardEl = targetEl.closest<HTMLElement>('.masonry-card[data-select-key]');"));
  assert.ok(content.includes('const isProxyOrigin = event.composedPath().some((node) => ('));
  assert.ok(content.includes("node instanceof HTMLElement"));
  assert.ok(content.includes("node.dataset.focusProxyLayer === 'true'"));
  assert.ok(content.includes("stage: 'focused-retarget-delegated-to-proxy-root'"));
  assert.ok(content.includes("stage: 'viewport-close-blocked-proxy-origin'"));
  assert.ok(content.includes("stage: 'focused-retarget-resolved-key'"));
  assert.ok(content.includes("handleEvent('focused-retarget-runProxyFocusTransition-false');"));
  assert.ok(content.includes("stage: 'focused-retarget-openPreview-fallback-blocked'"));
  assert.ok(content.includes("stage: 'focused-tap-hit-proxy-asset'"));
  assert.ok(content.includes("stage: 'focused-tap-hit-proxy-surface'"));
  assert.ok(content.includes("stage: 'focused-tap-hit-body'"));
  assert.ok(content.includes("stage: 'focused-tap-hit-proxy-card-root'"));
  assert.ok(content.includes("stage: 'focused-tap-hit-proxy-card-child'"));
  assert.ok(content.includes("stage: 'focused-tap-hit-grid-asset'"));
  assert.ok(content.includes("stage: 'focused-tap-hit-empty-space'"));
  assert.ok(content.includes("stage: 'focused-tap-empty-after-proxy-surface'"));
  assert.ok(content.includes("stage: 'focused-tap-empty-after-body'"));
  assert.ok(content.includes("stage: 'focused-tap-close-empty-space'"));
  assert.ok(content.includes("stage: 'focused-tap-retarget-dispatched'"));
  assert.ok(content.includes("stage: 'focused-retarget-retry-scheduled'"));
  assert.ok(content.includes("stage: 'focused-retarget-retry-attempt'"));
  assert.ok(content.includes("stage: 'focused-retarget-retry-failed'"));
  assert.ok(content.includes("stage: 'focused-retarget-kept-focused'"));
  assert.ok(content.includes("stage: 'focused-retarget-hit-proxy-card'"));
  assert.ok(content.includes("stage: 'focused-retarget-hit-grid-fallback'"));
  assert.ok(content.includes("stage: 'focused-retarget-ambient-card-hit'"));
  assert.ok(content.includes("stage: 'focused-retarget-ambient-card-miss'"));
  assert.ok(content.includes("stage: 'focused-doubletap-suppressed'"));
  assert.ok(content.includes("stage: 'focused-doubletap-allowed-control'"));
  assert.ok(content.includes('if (!cardEl) {'));
  assert.ok(content.includes('closeDrawer();'));
  assert.ok(content.includes("const proxyOpened = runProxyFocusTransition(nextKey, 'retarget');"));
  assert.ok(content.includes('__explorerFocusLayerDebug'));
  assert.ok(content.includes("recordPreviewDebug({ stage: 'proxy-open-failed-no-fallback', selectionKey: nextKey, requestedMode: view, finalMode: 'idle' });"));
  assert.ok(content.includes('className={`focus-proxy-root ${gridCinematicMode !== \'grid-rest\' ? \'is-active\' : \'\'}`}'));
  assert.ok(content.includes('data-focus-proxy-root="true"'));
  assert.ok(content.includes('data-focus-proxy-layer="true"'));
  assert.ok(content.includes('className={`app ${proxyTravelActive ? \'proxy-travel-active\' : \'\'} ${gridCinematicMode}`}'));
  assert.ok(content.includes('data-grid-cinematic-nav="true"'));
  assert.ok(content.includes('const gridCinematicActive = !proxyTravelActive && focusWorldActive && view === \'grid\' && gridCinematicMode === \'grid-rest\';'));
  assert.ok(content.includes('const drawerVisibleOwner = !proxyTravelActive && inspectorOpen && (view === \'list\' || focusPresentationState.mode === \'drawer-fallback\');'));
  assert.ok(content.includes("const proxyPreviewVisible = !proxyTravelActive && view === 'grid' && inspectorOpen && gridCinematicMode === 'grid-focused';"));
  assert.ok(content.includes("playable={Boolean(normalizedPreviewAsset && (normalizedPreviewAsset.kind === 'video' || normalizedPreviewAsset.kind === 'audio'))}"));
  assert.ok(content.includes('metadataRows={previewMetadataRows}'));
  assert.ok(content.includes('playToken: previewAutoPlayToken,'));
  assert.ok(content.includes("if (target.closest('.proxy-preview-ui')) return;"));
  assert.ok(content.includes('if (!gridKey) {'));
  assert.ok(content.includes("recordPreviewDebug({ stage: 'focused-tap-close-empty-space'"));
  assert.ok(content.includes('if (nextKey === activeAssetKey) {'));
  assert.ok(content.includes("const proxyVideo = cardEl.querySelector<HTMLVideoElement>('.proxy-render-video');"));
  assert.ok(content.includes('if (proxyVideo.paused) {'));
  assert.ok(content.includes('proxyVideo.play().catch(() => {});'));
  assert.ok(content.includes('focusAsset(nextItem, nextKey);'));
  assert.ok(content.includes('const proxyOpened = runProxyFocusTransition(nextKey, \'retarget\');'));
  assert.ok(!content.includes("if (!proxyOpened) {\n        openPreview(nextItem);"));
  assert.ok(content.includes('className="proxy-preview-ui" data-focus-proxy-layer="true"'));
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
  assert.ok(sceneSnapshot.includes('function readRenderableCardThumbUrl(img: HTMLImageElement | null | undefined) {'));
  assert.ok(sceneSnapshot.includes('const liveSrc = String(img.currentSrc || img.src || \'\').trim();'));
  assert.ok(!sceneSnapshot.includes('img?.dataset.thumbUrl'));
  assert.ok(sceneSnapshot.includes('const ambientNeighborLimit = Math.min(Math.max(0, maxCards - 1), 8);'));
  assert.ok(sceneSnapshot.includes('sampledEls = [activeEl, ...neighbors];'));
  assert.ok(cameraController.includes('export function computeCameraStateForTarget'));
  assert.ok(cameraController.includes('viewportLeft?: number;'));
  assert.ok(cameraController.includes('viewportTop?: number;'));
  assert.ok(cameraController.includes('x: safeCenterX - (target.centerX * scale),'));
  assert.ok(cameraController.includes('y: safeCenterY - (target.centerY * scale),'));
  assert.ok(proxyRenderer.includes('export class ViewportProxyRenderer'));
  assert.ok(proxyRenderer.includes('Focused retarget contract: the proxy card root is the primary hit target for asset retarget.'));
  assert.ok(proxyRenderer.includes('const showActiveChrome = opts?.showActiveChrome ?? true;'));
  assert.ok(proxyRenderer.includes('private activeSelectionKey = \'\';'));
  assert.ok(proxyRenderer.includes('private activeVideoEl: HTMLVideoElement | null = null;'));
  assert.ok(proxyRenderer.includes('private renderPassCount = 0;'));
  assert.ok(proxyRenderer.includes('private getRenderableThumbUrl(card: RenderCardSnapshot) {'));
  assert.ok(proxyRenderer.includes('private escapeHtmlAttr(value: string) {'));
  assert.ok(proxyRenderer.includes('.replaceAll(\'&\', \'&amp;\')'));
  assert.ok(proxyRenderer.includes('<div class=\"proxy-render-ambient-layer\" data-focus-proxy-layer=\"true\"></div>'));
  assert.ok(proxyRenderer.includes('<div class=\"proxy-render-active-layer\" data-focus-proxy-layer=\"true\"></div>'));
  assert.ok(proxyRenderer.includes('data-focus-proxy-layer=\"true\"'));
  assert.ok(proxyRenderer.includes('data-proxy-hit-target=\"card-root\"'));
  assert.ok(proxyRenderer.includes('data-proxy-hit-target=\"card-child\"'));
  assert.ok(proxyRenderer.includes('const sameSelection = Boolean(this.activeCardEl && this.activeSelectionKey === card.selectionKey);'));
  assert.ok(proxyRenderer.includes('ambientLayer.innerHTML = sorted'));
  assert.ok(proxyRenderer.includes('.filter((card) => !card.active)'));
  assert.ok(proxyRenderer.includes('const reconcile = this.reconcileActiveCard(activeCard, showActiveChrome);'));
  assert.ok(proxyRenderer.includes('__explorerProxyRendererDebug'));
  assert.ok(proxyRenderer.includes('proxy-video-released'));
  assert.ok(proxyRenderer.includes('proxy-video-reused'));
  assert.ok(proxyRenderer.includes('proxy-video-rearm-latest-selection'));
  assert.ok(proxyRenderer.includes('proxy-video-stale-selection-blocked'));
  assert.ok(proxyRenderer.includes('proxy-video-removed-src'));
  assert.ok(proxyRenderer.includes('proxy-video-load-reset'));
  assert.ok(proxyRenderer.includes('videoEl.removeAttribute(\'src\');'));
  assert.ok(proxyRenderer.includes('videoEl.load();'));
  assert.ok(proxyRenderer.includes('activeVideoNodeStableId: this.activeVideoEl?.dataset.proxyStableVideoId || \'\','));
  assert.ok(proxyRenderer.includes("world.style.setProperty('--proxy-world-scale', String(Math.max(0.001, camera.scale)));"));
  assert.ok(proxyRenderer.includes('videoEl.dataset.proxyStableVideoId = String(this.activeVideoNodeStableId);'));
  assert.ok(proxyRenderer.includes('if (showActiveChrome) {'));
  assert.ok(orchestrator.includes('export class FocusTransitionOrchestrator'));
  assert.ok(orchestrator.includes('openFocusTransition(args: {'));
  assert.ok(orchestrator.includes('refocusTransition(args: {'));
  assert.ok(orchestrator.includes('retargetTransition(args: {'));
  assert.ok(orchestrator.includes('closeFocusTransition(args?: {'));
  assert.ok(orchestrator.includes('orchestrator-close-start'));
  assert.ok(orchestrator.includes('orchestrator-close-complete'));
  assert.ok(orchestrator.includes('orchestrator-close-pointer-reset'));
  assert.ok(orchestrator.includes('orchestrator-close-retained'));
  assert.ok(orchestrator.includes('orchestrator-close-retained-inert'));
  assert.ok(orchestrator.includes('orchestrator-close-hit-ownership-revoked'));
  assert.ok(orchestrator.includes('orchestrator-close-ambient-disabled'));
  assert.ok(orchestrator.includes("this.root.dataset.proxyRetainedInert = 'true';"));
  assert.ok(orchestrator.includes('delete this.root.dataset.proxyRetainedInert;'));
  assert.ok(orchestrator.includes('this.timeline = gsap.timeline('));
  assert.ok(orchestrator.includes('proxy-open-start'));
  assert.ok(orchestrator.includes('proxy-open-complete'));
  assert.ok(orchestrator.includes('proxy-refocus-start'));
  assert.ok(orchestrator.includes('proxy-refocus-complete'));
  assert.ok(orchestrator.includes('focus-retarget-start'));
  assert.ok(orchestrator.includes('focus-retarget-commit'));
  assert.ok(orchestrator.includes('focus-retarget-cancel'));
  assert.ok(orchestrator.includes('focus-retarget-recover-world'));
  assert.ok(orchestrator.includes('focus-retarget-recover-world-commit'));
  assert.ok(orchestrator.includes('focus-retarget-hard-fallback'));
  assert.ok(orchestrator.includes('proxy-failed'));
  assert.ok(orchestrator.includes('__explorerProxyCenterDebug'));
  assert.ok(orchestrator.includes('this.renderer.render(snapshot, startCamera, { showActiveChrome: false });'));
  assert.ok(orchestrator.includes('this.renderer.render(snapshot, camera, { showActiveChrome: true });'));
  assert.ok(orchestrator.includes("this.root.dataset.proxyRetainedOnClose = 'true';"));
  assert.ok(orchestrator.includes("args.onEvent?.('proxy-retained-reuse-same-key');"));
  assert.ok(content.includes('pauseNonAuthoritativeGridVideos'));
  assert.ok(content.includes('focus-close-start'));
  assert.ok(content.includes('focus-close-complete'));
  assert.ok(content.includes('focus-close-reset-rest'));
  assert.ok(content.includes('focus-close-reset-missed'));
  assert.ok(content.includes('focus-close-scroll-lock-removed'));
  assert.ok(content.includes('focus-close-cleared-active-asset'));
  assert.ok(content.includes('focus-close-cleared-preview-activation'));
  assert.ok(content.includes('focus-close-cleared-reinforced-active'));
  assert.ok(content.includes('focus-close-cleared-hold-emphasis'));
  assert.ok(content.includes('focus-close-activation-reset-complete'));
  assert.ok(content.includes('focus-close-proxy-hit-owner-still-present'));
  assert.ok(content.includes('focus-close-grid-hit-owner-restored'));
  assert.ok(content.includes('focus-close-retained-proxy-inert'));
  assert.ok(content.includes('retainedProxyInert'));
  assert.ok(content.includes('gridShouldOwnHits'));
  assert.ok(content.includes("setGridCinematicMode('grid-rest');"));
  assert.ok(content.includes("setProxyTravelState('idle');"));
  assert.ok(content.includes("viewportEl.classList.remove('focus-proxy-scroll-lock');"));
  assert.ok(content.includes('activeAssetKey,'));
  assert.ok(content.includes('previewActivationKey,'));
  assert.ok(content.includes('reinforcedActiveKey,'));
  assert.ok(content.includes('holdEmphasisKey,'));
  assert.ok(content.includes('grid-thumb-paused-authority-enforced'));
  assert.ok(content.includes('grid-thumb-play-blocked-non-authoritative'));
  assert.ok(content.includes('prewarm-video-paused'));
  assert.ok(content.includes('prewarm-video-released'));
  assert.ok(content.includes('prewarm-video-blocked-non-authoritative'));
  assert.ok(content.includes('__explorerMediaInvariantViolation'));
  assert.ok(content.includes('unauthorizedGridThumbPlaying'));
  assert.ok(content.includes('unauthorizedPrewarmPlaying'));
  assert.ok(content.includes('focusedProxyPlaybackOwned'));
  assert.ok(focusedTapResolver.includes('Focused retarget contract:'));
  assert.ok(focusedTapResolver.includes("kind: target === proxyCardEl ? 'proxy-card-root' : 'proxy-card-child'"));
  assert.ok(focusedTapResolver.includes("if (target.classList.contains('proxy-render-surface')) {"));
  assert.ok(focusedTapResolver.includes("if (target === document.body) {"));
  assert.ok(orchestrator.includes("args.onEvent?.('proxy-retained-blocked-different-key');"));
  assert.ok(orchestrator.includes("this.clearRetainedProxy('proxy-retained-cleared-asset-change');"));
  assert.ok(orchestrator.includes("clearRetainedProxyOnDeselect()"));
  assert.ok(orchestrator.includes("this.root.dataset.proxyContinuityEvent = 'audio-owner-revoked-close';"));
  const closeSectionStart = orchestrator.indexOf('closeFocusTransition(args?: {');
  const closeSectionEnd = orchestrator.indexOf('clearRetainedProxyOnDeselect()');
  const closeSection = closeSectionStart >= 0 && closeSectionEnd > closeSectionStart
    ? orchestrator.slice(closeSectionStart, closeSectionEnd)
    : orchestrator;
  assert.ok(!closeSection.includes('this.renderer.unmount();'));
  assert.ok(orchestrator.includes('.proxy-render-top, .proxy-render-bottom, .proxy-render-scrim'));
  assert.ok(content.includes('focusOrchestratorRef.current?.clearRetainedProxyOnDeselect();'));
  assert.ok(content.includes("mode: 'open' | 'refocus' | 'retarget'"));
  assert.ok(content.includes("runProxyFocusTransition(nextKey, 'retarget')"));
  assert.ok(content.includes("stage: 'focused-retarget-tap'"));
  assert.ok(content.includes("stage: 'focused-retarget-blocked-overlay'"));
  assert.ok(content.includes("stage: 'focused-retarget-blocked-same-key'"));
  assert.ok(content.includes("stage: 'focused-retarget-dispatched'"));
  assert.ok(content.includes('const handleProxyPointerDown = (event: PointerEvent) => {'));
  assert.ok(content.includes('__explorerProxyContinuityDebug'));
  assert.ok(content.includes('authoritativeVisualSurface'));
  assert.ok(content.includes('authoritativeAudioSurface'));
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
  assert.ok(content.includes('touchPinchCapable,'));
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
  assert.ok(contextBlock.includes("setContextMenu({ kind: 'media_asset', x, y, items });"));
  assert.ok(!contextBlock.includes('loadSources('));
  assert.ok(!contextBlock.includes('loadProjects('));
  assert.ok(!contextBlock.includes('loadMedia('));
  assert.ok(!contextBlock.includes('loadAllMedia('));

  const previewStart = content.indexOf('const openPreview = useCallback((item: MediaItem) => {');
  const previewBlock = previewStart >= 0 ? content.slice(previewStart, previewStart + 900) : '';
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
  const hookPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');

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
  assert.ok(contextBlock.includes("setContextMenu({ kind: 'media_asset', x, y, items });"));
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
  const uiStatePath = path.join(packageRoot, 'src', 'hooks', 'useExplorerUiState.ts');
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const controllerPath = path.join(packageRoot, 'src', 'explorer', 'density', 'createExplorerDensityController.ts');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const uiState = fs.readFileSync(uiStatePath, 'utf8');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const controller = fs.readFileSync(controllerPath, 'utf8');

  assert.ok(uiState.includes('const [gridColumnCount, setGridColumnCount] = useState(defaultGridColumns);'));
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


test('asset cards apply thumbnail error fallback without retry-loop spam', () => {
  const gridPath = path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx');
  const listPath = path.join(packageRoot, 'src', 'components', 'AssetList.tsx');
  const grid = fs.readFileSync(gridPath, 'utf8');
  const list = fs.readFileSync(listPath, 'utf8');

  assert.ok(grid.includes('onError={(event) => {'));
  assert.ok(list.includes('onError={(event) => {'));
  assert.ok(grid.includes('native.stopImmediatePropagation?.();'));
  assert.ok(list.includes('native.stopImmediatePropagation?.();'));
  assert.ok(grid.includes('native.stopPropagation?.();'));
  assert.ok(list.includes('native.stopPropagation?.();'));
  assert.ok(grid.includes('node.onerror = null;'));
  assert.ok(list.includes('node.onerror = null;'));
  assert.ok(grid.includes('const fallback = node.dataset.thumbFallback || "";') || grid.includes("const fallback = node.dataset.thumbFallback || '';"));
  assert.ok(list.includes('const fallback = node.dataset.thumbFallback || "";') || list.includes("const fallback = node.dataset.thumbFallback || '';"));
  assert.ok(grid.includes('if (fallback && node.src !== fallback) node.src = fallback;'));
  assert.ok(list.includes('if (fallback && node.src !== fallback) node.src = fallback;'));
});

test('no generic load-failure console spam contract should remain in explorer-facing source', () => {
  const filesToCheck = [
    path.join(packageRoot, 'src', 'ExplorerApp.tsx'),
    path.join(packageRoot, 'src', 'thumbnailLoader.ts'),
    path.join(packageRoot, 'src', 'hooks', 'useThumbnailQueue.ts'),
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
  const interactionsPath = path.join(packageRoot, 'src', 'hooks', 'useAssetInteractions.ts');
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
  assert.ok(explorer.includes("scheduleExplorerRaf('raf-lane-cinematic-reveal', () => {"));
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
  assert.ok(styles.includes('.asset-cinematic-ui{'));
  assert.ok(styles.includes('display: block;'));
  assert.ok(styles.includes('.asset .asset-overlay.is-simplified .asset-ol-bottom,'));
  assert.ok(styles.includes('.content:not(.overlay-hidden):not(.density-motion-active):not(.density-gesture-active) .asset .asset-overlay{'));
  assert.ok(styles.includes('.content:not(.overlay-hidden):not(.density-motion-active):not(.density-gesture-active) .asset .asset-cinematic-ui-top,'));
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

test('mobile keyboard resilience contracts keep visual viewport + input font safeguards wired', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const stylesPath = path.join(packageRoot, 'src', 'styles.css');
  const content = fs.readFileSync(explorerPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.ok(content.includes('const viewport = window.visualViewport;'));
  assert.ok(content.includes("root.style.setProperty('--explorer-visual-viewport-height', nextHeight);"));
  assert.ok(content.includes("viewport?.addEventListener('resize', captureViewportSnapshot);"));
  assert.ok(content.includes("viewport?.addEventListener('scroll', captureViewportSnapshot);"));
  assert.ok(content.includes('__explorerViewportDebug'));
  assert.ok(content.includes('__explorerLoadFailureDebug'));
  assert.ok(content.includes('__explorerNetworkFailureDebug'));
  assert.ok(content.includes("type LoadFailureEmitter = 'asset-grid' | 'asset-list' | 'proxy-render' | 'other';"));
  assert.ok(content.includes("type NetworkFailureLane ="));
  assert.ok(content.includes('const classifyEmitter = (target: HTMLElement): LoadFailureEmitter => {'));
  assert.ok(content.includes('const classifyNetworkLane = ({'));
  assert.ok(content.includes("if (normalizedUrl.includes('/_next/')) return 'next-static';"));
  assert.ok(content.includes("if (normalizedTag === 'SCRIPT') return 'script';"));
  assert.ok(content.includes("if (source === 'promise-rejection') return 'promise-rejection';"));
  assert.ok(content.includes('const shouldSuppressMediaError = (target: HTMLElement) => {'));
  assert.ok(content.includes('const recentEvents: LoadFailureEvent[] = [];'));
  assert.ok(content.includes('const networkRecentEvents: NetworkFailureEvent[] = [];'));
  assert.ok(content.includes('const MAX_NETWORK_RECENT_EVENTS = 120;'));
  assert.ok(content.includes('const networkLaneTotals: Record<NetworkFailureLane, number> = {'));
  assert.ok(content.includes('const onUnhandledRejection = (event: PromiseRejectionEvent) => {'));
  assert.ok(content.includes('const shouldSuppressGenericLoadFailedRejection = ({'));
  assert.ok(content.includes('const suppressUnhandledRejectionDefault = (event: PromiseRejectionEvent) => {'));
  assert.ok(content.includes("if (message !== 'Load failed') return false;"));
  assert.ok(content.includes('if (reasonStack.trim().length > 0) return false;'));
  assert.ok(content.includes('suppressedDefault: shouldSuppressDefault,'));
  assert.ok(content.includes('suppressUnhandledRejectionDefault(event);'));
  assert.ok(content.includes('event.stopImmediatePropagation?.();'));
  assert.ok(content.includes('window.addEventListener(\'unhandledrejection\', onUnhandledRejection, true);'));
  assert.ok(content.includes('const MAX_RECENT_EVENTS = 80;'));
  assert.ok(content.includes('suppressedCount: suppressed ? 1 : 0,'));
  assert.ok(content.includes('lastDataset: dataset,'));
  assert.ok(content.includes('lastTargetPath: targetPath,'));
  assert.ok(content.includes('laneTotals: { ...networkLaneTotals },'));
  assert.ok(content.includes('emitterTotals: Array.from(loadFailures.values()).reduce'));
  assert.ok(content.includes('recentEvents: recentEvents.map((event) => ({ ...event })),'));
  assert.ok(content.includes('recentEvents: networkRecentEvents.map((event) => ({ ...event })),'));
  assert.ok(content.includes('const getTargetDatasetSnapshot = (target: HTMLElement): Record<string, string> => {'));
  assert.ok(content.includes('const getTargetPath = (target: HTMLElement) => ('));
  assert.ok(content.includes('suppressedMediaErrorCount,'));
  assert.ok(content.includes("if (target.closest('.proxy-render-card,.focus-proxy-root')) return 'proxy-render';"));
  assert.ok(content.includes('event.stopImmediatePropagation?.();'));
  assert.ok(content.includes('viewportMeta: readViewportMeta()'));
  assert.ok(content.includes('pageScaleLike'));
  assert.ok(styles.includes('height: var(--explorer-visual-viewport-height, 100%);'));
  assert.ok(styles.includes('@media (pointer: coarse){'));
  assert.ok(styles.includes('.search-input,'));
  assert.ok(styles.includes('font-size: 16px !important;'));
  assert.ok(styles.includes('.search-input-wrap{'));
  assert.ok(styles.includes('transform: none;'));
  assert.ok(!styles.includes('transform: scale(0.86);'));
  assert.ok(content.includes('className="search-input-wrap"'));
  assert.ok(content.includes('className="search-input"'));
});

test('media URL helpers delegate normalization to centralized URL policy', () => {
  const mediaUrlsPath = path.join(packageRoot, 'src', 'utils', 'mediaUrls.ts');
  const policyPath = path.join(packageRoot, 'src', 'config', 'urlPolicy.ts');
  const mediaUrls = fs.readFileSync(mediaUrlsPath, 'utf8');
  const policy = fs.readFileSync(policyPath, 'utf8');

  assert.ok(mediaUrls.includes('normalizeBrowserAssetUrl'));
  assert.ok(mediaUrls.includes('absolutizeNonAssetUrl'));
  assert.ok(mediaUrls.includes('new URL(raw, window.location.origin).toString()'));
  assert.ok(mediaUrls.includes("return normalizeAssetUrl(item.thumbnail_url || item.thumb_url || '');"));
  assert.ok(mediaUrls.includes("return normalizeAssetUrl(item.stream_url || item.url || '');"));
  assert.ok(mediaUrls.includes("return normalizeAssetUrl(item.download_url || item.stream_url || '');"));
  assert.ok(policy.includes("const unsafeApiAuthority = parsed.protocol === 'http:' || apiPort;"));
  assert.ok(policy.includes("if (location.protocol === 'https:' && unsafeApiAuthority && (sameHost || privateHost || apiPort)) {"));
  assert.ok(policy.includes('isLikelyPrivateHost'));
});

test('thumbnail normalization preserves API port when remapping localhost urls', () => {
  const loaderPath = path.join(packageRoot, 'src', 'thumbnailLoader.ts');
  const loader = fs.readFileSync(loaderPath, 'utf8');

  assert.ok(loader.includes('normalizeAssetUrl(rawUrl)'));
  assert.ok(!loader.includes('const resolvedPort = parsed.port || \'\';'));
  assert.ok(loader.includes('return normalized || undefined;'));
  assert.ok(loader.includes("import { normalizeAssetUrl } from './utils/mediaUrls';"));
});

test('explorer runtime panel wires live WebRTC session hooks and chip normalization', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const sourcePanelsPath = path.join(packageRoot, 'src', 'source-control', 'SourceControlPanels.tsx');
  const chipsPath = path.join(packageRoot, 'src', 'utils', 'runtimeChips.ts');
  const livePreviewPath = path.join(packageRoot, 'src', 'components', 'live', 'LivePreview.tsx');
  const apiPath = path.join(packageRoot, 'src', 'api.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const sourcePanels = fs.readFileSync(sourcePanelsPath, 'utf8');
  const chips = fs.readFileSync(chipsPath, 'utf8');
  const livePreview = fs.readFileSync(livePreviewPath, 'utf8');
  const api = fs.readFileSync(apiPath, 'utf8');

  assert.ok(explorer.includes('useRuntimeController'));
  assert.ok(explorer.includes('LivePreview'));
  assert.ok(explorer.includes('/connect/device?node_id='));
  assert.ok(sourcePanels.includes('buildRuntimeChips(node, webRtcSessionsByNodeId.get(node.node_id))'));
  assert.ok(api.includes('viewers/${encodeURIComponent(viewerId)}/answer'));
  assert.ok(api.includes('/ice/device'));
  assert.ok(api.includes('postLiveViewerState'));
  assert.ok(livePreview.includes('randomUUID'));
  assert.ok(livePreview.includes('postLiveViewerAnswer'));
  assert.ok(livePreview.includes('postLiveViewerIce'));
  assert.ok(livePreview.includes('listLiveDeviceIce'));
  assert.ok(livePreview.includes('onicecandidate'));
  assert.ok(chips.includes('can_proxy_streams'));
  assert.ok(chips.includes("tokens.includes('session-node')"));
  assert.ok(chips.includes("tokens.includes('session')"));
  assert.ok(chips.includes('viewer_count'));
  assert.ok(chips.includes('connection_states'));
  assert.ok(chips.includes("addChip('live', 'capability')"));
});

test('explorer runtime orchestration decomposition wiring remains intact', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const runtimeControllerPath = path.join(packageRoot, 'src', 'runtime', 'useRuntimeController.ts');
  const livePreviewStatePath = path.join(packageRoot, 'src', 'runtime', 'useLivePreviewState.ts');
  const runtimeReactionsPath = path.join(packageRoot, 'src', 'runtime', 'useRuntimeEventReactions.ts');
  const streamHubPath = path.join(packageRoot, 'src', 'runtime', 'StreamHub.ts');
  const livePreviewPath = path.join(packageRoot, 'src', 'components', 'live', 'LivePreview.tsx');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const runtimeController = fs.readFileSync(runtimeControllerPath, 'utf8');
  const livePreviewState = fs.readFileSync(livePreviewStatePath, 'utf8');
  const runtimeReactions = fs.readFileSync(runtimeReactionsPath, 'utf8');
  const streamHub = fs.readFileSync(streamHubPath, 'utf8');
  const livePreview = fs.readFileSync(livePreviewPath, 'utf8');

  assert.ok(runtimeController.includes('useWebRtcLiveSessions'));
  assert.ok(!runtimeController.includes('useRuntimeEvents'));
  assert.ok(runtimeController.includes('poll = false'));
  assert.ok(livePreviewState.includes('openLivePreview'));
  assert.ok(livePreviewState.includes('closeLivePreview'));
  assert.ok(runtimeReactions.includes("window.addEventListener('runtime:event'"));
  assert.ok(runtimeReactions.includes("evt.type === 'recording.complete'"));
  assert.ok(runtimeReactions.includes("evt.type === 'live.offer'"));
  assert.ok(explorer.includes('useRuntimeController'));
  assert.ok(explorer.includes('useLivePreviewState'));
  assert.ok(explorer.includes('useRuntimeEventReactions'));
  assert.ok(explorer.includes('LivePreview'));
  assert.ok(streamHub.includes('const streams = new Map<string, MediaStream>()'));
  assert.ok(livePreview.includes('postLiveViewerAnswer'));
});

test('pending artifact controller extraction wiring remains intact', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const pendingControllerPath = path.join(packageRoot, 'src', 'pending', 'usePendingArtifactController.ts');
  const pendingArtifactsPath = path.join(packageRoot, 'src', 'pending', 'pendingArtifacts.ts');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const pendingController = fs.readFileSync(pendingControllerPath, 'utf8');
  const pendingArtifacts = fs.readFileSync(pendingArtifactsPath, 'utf8');

  assert.ok(explorer.includes('usePendingArtifactController'));
  assert.ok(pendingController.includes("kind: 'pending-recording'"));
  assert.ok(pendingController.includes('pendingArtifactFromCompose'));
  assert.ok(pendingController.includes('pendingArtifactFromRecording'));
  assert.ok(pendingController.includes('usePendingComposeJobs'));
  assert.ok(pendingController.includes('useRecordingSessions'));
  assert.ok(pendingArtifacts.includes('sortPendingArtifactsForDisplay'));
});

test('asset render orchestration extraction wiring remains intact', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const renderedEntriesPath = path.join(packageRoot, 'src', 'render', 'renderedEntries.ts');
  const renderControllerPath = path.join(packageRoot, 'src', 'render', 'useExplorerRenderController.ts');

  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const renderedEntries = fs.readFileSync(renderedEntriesPath, 'utf8');
  const renderController = fs.readFileSync(renderControllerPath, 'utf8');

  assert.ok(explorer.includes('useExplorerRenderController'));
  assert.ok(explorer.includes('usePendingArtifactController'));
  assert.ok(explorer.includes("import { AssetGrid } from './components/AssetGrid';"));
  assert.ok(explorer.includes("import { AssetList } from './components/AssetList';"));
  assert.ok(renderedEntries.includes('export function buildRenderedMediaEntries'));
  assert.ok(renderedEntries.includes('pending-artifact marker'));
  assert.ok(renderController.includes('buildRenderedMediaEntries'));
  assert.ok(renderController.includes('pendingComposeEntries'));
  assert.ok(renderController.includes('pendingRecordingEntries'));
});

test('selection and preview controller extraction wiring remains intact', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const selectionControllerPath = path.join(packageRoot, 'src', 'selection', 'useSelectionPreviewController.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const selectionController = fs.readFileSync(selectionControllerPath, 'utf8');

  assert.ok(explorer.includes('useSelectionPreviewController'));
  assert.ok(explorer.includes('selected,'));
  assert.ok(explorer.includes('activeAssetKey,'));
  assert.ok(explorer.includes('previewActivationKey,'));
  assert.ok(explorer.includes('reinforcedActiveKey,'));
  assert.ok(explorer.includes('selectAndActivateAssetKey(matchedKey);'));
  assert.ok(explorer.includes('Recording reconciled'));
  assert.ok(explorer.includes('onToggleSelected={toggleSelected}'));
  assert.ok(selectionController.includes('const [selected, setSelected] = useState<Set<string>>(new Set());'));
  assert.ok(selectionController.includes("const [activeAssetKey, setActiveAssetKey] = useState('');"));
  assert.ok(selectionController.includes("const [previewActivationKey, setPreviewActivationKey] = useState('');"));
  assert.ok(selectionController.includes("const [reinforcedActiveKey, setReinforcedActiveKey] = useState('');"));
  assert.ok(selectionController.includes('toggleSelectedByKey'));
  assert.ok(selectionController.includes('commitPreviewActivationKey'));
  assert.ok(selectionController.includes('selectAndActivateAssetKey'));
});

test('live recorder pipeline wiring captures peer stream and records durable assets', () => {
  const apiPath = path.join(packageRoot, 'src', 'api.ts');
  const recorderPath = path.join(packageRoot, 'src', 'components', 'LiveRecorder.tsx');
  const cardPath = path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx');
  const streamHubPath = path.join(packageRoot, 'src', 'runtime', 'StreamHub.ts');
  const api = fs.readFileSync(apiPath, 'utf8');
  const recorder = fs.readFileSync(recorderPath, 'utf8');
  const card = fs.readFileSync(cardPath, 'utf8');
  const streamHub = fs.readFileSync(streamHubPath, 'utf8');

  assert.ok(api.includes('uploadLiveSessionRecording'));
  assert.ok(api.includes('/api/live_sessions/'));
  assert.ok(api.includes('/recording/upload'));
  assert.ok(api.includes('sendLiveSessionControl'));
  assert.ok(recorder.includes('MediaRecorder'));
  assert.ok(recorder.includes('uploadLiveSessionRecording'));
  assert.ok(api.includes('/api/recordings'));
  assert.ok(card.includes('onRecordPeerSession'));
  assert.ok(card.includes('Record as asset'));
  assert.ok(card.includes('setPeerStream'));
  assert.ok(card.includes('StreamHub.set'));
  assert.ok(card.includes('StreamHub.delete'));
  assert.ok(streamHub.includes('const streams = new Map<string, MediaStream>()'));
  assert.ok(streamHub.includes('listSessionIds()'));
});

test('live recording provisional asset grid contract exists', () => {
  const liveRecordings = fs.readFileSync(path.join(packageRoot, 'src', 'liveRecordings.ts'), 'utf8');
  const pendingRecordingCard = fs.readFileSync(path.join(packageRoot, 'src', 'components', 'PendingRecordingAssetCard.tsx'), 'utf8');
  const assetGrid = fs.readFileSync(path.join(packageRoot, 'src', 'components', 'AssetGrid.tsx'), 'utf8');
  const explorerApp = fs.readFileSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx'), 'utf8');
  const liveSourceCard = fs.readFileSync(path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx'), 'utf8');

  assert.match(liveRecordings, /PendingRecordingAsset/);
  assert.match(liveRecordings, /pendingRecordingMatchesMediaItem/);
  assert.match(liveRecordings, /sortPendingRecordingAssetsForDisplay/);
  assert.match(pendingRecordingCard, /data-pending-recording-card/);
  assert.match(pendingRecordingCard, /RECORDING/);
  assert.match(pendingRecordingCard, /Open/);
  assert.match(assetGrid, /pending-recording/);
  assert.match(assetGrid, /PendingRecordingAssetCard/);
  assert.match(assetGrid, /onStopPendingRecording/);
  assert.match(explorerApp, /usePendingArtifactController/);
  assert.match(explorerApp, /recordPeerSession/);
  assert.doesNotMatch(explorerApp, /onRecordPeerStream/);
  assert.match(explorerApp, /pendingRecordingMatchesMediaItem/);
  assert.match(explorerApp, /Recording reconciled/);
  assert.match(explorerApp, /dismissPendingRecording/);
  assert.match(explorerApp, /selectAndActivateAssetKey\(matchedKey\)/);
  assert.match(liveSourceCard, /onRecordPeerSession/);
  assert.match(liveSourceCard, /setPeerStream/);
  assert.match(liveSourceCard, /Record as asset/);
});

test('connect device monitor shell wiring and contracts', () => {
  const shellPath = path.join(packageRoot, 'app', 'connect', 'device', 'DeviceMonitorShell.tsx');
  const pagePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const cssPath = path.join(packageRoot, 'app', 'connect', 'device', 'device.css');
  const previewPath = path.join(packageRoot, 'app', 'connect', 'device', 'FullscreenDevicePreview.tsx');
  const hooksPath = path.join(packageRoot, 'app', 'connect', 'device', 'deviceMonitorHooks.ts');

  assert.ok(fs.existsSync(pagePath));
  assert.ok(fs.existsSync(previewPath));
  assert.ok(fs.existsSync(shellPath));
  const shell = fs.readFileSync(shellPath, 'utf8');
  const page = fs.readFileSync(pagePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const preview = fs.readFileSync(previewPath, 'utf8');
  const hooks = fs.readFileSync(hooksPath, 'utf8');
  const pickerPath = path.join(packageRoot, 'app', 'connect', 'device', 'DevicePickerSheet.tsx');
  const picker = fs.readFileSync(pickerPath, 'utf8');

  const liveSessionPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSession.ts');
  const liveSession = fs.readFileSync(liveSessionPath, 'utf8');

  const connectPagePath = path.join(packageRoot, 'app', 'connect', 'device', 'ConnectDevicePage.tsx');
  const broadcastSessionPath = path.join(packageRoot, 'app', 'connect', 'device', 'broadcastSession.ts');
  const liveBroadcastAlignmentPath = path.join(packageRoot, 'app', 'connect', 'device', 'liveBroadcastAlignment.ts');
  const cameraSessionPath = path.join(packageRoot, 'app', 'connect', 'device', 'cameraSession.ts');
  const useCameraSessionPath = path.join(packageRoot, 'app', 'connect', 'device', 'useCameraSession.ts');
  const connectPage = fs.readFileSync(connectPagePath, 'utf8');
  const cameraSession = fs.readFileSync(cameraSessionPath, 'utf8');
  const useCameraSession = fs.readFileSync(useCameraSessionPath, 'utf8');
  const broadcastSession = fs.readFileSync(broadcastSessionPath, 'utf8');
  const liveBroadcastAlignment = fs.readFileSync(liveBroadcastAlignmentPath, 'utf8');

  assert.ok(page.includes("import DeviceMonitorShell from './DeviceMonitorShell'"));
  assert.ok(page.includes("useState<'local' | 'remote'>('local')"));
  assert.ok(shell.includes('FullscreenPreview · ThatDAMToolbox'));
  assert.ok(css.includes('.device-monitor-shell'));
  assert.ok(css.includes('.device-monitor-topbar'));
  assert.ok(css.includes('.device-monitor-footer'));
  assert.ok(preview.includes('device-monitor-content'));
  assert.ok(page.includes('publishLiveSignalOffer'));
  assert.ok(page.includes('publishLiveSignalIce'));
  assert.ok(hooks.includes('Array.isArray(payload)'));
  assert.ok(hooks.includes('enumerateDevices'));
  assert.ok(liveSession.includes('options?: PreviewStartOptions'));
  assert.ok(liveSession.includes('old.getTracks().forEach((t) => t.stop())'));
  assert.ok(liveSession.includes("sourceKind === 'camera' && !hasExternalStream"));
  assert.ok(liveSession.includes('if (!hasExternalStream) {'));
  assert.ok(liveSession.includes('deviceId: { exact: options.deviceId }'));
  assert.ok(page.includes('camera.selectedDeviceId'));
  assert.ok(page.includes('const handleStartBroadcast = async () => {'));
  assert.ok(page.includes('const publishPeerOffer = async (sessionRecord'));
  assert.ok(page.includes("import { ensureLiveBroadcastAlignment } from './liveBroadcastAlignment'"));
  assert.ok(!page.includes('crypto.randomUUID()'));
  assert.ok(page.includes('await startCamera({'));
  assert.ok(page.includes("await startPreview('camera', { stream, deviceId: camera.selectedDeviceId ?? undefined })"));
  assert.ok(page.includes('publishLiveSignalOffer(sessionId'));
  assert.ok(page.includes('ensureLiveBroadcastAlignment({ api, sessionId, nodeId: nodeId ||'));
  assert.ok(page.includes('const handleUseSelectedLocalDevice = async () => {'));
  assert.ok(preview.includes('const { devices: hookLocalDevices'));
  assert.ok(preview.includes("useRemoteCameras({ mode, remotePickerOpen: pickerOpen && mode === 'remote' })"));
  assert.ok(preview.includes('Array.isArray(localDevices) ? localDevices : []'));
  assert.ok(preview.includes('localDevices={safeLocalDevices}'));
  assert.ok(!liveSession.includes('Confirm camera permissions and use a secure (HTTPS) origin on iOS Safari.'));
  assert.ok(css.includes('.picker-backdrop'));
  assert.ok(css.includes('z-index: 90;'));
  assert.ok(css.includes('.modal-backdrop'));
  assert.ok(css.includes('z-index: 110;'));

  assert.ok(fs.existsSync(cameraSessionPath));
  assert.ok(fs.existsSync(useCameraSessionPath));
  assert.ok(cameraSession.includes('normalizeCameraError'));
  assert.ok(cameraSession.includes('describeCameraError'));
  assert.ok(useCameraSession.includes('getUserMedia'));
  assert.ok(useCameraSession.includes('old.getTracks().forEach((t) => t.stop())'));
  assert.ok(useCameraSession.includes('facingMode'));
  assert.ok(connectPage.includes("export { default } from './page';"));
  assert.ok(page.includes("if (process.env.NODE_ENV !== 'production')"));
  assert.ok(liveSession.includes('stream?: MediaStream'));
  assert.ok(liveSession.includes('hasExternalStream'));
  assert.ok(liveSession.includes('videoRef.current.srcObject = stream;'));
  assert.ok(preview.includes('cameraState'));

  assert.ok(picker.includes('Use selected'));
  assert.ok(picker.includes('onUseSelectedLocalDevice'));
  assert.ok(shell.includes("onClick={() => onModeChange('local')"));
  assert.ok(shell.includes("onClick={() => onModeChange('remote')"));
  assert.ok(preview.includes('Start Live Broadcast'));
  assert.ok(preview.includes('onClick={() => { void onEnableCamera(); }}'));
  assert.ok(preview.includes('onClick={() => { void onStartBroadcast(); }}'));
  assert.ok(preview.includes('Camera source'));
  assert.ok(preview.includes('Camera ready'));
  assert.ok(preview.includes('Pick Camera'));
  assert.ok(preview.includes('explorer-monitor-open-picker'));
  assert.ok(page.includes('mode={mode}'));
  assert.ok(page.includes('onModeChange={setMode}'));
  assert.ok(page.includes('videoRef.current.srcObject = stream;'));
  assert.ok(page.includes('nodeHeartbeatTimerRef.current = window.setInterval'));
  assert.ok(page.includes('const nodeHeartbeatTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);'));
  assert.ok(page.includes('const clearNodeHeartbeatTimer = () => {'));
  assert.ok(page.includes('clearNodeHeartbeatTimer();'));
  assert.ok(page.includes('const resolveActiveCameraStream = (): MediaStream | null => {'));
  assert.ok(page.includes('const getUsableCameraStream = resolveActiveCameraStream;'));
  assert.ok(page.includes('const stream = await ensureCameraStreamReady();'));
  assert.ok(page.includes("lastFailureReason: 'camera_stream_not_ready'"));
  assert.ok(!page.includes("throw new Error('camera_stream_not_ready')"));
  assert.ok(!page.includes('getStoredNodeToken(nodeId)'));
  assert.ok(!page.includes('Authorization: `Bearer'));
  assert.ok(page.includes('const syncResult = await syncBrowserRuntimeNode(nodeId);'));
  assert.ok(page.includes("source: existingStream ? 'existing-camera-session' : 'new-camera-session'"));
  assert.ok(page.includes("appendTrace('heartbeat:skipped-no-token')"));
  assert.ok(page.includes('void syncBrowserRuntimeNode(nodeId).then((result) => {'));
  assert.ok(!page.includes('const nodes = await api.listNodes();'));
  assert.ok(!page.includes('await registerBrowserRuntime({'));
  assert.ok(page.includes('const syncResult = await syncBrowserRuntimeNode(nodeId);'));
  assert.ok(!page.includes('await api.heartbeatNode({ nodeId, token: tokenInfo.token });'));
  assert.ok(hooks.includes('shouldPollDeviceControlPlane'));
  assert.ok(hooks.includes('if (!shouldPollLiveSurface()) return;'));
  assert.ok(hooks.includes('}, 10000);'));
  assert.ok(liveSession.includes('Promise<LiveSessionRecord | null>'));
  assert.ok(liveSession.includes('return nextSession;'));
  assert.ok(liveSession.includes('return null;'));
  assert.ok(useCameraSession.includes('if (process.env.NODE_ENV !== \'production\')'));
  assert.ok(useCameraSession.includes('return stream;'));
  assert.ok(useCameraSession.includes('return null;'));
  assert.ok(preview.includes('const [mounted, setMounted] = useState(false);'));
  assert.ok(preview.includes('setControlsOpen((current) => {'));
  assert.ok(preview.includes('return current === shouldControlsBeOpen ? current : shouldControlsBeOpen;'));
  assert.ok(preview.includes('const cameraStatus = cameraState?.status || \'idle\';'));
  assert.ok(preview.includes('}, [mode, hasCameraReady, cameraStatus]);'));
  assert.ok(!preview.includes('}, [cameraState, mode]);'));
  assert.ok(preview.includes('disabled={!mounted ? false : !canUseCamera}'));
  assert.ok(preview.includes('useEffect(() => {\n    setMounted(true);'));
  assert.ok(!preview.includes(');\n}\n  useEffect(() => {\n    setMounted(true);'));
  assert.ok(picker.includes('Use selected'));
  assert.ok(!picker.includes('cameraSession.start'));
  assert.ok(picker.includes('Remote devices are other local capture nodes.'));
  assert.ok(broadcastSession.includes('export type BroadcastStage'));
  assert.ok(liveBroadcastAlignment.includes('session.session_id === input.sessionId') || liveBroadcastAlignment.includes('session_id === input.sessionId'));
  assert.ok(liveBroadcastAlignment.includes('match.node_id !== input.nodeId'));
  assert.ok(liveBroadcastAlignment.includes('!match.has_offer'));
});

test('connect device route keeps canonical shim and deterministic broadcast wiring', () => {
  const shimPath = path.join(packageRoot, 'app', 'connect', 'device', 'ConnectDevicePage.tsx');
  const pagePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const pickerPath = path.join(packageRoot, 'app', 'connect', 'device', 'DevicePickerSheet.tsx');
  const liveHookPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSession.ts');
  const cameraHookPath = path.join(packageRoot, 'app', 'connect', 'device', 'useCameraSession.ts');
  const shim = fs.readFileSync(shimPath, 'utf8');
  const page = fs.readFileSync(pagePath, 'utf8');
  const picker = fs.readFileSync(pickerPath, 'utf8');
  const liveHook = fs.readFileSync(liveHookPath, 'utf8');
  const cameraHook = fs.readFileSync(cameraHookPath, 'utf8');

  assert.ok(shim.includes("export { default } from './page';"));
  assert.ok(page.includes('const handleStartBroadcast = async () => {'));
  assert.ok(page.includes('const publishPeerOffer = async (sessionRecord: { session_id: string }, stream: MediaStream) => {'));
  assert.ok(page.includes('watchLiveSession('));
  assert.ok(page.includes("startPreview('camera', { stream"));
  assert.ok(page.includes('await publishPeerOffer(nextSession, stream);'));
  assert.ok(page.includes('syncBrowserRuntimeNode(nodeId)'));
  assert.ok(page.includes("setHeartbeatState('auth_failed')"));
  assert.ok(!page.includes("stopCamera(); setHeartbeatState('auth_failed')"));
  assert.ok(page.includes('const markLiveFlowStep = useCallback((patch: Record<string, unknown>) => {'));
  assert.ok(page.includes('deviceBroadcastRequestedAt'));
  assert.ok(page.includes('deviceCameraReadyAt'));
  assert.ok(page.includes('deviceBroadcastPublishedAt'));
  assert.ok(!page.includes('crypto.randomUUID()'));
  assert.ok(page.includes('ensureLiveBroadcastAlignment'));
  assert.ok(!page.includes('navigator.mediaDevices.getUserMedia'));
  assert.ok(picker.includes('other local capture nodes'));
  assert.ok(liveHook.includes('const startPreview = useCallback(async (sourceKind: LiveSourceKind, options?: PreviewStartOptions): Promise<LiveSessionRecord | null>'));
  assert.ok(liveHook.includes('const stream = options?.stream ?? ('));
  assert.ok(cameraHook.includes('navigator.mediaDevices.getUserMedia'));
});


test('connect device viewer attach path stays remote-only and avoids local camera reacquire', () => {
  const pagePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const page = fs.readFileSync(pagePath, 'utf8');
  const start = page.indexOf('async function watchLiveSession');
  const end = page.indexOf('const handleUseSelectedLocalDevice', start);
  assert.ok(start >= 0 && end > start);
  const watchBody = page.slice(start, end);
  assert.ok(watchBody.includes('new RTCPeerConnection()'));
  assert.ok(watchBody.includes('ontrack'));
  assert.ok(watchBody.includes('postLiveViewerAnswer'));
  assert.ok(watchBody.includes('postLiveViewerIce'));
  assert.ok(!watchBody.includes('startCamera('));
  assert.ok(!watchBody.includes('startPreview('));
  assert.ok(!watchBody.includes('getUserMedia'));
});

test('explorer pending artifact controller merges runtime assets into pending recording placeholders', () => {
  const pendingControllerPath = path.join(packageRoot, 'src', 'pending', 'usePendingArtifactController.ts');
  const recordingHookPath = path.join(packageRoot, 'src', 'hooks', 'useRecordingSessions.ts');
  const content = fs.readFileSync(pendingControllerPath, 'utf8');
  const recordingHook = fs.readFileSync(recordingHookPath, 'utf8');
  assert.ok(content.includes('listRuntimeAssets'));
  assert.ok(content.includes('runtimeAssetToPendingRecording'));
  assert.ok(content.includes("if (asset.kind !== 'recording') return null;"));
  assert.ok(!content.includes("asset.kind !== 'recording' && asset.kind !== 'live'"));
  assert.ok(content.includes("previewable: 'recording'"));
  assert.ok(content.includes("materializing: 'finalizing'"));
  assert.ok(content.includes("ready: 'saved'"));
  assert.ok(content.includes('activeRecordingIntentRef'));
  assert.ok(content.includes('enabled: activeRecordingIntentRef.current.size > 0 || runtimeRecordingAssets.length > 0'));
  assert.ok(content.includes('live-recording-failed-'));
  assert.ok(!content.includes("'live-recording-failed'"));
  assert.ok(content.includes('[...pendingRecordingAssets, ...runtimeRecordingAssets]'));
  assert.ok(content.includes('dedupePendingOverlayAssets'));
  assert.ok(content.includes('existingHasAssetUrl'));
  assert.ok(content.includes('Runtime assets are an overlay, not a replacement'));
  assert.ok(content.includes('if (!mounted || !assets) return;'));
  assert.ok(recordingHook.includes('enabled?: boolean;'));
  assert.ok(recordingHook.includes("if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;"));
  assert.ok(recordingHook.includes('Polling failures are non-fatal'));
});


test('startup null diagnostics guard against null throws/rejections and SSE onerror remains non-throwing', () => {
  const appPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const runtimeEventsPath = path.join(packageRoot, 'src', 'hooks', 'useRuntimeEvents.ts');
  const sourceControlPath = path.join(packageRoot, 'src', 'hooks', 'useSourceControlData.ts');
  const webRtcPath = path.join(packageRoot, 'src', 'hooks', 'useWebRtcLiveSessions.ts');
  const liveSessionsPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSessions.ts');
  const apiPath = path.join(packageRoot, 'src', 'api.ts');

  const app = fs.readFileSync(appPath, 'utf8');
  const runtimeEvents = fs.readFileSync(runtimeEventsPath, 'utf8');
  const sourceControl = fs.readFileSync(sourceControlPath, 'utf8');
  const webRtc = fs.readFileSync(webRtcPath, 'utf8');
  const liveSessions = fs.readFileSync(liveSessionsPath, 'utf8');
  const api = fs.readFileSync(apiPath, 'utf8');
  const identityPath = path.join(packageRoot, 'src', 'lib', 'browserRuntimeIdentity.ts');
  const identity = fs.readFileSync(identityPath, 'utf8');

  const corpus = [app, runtimeEvents, sourceControl, webRtc, liveSessions, api].join('\n');
  assert.ok(!corpus.includes('throw null'));
  assert.ok(!corpus.includes('Promise.reject(null)'));
  assert.ok(!corpus.includes('reject(null)'));
  assert.ok(api.includes('buildNodeAuthHeaders({ nodeId, token'));
  assert.ok(api.includes('buildNodeAuthHeaders({ nodeId, token'));
  assert.ok(!api.includes('token_preview'));
  assert.ok(identity.includes('window.open(url, windowName)'));
  assert.ok(identity.includes('CONNECT_DEVICE_WINDOW_NAME'));
  assert.ok(identity.includes('EXPLORER_WINDOW_NAME'));
  assert.ok(identity.includes('export const resolveBrowserRuntimeAuth = (nodeId: string): BrowserRuntimeAuth | null => {'));
  assert.ok(identity.includes('export const buildNodeAuthHeaders = (auth: BrowserRuntimeAuth): Record<string, string> => ({'));
  assert.ok(identity.includes('export const heartbeatBrowserRuntime = async (nodeId: string): Promise<BrowserRuntimeHeartbeatResult> => {'));
  assert.ok(identity.includes('export const registerBrowserRuntime = async (payload: Record<string, unknown>): Promise<{ nodeId: string; token?: string }> => {'));
  assert.ok(identity.includes('export const syncBrowserRuntimeNode = async (nodeId: string): Promise<BrowserRuntimeHeartbeatResult> => {'));
  assert.ok(identity.includes("const listed = await fetch('/api/nodes'"));
  assert.ok(identity.includes('if (!exists) {'));
  assert.ok(identity.includes("await registerBrowserRuntime({"));
  assert.ok(identity.includes("publishBrowserRuntimeDebug({ lastSyncPhase: 'heartbeat', lastNodeId: nodeId });"));
  assert.ok(identity.includes("publishBrowserRuntimeDebug({ lastRegisterStatus: response.status"));
  assert.ok(identity.includes("if (!token || token.includes('preview')) return null;"));

  assert.ok(app.includes("if (process.env.NODE_ENV === 'production') return;"));
  assert.ok(app.includes("window.addEventListener('error', onWindowErrorDiagnostic);"));
  assert.ok(app.includes("window.addEventListener('unhandledrejection', onWindowUnhandledRejectionDiagnostic);"));
  assert.ok(app.includes("const isOpaqueScriptError = event.message === 'Script error.' && !event.filename && event.lineno === 0;"));
  assert.ok(app.includes('if (isOpaqueScriptError) return;'));
  assert.ok(app.includes("console.warn('[window:error]'"));
  assert.ok(app.includes("console.warn('[window:unhandledrejection]'"));

  assert.ok(runtimeEvents.includes('es.onerror = (event) => {'));
  assert.ok(runtimeEvents.includes('if (es.readyState === EventSource.CONNECTING) {'));
  assert.ok(runtimeEvents.includes('eventStreamReconnecting: true'));
  assert.ok(runtimeEvents.includes('return;'));
  assert.ok(runtimeEvents.includes("if (process.env.NODE_ENV !== 'production' && closed) {"));
  assert.ok(runtimeEvents.includes('if (now - lastClosedErrorWarnAt < 10_000) return;'));
  assert.ok(runtimeEvents.includes('lastEventStreamErrorReason'));
  assert.ok(runtimeEvents.includes("console.warn('[runtime-events:error]'"));
  const sourceControlPanelsPath = path.join(packageRoot, 'src', 'source-control', 'SourceControlPanels.tsx');
  const livePanelPath = path.join(packageRoot, 'src', 'source-control', 'LiveDeviceInstancesPanel.tsx');
  const liveCardPath = path.join(packageRoot, 'src', 'source-control', 'LiveDeviceInstanceCard.tsx');
  const sourceControlPanels = fs.readFileSync(sourceControlPanelsPath, 'utf8');
  const livePanel = fs.readFileSync(livePanelPath, 'utf8');
  const liveCard = fs.readFileSync(liveCardPath, 'utf8');
  assert.ok(app.includes('__explorerLiveFlowDebug'));
  assert.ok(livePanel.includes('LIVE DEVICE INSTANCES'));
  assert.ok(liveCard.includes('auth_failed'));
  assert.ok(sourceControlPanels.includes('<details className=\"card runtime-surface-card\">'));
  assert.ok(app.includes('appliedLiveSessionUpdates'));
  assert.ok(!runtimeEvents.includes('es.onerror = (event) => {\n      throw'));
});

test('browser runtime client + webrtc explorer-device contract remains centralized and cohesive', () => {
  const identityPath = path.join(packageRoot, 'src', 'lib', 'browserRuntimeIdentity.ts');
  const pagePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const identity = fs.readFileSync(identityPath, 'utf8');
  const page = fs.readFileSync(pagePath, 'utf8');
  const explorer = fs.readFileSync(explorerPath, 'utf8');

  assert.ok(identity.includes('__browserRuntimeDebug'));
  assert.ok(identity.includes('lastHeartbeatStatus'));
  assert.ok(identity.includes('lastHeartbeatAt'));
  assert.ok(identity.includes('buildNodeAuthHeaders(auth)'));
  assert.ok(identity.includes("status: 'auth_failed' | 'unavailable'"));
  assert.ok(identity.includes("const status = res.status === 401 || res.status === 403 ? 'auth_failed' : 'unavailable';"));

  assert.ok(!page.includes('await registerBrowserRuntime({'));
  assert.ok(page.includes('const syncResult = await syncBrowserRuntimeNode(nodeId);'));
  assert.ok(page.includes('void syncBrowserRuntimeNode(nodeId).then((result) => {'));
  assert.ok(!page.includes('api.listNodes()'));
  assert.ok(!page.includes('getStoredNodeToken(nodeId)'));
  assert.ok(!page.includes('Authorization: `Bearer'));
  assert.ok(!page.includes("window.localStorage.getItem('explorer_capture_node_token')"));

  const sourceControlPanelsPath = path.join(packageRoot, 'src', 'source-control', 'SourceControlPanels.tsx');
  const buildLiveDeviceInstancesPath = path.join(packageRoot, 'src', 'source-control', 'buildLiveDeviceInstances.ts');
  const livePanelPath = path.join(packageRoot, 'src', 'source-control', 'LiveDeviceInstancesPanel.tsx');
  const liveCardPath = path.join(packageRoot, 'src', 'source-control', 'LiveDeviceInstanceCard.tsx');
  const canonicalCardPath = path.join(packageRoot, 'src', 'source-control', 'CanonicalSourceCard.tsx');
  const remoteCardPath = path.join(packageRoot, 'src', 'source-control', 'RemoteSourceSurfaceCard.tsx');
  const runtimeCardPath = path.join(packageRoot, 'src', 'source-control', 'RuntimeNodeCard.tsx');
  const sourceControlPanels = fs.readFileSync(sourceControlPanelsPath, 'utf8');
  const liveBuilder = fs.readFileSync(buildLiveDeviceInstancesPath, 'utf8');
  const sourceFiles = [
    sourceControlPanels,
    liveBuilder,
    fs.readFileSync(livePanelPath, 'utf8'),
    fs.readFileSync(liveCardPath, 'utf8'),
    fs.readFileSync(canonicalCardPath, 'utf8'),
    fs.readFileSync(remoteCardPath, 'utf8'),
    fs.readFileSync(runtimeCardPath, 'utf8'),
  ].join('\n');

  assert.ok(explorer.includes('SourceControlPanels'));
  assert.ok(!explorer.includes('LIVE DEVICE INSTANCES'));
  assert.ok(sourceControlPanels.includes('LiveDeviceInstancesPanel'));
  assert.ok(liveBuilder.includes('export function buildLiveDeviceInstances'));
  assert.ok(!sourceFiles.includes('fetch('));
  assert.ok(!sourceFiles.includes('createApiClient('));
  assert.ok(!sourceFiles.includes('localStorage'));
  assert.ok(!sourceFiles.includes('sessionStorage'));
});

test('live device builder supports offer/answer visibility from WebRtcLiveSession boolean flags', () => {
  const builderPath = path.join(packageRoot, 'src', 'source-control', 'buildLiveDeviceInstances.ts');
  const builder = fs.readFileSync(builderPath, 'utf8');
  assert.ok(builder.includes('has_offer'), 'builder must read has_offer from WebRtcLiveSession');
  assert.ok(builder.includes('has_answer'), 'builder must read has_answer from WebRtcLiveSession');
  assert.ok(builder.includes('WebRtcLiveSession'), 'builder must import WebRtcLiveSession type');
  assert.ok(builder.includes('watchLiveAvailable'));
});

test('watchLiveAvailable requires offer but not answer (viewer creates answer after clicking Watch Live)', () => {
  const builderPath = path.join(packageRoot, 'src', 'source-control', 'buildLiveDeviceInstances.ts');
  const builder = fs.readFileSync(builderPath, 'utf8');
  // Must not gate watchLiveAvailable on hasAnswer — the answer comes from the viewer after Watch Live is clicked
  assert.ok(!builder.includes('watchLiveAvailable = Boolean(existing.sessionId && existing.hasOffer && existing.hasAnswer)'),
    'watchLiveAvailable must not require hasAnswer');
  assert.ok(builder.includes('watchLiveAvailable') && builder.includes('hasOffer'),
    'watchLiveAvailable must still depend on hasOffer');
  // Must expose unavailableReason for diagnostic display
  assert.ok(builder.includes('unavailableReason'), 'builder must emit unavailableReason for UI feedback');
});

test('LiveDeviceInstanceCard shows session tag and unavailableReason when watch live not available', () => {
  const cardPath = path.join(packageRoot, 'src', 'source-control', 'LiveDeviceInstanceCard.tsx');
  const card = fs.readFileSync(cardPath, 'utf8');
  assert.ok(card.includes('session:'), 'card must show session:yes/no tag');
  assert.ok(card.includes('offer:'), 'card must show offer:yes/no tag');
  assert.ok(card.includes('answer:'), 'card must show answer:yes/no tag');
  assert.ok(card.includes('unavailableReason'), 'card must surface unavailableReason for diagnostic display');
});

test('connect/device page.tsx emits structured broadcast diagnostics on window.__connectDeviceBroadcastDebug', () => {
  const pagePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.ok(page.includes('__connectDeviceBroadcastDebug'), 'page must write structured broadcast diagnostics');
  assert.ok(page.includes('markBroadcastDebug'), 'page must call markBroadcastDebug helper');
  assert.ok(page.includes('offerCreated'), 'diagnostics must include offerCreated');
  assert.ok(page.includes('offerPosted'), 'diagnostics must include offerPosted');
  assert.ok(page.includes('videoTrackCount'), 'diagnostics must include videoTrackCount');
});

test('browser runtime identity owns stable explorer/device window names', () => {
  const identityPath = path.join(packageRoot, 'src', 'lib', 'browserRuntimeIdentity.ts');
  const source = fs.readFileSync(identityPath, 'utf8');
  assert.ok(source.includes("EXPLORER_WINDOW_NAME = 'thatdamtoolbox:explorer'"), 'EXPLORER_WINDOW_NAME must use colon namespace');
  assert.ok(source.includes("CONNECT_DEVICE_WINDOW_NAME = 'thatdamtoolbox:connect-device'"), 'CONNECT_DEVICE_WINDOW_NAME must use colon namespace');
  assert.ok(source.includes('window.open(url, windowName)'), 'must open named window via openNamedWindow');
  assert.ok(source.includes('registerWindowName'), 'must export registerWindowName');
  assert.ok(source.includes('subscribeBrowserRuntimeChannel'), 'must export subscribeBrowserRuntimeChannel');
  assert.ok(source.includes('requestExplorerRefresh'), 'must export requestExplorerRefresh');
  assert.ok(source.includes("type: 'open-request'"), 'must define open-request message type');
  assert.ok(source.includes('BrowserRuntimeUiMessage'), 'must export typed BrowserRuntimeUiMessage union');
  assert.ok(source.includes('getWindowNameForRole'), 'must export getWindowNameForRole helper');
});

test('explorer and device pages register stable tab roles on mount and focus', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const devicePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const device = fs.readFileSync(devicePath, 'utf8');
  assert.ok(explorer.includes("registerWindowName('explorer')"), 'Explorer must call registerWindowName on mount');
  assert.ok(explorer.includes('openDeviceTab'), 'Explorer must import and call openDeviceTab');
  assert.ok(device.includes("registerWindowName('device')"), 'Device must call registerWindowName on mount');
  assert.ok(device.includes('openExplorerTab'), 'Device must import openExplorerTab');
  assert.ok(device.includes('subscribeBrowserRuntimeChannel'), 'Device must subscribe to BroadcastChannel for open-request');
  assert.ok(device.includes("message.type === 'open-request'"), 'Device must handle open-request messages');
});


test('live session canonical selector rejects runtime overlays and preserves offered authority', () => {
  const contractPath = path.join(packageRoot, 'src', 'contracts', 'liveSessions.ts');
  const content = fs.readFileSync(contractPath, 'utf8');
  assert.ok(content.includes('export function selectPrimaryLiveSessionForNodeSource'));
  assert.ok(content.includes('export function selectPrimaryLiveSessionsByNodeSource'));
  assert.ok(content.includes("rejectedSessionIds.push({ sessionId, reason: 'runtime-event' })"));
  assert.ok(content.includes("'active-with-offer-and-answer'"));
  assert.ok(content.includes("'active-with-offer'"));
  assert.ok(content.includes("'active-no-offer'"));
  assert.ok(content.includes("'newest-non-ended'"));
  assert.ok(content.includes('isSessionSuperseded(session)'));
  assert.ok(content.includes('hasWebRtcSessionShape'));
  assert.ok(content.includes("typeof record.has_offer === 'boolean'"));
  assert.ok(content.includes('FAILED_LIVE_SESSION_STATES'));
  assert.ok(content.includes('candidates.sort'));
});

test('live panels and device instances share canonical session selection', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const deviceInstancesPath = path.join(packageRoot, 'src', 'source-control', 'buildLiveDeviceInstances.ts');
  const webRtcHookPath = path.join(packageRoot, 'src', 'hooks', 'useWebRtcLiveSessions.ts');
  const liveHookPath = path.join(packageRoot, 'src', 'hooks', 'useLiveSessions.ts');
  const explorer = fs.readFileSync(explorerPath, 'utf8');
  const deviceInstances = fs.readFileSync(deviceInstancesPath, 'utf8');
  const webRtcHook = fs.readFileSync(webRtcHookPath, 'utf8');
  const liveHook = fs.readFileSync(liveHookPath, 'utf8');
  assert.ok(explorer.includes('selectPrimaryLiveSessionsByNodeSource<LiveSession>'));
  assert.ok(explorer.includes('selectedPrimaryByNodeSource'));
  assert.ok(explorer.includes('renderedPrimarySessionIds: renderedSessionIds'));
  assert.ok(explorer.includes('viewerActorBySessionId'));
  assert.ok(deviceInstances.includes('selectPrimaryLiveSessionsByNodeSource<WebRtcLiveSession>(liveSessions)'));
  assert.ok(webRtcHook.includes('primarySelectionByNodeSource'));
  assert.ok(liveHook.includes('primarySelectionByNodeSource'));
});

test('LiveSourceCard viewer actor is keyed and does not regress to waiting after answer confirmation', () => {
  const cardPath = path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx');
  const content = fs.readFileSync(cardPath, 'utf8');
  assert.ok(content.includes('const viewerActorKey = `${session.session_id}::${viewerId}::${peerRetryToken}`'));
  assert.ok(content.includes('data-viewer-actor-key={viewerActorKey}'));
  assert.ok(content.includes('stickyOfferSeenRef'));
  assert.ok(content.includes("lastStableStateRef.current !== 'answer_confirmed'"));
  assert.ok(content.includes('onRemoteStreamRef.current?.'));
  assert.ok(content.includes('onStaleSessionRef.current?.'));
  assert.ok(content.includes("}, [api, isActive, peerEnabled, peerRetryToken, session.session_id])"));
  assert.ok(content.includes("publishViewerState('answer_confirmed', 'answer_confirmed', { signaling: 'answer_confirmed', media: 'waiting_for_track' })"));
  assert.ok(content.includes('signalingStatus'));
  assert.ok(content.includes('mediaStatus'));
  assert.ok(content.includes('playbackStatus'));
  assert.ok(content.includes('iceStatus'));
  assert.ok(content.includes("'answer confirmed, waiting for media track'"));
});


test('Safari WebRTC playback boundary preserves srcObject and samples RTP stats', () => {
  const cardPath = path.join(packageRoot, 'src', 'components', 'LiveSourceCard.tsx');
  const devicePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const card = fs.readFileSync(cardPath, 'utf8');
  const device = fs.readFileSync(devicePath, 'utf8');

  assert.ok(card.includes('attachRemoteStreamToVideo'));
  assert.ok(card.includes('existingStreamId !== stream.id'));
  assert.ok(card.includes("video.setAttribute('playsinline', 'true')"));
  assert.ok(card.includes('lastSrcObjectAssignedAt'));
  assert.ok(!card.includes('.load()'));
  assert.ok(card.includes('activePeer.getStats()'));
  for (const field of [
    'inboundVideoBytesReceived',
    'inboundVideoPacketsReceived',
    'inboundVideoPacketsLost',
    'inboundVideoFramesDecoded',
    'inboundVideoFramesReceived',
    'inboundVideoFrameWidth',
    'inboundVideoFrameHeight',
    'inboundVideoFramesPerSecond',
    'lastInboundVideoStatsAt',
    'videoSrcObjectStreamId',
    'remoteVideoTrackReadyState',
    'remoteVideoTrackMuted',
    'remoteVideoTrackEnabled',
    'mediaFailureClass',
  ]) {
    assert.ok(card.includes(field), `LiveSourceCard missing ${field}`);
  }
  for (const marker of [
    'track_attached_but_no_rtp',
    'rtp_receiving_but_no_frames_decoded',
    'frames_decoded_but_video_play_rejected',
    'video_play_interrupted_by_srcobject_reset',
    'frames_rendering',
  ]) {
    assert.ok(card.includes(marker), `LiveSourceCard missing ${marker}`);
  }
  assert.ok(card.includes('video_playback_interrupted'));
  assert.ok(card.includes('video_playback_blocked'));
  assert.ok(card.includes('Tap to play live stream'));
  assert.ok(card.includes('Safari interrupted playback, tap to retry'));
  assert.ok(!card.includes('publisher_failed'));

  assert.ok(device.includes('samplePublisherOutboundRtpStats'));
  assert.ok(device.includes('outboundVideoBytesSent'));
  assert.ok(device.includes('outboundVideoFramesEncoded'));
  assert.ok(device.includes('publisherMediaFailureClass'));
  assert.ok(device.includes('connected_but_no_outbound_rtp'));
  assert.ok(device.includes('outbound_rtp_flowing'));
  assert.ok(device.includes('local_track_not_live'));
  assert.ok(device.includes('replaceTrack(track)'));
  assert.ok(!device.includes('publisher_failed'));
});

test('device publisher peer is session-owned and republish is explicit', () => {
  const devicePath = path.join(packageRoot, 'app', 'connect', 'device', 'page.tsx');
  const content = fs.readFileSync(devicePath, 'utf8');
  assert.ok(content.includes('publisherActorKey'));
  assert.ok(content.includes('publisherActorCreatedAtRef'));
  assert.ok(content.includes("restartReason: 'publisher-already-answer-applied'"));
  assert.ok(content.includes("restartReason: 'republish-current-session-before-answer'"));
  assert.ok(content.includes('const existingPublisherSession = activeBroadcastSessionRef.current || activeBroadcastSession || session;'));
  assert.ok(content.includes("'reused_current_session'"));
  assert.ok(content.includes("'explicit-republish-required'"));
  assert.ok(content.includes('peerClosedBy'));
  assert.ok(content.includes('handleStopBroadcast'));
  assert.ok(content.includes('offerPublished: true'));
  assert.ok(content.includes('answerApplied: true'));
});
