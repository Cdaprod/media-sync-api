import React, { useEffect } from 'react';

import type { OverlayPoint } from '../shared/interactionShaderTypes';
import { useHoldShaderOverlay } from './useHoldShaderOverlay';

type HoldShaderOverlayProps = {
  holdPoint: OverlayPoint;
  active: boolean;
  progress: number;
  completionBeat: number;
};

export default function HoldShaderOverlay({
  holdPoint,
  active,
  progress,
  completionBeat,
}: HoldShaderOverlayProps) {
  const { canvasRef, setHoldState } = useHoldShaderOverlay();

  useEffect(() => {
    setHoldState(holdPoint, active, progress, completionBeat);
  }, [active, completionBeat, holdPoint, progress, setHoldState]);

  return (
    <canvas
      ref={canvasRef}
      data-hold-shader-overlay="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99 }}
    />
  );
}
