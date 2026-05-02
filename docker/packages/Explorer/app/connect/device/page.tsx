// docker/packages/Explorer/app/connect/device/page.tsx

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createApiClient } from '../../../src/api';
import { useLiveSession } from '../../../src/hooks/useLiveSession';
import FullscreenDevicePreview from './FullscreenDevicePreview';
import DeviceMonitorShell from './DeviceMonitorShell';
import { useCameraSession } from './useCameraSession';
import { ensureLiveBroadcastAlignment } from './liveBroadcastAlignment';
import { makeBroadcastFailure, type BroadcastSnapshot } from './broadcastSession';
import {
  getBrowserRuntimeIdentity,
  getBrowserRuntimeIdentityDiagnostics,
  registerBrowserRuntime,
  importNodeAuthFromQuery,
  openExplorerTab,
  publishBrowserRuntimeTabActive,
  publishBrowserRuntimeSession,
  pruneLegacyNodeIdentityKeys,
  registerWindowName,
  requestExplorerRefresh,
  syncBrowserRuntimeNode,
  setActiveRuntimeSession,
  setBrowserRuntimeIdentity,
  setTabRole,
  stripNodeAuthQueryParams,
} from '../../../src/lib/browserRuntimeIdentity';
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
  const queryNodeId = searchParams.get('node_id');
  const storedNodeId = typeof window !== 'undefined' ? window.localStorage.getItem('explorer_capture_node_id') : null;
  const nodeId = queryNodeId || storedNodeId;
  const queryToken = searchParams.get('token');
  useEffect(() => {
    setTabRole('device');
    registerWindowName('device');
    publishBrowserRuntimeTabActive('device');
    requestExplorerRefresh('device-mount');
    const imported = importNodeAuthFromQuery();
    stripNodeAuthQueryParams();
    const identity = getBrowserRuntimeIdentity(imported.nodeId);
    if (identity.nodeId) setBrowserRuntimeIdentity(identity.nodeId, identity.token);
    pruneLegacyNodeIdentityKeys();
    traceDevice('node-auth:bootstrap', {
      imported: imported.imported,
      nodeId: imported.nodeId || identity.nodeId,
      tokenSource: imported.tokenSource || identity.tokenSource,
      diagnostics: getBrowserRuntimeIdentityDiagnostics(imported.nodeId || identity.nodeId),
    });
  }, []);
  useEffect(() => {
    const onFocus = () => {
      publishBrowserRuntimeTabActive('device');
      requestExplorerRefresh('device-focus');
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!nodeId || !queryToken) return;
    setBrowserRuntimeIdentity(nodeId, queryToken);
  }, [nodeId, queryToken]);
  useEffect(() => {
    if (!nodeId) return;
    const diagnostics = getBrowserRuntimeIdentityDiagnostics(nodeId);
    traceDevice('node-identity:resolved', {
      nodeId,
      source: queryNodeId ? 'query' : 'localStorage',
      hasToken: diagnostics.hasToken,
      tokenSource: diagnostics.tokenSource,
    });
  }, [nodeId, queryNodeId]);
  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    const syncNodeRegistration = async () => {
      traceDevice('node-sync:begin', { nodeId });
      try {
        const nodes = await api.listNodes();
        const exists = Array.isArray(nodes) && nodes.some((entry) => entry?.node_id === nodeId);
        if (!exists) {
          await registerBrowserRuntime({
            node_id: nodeId,
            label: `${nodeId} Capture Node`,
            base_url: null,
            roles: ['runner', 'capture'],
            capabilities: ['can_proxy_streams'],
            source_name: 'camera-primary',
            source_kind: 'capture',
            source_authority: 'runner-local',
            advertised_source_kinds: ['capture'],
            ephemeral: true,
            metadata: { session_node: 'true', browser_push: 'true', origin: 'browser' },
          });
        }
        const syncResult = await syncBrowserRuntimeNode(nodeId);
        if (!cancelled) setHeartbeatState(syncResult.ok ? 'ok' : syncResult.status === 'auth_failed' ? 'auth_failed' : 'skipped-no-token');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('401')) {
          if (!cancelled) setHeartbeatState('auth_failed');
          traceDevice('node-sync:error', { message, nodeSyncStatus: 'auth_failed' });
          return;
        }
        traceDevice('node-sync:error', { message });
      }
    };
    void syncNodeRegistration();
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

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
  const nodeHeartbeatTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const publisherBusyRef = useRef(false);
  const activeBroadcastSessionRef = useRef<{ session_id: string } | null>(null);
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const viewerPollTimerRef = useRef<number | null>(null);
  const viewerSessionIdRef = useRef<string | null>(null);
  const viewerIdRef = useRef<string>('viewer-default');
  const [peerStatus, setPeerStatus] = useState<'idle' | 'offer-published' | 'connected' | 'failed'>('idle');
  const [mode, setMode] = useState<'local' | 'remote'>('local');
  const [activeBroadcastSession, setActiveBroadcastSession] = useState<{ session_id: string } | null>(null);
  const [traceEvents, setTraceEvents] = useState<string[]>([]);
  const [heartbeatState, setHeartbeatState] = useState<'ok' | 'skipped-no-token' | 'failed' | 'auth_failed'>('skipped-no-token');
  const [broadcast, setBroadcast] = useState<BroadcastSnapshot>({
    stage: 'idle', nodeId, selectedDeviceId: null, cameraLabel: null, sessionId: null, sourceKind: null,
    peerStatus: 'idle', waitingForAnswer: false, error: null, updatedAt: Date.now(),
  });
  const debugEnabled = searchParams.get('debug') === '1';
  const markLiveFlowStep = useCallback((patch: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    const current = ((window as any).__explorerLiveFlowDebug || {}) as Record<string, unknown>;
    (window as any).__explorerLiveFlowDebug = {
      ...current,
      ...patch,
      lastUpdatedAt: Date.now(),
    };
  }, []);



  const {
    camera,
    refreshDevices,
    selectDevice,
    startCamera,
    stopCamera,
    clearCameraError,
  } = useCameraSession({ videoRef });
  const sourceLabel = (activeBroadcastSession?.session_id || session?.session_id)
    ? `${nodeId || 'device'}/${(activeBroadcastSession?.session_id || session?.session_id || '').slice(0, 8)}…`
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
  const getUsableCameraStream = () => {
    const stream = camera.stream;
    if (!stream) return null;
    const liveVideoTracks = stream.getVideoTracks().filter((track) => track.readyState === 'live');
    return liveVideoTracks.length > 0 ? stream : null;
  };
  const bindPreviewStream = async (stream: MediaStream): Promise<void> => {
    if (!videoRef.current) return;
    if (videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream;
    videoRef.current.muted = true;
    videoRef.current.playsInline = true;
    await videoRef.current.play?.().catch((error) => {
      traceDevice('camera:preview:play-blocked', { message: error instanceof Error ? error.message : String(error) });
    });
  };
  const handleEnableCamera = async (): Promise<boolean> => {
    traceDevice('camera:enable:begin', { selectedDeviceId: camera.selectedDeviceId });
    const existing = getUsableCameraStream();
    if (existing) {
      await bindPreviewStream(existing);
      traceDevice('camera:enable:reuse-existing');
      return true;
    }
    const stream = await startCamera({ deviceId: camera.selectedDeviceId, audio: true });
    if (!stream) return false;
    await bindPreviewStream(stream);
    traceDevice('camera:enable:ready', { videoTracks: stream.getVideoTracks().length, audioTracks: stream.getAudioTracks().length });
    return true;
  };

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
      clearNodeHeartbeatTimer();
      if (viewerPollTimerRef.current != null) {
        window.clearInterval(viewerPollTimerRef.current);
        viewerPollTimerRef.current = null;
      }
      viewerPeerRef.current?.close();
      viewerPeerRef.current = null;
    };
  }, []);

  const clearNodeHeartbeatTimer = () => {
    if (nodeHeartbeatTimerRef.current != null) {
      window.clearInterval(nodeHeartbeatTimerRef.current);
      nodeHeartbeatTimerRef.current = null;
    }
  };

  const appendTrace = (line: string) => {
    if (!debugEnabled) return;
    setTraceEvents((prev) => [...prev.slice(-11), line]);
  };

  const publishPeerOffer = async (sessionRecord: { session_id: string }, stream: MediaStream) => {
    const sessionId = sessionRecord.session_id;
    appendTrace(`peer:create ${sessionId}`);
    traceDevice('peer:create', { sessionId, trackCount: stream.getTracks().length });
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
      setPeerStatus('failed');
      return;
    }
    peerConnectionRef.current?.close();
    const peer = new RTCPeerConnection();
    peerConnectionRef.current = peer;
    peerSessionIdRef.current = sessionId;
    viewerIceSeenRef.current.clear();
    activeViewerIdRef.current = 'viewer-broadcast';
    peer.onconnectionstatechange = () => {
      traceDevice('peer:connection-state', { state: peer.connectionState });
      if (peer.connectionState === 'connected') setPeerStatus('connected');
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') setPeerStatus('failed');
    };
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void api.publishLiveSignalIce(sessionId, 'device', activeViewerIdRef.current, event.candidate.toJSON(), nodeId || undefined).catch(() => undefined);
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await api.publishLiveSignalOffer(sessionId, { type: 'offer', sdp: offer.sdp || '' }, nodeId || undefined);
    appendTrace(`peer:offer-published ${sessionId}`);
    setPeerStatus('offer-published');
    const live = await ensureLiveBroadcastAlignment({ api, sessionId, nodeId: nodeId || '' });
    if (!live.ok) {
      appendTrace(`peer:api-live-mismatch ${live.reason}`);
      setBroadcast((prev) => ({ ...prev, stage: 'failed', waitingForAnswer: false, error: makeBroadcastFailure('live_registry_mismatch', live.reason), updatedAt: Date.now() }));
      if (live.reason === 'session_not_listed' || live.reason === 'node_mismatch') {
        peer.close();
        setPeerStatus('failed');
      }
      return;
    }
    traceDevice('peer:api-live-confirmed', { sessionId, exists: true });
    appendTrace('peer:api-live-confirmed');
    setBroadcast((prev) => ({ ...prev, stage: 'waiting_for_answer', waitingForAnswer: true, updatedAt: Date.now() }));
    if (signalPollTimerRef.current != null) window.clearInterval(signalPollTimerRef.current);
    signalPollTimerRef.current = window.setInterval(() => {
      void api.getLiveSignalState(sessionId).then(async (signal) => {
        const activePeer = peerConnectionRef.current;
        if (!activePeer) return;
        if (signal.primary_viewer_id) activeViewerIdRef.current = signal.primary_viewer_id;
        if (signal.answer?.sdp && !activePeer.currentRemoteDescription) {
          await activePeer.setRemoteDescription(new RTCSessionDescription(signal.answer));
          appendTrace(`peer:answer-received ${sessionId}`);
          setBroadcast((prev) => ({ ...prev, stage: 'connected', waitingForAnswer: false, updatedAt: Date.now() }));
        }
        for (const candidate of signal.ice_from_viewer || []) {
          const key = `${candidate.candidate}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
          if (viewerIceSeenRef.current.has(key)) continue;
          viewerIceSeenRef.current.add(key);
          await activePeer.addIceCandidate(candidate);
        }
      }).catch(() => undefined);
    }, 1000);
  };

  const handleStartBroadcast = async () => {
    if (publisherBusyRef.current) return false;
    publisherBusyRef.current = true;
    try {
    traceDevice('broadcast:begin', {
      selectedDeviceId: camera.selectedDeviceId,
      cameraStatus: camera.status,
    });
    appendTrace('broadcast:begin');
    markLiveFlowStep({ deviceBroadcastRequestedAt: Date.now() });
    const existingStream = getUsableCameraStream();
    let stream = existingStream;
    if (!stream) {
      const enabled = await handleEnableCamera();
      if (!enabled) return false;
      stream = getUsableCameraStream();
    }
    traceDevice('broadcast:stream-source', {
      source: existingStream ? 'existing-camera-session' : 'new-camera-session',
      videoTracks: stream?.getVideoTracks().length ?? 0,
    });
    traceDevice('camera:success', {
      hasStream: !!stream,
      videoTracks: stream?.getVideoTracks().map((track) => ({
        id: track.id,
        label: track.label,
        readyState: track.readyState,
        enabled: track.enabled,
      })) ?? [],
    });
    if (!stream) throw new Error('camera_stream_not_ready');
    markLiveFlowStep({ deviceCameraReadyAt: Date.now() });
    setBroadcast((prev) => ({ ...prev, stage: 'camera_ready', updatedAt: Date.now() }));
    await bindPreviewStream(stream);
    appendTrace('live:startPreview');
    const nextSession = await startPreview('camera', { stream, deviceId: camera.selectedDeviceId ?? undefined });
    if (!nextSession) {
      setBroadcast((prev) => ({ ...prev, stage: 'failed', error: makeBroadcastFailure('live_session_failed'), updatedAt: Date.now() }));
      return false;
    }
    setActiveBroadcastSession(nextSession);
    activeBroadcastSessionRef.current = nextSession;
    setActiveRuntimeSession(nextSession.session_id, nextSession.node_id);
    publishBrowserRuntimeSession(nextSession.session_id, nextSession.node_id);
    appendTrace(`live:session-created ${nextSession.session_id}`);
    markLiveFlowStep({
      deviceBroadcastSessionId: nextSession.session_id,
      deviceBroadcastPublishedAt: Date.now(),
    });
    clearNodeHeartbeatTimer();
    if (nodeId) {
      if (!nodeHeartbeatTimerRef.current) nodeHeartbeatTimerRef.current = window.setInterval(() => {
        void syncBrowserRuntimeNode(nodeId).then((result) => {
          if (result.ok) {
            appendTrace('heartbeat:ok');
            setHeartbeatState('ok');
            return;
          }
          if (result.status === 'auth_failed') {
            appendTrace('heartbeat:auth-failed');
            setHeartbeatState('auth_failed');
            return;
          }
          appendTrace('heartbeat:error');
          setHeartbeatState('failed');
        });
      }, 20000);
    } else {
      appendTrace('heartbeat:skipped-no-token');
    }
    try {
      await publishPeerOffer(nextSession, stream);
    } catch (err) {
      appendTrace('peer:offer-failed');
      setPeerStatus('failed');
      setBroadcast((prev) => ({ ...prev, stage: 'failed', waitingForAnswer: false, error: makeBroadcastFailure('peer_offer_failed', err instanceof Error ? err.message : String(err)), updatedAt: Date.now() }));
      return false;
    }
    return true;
    } finally {
      publisherBusyRef.current = false;
    }
  };


  async function watchLiveSession(sessionRecord: { session_id: string }): Promise<void> {
    const sessionId = sessionRecord.session_id;
    appendTrace(`viewer:watch ${sessionId}`);
    setMode('remote');
    if (viewerPollTimerRef.current != null) {
      window.clearInterval(viewerPollTimerRef.current);
      viewerPollTimerRef.current = null;
    }
    viewerPeerRef.current?.close();
    viewerPeerRef.current = null;
    viewerSessionIdRef.current = sessionId;
    viewerIdRef.current = `viewer-${Date.now().toString(36)}`;
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
      setPeerStatus('failed');
      return;
    }

    const offer = await api.getLiveOffer(sessionId).catch(() => null);
    if (!offer?.sdp) {
      setPeerStatus('failed');
      return;
    }

    const peer = new RTCPeerConnection();
    viewerPeerRef.current = peer;
    const remoteStream = new MediaStream();
    peer.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks?.() || []) {
        remoteStream.addTrack(track);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = remoteStream;
        void videoRef.current.play?.().catch(() => undefined);
      }
      setPeerStatus('connected');
    };
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void api.postLiveViewerIce(sessionId, viewerIdRef.current, event.candidate.toJSON()).catch(() => undefined);
    };
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await api.postLiveViewerAnswer(sessionId, viewerIdRef.current, { type: 'answer', sdp: answer.sdp || '' });
    await api.postLiveViewerState(sessionId, viewerIdRef.current, 'answer-posted').catch(() => undefined);
    setPeerStatus('offer-published');

    const seenIce = new Set<string>();
    viewerPollTimerRef.current = window.setInterval(() => {
      const activePeer = viewerPeerRef.current;
      if (!activePeer || viewerSessionIdRef.current !== sessionId) return;
      void api.listLiveDeviceIce(sessionId).then(async (candidates) => {
        for (const candidate of candidates || []) {
          const key = `${candidate.candidate}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
          if (seenIce.has(key)) continue;
          seenIce.add(key);
          await activePeer.addIceCandidate(candidate);
        }
      }).catch(() => undefined);
    }, 1000);
  }

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
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
    traceDevice('useSelectedLocalDevice:preview-local', { hasStream: true });
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
        onEnableCamera={async (options) => {
          if (options?.deviceId || options?.facingMode) {
            const stream = await startCamera({ deviceId: options.deviceId ?? camera.selectedDeviceId, audio: true, facingMode: options.facingMode });
            if (!stream) return;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              await videoRef.current.play().catch(() => undefined);
            }
            return;
          }
          if (mode === 'remote') {
            const sessions = await api.listWebRtcLiveSessions().catch(() => []);
            const nextSession = sessions.find((item) => item.session_id && item.has_offer);
            if (nextSession) await watchLiveSession(nextSession);
            return;
          }
          await handleEnableCamera();
        }}
        onStartBroadcast={async () => { await handleStartBroadcast(); }}
        debugEvents={debugEnabled ? traceEvents : []}
        onUseSelectedLocalDevice={handleUseSelectedLocalDevice}
        onStartScreen={() => startPreview('screen')}
        onStopPreview={() => { stopPreview(); stopCamera(); }}
        onStartDeviceRecording={() => startRecording()}
        onStopDeviceRecording={() => stopRecording()}
        onBackToExplorer={() => {
          openExplorerTab('/');
          requestExplorerRefresh('device-back-to-explorer');
        }}
        broadcastLabel={`Broadcast: ${broadcast.stage} · Heartbeat: ${heartbeatState}`}
      />
    </DeviceMonitorShell>
  );

}
