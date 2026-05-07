'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient } from '../api';
import type { WebRtcLiveSession } from '../contracts/live';
import type { LiveSessionRecord } from '../types/liveSession';
import { StreamHub } from '../runtime/StreamHub';
import { getIceCandidateKey, safeAddIceCandidate, summarizeCandidatePairFromStats } from '../live/iceCandidateUtils';
import { extractMediaDirection, summarizePeerReceivers, summarizePeerTransceivers } from '../live/webrtcSdpDiagnostics';

function usePreviewUrl(apiBase: string, sessionId: string, active: boolean) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      setUrl(`${apiBase}/api/live_sessions/${encodeURIComponent(sessionId)}/preview/latest?t=${Date.now()}`);
    };

    const interval = window.setInterval(tick, 1000);
    tick();

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [active, apiBase, sessionId]);

  return url;
}

const EXPLORER_LIVE_FAILURE_REASONS = [
  'no_offer',
  'answer_post_failed',
  'answer_not_confirmed',
  'no_device_ice',
  'set_remote_description_failed',
  'set_local_description_failed',
  'no_track',
  'src_object_missing',
  'play_failed',
  'video_playback_failed',
  'video_src_object_not_set',
  'video_has_no_live_tracks',
  'video_ready_state_zero',
  'remote_track_not_emitted',
  'peer_ice_failed_before_track',
  'ice_exchange_failed',
  'ice_failed',
  'peer_failed',
  'stale_session_not_found',
] as const;

type ExplorerLiveFailureReason = typeof EXPLORER_LIVE_FAILURE_REASONS[number];

type ViewerSignalingStatus = 'idle' | 'initializing' | 'waiting_for_offer' | 'offer_seen' | 'answer_publishing' | 'answer_published' | 'answer_confirmed' | 'failed' | 'stale_session_not_found';
type ViewerMediaStatus = 'idle' | 'waiting_for_track' | 'remote_track_not_emitted' | 'track_attached' | 'video_src_object_not_set' | 'video_has_no_live_tracks';
type ViewerPlaybackStatus = 'idle' | 'waiting_for_play' | 'playing' | 'video_playback_failed' | 'video_playback_interrupted' | 'video_playback_blocked';
type ViewerIceStatus = 'idle' | 'checking' | 'waiting_for_ice' | 'connected' | 'ice_connected' | 'disconnected' | 'ice_exchange_failed' | 'peer_ice_failed_before_track';
type ViewerPeerStatus = ViewerSignalingStatus | ViewerMediaStatus | ViewerPlaybackStatus | 'failed' | 'connected' | 'answering';

type ViewerMediaFailureClass =
  | 'track_attached_but_no_rtp'
  | 'rtp_receiving_but_no_frames_decoded'
  | 'frames_decoded_but_video_play_rejected'
  | 'video_play_interrupted_by_srcobject_reset'
  | 'frames_rendering'
  | 'playback_started_waiting_for_dimensions'
  | null;

function attachRemoteStreamToVideo(video: HTMLVideoElement, stream: MediaStream, reason: string): boolean {
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  const existing = video.srcObject;
  const existingStreamId = existing instanceof MediaStream ? existing.id : null;
  const newlyAssigned = existingStreamId !== stream.id;
  const assignedAt = newlyAssigned ? Date.now() : null;
  if (newlyAssigned) {
    video.srcObject = stream;
  }
  markExplorerViewerPeerDebug({
    attachRemoteStreamReason: reason,
    videoSrcObjectSet: video.srcObject === stream || existingStreamId === stream.id,
    videoSrcObjectStreamId: stream.id,
    ...(assignedAt ? { lastSrcObjectAssignedAt: assignedAt } : {}),
    srcObjectReusedByStreamId: !newlyAssigned,
    videoMuted: video.muted,
    videoPlaysInline: video.playsInline,
    videoAutoplay: video.autoplay,
  });
  return newlyAssigned;
}

function markExplorerLiveFlowDebug(patch: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const current = ((window as any).__explorerLiveFlowDebug || {}) as Record<string, unknown>;
  (window as any).__explorerLiveFlowDebug = {
    ...current,
    invalidAnswerGetDetected: false,
    invalidViewerHeartbeatDetected: false,
    ...patch,
    lastUpdatedAt: Date.now(),
  };
}

function markExplorerViewerPeerDebug(patch: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const current = ((window as any).__explorerViewerPeerDebug || {}) as Record<string, unknown>;
  (window as any).__explorerViewerPeerDebug = {
    ...current,
    ...patch,
    lastUpdatedAt: Date.now(),
  };
}

interface LiveSourceCardProps {
  session: LiveSessionRecord;
  apiBase?: string;
  autoStartPeer?: boolean;
  onOpen?: (session: LiveSessionRecord) => void;
  onStartRecording?: (session: LiveSessionRecord) => void;
  onStopRecording?: (session: LiveSessionRecord) => void;
  onRemoteStream?: (session: LiveSessionRecord, stream: MediaStream) => void;
  onRecordPeerSession?: (sessionId: string) => void;
  onStaleSession?: (sessionId: string, endpoint: string) => void;
  liveSignalSession?: WebRtcLiveSession | null;
}

