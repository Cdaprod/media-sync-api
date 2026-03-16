import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

const moduleCache = new Map();
const resolveModulePath = (baseDir, specifier) => {
  if (specifier.startsWith('.')) {
    if (specifier.endsWith('.ts') || specifier.endsWith('.tsx')) return path.resolve(baseDir, specifier);
    return path.resolve(baseDir, `${specifier}.ts`);
  }
  throw new Error(`Unsupported import: ${specifier}`);
};

const loadTsModule = (filePath) => {
  if (moduleCache.has(filePath)) return moduleCache.get(filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      jsx: ts.JsxEmit.React,
    },
    fileName: filePath,
  });
  const module = { exports: {} };
  const dirname = path.dirname(filePath);
  const require = (specifier) => {
    if (specifier === 'react') return {};
    const resolved = resolveModulePath(dirname, specifier);
    return loadTsModule(resolved);
  };
  const wrapped = new Function('exports', 'require', 'module', '__filename', '__dirname', output.outputText);
  wrapped(module.exports, require, module, filePath, dirname);
  moduleCache.set(filePath, module.exports);
  return module.exports;
};

test('preview drawer reducer resets and toggles tag panel by focus state', () => {
  const explorer = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));

  const opened = explorer.reducePreviewDrawerState(
    { inspectorOpen: false, drawerTagPanelOpen: true },
    'open',
    { hasFocused: true },
  );
  assert.deepEqual(opened, { inspectorOpen: true, drawerTagPanelOpen: false });

  const toggled = explorer.reducePreviewDrawerState(
    { inspectorOpen: true, drawerTagPanelOpen: false },
    'toggle_tag_panel',
    { hasFocused: true },
  );
  assert.deepEqual(toggled, { inspectorOpen: true, drawerTagPanelOpen: true });

  const blockedToggle = explorer.reducePreviewDrawerState(
    { inspectorOpen: true, drawerTagPanelOpen: true },
    'toggle_tag_panel',
    { hasFocused: false },
  );
  assert.deepEqual(blockedToggle, { inspectorOpen: true, drawerTagPanelOpen: false });

  const closed = explorer.reducePreviewDrawerState(
    { inspectorOpen: true, drawerTagPanelOpen: true },
    'close',
    { hasFocused: true },
  );
  assert.deepEqual(closed, { inspectorOpen: false, drawerTagPanelOpen: false });
});

test('preview drawer action state reflects focus, stream, project, and integration availability', () => {
  const explorer = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));

  const enabled = explorer.getPreviewDrawerActionState({
    hasFocused: true,
    activeProject: true,
    isFocusedSelected: false,
    hasStreamUrl: true,
    canUseObs: true,
    canUseProgramMonitor: true,
  });
  assert.equal(enabled.canPlay, true);
  assert.equal(enabled.canCopyStream, true);
  assert.equal(enabled.canSendObs, true);
  assert.equal(enabled.canProgramMonitor, true);
  assert.equal(enabled.canSelectToggle, true);
  assert.equal(enabled.canDelete, true);

  const disabled = explorer.getPreviewDrawerActionState({
    hasFocused: false,
    activeProject: false,
    isFocusedSelected: false,
    hasStreamUrl: false,
    canUseObs: false,
    canUseProgramMonitor: false,
  });
  assert.equal(disabled.canPlay, false);
  assert.equal(disabled.canCopyStream, false);
  assert.equal(disabled.canSendObs, false);
  assert.equal(disabled.canProgramMonitor, false);
  assert.equal(disabled.canSelectToggle, false);
  assert.equal(disabled.canDelete, false);
});

test('optional integration availability helpers report unavailable browser contexts', () => {
  const utils = loadTsModule(path.join(packageRoot, 'src', 'utils.ts'));

  assert.equal(utils.canUseProgramMonitorIntegration(undefined), false);
  assert.equal(utils.canUseProgramMonitorIntegration({}), false);
  assert.equal(utils.canUseProgramMonitorIntegration({ open: () => ({}) }), true);

  assert.equal(utils.canUseObsIntegration(undefined), false);
  assert.equal(utils.canUseObsIntegration({}), false);
  assert.equal(utils.canUseObsIntegration({ document: { createElement: () => ({}) } }), true);
});


test('preview drawer action visibility follows item kind for play affordance', () => {
  const explorer = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));

  assert.equal(explorer.getPreviewDrawerActionVisibility('video').showPlay, true);
  assert.equal(explorer.getPreviewDrawerActionVisibility('audio').showPlay, true);
  assert.equal(explorer.getPreviewDrawerActionVisibility('image').showPlay, false);
  assert.equal(explorer.getPreviewDrawerActionVisibility('other').showPlay, false);
  assert.equal(explorer.getPreviewDrawerActionVisibility(null).showPlay, false);
});

test('preview action constants expose stable drawer action contract', () => {
  const explorer = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));
  assert.equal(explorer.PREVIEW_ACTIONS.play, 'play');
  assert.equal(explorer.PREVIEW_ACTIONS.copy, 'copy');
  assert.equal(explorer.PREVIEW_ACTIONS.tag, 'tag');
  assert.equal(explorer.PREVIEW_ACTIONS.obs, 'obs');
  assert.equal(explorer.PREVIEW_ACTIONS.delete, 'delete');
  assert.equal(explorer.PREVIEW_ACTIONS.compose, 'compose');
});
