import type { MediaItem } from './types';

export function formatBytes(bytes?: number): string {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function toAbsoluteUrl(path: string | undefined, origin: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return new URL(path, origin).toString();
}

export interface LocationLike {
  protocol: string;
  hostname: string;
  port?: string;
}

const DEFAULT_API_PORT = '8787';
const WEBVIEW_PROTOCOLS = new Set(['file:', 'vscode-webview:', 'capacitor:', 'ionic:']);

export function inferApiBaseUrl(baseUrl: string | undefined, location?: LocationLike): string {
  const trimmed = (baseUrl || '').trim();
  if (!location) return trimmed;
  if (!trimmed) return '';
  const fallback = `${location.protocol}//${location.hostname}:${DEFAULT_API_PORT}`;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (['media-sync-api', 'localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return fallback;
    }
  } catch {
    return fallback;
  }
  return trimmed;
}

export function guessKind(item: MediaItem): string {
  const k = (item.kind || item.type || '').toLowerCase();
  if (k) return k;
  const p = (item.relative_path || '').toLowerCase();
  if (/\.(mp4|mov|mkv|webm|m4v)$/.test(p)) return 'video';
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(p)) return 'image';
  if (/\.(mp3|wav|m4a|aac|flac)$/.test(p)) return 'audio';
  return 'document';
}


export function normalizePreviewKind(kind: string | null | undefined): string {
  return String(kind || '').toLowerCase();
}

export function buildPreviewMediaDescriptor(item: MediaItem, kind: string | null | undefined): {
  kind: string;
  source: string;
  title: string;
} {
  const normalizedKind = normalizePreviewKind(kind);
  const streamUrl = String(item.stream_url || (item as MediaItem & { streamUrl?: string }).streamUrl || '');
  const thumbUrl = resolveThumbnailUrl(item);
  const source = normalizedKind === 'image' ? (streamUrl || thumbUrl) : streamUrl;
  const title = String(item.relative_path || 'unnamed').split('/').pop() || 'unnamed';
  return { kind: normalizedKind, source, title };
}



export function buildThumbCacheKey(item: MediaItem): string {
  const project = item.project_name || item.project || '';
  const source = item.project_source || item.source || '';
  const rel = item.relative_path || '';
  const sha = item.sha256 || item.hash || '';
  return [source, project, rel, sha].filter(Boolean).join('|');
}

export function resolveThumbnailUrl(item: MediaItem): string {
  const preferred = String(item.thumbnail_url || '').trim();
  if (preferred) return preferred;
  const legacy = String(item.thumb_url || '').trim();
  if (legacy) return legacy;
  const kind = guessKind(item);
  return kind === 'image'
    ? String(item.stream_url || (item as MediaItem & { streamUrl?: string }).streamUrl || '').trim()
    : '';
}

export function kindBadgeClass(kind: string): string {
  if (kind === 'video') return 'kind-video';
  if (kind === 'image') return 'kind-image';
  if (kind === 'audio') return 'kind-audio';
  return 'kind-doc';
}

export function normalizeTagList(value?: string[] | string): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function copyTextWithFallback(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback continues below
    }
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  if (ok) return true;
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    window.prompt('Copy to clipboard', text);
    return true;
  }
  return false;
}

