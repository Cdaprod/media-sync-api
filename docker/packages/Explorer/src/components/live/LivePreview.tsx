import { useEffect, useMemo, useRef } from 'react';

import { createApiClient } from '../../api';

/**
 * Render a LAN-first live WebRTC preview for an existing session offer.
 *
 * Example:
 *   <LivePreview sessionId="sess-123" />
 */
export function LivePreview({ sessionId }: { sessionId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerId = useMemo(() => {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `viewer-${random}`;
  }, []);

  useEffect(() => {
    const api = createApiClient('');
    const pc = new RTCPeerConnection();
    let disposed = false;
    let icePollTimer: number | null = null;
    const seenDeviceIce = new Set<string>();

    const candidateKey = (candidate: RTCIceCandidateInit) => (
      `${candidate.candidate || ''}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`
    );

    pc.ontrack = (event) => {
      if (!disposed && videoRef.current) {
        videoRef.current.srcObject = event.streams[0] ?? null;
      }
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void api.postLiveViewerIce(sessionId, viewerId, event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState || 'unknown';
      void api.postLiveViewerState(sessionId, viewerId, state);
    };

    async function run() {
      const offerRes = await fetch(`/api/live/${sessionId}/offer`, { cache: 'no-store' });
      if (!offerRes.ok || disposed) return;

      const offer = await offerRes.json();
      if (disposed) return;

      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await api.postLiveViewerAnswer(sessionId, viewerId, answer);

      const pollDeviceIce = async () => {
        if (disposed) return;
        try {
          const candidates = await api.listLiveDeviceIce(sessionId);
          for (const candidate of candidates) {
            const key = candidateKey(candidate);
            if (!key || seenDeviceIce.has(key)) continue;
            seenDeviceIce.add(key);
            await pc.addIceCandidate(candidate);
          }
        } catch {
          // non-fatal LAN polling retries
        } finally {
          if (!disposed) {
            icePollTimer = window.setTimeout(() => void pollDeviceIce(), 1000);
          }
        }
      };
      await pollDeviceIce();
    }

    void run();

    return () => {
      disposed = true;
      if (icePollTimer != null) window.clearTimeout(icePollTimer);
      void api.postLiveViewerState(sessionId, viewerId, 'disconnected');
      pc.close();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [sessionId, viewerId]);

  return <video ref={videoRef} autoPlay playsInline style={{ width: '100%' }} />;
}
