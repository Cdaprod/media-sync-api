import type { ExplorerDensityController } from './createExplorerDensityController';

export type PinchDensityController = {
  attach: () => void;
  detach: () => void;
  destroy: () => void;
};

export type PinchDensityControllerOptions = {
  gestureSurfaceEl: HTMLElement;
  visualScaleTargetEl: HTMLElement;
  getClassHostEl?: () => HTMLElement | null;
  density: ExplorerDensityController;
  outwardThreshold?: number;
  inwardThreshold?: number;
  onPinchFrame?: (a: { x: number; y: number } | null, b: { x: number; y: number } | null, active: boolean) => void;
  onPinchStep?: (dir: 1 | -1) => void;
  onPinchRelease?: () => void;
};

type TouchPair = {
  a: Touch;
  b: Touch;
};

export function createPinchDensityController(options: PinchDensityControllerOptions): PinchDensityController {
  const {
    gestureSurfaceEl,
    visualScaleTargetEl,
    getClassHostEl,
    density,
    outwardThreshold = 1.1,
    inwardThreshold = 0.9,
    onPinchFrame,
    onPinchStep,
    onPinchRelease,
  } = options;
  const resolveClassHostEl = () => getClassHostEl?.() ?? visualScaleTargetEl.closest<HTMLElement>('.content');

  const STEP_COOLDOWN_MS = 80;
  const rearmMin = 0.96;
  const rearmMax = 1.04;

  let active = false;
  let canStep = true;
  let baselineDistance = 0;
  let lastStepAt = 0;
  let settleClassTimer = 0;
  let releaseMotionHandoffTimer = 0;
  let lastViewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  let lastViewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const pinchDebug = {
    attached: false,
    starts: 0,
    startsRejectedSingleTouch: 0,
    moves: 0,
    movesWithoutPair: 0,
    stepsOut: 0,
    stepsIn: 0,
    cooldownSkips: 0,
    rearmSkips: 0,
    releaseCount: 0,
    viewportResets: 0,
    lastRatio: 1,
    lastTouchCount: 0,
    lastReason: 'init' as string,
  };

  const exposePinchDebug = () => {
    (globalThis as typeof globalThis & {
      __explorerPinchDebug?: { getSnapshot: () => typeof pinchDebug };
    }).__explorerPinchDebug = {
      getSnapshot: () => ({ ...pinchDebug }),
    };
  };
  exposePinchDebug();

  const clearSettleClassTimer = () => {
    if (!settleClassTimer) return;
    window.clearTimeout(settleClassTimer);
    settleClassTimer = 0;
  };

  const clearReleaseMotionHandoffTimer = () => {
    if (!releaseMotionHandoffTimer) return;
    window.clearTimeout(releaseMotionHandoffTimer);
    releaseMotionHandoffTimer = 0;
  };

  const enterSettlingClass = (contentEl: HTMLElement) => {
    if (contentEl.classList.contains('density-motion-settling')) return;
    contentEl.classList.add('density-motion-settling');
    settleClassTimer = window.setTimeout(() => {
      contentEl.classList.remove('density-motion-settling');
      settleClassTimer = 0;
    }, 360);
  };

  const handoffMotionAfterRelease = () => {
    const contentEl = resolveClassHostEl();
    if (!contentEl) return;
    if (contentEl.classList.contains('density-gesture-active')) return;
    if (!contentEl.classList.contains('density-motion-active')) return;
    contentEl.classList.remove('density-motion-active');
    enterSettlingClass(contentEl);
  };

  const setGestureActiveClass = (gestureActive: boolean) => {
    const contentEl = resolveClassHostEl();
    if (!contentEl) return;
    if (gestureActive) {
      clearSettleClassTimer();
      clearReleaseMotionHandoffTimer();
      contentEl.classList.remove('density-motion-settling');
      contentEl.classList.add('density-gesture-active');
      return;
    }
    contentEl.classList.remove('density-gesture-active');
    if (contentEl.classList.contains('density-motion-active')) return;
    enterSettlingClass(contentEl);
  };

  const resetGestureLifecycle = () => {
    active = false;
    canStep = true;
    baselineDistance = 0;
    lastStepAt = 0;
    clearReleaseMotionHandoffTimer();
    const contentEl = resolveClassHostEl();
    if (contentEl) {
      contentEl.classList.remove('density-gesture-active');
      contentEl.classList.remove('density-motion-active');
      contentEl.classList.remove('density-motion-settling');
    }
    density.settleScrub();
    onPinchFrame?.(null, null, false);
  };

  function getTouchPair(evt: TouchEvent): TouchPair | null {
    if (evt.touches.length < 2) return null;
    return { a: evt.touches[0], b: evt.touches[1] };
  }

  function distance(pair: TouchPair): number {
    const dx = pair.b.clientX - pair.a.clientX;
    const dy = pair.b.clientY - pair.a.clientY;
    return Math.hypot(dx, dy);
  }

  function onTouchStart(evt: TouchEvent) {
    const pair = getTouchPair(evt);
    pinchDebug.lastTouchCount = evt.touches.length;
    if (!pair) {
      pinchDebug.startsRejectedSingleTouch += 1;
      pinchDebug.lastReason = 'touchstart_without_pair';
      exposePinchDebug();
      return;
    }

    active = true;
    pinchDebug.starts += 1;
    pinchDebug.lastReason = 'touchstart_armed';
    canStep = true;
    baselineDistance = Math.max(distance(pair), 1);
    lastStepAt = 0;
    setGestureActiveClass(true);
    onPinchFrame?.(
      { x: pair.a.clientX, y: pair.a.clientY },
      { x: pair.b.clientX, y: pair.b.clientY },
      true,
    );
    exposePinchDebug();
  }

  function onTouchMove(evt: TouchEvent) {
    if (!active) return;
    pinchDebug.moves += 1;
    pinchDebug.lastTouchCount = evt.touches.length;
    const pair = getTouchPair(evt);
    if (!pair) {
      pinchDebug.movesWithoutPair += 1;
      pinchDebug.lastReason = 'touchmove_pair_lost';
      exposePinchDebug();
      onTouchEnd();
      return;
    }
    onPinchFrame?.(
      { x: pair.a.clientX, y: pair.a.clientY },
      { x: pair.b.clientX, y: pair.b.clientY },
      true,
    );

    evt.preventDefault();
    const currentDistance = Math.max(distance(pair), 1);
    const ratio = currentDistance / Math.max(baselineDistance, 1);
    pinchDebug.lastRatio = ratio;

    if (!canStep) {
      if (ratio >= rearmMin && ratio <= rearmMax) {
        canStep = true;
        baselineDistance = currentDistance;
        pinchDebug.lastReason = 'rearmed';
        exposePinchDebug();
      } else {
        pinchDebug.rearmSkips += 1;
        pinchDebug.lastReason = 'awaiting_rearm_band';
        exposePinchDebug();
      }
      return;
    }

    const now = performance.now();
    if ((now - lastStepAt) < STEP_COOLDOWN_MS) {
      pinchDebug.cooldownSkips += 1;
      pinchDebug.lastReason = 'cooldown_skip';
      exposePinchDebug();
      return;
    }

    if (ratio >= outwardThreshold) {
      const currentColumns = density.getColumns();
      density.setColumnsForPinch(currentColumns - 1);
      onPinchStep?.(1);
      pinchDebug.stepsOut += 1;
      pinchDebug.lastReason = 'step_out';
      baselineDistance = currentDistance;
      canStep = false;
      lastStepAt = now;
      exposePinchDebug();
      return;
    }
    if (ratio <= inwardThreshold) {
      const currentColumns = density.getColumns();
      density.setColumnsForPinch(currentColumns + 1);
      onPinchStep?.(-1);
      pinchDebug.stepsIn += 1;
      pinchDebug.lastReason = 'step_in';
      baselineDistance = currentDistance;
      canStep = false;
      lastStepAt = now;
      exposePinchDebug();
      return;
    }
    pinchDebug.lastReason = 'move_no_threshold_cross';
    exposePinchDebug();
  }

  function onTouchEnd() {
    if (!active) return;
    active = false;
    canStep = true;
    baselineDistance = 0;
    lastStepAt = 0;
    setGestureActiveClass(false);
    density.settleScrub();
    clearReleaseMotionHandoffTimer();
    pinchDebug.releaseCount += 1;
    pinchDebug.lastReason = 'touchend_release';
    releaseMotionHandoffTimer = window.setTimeout(() => {
      releaseMotionHandoffTimer = 0;
      handoffMotionAfterRelease();
    }, 120);
    onPinchFrame?.(null, null, false);
    onPinchRelease?.();
    exposePinchDebug();
  }

  function onViewportBoundaryChange() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === lastViewportWidth && height === lastViewportHeight) return;
    lastViewportWidth = width;
    lastViewportHeight = height;
    pinchDebug.viewportResets += 1;
    pinchDebug.lastReason = 'viewport_boundary_reset';
    exposePinchDebug();
    resetGestureLifecycle();
  }

  function attach() {
    gestureSurfaceEl.addEventListener('touchstart', onTouchStart, { passive: true });
    gestureSurfaceEl.addEventListener('touchmove', onTouchMove, { passive: false });
    gestureSurfaceEl.addEventListener('touchend', onTouchEnd, { passive: true });
    gestureSurfaceEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('resize', onViewportBoundaryChange, { passive: true });
    window.addEventListener('orientationchange', onViewportBoundaryChange, { passive: true });
    pinchDebug.attached = true;
    pinchDebug.lastReason = 'attached';
    exposePinchDebug();
  }

  function detach() {
    gestureSurfaceEl.removeEventListener('touchstart', onTouchStart);
    gestureSurfaceEl.removeEventListener('touchmove', onTouchMove);
    gestureSurfaceEl.removeEventListener('touchend', onTouchEnd);
    gestureSurfaceEl.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('resize', onViewportBoundaryChange);
    window.removeEventListener('orientationchange', onViewportBoundaryChange);
    pinchDebug.attached = false;
    pinchDebug.lastReason = 'detached';
    exposePinchDebug();
  }

  function destroy() {
    clearSettleClassTimer();
    clearReleaseMotionHandoffTimer();
    const contentEl = resolveClassHostEl();
    if (contentEl) {
      contentEl.classList.remove('density-gesture-active');
      contentEl.classList.remove('density-motion-active');
      contentEl.classList.remove('density-motion-settling');
    }
    detach();
  }

  return { attach, detach, destroy };
}
