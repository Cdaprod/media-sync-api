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
const composeJobsPath = path.join(packageRoot, 'src', 'composeJobs.ts');

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


test('toggleSelectionWithOrder tracks selection order and deselection cleanup', () => {
  const { toggleSelectionWithOrder, selectionOrderIndexMap } = loadTsModule(statePath);
  let selected = new Set();
  let order = [];

  ({ selected, order } = toggleSelectionWithOrder(selected, order, 'a'));
  ({ selected, order } = toggleSelectionWithOrder(selected, order, 'b'));
  ({ selected, order } = toggleSelectionWithOrder(selected, order, 'c'));
  assert.deepEqual(Array.from(selected), ['a', 'b', 'c']);
  assert.deepEqual(order, ['a', 'b', 'c']);

  ({ selected, order } = toggleSelectionWithOrder(selected, order, 'b'));
  assert.deepEqual(Array.from(selected), ['a', 'c']);
  assert.deepEqual(order, ['a', 'c']);

  ({ selected, order } = toggleSelectionWithOrder(selected, order, 'b'));
  assert.deepEqual(order, ['a', 'c', 'b']);

  const orderMap = selectionOrderIndexMap(selected, order);
  assert.equal(orderMap.get('a'), 1);
  assert.equal(orderMap.get('c'), 2);
  assert.equal(orderMap.get('b'), 3);
});

test('buildMasonryColumns keeps source order stable while balancing columns', () => {
  const { buildMasonryColumns, prependItemsIntoMasonryColumns } = loadTsModule(statePath);
  const items = [
    { id: '1', h: 1.1 },
    { id: '2', h: 1.3 },
    { id: '3', h: 0.8 },
    { id: '4', h: 1.0 },
    { id: '5', h: 1.2 },
    { id: '6', h: 0.9 },
  ];

  const columns = buildMasonryColumns(items, 3, (item) => item.h);
  assert.equal(columns.length, 3);

  const flattened = columns.flat().map((item) => item.id);
  assert.deepEqual(flattened.slice().sort(), ['1', '2', '3', '4', '5', '6']);

  const placement = new Map();
  columns.forEach((column, columnIndex) => {
    column.forEach((item, rowIndex) => {
      placement.set(item.id, { columnIndex, rowIndex });
    });
  });

  assert.equal(placement.get('1').columnIndex, 0);
  assert.equal(placement.get('2').columnIndex, 1);
  assert.equal(placement.get('3').columnIndex, 2);
  assert.ok(placement.get('4').rowIndex >= 1);

  const pendingColumns = prependItemsIntoMasonryColumns(columns, [
    { id: 'p1', h: 1.16 },
    { id: 'p2', h: 1.16 },
  ], 3);
  assert.deepEqual(pendingColumns.map((column) => column[0].id), ['p1', 'p2', '3']);
  assert.deepEqual(pendingColumns[0].slice(1).map((item) => item.id), columns[0].map((item) => item.id));
  assert.deepEqual(pendingColumns[1].slice(1).map((item) => item.id), columns[1].map((item) => item.id));
  assert.deepEqual(pendingColumns[2].slice(0).map((item) => item.id), columns[2].map((item) => item.id));
});

