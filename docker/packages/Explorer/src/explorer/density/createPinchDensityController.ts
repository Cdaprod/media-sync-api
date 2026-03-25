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
    outwardThreshold = 1.12,
    inwardThreshold = 0.88,
  } = options;
  void visualScaleTargetEl;

  let active = false;
  let stepped = false;
  let initialDistance = 0;
  let initialColumns = density.getColumns();

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
    stepped = false;
    initialDistance = distance(pair);
    initialColumns = density.getColumns();
  }

  function onTouchMove(evt: TouchEvent) {
    if (!active) return;
    const pair = getTouchPair(evt);
    if (!pair) return;

    evt.preventDefault();
    if (stepped) return;

    const nextDistance = distance(pair);
    const ratio = nextDistance / Math.max(initialDistance, 1);

    if (ratio >= outwardThreshold) {
      density.setColumns(initialColumns - 1, true);
      stepped = true;
      return;
    }
    if (ratio <= inwardThreshold) {
      density.setColumns(initialColumns + 1, true);
      stepped = true;
    }
  }

  function onTouchEnd() {
    if (!active) return;
    active = false;
    stepped = false;
    density.settleScrub();
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