export function LiveSourceCard({
  session,
  apiBase = '',
  autoStartPeer = false,
  onOpen,
  onStartRecording,
  onStopRecording,
  onRemoteStream,
  onRecordPeerSession,
  onStaleSession,
  liveSignalSession = null,
}: LiveSourceCardProps) {
  const isActive = session.status === 'previewing' || session.status === 'recording';
  const shouldPollChunkPreview = isActive && (session.status === 'recording' || Boolean(session.latest_chunk_path));
  const signalMetadata = (session.metadata || {}) as Record<string, unknown>;
  const signalHasOffer = Boolean(liveSignalSession?.has_offer ?? signalMetadata.has_offer);
  const signalHasAnswer = Boolean(liveSignalSession?.has_answer ?? signalMetadata.has_answer);
  const signalViewerCount = Number(liveSignalSession?.viewer_count ?? signalMetadata.viewer_count ?? 0) || 0;
  const signalState = String(liveSignalSession?.state ?? signalMetadata.state ?? '').trim();
  const signalSessionAvailable = Boolean(
    liveSignalSession?.session_id
      || signalMetadata.origin === 'webrtc-live-session'
      || signalHasOffer
      || signalHasAnswer,
  );
  const webRtcPreviewAvailable = signalSessionAvailable && (
    signalHasOffer
      || signalHasAnswer
      || signalViewerCount > 0
      || (signalState !== '' && signalState !== 'inactive')
  );
  const previewUrl = usePreviewUrl(apiBase, session.session_id, shouldPollChunkPreview);
  const imgRef = useRef<HTMLImageElement>(null);
  const peerVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const deviceIceReceivedKeysRef = useRef<Set<string>>(new Set());
  const appliedDeviceIceKeysRef = useRef<Set<string>>(new Set());
  const queuedDeviceIceRef = useRef<RTCIceCandidateInit[]>([]);
  const deviceIceAddErrorsRef = useRef<Array<Record<string, string>>>([]);
  const viewerIdRef = useRef(`viewer-${Math.random().toString(36).slice(2, 10)}`);
  const [peerEnabled, setPeerEnabled] = useState(autoStartPeer);
  useEffect(() => { if (autoStartPeer) setPeerEnabled(true); }, [autoStartPeer]);
  const [peerStream, setPeerStream] = useState<MediaStream | null>(null);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [peerStatus, setPeerStatus] = useState<ViewerPeerStatus>('idle');
  const [signalingStatus, setSignalingStatus] = useState<ViewerSignalingStatus>('idle');
  const [mediaStatus, setMediaStatus] = useState<ViewerMediaStatus>('idle');
  const [playbackStatus, setPlaybackStatus] = useState<ViewerPlaybackStatus>('idle');
  const [iceStatus, setIceStatus] = useState<ViewerIceStatus>('idle');
  const [peerDiagnostic, setPeerDiagnostic] = useState<string | null>(null);
  const [mediaFailureClass, setMediaFailureClass] = useState<ViewerMediaFailureClass>(null);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [peerRetryToken, setPeerRetryToken] = useState(0);
  const viewerActorCreatedAtRef = useRef<number | null>(null);
  const viewerActorTeardownCountRef = useRef(0);
  const stickyOfferSeenRef = useRef(false);
  const lastStableStateRef = useRef<string>('idle');
  const answerPostedRef = useRef(false);
  const viewerPollLoopCountRef = useRef(0);
  const viewerIcePublishedCountRef = useRef(0);
  const lastSrcObjectAssignedAtRef = useRef<number | null>(null);
  const remoteTrackAttachedAtRef = useRef<number | null>(null);
  const latestInboundVideoStatsRef = useRef<Record<string, unknown>>({});
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onRemoteStreamRef = useRef(onRemoteStream);
  const onStaleSessionRef = useRef(onStaleSession);
  onRemoteStreamRef.current = onRemoteStream;
  onStaleSessionRef.current = onStaleSession;
  const api = useMemo(() => createApiClient(apiBase), [apiBase]);
  const viewerId = viewerIdRef.current;
  const viewerActorKey = `${session.session_id}::${viewerId}::${peerRetryToken}`;
  const publishViewerState = (state: ViewerPeerStatus, diagnostic?: string | null, lanes?: { signaling?: ViewerSignalingStatus; media?: ViewerMediaStatus; playback?: ViewerPlaybackStatus; ice?: ViewerIceStatus }) => {
    lastStableStateRef.current = state;
    setPeerStatus(state);
    if (lanes?.signaling) setSignalingStatus(lanes.signaling);
    if (lanes?.media) setMediaStatus(lanes.media);
    if (lanes?.playback) setPlaybackStatus(lanes.playback);
    if (lanes?.ice) setIceStatus(lanes.ice);
    if (diagnostic !== undefined) setPeerDiagnostic(diagnostic);
    markExplorerViewerPeerDebug({
      currentState: state,
      lastStableState: lastStableStateRef.current,
      signalingStatus: lanes?.signaling || signalingStatus,
      mediaStatus: lanes?.media || mediaStatus,
      playbackStatus: lanes?.playback || playbackStatus,
      iceStatus: lanes?.ice || iceStatus,
      stickyOfferSeen: stickyOfferSeenRef.current,
    });
  };

  useEffect(() => {
    if (!imgRef.current || !previewUrl) return;
    const img = new Image();
    img.onload = () => {
      if (imgRef.current) imgRef.current.src = previewUrl;
    };
    img.src = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    if (!peerEnabled || !isActive) return undefined;
    const sessionId = session.session_id;
    const actorKey = `${sessionId}::${viewerIdRef.current}::${peerRetryToken}`;
    let disposed = false;
    let poll: number | null = null;
    let noTrackTimer: number | null = null;
    let statsPoll: number | null = null;
    let selectedCandidatePairTimeoutReported = false;
    const setFailure = (reason: ExplorerLiveFailureReason, message?: string) => {
      const stale = reason === 'stale_session_not_found';
      const mediaOnly = reason === 'video_playback_failed'
        || reason === 'play_failed'
        || reason === 'video_src_object_not_set'
        || reason === 'video_has_no_live_tracks'
        || reason === 'video_ready_state_zero'
        || reason === 'remote_track_not_emitted';
      const iceOnly = reason === 'ice_exchange_failed' || reason === 'peer_ice_failed_before_track' || reason === 'ice_failed';
      if (stale) setSignalingStatus('stale_session_not_found');
      else if (!mediaOnly && !iceOnly) setSignalingStatus('failed');
      if (mediaOnly) setMediaStatus(reason === 'remote_track_not_emitted' ? 'remote_track_not_emitted' : mediaStatus);
      if (iceOnly) setIceStatus(reason === 'peer_ice_failed_before_track' ? 'peer_ice_failed_before_track' : 'ice_exchange_failed');
      setPeerStatus(stale ? 'stale_session_not_found' : (mediaOnly ? peerStatus : 'failed'));
      setPeerDiagnostic(reason);
      if (message) setPeerError(message);
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerStatus: stale ? 'stale_session_not_found' : (mediaOnly ? peerStatus : 'failed'),
        signalingStatus: stale ? 'stale_session_not_found' : signalingStatus,
        mediaStatus,
        playbackStatus,
        iceStatus,
        failureReason: reason,
      });
      markExplorerViewerPeerDebug({ failureReason: reason, signalingStatus, mediaStatus, playbackStatus, iceStatus });
    };
    const isStaleSessionError = (error: unknown) => error instanceof Error && /\b404\b/.test(error.message);
    const dropStaleSession = (endpoint: string) => {
      disposed = true;
      if (poll != null) window.clearInterval(poll);
      if (statsPoll != null) window.clearInterval(statsPoll);
      if (noTrackTimer != null) window.clearTimeout(noTrackTimer);
      peerConnRef.current?.close();
      peerConnRef.current = null;
      deviceIceReceivedKeysRef.current.clear();
      appliedDeviceIceKeysRef.current.clear();
      queuedDeviceIceRef.current = [];
      deviceIceAddErrorsRef.current = [];
      answerPostedRef.current = false;
      viewerPollLoopCountRef.current = 0;
      viewerIcePublishedCountRef.current = 0;
      viewerActorTeardownCountRef.current += 1;
      markExplorerViewerPeerDebug({ activePeerCount: 0, teardownCount: viewerActorTeardownCountRef.current, restartReason: 'actor-cleanup' });
      if (peerVideoRef.current) peerVideoRef.current.srcObject = null;
      lastSrcObjectAssignedAtRef.current = null;
      remoteTrackAttachedAtRef.current = null;
      latestInboundVideoStatsRef.current = {};
      StreamHub.delete(sessionId);
      setPeerStream(null);
      setFailure('stale_session_not_found', 'Live session no longer exists. Refreshing live sessions.');
      markExplorerLiveFlowDebug({
        staleSessionDroppedAt: Date.now(),
        staleSessionId: sessionId,
        staleSessionEndpoint: endpoint,
        activeSessionIds: [],
      });
      onStaleSessionRef.current?.(sessionId, endpoint);
      // Contract marker: onStaleSession?.(sessionId, endpoint) is owned through a ref so callback identity changes do not restart the actor.
    };
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
      setPeerError('WebRTC peer viewing is unavailable in this browser.');
      setPeerDiagnostic('rtc_unavailable');
      setPeerStatus('failed');
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerStatus: 'failed',
        failureReason: 'rtc_unavailable',
      });
      return undefined;
    }
    let consecutiveFails = 0;
    let remoteTrackCount = 0;
    answerPostedRef.current = false;
    stickyOfferSeenRef.current = false;
    viewerActorCreatedAtRef.current = Date.now();
    const peer = new RTCPeerConnection();
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });
    peerConnRef.current = peer;
    deviceIceReceivedKeysRef.current.clear();
    appliedDeviceIceKeysRef.current.clear();
    queuedDeviceIceRef.current = [];
    deviceIceAddErrorsRef.current = [];
    setPeerError(null);
    setPeerDiagnostic('initializing');
    setPeerStatus('initializing' as typeof peerStatus);
    const viewerId = viewerIdRef.current;
    markExplorerLiveFlowDebug({
      watchLiveSessionId: sessionId,
      viewerId,
      viewerStatus: 'initializing',
      offerSeen: false,
      answerPostStatus: 'idle',
      answerConfirmed: false,
      remoteTrackCount: 0,
      videoSrcObjectSet: false,
      videoPlayResolved: false,
      failureReason: null,
      invalidAnswerGetDetected: false,
      invalidViewerHeartbeatDetected: false,
    });
    markExplorerViewerPeerDebug({
      actorKey,
      session_id: sessionId,
      sessionId,
      viewer_id: viewerId,
      viewerId,
      reconnectGeneration: peerRetryToken,
      createdAt: viewerActorCreatedAtRef.current,
      teardownCount: viewerActorTeardownCountRef.current,
      restartReason: peerRetryToken > 0 ? 'explicit-reconnect' : 'session-viewer-actor-created',
      failureReason: null,
      remoteTrackCount: 0,
      deviceIceSeenCount: 0,
      viewerIcePublishedCount: viewerIcePublishedCountRef.current,
      videoSrcObjectSet: false,
      pollingLoopCount: viewerPollLoopCountRef.current,
      stickyOfferSeen: stickyOfferSeenRef.current,
      lastStableState: lastStableStateRef.current,
      currentState: 'initializing',
      signalingStatus: 'initializing',
      mediaStatus: 'idle',
      playbackStatus: 'idle',
      iceStatus: 'idle',
      activePeerCount: 1,
      ...summarizePeerReceivers(peer),
      ...summarizePeerTransceivers(peer),
    });
    publishViewerState('waiting_for_offer', 'initializing', { signaling: 'waiting_for_offer', media: 'idle', playback: 'idle', ice: 'idle' });

    noTrackTimer = window.setTimeout(() => {
      if (disposed || remoteTrackCount > 0) return;
      setPeerDiagnostic('remote_track_not_emitted');
      setMediaStatus('remote_track_not_emitted');
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerId,
        viewerStatus: peer.connectionState || 'waiting',
        remoteTrackCount,
        mediaStatus: 'remote_track_not_emitted',
        failureReason: 'remote_track_not_emitted',
      });
    }, 10000);

    const publishIceCandidateDebug = async (patch: Record<string, unknown> = {}) => {
      let statsPatch: Record<string, unknown> = {};
      const activePeer = peerConnRef.current;
      if (activePeer) {
        try {
          statsPatch = await summarizeCandidatePairFromStats(activePeer);
        } catch (error) {
          statsPatch = { candidatePairStatsError: error instanceof Error ? error.message : String(error) };
        }
      }
      markExplorerViewerPeerDebug({
        deviceIceReceivedCount: deviceIceReceivedKeysRef.current.size,
        deviceIceAppliedCount: appliedDeviceIceKeysRef.current.size,
        deviceIceQueuedCount: queuedDeviceIceRef.current.length,
        deviceIceAddErrors: deviceIceAddErrorsRef.current,
        viewerIcePublishedCount: viewerIcePublishedCountRef.current,
        iceConnectionState: activePeer?.iceConnectionState ?? null,
        connectionState: activePeer?.connectionState ?? null,
        selectedCandidatePair: null,
        localCandidateTypes: [],
        remoteCandidateTypes: [],
        ...(activePeer ? summarizePeerReceivers(activePeer) : { receiverKinds: [], receiverTrackIds: [] }),
        ...(activePeer ? summarizePeerTransceivers(activePeer) : { transceiverDirections: [], transceiverCurrentDirections: [] }),
        ...statsPatch,
        ...patch,
      });
    };

    const applyDeviceIceCandidate = async (candidate: RTCIceCandidateInit, source: 'poll' | 'flush') => {
      const activePeer = peerConnRef.current;
      if (!activePeer || disposed) return;
      const key = getIceCandidateKey(candidate);
      if (!key.trim() || appliedDeviceIceKeysRef.current.has(key)) return;
      if (!deviceIceReceivedKeysRef.current.has(key)) deviceIceReceivedKeysRef.current.add(key);
      if (!activePeer.remoteDescription && !activePeer.currentRemoteDescription) {
        if (!queuedDeviceIceRef.current.some((queued) => getIceCandidateKey(queued) === key)) queuedDeviceIceRef.current.push(candidate);
        await publishIceCandidateDebug({ queuedDeviceIceReason: 'remote-description-not-ready', lastDeviceIceSource: source });
        return;
      }
      const result = await safeAddIceCandidate(activePeer, candidate, `viewer-device-ice-${source}`);
      if (result.ok) {
        appliedDeviceIceKeysRef.current.add(key);
      } else {
        deviceIceAddErrorsRef.current = [...deviceIceAddErrorsRef.current.slice(-9), { key, name: result.errorName, message: result.errorMessage }];
      }
      await publishIceCandidateDebug({ lastDeviceIceSource: source });
    };

    const flushQueuedDeviceIce = async () => {
      const queued = queuedDeviceIceRef.current;
      queuedDeviceIceRef.current = [];
      for (const candidate of queued) await applyDeviceIceCandidate(candidate, 'flush');
      await publishIceCandidateDebug({ flushedDeviceIceCount: queued.length });
    };

    const classifyMediaFailure = (patch: Record<string, unknown> = {}): ViewerMediaFailureClass => {
      const video = peerVideoRef.current;
      const stats = { ...latestInboundVideoStatsRef.current, ...patch } as Record<string, unknown>;
      const bytes = Number(stats.inboundVideoBytesReceived || 0);
      const framesDecoded = Number(stats.inboundVideoFramesDecoded || 0);
      const videoWidth = video?.videoWidth || 0;
      const videoHeight = video?.videoHeight || 0;
      const rejectedName = typeof stats.videoPlayRejectedName === 'string' ? stats.videoPlayRejectedName : null;
      const elapsedSinceTrack = remoteTrackAttachedAtRef.current ? Date.now() - remoteTrackAttachedAtRef.current : 0;
      const elapsedSinceSrcObject = lastSrcObjectAssignedAtRef.current ? Date.now() - lastSrcObjectAssignedAtRef.current : Number.POSITIVE_INFINITY;
      let next: ViewerMediaFailureClass = mediaFailureClass;
      if (videoWidth > 0 && videoHeight > 0) next = 'frames_rendering';
      else if (rejectedName === 'AbortError' && elapsedSinceSrcObject <= 1000) next = 'video_play_interrupted_by_srcobject_reset';
      else if (framesDecoded > 0 && rejectedName) next = 'frames_decoded_but_video_play_rejected';
      else if (bytes > 0 && framesDecoded <= 0 && elapsedSinceTrack >= 3000) next = 'rtp_receiving_but_no_frames_decoded';
      else if (remoteTrackAttachedAtRef.current && bytes <= 0 && elapsedSinceTrack >= 3000) next = 'track_attached_but_no_rtp';
      if (next !== mediaFailureClass) setMediaFailureClass(next);
      markExplorerViewerPeerDebug({ mediaFailureClass: next, ...stats });
      return next;
    };

    const sampleInboundRtpStats = async () => {
      if (disposed || !peerConnRef.current) return;
      const activePeer = peerConnRef.current;
      const video = peerVideoRef.current;
      const stream = peerStream || (video?.srcObject instanceof MediaStream ? video.srcObject : null);
      const remoteTracks = stream?.getTracks() || activePeer.getReceivers().map((receiver) => receiver.track).filter(Boolean) as MediaStreamTrack[];
      const remoteVideoTrack = remoteTracks.find((track) => track.kind === 'video') || null;
      let inboundPatch: Record<string, unknown> = {};
      try {
        const report = await activePeer.getStats();
        report.forEach((entry) => {
          const stat = entry as any;
          if (stat.type !== 'inbound-rtp' || stat.kind !== 'video') return;
          inboundPatch = {
            inboundVideoBytesReceived: stat.bytesReceived ?? 0,
            inboundVideoPacketsReceived: stat.packetsReceived ?? 0,
            inboundVideoPacketsLost: stat.packetsLost ?? 0,
            inboundVideoFramesDecoded: stat.framesDecoded ?? 0,
            inboundVideoFramesReceived: stat.framesReceived ?? 0,
            inboundVideoFrameWidth: stat.frameWidth ?? 0,
            inboundVideoFrameHeight: stat.frameHeight ?? 0,
            inboundVideoFramesPerSecond: stat.framesPerSecond ?? 0,
            lastInboundVideoStatsAt: Date.now(),
          };
        });
      } catch (error) {
        markExplorerViewerPeerDebug({ inboundStatsError: error instanceof Error ? error.message : String(error) });
      }
      latestInboundVideoStatsRef.current = { ...latestInboundVideoStatsRef.current, ...inboundPatch };
      classifyMediaFailure(inboundPatch);
      markExplorerViewerPeerDebug({
        sessionId,
        viewerId,
        signalingState: activePeer.signalingState,
        iceConnectionState: activePeer.iceConnectionState,
        connectionState: activePeer.connectionState,
        remoteTrackCount: remoteTracks.length,
        remoteVideoTrackCount: remoteTracks.filter((track) => track.kind === 'video').length,
        remoteAudioTrackCount: remoteTracks.filter((track) => track.kind === 'audio').length,
        remoteVideoTrackId: remoteVideoTrack?.id ?? null,
        remoteVideoTrackReadyState: remoteVideoTrack?.readyState ?? null,
        remoteVideoTrackMuted: remoteVideoTrack?.muted ?? null,
        remoteVideoTrackEnabled: remoteVideoTrack?.enabled ?? null,
        videoSrcObjectSet: video?.srcObject instanceof MediaStream,
        videoSrcObjectStreamId: video?.srcObject instanceof MediaStream ? video.srcObject.id : null,
        videoReadyState: video?.readyState ?? null,
        videoPaused: video?.paused ?? null,
        videoMuted: video?.muted ?? null,
        videoPlaysInline: video?.playsInline ?? null,
        videoAutoplay: video?.autoplay ?? null,
        videoWidth: video?.videoWidth ?? 0,
        videoHeight: video?.videoHeight ?? 0,
        lastSrcObjectAssignedAt: lastSrcObjectAssignedAtRef.current,
        ...summarizePeerReceivers(activePeer),
        ...summarizePeerTransceivers(activePeer),
        ...latestInboundVideoStatsRef.current,
      });
    };

    const attemptPlayAttachedStream = async (video: HTMLVideoElement, stream: MediaStream, source: 'ontrack' | 'tap') => {
      attachRemoteStreamToVideo(video, stream, `play-${source}`);
      const liveVideoTrackCount = stream.getVideoTracks().filter((track) => track.readyState === 'live').length;
      const readyStateBeforePlay = video.readyState;
      markExplorerViewerPeerDebug({
        playbackAttemptSource: source,
        videoReadyStateBeforePlay: readyStateBeforePlay,
        liveVideoTrackCount,
        videoPausedBeforePlay: video.paused,
      });
      if (liveVideoTrackCount <= 0) {
        setMediaStatus('video_has_no_live_tracks');
        setPeerDiagnostic('video_has_no_live_tracks');
        markExplorerViewerPeerDebug({ failureReason: 'video_has_no_live_tracks', liveVideoTrackCount });
      }
      if (readyStateBeforePlay === 0) {
        markExplorerViewerPeerDebug({ failureReason: 'video_ready_state_zero', videoReadyStateBeforePlay: readyStateBeforePlay });
      }
      setPlaybackStatus('waiting_for_play');
      try {
        await video.play();
        if (disposed) return;
        const nextFailureClass: ViewerMediaFailureClass = video.videoWidth > 0 && video.videoHeight > 0 ? 'frames_rendering' : 'playback_started_waiting_for_dimensions';
        setMediaFailureClass(nextFailureClass);
        setShowTapToPlay(false);
        publishViewerState('playing', 'remote-track-playing', { media: 'track_attached', playback: 'playing' });
        markExplorerLiveFlowDebug({
          watchLiveSessionId: sessionId,
          viewerId,
          viewerStatus: 'playing',
          mediaStatus: 'track_attached',
          playbackStatus: 'playing',
          remoteTrackCount,
          videoSrcObjectSet: true,
          videoPlayResolved: true,
          failureReason: null,
          videoPlayingAt: Date.now(),
        });
        markExplorerViewerPeerDebug({ videoPlayResolved: true, videoPlayResolvedAt: Date.now(), failureReason: null, mediaFailureClass: nextFailureClass, videoWidth: video.videoWidth, videoHeight: video.videoHeight });
      } catch (error) {
        if (disposed) return;
        const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'UnknownError');
        const errorMessage = error instanceof Error ? error.message : String(error);
        const nextPlayback: ViewerPlaybackStatus = errorName === 'AbortError' ? 'video_playback_interrupted' : 'video_playback_blocked';
        const nextFailureClass = classifyMediaFailure({ videoPlayRejectedName: errorName, videoPlayRejectedMessage: errorMessage });
        setShowTapToPlay(true);
        setPlaybackStatus(nextPlayback);
        setPeerDiagnostic('video_playback_failed');
        setPeerError(errorName === 'AbortError' ? null : `Live stream is attached but playback was blocked: ${errorName}`);
        publishViewerState('track_attached', 'video_playback_failed', { media: 'track_attached', playback: nextPlayback });
        markExplorerViewerPeerDebug({
          failureReason: 'video_playback_failed',
          videoPlayResolved: false,
          videoPlayRejectedName: errorName,
          videoPlayRejectedMessage: errorMessage,
          videoReadyStateAfterPlayRejection: video.readyState,
          videoPausedAfterPlayRejection: video.paused,
          videoSrcObjectSet: video.srcObject === stream,
          mediaFailureClass: nextFailureClass,
        });
        markExplorerLiveFlowDebug({
          watchLiveSessionId: sessionId,
          viewerId,
          viewerStatus: 'track_attached',
          mediaStatus: 'track_attached',
          playbackStatus: nextPlayback,
          remoteTrackCount,
          videoSrcObjectSet: true,
          videoPlayResolved: false,
          failureReason: 'video_playback_failed',
          playErrorName: errorName,
          playError: errorMessage,
        });
      }
    };

    peer.ontrack = (event) => {
      const stream = event.streams?.[0] || (event.track ? new MediaStream([event.track]) : null);
      if (!stream) {
        setMediaStatus('remote_track_not_emitted');
        setPeerDiagnostic('remote_track_not_emitted');
        markExplorerViewerPeerDebug({ failureReason: 'remote_track_not_emitted', remoteTrackEventWithoutStream: true });
        return;
      }
      const streamId = stream.id;
      const liveVideoTrackCount = stream.getVideoTracks().filter((track) => track.readyState === 'live').length;
      remoteTrackCount += event.track ? 1 : stream.getTracks().length;
      StreamHub.set(sessionId, stream);
      let videoSrcObjectSet = false;
      const video = peerVideoRef.current;
      if (video) {
        const assigned = attachRemoteStreamToVideo(video, stream, 'ontrack');
        if (assigned) lastSrcObjectAssignedAtRef.current = Date.now();
        remoteTrackAttachedAtRef.current = Date.now();
        setMediaFailureClass(null);
        videoSrcObjectSet = true;
        setPeerStatus('track_attached');
        publishViewerState('track_attached', 'track_attached', { media: 'track_attached', playback: 'waiting_for_play' });
        markExplorerViewerPeerDebug({
          remoteStreamId: streamId,
          videoSrcObjectSet: true,
          remoteTrackCount,
          liveVideoTrackCount,
          videoReadyStateAfterSrcObject: video.readyState,
          lastSrcObjectAssignedAt: lastSrcObjectAssignedAtRef.current,
          videoPausedAfterSrcObject: video.paused,
          videoLoadedMetadataAt: null,
          videoCanPlayAt: null,
        });
        video.onloadedmetadata = () => markExplorerViewerPeerDebug({ videoLoadedMetadataAt: Date.now(), videoReadyState: video.readyState });
        video.oncanplay = () => markExplorerViewerPeerDebug({ videoCanPlayAt: Date.now(), videoReadyState: video.readyState });
        video.onplaying = () => markExplorerViewerPeerDebug({ videoPlayingAt: Date.now(), videoReadyState: video.readyState, failureReason: null });
        void attemptPlayAttachedStream(video, stream, 'ontrack');
      } else {
        setMediaStatus('video_src_object_not_set');
        setFailure('video_src_object_not_set', 'Live viewer video element is unavailable.');
        markExplorerViewerPeerDebug({ failureReason: 'video_src_object_not_set' });
      }
      setPeerStream(stream);
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerId,
        remoteTrackCount,
        remoteStreamId: streamId,
        liveVideoTrackCount,
        videoSrcObjectSet,
        mediaStatus: videoSrcObjectSet ? 'track_attached' : 'video_src_object_not_set',
        failureReason: null,
      });
      markExplorerViewerPeerDebug({ remoteTrackCount, remoteStreamId: streamId, liveVideoTrackCount, videoSrcObjectSet, failureReason: null, mediaFailureClass: null });
      void sampleInboundRtpStats();
      onRemoteStreamRef.current?.(sessionRef.current, stream);
    };
    const publishViewerPeerState = () => {
      const iceConnected = peer.connectionState === 'connected' || peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed';
      const iceFailed = peer.connectionState === 'failed' || peer.iceConnectionState === 'failed';
      const iceDisconnected = peer.connectionState === 'disconnected' || peer.iceConnectionState === 'disconnected';
      const nextIceStatus: ViewerIceStatus = iceConnected ? 'ice_connected' : (iceFailed ? 'ice_exchange_failed' : (iceDisconnected ? 'disconnected' : (answerPostedRef.current ? 'waiting_for_ice' : 'checking')));
      setIceStatus(nextIceStatus);
      void publishIceCandidateDebug({ signalingState: peer.signalingState, iceStatus: nextIceStatus, remoteTrackCount });
      markExplorerLiveFlowDebug({ watchLiveSessionId: sessionId, viewerId, viewerStatus: lastStableStateRef.current, iceStatus: nextIceStatus, mediaStatus, playbackStatus });
      if (iceConnected && remoteTrackCount === 0) publishViewerState('waiting_for_track', 'waiting_for_track', { media: 'waiting_for_track', ice: 'ice_connected' });
      if (iceFailed) {
        setFailure(remoteTrackCount === 0 ? 'peer_ice_failed_before_track' : 'ice_exchange_failed', remoteTrackCount === 0 ? 'ICE failed before a remote media track was emitted.' : 'ICE failed after media track attachment.');
      }
    };
    peer.onconnectionstatechange = publishViewerPeerState;
    peer.oniceconnectionstatechange = publishViewerPeerState;
    peer.onsignalingstatechange = publishViewerPeerState;
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      viewerIcePublishedCountRef.current += 1;
      markExplorerViewerPeerDebug({ viewerIcePublishedCount: viewerIcePublishedCountRef.current });
      void api.publishLiveSignalIce(sessionId, 'viewer', viewerId, event.candidate.toJSON()).catch((error) => {
        if (isStaleSessionError(error)) {
          dropStaleSession('signal/ice');
          return;
        }
        setPeerDiagnostic('ice_failed');
        markExplorerLiveFlowDebug({
          watchLiveSessionId: sessionId,
          viewerId,
          failureReason: 'ice_failed',
          iceError: error instanceof Error ? error.message : String(error),
        });
      });
    };
    const confirmAnswer = async () => {
      const confirmedSignal = await api.getLiveSignalState(sessionId, viewerId);
      const confirmed = Boolean(confirmedSignal.answer?.sdp && confirmedSignal.viewer_ids?.includes(viewerId));
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerId,
        answerConfirmed: confirmed,
        answerPostStatus: confirmed ? 'confirmed' : 'posted_not_confirmed',
      });
      if (confirmed) {
        publishViewerState('answer_confirmed', 'answer_confirmed', { signaling: 'answer_confirmed', media: 'waiting_for_track' });
        markExplorerViewerPeerDebug({ answerConfirmedAt: Date.now(), failureReason: null });
      }
      if (!confirmed) {
        setPeerDiagnostic('answer_not_confirmed');
        markExplorerLiveFlowDebug({ failureReason: 'answer_not_confirmed' });
      }
      return confirmedSignal;
    };
    const pollSignal = async () => {
      viewerPollLoopCountRef.current += 1;
      markExplorerViewerPeerDebug({ pollingLoopCount: viewerPollLoopCountRef.current });
      try {
        const signal = await api.getLiveSignalState(sessionId, viewerId);
        if (disposed || !signal || !peerConnRef.current) return;
        consecutiveFails = 0;
        const signalHasOffer = Boolean(signal.offer?.sdp);
        if (signalHasOffer) stickyOfferSeenRef.current = true;
        markExplorerLiveFlowDebug({
          watchLiveSessionId: sessionId,
          viewerId,
          signalFetchedAt: Date.now(),
          offerSeen: stickyOfferSeenRef.current,
          viewerStatus: lastStableStateRef.current || peer.connectionState || 'waiting_for_offer',
        });
        const alreadySetRemote = !!peerConnRef.current.currentRemoteDescription;
        if (!signalHasOffer) {
          if (!stickyOfferSeenRef.current && !answerPostedRef.current && lastStableStateRef.current !== 'answer_confirmed') {
            publishViewerState('waiting_for_offer', 'no_offer', { signaling: 'waiting_for_offer' });
            markExplorerLiveFlowDebug({ failureReason: 'no_offer' });
          } else {
            markExplorerLiveFlowDebug({ failureReason: null, viewerStatus: lastStableStateRef.current, stickyOfferSeen: stickyOfferSeenRef.current });
          }
          return;
        }
        if (lastStableStateRef.current === 'waiting_for_offer') publishViewerState('offer_seen', 'offer_seen', { signaling: 'offer_seen' });
        if (!alreadySetRemote || !answerPostedRef.current) {
          let sdpToSend: string | undefined;
          if (!alreadySetRemote) {
            publishViewerState('answer_publishing', 'set-remote-description', { signaling: 'answer_publishing' });
            markExplorerLiveFlowDebug({ viewerStatus: 'answer_publishing' });
            try {
              markExplorerViewerPeerDebug({ offerSeenAt: Date.now(), stickyOfferSeen: true, offerVideoDirection: extractMediaDirection(signal.offer.sdp || '', 'video'), offerAudioDirection: extractMediaDirection(signal.offer.sdp || '', 'audio') });
              await peerConnRef.current.setRemoteDescription(new RTCSessionDescription(signal.offer));
              await flushQueuedDeviceIce();
            } catch (error) {
              setFailure('set_remote_description_failed', 'Live viewer failed to apply device offer.');
              markExplorerViewerPeerDebug({ failureReason: 'set_remote_description_failed', setRemoteDescriptionError: error instanceof Error ? error.message : String(error) });
              return;
            }
            const answer = await peerConnRef.current.createAnswer();
            try {
              markExplorerViewerPeerDebug({ answerCreatedAt: Date.now() });
              await peerConnRef.current.setLocalDescription(answer);
              markExplorerViewerPeerDebug({ answerVideoDirection: extractMediaDirection(answer.sdp || '', 'video'), answerAudioDirection: extractMediaDirection(answer.sdp || '', 'audio'), ...summarizePeerReceivers(peer), ...summarizePeerTransceivers(peer) });
            } catch (error) {
              setFailure('set_local_description_failed', 'Live viewer failed to prepare answer.');
              markExplorerViewerPeerDebug({ failureReason: 'set_local_description_failed', setLocalDescriptionError: error instanceof Error ? error.message : String(error) });
              return;
            }
            sdpToSend = answer.sdp || '';
          } else if (peerConnRef.current.localDescription?.sdp) {
            sdpToSend = peerConnRef.current.localDescription.sdp;
          }
          if (sdpToSend !== undefined) {
            try {
              await api.publishLiveSignalAnswer(sessionId, viewerId, { type: 'answer', sdp: sdpToSend });
              answerPostedRef.current = true;
              publishViewerState('answer_published', 'answer_published', { signaling: 'answer_published' });
              markExplorerViewerPeerDebug({ answerPublishedAt: Date.now(), failureReason: null });
              markExplorerLiveFlowDebug({ answerPostStatus: 'posted', viewerStatus: 'answer_published', failureReason: null });
              await confirmAnswer();
            } catch (error) {
              if (isStaleSessionError(error)) {
                dropStaleSession('signal/answer');
                return;
              }
              setFailure('answer_post_failed', 'Live viewer answer publish failed.');
              markExplorerLiveFlowDebug({
                answerPostStatus: 'failed',
                answerPostError: error instanceof Error ? error.message : String(error),
              });
              return;
            }
          }
        }
        for (const candidate of signal.ice_from_device || []) {
          await applyDeviceIceCandidate(candidate, 'poll');
        }
        await publishIceCandidateDebug({ signalDeviceIceCount: (signal.ice_from_device || []).length });
        const iceConnected = peer.connectionState === 'connected' || peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed';
        if (
          !selectedCandidatePairTimeoutReported
          && answerPostedRef.current
          && deviceIceReceivedKeysRef.current.size > 0
          && !iceConnected
          && viewerActorCreatedAtRef.current
          && Date.now() - viewerActorCreatedAtRef.current > 15000
        ) {
          const summary = await summarizeCandidatePairFromStats(peer);
          if (!summary.selectedCandidatePair) {
            selectedCandidatePairTimeoutReported = true;
            setFailure('ice_exchange_failed', 'ICE candidate exchange did not select a candidate pair after answer confirmation.');
            markExplorerViewerPeerDebug({ failureReason: 'ice_exchange_failed', selectedCandidatePair: null, iceFailureReason: 'selected-candidate-pair-timeout' });
          }
        }
      } catch (error) {
        if (disposed) return;
        if (isStaleSessionError(error)) {
          dropStaleSession('signal');
          return;
        }
        consecutiveFails++;
        setPeerDiagnostic(error instanceof Error ? error.message : String(error));
        if (consecutiveFails >= 5) {
          setFailure('answer_not_confirmed', 'Live viewer signaling failed repeatedly.');
        }
      }
    };

    void pollSignal();
    poll = window.setInterval(() => {
      void pollSignal();
    }, 1000);
    statsPoll = window.setInterval(() => {
      if (lastStableStateRef.current === 'answer_confirmed' || remoteTrackAttachedAtRef.current) void sampleInboundRtpStats();
    }, 1000);

    return () => {
      disposed = true;
      if (noTrackTimer != null) window.clearTimeout(noTrackTimer);
      if (poll != null) window.clearInterval(poll);
      if (statsPoll != null) window.clearInterval(statsPoll);
      peerConnRef.current?.close();
      peerConnRef.current = null;
      deviceIceReceivedKeysRef.current.clear();
      appliedDeviceIceKeysRef.current.clear();
      queuedDeviceIceRef.current = [];
      deviceIceAddErrorsRef.current = [];
      answerPostedRef.current = false;
      viewerPollLoopCountRef.current = 0;
      viewerIcePublishedCountRef.current = 0;
      viewerActorTeardownCountRef.current += 1;
      markExplorerViewerPeerDebug({ activePeerCount: 0, teardownCount: viewerActorTeardownCountRef.current, restartReason: 'actor-cleanup' });
      if (peerVideoRef.current) peerVideoRef.current.srcObject = null;
      lastSrcObjectAssignedAtRef.current = null;
      remoteTrackAttachedAtRef.current = null;
      latestInboundVideoStatsRef.current = {};
      StreamHub.delete(sessionId);
      setPeerStream(null);
      setPeerDiagnostic(null);
      setShowTapToPlay(false);
      setSignalingStatus('idle');
      setMediaStatus('idle');
      setPlaybackStatus('idle');
      setMediaFailureClass(null);
      setIceStatus('idle');
      setPeerStatus('idle');
    };
  }, [api, isActive, peerEnabled, peerRetryToken, session.session_id]);


  const liveVideoRendering = mediaFailureClass === 'frames_rendering' || (playbackStatus === 'playing' && peerVideoRef.current && peerVideoRef.current.videoWidth > 0 && peerVideoRef.current.videoHeight > 0);

  const livePreviewLabel = !isActive ? 'no active session'
    : session.status === 'ended' ? 'session ended'
      : signalingStatus === 'stale_session_not_found' ? 'stale session'
        : mediaStatus === 'remote_track_not_emitted' ? 'remote track not emitted'
          : iceStatus === 'peer_ice_failed_before_track' ? 'ICE failed before media track'
            : iceStatus === 'ice_exchange_failed' ? 'ICE exchange failed'
              : mediaFailureClass === 'track_attached_but_no_rtp' ? 'track attached, waiting for RTP'
                : mediaFailureClass === 'rtp_receiving_but_no_frames_decoded' ? 'RTP receiving, waiting for decoded frames'
                  : mediaFailureClass === 'frames_decoded_but_video_play_rejected' ? 'decoded frames available, tap to play'
                    : mediaFailureClass === 'video_play_interrupted_by_srcobject_reset' ? 'Safari interrupted playback, tap to retry'
                      : mediaFailureClass === 'frames_rendering' ? 'live video rendering'
                        : playbackStatus === 'video_playback_failed' || playbackStatus === 'video_playback_interrupted' || playbackStatus === 'video_playback_blocked' ? 'Tap to play live stream'
                          : playbackStatus === 'playing' ? 'playing'
                            : mediaStatus === 'track_attached' ? 'track attached, waiting for RTP'
                    : signalingStatus === 'answer_confirmed' ? 'answer confirmed, waiting for media track'
                      : signalingStatus === 'waiting_for_offer' ? 'waiting for offer'
                        : signalHasOffer && !signalHasAnswer ? 'offer published, waiting for viewer answer'
                          : signalHasAnswer ? 'answer confirmed, waiting for media track'
                            : 'waiting for offer';

  const statusColor =
    session.status === 'recording' ? 'var(--red, #ff4444)'
      : session.status === 'previewing' ? 'var(--mint, #4dffc3)'
        : 'var(--muted, #666)';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {isActive ? (
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
          <img
            ref={imgRef}
            alt="Live preview"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          {!shouldPollChunkPreview ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'var(--mono)' }}>
              {livePreviewLabel}
            </div>
          ) : null}
          {session.status === 'recording' ? (
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(0,0,0,0.6)',
                borderRadius: 4,
                padding: '2px 6px',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#ff4444',
                  animation: 'pulse 1s infinite',
                }}
              />
              <span style={{ fontSize: 10, color: '#fff', fontFamily: 'var(--mono)' }}>
                REC {session.chunk_count}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
            }}
          />
          <strong style={{ fontSize: 12 }}>{session.node_id}</strong>
        </div>
        <div className="tagrow">
          <span className="tag">{session.source_kind}</span>
          <span className="tag">{session.status}</span>
          {signalHasOffer ? <span className="tag good">offer:yes</span> : null}
          {signalHasAnswer ? <span className="tag good">answer:yes</span> : null}
          {signalViewerCount > 0 ? <span className="tag good">viewers:{signalViewerCount}</span> : null}
          {signalState ? <span className="tag">{signalState}</span> : null}
          {webRtcPreviewAvailable ? <span className="tag good">previewable:yes</span> : null}
        </div>
        <div className="small" style={{ marginTop: 4 }}>session: {session.session_id}</div>
        {!shouldPollChunkPreview ? (
          <div className="small" style={{ marginTop: 4 }}>recording preview: waiting for chunks · WebRTC preview available: {webRtcPreviewAvailable ? 'yes' : 'pending'}</div>
        ) : null}
        {onStartRecording || onStopRecording ? (
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            {onStartRecording ? (
              <button
                className="btn"
                type="button"
                style={{ flex: 1, fontSize: 11 }}
                disabled={!liveVideoRendering}
                title={!liveVideoRendering ? 'Live video must render before device recording is enabled.' : undefined}
                onClick={() => onStartRecording(session)}
              >
                Request device rec
              </button>
            ) : null}
            {onStopRecording ? (
              <button
                className="btn"
                type="button"
                style={{ flex: 1, fontSize: 11 }}
                disabled={!liveVideoRendering}
                title={!liveVideoRendering ? 'Live video must render before device recording controls are enabled.' : undefined}
                onClick={() => onStopRecording(session)}
              >
                Stop device rec
              </button>
            ) : null}
          </div>
        ) : null}
        {isActive ? (
          <button
            className="btn"
            type="button"
            style={{ marginTop: 8, width: '100%', fontSize: 11 }}
            onClick={() => setPeerEnabled((prev) => !prev)}
          >
            {peerEnabled ? 'Hide peer view' : 'Open peer view'}
          </button>
        ) : null}
        {peerEnabled ? (
          <div style={{ marginTop: 8 }}>
            <video data-viewer-actor-key={viewerActorKey} ref={peerVideoRef} autoPlay playsInline muted controls={showTapToPlay} style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            <div className="small" style={{ marginTop: 6 }}>viewer: {peerStatus}</div>
            <div className="small" style={{ marginTop: 4 }}>signaling: {signalingStatus} · media: {mediaStatus} · playback: {playbackStatus} · ice: {iceStatus}</div>
            {showTapToPlay ? (
              <button
                className="btn"
                type="button"
                style={{ marginTop: 6, width: '100%', fontSize: 11 }}
                onClick={() => {
                  const video = peerVideoRef.current;
                  const stream = peerStream;
                  if (video && stream) {
                    attachRemoteStreamToVideo(video, stream, 'tap-retry');
                    void video.play().then(() => {
                      const nextFailureClass: ViewerMediaFailureClass = video.videoWidth > 0 && video.videoHeight > 0 ? 'frames_rendering' : 'playback_started_waiting_for_dimensions';
                      setMediaFailureClass(nextFailureClass);
                      setShowTapToPlay(false);
                      publishViewerState('playing', 'remote-track-playing', { playback: 'playing', media: 'track_attached' });
                      markExplorerViewerPeerDebug({ videoPlayResolved: true, playbackAttemptSource: 'tap', mediaFailureClass: nextFailureClass, videoWidth: video.videoWidth, videoHeight: video.videoHeight });
                    }).catch((error) => {
                      const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'UnknownError');
                      const errorMessage = error instanceof Error ? error.message : String(error);
                      setShowTapToPlay(true);
                      setPeerDiagnostic('video_playback_failed');
                      setPlaybackStatus(errorName === 'AbortError' ? 'video_playback_interrupted' : 'video_playback_blocked');
                      markExplorerViewerPeerDebug({ videoPlayResolved: false, playbackAttemptSource: 'tap', videoPlayRejectedName: errorName, videoPlayRejectedMessage: errorMessage, mediaFailureClass: errorName === 'AbortError' ? 'video_play_interrupted_by_srcobject_reset' : mediaFailureClass });
                    });
                  }
                }}
              >
                Tap to play live stream
              </button>
            ) : null}
            {peerDiagnostic ? <div className="small" style={{ marginTop: 4 }}>diag: {peerDiagnostic}</div> : null}
            {onRecordPeerSession ? (
              <button
                className="btn"
                type="button"
                disabled={!peerStream}
                style={{ marginTop: 6, width: '100%', fontSize: 11 }}
                onClick={() => {
                  if (peerStream) onRecordPeerSession(session.session_id);
                }}
              >
                Record as asset
              </button>
            ) : null}
            <button
              className="btn"
              type="button"
              style={{ marginTop: 6, width: '100%', fontSize: 11 }}
              onClick={() => { markExplorerViewerPeerDebug({ restartReason: 'explicit-reconnect-click' }); setPeerRetryToken((prev) => prev + 1); }}
            >
              Reconnect peer view
            </button>
            {peerError ? <div className="small" style={{ marginTop: 6, color: '#ff9a90' }}>{peerError}</div> : null}
          </div>
        ) : null}
        {onOpen ? (
          <button
            className="btn"
            type="button"
            style={{ marginTop: 8, width: '100%', fontSize: 11 }}
            onClick={() => onOpen(session)}
          >
            Open device →
          </button>
        ) : null}
      </div>
    </div>
  );
}
