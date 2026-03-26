import React, { useEffect } from 'react';
import { usePinchShaderOverlay } from './usePinchShaderOverlay';

type PinchPoint = { x: number; y: number } | null;

type PinchShaderOverlayProps = {
  active: boolean;
  fingerA: PinchPoint;
  fingerB: PinchPoint;
  nodeCount: number;
  onPulse?: (trigger: (dir: number) => void) => void;
};

export default function PinchShaderOverlay({
  active,
  fingerA,
  fingerB,
  nodeCount,
  onPulse,
}: PinchShaderOverlayProps) {
  const { canvasRef, updateFingers, triggerPulse, release, setNodeCount } = usePinchShaderOverlay();

  useEffect(() => {
    onPulse?.(triggerPulse);
  }, [onPulse, triggerPulse]);

  useEffect(() => {
    updateFingers(fingerA, fingerB, active);
  }, [active, fingerA, fingerB, updateFingers]);

  useEffect(() => {
    setNodeCount(nodeCount);
  }, [nodeCount, setNodeCount]);

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
