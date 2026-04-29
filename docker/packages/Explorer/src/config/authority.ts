export type AuthorityUrlContext = {
  protocol: string;
  hostname: string;
  host: string;
  origin: string;
  port?: string;
};

export function resolveAuthorityOrigin(
  configured: string | null | undefined,
  location?: AuthorityUrlContext,
): string {
  const explicit = String(configured || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  if (!location) return '';

  if (location.protocol === 'https:') {
    return location.origin.replace(/\/+$/, '');
  }

  if (location.port === '3000') {
    return `${location.protocol}//${location.hostname}:8787`;
  }

  return location.origin.replace(/\/+$/, '');
}

export function buildAuthorityUrl(path: string, authorityOrigin: string): string {
  const cleanOrigin = authorityOrigin.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanOrigin}${cleanPath}`;
}
