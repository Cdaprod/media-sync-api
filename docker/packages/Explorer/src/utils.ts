import type { MediaItem } from './types';
import type { LocationLike } from './config/urlPolicy';
import {
  inferExplorerApiBaseUrl,
  isBrowserAssetPath,
  normalizeBrowserAssetUrl,
} from './config/urlPolicy';

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
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (isBrowserAssetPath(path)) return path;
  return new URL(path, origin).toString();
}

export type { LocationLike };

export function inferApiBaseUrl(baseUrl: string | undefined, location?: LocationLike): string {
  return inferExplorerApiBaseUrl(baseUrl, location);
}

export function normalizeMediaUrlForOrigin(path: string | undefined, location?: LocationLike): string {
  return normalizeBrowserAssetUrl(path, location);
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
