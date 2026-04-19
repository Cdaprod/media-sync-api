import { canonicalAssetSource } from './state';
import type { MediaItem } from './types';

export const THUMB_LOAD_TIMEOUT_MS = 8000;
const THUMB_MAX_WORKERS = 3;
const THUMBNAILABLE_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.jpg', '.jpeg', '.png', '.heic']);

type ThumbLoadState = 'loaded' | 'error';

const thumbLoadStateCache = new Map<string, ThumbLoadState>();
const inflightThumbLoads = new Map<string, Promise<ThumbLoadState>>();

export const getThumbLoadState = (jobKey: string): ThumbLoadState | undefined => {
  if (!jobKey) return undefined;
  return thumbLoadStateCache.get(jobKey);
};

export const normalizeThumbUrl = (rawUrl?: string): string | undefined => {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        if (typeof window === 'undefined') return parsed.href;
        const host = window.location.hostname || parsed.hostname;
        const protocol = window.location.protocol || parsed.protocol;
        const resolvedPort = parsed.port || '';
        return `${protocol}//${host}${resolvedPort ? `:${resolvedPort}` : ''}${parsed.pathname}${parsed.search}`;
      }
      return parsed.href;
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
};

export const getThumbCacheKey = (item: MediaItem) => {
  const project = String(item.project_name || item.project || '').trim();
  const source = canonicalAssetSource(item.project_source || item.source || '');
  const rel = String(item.relative_path || '').trim();
  const sha = String(item.sha256 || item.hash || '').trim();
  return [source, project, rel, sha].filter(Boolean).join('|');
};

export const buildThumbJobKey = (thumbKey: string, thumbUrl?: string) => `${thumbKey}::${thumbUrl || ''}`;

export const isThumbableRelativePath = (relativePath?: string): boolean => {
  const normalized = String(relativePath || '').trim().toLowerCase();
  if (!normalized) return false;
  const ext = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.')) : '';
  return THUMBNAILABLE_EXTENSIONS.has(ext);
};

const syncThumbNode = (
  target: HTMLImageElement,
  state: ThumbLoadState,
  onOrientation: (node: HTMLImageElement) => void,
) => {
  const thumbUrl = target.dataset.thumbUrl || '';
  const fallback = target.dataset.thumbFallback || '';
  const jobKey = target.dataset.thumbJobKey || '';
  if (!jobKey || !thumbUrl) return;
  target.src = state === 'loaded' ? thumbUrl : (fallback || target.src);
  target.dataset.thumbState = state;
  target.dataset.thumbLoadedKey = jobKey;
  if (state !== 'loaded') return;
  if (target.complete) {
    onOrientation(target);
    return;
  }
  target.addEventListener('load', () => onOrientation(target), { once: true });
};

const ensureThumbLoad = (
  target: HTMLImageElement,
  jobKey: string,
  url: string,
  onOrientation: (node: HTMLImageElement) => void,
): Promise<ThumbLoadState> => {
  const cachedState = thumbLoadStateCache.get(jobKey);
  if (cachedState) return Promise.resolve(cachedState);
  const inflight = inflightThumbLoads.get(jobKey);
  if (inflight) return inflight;

  const request = new Promise<ThumbLoadState>((resolve) => {
    let settled = false;
    const settle = (state: ThumbLoadState) => {
      if (settled) return;
      settled = true;
      thumbLoadStateCache.set(jobKey, state);
      inflightThumbLoads.delete(jobKey);
      resolve(state);
    };

    const cleanup = () => {
      target.removeEventListener('load', handleLoad);
      target.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      cleanup();
      onOrientation(target);
      settle('loaded');
    };

    const handleError = () => {
      cleanup();
      settle('error');
    };

    target.addEventListener('load', handleLoad, { once: true });
    target.addEventListener('error', handleError, { once: true });

    if (target.currentSrc === url && target.complete && target.naturalWidth > 0) {
      handleLoad();
      return;
    }

    if (target.src !== url) {
      target.src = url;
    }
  });

  inflightThumbLoads.set(jobKey, request);
  return request;
};

export const requiresThumbNodeSync = (target: HTMLImageElement) => {
  const thumbUrl = target.dataset.thumbUrl || '';
  const jobKey = target.dataset.thumbJobKey || '';
  if (!thumbUrl || !jobKey) return false;
  return target.dataset.thumbLoadedKey !== jobKey;
};

export const hasPendingThumbNetworkLoad = (target: HTMLImageElement) => {
  const jobKey = target.dataset.thumbJobKey || '';
  if (!jobKey || !requiresThumbNodeSync(target)) return false;
  return !thumbLoadStateCache.has(jobKey);
};

export const queueThumbLoads = async (
  targets: HTMLImageElement[],
  timeoutMs: number,
  onOrientation: (node: HTMLImageElement) => void,
): Promise<void> => {
  const jobs = targets
    .map((target) => ({
      target,
      url: target.dataset.thumbUrl || '',
      fallback: target.dataset.thumbFallback || '',
      jobKey: target.dataset.thumbJobKey || '',
    }))
    .filter((job) => Boolean(job.url && job.jobKey));
  if (!jobs.length) return;

  let active = 0;
  let index = 0;
  let settled = false;

  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, timeoutMs);

    const settleIfDone = () => {
      if (index >= jobs.length && active === 0 && !settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve();
      }
    };

    const startNext = () => {
      while (active < THUMB_MAX_WORKERS && index < jobs.length) {
        const job = jobs[index++];
        const { target, url, jobKey } = job;
        if (!url || !jobKey) continue;

        const cachedState = thumbLoadStateCache.get(jobKey);
        if (cachedState) {
          syncThumbNode(target, cachedState, onOrientation);
          continue;
        }

        target.dataset.thumbState = 'loading';
        active += 1;
        void ensureThumbLoad(target, jobKey, url, onOrientation)
          .then((state) => {
            if (target.dataset.thumbJobKey === jobKey) {
              syncThumbNode(target, state, onOrientation);
            }
          })
          .finally(() => {
            active -= 1;
            settleIfDone();
            startNext();
          });
      }
      settleIfDone();
    };

    startNext();
  });
};
