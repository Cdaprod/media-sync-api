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
