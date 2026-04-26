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
  host?: string;
  port?: string;
}

const PRIVATE_IPV4_RE = /^(10|127|172\.(1[6-9]|2\d|3[0-1])|192\.168)\.\d{1,3}\.\d{1,3}$/;

function isLikelyPrivateHost(hostname: string): boolean {
  const normalized = (hostname || '').toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '127.0.0.1') return true;
  return PRIVATE_IPV4_RE.test(normalized);
}

// docker/packages/Explorer/src/utils.ts
export function inferApiBaseUrl(baseUrl: string | undefined, location?: LocationLike): string {
  const trimmed = (baseUrl || '').trim();
  if (!location) return trimmed;

  // HTTPS/Caddy mode must be same-origin. Never construct/use :8787.
  if (location.protocol === 'https:') {
    return '';
  }

  const fallback = `${location.protocol}//${location.hostname}:8787`;

  if (!trimmed) {
    const currentPort = (location.port || '').trim();
    if (currentPort && currentPort !== '8787') {
      return fallback;
    }
    return '';
  }

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

export function normalizeMediaUrlForOrigin(path: string | undefined, location?: LocationLike): string {
  if (!path) return '';
  if (!path.startsWith('http://') && !path.startsWith('https://')) return path;
  if (!location) return path;

  try {
    const parsed = new URL(path);
    const isAssetPath =
      parsed.pathname.startsWith('/media/') ||
      parsed.pathname.startsWith('/thumbnails/');

    if (!isAssetPath) {
      return parsed.toString();
    }

    const sameHost = parsed.hostname.toLowerCase() === location.hostname.toLowerCase();
    const privateHost = isLikelyPrivateHost(parsed.hostname);
    const apiPort = parsed.port === '8787';

    if (location.protocol === 'https:' && (sameHost || privateHost) && (apiPort || parsed.protocol === 'http:')) {
      const host = location.host || location.hostname;
      return `${location.protocol}//${host}${parsed.pathname}${parsed.search}`;
    }

    return parsed.toString();
  } catch {
    return path;
  }
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

const INTERACTIVE_TARGET_SELECTOR = [
  '[data-interactive="true"]',
  '[data-no-preview]',
  'input',
  'button',
  'select',
  'textarea',
  'label',
  'summary',
  'a[href]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(', ');

const TOPBAR_OWNED_TARGET_SELECTOR = [
  '[data-topbar-root="true"]',
  '[data-topbar-control="true"]',
  '[data-topbar-panel="true"]',
].join(', ');

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_TARGET_SELECTOR));
}

export function isTopbarOwnedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(TOPBAR_OWNED_TARGET_SELECTOR));
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
