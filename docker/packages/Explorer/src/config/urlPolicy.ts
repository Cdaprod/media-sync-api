export type LocationLike = {
  protocol: string;
  hostname: string;
  host?: string;
  port?: string;
  origin?: string;
};

const PRIVATE_IPV4_RE = /^(10|127|172\.(1[6-9]|2\d|3[0-1])|192\.168)\.\d{1,3}\.\d{1,3}$/;

export function isBrowserAssetPath(value: string): boolean {
  return value.startsWith('/media/') || value.startsWith('/thumbnails/');
}

export function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

export function isAbsoluteHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function isLikelyPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '127.0.0.1') return true;
  return PRIVATE_IPV4_RE.test(normalized);
}

export function inferExplorerApiBaseUrl(
  configuredBaseUrl: string | undefined,
  location?: LocationLike,
): string {
  const trimmed = (configuredBaseUrl || '').trim();
  if (!location) return trimmed;

  if (location.protocol === 'https:') {
    return '';
  }

  if (!trimmed) {
    const currentPort = (location.port || '').trim();
    if (currentPort && currentPort !== '8787') {
      return `${location.protocol}//${location.hostname}:8787`;
    }
    return '';
  }

  return trimmed;
}

export function normalizeBrowserAssetUrl(
  input: string | null | undefined,
  location?: LocationLike,
): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  if (isDataUrl(raw)) return raw;
  if (isBrowserAssetPath(raw)) return raw;

  if (!isAbsoluteHttpUrl(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const isAsset = isBrowserAssetPath(parsed.pathname);
    if (!isAsset) return parsed.toString();

    if (!location) return parsed.toString();

    const sameHost = parsed.hostname.toLowerCase() === location.hostname.toLowerCase();
    const privateHost = isLikelyPrivateHost(parsed.hostname);
    const apiPort = parsed.port === '8787';
    const unsafeApiAuthority = parsed.protocol === 'http:' || apiPort;

    if (location.protocol === 'https:' && unsafeApiAuthority && (sameHost || privateHost || apiPort)) {
      const host = location.host || location.hostname;
      return `${location.protocol}//${host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return raw;
  }
}

export function resolveBrowserRenderableUrl(
  input: string | null | undefined,
  apiBuildUrl: (path: string) => string,
  location?: LocationLike,
): string {
  const normalized = normalizeBrowserAssetUrl(input, location);
  if (!normalized) return '';
  if (isDataUrl(normalized)) return normalized;
  if (isBrowserAssetPath(normalized)) return normalized;
  return apiBuildUrl(normalized);
}

export function absolutizeNonAssetUrl(
  input: string | null | undefined,
  baseUrl: string,
): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (isDataUrl(raw)) return raw;
  if (isAbsoluteHttpUrl(raw)) return raw;
  if (isBrowserAssetPath(raw)) return raw;

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}