export function encodePathSegments(path: string): string {
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export interface ProgramMonitorAssetDescriptor {
  asset_id: string | null;
  sha256: string | null;
  project: string | null;
  source: string;
  relative_path: string | null;
  stream_url: string | null;
  fallback_relative_path: string | null;
  origin: string;
  creation_time: string | null;
}

export interface ProgramMonitorTarget {
  monitorUrl?: string;
  ackType?: string;
  importType?: string;
  timeoutMs?: number;
  intervalMs?: number;
}

const DEFAULT_PROGRAM_MONITOR_URL = 'http://192.168.0.25:8789/program-monitor/index.html';
const DEFAULT_ACK_TYPE = 'CDAPROD_PROGRAM_MONITOR_ACK';
const DEFAULT_IMPORT_TYPE = 'CDAPROD_PROGRAM_MONITOR_IMPORT';

const isSha256 = (value: string | undefined): boolean => /^[A-Fa-f0-9]{64}$/.test(String(value || '').trim());

export function buildProgramMonitorDescriptor(item: MediaItem, origin: string): ProgramMonitorAssetDescriptor {
  const sha = String(item.sha256 || item.hash || '').trim();
  const relative = String(item.relative_path || '').trim();
  const source = String(item.project_source || item.source || 'primary').trim() || 'primary';
  const project = String(item.project_name || item.project || '').trim() || null;
  const creationTime = String(item.created_at || item.uploaded_at || item.indexed_at || '').trim() || null;
  const streamUrl = toAbsoluteUrl(buildStreamPathFromItem(item), origin);
  const normalizedSha = isSha256(sha) ? sha.toLowerCase() : null;
  return {
    asset_id: normalizedSha ? `sha256:${normalizedSha}` : null,
    sha256: normalizedSha,
    project,
    source,
    relative_path: relative || null,
    stream_url: streamUrl || null,
    fallback_relative_path: relative || null,
    origin: String((item as MediaItem & { origin?: string }).origin || 'unknown'),
    creation_time: creationTime,
  };
}

export function buildStreamPathFromItem(item: MediaItem): string {
  const direct = item.stream_url || (item as MediaItem & { url?: string }).url;
  if (direct) return direct;
  const project = item.project_name || item.project;
  const rel = item.relative_path;
  const source = item.project_source || item.source || 'primary';
  if (project && rel) {
    const suffix = source && source !== 'primary' ? `?source=${encodeURIComponent(source)}` : '';
    return `/media/${encodeURIComponent(project)}/${encodePathSegments(rel)}${suffix}`;
  }
  return '';
}


export function canUseProgramMonitorIntegration(targetWindow: unknown): boolean {
  if (!targetWindow || typeof targetWindow !== 'object') return false;
  const maybeWindow = targetWindow as Window;
  return typeof maybeWindow.open === 'function';
}

export function canUseObsIntegration(targetWindow: unknown): boolean {
  if (!targetWindow || typeof targetWindow !== 'object') return false;
  const maybeWindow = targetWindow as Window;
  return Boolean(maybeWindow.document && typeof maybeWindow.document.createElement === 'function');
}

export async function sendToProgramMonitor(
  streamUrls: string[],
  descriptors: ProgramMonitorAssetDescriptor[],
  target: ProgramMonitorTarget = {},
): Promise<void> {
  if (typeof window === 'undefined') throw new Error('Program Monitor handoff requires a browser window');
  if (!streamUrls.length) throw new Error('No stream URLs found for the selection.');

  const monitorUrl = target.monitorUrl || DEFAULT_PROGRAM_MONITOR_URL;
  const ackType = target.ackType || DEFAULT_ACK_TYPE;
  const importType = target.importType || DEFAULT_IMPORT_TYPE;
  const timeoutMs = Number(target.timeoutMs || 6000);
  const intervalMs = Number(target.intervalMs || 200);
  const popup = window.open(monitorUrl, '_blank');
  if (!popup) throw new Error('Popup blocked. Allow popups for this site.');

  const payload = {
    type: importType,
    version: 1,
    nodes: streamUrls.map((url) => ({ lines: [url], durationOverride: 'auto' })),
    selected_assets: {
      asset_ids: descriptors.map((item) => item.asset_id).filter(Boolean),
      sha256: descriptors.map((item) => item.sha256).filter(Boolean),
      fallback_relative_paths: descriptors.map((item) => item.fallback_relative_path).filter(Boolean),
      origins: descriptors.map((item) => item.origin).filter(Boolean),
      creation_times: descriptors.map((item) => item.creation_time).filter(Boolean),
      items: descriptors.map((item) => ({
        asset_id: item.asset_id,
        sha256: item.sha256,
        project: item.project,
        source: item.source,
        relative_path: item.relative_path,
        stream_url: item.stream_url,
        origin: item.origin,
        creation_time: item.creation_time,
      })),
    },
    meta: {
      sentAt: new Date().toISOString(),
      from: window.location.origin,
    },
  };

  const targetOrigin = (() => {
    try {
      return new URL(monitorUrl).origin;
    } catch {
      return '*';
    }
  })();

  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    let sendCount = 0;
    const onMessage = (event: MessageEvent) => {
      if (event?.data?.type === ackType) {
        window.clearInterval(timer);
        window.removeEventListener('message', onMessage);
        resolve();
      }
    };

    window.addEventListener('message', onMessage);

    const timer = window.setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        window.clearInterval(timer);
        window.removeEventListener('message', onMessage);
        reject(new Error('No ACK from Program Monitor. Is it open and listening?'));
        return;
      }
      if (sendCount > 0) return;
      try {
        popup.postMessage(payload, targetOrigin);
        sendCount += 1;
      } catch {
        // Ignore transient postMessage errors while waiting for ACK.
      }
    }, intervalMs);
  });
}

