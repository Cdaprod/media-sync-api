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

export function inferApiBaseUrl(baseUrl: string | undefined, location?: LocationLike): string {
  const trimmed = (baseUrl || '').trim();
  if (!location) return trimmed;
  if (!trimmed) return '';
  const fallback = `${location.protocol}//${location.hostname}:8787`;
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
