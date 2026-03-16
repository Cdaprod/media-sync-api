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

const loadApi = () => loadTsModule(path.join(packageRoot, 'src', 'api.ts'));

const withMockFetch = async (handler, run) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(url, init, calls.length - 1);
  };
  try {
    await run(calls);
  } finally {
    global.fetch = originalFetch;
  }
};

const okJson = (payload) => ({ ok: true, async json() { return payload; } });
const failJson = (payload) => ({ ok: false, async json() { return payload; } });

test('api client builds expected list endpoint urls with source/project scoping', async () => {
  const api = loadApi();
  await withMockFetch(
    async (_url, _init, i) => {
      if (i === 0) return okJson([{ name: 'primary', enabled: true }]);
      if (i === 1) return okJson([{ name: 'P1-A', source: 'primary' }]);
      return okJson({ media: [] });
    },
    async (calls) => {
      const client = api.createApiClient('http://example.lan:8787');
      await client.listSources();
      await client.listProjects();
      await client.listMedia('P1 A', 'nas & backup');

      assert.equal(calls[0].url, 'http://example.lan:8787/api/sources');
      assert.equal(calls[1].url, 'http://example.lan:8787/api/projects');
      assert.equal(
        calls[2].url,
        'http://example.lan:8787/api/projects/P1%20A/media?source=nas%20%26%20backup',
      );
    },
  );
});

test('buildProjectUploadUrl and uploadMedia keep source query and multipart body', async () => {
  const api = loadApi();
  const project = { name: 'P1-A', source: 'nas a' };
  assert.equal(api.buildProjectUploadUrl(project), '/api/projects/P1-A/upload?source=nas%20a');

  await withMockFetch(
    async () => okJson({ uploaded: true }),
    async (calls) => {
      const client = api.createApiClient('');
      const file = new File(['clip-bytes'], 'clip.mov', { type: 'video/quicktime' });
      await client.uploadMedia('/api/projects/P1-A/upload?source=nas%20a', file);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, '/api/projects/P1-A/upload?source=nas%20a');
      assert.equal(calls[0].init.method, 'POST');
      assert.ok(calls[0].init.body instanceof FormData);
    },
  );
});

test('api client sends expected payload shapes for resolve/delete/move and bulk endpoints', async () => {
  const api = loadApi();
  const refs = [
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/02.mov' },
    { source: 'nas-b', project: 'P2-B', relative_path: 'ingest/originals/01.mov' },
  ];

  await withMockFetch(
    async () => okJson({ ok: true }),
    async (calls) => {
      const client = api.createApiClient('');
      await client.sendResolve(
        {
          project: 'P2-B',
          mode: 'append',
          new_project_name: null,
          media_rel_paths: ['ingest/originals/02.mov', 'ingest/originals/01.mov'],
        },
        'nas-b',
      );
      await client.deleteMedia('P2-B', ['ingest/originals/02.mov'], 'nas-b');
      await client.moveMedia('P2-B', ['ingest/originals/01.mov'], 'P3-C', 'nas-b', 'primary');
      await client.bulkDeleteAssets(refs);
      await client.bulkTagAssets(refs, ['hero', 'review'], ['old']);
      await client.bulkMoveAssets(refs, 'P3-C', 'primary');
      await client.bulkComposeAssets(refs, 'P4-D', 'timeline.mp4', {
        outputSource: 'primary',
        targetDir: 'exports/custom',
        mode: 'encode',
        allowOverwrite: true,
      });

      assert.equal(calls[0].url, '/api/resolve/open?source=nas-b');
      assert.equal(calls[0].init.method, 'POST');
      assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(calls[0].init.body), {
        project: 'P2-B',
        mode: 'append',
        new_project_name: null,
        media_rel_paths: ['ingest/originals/02.mov', 'ingest/originals/01.mov'],
      });

      assert.equal(calls[1].url, '/api/projects/P2-B/media/delete?source=nas-b');
      assert.deepEqual(JSON.parse(calls[1].init.body), { relative_paths: ['ingest/originals/02.mov'] });

      assert.equal(calls[2].url, '/api/projects/P2-B/media/move?source=nas-b');
      assert.deepEqual(JSON.parse(calls[2].init.body), {
        relative_paths: ['ingest/originals/01.mov'],
        target_project: 'P3-C',
        target_source: 'primary',
      });

      assert.equal(calls[3].url, '/api/assets/bulk/delete');
      assert.deepEqual(JSON.parse(calls[3].init.body), { assets: refs });

      assert.equal(calls[4].url, '/api/assets/bulk/tags');
      assert.deepEqual(JSON.parse(calls[4].init.body), {
        assets: refs,
        add_tags: ['hero', 'review'],
        remove_tags: ['old'],
      });

      assert.equal(calls[5].url, '/api/assets/bulk/move');
      assert.deepEqual(JSON.parse(calls[5].init.body), {
        assets: refs,
        target_project: 'P3-C',
        target_source: 'primary',
      });

      assert.equal(calls[6].url, '/api/assets/bulk/compose');
      assert.deepEqual(JSON.parse(calls[6].init.body), {
        assets: refs,
        output_project: 'P4-D',
        output_source: 'primary',
        output_name: 'timeline.mp4',
        target_dir: 'exports/custom',
        mode: 'encode',
        allow_overwrite: true,
      });
    },
  );
});

