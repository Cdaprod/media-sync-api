export const FOCUS_WORLD_OPEN_DURATION_MS = 340;
export const FOCUS_OVERLAY_REVEAL_DELAY_MS = 220;
export const FOCUS_SAFE_FRAME_HORIZONTAL_PAD_PX = 28;
export const FOCUS_SAFE_FRAME_VERTICAL_PAD_PX = 32;
export const FOCUS_SAFE_FRAME_DRAWER_RESERVE_PX = 320;
export const FOCUS_SAFE_FRAME_TOPBAR_RESERVE_PX = 88;
export const FOCUS_SAFE_FRAME_MOBILE_BOTTOM_RESERVE_PX = 220;
export const FOCUS_WORLD_MAX_SCALE = 2.85;
export const FOCUS_WORLD_MIN_SCALE = 1;
const MAX_TRANSLATE_VIEWPORT_FACTOR = 1.5;

export interface FocusWorldTransform {
  scale: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
}

export type FocusWorldGuardFailureReason = 'invalid-scale' | 'non-finite' | 'absurd-translation';

export interface FocusWorldGuardDiagnostics {
  rawX: number;
  rawY: number;
  clampedX: number;
  clampedY: number;
  projectedBounds: { left: number; top: number; right: number; bottom: number };
  saneBounds: { left: number; top: number; right: number; bottom: number };
  projectedWithinSaneBounds: boolean;
}

export interface FocusWorldTransformDiagnosticResult {
  transform: FocusWorldTransform | null;
  guardFailureReason: FocusWorldGuardFailureReason | null;
  guardDiagnostics: FocusWorldGuardDiagnostics;
}

export interface FocusWorldTransformInput {
  cardRect: DOMRect;
  stageRect: DOMRect;
  viewportRect: DOMRect;
  mobileLayout: boolean;
  currentTransform?: FocusWorldTransform | null;
}

type FocusSafeFrame = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

const FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX = -220;

function computeFocusSafeFrame(viewportRect: DOMRect, mobileLayout: boolean): FocusSafeFrame {
  const left = viewportRect.left + FOCUS_SAFE_FRAME_HORIZONTAL_PAD_PX;
  const right = viewportRect.right - FOCUS_SAFE_FRAME_HORIZONTAL_PAD_PX - (mobileLayout ? 0 : FOCUS_SAFE_FRAME_DRAWER_RESERVE_PX);
  const top = viewportRect.top + FOCUS_SAFE_FRAME_TOPBAR_RESERVE_PX;
  const bottom = viewportRect.bottom - FOCUS_SAFE_FRAME_VERTICAL_PAD_PX - (mobileLayout ? FOCUS_SAFE_FRAME_MOBILE_BOTTOM_RESERVE_PX : 0);
  const width = Math.max(120, right - left);
  const height = Math.max(120, bottom - top);
  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX: left + (width / 2),
    centerY: top + (height / 2),
  };
}

function computeFocusScale(cardRect: DOMRect, safeFrame: FocusSafeFrame): number {
  return Math.max(
    FOCUS_WORLD_MIN_SCALE,
    Math.min(FOCUS_WORLD_MAX_SCALE, safeFrame.width / cardRect.width, safeFrame.height / cardRect.height),
  );
}

function computeFocusTransformOrigin(cardRect: DOMRect, stageRect: DOMRect): { originX: number; originY: number } {
  const stageWidth = Math.max(1, stageRect.width);
  const stageHeight = Math.max(1, stageRect.height);
  const cardCenterX = cardRect.left + (cardRect.width / 2);
  const cardCenterY = cardRect.top + (cardRect.height / 2);
  const originX = ((cardCenterX - stageRect.left) / stageWidth) * 100;
  const originY = ((cardCenterY - stageRect.top) / stageHeight) * 100;
  return {
    originX: Math.max(0, Math.min(100, originX)),
    originY: Math.max(0, Math.min(100, originY)),
  };
}

function computeFocusTranslation(cardRect: DOMRect, safeFrame: FocusSafeFrame): { x: number; y: number } {
  const cardCenterX = cardRect.left + (cardRect.width / 2);
  const cardCenterY = cardRect.top + (cardRect.height / 2);
  return {
    x: safeFrame.centerX - cardCenterX,
    y: safeFrame.centerY - cardCenterY,
  };
}

function computeContinuityAdjustedTranslation(target: { x: number; y: number }, currentTransform?: FocusWorldTransform | null): { x: number; y: number } {
  if (!currentTransform) return target;
  const blend = 0.72;
  return {
    x: currentTransform.x + ((target.x - currentTransform.x) * blend),
    y: currentTransform.y + ((target.y - currentTransform.y) * blend),
  };
}

