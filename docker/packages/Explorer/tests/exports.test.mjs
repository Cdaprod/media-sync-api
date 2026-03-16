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
  assert.ok(fs.existsSync(path.join(packageRoot, 'src', 'styles.css')));
});

test('standalone app entry exists', () => {
  assert.ok(fs.existsSync(path.join(packageRoot, 'app', 'page.tsx')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'app', 'layout.tsx')));
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
  const normalizedIndex = content.indexOf('const normalizedPreviewAsset = useMemo');
  assert.ok(resolveIndex >= 0);
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

test('all-project clicks still open the drawer without selection', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('assetSelectionKey'));
  assert.ok(content.includes('selectionEnabled'));
  assert.ok(content.includes('toggleSelected(item)'));
  assert.ok(content.includes('openDrawer(item)'));
});

test('compose action filters selected assets to videos', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes("selectionItems.filter((item) => guessKind(item) === 'video')"));
  assert.ok(content.includes('Compose supports video clips only'));
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
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.ok(content.includes('queueThumbLoads'));
  assert.ok(content.includes('data-thumb-url'));
  assert.ok(content.includes('THUMB_LOAD_TIMEOUT_MS'));
  assert.ok(content.includes('thumbState'));
  assert.ok(content.includes('project_source'));
});
