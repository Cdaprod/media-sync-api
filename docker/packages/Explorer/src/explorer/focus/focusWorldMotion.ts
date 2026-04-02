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
}

export interface FocusWorldTransformInput {
  cardRect: DOMRect;
  stageRect: DOMRect;
  viewportRect: DOMRect;
  mobileLayout: boolean;
}

const FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX = -96;

function isProjectedCardWithinSaneBounds({
  cardRect,
  stageRect,
  viewportRect,
  scale,
  x,
  y,
}: {
  cardRect: DOMRect;
  stageRect: DOMRect;
  viewportRect: DOMRect;
  scale: number;
  x: number;
  y: number;
}): boolean {
  const stageCenterX = stageRect.left + (stageRect.width / 2);
  const stageCenterY = stageRect.top + (stageRect.height / 2);
  const cardCenterX = cardRect.left + (cardRect.width / 2);
  const cardCenterY = cardRect.top + (cardRect.height / 2);
  const projectedCardCenterX = stageCenterX + ((cardCenterX - stageCenterX) * scale) + x;
  const projectedCardCenterY = stageCenterY + ((cardCenterY - stageCenterY) * scale) + y;
  const projectedHalfW = (cardRect.width * scale) / 2;
  const projectedHalfH = (cardRect.height * scale) / 2;
  const projectedLeft = projectedCardCenterX - projectedHalfW;
  const projectedTop = projectedCardCenterY - projectedHalfH;
  const projectedRight = projectedCardCenterX + projectedHalfW;
  const projectedBottom = projectedCardCenterY + projectedHalfH;
  const saneLeft = viewportRect.left + FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX;
  const saneTop = viewportRect.top + FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX;
  const saneRight = viewportRect.right - FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX;
  const saneBottom = viewportRect.bottom - FOCUS_MIN_PROJECTED_EDGE_MARGIN_PX;
  return projectedRight >= saneLeft
    && projectedBottom >= saneTop
    && projectedLeft <= saneRight
    && projectedTop <= saneBottom;
}

export function computeFocusWorldTransform({
  cardRect,
  stageRect,
  viewportRect,
  mobileLayout,
}: FocusWorldTransformInput): FocusWorldTransform | null {
  if (cardRect.width <= 1 || cardRect.height <= 1) return null;
  if (stageRect.width <= 1 || stageRect.height <= 1) return null;
  const safeLeft = viewportRect.left + FOCUS_SAFE_FRAME_HORIZONTAL_PAD_PX;
  const safeRight = viewportRect.right - FOCUS_SAFE_FRAME_HORIZONTAL_PAD_PX - (mobileLayout ? 0 : FOCUS_SAFE_FRAME_DRAWER_RESERVE_PX);
  const safeTop = viewportRect.top + FOCUS_SAFE_FRAME_TOPBAR_RESERVE_PX;
  const safeBottom = viewportRect.bottom - FOCUS_SAFE_FRAME_VERTICAL_PAD_PX - (mobileLayout ? FOCUS_SAFE_FRAME_MOBILE_BOTTOM_RESERVE_PX : 0);
  const safeWidth = Math.max(120, safeRight - safeLeft);
  const safeHeight = Math.max(120, safeBottom - safeTop);
  const safeCenterX = safeLeft + (safeWidth / 2);
  const safeCenterY = safeTop + (safeHeight / 2);
  const cardCenterX = cardRect.left + (cardRect.width / 2);
  const cardCenterY = cardRect.top + (cardRect.height / 2);
  const scale = Math.max(
    FOCUS_WORLD_MIN_SCALE,
    Math.min(FOCUS_WORLD_MAX_SCALE, safeWidth / cardRect.width, safeHeight / cardRect.height),
  );
  const rawX = safeCenterX - cardCenterX;
  const rawY = safeCenterY - cardCenterY;
  const maxAbsX = Math.max(1, viewportRect.width * MAX_TRANSLATE_VIEWPORT_FACTOR);
  const maxAbsY = Math.max(1, viewportRect.height * MAX_TRANSLATE_VIEWPORT_FACTOR);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(scale)) return null;
  const clamped = {
    scale,
    x: Math.max(-maxAbsX, Math.min(maxAbsX, rawX)),
    y: Math.max(-maxAbsY, Math.min(maxAbsY, rawY)),
  };
  if (!isProjectedCardWithinSaneBounds({
    cardRect,
    stageRect,
    viewportRect,
    scale: clamped.scale,
    x: clamped.x,
    y: clamped.y,
  })) {
    return null;
  }
  return clamped;
}
