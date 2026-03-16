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

test('boot decision helper mirrors preview/mock behavior', () => {
  const utils = loadTsModule(path.join(packageRoot, 'src', 'utils.ts'));
  const localPreview = utils.decideExplorerBootMode({
    location: { protocol: 'http:', hostname: 'localhost', search: '' },
    apiFailed: true,
    embedded: true,
  });
  assert.equal(localPreview, 'mock');

  const lanHost = utils.decideExplorerBootMode({
    location: { protocol: 'http:', hostname: '192.168.0.25', search: '' },
    apiFailed: true,
    embedded: false,
    hasOpener: false,
  });
  assert.equal(lanHost, 'api');

  const explicitMock = utils.decideExplorerBootMode({
    location: { protocol: 'http:', hostname: '192.168.0.25', search: '?mock=1' },
  });
  assert.equal(explicitMock, 'mock');
});

test('program monitor descriptor + stream path are deterministic', () => {
  const utils = loadTsModule(path.join(packageRoot, 'src', 'utils.ts'));
  const item = {
    project_name: 'P1-Launch',
    project_source: 'primary',
    relative_path: 'ingest/originals/clip one.mp4',
    sha256: 'A'.repeat(64),
    created_at: '2026-03-15T00:00:00.000Z',
  };
  const streamPath = utils.buildStreamPathFromItem(item);
  assert.equal(streamPath, '/media/P1-Launch/ingest/originals/clip%20one.mp4');

  const descriptor = utils.buildProgramMonitorDescriptor(item, 'http://192.168.0.25:8790');
  assert.equal(descriptor.asset_id, `sha256:${'a'.repeat(64)}`);
  assert.equal(descriptor.stream_url, 'http://192.168.0.25:8790/media/P1-Launch/ingest/originals/clip%20one.mp4');
});

test('upload url helper omits undefined sources', () => {
  const api = loadTsModule(path.join(packageRoot, 'src', 'api.ts'));
  assert.equal(
    api.buildProjectUploadUrl({ name: 'P1', source: '', upload_url: '' }),
    '/api/projects/P1/upload',
  );
  assert.equal(
    api.buildProjectUploadUrl({ name: 'P1', source: 'nas-a' }),
    '/api/projects/P1/upload?source=nas-a',
  );
});



test('preview descriptor helper normalizes kind and resolves image fallback source', () => {
  const utils = loadTsModule(path.join(packageRoot, 'src', 'utils.ts'));
  const descriptor = utils.buildPreviewMediaDescriptor({
    relative_path: 'ingest/originals/clip.jpg',
    stream_url: '',
    thumb_url: '/media/thumb.jpg',
  }, 'IMAGE');
  assert.equal(descriptor.kind, 'image');
  assert.equal(descriptor.source, '/media/thumb.jpg');
  assert.equal(descriptor.title, 'clip.jpg');
});

test('mock asset loader prefers fixture paths before embedded fallback', async () => {
  const utils = loadTsModule(path.join(packageRoot, 'src', 'utils.ts'));
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url === '/fixtures/explorer-mock-assets.json') {
      return {
        ok: true,
        json: async () => ({
          assets: [{
            project: 'MockProject-1',
            source: 'primary',
            kind: 'image',
            relative_path: 'ingest/originals/MockProject-1/image-asset-001.jpg',
            stream_url: 'https://example.test/mock.jpg',
            thumb_url: 'https://example.test/mock.jpg',
            sha256: '1'.repeat(64),
          }],
        }),
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  const assets = await utils.loadExplorerMockAssets(fakeFetch);
  assert.equal(calls[0], '/fixtures/explorer-mock-assets.json');
  assert.equal(assets.length, 1);
  assert.equal(assets[0].project_name, 'MockProject-1');
});


test('package styles keep section header + masonry grid contracts', () => {
  const css = fs.readFileSync(path.join(packageRoot, 'src', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx'), 'utf8');
  assert.match(css, /\.main\{[\s\S]*padding:\s*var\(--topbar-offset\)\s*0\s*0;/);
  assert.match(css, /\.section-h\{[\s\S]*position:\s*relative;/);
  assert.match(css, /--section-surface:/);
  assert.match(css, /\.section-h\{[\s\S]*background:\s*var\(--section-surface\);/);
  assert.match(css, /\.grid\{[\s\S]*grid-auto-flow:\s*dense;[\s\S]*grid-auto-rows:\s*8px;/);
  assert.match(css, /\.asset\{[\s\S]*grid-row:\s*span\s*var\(--asset-span,\s*46\);/);
  assert.match(app, /getGridAssetSpan/);
  assert.match(app, /'--asset-span'/);
});

test('package explorer keeps grid/list-only controls and never wires FX runtime', () => {
  const app = fs.readFileSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx'), 'utf8');
  assert.match(app, /normalizeExplorerViewState/);
  assert.match(app, /const applyNormalizedView/);
  assert.match(app, /applyNormalizedView\('grid', 'ui'\)/);
  assert.match(app, /applyNormalizedView\('list', 'ui'\)/);
  assert.ok(!app.includes("setView('fx')"));
  assert.ok(!app.includes('TileFXRenderer'));
  assert.ok(!app.includes('fx-mode'));
});

test('package explorer exposes topbar/section ui hook selectors for static parity checks', () => {
  const app = fs.readFileSync(path.join(packageRoot, 'src', 'ExplorerApp.tsx'), 'utf8');
  assert.match(app, /data-ui-hook=\"explorer-app-shell\"/);
  assert.match(app, /data-ui-hook=\"explorer-topbar\"/);
  assert.match(app, /data-ui-hook=\"projects-section-header\"/);
});

test('README documents static and package screenshot routes with content checks', () => {
  const readme = fs.readFileSync(path.join(packageRoot, 'README.md'), 'utf8');
  assert.match(readme, /Visual QA screenshot sanity check/);
  assert.match(readme, /http:\/\/127\.0\.0\.1:8000\/public\/explorer\.html\?mock=1/);
  assert.match(readme, /http:\/\/127\.0\.0\.1:8790\/\?mock=1/);
  assert.match(readme, /status code:\s*`200`/);
  assert.match(readme, /route-content-ok/);
  assert.match(readme, /id="brandTitle"/);
  assert.match(readme, /data-ui-hook="explorer-app-shell"/);
  assert.match(readme, /preview-panel shots, click any mock media card/i);
});
