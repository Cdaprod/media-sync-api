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
  assert.match(content, /if \(!assets\.length\) \{\s*addToast\('warn', 'Compose', 'Select one or more clips'\)/);
  assert.ok(content.includes('api.bulkDeleteAssets'));
  assert.ok(content.includes('api.bulkTagAssets'));
  assert.ok(content.includes('api.bulkMoveAssets'));
  assert.ok(content.includes('api.bulkComposeAssets'));
  assert.ok(content.includes('mapOrderedAssetRefs('));
});