test('compose job helpers derive pending item fields and long-running status from job envelopes', () => {
  const {
    buildPendingComposeItemFromEnvelope,
    derivePendingComposeStatus,
    pendingComposeHoldsNewestSlot,
    pendingComposeReconnectDelayMs,
    restorePendingComposeItemsFromStorage,
    serializePendingComposeItemsForStorage,
    sortPendingComposeItemsForDisplay,
  } = loadTsModule(composeJobsPath);
  const originalNow = Date.now;
  Date.now = () => new Date('2026-03-22T00:01:00.000Z').getTime();

  try {
    const pending = buildPendingComposeItemFromEnvelope({
      job_id: 'job-123',
      status: 'accepted',
      job_status: 'running',
      project: 'Demo',
      source: 'primary',
      output_name: 'exports/reel.mp4',
      target_dir: 'exports',
      created_at: '2026-03-22T00:00:00.000Z',
      mode_requested: 'encode',
      input_count: 2,
      input_preview: ['a.mov', 'b.mov'],
      job_url: '/api/projects/Demo/compose/jobs/job-123',
      refresh_scope: { project: 'Demo', source: 'primary', paths: ['exports'] },
      result: {
        debug_artifacts: {
          files: ['normalized/segment_0000.mp4'],
        },
      },
    });

    assert.deepEqual(pending, {
      jobId: 'job-123',
      project: 'Demo',
      source: 'primary',
      targetDir: 'exports',
      outputName: 'exports/reel.mp4',
      modeRequested: 'encode',
      inputCount: 2,
      inputPreview: ['a.mov', 'b.mov'],
      createdAt: '2026-03-22T00:00:00.000Z',
      status: 'running',
      error: undefined,
      jobUrl: '/api/projects/Demo/compose/jobs/job-123',
      refreshScope: { project: 'Demo', source: 'primary', paths: ['exports'] },
      completedPath: undefined,
      debugArtifacts: ['normalized/segment_0000.mp4'],
    });

    assert.equal(derivePendingComposeStatus({
      job_id: 'job-123',
      status: 'running',
      project: 'Demo',
      source: 'primary',
      output_name: 'exports/reel.mp4',
      target_dir: 'exports',
      started_at: '2026-03-22T00:00:10.000Z',
    }), 'running_long');

    assert.equal(derivePendingComposeStatus({
      job_id: 'job-123',
      status: 'queued',
      project: 'Demo',
      source: 'primary',
      output_name: 'exports/reel.mp4',
      target_dir: 'exports',
    }), 'queued');

    assert.equal(derivePendingComposeStatus({
      job_id: 'job-123',
      status: 'completed',
      project: 'Demo',
      source: 'primary',
      output_name: 'exports/reel.mp4',
      target_dir: 'exports',
    }), 'completed');

    assert.equal(pendingComposeHoldsNewestSlot('queued'), true);
    assert.equal(pendingComposeHoldsNewestSlot('reconnecting'), true);
    assert.equal(pendingComposeHoldsNewestSlot('finalizing'), true);
    assert.equal(pendingComposeHoldsNewestSlot('failed'), false);
    assert.equal(pendingComposeReconnectDelayMs(1, 2000), 4000);
    assert.equal(pendingComposeReconnectDelayMs(4, 2000), 30000);

    const restored = restorePendingComposeItemsFromStorage(JSON.stringify([
      {
        jobId: 'job-restore',
        jobUrl: '/api/projects/Demo/compose/jobs/job-restore',
        project: 'Demo',
        source: 'primary',
        targetDir: 'exports',
        outputName: 'restore.mp4',
        createdAt: '2026-03-22T00:00:05.000Z',
        modeRequested: 'encode',
        inputCount: 3,
        refreshScope: { project: 'Demo', source: 'primary', paths: ['exports'] },
      },
    ]));

    assert.deepEqual(restored, [{
      jobId: 'job-restore',
      jobUrl: '/api/projects/Demo/compose/jobs/job-restore',
      project: 'Demo',
      source: 'primary',
      targetDir: 'exports',
      outputName: 'restore.mp4',
      createdAt: '2026-03-22T00:00:05.000Z',
      modeRequested: 'encode',
      inputCount: 3,
      refreshScope: { project: 'Demo', source: 'primary', paths: ['exports'] },
      status: 'queued',
    }]);

    assert.deepEqual(JSON.parse(serializePendingComposeItemsForStorage([
      {
        ...restored[0],
        status: 'failed',
        error: 'backend failed',
        completedPath: 'exports/restore.mp4',
        debugArtifacts: ['debug/a.txt'],
      },
    ])), [{
      jobId: 'job-restore',
      jobUrl: '/api/projects/Demo/compose/jobs/job-restore',
      project: 'Demo',
      source: 'primary',
      targetDir: 'exports',
      outputName: 'restore.mp4',
      createdAt: '2026-03-22T00:00:05.000Z',
      modeRequested: 'encode',
      inputCount: 3,
      refreshScope: { project: 'Demo', source: 'primary', paths: ['exports'] },
    }]);

    const ordered = sortPendingComposeItemsForDisplay([
      {
        jobId: 'job-failed',
        project: 'Demo',
        source: 'primary',
        targetDir: 'exports',
        outputName: 'failed.mp4',
        createdAt: '2026-03-22T00:00:03.000Z',
        status: 'failed',
      },
      {
        jobId: 'job-finalizing',
        project: 'Demo',
        source: 'primary',
        targetDir: 'exports',
        outputName: 'finalizing.mp4',
        createdAt: '2026-03-22T00:00:02.000Z',
        status: 'finalizing',
      },
      {
        jobId: 'job-reconnecting',
        project: 'Demo',
        source: 'primary',
        targetDir: 'exports',
        outputName: 'reconnecting.mp4',
        createdAt: '2026-03-22T00:00:01.000Z',
        status: 'reconnecting',
      },
      {
        jobId: 'job-running',
        project: 'Demo',
        source: 'primary',
        targetDir: 'exports',
        outputName: 'running.mp4',
        createdAt: '2026-03-22T00:00:04.000Z',
        status: 'running',
      },
    ]);

    assert.deepEqual(ordered.map((item) => item.jobId), ['job-running', 'job-finalizing', 'job-reconnecting', 'job-failed']);
  } finally {
    Date.now = originalNow;
  }
});
