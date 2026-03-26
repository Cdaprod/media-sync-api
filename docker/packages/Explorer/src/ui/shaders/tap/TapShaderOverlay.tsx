import React, { useEffect } from 'react';

import type { OverlayPoint } from '../shared/interactionShaderTypes';
import { useTapShaderOverlay } from './useTapShaderOverlay';

type TapShaderOverlayProps = {
  tapPoint: OverlayPoint;
  tapTrigger: number;
};

export default function TapShaderOverlay({ tapPoint, tapTrigger }: TapShaderOverlayProps) {
  const { canvasRef, triggerTap } = useTapShaderOverlay();

  useEffect(() => {
    triggerTap(tapPoint);
  }, [tapPoint, tapTrigger, triggerTap]);

  return (
    <canvas
      ref={canvasRef}
      data-tap-shader-overlay="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99 }}
    />
  );
}
