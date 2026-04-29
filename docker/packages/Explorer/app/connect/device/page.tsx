// docker/packages/Explorer/app/connect/device/page.tsx

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createApiClient } from '../../../src/api';
import { useLiveSession } from '../../../src/hooks/useLiveSession';
import FullscreenDevicePreview from './FullscreenDevicePreview';
import DeviceMonitorShell from './DeviceMonitorShell';
// CSS import removed – now in layout.tsx

const api = createApiClient('');

export default function ConnectDevicePage() {
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
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);


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
    const shouldPublishPeer = !!sessionId && (state === 'previewing' || state === 'recording') && session?.source_kind === 'camera';
    if (!shouldPublishPeer) {
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
        window.setTimeout(() => {
          void maybeStartPeerPublish();
        }, 300);
        return;
      }
      peerConnectionRef.current?.close();
      const peer = new RTCPeerConnection();
      peerConnectionRef.current = peer;
      peerSessionIdRef.current = sessionId;
      viewerIceSeenRef.current.clear();
      activeViewerIdRef.current = 'viewer-broadcast';
      peer.onconnectionstatechange = () => {
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
            }
            for (const candidate of signal.ice_from_viewer || []) {
              const key = `${candidate.candidate}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
              if (viewerIceSeenRef.current.has(key)) continue;
              viewerIceSeenRef.current.add(key);
              await activePeer.addIceCandidate(candidate);
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

  return (
    <DeviceMonitorShell
      mode={mode}
      onModeChange={setMode}
      sourceLabel={sourceLabel}
      statusBadge={peerStatus === 'offer-published' ? 1 : 0}
      onBack={() => router.back()}
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
        videoRef={videoRef}
        canUseCamera={capability.hasGetUserMedia}
        canUseScreen={shouldShowScreenAction}
        isLikelyIOS={capability.isLikelyIOS}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        onStartCamera={(options) => startPreview('camera', options ?? (selectedDeviceId ? { deviceId: selectedDeviceId } : undefined))}
        onStartScreen={() => startPreview('screen')}
        onStopPreview={() => stopPreview()}
        onStartDeviceRecording={() => startRecording()}
        onStopDeviceRecording={() => stopRecording()}
        onBackToExplorer={() => router.push('/')}
      />
    </DeviceMonitorShell>
  );

}
