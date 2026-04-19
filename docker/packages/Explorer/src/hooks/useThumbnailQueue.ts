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
const THUMB_QUEUE_REQUEUE_DELAY_MS = 90;
const THUMB_QUEUE_IDLE_REQUEUE_MS = 1400;

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
    const scrollHost = root.closest<HTMLElement>('.scroll');
    let cancelled = false;
    let runPassRaf = 0;
    let requeueTimer = 0;
    let passCount = 0;

    const publishDebug = (args: {
      totalTargets: number;
      syncTargets: number;
      nearViewportTargets: number;
      queueTargets: number;
      remainingSyncTargets: number;
    }) => {
      (window as typeof window & {
        __explorerThumbQueueDebug?: {
          selector: string;
          totalTargets: number;
          syncTargets: number;
          nearViewportTargets: number;
          queueTargets: number;
          remainingSyncTargets: number;
          passCount: number;
        };
      }).__explorerThumbQueueDebug = {
        selector,
        passCount,
        ...args,
      };
    };

    const clearRequeueTimer = () => {
      if (!requeueTimer) return;
      window.clearTimeout(requeueTimer);
      requeueTimer = 0;
    };
    const scheduleQueuePass = (delayMs = 0) => {
      clearRequeueTimer();
      requeueTimer = window.setTimeout(() => {
        requeueTimer = 0;
        if (cancelled) return;
        if (runPassRaf) return;
        runPassRaf = window.requestAnimationFrame(() => {
          runPassRaf = 0;
          runQueuePass();
        });
      }, delayMs);
    };
    const runQueuePass = () => {
      if (cancelled) return;
      passCount += 1;
      const targets = Array.from(root.querySelectorAll(selector)) as HTMLImageElement[];
      const syncTargets = targets.filter((target) => requiresThumbNodeSync(target));
      const nearViewportTargets = syncTargets.filter((target) => isNearViewportTarget(target, root));
      const relevantTargets = nearViewportTargets.length ? nearViewportTargets : syncTargets;
      const queueTargets = relevantTargets.slice(0, THUMB_QUEUE_BOOT_MAX_TARGETS);
      const shouldShowOverlay = pendingDataLoadOverlay && queueTargets.some((target) => hasPendingThumbNetworkLoad(target));
      const loadingToken = shouldShowOverlay ? beginContentLoading() : 0;
      publishDebug({
        totalTargets: targets.length,
        syncTargets: syncTargets.length,
        nearViewportTargets: nearViewportTargets.length,
        queueTargets: queueTargets.length,
        remainingSyncTargets: Math.max(0, relevantTargets.length - queueTargets.length),
      });

      if (!queueTargets.length) {
        endContentLoading(loadingToken);
        clearPendingDataLoadOverlay();
        return;
      }

      queueThumbLoads(queueTargets, THUMB_LOAD_TIMEOUT_MS, updateCardOrientation)
        .finally(() => {
          if (cancelled) return;
          endContentLoading(loadingToken);
          clearPendingDataLoadOverlay();
          const hasRemaining = relevantTargets.some((target) => requiresThumbNodeSync(target));
          if (hasRemaining) {
            scheduleQueuePass(THUMB_QUEUE_REQUEUE_DELAY_MS);
          }
        });
    };

    const onViewportActivity = () => {
      scheduleQueuePass();
    };
    runQueuePass();
    scrollHost?.addEventListener('scroll', onViewportActivity, { passive: true });
    window.addEventListener('resize', onViewportActivity);
    const idleInterval = window.setInterval(() => scheduleQueuePass(), THUMB_QUEUE_IDLE_REQUEUE_MS);
    const domObserver = new MutationObserver(() => scheduleQueuePass());
    domObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-thumb-job-key', 'data-thumb-loaded-key', 'data-thumb-url'],
    });

    return () => {
      cancelled = true;
      scrollHost?.removeEventListener('scroll', onViewportActivity);
      window.removeEventListener('resize', onViewportActivity);
      window.clearInterval(idleInterval);
      domObserver.disconnect();
      clearRequeueTimer();
      if (runPassRaf) {
        window.cancelAnimationFrame(runPassRaf);
        runPassRaf = 0;
      }
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
