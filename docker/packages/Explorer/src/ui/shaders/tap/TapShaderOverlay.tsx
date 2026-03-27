import React, { useEffect } from 'react';
import { useState } from 'react';

import type { OverlayPoint } from '../shared/interactionShaderTypes';
import { useTapShaderOverlay } from './useTapShaderOverlay';

type TapShaderOverlayProps = {
  tapPoint: OverlayPoint;
  tapTrigger: number;
};

export default function TapShaderOverlay({ tapPoint, tapTrigger }: TapShaderOverlayProps) {
  const { canvasRef, triggerTap } = useTapShaderOverlay();
  const [debugFlash, setDebugFlash] = useState<{ x: number; y: number; key: number } | null>(null);

  useEffect(() => {
    triggerTap(tapPoint);
    if (!tapPoint) return;
    setDebugFlash({ x: tapPoint.x, y: tapPoint.y, key: tapTrigger });
    const timeoutId = window.setTimeout(() => setDebugFlash(null), 110);
    return () => window.clearTimeout(timeoutId);
  }, [tapPoint, tapTrigger, triggerTap]);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-tap-shader-overlay="true"
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 160 }}
      />
      {debugFlash ? (
        <span
          className="tap-debug-marker"
          style={{ left: debugFlash.x, top: debugFlash.y }}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
