import type { CameraTarget, ProxyCameraState } from './renderTypes';

export function computeCameraStateForTarget(args: {
  target: CameraTarget;
  viewportLeft?: number;
  viewportTop?: number;
  viewportWidth: number;
  viewportHeight: number;
  topInset?: number;
  bottomInset?: number;
  sideInset?: number;
  maxScale?: number;
}): ProxyCameraState {
  const {
    target,
    viewportLeft = 0,
    viewportTop = 0,
    viewportWidth,
    viewportHeight,
    topInset = 88,
    bottomInset = 140,
    sideInset = 24,
    maxScale = 2.85,
  } = args;

  const safeWidth = Math.max(120, viewportWidth - sideInset * 2);
  const safeHeight = Math.max(120, viewportHeight - topInset - bottomInset);

  const safeCenterX = viewportLeft + sideInset + safeWidth / 2;
  const safeCenterY = viewportTop + topInset + safeHeight / 2;

  const scaleX = safeWidth / Math.max(1, target.width);
  const scaleY = safeHeight / Math.max(1, target.height);
  const scale = Math.max(1, Math.min(maxScale, Math.min(scaleX, scaleY)));

  return {
    x: safeCenterX - (target.centerX * scale),
    y: safeCenterY - (target.centerY * scale),
    scale,
    tiltX: 0,
    tiltY: 0,
    velocityX: 0,
    velocityY: 0,
  };
}
