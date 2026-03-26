import React, { useEffect } from 'react';

import type { OverlayPoint } from '../shared/interactionShaderTypes';
import { useHoldShaderOverlay } from './useHoldShaderOverlay';

type HoldShaderOverlayProps = {
  holdPoint: OverlayPoint;
  active: boolean;
};

export default function HoldShaderOverlay({ holdPoint, active }: HoldShaderOverlayProps) {
  const { canvasRef, setHoldState } = useHoldShaderOverlay();

  useEffect(() => {
    setHoldState(holdPoint, active);
  }, [active, holdPoint, setHoldState]);

  return (
    <canvas
      ref={canvasRef}
      data-hold-shader-overlay="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99 }}
    />
  );
}