test('bulk endpoint request bodies preserve ordered asset refs', async () => {
  const api = loadApi();
  const orderedRefs = [
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/03.mov' },
    { source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/01.mov' },
    { source: 'nas-b', project: 'P2-B', relative_path: 'ingest/originals/02.mov' },
  ];

  await withMockFetch(
    async () => okJson({ ok: true }),
    async (calls) => {
      const client = api.createApiClient('');
      await client.bulkDeleteAssets(orderedRefs);
      await client.bulkTagAssets(orderedRefs, ['tagged'], []);
      await client.bulkMoveAssets(orderedRefs, 'P9-Z', 'primary');
      await client.bulkComposeAssets(orderedRefs, 'P9-Z', 'ordered.mp4');

      for (const call of calls) {
        const body = JSON.parse(call.init.body);
        assert.deepEqual(body.assets, orderedRefs);
      }
    },
  );
});

test('api client surfaces actionable detail/message payload errors for explorer endpoints', async () => {
  const api = loadApi();
  await withMockFetch(
    async (_url, _init, index) => {
      const payloads = [
        { detail: 'source registry unavailable' },
        { message: 'project list stale' },
        { detail: { message: 'media index is locked' } },
      ];
      return failJson(payloads[index]);
    },
    async () => {
      const client = api.createApiClient('');
      await assert.rejects(client.listSources(), /source registry unavailable/);
      await assert.rejects(client.listProjects(), /project list stale/);
      await assert.rejects(client.listMedia('P1-A', 'primary'), /media index is locked/);
    },
  );

  await withMockFetch(
    async (_url, _init, index) => {
      const payloads = [
        { detail: 'Upload too large for configured limit' },
        { message: 'Resolve queue unavailable' },
        { detail: 'Could not delete one or more assets' },
        { message: 'Destination project missing' },
        { detail: 'Bulk delete payload invalid' },
        { message: 'Bulk tag update validation failed' },
        { detail: 'Bulk move target not writable' },
        { message: 'Bulk compose failed to start' },
      ];
      return failJson(payloads[index]);
    },
    async () => {
      const client = api.createApiClient('');
      const file = new File(['clip'], 'clip.mov', { type: 'video/quicktime' });
      const refs = [{ source: 'primary', project: 'P1-A', relative_path: 'ingest/originals/clip.mov' }];

      await assert.rejects(client.uploadMedia('/api/projects/P1-A/upload', file), /Upload too large/);
      await assert.rejects(client.sendResolve({ project: 'P1-A', mode: 'append', media_rel_paths: [] }), /Resolve queue unavailable/);
      await assert.rejects(client.deleteMedia('P1-A', ['ingest/originals/clip.mov']), /Could not delete/);
      await assert.rejects(client.moveMedia('P1-A', ['ingest/originals/clip.mov'], 'P2-B'), /Destination project missing/);
      await assert.rejects(client.bulkDeleteAssets(refs), /Bulk delete payload invalid/);
      await assert.rejects(client.bulkTagAssets(refs, ['new'], ['old']), /Bulk tag update validation failed/);
      await assert.rejects(client.bulkMoveAssets(refs, 'P2-B'), /Bulk move target not writable/);
      await assert.rejects(client.bulkComposeAssets(refs, 'P2-B', 'timeline.mp4'), /Bulk compose failed to start/);
    },
  );
});
