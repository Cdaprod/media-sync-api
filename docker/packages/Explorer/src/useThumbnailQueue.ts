import { useEffect } from 'react';
import type { RefObject } from 'react';

import {
  THUMB_LOAD_TIMEOUT_MS,
  hasPendingThumbNetworkLoad,
  queueThumbLoads,
  requiresThumbNodeSync,
} from './thumbnailLoader';

interface UseThumbnailQueueOptions {
  beginContentLoading: () => number;
  clearPendingDataLoadOverlay: () => void;
  endContentLoading: (token: number) => void;
  pendingDataLoadOverlay: boolean;
  rootRef: RefObject<HTMLDivElement>;
  thumbDatasetSignature: string;
  updateCardOrientation: (node: HTMLImageElement) => void;
  view: 'grid' | 'list';
}

export function useThumbnailQueue({
  beginContentLoading,
  clearPendingDataLoadOverlay,
  endContentLoading,
  pendingDataLoadOverlay,
  rootRef,
  thumbDatasetSignature,
  updateCardOrientation,
  view,
}: UseThumbnailQueueOptions) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = rootRef.current;
    if (!root || !thumbDatasetSignature) return;

    const selector = view === 'grid'
      ? '.grid img.asset-thumb[data-thumb-url]'
      : '.list img.asset-thumb[data-thumb-url]';
    const targets = Array.from(root.querySelectorAll(selector)) as HTMLImageElement[];
    const syncTargets = targets.filter((target) => requiresThumbNodeSync(target));
    const shouldShowOverlay = pendingDataLoadOverlay && syncTargets.some((target) => hasPendingThumbNetworkLoad(target));
    const loadingToken = shouldShowOverlay ? beginContentLoading() : 0;

    if (!syncTargets.length) {
      endContentLoading(loadingToken);
      clearPendingDataLoadOverlay();
      return;
    }

    let cancelled = false;
    queueThumbLoads(syncTargets, THUMB_LOAD_TIMEOUT_MS, updateCardOrientation)
      .finally(() => {
        if (cancelled) return;
        endContentLoading(loadingToken);
        clearPendingDataLoadOverlay();
      });

    return () => {
      cancelled = true;
    };
  }, [
    beginContentLoading,
    clearPendingDataLoadOverlay,
    endContentLoading,
    pendingDataLoadOverlay,
    rootRef,
    thumbDatasetSignature,
    updateCardOrientation,
    view,
  ]);
}
