const MOCK_PARAM = 'mock';
const FIXTURE_PARAM = 'fixture';
const DEFAULT_FIXTURE = 'explorer-mock-assets';

const WEBVIEW_PROTOCOLS = new Set(['file:', 'vscode-webview:', 'capacitor:', 'ionic:']);

function hostLooksLocal(hostname = '') {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host.endsWith('.local')
    || host.endsWith('.localhost')
    || host.endsWith('.test');
}

function queryParams() {
  try {
    return new URLSearchParams(window.location.search || '');
  } catch {
    return new URLSearchParams('');
  }
}

function buildDeterministicHash(index = 0) {
  const base = (Number(index || 0) + 1).toString(16).padStart(8, '0');
  return `${base}`.repeat(8).slice(0, 64);
}

function buildDeterministicAsset(index = 0) {
  const kinds = ['image', 'video', 'audio'];
  const orientByKind = {
    image: ['landscape', 'portrait', 'square'],
    video: ['landscape', 'portrait', 'landscape'],
    audio: ['square', 'square', 'square'],
  };
  const kind = kinds[index % kinds.length];
  const orient = orientByKind[kind][index % 3];
  const project = `MockProject-${(index % 4) + 1}`;
  const source = (index % 2 === 0) ? 'primary' : 'mock-nas';
  const baseName = `${kind}-asset-${String(index + 1).padStart(3, '0')}`;
  const ext = kind === 'image' ? 'jpg' : (kind === 'video' ? 'mp4' : 'mp3');
  const relativePath = `ingest/originals/${project}/${baseName}.${ext}`;
  const picsumId = 100 + (index % 120);
  const thumbLandscape = `https://picsum.photos/id/${picsumId}/640/360`;
  const thumbPortrait = `https://picsum.photos/id/${picsumId}/360/640`;
  const thumbSquare = `https://picsum.photos/id/${picsumId}/480/480`;
  const thumbUrl = orient === 'portrait' ? thumbPortrait : (orient === 'square' ? thumbSquare : thumbLandscape);
  const streamUrl = kind === 'video'
    ? 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
    : (kind === 'audio'
      ? 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3'
      : thumbUrl);
  const created = new Date(Date.UTC(2025, 0, 1, 0, 0, 0) + (index * 60000)).toISOString();
  return {
    project,
    source,
    kind,
    filename: `${baseName}.${ext}`,
    path: `/mock/${project}/${baseName}.${ext}`,
    relative_path: relativePath,
    sha256: buildDeterministicHash(index),
    size_bytes: 120000 + (index * 137),
    thumb_url: thumbUrl,
    stream_url: streamUrl,
    orient,
    created_at: created,
    indexed_at: created,
    uploaded_at: created,
    tags: kind === 'audio' ? ['sound'] : [kind, orient],
  };
}

export function buildEmbeddedExplorerMockAssets() {
  return Array.from({ length: 120 }, (_, index) => buildDeterministicAsset(index));
}

export function normalizeExplorerMockAsset(asset = {}) {
  const normalized = { ...asset };
  const projectName = String(asset.project_name || asset.project || 'MockProject-1');
  const sourceName = String(asset.project_source || asset.source || 'primary');
  const relativePath = String(asset.relative_path || asset.path || `${projectName}/asset-${Date.now()}.jpg`);
  const kind = String(asset.kind || asset.type || '').toLowerCase() || 'image';
  const thumbUrl = String(asset.thumb_url || asset.thumbnail_url || asset.preview_url || '');
  const streamUrl = String(asset.stream_url || asset.url || thumbUrl || '');
  const sha256 = String(asset.sha256 || buildDeterministicHash(relativePath.length));
  const createdAt = String(asset.created_at || asset.uploaded_at || asset.indexed_at || new Date(Date.UTC(2025, 0, 1)).toISOString());
  return {
    ...normalized,
    project_name: projectName,
    project_source: sourceName,
    project: projectName,
    source: sourceName,
    kind,
    relative_path: relativePath,
    stream_url: streamUrl,
    thumb_url: thumbUrl,
    sha256,
    size: Number(asset.size || asset.size_bytes || 0),
    size_bytes: Number(asset.size_bytes || asset.size || 0),
    created_at: createdAt,
    uploaded_at: String(asset.uploaded_at || createdAt),
    indexed_at: String(asset.indexed_at || createdAt),
    orient: String(asset.orient || 'square'),
    tags: Array.isArray(asset.tags) ? asset.tags : [],
  };
}

export function shouldUseExplorerMocks() {
  const params = queryParams();
  const explicit = params.get(MOCK_PARAM) === '1' || window.__EXPLORER_MOCK__ === true;
  if (explicit) return true;
  return WEBVIEW_PROTOCOLS.has(String(window.location.protocol || '').toLowerCase());
}

export function isLikelyPreviewEnvironment() {
  const protocol = String(window.location.protocol || '').toLowerCase();
  if (WEBVIEW_PROTOCOLS.has(protocol)) return true;
  if (window.opener && hostLooksLocal(window.location.hostname)) return true;
  if (window.top !== window.self && hostLooksLocal(window.location.hostname)) return true;
  return false;
}

export async function loadExplorerMockAssets() {
  const params = queryParams();
  const fixtureName = String(params.get(FIXTURE_PARAM) || DEFAULT_FIXTURE).trim() || DEFAULT_FIXTURE;
  const fixtureUrl = new URL(`../fixtures/${fixtureName}.json`, import.meta.url).toString();
  try {
    const response = await fetch(fixtureUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`fixture_fetch_failed:${response.status}`);
    const payload = await response.json();
    const assets = Array.isArray(payload) ? payload : (Array.isArray(payload?.assets) ? payload.assets : []);
    if (!assets.length) throw new Error('fixture_empty');
    return assets.map((asset) => normalizeExplorerMockAsset(asset));
  } catch {
    return buildEmbeddedExplorerMockAssets().map((asset) => normalizeExplorerMockAsset(asset));
  }
}
