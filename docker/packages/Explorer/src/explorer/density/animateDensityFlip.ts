import { Flip, gsap } from '../../lib/gsap';

export type AnimateDensityFlipOptions = {
  gridEl: HTMLElement;
  itemSelector?: string;
  commitLayout: () => void;
  interactionMode?: 'scrub' | 'settle' | 'pinch';
  jumpDistance?: number;
  onStart?: (meta: {
    targetCount: number;
    totalCount: number;
    targetReductionActive: boolean;
  }) => void;
  onSettled?: (meta: {
    invariantFixups: number;
    queuedReplay: boolean;
  }) => void;
};

const activeByGrid = new WeakMap<HTMLElement, gsap.core.Animation>();
const queuedByGrid = new WeakMap<HTMLElement, Omit<AnimateDensityFlipOptions, 'gridEl'>>();
const runIdByGrid = new WeakMap<HTMLElement, number>();
const suppressInterruptCleanupByGrid = new WeakMap<HTMLElement, boolean>();
const debugByGrid = new Map<HTMLElement, {
  starts: number;
  completes: number;
  interrupts: number;
  retargetKills: number;
  staleFrameDrops: number;
  noItemCommits: number;
  startWithActive: number;
  captures: number;
  immediateStarts: number;
  delayedStarts: number;
  deferredStarts: number;
  queuedReplays: number;
}>();

function updateDebug(
  gridEl: HTMLElement,
  key: 'starts' | 'completes' | 'interrupts' | 'retargetKills' | 'staleFrameDrops' | 'noItemCommits' | 'startWithActive' | 'captures' | 'immediateStarts' | 'delayedStarts' | 'deferredStarts' | 'queuedReplays',
) {
  const current = debugByGrid.get(gridEl) ?? {
    starts: 0,
    completes: 0,
    interrupts: 0,
    retargetKills: 0,
    staleFrameDrops: 0,
    noItemCommits: 0,
    startWithActive: 0,
    captures: 0,
    immediateStarts: 0,
    delayedStarts: 0,
    deferredStarts: 0,
    queuedReplays: 0,
  };
  current[key] += 1;
  debugByGrid.set(gridEl, current);
  (globalThis as typeof globalThis & {
    __explorerDensityFlipDebug?: { getStats: () => Array<Record<string, number>> };
  }).__explorerDensityFlipDebug = {
    getStats: () => {
      const stats: Array<Record<string, number>> = [];
      debugByGrid.forEach((value) => {
        stats.push({ ...value });
      });
      return stats;
    },
  };
}