export interface ObsPushRequest {
  obsHost?: string;
  obsPort?: number;
  obsPassword?: string;
  targetSceneName?: string;
  inputName?: string;
  slot?: number | null;
  pairKey?: string;
  playerId?: string;
  assetUrl: string;
  fit?: 'cover' | 'contain';
  muted?: boolean;
  ensureExclusiveScene?: boolean;
}

type ObsPushBrowserMedia = (payload: ObsPushRequest) => Promise<unknown>;

interface WindowWithObs extends Window {
  obsPushBrowserMedia?: ObsPushBrowserMedia;
  OBSWebSocket?: unknown;
}

async function loadScriptOnce(selector: string, src: string, dataAttribute: string): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('Script loading requires a browser document');
  }
  const existing = document.querySelector(selector) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      if (existing.dataset.ready === 'true') resolve();
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset[dataAttribute] = 'true';
    script.onload = () => {
      script.dataset.ready = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export async function pushAssetToObs(request: ObsPushRequest): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('OBS push requires a browser window');
  }
  const targetWindow = window as WindowWithObs;
  if (!request.assetUrl) {
    throw new Error('assetUrl is required');
  }
  if (!('document' in window) || typeof document.createElement !== 'function') {
    throw new Error('OBS push is unavailable in this browser context.');
  }

  if (!targetWindow.OBSWebSocket) {
    await loadScriptOnce('script[data-obs-websocket]', 'js/obs-websocket.js', 'obsWebsocket');
  }
  if (typeof targetWindow.obsPushBrowserMedia !== 'function') {
    await loadScriptOnce('script[data-obs-push]', 'js/obs-push.js', 'obsPush');
  }
  if (!targetWindow.OBSWebSocket) {
    throw new Error('OBSWebSocket is not available.');
  }
  if (typeof targetWindow.obsPushBrowserMedia !== 'function') {
    throw new Error('OBS push helper is unavailable.');
  }

  await targetWindow.obsPushBrowserMedia({
    obsHost: request.obsHost || '192.168.0.187',
    obsPort: request.obsPort || 4455,
    obsPassword: request.obsPassword || '123456',
    targetSceneName: request.targetSceneName || 'ASSET_MEDIA',
    inputName: request.inputName || 'ASSET_MEDIA',
    slot: request.slot ?? 1,
    pairKey: request.pairKey || '',
    playerId: request.playerId || 'player',
    assetUrl: request.assetUrl,
    fit: request.fit || 'cover',
    muted: Boolean(request.muted),
    ensureExclusiveScene: Boolean(request.ensureExclusiveScene),
  });
}

const hostLooksLocal = (hostname = ''): boolean => {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host.endsWith('.local')
    || host.endsWith('.localhost')
    || host.endsWith('.test');
};

const queryParams = (search: string): URLSearchParams => {
  try {
    return new URLSearchParams(search || '');
  } catch {
    return new URLSearchParams('');
  }
};

export function shouldUseExplorerMocks(location: Pick<Location, 'search' | 'protocol'>, explicitFlag = false): boolean {
  const params = queryParams(location.search);
  if (params.get('mock') === '1' || explicitFlag) return true;
  return WEBVIEW_PROTOCOLS.has(String(location.protocol || '').toLowerCase());
}

export function isLikelyPreviewEnvironment(
  location: Pick<Location, 'protocol' | 'hostname'>,
  context: { hasOpener?: boolean; embedded?: boolean } = {},
): boolean {
  const protocol = String(location.protocol || '').toLowerCase();
  if (WEBVIEW_PROTOCOLS.has(protocol)) return true;
  if (hostLooksLocal(location.hostname)) return true;
  if (context.hasOpener && hostLooksLocal(location.hostname)) return true;
  if (context.embedded && hostLooksLocal(location.hostname)) return true;
  return false;
}

