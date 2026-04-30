'use client';

import React, { useEffect, useRef, useState } from 'react';

import { createApiClient } from '../api';
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

interface LiveSourceCardProps {
  session: LiveSessionRecord;
  apiBase?: string;
  onOpen?: (session: LiveSessionRecord) => void;
  onStartRecording?: (session: LiveSessionRecord) => void;
  onStopRecording?: (session: LiveSessionRecord) => void;
  onRemoteStream?: (session: LiveSessionRecord, stream: MediaStream) => void;
  onRecordPeerSession?: (sessionId: string) => void;
}

export function LiveSourceCard({
  session,
  apiBase = '',
  onOpen,
  onStartRecording,
  onStopRecording,
  onRemoteStream,
  onRecordPeerSession,
}: LiveSourceCardProps) {
  const isActive = session.status === 'previewing' || session.status === 'recording';
  const previewUrl = usePreviewUrl(apiBase, session.session_id, isActive);
  const imgRef = useRef<HTMLImageElement>(null);
  const peerVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const deviceIceSeenRef = useRef<Set<string>>(new Set());
  const viewerIdRef = useRef(`viewer-${Math.random().toString(36).slice(2, 10)}`);
  const [peerEnabled, setPeerEnabled] = useState(false);
  const [peerStream, setPeerStream] = useState<MediaStream | null>(null);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [peerStatus, setPeerStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [peerRetryToken, setPeerRetryToken] = useState(0);
  const api = createApiClient(apiBase);

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
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
      setPeerError('WebRTC peer viewing is unavailable in this browser.');
      setPeerStatus('failed');
      return undefined;
    }
    let disposed = false;
    const peer = new RTCPeerConnection();
    peerConnRef.current = peer;
    deviceIceSeenRef.current.clear();
    setPeerError(null);
    setPeerStatus('connecting');
    const viewerId = viewerIdRef.current;

    peer.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream) return;
      StreamHub.set(session.session_id, stream);
      if (peerVideoRef.current) {
        peerVideoRef.current.srcObject = stream;
      }
      setPeerStream(stream);
      onRemoteStream?.(session, stream);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setPeerStatus('connected');
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') setPeerStatus('failed');
    };
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void api.publishLiveSignalIce(session.session_id, 'viewer', viewerId, event.candidate.toJSON()).catch(() => undefined);
    };
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });

    const poll = window.setInterval(() => {
      void api.getLiveSignalState(session.session_id, viewerId)
        .then(async (signal) => {
          if (disposed || !signal || !peerConnRef.current) return;
          if (signal.offer?.sdp && !peerConnRef.current.currentRemoteDescription) {
            await peerConnRef.current.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await peerConnRef.current.createAnswer();
            await peerConnRef.current.setLocalDescription(answer);
            await api.publishLiveSignalAnswer(session.session_id, viewerId, { type: 'answer', sdp: answer.sdp || '' });
          }
          for (const candidate of signal.ice_from_device || []) {
            const key = `${candidate.candidate}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
            if (deviceIceSeenRef.current.has(key)) continue;
            deviceIceSeenRef.current.add(key);
            await peerConnRef.current.addIceCandidate(candidate);
          }
        })
        .catch(() => {
          setPeerStatus('failed');
        });
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(poll);
      peerConnRef.current?.close();
      peerConnRef.current = null;
      deviceIceSeenRef.current.clear();
      if (peerVideoRef.current) peerVideoRef.current.srcObject = null;
      StreamHub.delete(session.session_id);
      setPeerStream(null);
      setPeerStatus('idle');
    };
  }, [api, isActive, onRemoteStream, peerEnabled, peerRetryToken, session, session.session_id]);

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
        </div>
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