export function animateDensityFlip({
  gridEl,
  itemSelector = '.masonry-card',
  commitLayout,
  interactionMode = 'scrub',
  jumpDistance = 1,
  onStart,
  onSettled,
}: AnimateDensityFlipOptions): void {
  const isPinch = interactionMode === 'pinch';
  const pickPinchTargets = (items: HTMLElement[]): HTMLElement[] => {
    const scrollHost = gridEl.closest<HTMLElement>('.scroll');
    if (!scrollHost) return items;
    const viewportTop = scrollHost.scrollTop;
    const viewportBottom = viewportTop + scrollHost.clientHeight;
    const bufferPx = 280;
    const maxTargets = 56;
    const visible = items.filter((card) => {
      const top = Number(card.dataset.layoutTop ?? card.offsetTop ?? 0);
      const bottom = Number(card.dataset.layoutBottom ?? (top + card.offsetHeight));
      return bottom >= (viewportTop - bufferPx) && top <= (viewportBottom + bufferPx);
    });
    if (!visible.length) return items.slice(0, maxTargets);
    return visible.slice(0, maxTargets);
  };
  const replayQueued = () => {
    const queued = queuedByGrid.get(gridEl);
    if (!queued) return false;
    queuedByGrid.delete(gridEl);
    updateDebug(gridEl, 'queuedReplays');
    window.requestAnimationFrame(() => {
      animateDensityFlip({
        ...queued,
        gridEl,
      });
    });
    return true;
  };
  const clearTransforms = () => {
    const currentItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
    if (!currentItems.length) return 0;
    let invariantFixups = 0;
    for (const card of currentItems) {
      if (card.style.transform && card.style.transform !== 'none') {
        invariantFixups += 1;
      }
    }
    gsap.set(currentItems, { clearProps: 'transform' });
    if (isPinch) return invariantFixups;
    for (const card of currentItems) {
      card.style.transition = 'none';
      card.style.transform = 'none';
    }
    queueMicrotask(() => {
      for (const card of currentItems) {
        card.style.removeProperty('transition');
      }
    });
    return invariantFixups;
  };

  const previous = activeByGrid.get(gridEl);
  if (previous) {
    updateDebug(gridEl, 'startWithActive');
    updateDebug(gridEl, 'deferredStarts');
    queuedByGrid.set(gridEl, {
      itemSelector,
      commitLayout,
      interactionMode,
      jumpDistance,
      onStart,
      onSettled,
    });
    return;
  }

  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  const animationTargets = isPinch ? pickPinchTargets(items) : items;
  if (!items.length) {
    const applyCommit = commitLayout;
    applyCommit();
    updateDebug(gridEl, 'noItemCommits');
    const invariantFixups = clearTransforms();
    const queuedReplay = replayQueued();
    onSettled?.({ invariantFixups, queuedReplay });
    return;
  }

  updateDebug(gridEl, 'captures');
  const state = Flip.getState(animationTargets);

  Flip.killFlipsOf(animationTargets);
  gsap.killTweensOf(animationTargets);

  const nextRunId = (runIdByGrid.get(gridEl) ?? 0) + 1;
  runIdByGrid.set(gridEl, nextRunId);
  commitLayout();

  const startFlip = () => {
    if (runIdByGrid.get(gridEl) !== nextRunId) {
      updateDebug(gridEl, 'staleFrameDrops');
      const invariantFixups = clearTransforms();
      const queuedReplay = replayQueued();
      onSettled?.({ invariantFixups, queuedReplay });
      return;
    }
    const animation = Flip.from(state, {
      targets: animationTargets,
      absolute: false,
      nested: false,
      prune: false,
      scale: isPinch ? false : true,
      duration: isPinch
        ? 0.12
        : interactionMode === 'scrub'
          ? (jumpDistance >= 2 ? 0.12 : 0.16)
          : (jumpDistance >= 2 ? 0.18 : 0.24),
      ease: isPinch
        ? 'power2.out'
        : interactionMode === 'scrub'
          ? (jumpDistance >= 2 ? 'power4.out' : 'power3.out')
          : (jumpDistance >= 2 ? 'power3.out' : 'power2.out'),
      simple: true,
      overwrite: true,
      onComplete: () => {
        updateDebug(gridEl, 'completes');
        const invariantFixups = clearTransforms();
        const queuedReplay = replayQueued();
        onSettled?.({ invariantFixups, queuedReplay });
        if (activeByGrid.get(gridEl) === animation) {
          activeByGrid.delete(gridEl);
        }
      },
      onInterrupt: () => {
        updateDebug(gridEl, 'interrupts');
        let invariantFixups = 0;
        if (!suppressInterruptCleanupByGrid.get(gridEl)) {
          invariantFixups = clearTransforms();
        }
        const queuedReplay = replayQueued();
        onSettled?.({ invariantFixups, queuedReplay });
        if (activeByGrid.get(gridEl) === animation) {
          activeByGrid.delete(gridEl);
        }
      },
    });
    onStart?.({
      targetCount: animationTargets.length,
      totalCount: items.length,
      targetReductionActive: animationTargets.length !== items.length,
    });
    updateDebug(gridEl, 'starts');
    activeByGrid.set(gridEl, animation);
  };

  if (interactionMode === 'scrub' || interactionMode === 'pinch') {
    updateDebug(gridEl, 'immediateStarts');
    startFlip();
    return;
  }

  updateDebug(gridEl, 'delayedStarts');
  window.requestAnimationFrame(() => {
    if (runIdByGrid.get(gridEl) !== nextRunId) {
      updateDebug(gridEl, 'staleFrameDrops');
      const invariantFixups = clearTransforms();
      const queuedReplay = replayQueued();
      onSettled?.({ invariantFixups, queuedReplay });
      return;
    }
    window.requestAnimationFrame(() => {
      startFlip();
    });
  });
}
