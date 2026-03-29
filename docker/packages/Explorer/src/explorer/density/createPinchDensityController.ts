import type { ExplorerDensityController } from './createExplorerDensityController';

export type PinchDensityController = {
  attach: () => void;
  detach: () => void;
  destroy: () => void;
};

export type PinchDensityControllerOptions = {
  gestureSurfaceEl: HTMLElement;
  visualScaleTargetEl: HTMLElement;
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
    density,
    outwardThreshold = 1.1,
    inwardThreshold = 0.9,
    onPinchFrame,
    onPinchStep,
    onPinchRelease,
  } = options;
  const contentEl = visualScaleTargetEl.closest<HTMLElement>('.content');

  const STEP_COOLDOWN_MS = 80;
  const rearmMin = 0.96;
  const rearmMax = 1.04;

  let active = false;
  let canStep = true;
  let baselineDistance = 0;
  let lastStepAt = 0;
  let settleClassTimer = 0;

  const clearSettleClassTimer = () => {
    if (!settleClassTimer) return;
    window.clearTimeout(settleClassTimer);
    settleClassTimer = 0;
  };

  const setGestureActiveClass = (gestureActive: boolean) => {
    if (!contentEl) return;
    if (gestureActive) {
      clearSettleClassTimer();
      contentEl.classList.remove('density-motion-settling');
      contentEl.classList.add('density-gesture-active');
      return;
    }
    contentEl.classList.remove('density-gesture-active');
    if (contentEl.classList.contains('density-motion-active')) return;
    if (contentEl.classList.contains('density-motion-settling')) return;
    contentEl.classList.add('density-motion-settling');
    settleClassTimer = window.setTimeout(() => {
      contentEl.classList.remove('density-motion-settling');
      settleClassTimer = 0;
    }, 360);
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
    if (!pair) return;

    active = true;
    canStep = true;
    baselineDistance = Math.max(distance(pair), 1);
    lastStepAt = 0;
    setGestureActiveClass(true);
    onPinchFrame?.(
      { x: pair.a.clientX, y: pair.a.clientY },
      { x: pair.b.clientX, y: pair.b.clientY },
      true,
    );
  }

  function onTouchMove(evt: TouchEvent) {
    if (!active) return;
    const pair = getTouchPair(evt);
    if (!pair) {
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

    if (!canStep) {
      if (ratio >= rearmMin && ratio <= rearmMax) {
        canStep = true;
        baselineDistance = currentDistance;
      }
      return;
    }

    const now = performance.now();
    if ((now - lastStepAt) < STEP_COOLDOWN_MS) return;

    if (ratio >= outwardThreshold) {
      const currentColumns = density.getColumns();
      density.setColumnsForPinch(currentColumns - 1);
      onPinchStep?.(1);
      baselineDistance = currentDistance;
      canStep = false;
      lastStepAt = now;
      return;
    }
    if (ratio <= inwardThreshold) {
      const currentColumns = density.getColumns();
      density.setColumnsForPinch(currentColumns + 1);
      onPinchStep?.(-1);
      baselineDistance = currentDistance;
      canStep = false;
      lastStepAt = now;
    }
  }

  function onTouchEnd() {
    if (!active) return;
    active = false;
    canStep = true;
    baselineDistance = 0;
    lastStepAt = 0;
    setGestureActiveClass(false);
    density.settleScrub();
    onPinchFrame?.(null, null, false);
    onPinchRelease?.();
  }

  function attach() {
    gestureSurfaceEl.addEventListener('touchstart', onTouchStart, { passive: true });
    gestureSurfaceEl.addEventListener('touchmove', onTouchMove, { passive: false });
    gestureSurfaceEl.addEventListener('touchend', onTouchEnd, { passive: true });
    gestureSurfaceEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  function detach() {
    gestureSurfaceEl.removeEventListener('touchstart', onTouchStart);
    gestureSurfaceEl.removeEventListener('touchmove', onTouchMove);
    gestureSurfaceEl.removeEventListener('touchend', onTouchEnd);
    gestureSurfaceEl.removeEventListener('touchcancel', onTouchEnd);
  }

  function destroy() {
    clearSettleClassTimer();
    if (contentEl) {
      contentEl.classList.remove('density-gesture-active');
      contentEl.classList.remove('density-motion-settling');
    }
    detach();
  }

  return { attach, detach, destroy };
}
