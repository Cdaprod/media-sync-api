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
const motionStartAtByGrid = new WeakMap<HTMLElement, number>();
const lastRunUsedFlipByGrid = new WeakMap<HTMLElement, boolean>();
const motionDebugByGrid = new Map<HTMLElement, {
  totalCardCount: number;
  animatedTargetCount: number;
  visibleCardCount: number;
  targetReductionActive: boolean;
  viewportTop: number;
  viewportBottom: number;
  bufferPx: number;
  motionActive: boolean;
  simplifiedCardMode: boolean;
  lastDurationMs: number;
  flipIsolationEnabled: boolean;
  lastRunUsedFlip: boolean;
}>();
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

function updateMotionDebug(
  gridEl: HTMLElement,
  stats: {
    totalCardCount: number;
    animatedTargetCount: number;
    visibleCardCount: number;
    targetReductionActive: boolean;
    viewportTop: number;
    viewportBottom: number;
    bufferPx: number;
    motionActive: boolean;
    simplifiedCardMode: boolean;
    lastDurationMs: number;
    flipIsolationEnabled: boolean;
    lastRunUsedFlip: boolean;
  },
) {
  motionDebugByGrid.set(gridEl, stats);
  (globalThis as typeof globalThis & {
    __explorerDensityMotionDebug?: { getSnapshot: () => Array<Record<string, number | boolean>> };
  }).__explorerDensityMotionDebug = {
    getSnapshot: () => {
      const snapshots: Array<Record<string, number | boolean>> = [];
      motionDebugByGrid.forEach((value) => {
        snapshots.push({ ...value });
      });
      return snapshots;
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
  const ENABLE_DENSITY_FLIP_ANIMATION = false;
  const isPinch = interactionMode === 'pinch';
  const setDensityMotionActive = (active: boolean) => {
    const contentEl = gridEl.closest<HTMLElement>('.content');
    if (!contentEl) return;
    if (active) {
      contentEl.classList.add('density-motion-active');
      motionStartAtByGrid.set(gridEl, performance.now());
      return;
    }
    contentEl.classList.remove('density-motion-active');
    motionStartAtByGrid.delete(gridEl);
  };
  const pickAnimatedTargets = (items: HTMLElement[]) => {
    const scrollHost = gridEl.closest<HTMLElement>('.scroll');
    if (!scrollHost) {
      updateMotionDebug(gridEl, {
        totalCardCount: items.length,
        animatedTargetCount: items.length,
        visibleCardCount: items.length,
        targetReductionActive: false,
        viewportTop: 0,
        viewportBottom: 0,
        bufferPx: 0,
        motionActive: Boolean(activeByGrid.get(gridEl)),
        simplifiedCardMode: true,
        lastDurationMs: 0,
        flipIsolationEnabled: !ENABLE_DENSITY_FLIP_ANIMATION,
        lastRunUsedFlip: lastRunUsedFlipByGrid.get(gridEl) ?? true,
      });
      return items;
    }
    const viewportTop = scrollHost.scrollTop;
    const viewportBottom = viewportTop + scrollHost.clientHeight;
    const bufferPx = 320;
    const maxTargets = 72;
    const readBounds = (card: HTMLElement) => {
      const top = Number(card.dataset.layoutTop ?? card.offsetTop ?? 0);
      const bottom = Number(card.dataset.layoutBottom ?? (top + card.offsetHeight));
      return { top, bottom };
    };
    const visible = items.filter((card) => {
      const { top, bottom } = readBounds(card);
      return bottom >= viewportTop && top <= viewportBottom;
    });
    const nearVisible = items.filter((card) => {
      const { top, bottom } = readBounds(card);
      return bottom >= (viewportTop - bufferPx) && top <= (viewportBottom + bufferPx);
    });
    const targets = (nearVisible.length ? nearVisible : visible).slice(0, maxTargets);
    const reducedTargets = targets.length ? targets : items.slice(0, maxTargets);
    updateMotionDebug(gridEl, {
      totalCardCount: items.length,
      animatedTargetCount: reducedTargets.length,
      visibleCardCount: visible.length,
      targetReductionActive: reducedTargets.length !== items.length,
      viewportTop,
      viewportBottom,
      bufferPx,
      motionActive: Boolean(activeByGrid.get(gridEl)),
      simplifiedCardMode: true,
      lastDurationMs: 0,
      flipIsolationEnabled: !ENABLE_DENSITY_FLIP_ANIMATION,
      lastRunUsedFlip: lastRunUsedFlipByGrid.get(gridEl) ?? true,
    });
    return reducedTargets;
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

  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  const animationTargets = pickAnimatedTargets(items);
  if (!items.length) {
    const applyCommit = commitLayout;
    applyCommit();
    updateDebug(gridEl, 'noItemCommits');
    lastRunUsedFlipByGrid.set(gridEl, false);
    const invariantFixups = clearTransforms();
    setDensityMotionActive(false);
    onSettled?.({ invariantFixups, queuedReplay: false });
    return;
  }

  if (!ENABLE_DENSITY_FLIP_ANIMATION) {
    const previous = activeByGrid.get(gridEl);
    if (previous) {
      previous.kill();
      activeByGrid.delete(gridEl);
    }
    const applyCommit = commitLayout;
    applyCommit();
    updateDebug(gridEl, 'noItemCommits');
    lastRunUsedFlipByGrid.set(gridEl, false);
    const snapshot = motionDebugByGrid.get(gridEl);
    if (snapshot) {
      motionDebugByGrid.set(gridEl, {
        ...snapshot,
        motionActive: false,
        lastDurationMs: 0,
        flipIsolationEnabled: true,
        lastRunUsedFlip: false,
      });
    }
    const invariantFixups = clearTransforms();
    setDensityMotionActive(false);
    onStart?.({
      targetCount: animationTargets.length,
      totalCount: items.length,
      targetReductionActive: animationTargets.length !== items.length,
    });
    onSettled?.({ invariantFixups, queuedReplay: false });
    return;
  }

  updateDebug(gridEl, 'captures');
  lastRunUsedFlipByGrid.set(gridEl, true);
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
      setDensityMotionActive(false);
      onSettled?.({ invariantFixups, queuedReplay: false });
      return;
    }
    setDensityMotionActive(true);
    const snapshot = motionDebugByGrid.get(gridEl);
    if (snapshot) {
      motionDebugByGrid.set(gridEl, {
        ...snapshot,
        motionActive: true,
      });
    }
    const animation = Flip.from(state, {
      targets: animationTargets,
      absolute: false,
      nested: false,
      prune: false,
      scale: false,
      duration: isPinch
        ? 0.14
        : interactionMode === 'scrub'
          ? (jumpDistance >= 2 ? 0.16 : 0.2)
          : (jumpDistance >= 2 ? 0.22 : 0.28),
      ease: isPinch
        ? 'power2.out'
        : interactionMode === 'scrub'
          ? 'power2.out'
          : 'power2.out',
      simple: true,
      overwrite: true,
      onComplete: () => {
        updateDebug(gridEl, 'completes');
        const invariantFixups = clearTransforms();
        setDensityMotionActive(false);
        const snapshot = motionDebugByGrid.get(gridEl);
        if (snapshot) {
          motionDebugByGrid.set(gridEl, {
            ...snapshot,
            motionActive: false,
            lastDurationMs: Math.max(0, performance.now() - (motionStartAtByGrid.get(gridEl) ?? performance.now())),
          });
        }
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
        setDensityMotionActive(false);
        const snapshot = motionDebugByGrid.get(gridEl);
        if (snapshot) {
          motionDebugByGrid.set(gridEl, {
            ...snapshot,
            motionActive: false,
            lastDurationMs: Math.max(0, performance.now() - (motionStartAtByGrid.get(gridEl) ?? performance.now())),
          });
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

  if (interactionMode === 'pinch') {
    updateDebug(gridEl, 'immediateStarts');
    startFlip();
    return;
  }

  if (interactionMode === 'scrub') {
    updateDebug(gridEl, 'immediateStarts');
    startFlip();
    return;
  }

  updateDebug(gridEl, 'delayedStarts');
  window.requestAnimationFrame(() => {
    if (runIdByGrid.get(gridEl) !== nextRunId) {
      updateDebug(gridEl, 'staleFrameDrops');
      const invariantFixups = clearTransforms();
      setDensityMotionActive(false);
      onSettled?.({ invariantFixups, queuedReplay: false });
      return;
    }
    window.requestAnimationFrame(() => {
      startFlip();
    });
  });
}
