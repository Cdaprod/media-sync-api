import { useEffect } from 'react';
import type { RefObject } from 'react';

import {
  THUMB_LOAD_TIMEOUT_MS,
  hasPendingThumbNetworkLoad,
  queueThumbLoads,
  requiresThumbNodeSync,
} from '../thumbnailLoader';

const THUMB_QUEUE_VIEWPORT_BUFFER_PX = 320;
const THUMB_QUEUE_BOOT_MAX_TARGETS = 24;

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

function isNearViewportTarget(target: HTMLImageElement, root: HTMLDivElement) {
  const viewportEl = root.closest<HTMLElement>('.scroll');
  const viewportRect = viewportEl?.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const topBound = (viewportRect?.top ?? 0) - THUMB_QUEUE_VIEWPORT_BUFFER_PX;
  const bottomBound = (viewportRect?.bottom ?? window.innerHeight) + THUMB_QUEUE_VIEWPORT_BUFFER_PX;
  return targetRect.bottom >= topBound && targetRect.top <= bottomBound;
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
    const nearViewportTargets = syncTargets.filter((target) => isNearViewportTarget(target, root));
    const queueTargets = (
      nearViewportTargets.length
        ? nearViewportTargets
        : syncTargets
    ).slice(0, THUMB_QUEUE_BOOT_MAX_TARGETS);
    const shouldShowOverlay = pendingDataLoadOverlay && queueTargets.some((target) => hasPendingThumbNetworkLoad(target));
    const loadingToken = shouldShowOverlay ? beginContentLoading() : 0;
    (window as typeof window & {
      __explorerThumbQueueDebug?: {
        selector: string;
        totalTargets: number;
        syncTargets: number;
        nearViewportTargets: number;
        queueTargets: number;
      };
    }).__explorerThumbQueueDebug = {
      selector,
      totalTargets: targets.length,
      syncTargets: syncTargets.length,
      nearViewportTargets: nearViewportTargets.length,
      queueTargets: queueTargets.length,
    };

    if (!queueTargets.length) {
      endContentLoading(loadingToken);
      clearPendingDataLoadOverlay();
      return;
    }

    let cancelled = false;
    queueThumbLoads(queueTargets, THUMB_LOAD_TIMEOUT_MS, updateCardOrientation)
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
