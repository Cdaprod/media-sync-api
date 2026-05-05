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
  'no_track',
  'play_failed',
  'ice_failed',
  'peer_failed',
  'stale_session_not_found',
] as const;

type ExplorerLiveFailureReason = typeof EXPLORER_LIVE_FAILURE_REASONS[number];

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
  const [peerStatus, setPeerStatus] = useState<'idle' | 'waiting_for_offer' | 'answering' | 'answered' | 'connected' | 'playing' | 'failed' | 'stale_session_not_found'>('idle');
  const [peerDiagnostic, setPeerDiagnostic] = useState<string | null>(null);
  const [peerRetryToken, setPeerRetryToken] = useState(0);
  const answerPostedRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const api = useMemo(() => createApiClient(apiBase), [apiBase]);

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
    let disposed = false;
    let poll: number | null = null;
    let noTrackTimer: number | null = null;
    const setFailure = (reason: ExplorerLiveFailureReason, message?: string) => {
      setPeerStatus(reason === 'stale_session_not_found' ? 'stale_session_not_found' : 'failed');
      setPeerDiagnostic(reason);
      if (message) setPeerError(message);
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerStatus: reason === 'stale_session_not_found' ? 'stale_session_not_found' : 'failed',
        failureReason: reason,
      });
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
      onStaleSession?.(sessionId, endpoint);
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
    const peer = new RTCPeerConnection();
    peerConnRef.current = peer;
    deviceIceSeenRef.current.clear();
    setPeerError(null);
    setPeerDiagnostic('initializing');
    setPeerStatus('waiting_for_offer');
    const viewerId = viewerIdRef.current;
    markExplorerLiveFlowDebug({
      watchLiveSessionId: sessionId,
      viewerId,
      viewerStatus: 'waiting_for_offer',
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

    noTrackTimer = window.setTimeout(() => {
      if (disposed || remoteTrackCount > 0) return;
      setPeerDiagnostic('no_track');
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerId,
        viewerStatus: peer.connectionState || 'waiting',
        remoteTrackCount,
        failureReason: 'no_track',
      });
    }, 10000);

    peer.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream) return;
      remoteTrackCount += event.track ? 1 : stream.getTracks().length;
      StreamHub.set(sessionId, stream);
      let videoSrcObjectSet = false;
      if (peerVideoRef.current) {
        peerVideoRef.current.srcObject = stream;
        videoSrcObjectSet = true;
        void peerVideoRef.current.play().then(() => {
          if (!disposed) {
            setPeerStatus('playing');
            setPeerDiagnostic('remote-track-playing');
            markExplorerLiveFlowDebug({
              watchLiveSessionId: sessionId,
              viewerId,
              viewerStatus: 'playing',
              remoteTrackCount,
              videoSrcObjectSet: true,
              videoPlayResolved: true,
              failureReason: null,
            });
          }
        }).catch((error) => {
          if (!disposed) {
            setPeerStatus('connected');
            setPeerDiagnostic('play_failed');
            markExplorerLiveFlowDebug({
              watchLiveSessionId: sessionId,
              viewerId,
              viewerStatus: 'connected',
              remoteTrackCount,
              videoSrcObjectSet: true,
              videoPlayResolved: false,
              failureReason: 'play_failed',
              playError: error instanceof Error ? error.message : String(error),
            });
          }
        });
      }
      setPeerStream(stream);
      setPeerDiagnostic('remote-track-attached');
      markExplorerLiveFlowDebug({
        watchLiveSessionId: sessionId,
        viewerId,
        remoteTrackCount,
        videoSrcObjectSet,
        failureReason: null,
      });
      onRemoteStream?.(sessionRef.current, stream);
    };
    peer.onconnectionstatechange = () => {
      markExplorerLiveFlowDebug({ watchLiveSessionId: sessionId, viewerId, viewerStatus: peer.connectionState });
      if (peer.connectionState === 'connected') setPeerStatus('connected');
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        setFailure('peer_failed');
      }
    };
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
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
      if (!confirmed) {
        setPeerDiagnostic('answer_not_confirmed');
        markExplorerLiveFlowDebug({ failureReason: 'answer_not_confirmed' });
      }
      return confirmedSignal;
    };
    const pollSignal = async () => {
      try {
        const signal = await api.getLiveSignalState(sessionId, viewerId);
        if (disposed || !signal || !peerConnRef.current) return;
        consecutiveFails = 0;
        markExplorerLiveFlowDebug({
          watchLiveSessionId: sessionId,
          viewerId,
          signalFetchedAt: Date.now(),
          offerSeen: Boolean(signal.offer?.sdp),
          viewerStatus: peer.connectionState || 'waiting_for_offer',
        });
        const alreadySetRemote = !!peerConnRef.current.currentRemoteDescription;
        if (!signal.offer?.sdp) {
          setPeerStatus('waiting_for_offer');
          setPeerDiagnostic('no_offer');
          markExplorerLiveFlowDebug({ failureReason: 'no_offer' });
          return;
        }
        if (!alreadySetRemote || !answerPostedRef.current) {
          let sdpToSend: string | undefined;
          if (!alreadySetRemote) {
            setPeerStatus('answering');
            setPeerDiagnostic('set-remote-description');
            markExplorerLiveFlowDebug({ viewerStatus: 'answering' });
            await peerConnRef.current.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await peerConnRef.current.createAnswer();
            await peerConnRef.current.setLocalDescription(answer);
            sdpToSend = answer.sdp || '';
          } else if (peerConnRef.current.localDescription?.sdp) {
            sdpToSend = peerConnRef.current.localDescription.sdp;
          }
          if (sdpToSend !== undefined) {
            try {
              await api.publishLiveSignalAnswer(sessionId, viewerId, { type: 'answer', sdp: sdpToSend });
              answerPostedRef.current = true;
              setPeerStatus('answered');
              setPeerDiagnostic('answer-posted');
              markExplorerLiveFlowDebug({ answerPostStatus: 'posted', viewerStatus: 'answered', failureReason: null });
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
      if (peerVideoRef.current) peerVideoRef.current.srcObject = null;
      StreamHub.delete(sessionId);
      setPeerStream(null);
      setPeerDiagnostic(null);
      setPeerStatus('idle');
    };
  }, [api, isActive, onRemoteStream, onStaleSession, peerEnabled, peerRetryToken, session.node_id, session.session_id]);


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
              waiting for viewer answer
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
            <video ref={peerVideoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            <div className="small" style={{ marginTop: 6 }}>viewer: {peerStatus}</div>
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
              onClick={() => setPeerRetryToken((prev) => prev + 1)}
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