export type ExplorerBootMode = 'api' | 'mock';

export function decideExplorerBootMode(options: {
  location: Pick<Location, 'protocol' | 'hostname' | 'search'>;
  explicitMockFlag?: boolean;
  apiFailed?: boolean;
  hasOpener?: boolean;
  embedded?: boolean;
}): ExplorerBootMode {
  if (shouldUseExplorerMocks(options.location, Boolean(options.explicitMockFlag))) {
    return 'mock';
  }
  if (options.apiFailed && isLikelyPreviewEnvironment(options.location, {
    hasOpener: Boolean(options.hasOpener),
    embedded: Boolean(options.embedded),
  })) {
    return 'mock';
  }
  return 'api';
}

function deterministicHash(index = 0): string {
  const base = (Number(index || 0) + 1).toString(16).padStart(8, '0');
  return `${base}`.repeat(8).slice(0, 64);
}

function buildEmbeddedMockAsset(index = 0): MediaItem {
  const kinds = ['image', 'video', 'audio'] as const;
  const orientByKind = {
    image: ['landscape', 'portrait', 'square'],
    video: ['landscape', 'portrait', 'landscape'],
    audio: ['square', 'square', 'square'],
  };
  const kind = kinds[index % kinds.length];
  const orient = orientByKind[kind][index % 3];
  const project = `MockProject-${(index % 4) + 1}`;
  const source = index % 2 === 0 ? 'primary' : 'mock-nas';
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
    project_name: project,
    project,
    project_source: source,
    source,
    kind,
    relative_path: relativePath,
    sha256: deterministicHash(index),
    size: 120000 + (index * 137),
    thumb_url: thumbUrl,
    stream_url: streamUrl,
    created_at: created,
    indexed_at: created,
    uploaded_at: created,
    tags: kind === 'audio' ? ['sound'] : [kind, orient],
  };
}

export function normalizeExplorerMockAsset(asset: Partial<MediaItem> | Record<string, unknown>): MediaItem {
  const raw = asset as Record<string, unknown> & Partial<MediaItem>;
  const projectName = String(raw.project_name || raw.project || 'MockProject-1');
  const sourceName = String(raw.project_source || raw.source || 'primary');
  const relativePath = String(raw.relative_path || raw.path || `${projectName}/asset-${Date.now()}.jpg`);
  const kind = String(raw.kind || raw.type || '').toLowerCase() || 'image';
  const thumbUrl = String(raw.thumb_url || raw.thumbnail_url || raw.preview_url || '');
  const streamUrl = String(raw.stream_url || (raw as { url?: string }).url || thumbUrl || '');
  const sha256 = String(raw.sha256 || deterministicHash(relativePath.length));
  const createdAt = String(raw.created_at || raw.uploaded_at || raw.indexed_at || new Date(Date.UTC(2025, 0, 1)).toISOString());
  return {
    ...(raw as MediaItem),
    project_name: projectName,
    project_source: sourceName,
    project: projectName,
    source: sourceName,
    kind,
    relative_path: relativePath,
    stream_url: streamUrl,
    thumb_url: thumbUrl,
    sha256,
    size: Number(raw.size || raw.size_bytes || 0),
    created_at: createdAt,
    uploaded_at: String(raw.uploaded_at || createdAt),
    indexed_at: String(raw.indexed_at || createdAt),
    tags: Array.isArray(raw.tags) ? raw.tags as string[] : [],
  };
}

export async function loadExplorerMockAssets(fetcher: typeof fetch): Promise<MediaItem[]> {
  const fixtureCandidates = [
    '/fixtures/explorer-mock-assets.json',
    '/public/fixtures/explorer-mock-assets.json',
  ];

  for (const fixtureUrl of fixtureCandidates) {
    try {
      const response = await fetcher(fixtureUrl, { cache: 'no-store' });
      if (!response.ok) continue;
      const payload = await response.json();
      const assets = Array.isArray(payload) ? payload : (Array.isArray(payload?.assets) ? payload.assets : []);
      if (!assets.length) continue;
      return assets.map((asset: Record<string, unknown>) => normalizeExplorerMockAsset(asset));
    } catch {
      // try next fixture candidate
    }
  }

  return Array.from({ length: 120 }, (_, index) => normalizeExplorerMockAsset(buildEmbeddedMockAsset(index)));
}
