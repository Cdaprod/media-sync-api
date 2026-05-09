// docker/packages/Explorer/app/connect/device/page.tsx

'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createApiClient } from '../../../src/api';
import { useLiveSession } from '../../../src/hooks/useLiveSession';
import FullscreenDevicePreview from './FullscreenDevicePreview';
import DeviceMonitorShell from './DeviceMonitorShell';
import { useCameraSession } from './useCameraSession';
import { ensureLiveBroadcastAlignment } from './liveBroadcastAlignment';
import {
  makeBroadcastFailure,
  type BroadcastSnapshot,
} from './broadcastSession';
import {
  getBrowserRuntimeIdentity,
  getBrowserRuntimeIdentityDiagnostics,
  importNodeAuthFromQuery,
  openExplorerTab,
  publishBrowserRuntimeTabActive,
  publishBrowserRuntimeSession,
  pruneLegacyNodeIdentityKeys,
  registerWindowName,
  requestExplorerRefresh,
  subscribeBrowserRuntimeChannel,
  syncBrowserRuntimeNode,
  setActiveRuntimeSession,
  setBrowserRuntimeIdentity,
  stripNodeAuthQueryParams,
} from '../../../src/lib/browserRuntimeIdentity';
import {
  getIceCandidateKey,
  safeAddIceCandidate,
  summarizeCandidatePairFromStats,
} from '../../../src/live/iceCandidateUtils';
import {
  extractMediaDirection,
  summarizePeerSenders,
  summarizePeerTransceivers,
} from '../../../src/live/webrtcSdpDiagnostics';
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
  const storedNodeId =
    typeof window !== 'undefined'
      ? window.localStorage.getItem('explorer_capture_node_id')
      : null;
  const nodeId = queryNodeId || storedNodeId;
  const queryToken = searchParams.get('token');
  useEffect(() => {
    registerWindowName('device');
    publishBrowserRuntimeTabActive('device');
    requestExplorerRefresh('device-mounted');
    const imported = importNodeAuthFromQuery();
    stripNodeAuthQueryParams();
    const identity = getBrowserRuntimeIdentity(imported.nodeId);
    if (identity.nodeId)
      setBrowserRuntimeIdentity(identity.nodeId, identity.token);
    pruneLegacyNodeIdentityKeys();
    traceDevice('node-auth:bootstrap', {
      imported: imported.imported,
      nodeId: imported.nodeId || identity.nodeId,
      tokenSource: imported.tokenSource || identity.tokenSource,
      diagnostics: getBrowserRuntimeIdentityDiagnostics(
        imported.nodeId || identity.nodeId,
      ),
    });
    const unsubscribe = subscribeBrowserRuntimeChannel((message) => {
      if (message.type === 'open-request' && message.targetRole === 'device') {
        publishBrowserRuntimeTabActive('device');
      }
    });
    const onFocus = () => {
      registerWindowName('device');
      publishBrowserRuntimeTabActive('device');
      requestExplorerRefresh('device-focus');
    };
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
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
    // Prevent concurrent double-registration from React StrictMode's double-invoke.
    // We track by nodeId so a genuine node change still triggers a fresh sync.
    if (syncCompletedForNodeRef.current === nodeId) return;
    let cancelled = false;
    const syncNodeRegistration = async () => {
      traceDevice('node-sync:begin', { nodeId });
      try {
        const syncResult = await syncBrowserRuntimeNode(nodeId);
        if (cancelled) return;
        if (syncResult.ok) {
          setHeartbeatState('ok');
          syncCompletedForNodeRef.current = nodeId;
        } else {
          setHeartbeatState(
            syncResult.status === 'auth_failed'
              ? 'auth_failed'
              : 'skipped-no-token',
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('401')) {
          // Do NOT clear identity or stop camera on auth failure — just surface the state.
          if (!cancelled) setHeartbeatState('auth_failed');
          traceDevice('node-sync:error', {
            message,
            nodeSyncStatus: 'auth_failed',
          });
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
    getPublishStream,
  } = useLiveSession(api, nodeId);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerSessionIdRef = useRef<string | null>(null);
  const viewerIceReceivedKeysRef = useRef<Set<string>>(new Set());
  const appliedViewerIceKeysRef = useRef<Set<string>>(new Set());
  const queuedViewerIceRef = useRef<RTCIceCandidateInit[]>([]);
  const viewerIceAddErrorsRef = useRef<Array<Record<string, string>>>([]);
  const activeViewerIdRef = useRef<string | null>(null);
  const signalPollTimerRef = useRef<number | null>(null);
  const publisherSignalPollLoopCountRef = useRef(0);
  const deviceIcePublishedCountRef = useRef(0);
  const publisherActorCreatedAtRef = useRef<number | null>(null);
  const publisherActorTeardownCountRef = useRef(0);
  const publisherAnswerAppliedRef = useRef(false);
  const publisherStreamSourceRef = useRef<'camera-session' | 'live-session'>(
    'camera-session',
  );
  const publisherPeerClosedByRef = useRef<string | null>(null);
  const nodeHeartbeatTimerRef = useRef<ReturnType<
    typeof window.setInterval
  > | null>(null);
  const publisherBusyRef = useRef(false);
  const publisherStatsTimerRef = useRef<ReturnType<
    typeof window.setInterval
  > | null>(null);
  const activeBroadcastSessionRef = useRef<{ session_id: string } | null>(null);
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const viewerPollTimerRef = useRef<number | null>(null);
  const viewerSessionIdRef = useRef<string | null>(null);
  const viewerIdRef = useRef<string>('viewer-default');
  const viewerAttachingRef = useRef<string | null>(null);
  const [peerStatus, setPeerStatus] = useState<string>('idle');
  const [mode, setMode] = useState<'local' | 'remote'>('local');
  const [activeBroadcastSession, setActiveBroadcastSession] = useState<{
    session_id: string;
  } | null>(null);
  const [traceEvents, setTraceEvents] = useState<string[]>([]);
  const [heartbeatState, setHeartbeatState] = useState<
    'ok' | 'skipped-no-token' | 'failed' | 'auth_failed'
  >('skipped-no-token');
  // Tracks the last nodeId that completed a successful sync to prevent duplicate
  // registration races during React StrictMode's double-invoke of effects in dev.
  const syncCompletedForNodeRef = useRef<string | null>(null);
  const [broadcast, setBroadcast] = useState<BroadcastSnapshot>({
    stage: 'idle',
    nodeId,
    selectedDeviceId: null,
    cameraLabel: null,
    sessionId: null,
    sourceKind: null,
    peerStatus: 'idle',
    waitingForAnswer: false,
    error: null,
    updatedAt: Date.now(),
  });
  const debugEnabled = searchParams.get('debug') === '1';
  const markLiveFlowStep = useCallback((patch: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    const current = ((window as any).__explorerLiveFlowDebug || {}) as Record<
      string,
      unknown
    >;
    (window as any).__explorerLiveFlowDebug = {
      ...current,
      ...patch,
      lastUpdatedAt: Date.now(),
    };
  }, []);
  const markBroadcastDebug = useCallback((patch: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    const current = ((window as any).__connectDeviceBroadcastDebug ||
      {}) as Record<string, unknown>;
    (window as any).__connectDeviceBroadcastDebug = {
      ...current,
      ...patch,
      lastUpdatedAt: Date.now(),
    };
  }, []);

  const classifyBroadcastStartFailure = (
    error: unknown,
  ): 'auth_required' | 'auth_failed' | 'live_session_create_failed' => {
    const message =
      error instanceof Error ? error.message : String(error || '');
    if (/missing_device_bearer_token|auth_required/i.test(message))
      return 'auth_required';
    if (/401|403|auth_failed|forbidden|unauthorized/i.test(message))
      return 'auth_failed';
    return 'live_session_create_failed';
  };

  const markPublisherPeerDebug = useCallback(
    (patch: Record<string, unknown>) => {
      if (typeof window === 'undefined') return;
      const current = ((window as any).__connectDevicePublisherPeerDebug ||
        {}) as Record<string, unknown>;
      (window as any).__connectDevicePublisherPeerDebug = {
        ...current,
        publisherActorKey: peerSessionIdRef.current
          ? `${peerSessionIdRef.current}::publisher`
          : null,
        session_id: peerSessionIdRef.current,
        sessionId: peerSessionIdRef.current,
        createdAt: publisherActorCreatedAtRef.current,
        teardownCount: publisherActorTeardownCountRef.current,
        nodeId,
        sourceKind: 'camera',
        pollingLoopCount: publisherSignalPollLoopCountRef.current,
        activePeerCount: peerConnectionRef.current ? 1 : 0,
        peerClosedBy: publisherPeerClosedByRef.current,
        ...patch,
        lastUpdatedAt: Date.now(),
      };
    },
    [nodeId],
  );

  const {
    camera,
    refreshDevices,
    selectDevice,
    startCamera,
    stopCamera,
    clearCameraError,
  } = useCameraSession({ videoRef });
  const sourceLabel =
    activeBroadcastSession?.session_id || session?.session_id
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
    const isIPhone =
      /iPhone|iPod/i.test(ua) ||
      (/iPhone/i.test(platform) && maxTouchPoints > 0);
    const isIPad =
      !isIPhone &&
      (/iPad/i.test(ua) || (/MacIntel/i.test(platform) && maxTouchPoints > 1));
    const isLikelyIOS =
      isIPhone ||
      isIPad ||
      (/AppleWebKit/i.test(ua) && /Safari/i.test(ua) && !/Android/i.test(ua));
    return {
      isSecureContext: window.isSecureContext,
      hasMediaDevices: !!mediaDevices,
      hasGetUserMedia:
        !!mediaDevices && typeof mediaDevices.getUserMedia === 'function',
      hasGetDisplayMedia:
        !!mediaDevices &&
        typeof (mediaDevices as MediaDevices & { getDisplayMedia?: unknown })
          .getDisplayMedia === 'function',
      isLikelyIOS,
    };
  }, []);

  const shouldShowScreenAction =
    capability.hasGetDisplayMedia && !capability.isLikelyIOS;
  const liveVideoTracksForStream = (
    stream: MediaStream | null | undefined,
  ): MediaStreamTrack[] => {
    if (!stream) return [];
    return stream
      .getVideoTracks()
      .filter((track) => track.readyState === 'live');
  };
  const hasLiveVideoTrack = (
    stream: MediaStream | null | undefined,
  ): stream is MediaStream => liveVideoTracksForStream(stream).length > 0;
  // Publisher stream authority: camera (useCameraSession) is the canonical
  // local capture authority; useLiveSession.getPublishStream() is the durable
  // live-session authority. videoRef.srcObject is preview-only and must NOT
  // participate in source-of-truth decisions for the publisher peer.
  const resolvePublisherStreamSource = (): {
    stream: MediaStream | null;
    source: 'camera-session' | 'live-session' | 'missing';
  } => {
    const cameraStream = camera.stream;
    if (hasLiveVideoTrack(cameraStream))
      return { stream: cameraStream, source: 'camera-session' };
    const liveStream = getPublishStream();
    if (hasLiveVideoTrack(liveStream))
      return { stream: liveStream, source: 'live-session' };
    return { stream: null, source: 'missing' };
  };
  const resolveActiveCameraStream = (): MediaStream | null => {
    return resolvePublisherStreamSource().stream;
  };
  const getUsableCameraStream = resolveActiveCameraStream;
  const failCameraStreamNotReady = (source: string) => {
    const videoSrcObject = videoRef.current?.srcObject;
    const hasVideoSrcObject = videoSrcObject instanceof MediaStream;
    const liveVideoTrackCount = hasVideoSrcObject
      ? liveVideoTracksForStream(videoSrcObject).length
      : 0;
    markBroadcastDebug({
      cameraStatus: camera.status,
      hasCameraStreamRef: hasLiveVideoTrack(camera.stream),
      hasVideoSrcObject,
      liveVideoTrackCount,
      selectedDeviceId: camera.selectedDeviceId,
      sessionId:
        activeBroadcastSessionRef.current?.session_id ||
        session?.session_id ||
        null,
      peerStatus,
      cameraStreamResolved: false,
      broadcastStatus: 'camera_stream_not_ready',
      lastFailureReason: 'camera_stream_not_ready',
      lastBroadcastError: 'camera_stream_not_ready',
      cameraStreamNotReadySource: source,
      publisherStreamSource: 'missing',
    });
    appendTrace('broadcast:camera-stream-not-ready');
    setPeerStatus('failed');
    setBroadcast((prev) => ({
      ...prev,
      stage: 'failed',
      waitingForAnswer: false,
      error: makeBroadcastFailure(
        'missing_media_stream',
        'camera_stream_not_ready',
      ),
      updatedAt: Date.now(),
    }));
    if (camera.status === 'ready' || camera.status === 'previewing') {
      stopCamera();
    }
    return null;
  };
  const ensureCameraStreamReady = async (): Promise<MediaStream | null> => {
    const existing = resolveActiveCameraStream();
    if (existing) return existing;
    const enabled = await handleEnableCamera();
    if (!enabled) return failCameraStreamNotReady('enable-camera-failed');
    return (
      resolveActiveCameraStream() ||
      failCameraStreamNotReady('stream-missing-after-enable')
    );
  };
  const bindPreviewStream = async (stream: MediaStream): Promise<void> => {
    if (!videoRef.current) return;
    if (videoRef.current.srcObject !== stream)
      videoRef.current.srcObject = stream;
    videoRef.current.muted = true;
    videoRef.current.playsInline = true;
    await videoRef.current.play?.().catch((error) => {
      traceDevice('camera:preview:play-blocked', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };
  const handleEnableCamera = async (): Promise<boolean> => {
    traceDevice('camera:enable:begin', {
      selectedDeviceId: camera.selectedDeviceId,
    });
    const existing = getUsableCameraStream();
    if (existing) {
      await bindPreviewStream(existing);
      traceDevice('camera:enable:reuse-existing');
      return true;
    }
    const stream = await startCamera({
      deviceId: camera.selectedDeviceId,
      audio: true,
    });
    if (!hasLiveVideoTrack(stream)) {
      failCameraStreamNotReady('start-camera-returned-no-live-video');
      return false;
    }
    await bindPreviewStream(stream);
    traceDevice('camera:enable:ready', {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });
    return true;
  };

  useEffect(() => {
    return () => {
      if (signalPollTimerRef.current != null) {
        window.clearInterval(signalPollTimerRef.current);
        signalPollTimerRef.current = null;
      }
      clearPublisherStatsPoll();
      if (peerConnectionRef.current) {
        publisherPeerClosedByRef.current = 'component-unmount';
        markPublisherPeerDebug({
          peerClosedBy: publisherPeerClosedByRef.current,
          restartReason: 'component-unmount',
        });
        peerConnectionRef.current.close();
      }
      peerConnectionRef.current = null;
      publisherSignalPollLoopCountRef.current = 0;
      deviceIcePublishedCountRef.current = 0;
      peerSessionIdRef.current = null;
      viewerIceReceivedKeysRef.current.clear();
      appliedViewerIceKeysRef.current.clear();
      queuedViewerIceRef.current = [];
      viewerIceAddErrorsRef.current = [];
      activeViewerIdRef.current = null;
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

  const clearPublisherSignalPoll = () => {
    if (signalPollTimerRef.current != null) {
      window.clearInterval(signalPollTimerRef.current);
      signalPollTimerRef.current = null;
    }
  };

  const clearPublisherStatsPoll = () => {
    if (publisherStatsTimerRef.current != null) {
      window.clearInterval(publisherStatsTimerRef.current);
      publisherStatsTimerRef.current = null;
    }
  };

  const samplePublisherOutboundRtpStats = async (
    sessionId: string,
    stream: MediaStream,
  ) => {
    const peer = peerConnectionRef.current;
    if (!peer || peerSessionIdRef.current !== sessionId) return;
    const localVideoTrack = stream.getVideoTracks()[0] || null;
    let outboundPatch: Record<string, unknown> = {
      outboundVideoBytesSent: 0,
      outboundVideoPacketsSent: 0,
      outboundVideoFramesEncoded: 0,
      outboundVideoFrameWidth: 0,
      outboundVideoFrameHeight: 0,
    };
    try {
      const report = await peer.getStats();
      report.forEach((entry) => {
        const stat = entry as any;
        if (stat.type !== 'outbound-rtp' || stat.kind !== 'video') return;
        outboundPatch = {
          outboundVideoBytesSent: stat.bytesSent ?? 0,
          outboundVideoPacketsSent: stat.packetsSent ?? 0,
          outboundVideoFramesEncoded: stat.framesEncoded ?? 0,
          outboundVideoFrameWidth: stat.frameWidth ?? 0,
          outboundVideoFrameHeight: stat.frameHeight ?? 0,
          lastOutboundVideoStatsAt: Date.now(),
        };
      });
    } catch (error) {
      markPublisherPeerDebug({
        outboundStatsError:
          error instanceof Error ? error.message : String(error),
      });
    }
    const bytesSent = Number(outboundPatch.outboundVideoBytesSent || 0);
    const connectedOrAnswered =
      publisherAnswerAppliedRef.current ||
      peer.connectionState === 'connected' ||
      peer.iceConnectionState === 'connected' ||
      peer.iceConnectionState === 'completed';
    const publisherMediaFailureClass =
      !localVideoTrack ||
      localVideoTrack.readyState !== 'live' ||
      localVideoTrack.muted
        ? 'local_track_not_live'
        : bytesSent > 0
          ? 'outbound_rtp_flowing'
          : connectedOrAnswered
            ? 'connected_but_no_outbound_rtp'
            : null;
    markPublisherPeerDebug({
      sessionId,
      peerConnectionState: peer.connectionState,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      signalingState: peer.signalingState,
      localTrackCount: stream
        .getTracks()
        .filter((track) => track.readyState === 'live').length,
      localVideoTrackMuted: localVideoTrack?.muted ?? null,
      localVideoTrackId: localVideoTrack?.id ?? null,
      localVideoTrackReadyState: localVideoTrack?.readyState ?? null,
      localVideoTrackEnabled: localVideoTrack?.enabled ?? null,
      senderKinds: [],
      senderTrackIds: [],
      transceiverDirections: [],
      transceiverCurrentDirections: [],
      ...summarizePeerSenders(peer),
      ...summarizePeerTransceivers(peer),
      ...outboundPatch,
      publisherMediaFailureClass,
    });
  };

  const publishPublisherSenderBindingDebug = (
    peer: RTCPeerConnection,
    patch: Record<string, unknown> = {},
  ) => {
    const videoSender =
      peer.getSenders().find((sender) => sender.track?.kind === 'video') ||
      null;
    const audioSender =
      peer.getSenders().find((sender) => sender.track?.kind === 'audio') ||
      null;
    markPublisherPeerDebug({
      publisherVideoSenderTrackId: videoSender?.track?.id ?? null,
      publisherAudioSenderTrackId: audioSender?.track?.id ?? null,
      publisherVideoSenderReadyState: videoSender?.track?.readyState ?? null,
      publisherVideoSenderEnabled: videoSender?.track?.enabled ?? null,
      publisherSenderBoundBeforeOffer: Boolean(
        videoSender?.track && audioSender?.track,
      ),
      ...summarizePeerSenders(peer),
      ...summarizePeerTransceivers(peer),
      ...patch,
    });
  };

  const ensurePublisherTransceivers = (
    peer: RTCPeerConnection,
    stream: MediaStream,
  ) => {
    const transceivers = peer.getTransceivers();
    const videoTrack =
      stream.getVideoTracks().find((track) => track.readyState === 'live') ||
      null;
    const audioTrack =
      stream.getAudioTracks().find((track) => track.readyState === 'live') ||
      null;
    const hasVideoSender =
      peer.getSenders().some((sender) => sender.track?.kind === 'video') ||
      transceivers.some(
        (transceiver) => transceiver.sender.track?.kind === 'video',
      );
    const hasAudioSender =
      peer.getSenders().some((sender) => sender.track?.kind === 'audio') ||
      transceivers.some(
        (transceiver) => transceiver.sender.track?.kind === 'audio',
      );
    if (videoTrack && !hasVideoSender) {
      const tx = peer.addTransceiver(videoTrack, {
        direction: 'sendonly',
        streams: [stream],
      });
      tx.direction = 'sendonly';
    }
    if (audioTrack && !hasAudioSender) {
      const tx = peer.addTransceiver(audioTrack, {
        direction: 'sendonly',
        streams: [stream],
      });
      tx.direction = 'sendonly';
    }
    publishPublisherSenderBindingDebug(peer, {
      publisherSenderBindingReason: 'ensurePublisherTransceivers',
    });
  };

  const reconcilePublisherTracks = async (
    peer: RTCPeerConnection,
    stream: MediaStream,
  ) => {
    ensurePublisherTransceivers(peer, stream);
    for (const track of stream
      .getTracks()
      .filter((item) => item.readyState === 'live')) {
      const transceivers = peer.getTransceivers();
      const transceiver =
        transceivers.find(
          (candidate) => candidate.sender.track?.kind === track.kind,
        ) ||
        transceivers.find(
          (candidate) => candidate.receiver.track.kind === track.kind,
        );
      if (!transceiver) {
        const tx = peer.addTransceiver(track, {
          direction: 'sendonly',
          streams: [stream],
        });
        tx.direction = 'sendonly';
        continue;
      }
      transceiver.direction = 'sendonly';
      if (transceiver.sender.track?.id !== track.id) {
        await transceiver.sender.replaceTrack(track);
      }
    }
    publishPublisherSenderBindingDebug(peer, {
      publisherSenderBindingReason: 'reconcilePublisherTracks',
    });
  };

  const publishPublisherIceCandidateDebug = async (
    patch: Record<string, unknown> = {},
  ) => {
    let statsPatch: Record<string, unknown> = {};
    if (peerConnectionRef.current) {
      try {
        statsPatch = await summarizeCandidatePairFromStats(
          peerConnectionRef.current,
        );
      } catch (error) {
        statsPatch = {
          candidatePairStatsError:
            error instanceof Error ? error.message : String(error),
        };
      }
    }
    markPublisherPeerDebug({
      viewerAnswerSeen: Boolean(peerConnectionRef.current?.remoteDescription),
      viewerAnswerApplied: publisherAnswerAppliedRef.current,
      viewerIceReceivedCount: viewerIceReceivedKeysRef.current.size,
      viewerIceAppliedCount: appliedViewerIceKeysRef.current.size,
      viewerIceQueuedCount: queuedViewerIceRef.current.length,
      viewerIceAddErrors: viewerIceAddErrorsRef.current,
      deviceIcePublishedCount: deviceIcePublishedCountRef.current,
      iceConnectionState: peerConnectionRef.current?.iceConnectionState ?? null,
      connectionState: peerConnectionRef.current?.connectionState ?? null,
      selectedCandidatePair: null,
      localCandidateTypes: [],
      remoteCandidateTypes: [],
      ...statsPatch,
      ...patch,
    });
  };

  const applyViewerIceCandidate = async (
    candidate: RTCIceCandidateInit,
    source: 'poll' | 'flush',
  ) => {
    const activePeer = peerConnectionRef.current;
    if (!activePeer) return;
    const key = getIceCandidateKey(candidate);
    if (!key.trim() || appliedViewerIceKeysRef.current.has(key)) return;
    if (!viewerIceReceivedKeysRef.current.has(key))
      viewerIceReceivedKeysRef.current.add(key);
    if (!activePeer.remoteDescription && !activePeer.currentRemoteDescription) {
      if (
        !queuedViewerIceRef.current.some(
          (queued) => getIceCandidateKey(queued) === key,
        )
      )
        queuedViewerIceRef.current.push(candidate);
      await publishPublisherIceCandidateDebug({
        queuedViewerIceReason: 'remote-answer-not-ready',
        lastViewerIceSource: source,
      });
      return;
    }
    const result = await safeAddIceCandidate(
      activePeer,
      candidate,
      `publisher-viewer-ice-${source}`,
    );
    if (result.ok) {
      appliedViewerIceKeysRef.current.add(key);
    } else {
      viewerIceAddErrorsRef.current = [
        ...viewerIceAddErrorsRef.current.slice(-9),
        { key, name: result.errorName, message: result.errorMessage },
      ];
    }
    await publishPublisherIceCandidateDebug({ lastViewerIceSource: source });
  };

  const flushQueuedViewerIce = async () => {
    const queued = queuedViewerIceRef.current;
    queuedViewerIceRef.current = [];
    for (const candidate of queued)
      await applyViewerIceCandidate(candidate, 'flush');
    await publishPublisherIceCandidateDebug({
      flushedViewerIceCount: queued.length,
    });
  };

  const isPublisherViewerIdReal = (viewerId: string | null | undefined): viewerId is string =>
    typeof viewerId === 'string' &&
    viewerId.length > 0 &&
    viewerId !== 'viewer-broadcast' &&
    viewerId !== 'viewer-unscoped' &&
    viewerId !== 'viewer-default';

  const collectViewerIdsFromSignal = (signal: unknown): string[] => {
    const ids = new Set<string>();
    if (!signal || typeof signal !== 'object') return [];
    const root = signal as Record<string, unknown>;
    for (const key of ['primary_viewer_id', 'viewer_id']) {
      const value = root[key];
      if (typeof value === 'string' && value.length > 0) ids.add(value);
    }
    const viewerIds = root['viewer_ids'];
    if (Array.isArray(viewerIds)) {
      for (const id of viewerIds) {
        if (typeof id === 'string' && id.length > 0) ids.add(id);
      }
    }
    return [...ids].filter(isPublisherViewerIdReal);
  };

  const resolvePublisherViewerId = (
    signal: unknown,
    currentViewerId: string | null,
  ): string | null => {
    if (isPublisherViewerIdReal(currentViewerId)) return currentViewerId;
    const discovered = collectViewerIdsFromSignal(signal);
    return discovered[0] || null;
  };

  const publishPeerOffer = async (
    sessionRecord: { session_id: string },
    stream: MediaStream,
  ) => {
    const sessionId = sessionRecord.session_id;
    const publisherStreamSource = publisherStreamSourceRef.current;
    if (!sessionId) {
      markBroadcastDebug({
        lastPeerError: 'missing_session_id_before_offer',
        offerCreated: false,
        offerPosted: false,
      });
      markPublisherPeerDebug({
        failureReason: 'missing_session_id_before_offer',
      });
      setPeerStatus('idle');
      throw new Error('missing_session_id_before_offer');
    }
    appendTrace(`peer:create ${sessionId}`);
    traceDevice('peer:create', {
      sessionId,
      trackCount: stream.getTracks().length,
    });
    const localTrackCount = stream
      .getTracks()
      .filter((track) => track.readyState === 'live').length;
    const liveVideoTrackCount = liveVideoTracksForStream(stream).length;
    const audioTrackCount = stream.getAudioTracks().length;
    markBroadcastDebug({
      nodeId,
      sessionId,
      hasStream: true,
      videoTrackCount: stream.getVideoTracks().length,
      audioTrackCount,
      offerCreated: false,
      offerPosted: false,
    });
    markPublisherPeerDebug({
      sessionId,
      hasStream: true,
      localTrackCount,
      liveVideoTrackCount,
      failureReason: null,
      deviceIcePublishedCount: deviceIcePublishedCountRef.current,
      viewerIceReceivedCount: viewerIceReceivedKeysRef.current.size,
      viewerIceAppliedCount: appliedViewerIceKeysRef.current.size,
      viewerIceQueuedCount: queuedViewerIceRef.current.length,
      publisherStreamSource,
    });
    markBroadcastDebug({ publisherStreamSource });
    if (
      typeof window === 'undefined' ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      markBroadcastDebug({ lastPeerError: 'rtc_unavailable' });
      markPublisherPeerDebug({ failureReason: 'rtc_unavailable' });
      setPeerStatus('failed');
      return;
    }
    if (liveVideoTrackCount === 0) {
      markBroadcastDebug({ lastPeerError: 'no_video_tracks' });
      markPublisherPeerDebug({ failureReason: 'no_video_tracks' });
      setPeerStatus('failed');
      setBroadcast((prev) => ({
        ...prev,
        stage: 'failed',
        waitingForAnswer: false,
        error: makeBroadcastFailure('missing_media_stream', 'no_video_tracks'),
        updatedAt: Date.now(),
      }));
      return;
    }
    if (
      peerConnectionRef.current &&
      peerSessionIdRef.current === sessionId &&
      publisherAnswerAppliedRef.current
    ) {
      await reconcilePublisherTracks(peerConnectionRef.current, stream);
      void samplePublisherOutboundRtpStats(sessionId, stream);
      markPublisherPeerDebug({
        restartReason: 'publisher-already-answer-applied',
        peerClosedBy: null,
        answerApplied: true,
      });
      appendTrace(`peer:reuse-answer-applied ${sessionId}`);
      setPeerStatus(
        peerConnectionRef.current.connectionState || 'answer_applied',
      );
      return;
    }
    clearPublisherSignalPoll();
    clearPublisherStatsPoll();
    if (peerConnectionRef.current && peerSessionIdRef.current !== sessionId) {
      publisherActorTeardownCountRef.current += 1;
      publisherPeerClosedByRef.current = 'session_id_changed';
      markPublisherPeerDebug({
        restartReason: 'session_id_changed',
        peerClosedBy: publisherPeerClosedByRef.current,
        teardownCount: publisherActorTeardownCountRef.current,
      });
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      publisherAnswerAppliedRef.current = false;
    }
    if (peerConnectionRef.current && peerSessionIdRef.current === sessionId) {
      publisherPeerClosedByRef.current = 'explicit-republish-before-answer';
      markPublisherPeerDebug({
        restartReason: 'republish-current-session-before-answer',
        peerClosedBy: publisherPeerClosedByRef.current,
        offerPublished: true,
      });
      peerConnectionRef.current.close();
      publisherActorTeardownCountRef.current += 1;
      publisherAnswerAppliedRef.current = false;
    }
    const peerCreatedAt = Date.now();
    publisherActorCreatedAtRef.current = peerCreatedAt;
    publisherPeerClosedByRef.current = null;
    const peer = new RTCPeerConnection();
    peerConnectionRef.current = peer;
    peerSessionIdRef.current = sessionId;
    viewerIceReceivedKeysRef.current.clear();
    appliedViewerIceKeysRef.current.clear();
    queuedViewerIceRef.current = [];
    viewerIceAddErrorsRef.current = [];
    deviceIcePublishedCountRef.current = 0;
    activeViewerIdRef.current = null;
    markPublisherPeerDebug({
      peerCreatedAt,
      createdAt: peerCreatedAt,
      restartReason: 'session-owned-publisher-created',
      peerClosedBy: null,
      offerPublished: false,
      answerSeen: false,
      answerApplied: false,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      iceGatheringState: peer.iceGatheringState,
      signalingState: peer.signalingState,
    });
    const publishStateDebug = () => {
      markPublisherPeerDebug({
        signalingState: peer.signalingState,
        iceConnectionState: peer.iceConnectionState,
        iceGatheringState: peer.iceGatheringState,
        connectionState: peer.connectionState,
        viewerIceReceivedCount: viewerIceReceivedKeysRef.current.size,
        viewerIceAppliedCount: appliedViewerIceKeysRef.current.size,
        viewerIceQueuedCount: queuedViewerIceRef.current.length,
        deviceIcePublishedCount: deviceIcePublishedCountRef.current,
        senderKinds: [],
        senderTrackIds: [],
        transceiverDirections: [],
        transceiverCurrentDirections: [],
        ...summarizePeerSenders(peer),
        ...summarizePeerTransceivers(peer),
      });
      if (
        peer.connectionState === 'connected' ||
        peer.iceConnectionState === 'connected' ||
        peer.iceConnectionState === 'completed'
      ) {
        setPeerStatus('connected');
        setBroadcast((prev) => ({
          ...prev,
          stage: 'connected',
          waitingForAnswer: false,
          updatedAt: Date.now(),
        }));
      }
      if (
        peer.connectionState === 'failed' ||
        peer.iceConnectionState === 'failed'
      ) {
        markPublisherPeerDebug({
          failureReason: 'ice_exchange_failed',
          restartReason: 'explicit-republish-required',
        });
        setPeerStatus('ice_exchange_failed');
      }
      if (
        peer.connectionState === 'disconnected' ||
        peer.iceConnectionState === 'disconnected'
      ) {
        markPublisherPeerDebug({ failureReason: 'peer_disconnected' });
        setPeerStatus('disconnected');
      }
    };
    peer.onconnectionstatechange = publishStateDebug;
    peer.oniceconnectionstatechange = publishStateDebug;
    peer.onicegatheringstatechange = publishStateDebug;
    peer.onsignalingstatechange = publishStateDebug;
    await reconcilePublisherTracks(peer, stream);
    publishPublisherSenderBindingDebug(peer, {
      localVideoTrackId: stream.getVideoTracks()[0]?.id ?? null,
      localVideoTrackReadyState: stream.getVideoTracks()[0]?.readyState ?? null,
      publisherSenderBoundBeforeOffer: true,
    });
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      deviceIcePublishedCountRef.current += 1;
      markPublisherPeerDebug({
        deviceIcePublishedCount: deviceIcePublishedCountRef.current,
      });
      void api
        .publishLiveSignalIce(
          sessionId,
          'device',
          activeViewerIdRef.current || 'viewer-broadcast',
          event.candidate.toJSON(),
          nodeId || undefined,
        )
        .catch((error) => {
          markPublisherPeerDebug({
            failureReason: 'device_ice_publish_failed',
            iceError: error instanceof Error ? error.message : String(error),
          });
        });
    };
    const offerCreatedAt = Date.now();
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    markBroadcastDebug({ offerCreated: true });
    markPublisherPeerDebug({
      offerCreatedAt,
      signalingState: peer.signalingState,
      offerVideoDirection: extractMediaDirection(offer.sdp || '', 'video'),
      offerAudioDirection: extractMediaDirection(offer.sdp || '', 'audio'),
      offerHasVideoSendonly:
        extractMediaDirection(offer.sdp || '', 'video') === 'sendonly',
      offerHasAudioSendonly:
        extractMediaDirection(offer.sdp || '', 'audio') === 'sendonly',
      publisherSenderBoundBeforeOffer: true,
      ...summarizePeerSenders(peer),
      ...summarizePeerTransceivers(peer),
    });
    try {
      await api.publishLiveSignalOffer(
        sessionId,
        { type: 'offer', sdp: offer.sdp || '' },
        nodeId || undefined,
      );
      markBroadcastDebug({ offerPosted: true, offerPostStatus: 'ok' });
      markPublisherPeerDebug({
        offerPublishedAt: Date.now(),
        offerPublished: true,
        failureReason: null,
      });
      requestExplorerRefresh('device-offer-published');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markBroadcastDebug({
        offerPosted: false,
        offerPostStatus: message,
        lastBroadcastError: message,
      });
      markPublisherPeerDebug({ failureReason: 'offer_publish_failed' });
      setPeerStatus('failed');
      setBroadcast((prev) => ({
        ...prev,
        stage: 'failed',
        waitingForAnswer: false,
        error: makeBroadcastFailure('offer_publish_failed', err),
        updatedAt: Date.now(),
      }));
      throw err;
    }
    appendTrace(`peer:offer-published ${sessionId}`);
    setPeerStatus('offer-published');
    const live = await ensureLiveBroadcastAlignment({
      api,
      sessionId,
      nodeId: nodeId || '',
    });
    if (!live.ok) {
      appendTrace(`peer:api-live-mismatch ${live.reason}`);
      markBroadcastDebug({
        lastBroadcastError: `live_registry_mismatch:${live.reason}`,
      });
      markPublisherPeerDebug({
        failureReason: `live_registry_mismatch:${live.reason}`,
      });
      setBroadcast((prev) => ({
        ...prev,
        stage: 'failed',
        waitingForAnswer: false,
        error: makeBroadcastFailure('live_registry_mismatch', live.reason),
        updatedAt: Date.now(),
      }));
      if (
        live.reason === 'session_not_listed' ||
        live.reason === 'node_mismatch'
      ) {
        peer.close();
        setPeerStatus('failed');
      }
      return;
    }
    traceDevice('peer:api-live-confirmed', { sessionId, exists: true });
    appendTrace('peer:api-live-confirmed');
    setBroadcast((prev) => ({
      ...prev,
      stage: 'waiting_for_answer',
      waitingForAnswer: true,
      updatedAt: Date.now(),
    }));
    let signalPollBusy = false;
    const pollSignal = () => {
      if (signalPollBusy) return;
      signalPollBusy = true;
      publisherSignalPollLoopCountRef.current += 1;
      markPublisherPeerDebug({
        pollingLoopCount: publisherSignalPollLoopCountRef.current,
      });
      void api
        .getLiveSignalState(sessionId)
        .then(async (initialSignal) => {
          const activePeer = peerConnectionRef.current;
          if (!activePeer || peerSessionIdRef.current !== sessionId) return;

          const discoveredViewerIds = collectViewerIdsFromSignal(initialSignal);
          const resolvedViewerId = resolvePublisherViewerId(
            initialSignal,
            activeViewerIdRef.current,
          );

          let signal = initialSignal;
          if (
            resolvedViewerId &&
            resolvedViewerId !== activeViewerIdRef.current
          ) {
            activeViewerIdRef.current = resolvedViewerId;
            markPublisherPeerDebug({
              activeViewerId: resolvedViewerId,
              discoveredViewerIds,
              viewerIdResolution: 'signal-discovery',
            });
            signal = await api
              .getLiveSignalState(sessionId, resolvedViewerId)
              .catch(() => initialSignal);
          }

          markPublisherPeerDebug({
            activeViewerId: activeViewerIdRef.current,
            discoveredViewerIds,
            answerSeen: Boolean(signal.answer?.sdp),
            signalViewerIceCount: (signal.ice_from_viewer || []).length,
            signalingState: activePeer.signalingState,
            iceConnectionState: activePeer.iceConnectionState,
            connectionState: activePeer.connectionState,
          });

          if (
            signal.answer?.sdp &&
            !activePeer.currentRemoteDescription &&
            !activePeer.remoteDescription
          ) {
            markPublisherPeerDebug({
              answerSeenAt: Date.now(),
              answerSeen: true,
              activeViewerId: activeViewerIdRef.current,
            });
            await activePeer.setRemoteDescription(
              new RTCSessionDescription(signal.answer),
            );
            publisherAnswerAppliedRef.current = true;
            await flushQueuedViewerIce();
            appendTrace(`peer:answer-applied ${sessionId}`);
            setPeerStatus('answer_applied');
            setBroadcast((prev) => ({
              ...prev,
              stage: 'waiting_for_answer',
              waitingForAnswer: false,
              updatedAt: Date.now(),
            }));
            markPublisherPeerDebug({
              answerAppliedAt: Date.now(),
              answerApplied: true,
              viewerAnswerApplied: true,
              activeViewerId: activeViewerIdRef.current,
              peerClosedBy: publisherPeerClosedByRef.current,
              signalingState: activePeer.signalingState,
              answerVideoDirection: extractMediaDirection(
                signal.answer.sdp || '',
                'video',
              ),
              answerAudioDirection: extractMediaDirection(
                signal.answer.sdp || '',
                'audio',
              ),
              ...summarizePeerSenders(activePeer),
              ...summarizePeerTransceivers(activePeer),
            });
          }
          for (const candidate of signal.ice_from_viewer || []) {
            await applyViewerIceCandidate(candidate, 'poll');
          }
          await publishPublisherIceCandidateDebug({
            activeViewerId: activeViewerIdRef.current,
            signalViewerIceCount: (signal.ice_from_viewer || []).length,
          });
        })
        .catch((error) => {
          markPublisherPeerDebug({
            failureReason: 'signal_poll_failed',
            signalPollError:
              error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          signalPollBusy = false;
        });
    };
    pollSignal();
    signalPollTimerRef.current = window.setInterval(pollSignal, 1000);
    void samplePublisherOutboundRtpStats(sessionId, stream);
    publisherStatsTimerRef.current = window.setInterval(() => {
      void samplePublisherOutboundRtpStats(sessionId, stream);
    }, 1000);
  };

  const handleStartBroadcast = async () => {
    if (publisherBusyRef.current) return false;
    publisherBusyRef.current = true;
    const broadcastStartRequestedAt = Date.now();
    const nodeAuthDiagnostics = getBrowserRuntimeIdentityDiagnostics(
      nodeId || undefined,
    );
    markBroadcastDebug({
      broadcastStartRequestedAt,
      broadcastStartFailedAt: null,
      broadcastStartFailureClass: null,
      nodeIdAtBroadcastStart: nodeId,
      hasNodeTokenAtBroadcastStart: nodeAuthDiagnostics.hasToken,
      liveSessionCreateAttempted: false,
      liveSessionCreateSucceeded: false,
      liveSessionCreateError: null,
      sessionIdAfterStartPreview: null,
    });
    try {
      traceDevice('broadcast:begin', {
        selectedDeviceId: camera.selectedDeviceId,
        cameraStatus: camera.status,
      });
      appendTrace('broadcast:begin');
      markLiveFlowStep({
        deviceBroadcastRequestedAt: broadcastStartRequestedAt,
      });
      const existingStream = resolveActiveCameraStream();
      const stream = await ensureCameraStreamReady();
      if (!stream) return false;
      const publisherStreamSource =
        resolvePublisherStreamSource().source === 'live-session'
          ? ('live-session' as const)
          : ('camera-session' as const);
      traceDevice('broadcast:stream-source', {
        source: existingStream
          ? 'existing-camera-session'
          : 'new-camera-session',
        publisherStreamSource,
        videoTracks: stream?.getVideoTracks().length ?? 0,
      });
      markBroadcastDebug({ publisherStreamSource });
      traceDevice('camera:success', {
        hasStream: !!stream,
        videoTracks:
          stream?.getVideoTracks().map((track) => ({
            id: track.id,
            label: track.label,
            readyState: track.readyState,
            enabled: track.enabled,
          })) ?? [],
      });
      markBroadcastDebug({
        nodeId,
        cameraReady: true,
        hasStream: true,
        videoTrackCount: stream.getVideoTracks().length,
        audioTrackCount: stream.getAudioTracks().length,
        cameraStatus: camera.status,
        hasCameraStreamRef: hasLiveVideoTrack(camera.stream),
        hasVideoSrcObject: videoRef.current?.srcObject instanceof MediaStream,
        liveVideoTrackCount: liveVideoTracksForStream(stream).length,
        selectedDeviceId: camera.selectedDeviceId,
        sessionId:
          activeBroadcastSessionRef.current?.session_id ||
          session?.session_id ||
          null,
        peerStatus,
        cameraStreamResolved: true,
        broadcastStatus: 'camera_ready',
        lastFailureReason: null,
      });
      markLiveFlowStep({ deviceCameraReadyAt: Date.now() });
      setBroadcast((prev) => ({
        ...prev,
        stage: 'camera_ready',
        updatedAt: Date.now(),
      }));
      await bindPreviewStream(stream);
      appendTrace('live:startPreview');
      const existingPublisherSession =
        activeBroadcastSessionRef.current || activeBroadcastSession || session;
      let nextSession:
        | typeof session
        | { session_id: string; node_id?: string | null }
        | null = null;
      if (existingPublisherSession?.session_id) {
        nextSession = existingPublisherSession;
        markBroadcastDebug({
          liveSessionCreateAttempted: false,
          liveSessionCreateSucceeded: true,
          liveSessionCreateError: null,
          sessionIdAfterStartPreview: existingPublisherSession.session_id,
        });
      } else {
        markBroadcastDebug({ liveSessionCreateAttempted: true });
        try {
          nextSession = await startPreview('camera', {
            stream,
            deviceId: camera.selectedDeviceId ?? undefined,
          });
          markBroadcastDebug({
            sessionIdAfterStartPreview: nextSession?.session_id || null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const failureClass = classifyBroadcastStartFailure(err);
          appendTrace(`live:startPreview-failed ${failureClass}`);
          markBroadcastDebug({
            broadcastStartFailedAt: Date.now(),
            broadcastStartFailureClass: failureClass,
            liveSessionCreateAttempted: true,
            liveSessionCreateSucceeded: false,
            liveSessionCreateError: message,
            sessionIdAfterStartPreview: null,
            startLiveSessionStatus: 'error',
            startLiveSessionSessionId: null,
            broadcastStatus: 'live_session_create_failed',
            lastFailureReason: failureClass,
            lastBroadcastError: message,
          });
          setPeerStatus('idle');
          setBroadcast((prev) => ({
            ...prev,
            stage: 'failed',
            waitingForAnswer: false,
            error: makeBroadcastFailure('live_session_create_failed', message),
            updatedAt: Date.now(),
          }));
          return false;
        }
      }
      if (!nextSession?.session_id) {
        const failureClass = 'live_session_create_failed';
        markBroadcastDebug({
          broadcastStartFailedAt: Date.now(),
          broadcastStartFailureClass: failureClass,
          liveSessionCreateAttempted: !existingPublisherSession?.session_id,
          liveSessionCreateSucceeded: false,
          liveSessionCreateError: 'startPreview returned no session_id',
          sessionIdAfterStartPreview: nextSession?.session_id || null,
          startLiveSessionStatus: 'no_session_returned',
          startLiveSessionSessionId: null,
          broadcastStatus: 'live_session_create_failed',
          lastFailureReason: failureClass,
          lastBroadcastError: 'startPreview returned no session_id',
        });
        setPeerStatus('idle');
        setBroadcast((prev) => ({
          ...prev,
          stage: 'failed',
          waitingForAnswer: false,
          error: makeBroadcastFailure(
            'live_session_create_failed',
            'startPreview returned no session_id',
          ),
          updatedAt: Date.now(),
        }));
        return false;
      }
      markBroadcastDebug({
        liveSessionCreateSucceeded: true,
        liveSessionCreateError: null,
        sessionIdAfterStartPreview: nextSession.session_id,
        startLiveSessionStatus: existingPublisherSession?.session_id
          ? 'reused_current_session'
          : 'ok',
        startLiveSessionSessionId: nextSession.session_id,
        sessionId: nextSession.session_id,
        broadcastStatus: existingPublisherSession?.session_id
          ? 'live_session_republish'
          : 'live_session_started',
      });
      setActiveBroadcastSession(nextSession);
      activeBroadcastSessionRef.current = nextSession;
      setActiveRuntimeSession(nextSession.session_id, nextSession.node_id);
      publishBrowserRuntimeSession(nextSession.session_id, nextSession.node_id);
      requestExplorerRefresh('device-live-session-created');
      appendTrace(
        `${existingPublisherSession?.session_id ? 'live:session-reused' : 'live:session-created'} ${nextSession.session_id}`,
      );
      markLiveFlowStep({
        deviceBroadcastSessionId: nextSession.session_id,
        deviceBroadcastPublishedAt: Date.now(),
      });
      clearNodeHeartbeatTimer();
      if (nodeId) {
        if (!nodeHeartbeatTimerRef.current)
          nodeHeartbeatTimerRef.current = window.setInterval(() => {
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
      publisherStreamSourceRef.current = publisherStreamSource;
      try {
        await publishPeerOffer(nextSession, stream);
      } catch (err) {
        appendTrace('peer:offer-failed');
        markBroadcastDebug({
          lastBroadcastError: err instanceof Error ? err.message : String(err),
        });
        setPeerStatus('failed');
        setBroadcast((prev) => ({
          ...prev,
          stage: 'failed',
          waitingForAnswer: false,
          error: makeBroadcastFailure(
            'peer_connection_failed',
            err instanceof Error ? err.message : String(err),
          ),
          updatedAt: Date.now(),
        }));
        return false;
      }
      return true;
    } finally {
      publisherBusyRef.current = false;
    }
  };

  async function watchLiveSession(sessionRecord: {
    session_id: string;
  }): Promise<void> {
    const sessionId = sessionRecord.session_id;
    if (viewerAttachingRef.current === sessionId) return;
    if (viewerSessionIdRef.current === sessionId && viewerPeerRef.current)
      return;
    viewerAttachingRef.current = sessionId;
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
    if (
      typeof window === 'undefined' ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setPeerStatus('failed');
      viewerAttachingRef.current = null;
      return;
    }

    let offer: RTCSessionDescriptionInit | null = null;
    for (let attempt = 0; attempt < 10 && !offer?.sdp; attempt++) {
      if (viewerSessionIdRef.current !== sessionId) {
        viewerAttachingRef.current = null;
        return;
      }
      offer = await api.getLiveOffer(sessionId).catch(() => null);
      if (!offer?.sdp && attempt < 9)
        await new Promise<void>((res) => setTimeout(res, 500));
    }
    if (!offer?.sdp) {
      setPeerStatus('failed');
      viewerAttachingRef.current = null;
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
      void api
        .postLiveViewerIce(
          sessionId,
          viewerIdRef.current,
          event.candidate.toJSON(),
        )
        .catch(() => undefined);
    };
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await api.postLiveViewerAnswer(sessionId, viewerIdRef.current, {
      type: 'answer',
      sdp: answer.sdp || '',
    });
    await api
      .postLiveViewerState(sessionId, viewerIdRef.current, 'answer-posted')
      .catch(() => undefined);
    setPeerStatus('offer-published');

    const seenIce = new Set<string>();
    viewerPollTimerRef.current = window.setInterval(() => {
      const activePeer = viewerPeerRef.current;
      if (!activePeer || viewerSessionIdRef.current !== sessionId) return;
      void api
        .listLiveDeviceIce(sessionId)
        .then(async (candidates) => {
          for (const candidate of candidates || []) {
            const key = `${candidate.candidate}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
            if (seenIce.has(key)) continue;
            seenIce.add(key);
            await activePeer.addIceCandidate(candidate);
          }
        })
        .catch(() => undefined);
    }, 1000);
    viewerAttachingRef.current = null;
  }

  const handleUseSelectedLocalDevice = async () => {
    traceDevice('useSelectedLocalDevice:begin', {
      selectedDeviceId: camera.selectedDeviceId,
    });
    const stream = await startCamera({
      deviceId: camera.selectedDeviceId,
      audio: true,
    });
    traceDevice('useSelectedLocalDevice:camera-result', {
      hasStream: !!stream,
    });
    if (!stream) return false;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
    traceDevice('useSelectedLocalDevice:preview-local', { hasStream: true });
    return true;
  };

  const handleStopBroadcast = () => {
    clearPublisherSignalPoll();
    clearPublisherStatsPoll();
    if (peerConnectionRef.current) {
      publisherPeerClosedByRef.current = 'explicit-stop-broadcast';
      markPublisherPeerDebug({
        peerClosedBy: publisherPeerClosedByRef.current,
        restartReason: 'explicit-stop-broadcast',
      });
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      publisherActorTeardownCountRef.current += 1;
    }
    publisherAnswerAppliedRef.current = false;
    peerSessionIdRef.current = null;
    activeBroadcastSessionRef.current = null;
    setActiveBroadcastSession(null);
    setBroadcast((prev) => ({
      ...prev,
      stage: 'idle',
      sessionId: null,
      waitingForAnswer: false,
      error: null,
      updatedAt: Date.now(),
    }));
    markPublisherPeerDebug({ cameraPreservedAfterStopBroadcast: true });
    setPeerStatus('idle');
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
      onToggleScopes={() =>
        window.dispatchEvent(new Event('explorer-monitor-toggle-scopes'))
      }
      onOpenMenu={() =>
        window.dispatchEvent(new Event('explorer-monitor-open-picker'))
      }
      onDone={() => router.push('/')}
    >
      <FullscreenDevicePreview
        nodeId={nodeId}
        state={state}
        sessionId={
          activeBroadcastSession?.session_id || session?.session_id || null
        }
        claimId={session?.claim_id ?? lastClaimId ?? null}
        chunkCount={session?.chunk_count ?? 0}
        sourceKind={session?.source_kind ?? null}
        error={
          error || broadcast.error?.cause || broadcast.error?.message || null
        }
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
        cameraErrorMessage={
          camera.error
            ? `${camera.error.name || camera.error.type}: ${camera.error.message}`
            : null
        }
        cameraWarning={camera.warning}
        onRefreshDevices={refreshDevices}
        onSelectCameraDevice={selectDevice}
        onClearCameraError={clearCameraError}
        onEnableCamera={async (options) => {
          if (options?.deviceId || options?.facingMode) {
            const stream = await startCamera({
              deviceId: options.deviceId ?? camera.selectedDeviceId,
              audio: true,
              facingMode: options.facingMode,
            });
            if (!stream) return;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              await videoRef.current.play().catch(() => undefined);
            }
            return;
          }
          if (mode === 'remote') {
            const sessions = await api.listWebRtcLiveSessions().catch(() => []);
            const nextSession = sessions.find(
              (item) => item.session_id && item.has_offer,
            );
            if (nextSession) await watchLiveSession(nextSession);
            return;
          }
          await handleEnableCamera();
        }}
        onStartBroadcast={async () => {
          await handleStartBroadcast();
        }}
        debugEvents={debugEnabled ? traceEvents : []}
        onUseSelectedLocalDevice={handleUseSelectedLocalDevice}
        onStartScreen={() => startPreview('screen')}
        onStopPreview={handleStopBroadcast}
        onStartDeviceRecording={() => startRecording()}
        onStopDeviceRecording={() => stopRecording()}
        onBackToExplorer={() => {
          openExplorerTab('/');
          requestExplorerRefresh('device-back-to-explorer');
        }}
        broadcastLabel={`Broadcast: ${broadcast.stage} · Heartbeat: ${heartbeatState}`}
        broadcastStage={broadcast.stage}
        activeBroadcastSessionId={activeBroadcastSession?.session_id || null}
      />
    </DeviceMonitorShell>
  );
}
