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
    const withExt = specifier.endsWith('.ts') ? specifier : `${specifier}.ts`;
    return path.resolve(baseDir, withExt);
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
    },
  });
  const module = { exports: {} };
  const dirname = path.dirname(filePath);
  const require = (specifier) => {
    const resolved = resolveModulePath(dirname, specifier);
    return loadTsModule(resolved);
  };
  const wrapped = new Function('exports', 'require', 'module', '__filename', '__dirname', output.outputText);
  wrapped(module.exports, require, module, filePath, dirname);
  moduleCache.set(filePath, module.exports);
  return module.exports;
};

const statePath = path.join(packageRoot, 'src', 'state.ts');

test('filterMedia composes query, type, selection, and untagged filters', () => {
  const { filterMedia, collectMediaMeta } = loadTsModule(statePath);
  const items = [
    { relative_path: 'A/video-one.mp4', size: 120, tags: ['hero'] },
    { relative_path: 'B/audio-one.mp3', size: 12 },
    { relative_path: 'B/image-one.jpg', size: 50 },
    { relative_path: 'C/overlay-one.mov', kind: 'overlay' },
  ];
  const meta = collectMediaMeta(items);
  const selected = new Set(['B/audio-one.mp3']);

  const queryFiltered = filterMedia(items, {
    query: 'image',
    type: 'all',
    selectedOnly: false,
    untaggedOnly: false,
    selected,
  }, meta);
  assert.equal(queryFiltered.length, 1);
  assert.equal(queryFiltered[0].relative_path, 'B/image-one.jpg');

  const typeFiltered = filterMedia(items, {
    query: '',
    type: 'overlay',
    selectedOnly: false,
    untaggedOnly: false,
    selected,
  }, meta);
  assert.equal(typeFiltered.length, 1);
  assert.equal(typeFiltered[0].relative_path, 'C/overlay-one.mov');

  const selectedOnly = filterMedia(items, {
    query: '',
    type: 'all',
    selectedOnly: true,
    untaggedOnly: false,
    selected,
  }, meta);
  assert.equal(selectedOnly.length, 1);
  assert.equal(selectedOnly[0].relative_path, 'B/audio-one.mp3');

  const untaggedOnly = filterMedia(items, {
    query: '',
    type: 'all',
    selectedOnly: false,
    untaggedOnly: true,
    selected,
  }, meta);
  assert.ok(untaggedOnly.every((item) => item.relative_path !== 'A/video-one.mp4'));
});

test('sortMedia handles name and size ordering with missing sizes last', () => {
  const { sortMedia, collectMediaMeta } = loadTsModule(statePath);
  const items = [
    { relative_path: 'C/file-c.mp4', size: 10 },
    { relative_path: 'A/file-a.mp4', size: 250 },
    { relative_path: 'B/file-b.mp4' },
  ];
  const meta = collectMediaMeta(items);

  const nameAsc = sortMedia(items, 'name-asc', meta);
  assert.deepEqual(nameAsc.map((item) => item.relative_path), ['A/file-a.mp4', 'B/file-b.mp4', 'C/file-c.mp4']);

  const sizeDesc = sortMedia(items, 'size-desc', meta);
  assert.deepEqual(sizeDesc.map((item) => item.relative_path), ['A/file-a.mp4', 'C/file-c.mp4', 'B/file-b.mp4']);

  const sizeAsc = sortMedia(items, 'size-asc', meta);
  assert.deepEqual(sizeAsc.map((item) => item.relative_path), ['C/file-c.mp4', 'A/file-a.mp4', 'B/file-b.mp4']);
});


test('normalizeExplorerView enforces deterministic grid/list fallback (no FX mode)', () => {
  const { normalizeExplorerView, normalizeExplorerViewState } = loadTsModule(statePath);

  assert.equal(normalizeExplorerView('grid'), 'grid');
  assert.equal(normalizeExplorerView('list'), 'list');
  assert.equal(normalizeExplorerView('fx'), 'grid');
  assert.equal(normalizeExplorerView('FX'), 'grid');
  assert.equal(normalizeExplorerView('tilefx', 'list'), 'list');
  assert.equal(normalizeExplorerView(''), 'grid');

  const fxState = normalizeExplorerViewState('fx');
  assert.equal(fxState.view, 'grid');
  assert.equal(fxState.changed, true);
  assert.equal(fxState.reason, 'fx_disabled');
  assert.match(fxState.message, /FX view is unavailable/i);

  const invalidState = normalizeExplorerViewState('unsupported-view', 'list');
  assert.equal(invalidState.view, 'list');
  assert.equal(invalidState.changed, true);
  assert.equal(invalidState.reason, 'invalid');

  const okState = normalizeExplorerViewState('grid');
  assert.equal(okState.view, 'grid');
  assert.equal(okState.changed, false);
  assert.equal(okState.reason, 'ok');
});
