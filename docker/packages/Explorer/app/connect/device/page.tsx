'use client';

import React, { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createApiClient } from '../../../src/api';
import { useLiveSession } from '../../../src/hooks/useLiveSession';

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

  return (
    <main className="connect-device-page">
      <section className="connect-device-card">
        <h1 className="connect-device-title">{heading}</h1>

        {!nodeId ? (
          <div className="card">
            <strong>No node registration found</strong>
            <div className="small">Register this device from Explorer first, then continue here.</div>
          </div>
        ) : null}

        {nodeId ? (
          <>
            {!capability.hasGetUserMedia ? (
              <div className="card">
                <strong>Camera activation unavailable in this browser context</strong>
                <div className="small" style={{ marginTop: 8 }}>Secure context: {capability.isSecureContext ? 'yes' : 'no'}</div>
                <div className="small">Camera API: {capability.hasGetUserMedia ? 'available' : 'unavailable'}</div>
                <div className="small">Screen capture API: {capability.hasGetDisplayMedia ? 'available' : 'unavailable'}</div>
                <div className="small" style={{ marginTop: 8 }}>
                  iOS Safari requires HTTPS for camera access on LAN IP addresses.
                </div>
                <div className="small">
                  Serve Explorer/API over HTTPS for device camera activation.
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="small mono">node_id: {nodeId}</div>
              {session?.session_id ? <div className="small mono">session_id: {session.session_id}</div> : null}
              {session?.claim_id ? <div className="small mono">claim_id: {session.claim_id}</div> : null}
            </div>

            {state === 'idle' || state === 'error' || state === 'ended' ? (
              <div className="card">
                <div className="connect-device-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void startPreview('camera')}
                    disabled={!capability.hasGetUserMedia}
                    title={!capability.hasGetUserMedia ? 'Camera API unavailable in this browser context.' : ''}
                  >
                    Enable Camera
                  </button>
                  {shouldShowScreenAction ? (
                    <button className="btn" type="button" onClick={() => void startPreview('screen')}>
                      Share Screen
                    </button>
                  ) : (
                    <button
                      className="btn"
                      type="button"
                      disabled
                      title="Screen capture is unavailable on this device/browser."
                    >
                      Share Screen unavailable
                    </button>
                  )}
                </div>
                {state === 'ended' && session?.claim_id ? (
                  <div className="small" style={{ marginTop: 12 }}>
                    Clip submitted. claim_id={session.claim_id}
                  </div>
                ) : null}
                {state === 'ended' && (lastClaimId || session?.claim_id) ? (
                  <div style={{ marginTop: 12 }}>
                    <a className="btn cold-mint-action" href={`/?claim_id=${encodeURIComponent(lastClaimId || session?.claim_id || '')}`}>
                      Open new asset in Explorer
                    </a>
                  </div>
                ) : null}
                {error ? <div className="small" style={{ marginTop: 12, color: '#ff9a90' }}>{error}</div> : null}
              </div>
            ) : null}

            {state === 'previewing' || state === 'recording' || state === 'starting' || state === 'requesting-permission' ? (
              <div className="card">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="connect-device-video"
                />
                <div className="small mono" style={{ marginTop: 10 }}>
                  state: {state}
                </div>
                <div className="connect-device-actions" style={{ marginTop: 12 }}>
                  {state === 'previewing' ? (
                    <>
                      <button className="btn" type="button" onClick={() => void startRecording()}>
                        Start Recording
                      </button>
                      <button className="btn" type="button" onClick={() => void stopPreview()}>
                        Stop Preview
                      </button>
                    </>
                  ) : null}
                  {state === 'recording' ? (
                    <>
                      <div className="recording-indicator">
                        <span className="recording-dot" />
                        <span>Recording · chunks {session?.chunk_count ?? 0}</span>
                      </div>
                      <button className="btn" type="button" onClick={() => void stopRecording()}>
                        Stop Recording
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="card">
              <button className="btn" type="button" onClick={() => router.push('/')}>
                Back to Explorer
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
