// docker/packages/Explorer/app/connect/device/DeviceScopesPanel.tsx

'use client';

import { RefObject } from 'react';
import { OverlayState } from './deviceMonitorTypes';

interface DeviceScopesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  overlays: OverlayState;
  onToggleOverlay: (key: keyof OverlayState) => void;
  histogramCanvasRef: RefObject<HTMLCanvasElement>;
  vectorscopeCanvasRef: RefObject<HTMLCanvasElement>;
  waveformCanvasRef: RefObject<HTMLCanvasElement>;
  audioFillRef: RefObject<HTMLDivElement>;
  audioPeakRef: RefObject<HTMLDivElement>;
  peakLevel: number;
}

export default function DeviceScopesPanel({
  isOpen,
  onClose,
  overlays,
  onToggleOverlay,
  histogramCanvasRef,
  vectorscopeCanvasRef,
  waveformCanvasRef,
  audioFillRef,
  audioPeakRef,
  peakLevel,
}: DeviceScopesPanelProps) {
  if (!isOpen) return null;

  return (
    <div className={`shelf ${isOpen ? 'open' : ''}`}>
      <div className="shelf-header">
        <span>Scopes · Overlays · Controls</span>
        <button className="btn-pill" onClick={onClose}>Close</button>
      </div>
      <div className="shelf-body">
        <section>
          <p className="shelf-section-title">Scopes (panel)</p>
          <div className="scope-card">
            <canvas ref={histogramCanvasRef} id="histogram-canvas" width="300" height="80" />
          </div>
          <div className="scope-card">
            <canvas ref={vectorscopeCanvasRef} id="vectorscope-canvas" width="192" height="192" />
          </div>
        </section>
        <section>
          <p className="shelf-section-title">Audio</p>
          <div className="scope-card">
            <div className="audio-meter-wrap">
              <div className="audio-bar-track">
                <div ref={audioFillRef} className="audio-bar-fill" style={{ width: `${peakLevel}%` }} />
                <div ref={audioPeakRef} className="audio-peak-marker" style={{ left: `${peakLevel}%` }} />
              </div>
            </div>
            <canvas ref={waveformCanvasRef} id="waveform-canvas" width="300" height="48" />
          </div>
        </section>
        <section>
          <p className="shelf-section-title">Monitor Overlays</p>
          <div className="scope-card">
            <div className="toggle-row">
              <div className="toggle-item">
                <span>Zebra stripes</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={overlays.zebra} onChange={() => onToggleOverlay('zebra')} />
                  <div className="toggle-track" />
                </label>
              </div>
              <div className="toggle-item">
                <span>Focus peaking</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={overlays.peaking} onChange={() => onToggleOverlay('peaking')} />
                  <div className="toggle-track" />
                </label>
              </div>
              <div className="toggle-item">
                <span>False color</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={overlays.falseColor} onChange={() => onToggleOverlay('falseColor')} />
                  <div className="toggle-track" />
                </label>
              </div>
              <div className="toggle-item">
                <span>Scope HUD (over video)</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={overlays.scopeHud} onChange={() => onToggleOverlay('scopeHud')} />
                  <div className="toggle-track" />
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}