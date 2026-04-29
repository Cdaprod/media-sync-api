// docker/packages/Explorer/app/connect/device/FullscreenDevicePreview.tsx

'use client';

import { useState, useRef, useEffect, useCallback, RefObject } from 'react';
import { OverlayState } from './deviceMonitorTypes';
import type { CameraSessionState } from './cameraSession';
import {
  useLocalCameras,
  useRemoteCameras,
  useWebGLFx,
  useHistogram,
  useVectorscope,
  useWaveform,
  useAudioAnalyser,
} from './deviceMonitorHooks';
import DeviceScopesPanel from './DeviceScopesPanel';
import DevicePickerSheet from './DevicePickerSheet';
import DeviceCameraInfoModal from './DeviceCameraInfoModal';

interface FullscreenDevicePreviewProps {
  nodeId: string | null;
  state: string;
  sessionId?: string | null;
  claimId?: string | null;
  chunkCount?: number;
  sourceKind?: string | null;
  error?: string | null;
  peerStatus: 'idle' | 'offer-published' | 'connected' | 'failed';
  mode: 'local' | 'remote';
  onModeChange: (mode: 'local' | 'remote') => void;
  videoRef: RefObject<HTMLVideoElement>;
  canUseCamera: boolean;
  canUseScreen: boolean;
  isLikelyIOS: boolean;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
  cameraState?: CameraSessionState;
  cameraErrorMessage?: string | null;
  cameraWarning?: string | null;
  onRefreshDevices?: () => Promise<void>;
  onSelectCameraDevice?: (deviceId: string | null) => void;
  onClearCameraError?: () => void;
  onRequestOpenPicker?: () => void;
  onRequestToggleScopes?: () => void;
  onStartCamera: (options?: { deviceId?: string; facingMode?: 'user' | 'environment' }) => void | Promise<void>;
  onUseSelectedLocalDevice: () => Promise<boolean>;
  debugEvents?: string[];
  broadcastLabel?: string;
  onStartScreen: () => void | Promise<void>;
  onStopPreview: () => void | Promise<void>;
  onStartDeviceRecording: () => void | Promise<void>;
  onStopDeviceRecording: () => void | Promise<void>;
  onBackToExplorer: () => void;
}

