import { createPointerSession, type PointerSession, type PointerType } from './gestureContract';

export const POINTER_THRESHOLD_BASE = 8;
export const LONG_PRESS_MOVE_CANCEL_PX_BASE = 12;
export const TOUCH_TAP_CANCEL_PX_BASE = 18;

export type PointerMoveMetrics = {
  dx: number;
  dy: number;
  thresholdScale: number;
  longPressMoveCancelPx: number;
  touchTapCancelPx: number;
  pointerThresholdPx: number;
  movedFarForLongPress: boolean;
  movedFarForTouchTapCancel: boolean;
  movedFarForDrag: boolean;
};

export function createPointerSessionState(): PointerSession {
  return createPointerSession();
}

export function resetPointerSessionState(session: PointerSession) {
  const reset = createPointerSession();
  Object.assign(session, reset);
}

export function assignPointerDownSession(
  session: PointerSession,
  params: { pointerId: number; pointerType: string; itemKey: string; x: number; y: number },
) {
  session.pointerId = params.pointerId;
  session.pointerType = normalizePointerType(params.pointerType);
  session.itemKey = params.itemKey;
  session.startX = params.x;
  session.startY = params.y;
  session.currentX = params.x;
  session.currentY = params.y;
  session.pressX = params.x;
  session.pressY = params.y;
  session.moved = false;
  session.cancelled = false;
  session.mode = 'tap_candidate';
}

export function computePointerMoveMetrics(
  session: PointerSession,
  params: { x: number; y: number; pointerType: string; devicePixelRatio: number },
): PointerMoveMetrics {
  const dx = params.x - session.startX;
  const dy = params.y - session.startY;
  const thresholdScale = getGestureThresholdScale(params.pointerType, params.devicePixelRatio);
  const longPressMoveCancelPx = LONG_PRESS_MOVE_CANCEL_PX_BASE * thresholdScale;
  const touchTapCancelPx = TOUCH_TAP_CANCEL_PX_BASE * thresholdScale;
  const pointerThresholdPx = POINTER_THRESHOLD_BASE * thresholdScale;
  return {
    dx,
    dy,
    thresholdScale,
    longPressMoveCancelPx,
    touchTapCancelPx,
    pointerThresholdPx,
    movedFarForLongPress: (dx * dx + dy * dy) > longPressMoveCancelPx * longPressMoveCancelPx,
    movedFarForTouchTapCancel: (dx * dx + dy * dy) > touchTapCancelPx * touchTapCancelPx,
    movedFarForDrag: (dx * dx + dy * dy) > pointerThresholdPx * pointerThresholdPx,
  };
}

export function getGestureThresholdScale(pointerType: string, dpr: number) {
  if (pointerType === 'mouse') return 1;
  return Math.max(1, Math.min(2.25, dpr || 1));
}

export function isTouchLikePointer(pointerType: string) {
  return pointerType === 'touch' || pointerType === 'pen';
}

function normalizePointerType(pointerType: string): PointerType {
  if (pointerType === 'mouse' || pointerType === 'touch' || pointerType === 'pen') return pointerType;
  return 'unknown';
}
