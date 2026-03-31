/*
 * Canonical Explorer interaction contract.
 * Types/factories/invariants only; behavior lives in controller modules.
 */

export type PointerType = 'mouse' | 'touch' | 'pen' | 'unknown';

export type InteractionMode = 'idle' | 'tap_candidate' | 'hold_candidate' | 'drag' | 'pinch' | 'cancelled';

export type PointerSession = {
  pointerId: number | null;
  pointerType: PointerType;
  itemKey: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  pressX: number;
  pressY: number;
  moved: boolean;
  cancelled: boolean;
  mode: InteractionMode;
};

export type PinchSession = {
  active: boolean;
  pointerIds: number[];
  startDistance: number;
  currentDistance: number;
  startCenterX: number;
  startCenterY: number;
  currentCenterX: number;
  currentCenterY: number;
  scale: number;
};

export type InteractionState = {
  mode: InteractionMode;
  pointerSession: PointerSession | null;
  pinchSession: PinchSession | null;
};

export function createPointerSession(): PointerSession {
  return {
    pointerId: null,
    pointerType: 'unknown',
    itemKey: '',
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    pressX: 0,
    pressY: 0,
    moved: false,
    cancelled: false,
    mode: 'idle',
  };
}

export function createPinchSession(): PinchSession {
  return {
    active: false,
    pointerIds: [],
    startDistance: 0,
    currentDistance: 0,
    startCenterX: 0,
    startCenterY: 0,
    currentCenterX: 0,
    currentCenterY: 0,
    scale: 1,
  };
}

export function assertInteractionInvariants(state: InteractionState) {
  if (state.pointerSession && state.pinchSession?.active) {
    console.warn('[gestureContract] invalid state: pointer+pinch active');
  }
  if (state.pointerSession && state.pointerSession.pointerId == null) {
    console.warn('[gestureContract] invalid pointer session: pointerId missing');
  }
  if (state.pinchSession?.active && state.pinchSession.pointerIds.length < 2) {
    console.warn('[gestureContract] invalid pinch session: pointerIds<2');
  }
}
