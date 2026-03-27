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
}>();

function updateDebug(
  gridEl: HTMLElement,
  key: 'starts' | 'completes' | 'interrupts' | 'retargetKills' | 'staleFrameDrops' | 'noItemCommits' | 'startWithActive' | 'captures' | 'immediateStarts' | 'delayedStarts',
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

  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  const animationTargets = items;
  if (!items.length) {
    const applyCommit = commitLayout;
    applyCommit();
    updateDebug(gridEl, 'noItemCommits');
    const invariantFixups = clearTransforms();
    onSettled?.({ invariantFixups, queuedReplay: false });
    return;
  }

  updateDebug(gridEl, 'captures');
  const state = Flip.getState(animationTargets);
  const previous = activeByGrid.get(gridEl);
  if (previous) {
    updateDebug(gridEl, 'startWithActive');
    suppressInterruptCleanupByGrid.set(gridEl, true);
    previous.kill();
    suppressInterruptCleanupByGrid.set(gridEl, false);
    activeByGrid.delete(gridEl);
    updateDebug(gridEl, 'retargetKills');
  }

  Flip.killFlipsOf(animationTargets);
  gsap.killTweensOf(animationTargets);

  const nextRunId = (runIdByGrid.get(gridEl) ?? 0) + 1;
  runIdByGrid.set(gridEl, nextRunId);
  commitLayout();

  const startFlip = () => {
    if (runIdByGrid.get(gridEl) !== nextRunId) {
      updateDebug(gridEl, 'staleFrameDrops');
      const invariantFixups = clearTransforms();
      onSettled?.({ invariantFixups, queuedReplay: false });
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
        onSettled?.({ invariantFixups, queuedReplay: false });
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
        onSettled?.({ invariantFixups, queuedReplay: false });
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
      onSettled?.({ invariantFixups, queuedReplay: false });
      return;
    }
    window.requestAnimationFrame(() => {
      startFlip();
    });
  });
}
