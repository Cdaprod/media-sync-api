import { useEffect, useRef } from 'react';

/**
 * Render a LAN-first live WebRTC preview for an existing session offer.
 *
 * Example:
 *   <LivePreview sessionId="sess-123" />
 */
export function LivePreview({ sessionId }: { sessionId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const pc = new RTCPeerConnection();
    let disposed = false;

    pc.ontrack = (event) => {
      if (!disposed && videoRef.current) {
        videoRef.current.srcObject = event.streams[0] ?? null;
      }
    };

    async function run() {
      const offerRes = await fetch(`/api/live/${sessionId}/offer`, { cache: 'no-store' });
      if (!offerRes.ok || disposed) return;

      const offer = await offerRes.json();
      if (disposed) return;

      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`/api/live/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
    }

    void run();

    return () => {
      disposed = true;
      pc.close();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [sessionId]);

  return <video ref={videoRef} autoPlay playsInline style={{ width: '100%' }} />;
}
