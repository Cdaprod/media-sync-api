import { canonicalAssetSource } from './state';
import type { MediaItem } from './types';

export const THUMB_LOAD_TIMEOUT_MS = 8000;
const THUMB_MAX_WORKERS = 3;

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
        return `${window.location.origin}${parsed.pathname}${parsed.search}`;
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

const ensureThumbLoad = (jobKey: string, url: string): Promise<ThumbLoadState> => {
  const cachedState = thumbLoadStateCache.get(jobKey);
  if (cachedState) return Promise.resolve(cachedState);
  const inflight = inflightThumbLoads.get(jobKey);
  if (inflight) return inflight;

  const request = new Promise<ThumbLoadState>((resolve) => {
    const loader = new Image();
    loader.onload = () => {
      thumbLoadStateCache.set(jobKey, 'loaded');
      inflightThumbLoads.delete(jobKey);
      resolve('loaded');
    };
    loader.onerror = () => {
      thumbLoadStateCache.set(jobKey, 'error');
      inflightThumbLoads.delete(jobKey);
      resolve('error');
    };
    loader.src = url;
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
        void ensureThumbLoad(jobKey, url)
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
