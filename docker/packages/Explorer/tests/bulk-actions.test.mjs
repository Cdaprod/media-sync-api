import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('bulk api client preserves ordered mixed-project refs for delete', async () => {
  const apiModule = loadTsModule(path.join(packageRoot, 'src', 'api.ts'));
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      async json() {
        return { status: 'ok', deleted: 2 };
      },
    };
  };

  const client = apiModule.createApiClient('');
  const assets = [
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/a.mov' },
    { source: 'nas-b', project: 'P2-B', relative_path: 'ingest/originals/b.mov' },
  ];
  await client.bulkDeleteAssets(assets);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/assets/bulk/delete');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.assets, assets);
});

test('bulk api client routes single-project move payload shape', async () => {
  const apiModule = loadTsModule(path.join(packageRoot, 'src', 'api.ts'));
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      async json() {
        return { status: 'ok', moved: 1 };
      },
    };
  };

  const client = apiModule.createApiClient('');
  const assets = [{ source: 'primary', project: 'P3-C', relative_path: 'ingest/originals/c.mov' }];
  await client.bulkMoveAssets(assets, 'P4-D', 'primary');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/assets/bulk/move');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body, {
    assets,
    target_project: 'P4-D',
    target_source: 'primary',
  });
});

test('explorer bulk actions include explicit empty-selection guardrails and api routing', () => {
  const explorerPath = path.join(packageRoot, 'src', 'ExplorerApp.tsx');
  const content = fs.readFileSync(explorerPath, 'utf8');
  assert.match(content, /if \(!assets\.length\) \{\s*addToast\('warn', 'Delete', 'Select one or more clips'\)/);
  assert.match(content, /if \(!assets\.length\) \{\s*addToast\('warn', 'Move', 'Select one or more clips'\)/);
  assert.match(content, /if \(!assets\.length\) \{\s*addToast\('warn', 'Compose', 'Select one or more video clips'\)/);
  assert.ok(content.includes('api.bulkDeleteAssets'));
  assert.ok(content.includes('api.bulkTagAssets'));
  assert.ok(content.includes('api.bulkMoveAssets'));
  assert.ok(content.includes('api.bulkComposeAssets'));
  assert.ok(content.includes('mapOrderedAssetRefs('));
});


test('bulk api client preserves ordered refs for compose payload', async () => {
  const apiModule = loadTsModule(path.join(packageRoot, 'src', 'api.ts'));
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      async json() {
        return { status: 'ok', path: 'exports/compose.mp4' };
      },
    };
  };

  const client = apiModule.createApiClient('');
  const assets = [
    { source: 'primary', project: 'P2-B', relative_path: 'ingest/originals/02.mov' },
    { source: 'primary', project: 'P2-B', relative_path: 'ingest/originals/01.mov' },
  ];
  await client.bulkComposeAssets(assets, 'P2-B', 'timeline.mp4', { outputSource: 'primary' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/assets/bulk/compose');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.assets, assets);
  assert.equal(body.output_project, 'P2-B');
  assert.equal(body.output_name, 'timeline.mp4');
});

test('compose helper excludes non-video selections and keeps deterministic order', () => {
  const explorerModule = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));
  const selectedItems = [
    { project_name: 'P1-A', project_source: 'primary', relative_path: 'ingest/originals/clip-b.mov', kind: 'video' },
    { project_name: 'P1-A', project_source: 'primary', relative_path: 'ingest/originals/frame.jpg', kind: 'image' },
    { project_name: 'P1-A', project_source: 'primary', relative_path: 'ingest/originals/clip-a.mov', kind: 'video' },
  ];
  const refs = explorerModule.mapOrderedVideoAssetRefs(selectedItems, null);
  assert.deepEqual(refs, [
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/clip-b.mov' },
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/clip-a.mov' },
  ]);

  const content = fs.readFileSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx'), 'utf8');
  assert.ok(content.includes("disabled={!selectedVideoCount}"));
  assert.match(content, /addToast\('warn', 'Compose', 'Select one or more video clips'\)/);
});

test('compose success helpers expose scoped refresh and artifact details', () => {
  const explorerModule = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));
  assert.equal(explorerModule.getComposeRefreshScope({ name: 'P1', source: 'primary' }), 'project');
  assert.equal(explorerModule.getComposeRefreshScope(null), 'all');
  assert.equal(
    explorerModule.buildComposeArtifactSummary(
      { path: 'exports/final.mp4', output_project: 'P3-C', output_source: 'nas-b' },
      'fallback.mp4',
    ),
    'exports/final.mp4 (P3-C @ nas-b)',
  );

  const content = fs.readFileSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx'), 'utf8');
  assert.ok(content.includes('const refreshScope = getComposeRefreshScope(activeProject);'));
  assert.ok(content.includes("if (refreshScope === 'project') await loadMedia(activeProject);"));
  assert.ok(content.includes('else await loadAllMedia();'));
  assert.ok(content.includes('await loadProjects();'));
  assert.ok(content.includes("addToast('good', 'Compose', `Created ${buildComposeArtifactSummary(payload, outputName)}`)"));
});


test('buildSelectionAssetRefs preserves mixed-source and mixed-project refs', () => {
  const explorerModule = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));
  const selectedItems = [
    { project_name: 'P1-A', project_source: 'primary', relative_path: 'ingest/originals/a.mov', kind: 'video' },
    { project_name: 'P2-B', project_source: 'nas-b', relative_path: 'ingest/originals/a.mov', kind: 'video' },
  ];
  const refs = explorerModule.buildSelectionAssetRefs({ selectedItems, focusedItem: null });
  assert.deepEqual(refs, [
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/a.mov' },
    { source: 'nas-b', project: 'P2-B', relative_path: 'ingest/originals/a.mov' },
  ]);
});

test('buildSelectionAssetRefs keeps focused-request ordering for compose payloads', () => {
  const explorerModule = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));
  const selectedItems = [
    { project_name: 'P1-A', project_source: 'primary', relative_path: 'ingest/originals/2.mov', kind: 'video' },
    { project_name: 'P1-A', project_source: 'primary', relative_path: 'ingest/originals/1.mov', kind: 'video' },
  ];
  const focusedItem = { project_name: 'P3-C', project_source: 'nas-c', relative_path: 'ingest/originals/focus.mov', kind: 'video' };
  const refs = explorerModule.buildSelectionAssetRefs({
    selectedItems,
    focusedItem,
    requested: [
      { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/1.mov' },
      { source: 'nas-c', project: 'P3-C', relative_path: 'ingest/originals/focus.mov' },
    ],
    videosOnly: true,
  });
  assert.deepEqual(refs, [
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/1.mov' },
    { source: 'nas-c', project: 'P3-C', relative_path: 'ingest/originals/focus.mov' },
  ]);
});

test('buildSelectionAssetRefs guardrails return empty refs for invalid selections', () => {
  const explorerModule = loadTsModule(path.join(packageRoot, 'src', 'ExplorerApp.tsx'));
  const selectedItems = [
    { project_name: 'P1-A', project_source: 'primary', relative_path: '', kind: 'video' },
    { project_name: '', project_source: 'primary', relative_path: 'ingest/originals/a.mov', kind: 'video' },
  ];
  const refs = explorerModule.buildSelectionAssetRefs({ selectedItems, focusedItem: null });
  assert.deepEqual(refs, []);
});
