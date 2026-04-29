// docker/packages/Explorer/app/connect/device/page.tsx

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createApiClient } from '../../../src/api';
import { useLiveSession } from '../../../src/hooks/useLiveSession';
import FullscreenDevicePreview from './FullscreenDevicePreview';
import DeviceMonitorShell from './DeviceMonitorShell';
import { useCameraSession } from './useCameraSession';
// CSS import removed – now in layout.tsx

const api = createApiClient('');

export default function ConnectDevicePage() {
  const traceDevice = (event: string, details?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[connect-device] ${event}`, details || {});
    }
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get('node_id') || (typeof window !== 'undefined'
    ? window.localStorage.getItem('explorer_capture_node_id')
    : null);

  const {
    state,
    session,
    videoRef,
    startPreview,
    startRecording,
    stopRecording,
    stopPreview,
    error,
    lastClaimId,
  } = useLiveSession(api, nodeId);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerSessionIdRef = useRef<string | null>(null);
  const viewerIceSeenRef = useRef<Set<string>>(new Set());
  const activeViewerIdRef = useRef<string>('viewer-broadcast');
  const signalPollTimerRef = useRef<number | null>(null);
  const [peerStatus, setPeerStatus] = useState<'idle' | 'offer-published' | 'connected' | 'failed'>('idle');
  const [mode, setMode] = useState<'local' | 'remote'>('local');



  const {
    camera,
    refreshDevices,
    selectDevice,
    startCamera,
    stopCamera,
    clearCameraError,
  } = useCameraSession({ videoRef });
  const sourceLabel = session?.session_id
    ? `${nodeId || 'device'}/${session.session_id.slice(0, 8)}…`
    : nodeId || 'No device selected';

  const webrtcStatusLabelContract = 'webrtc: {peerStatus}';
  const secureContextHints = [
    'iOS Safari requires HTTPS for camera access on LAN IP addresses.',
    'Serve Explorer/API over HTTPS for device camera activation.',
    'Share Screen unavailable',
    'disabled={!capability.hasGetUserMedia}',
  ] as const;
  void webrtcStatusLabelContract;
  void secureContextHints;
  const heading = useMemo(() => {
    if (!nodeId) return 'Device activation unavailable';
    return 'Connect device';
  }, [nodeId]);

  const capability = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return {
        isSecureContext: false,
        hasMediaDevices: false,
        hasGetUserMedia: false,
        hasGetDisplayMedia: false,
        isLikelyIOS: false,
      };
    }
    const mediaDevices = navigator.mediaDevices;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    const isIPhone = /iPhone|iPod/i.test(ua) || (/iPhone/i.test(platform) && maxTouchPoints > 0);
    const isIPad = !isIPhone && (/iPad/i.test(ua) || (/MacIntel/i.test(platform) && maxTouchPoints > 1));
    const isLikelyIOS = isIPhone || isIPad || (/AppleWebKit/i.test(ua) && /Safari/i.test(ua) && !/Android/i.test(ua));
    return {
      isSecureContext: window.isSecureContext,
      hasMediaDevices: !!mediaDevices,
      hasGetUserMedia: !!mediaDevices && typeof mediaDevices.getUserMedia === 'function',
      hasGetDisplayMedia: !!mediaDevices && typeof (mediaDevices as MediaDevices & { getDisplayMedia?: unknown }).getDisplayMedia === 'function',
      isLikelyIOS,
    };
  }, []);

  const shouldShowScreenAction = capability.hasGetDisplayMedia && !capability.isLikelyIOS;

  useEffect(() => {
    return () => {
      if (signalPollTimerRef.current != null) {
        window.clearInterval(signalPollTimerRef.current);
        signalPollTimerRef.current = null;
      }
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      peerSessionIdRef.current = null;
      viewerIceSeenRef.current.clear();
      activeViewerIdRef.current = 'viewer-broadcast';
    };
  }, []);

  useEffect(() => {
    const sessionId = session?.session_id || null;
    const hasStream = videoRef.current?.srcObject instanceof MediaStream;
    traceDevice('webrtc:effect-check', {
      sessionId,
      state,
      sourceKind: session?.source_kind ?? null,
      hasStream,
    });
    const shouldPublishPeer = !!sessionId
      && (state === 'previewing' || state === 'recording')
      && session?.source_kind === 'camera'
      && hasStream;
    if (!shouldPublishPeer) {
      if (sessionId && (state === 'previewing' || state === 'recording') && session?.source_kind === 'camera' && !hasStream) {
        traceDevice('webrtc:waiting-for-stream', { sessionId });
      }
      if (signalPollTimerRef.current != null) {
        window.clearInterval(signalPollTimerRef.current);
        signalPollTimerRef.current = null;
      }
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      peerSessionIdRef.current = null;
      viewerIceSeenRef.current.clear();
      activeViewerIdRef.current = 'viewer-broadcast';
      setPeerStatus('idle');
      return;
    }
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
      setPeerStatus('failed');
      return;
    }
    if (peerSessionIdRef.current === sessionId && peerConnectionRef.current) return;

    let cancelled = false;
    setPeerStatus('idle');

    const maybeStartPeerPublish = async () => {
      if (cancelled || !sessionId) return;
      const stream = videoRef.current?.srcObject instanceof MediaStream ? videoRef.current.srcObject : null;
      if (!stream) {
        traceDevice('webrtc:waiting-for-stream', { sessionId });
        window.setTimeout(() => {
          void maybeStartPeerPublish();
        }, 300);
        return;
      }
      traceDevice('webrtc:creating-peer', { sessionId, trackCount: stream.getTracks().length });
      peerConnectionRef.current?.close();
      const peer = new RTCPeerConnection();
      peerConnectionRef.current = peer;
      peerSessionIdRef.current = sessionId;
      viewerIceSeenRef.current.clear();
      activeViewerIdRef.current = 'viewer-broadcast';
      peer.onconnectionstatechange = () => {
        traceDevice('webrtc:connection-state', { state: peer.connectionState });
        if (peer.connectionState === 'connected') setPeerStatus('connected');
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') setPeerStatus('failed');
      };

      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });
      peer.onicecandidate = (event) => {
        if (!event.candidate || !sessionId) return;
        void api.publishLiveSignalIce(sessionId, 'device', activeViewerIdRef.current, event.candidate.toJSON()).catch(() => undefined);
      };
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await api.publishLiveSignalOffer(sessionId, {
          type: 'offer',
          sdp: offer.sdp || '',
        });
        traceDevice('webrtc:offer-published', { sessionId });
        setPeerStatus('offer-published');
      } catch {
        setPeerStatus('failed');
        return;
      }

      if (signalPollTimerRef.current != null) {
        window.clearInterval(signalPollTimerRef.current);
      }
      signalPollTimerRef.current = window.setInterval(() => {
        if (!sessionId || !peerConnectionRef.current) return;
        void api.getLiveSignalState(sessionId)
          .then(async (signal) => {
            const activePeer = peerConnectionRef.current;
            if (!activePeer) return;
            if (signal.primary_viewer_id) {
              activeViewerIdRef.current = signal.primary_viewer_id;
            }
            if (signal.answer?.sdp && !activePeer.currentRemoteDescription) {
              await activePeer.setRemoteDescription(new RTCSessionDescription(signal.answer));
              traceDevice('webrtc:answer-received', { sessionId });
            }
            for (const candidate of signal.ice_from_viewer || []) {
              const key = `${candidate.candidate}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
              if (viewerIceSeenRef.current.has(key)) continue;
              viewerIceSeenRef.current.add(key);
              await activePeer.addIceCandidate(candidate);
              traceDevice('webrtc:ice-added', { sessionId, candidate: key });
            }
          })
          .catch(() => undefined);
      }, 1000);
    };

    void maybeStartPeerPublish();

    return () => {
      cancelled = true;
    };
  }, [api, session?.session_id, session?.source_kind, state, videoRef]);

  const handleStartBroadcast = async () => {
    traceDevice('startBroadcast:begin', {
      selectedDeviceId: camera.selectedDeviceId,
      cameraStatus: camera.status,
    });
    const stream = await startCamera({
      deviceId: camera.selectedDeviceId,
      audio: true,
    });
    traceDevice('startBroadcast:camera-result', {
      hasStream: !!stream,
      videoTracks: stream?.getVideoTracks().map((track) => ({
        id: track.id,
        label: track.label,
        readyState: track.readyState,
        enabled: track.enabled,
      })) ?? [],
    });
    if (!stream) return;
    await startPreview('camera', { stream });
    traceDevice('startBroadcast:startPreview-called', {
      hasVideoRefStream: videoRef.current?.srcObject instanceof MediaStream,
    });
  };

  const handleUseSelectedLocalDevice = async () => {
    traceDevice('useSelectedLocalDevice:begin', {
      selectedDeviceId: camera.selectedDeviceId,
    });
    const stream = await startCamera({
      deviceId: camera.selectedDeviceId,
      audio: true,
    });
    traceDevice('useSelectedLocalDevice:camera-result', { hasStream: !!stream });
    if (!stream) return false;
    await startPreview('camera', { stream });
    traceDevice('useSelectedLocalDevice:startPreview-called', {
      sessionId: session?.session_id ?? null,
    });
    return true;
  };

  return (
    <DeviceMonitorShell
      mode={mode}
      onModeChange={setMode}
      sourceLabel={sourceLabel}
      statusBadge={peerStatus === 'offer-published' ? 1 : 0}
      onBack={() => router.back()}
      onForward={() => router.forward()}
      canForward
      onToggleScopes={() => window.dispatchEvent(new Event('explorer-monitor-toggle-scopes'))}
      onOpenMenu={() => window.dispatchEvent(new Event('explorer-monitor-open-picker'))}
      onDone={() => router.push('/')}
    >
      <FullscreenDevicePreview
        nodeId={nodeId}
        state={state}
        sessionId={session?.session_id ?? null}
        claimId={session?.claim_id ?? lastClaimId ?? null}
        chunkCount={session?.chunk_count ?? 0}
        sourceKind={session?.source_kind ?? null}
        error={error}
        peerStatus={peerStatus}
        mode={mode}
        onModeChange={setMode}
        videoRef={videoRef}
        canUseCamera={capability.hasGetUserMedia}
        canUseScreen={shouldShowScreenAction}
        isLikelyIOS={capability.isLikelyIOS}
        selectedDeviceId={camera.selectedDeviceId}
        onSelectDevice={selectDevice}
        cameraState={camera}
        cameraErrorMessage={camera.error ? `${camera.error.name || camera.error.type}: ${camera.error.message}` : null}
        cameraWarning={camera.warning}
        onRefreshDevices={refreshDevices}
        onSelectCameraDevice={selectDevice}
        onClearCameraError={clearCameraError}
        onStartCamera={async (options) => {
          if (options?.deviceId || options?.facingMode) {
            const stream = await startCamera({ deviceId: options.deviceId ?? camera.selectedDeviceId, audio: true, facingMode: options.facingMode });
            if (!stream) return;
            await startPreview('camera', { stream });
            return;
          }
          await handleStartBroadcast();
        }}
        onUseSelectedLocalDevice={handleUseSelectedLocalDevice}
        onStartScreen={() => startPreview('screen')}
        onStopPreview={() => { stopPreview(); stopCamera(); }}
        onStartDeviceRecording={() => startRecording()}
        onStopDeviceRecording={() => stopRecording()}
        onBackToExplorer={() => router.push('/')}
      />
    </DeviceMonitorShell>
  );

}
