import type { MediaItem } from '../types';

export function normalizeAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';

  if (raw.startsWith('/')) return raw;

  if (typeof window !== 'undefined' && raw.startsWith('//')) {
    return `${window.location.protocol}${raw}`;
  }

  try {
    const parsed = new URL(raw);

    if (typeof window !== 'undefined') {
      const loc = window.location;

      const isAssetPath =
        parsed.pathname.startsWith('/media/') ||
        parsed.pathname.startsWith('/thumbnails/');

      const sameHost =
        parsed.hostname.toLowerCase() === loc.hostname.toLowerCase();

      const isWrongPort =
        parsed.port === '8787';

      const isHttp =
        parsed.protocol === 'http:';

      if (
        loc.protocol === 'https:' &&
        isAssetPath &&
        sameHost &&
        (isHttp || isWrongPort)
      ) {
        const rewritten = `${loc.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;

        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Explorer] Rewrote asset URL', raw, rewritten);
        }

        return rewritten;
      }
    }

    return parsed.toString();
  } catch {
    return raw;
  }
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
  if (!url) return '';
  if (typeof window === 'undefined') return url;
  return new URL(url, window.location.origin).toString();
}
