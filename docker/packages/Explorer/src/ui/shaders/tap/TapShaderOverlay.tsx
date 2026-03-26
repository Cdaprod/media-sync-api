import React, { useEffect } from 'react';

import type { OverlayPoint } from '../shared/interactionShaderTypes';
import { useTapShaderOverlay } from './useTapShaderOverlay';

type TapShaderOverlayProps = {
  tapPoint: OverlayPoint;
};

export default function TapShaderOverlay({ tapPoint }: TapShaderOverlayProps) {
  const { canvasRef, triggerTap } = useTapShaderOverlay();

  useEffect(() => {
    if (!tapPoint) return;
    triggerTap(tapPoint);
  }, [tapPoint, triggerTap]);

  return (
    <canvas
      ref={canvasRef}
      data-tap-shader-overlay="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99 }}
    />
  );
}