export default function FullscreenDevicePreview({
  nodeId,
  state,
  sessionId,
  claimId,
  chunkCount = 0,
  sourceKind,
  error,
  peerStatus,
  mode,
  onModeChange,
  videoRef,
  canUseCamera,
  canUseScreen,
  isLikelyIOS,
  selectedDeviceId,
  onSelectDevice,
  cameraState,
  cameraErrorMessage,
  cameraWarning,
  onRefreshDevices,
  onSelectCameraDevice,
  onClearCameraError,
  onRequestOpenPicker,
  onRequestToggleScopes,
  onStartCamera,
  onUseSelectedLocalDevice,
  debugEvents = [],
  broadcastLabel,
  onStartScreen,
  onStopPreview,
  onStartDeviceRecording,
  onStopDeviceRecording,
  onBackToExplorer,
}: FullscreenDevicePreviewProps) {
  const [overlays, setOverlays] = useState<OverlayState>({
    zebra: false,
    peaking: false,
    falseColor: false,
    scopeHud: false,
  });
  const [shelfOpen, setShelfOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [pickerStatus, setPickerStatus] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { devices: hookLocalDevices, permission: localPermission, refresh: refreshLocal } = useLocalCameras();
  const localDevices = cameraState?.devices ?? hookLocalDevices;
  const safeLocalDevices = Array.isArray(localDevices) ? localDevices : [];
  const { nodes: remoteNodes, refresh: refreshRemote } = useRemoteCameras();

  // Poll videoRef.srcObject for audio analyser (fix 2)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = videoRef.current?.srcObject instanceof MediaStream ? videoRef.current.srcObject : null;
      setMediaStream((prev) => (prev === next ? prev : next));
    }, 500);
    return () => window.clearInterval(timer);
  }, [videoRef]);

  const { analyser, peakLevel } = useAudioAnalyser(mediaStream);

  const fxCanvasRef = useWebGLFx(videoRef, overlays);

  const histCanvasRef = useRef<HTMLCanvasElement>(null);
  const vecCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudHistCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudVecCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudWaveCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioFillRef = useRef<HTMLDivElement>(null);
  const audioPeakRef = useRef<HTMLDivElement>(null);

  useHistogram(videoRef, histCanvasRef);
  useVectorscope(videoRef, vecCanvasRef);
  useWaveform(waveCanvasRef, analyser);
  useHistogram(videoRef, hudHistCanvasRef);
  useVectorscope(videoRef, hudVecCanvasRef);
  useWaveform(hudWaveCanvasRef, analyser);

  const toggleAppFullscreen = useCallback(async () => {
    const root = document.getElementById('fullscreen-root');
    if (!root) return;
    try {
      if (document.fullscreenEnabled && root.requestFullscreen) {
        if (!document.fullscreenElement) {
          await root.requestFullscreen();
          root.classList.add('app-fullscreen');
        } else {
          await document.exitFullscreen();
          root.classList.remove('app-fullscreen');
        }
      } else {
        root.classList.toggle('app-fullscreen');
      }
    } catch {
      root.classList.toggle('app-fullscreen');
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setOverlaysVisible(false), 4000);
  }, []);
  const showOverlays = useCallback(() => {
    setOverlaysVisible(true);
    resetIdleTimer();
  }, [resetIdleTimer]);
  useEffect(() => {
    const root = document.getElementById('fullscreen-root');
    const onMove = () => showOverlays();
    root?.addEventListener('pointermove', onMove);
    root?.addEventListener('pointerdown', onMove);
    return () => {
      root?.removeEventListener('pointermove', onMove);
      root?.removeEventListener('pointerdown', onMove);
    };
  }, [showOverlays]);
  useEffect(() => {
    const openPicker = () => setPickerOpen(true);
    const toggleScopes = () => setShelfOpen((prev) => !prev);
    window.addEventListener('explorer-monitor-open-picker', openPicker);
    window.addEventListener('explorer-monitor-toggle-scopes', toggleScopes);
    return () => {
      window.removeEventListener('explorer-monitor-open-picker', openPicker);
      window.removeEventListener('explorer-monitor-toggle-scopes', toggleScopes);
    };
  }, []);

  const isActive = state === 'previewing' || state === 'recording';
  const isDeviceRecording = state === 'recording';
  const isBusy = state === 'starting' || state === 'requesting-permission';
  const isError = state === 'error';
  const isEnded = state === 'ended';
  const isIdle = state === 'idle' || state === 'ended' || state === 'error';
  const showResume = isError || isEnded;

  const selectedDeviceLabel = (() => {
    if (sourceKind === 'screen') return 'Screen share';
    return sourceKind === 'camera' ? 'Camera feed' : 'No camera selected';
  })();

  const hasLiveVideoStream = () => {
    const stream = videoRef.current?.srcObject;
    return stream instanceof MediaStream && stream.getVideoTracks().some((track) => track.readyState === 'live');
  };
  const showFatalError = isError && !hasLiveVideoStream();

  const handleSelectLocalDevice = async (deviceId: string) => {
    onSelectDevice(deviceId);
    setPickerStatus(null);
  };

  useEffect(() => {
    if (selectedDeviceId && !safeLocalDevices.some((device) => device.deviceId === selectedDeviceId)) {
      onSelectDevice(null);
    }
  }, [onSelectDevice, safeLocalDevices, selectedDeviceId]);

  return (
    <div id="fullscreen-root" className={`fullscreen-container device-monitor-content ${pickerOpen ? 'picker-open' : ''} ${modalOpen ? 'error-modal-open' : ''}`}>
      <video ref={videoRef} id="video-bg" autoPlay playsInline muted disablePictureInPicture />
      <canvas ref={fxCanvasRef} id="fx-canvas" />
      <canvas ref={hudHistCanvasRef} id="hud-histogram-canvas" className={`scope-hud-canvas ${overlays.scopeHud ? '' : 'hidden'}`} width="260" height="70" />
      <canvas ref={hudVecCanvasRef} id="hud-vectorscope-canvas" className={`scope-hud-canvas ${overlays.scopeHud ? '' : 'hidden'}`} width="120" height="120" />
      <canvas ref={hudWaveCanvasRef} id="hud-waveform-canvas" className={`scope-hud-canvas ${overlays.scopeHud ? '' : 'hidden'}`} width="260" height="48" />
      <div className="gradient-vignette" />

      {/* Overlay layer for idle/busy/error/ended */}
      {(isIdle || isBusy || showFatalError) && (
        <div className="overlay-layer">
          <div className={`overlay-card ${showFatalError ? 'error-card' : ''}`}>
            <h2>
              {showFatalError ? 'Camera unavailable' : isEnded ? 'Session ended' : isBusy ? 'Starting...' : 'Enable your camera'}
            </h2>
            <p>
              {showFatalError ? (cameraErrorMessage || error || 'Unknown error') : isEnded ? 'The broadcast has finished.' : isBusy ? 'Requesting permissions and establishing connection...' : 'Tap once to grant access and start broadcasting.'}
            </p>
            <div className="btn-stack">
              {isIdle && !isError && !isEnded && (
                <>
                  <button className="btn-overlay ghost" onClick={() => { void onStartCamera(); }} disabled={!mounted ? false : !canUseCamera}>
                    Start Live Broadcast
                  </button>
                  {canUseScreen && !isLikelyIOS && (
                    <button className="btn-overlay ghost" onClick={onStartScreen}>
                      Share Screen
                    </button>
                  )}
                  <button className="btn-overlay ghost" onClick={() => setPickerOpen(true)}>
                    Pick Camera
                  </button>
                </>
              )}
              {(showFatalError || isEnded) && (
                <>
                  <button className="btn-overlay primary" onClick={() => { void onStartCamera(); }}>
                    Retry
                  </button>
                  <button className="btn-overlay ghost" onClick={() => setPickerOpen(true)}>
                    Pick Camera
                  </button>
                </>
              )}
              <button className="btn-overlay ghost" onClick={onBackToExplorer}>
                Back to Explorer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top cluster (active only) */}
      <div className={`top-cluster ${overlaysVisible && isActive ? 'visible' : 'hidden'}`}>
        <div className="top-inner">
          <div className="top-meta">
            <p className="facing">Camera</p>
            <p className="cam-label">{selectedDeviceLabel}</p>
            <p className="perm-label">Permission: {localPermission}</p>
            {error && <p className="err-label">{error}</p>}
            {peerStatus !== 'idle' && <p className="perm-label">WebRTC: {peerStatus}</p>}
            {state === 'starting' && <p className="perm-label">Starting camera…</p>}
            {peerStatus === 'idle' && state === 'previewing' && <p className="perm-label">Publishing live offer…</p>}
            {peerStatus === 'offer-published' && <p className="perm-label">Waiting for Explorer answer…</p>}
            {sessionId && <p className="perm-label">Session: {sessionId.slice(0,8)}…</p>}
          </div>
          <div className="top-actions">
            <button className="btn-pill" onClick={() => setModalOpen(true)}>Camera Info</button>
            <button className="btn-pill" onClick={() => setShelfOpen(true)}>Scopes · Overlays · Controls</button>
            {showResume && <button className="btn-pill" onClick={onStartCamera}>Resume</button>}
            <button className="btn-pill" onClick={onBackToExplorer}>Explorer</button>
          </div>
        </div>
      </div>
      {process.env.NODE_ENV !== 'production' ? (
        <div className="picker-status-chip">
          Camera: {cameraState?.status || 'unknown'} · Selected: {cameraState?.selectedDeviceId || 'default'} · Session: {sessionId || 'none'} · Peer: {peerStatus}
          {broadcastLabel ? ` · ${broadcastLabel}` : ''}
          {debugEvents.length > 0 ? ` · ${debugEvents.join(' | ')}` : ''}
        </div>
      ) : null}

      {/* Bottom bar (active only) */}
      <div className={`bottom-bar ${overlaysVisible && isActive ? 'visible' : 'hidden'}`}>
        <div className="bottom-inner">
          <div className="bottom-main-row">
            {isDeviceRecording ? (
              <button className="btn-record recording" onClick={onStopDeviceRecording}>
                🔴 Stop · {chunkCount} chunks
              </button>
            ) : (
              <button className="btn-record idle" onClick={onStartDeviceRecording}>Device Rec</button>
            )}
            <button className="btn-action" onClick={onStopPreview}>Stop Broadcast</button>
            <button className="btn-action subtle" onClick={toggleAppFullscreen}>⛶</button>
            <button className="btn-action" onClick={onBackToExplorer}>Explorer</button>
          </div>
          <div className="bottom-sub-row">
            <span>Remote inventory</span>
            <div className="sub-btns">
              <button className="btn-pill" onClick={() => setPickerOpen(true)}>Switch</button>
            </div>
          </div>
        </div>
      </div>

      <DeviceScopesPanel
        isOpen={shelfOpen}
        onClose={() => setShelfOpen(false)}
        overlays={overlays}
        onToggleOverlay={(key) => setOverlays(prev => ({ ...prev, [key]: !prev[key] }))}
        histogramCanvasRef={histCanvasRef}
        vectorscopeCanvasRef={vecCanvasRef}
        waveformCanvasRef={waveCanvasRef}
        audioFillRef={audioFillRef}
        audioPeakRef={audioPeakRef}
        peakLevel={peakLevel}
      />

      {cameraWarning ? <div className="picker-status-chip">{cameraWarning}</div> : null}
      <DevicePickerSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        localDevices={safeLocalDevices}
        localPermission={localPermission}
        remoteNodes={remoteNodes}
        selectedDeviceId={selectedDeviceId}
        onSelectLocalDevice={handleSelectLocalDevice}
        onUseSelectedLocalDevice={async () => {
          const used = await onUseSelectedLocalDevice();
          if (used) setPickerOpen(false);
        }}
        mode={mode}
        onModeChange={onModeChange}
        onOpenRemoteNode={(nodeId) => window.open(`/connect/device?node_id=${encodeURIComponent(nodeId)}`, '_blank')}
        onRefresh={async () => {
          await (onRefreshDevices ? onRefreshDevices() : refreshLocal());
          refreshRemote();
        }}
      />
      {pickerStatus && <div className="picker-status-chip">{pickerStatus}</div>}

      <DeviceCameraInfoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedDeviceLabel={selectedDeviceLabel}
        permission={localPermission}
        deviceId={null}
        sessionId={sessionId || undefined}
        claimId={claimId || undefined}
        nodeId={nodeId || undefined}
        chunkCount={chunkCount}
        sourceKind={sourceKind}
        peerStatus={peerStatus}
      />
    </div>
  );
}
  useEffect(() => {
    setMounted(true);
  }, []);
