import type { MediaItem } from '../types';
import {
  absolutizeNonAssetUrl,
  normalizeBrowserAssetUrl,
} from '../config/urlPolicy';

export function normalizeAssetUrl(url: string | null | undefined): string {
  if (typeof window === 'undefined') {
    return String(url || '').trim();
  }

  return normalizeBrowserAssetUrl(url, window.location);
}

export function getBestThumbnailUrl(item: Pick<MediaItem, 'thumbnail_url' | 'thumb_url'>): string {
  return normalizeAssetUrl(item.thumbnail_url || item.thumb_url || '');
}

export function getBestStreamUrl(item: Pick<MediaItem, 'stream_url'> & { url?: string | null }): string {
  return normalizeAssetUrl(item.stream_url || item.url || '');
}

export function getBestDownloadUrl(item: Pick<MediaItem, 'download_url' | 'stream_url'>): string {
  return normalizeAssetUrl(item.download_url || item.stream_url || '');
}

export function absoluteAssetUrl(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (typeof window === 'undefined') return raw;
  if (raw.startsWith('data:')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return absolutizeNonAssetUrl(raw, window.location.origin);
  }
}