function computeProjectedBounds({
  cardRect,
  stageRect,
  scale,
  x,
  y,
}: {
  cardRect: DOMRect;
  stageRect: DOMRect;
  scale: number;
  x: number;
  y: number;
}) {
  const stageCenterX = stageRect.left + (stageRect.width / 2);
  const stageCenterY = stageRect.top + (stageRect.height / 2);
  const cardCenterX = cardRect.left + (cardRect.width / 2);
  const cardCenterY = cardRect.top + (cardRect.height / 2);
  const projectedCardCenterX = stageCenterX + ((cardCenterX - stageCenterX) * scale) + x;
  const projectedCardCenterY = stageCenterY + ((cardCenterY - stageCenterY) * scale) + y;
  const projectedHalfW = (cardRect.width * scale) / 2;
  const projectedHalfH = (cardRect.height * scale) / 2;
  return {
    left: projectedCardCenterX - projectedHalfW,
    top: projectedCardCenterY - projectedHalfH,
    right: projectedCardCenterX + projectedHalfW,
    bottom: projectedCardCenterY + projectedHalfH,
  };
}

function computeSaneBounds(viewportRect: DOMRect) {
  return {
    left: viewportRect.left + FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX,
    top: viewportRect.top + FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX,
    right: viewportRect.right - FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX,
    bottom: viewportRect.bottom - FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX,
  };
}

function projectedBoundsWithinSaneBounds(
  projectedBounds: { left: number; top: number; right: number; bottom: number },
  saneBounds: { left: number; top: number; right: number; bottom: number },
) {
  return projectedBounds.right >= saneBounds.left
    && projectedBounds.bottom >= saneBounds.top
    && projectedBounds.left <= saneBounds.right
    && projectedBounds.top <= saneBounds.bottom;
}

export function computeFocusWorldTransformWithDiagnostics({
  cardRect,
  stageRect,
  viewportRect,
  mobileLayout,
  currentTransform,
}: FocusWorldTransformInput): FocusWorldTransformDiagnosticResult {
  const projectedBounds = computeProjectedBounds({
    cardRect,
    stageRect,
    scale: 1,
    x: 0,
    y: 0,
  });
  const saneBounds = computeSaneBounds(viewportRect);
  const fallbackDiagnostics: FocusWorldGuardDiagnostics = {
    rawX: 0,
    rawY: 0,
    clampedX: 0,
    clampedY: 0,
    projectedBounds,
    saneBounds,
    projectedWithinSaneBounds: projectedBoundsWithinSaneBounds(projectedBounds, saneBounds),
  };

  if (cardRect.width <= 1 || cardRect.height <= 1) {
    return { transform: null, guardFailureReason: 'invalid-scale', guardDiagnostics: fallbackDiagnostics };
  }
  if (stageRect.width <= 1 || stageRect.height <= 1) {
    return { transform: null, guardFailureReason: 'invalid-scale', guardDiagnostics: fallbackDiagnostics };
  }
  const safeFrame = computeFocusSafeFrame(viewportRect, mobileLayout);
  const scale = computeFocusScale(cardRect, safeFrame);
  const translation = computeFocusTranslation(cardRect, safeFrame);
  const continuityTranslation = computeContinuityAdjustedTranslation(translation, currentTransform);
  const { originX, originY } = computeFocusTransformOrigin(cardRect, stageRect);
  const rawX = continuityTranslation.x;
  const rawY = continuityTranslation.y;
  const maxAbsX = Math.max(1, viewportRect.width * MAX_TRANSLATE_VIEWPORT_FACTOR);
  const maxAbsY = Math.max(1, viewportRect.height * MAX_TRANSLATE_VIEWPORT_FACTOR);
  const clampedX = Math.max(-maxAbsX, Math.min(maxAbsX, rawX));
  const clampedY = Math.max(-maxAbsY, Math.min(maxAbsY, rawY));
  const nextProjectedBounds = computeProjectedBounds({
    cardRect,
    stageRect,
    scale,
    x: clampedX,
    y: clampedY,
  });
  const diagnostics: FocusWorldGuardDiagnostics = {
    rawX,
    rawY,
    clampedX,
    clampedY,
    projectedBounds: nextProjectedBounds,
    saneBounds,
    projectedWithinSaneBounds: projectedBoundsWithinSaneBounds(nextProjectedBounds, saneBounds),
  };
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(scale)) {
    return { transform: null, guardFailureReason: 'non-finite', guardDiagnostics: diagnostics };
  }
  if (scale <= 0 || scale > (FOCUS_WORLD_MAX_SCALE * 2.5)) {
    return { transform: null, guardFailureReason: 'invalid-scale', guardDiagnostics: diagnostics };
  }
  if (Math.abs(rawX) > (maxAbsX * 4) || Math.abs(rawY) > (maxAbsY * 4)) {
    return { transform: null, guardFailureReason: 'absurd-translation', guardDiagnostics: diagnostics };
  }
  return {
    transform: {
      scale,
      x: clampedX,
      y: clampedY,
      originX,
      originY,
    },
    guardFailureReason: null,
    guardDiagnostics: diagnostics,
  };
}

export function computeFocusWorldTransform({
  cardRect,
  stageRect,
  viewportRect,
  mobileLayout,
  currentTransform,
}: FocusWorldTransformInput): FocusWorldTransform | null {
  return computeFocusWorldTransformWithDiagnostics({
    cardRect,
    stageRect,
    viewportRect,
    mobileLayout,
    currentTransform,
  }).transform;
}
