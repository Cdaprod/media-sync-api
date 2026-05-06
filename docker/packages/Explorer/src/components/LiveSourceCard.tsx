'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient } from '../api';
import type { WebRtcLiveSession } from '../contracts/live';
import type { LiveSessionRecord } from '../types/liveSession';
import { StreamHub } from '../runtime/StreamHub';

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
type ViewerPlaybackStatus = 'idle' | 'waiting_for_play' | 'playing' | 'video_playback_failed';
type ViewerIceStatus = 'idle' | 'checking' | 'connected' | 'disconnected' | 'ice_exchange_failed' | 'peer_ice_failed_before_track';
type ViewerPeerStatus = ViewerSignalingStatus | ViewerMediaStatus | ViewerPlaybackStatus | 'failed' | 'connected' | 'answering';

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
  const deviceIceSeenRef = useRef<Set<string>>(new Set());
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
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [peerRetryToken, setPeerRetryToken] = useState(0);
  const viewerActorCreatedAtRef = useRef<number | null>(null);
  const viewerActorTeardownCountRef = useRef(0);
  const stickyOfferSeenRef = useRef(false);
  const lastStableStateRef = useRef<string>('idle');
  const answerPostedRef = useRef(false);
  const viewerPollLoopCountRef = useRef(0);
  const viewerIcePublishedCountRef = useRef(0);
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
      if (noTrackTimer != null) window.clearTimeout(noTrackTimer);
      peerConnRef.current?.close();
      peerConnRef.current = null;
      deviceIceSeenRef.current.clear();
      answerPostedRef.current = false;
      viewerPollLoopCountRef.current = 0;
      viewerIcePublishedCountRef.current = 0;
      viewerActorTeardownCountRef.current += 1;
      markExplorerViewerPeerDebug({ activePeerCount: 0, teardownCount: viewerActorTeardownCountRef.current, restartReason: 'actor-cleanup' });
      if (peerVideoRef.current) peerVideoRef.current.srcObject = null;
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
    peerConnRef.current = peer;
    deviceIceSeenRef.current.clear();
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

    const attemptPlayAttachedStream = async (video: HTMLVideoElement, stream: MediaStream, source: 'ontrack' | 'tap') => {
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
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
        markExplorerViewerPeerDebug({ videoPlayResolved: true, videoPlayResolvedAt: Date.now(), failureReason: null });
      } catch (error) {
        if (disposed) return;
        const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'UnknownError');
        const errorMessage = error instanceof Error ? error.message : String(error);
        setShowTapToPlay(true);
        setPlaybackStatus('video_playback_failed');
        setPeerDiagnostic('video_playback_failed');
        setPeerError(`Live stream is attached but playback was blocked: ${errorName}`);
        publishViewerState('track_attached', 'video_playback_failed', { media: 'track_attached', playback: 'video_playback_failed' });
        markExplorerViewerPeerDebug({
          failureReason: 'video_playback_failed',
          videoPlayResolved: false,
          videoPlayRejectedName: errorName,
          videoPlayRejectedMessage: errorMessage,
          videoReadyStateAfterPlayRejection: video.readyState,
          videoPausedAfterPlayRejection: video.paused,
          videoSrcObjectSet: video.srcObject === stream,
        });
        markExplorerLiveFlowDebug({
          watchLiveSessionId: sessionId,
          viewerId,
          viewerStatus: 'track_attached',
          mediaStatus: 'track_attached',
          playbackStatus: 'video_playback_failed',
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
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        videoSrcObjectSet = true;
        setPeerStatus('track_attached');
        publishViewerState('track_attached', 'track_attached', { media: 'track_attached', playback: 'waiting_for_play' });
        markExplorerViewerPeerDebug({
          remoteStreamId: streamId,
          videoSrcObjectSet: true,
          remoteTrackCount,
          liveVideoTrackCount,
          videoReadyStateAfterSrcObject: video.readyState,
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
      markExplorerViewerPeerDebug({ remoteTrackCount, remoteStreamId: streamId, liveVideoTrackCount, videoSrcObjectSet, failureReason: null });
      onRemoteStreamRef.current?.(sessionRef.current, stream);
    };
    const publishViewerPeerState = () => {
      const iceConnected = peer.connectionState === 'connected' || peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed';
      const iceFailed = peer.connectionState === 'failed' || peer.iceConnectionState === 'failed';
      const iceDisconnected = peer.connectionState === 'disconnected' || peer.iceConnectionState === 'disconnected';
      const nextIceStatus: ViewerIceStatus = iceConnected ? 'connected' : (iceFailed ? 'ice_exchange_failed' : (iceDisconnected ? 'disconnected' : 'checking'));
      setIceStatus(nextIceStatus);
      markExplorerViewerPeerDebug({ signalingState: peer.signalingState, iceConnectionState: peer.iceConnectionState, connectionState: peer.connectionState, iceStatus: nextIceStatus, remoteTrackCount });
      markExplorerLiveFlowDebug({ watchLiveSessionId: sessionId, viewerId, viewerStatus: lastStableStateRef.current, iceStatus: nextIceStatus, mediaStatus, playbackStatus });
      if (iceConnected && remoteTrackCount === 0) publishViewerState('waiting_for_track', 'waiting_for_track', { media: 'waiting_for_track', ice: 'connected' });
      if ((iceFailed || iceDisconnected) && remoteTrackCount === 0) {
        setFailure('peer_ice_failed_before_track', 'ICE disconnected before a remote media track was emitted.');
      } else if (iceFailed) {
        setFailure('ice_exchange_failed', 'ICE failed after media track attachment.');
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
              markExplorerViewerPeerDebug({ offerSeenAt: Date.now(), stickyOfferSeen: true });
              await peerConnRef.current.setRemoteDescription(new RTCSessionDescription(signal.offer));
            } catch (error) {
              setFailure('set_remote_description_failed', 'Live viewer failed to apply device offer.');
              markExplorerViewerPeerDebug({ failureReason: 'set_remote_description_failed', setRemoteDescriptionError: error instanceof Error ? error.message : String(error) });
              return;
            }
            const answer = await peerConnRef.current.createAnswer();
            try {
              markExplorerViewerPeerDebug({ answerCreatedAt: Date.now() });
              await peerConnRef.current.setLocalDescription(answer);
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
          const key = `${candidate.candidate}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
          if (deviceIceSeenRef.current.has(key)) continue;
          deviceIceSeenRef.current.add(key);
          try {
            await peerConnRef.current.addIceCandidate(candidate);
            markExplorerViewerPeerDebug({ deviceIceSeenCount: deviceIceSeenRef.current.size });
          } catch (error) {
            setPeerDiagnostic('ice_failed');
            markExplorerLiveFlowDebug({
              watchLiveSessionId: sessionId,
              viewerId,
              failureReason: 'ice_failed',
              iceError: error instanceof Error ? error.message : String(error),
            });
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

    return () => {
      disposed = true;
      if (noTrackTimer != null) window.clearTimeout(noTrackTimer);
      if (poll != null) window.clearInterval(poll);
      peerConnRef.current?.close();
      peerConnRef.current = null;
      deviceIceSeenRef.current.clear();
      answerPostedRef.current = false;
      viewerPollLoopCountRef.current = 0;
      viewerIcePublishedCountRef.current = 0;
      viewerActorTeardownCountRef.current += 1;
      markExplorerViewerPeerDebug({ activePeerCount: 0, teardownCount: viewerActorTeardownCountRef.current, restartReason: 'actor-cleanup' });
      if (peerVideoRef.current) peerVideoRef.current.srcObject = null;
      StreamHub.delete(sessionId);
      setPeerStream(null);
      setPeerDiagnostic(null);
      setShowTapToPlay(false);
      setSignalingStatus('idle');
      setMediaStatus('idle');
      setPlaybackStatus('idle');
      setIceStatus('idle');
      setPeerStatus('idle');
    };
  }, [api, isActive, peerEnabled, peerRetryToken, session.session_id]);


  const livePreviewLabel = !isActive ? 'no active session'
    : session.status === 'ended' ? 'session ended'
      : signalingStatus === 'stale_session_not_found' ? 'stale session'
        : mediaStatus === 'remote_track_not_emitted' ? 'remote track not emitted'
          : iceStatus === 'peer_ice_failed_before_track' ? 'ICE failed before media track'
            : iceStatus === 'ice_exchange_failed' ? 'ICE exchange failed'
              : playbackStatus === 'video_playback_failed' ? 'Tap to play live stream'
                : playbackStatus === 'playing' ? 'playing'
                  : mediaStatus === 'track_attached' ? 'media track attached, waiting for playback'
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
                  if (video && stream) void video.play().then(() => {
                    setShowTapToPlay(false);
                    publishViewerState('playing', 'remote-track-playing', { playback: 'playing', media: 'track_attached' });
                    markExplorerViewerPeerDebug({ videoPlayResolved: true, playbackAttemptSource: 'tap' });
                  }).catch((error) => {
                    const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'UnknownError');
                    markExplorerViewerPeerDebug({ videoPlayResolved: false, playbackAttemptSource: 'tap', videoPlayRejectedName: errorName, videoPlayRejectedMessage: error instanceof Error ? error.message : String(error) });
                  });
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
