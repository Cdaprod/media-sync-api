import React, { useEffect } from 'react';
import { usePinchShaderOverlay } from './usePinchShaderOverlay';

type PinchPoint = { x: number; y: number } | null;

type PinchShaderOverlayProps = {
  active: boolean;
  fingerA: PinchPoint;
  fingerB: PinchPoint;
  onPulse?: (trigger: (dir: number) => void) => void;
};

export default function PinchShaderOverlay({
  active,
  fingerA,
  fingerB,
  onPulse,
}: PinchShaderOverlayProps) {
  const { canvasRef, updateFingers, triggerPulse, release } = usePinchShaderOverlay();

  useEffect(() => {
    onPulse?.(triggerPulse);
  }, [onPulse, triggerPulse]);

  useEffect(() => {
    updateFingers(active ? fingerA : null, active ? fingerB : null);
  }, [active, fingerA, fingerB, updateFingers]);

  useEffect(() => {
    if (active) return;
    release();
  }, [active, release]);

  return (
    <canvas
      ref={canvasRef}
      data-pinch-shader-overlay="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  );
}
