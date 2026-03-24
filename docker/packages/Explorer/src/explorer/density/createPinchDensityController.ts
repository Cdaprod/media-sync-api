import { gsap } from '../../lib/gsap';
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
  scaleThresholdPerStep?: number;
  minScale?: number;
  maxScale?: number;
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
    scaleThresholdPerStep = 0.12,
    minScale = 0.86,
    maxScale = 1.18,
  } = options;

  let active = false;
  let initialDistance = 0;
  let initialColumns = density.getColumns();
  let pendingColumns = initialColumns;

  const setScale = gsap.quickSetter(visualScaleTargetEl, 'scale');

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
    initialDistance = distance(pair);
    initialColumns = density.getColumns();
    pendingColumns = initialColumns;
  }

  function onTouchMove(evt: TouchEvent) {
    if (!active) return;
    const pair = getTouchPair(evt);
    if (!pair) return;

    evt.preventDefault();

    const nextDistance = distance(pair);
    const ratio = nextDistance / Math.max(initialDistance, 1);

    const clampedVisual = Math.max(minScale, Math.min(maxScale, ratio));
    setScale(clampedVisual);

    const signedDelta = -((ratio - 1) / scaleThresholdPerStep);
    const nextColumns = Math.round(initialColumns + signedDelta);

    if (nextColumns !== pendingColumns) {
      pendingColumns = nextColumns;
      density.setColumns(pendingColumns, true);
    }
  }

  function settleVisualScale() {
    gsap.to(visualScaleTargetEl, {
      scale: 1,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }

  function onTouchEnd() {
    if (!active) return;
    active = false;
    settleVisualScale();
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
    detach();
  }

  return { attach, detach, destroy };
}
