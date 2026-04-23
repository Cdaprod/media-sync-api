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
            <div className="card">
              <div className="small mono">node_id: {nodeId}</div>
              {session?.session_id ? <div className="small mono">session_id: {session.session_id}</div> : null}
              {session?.claim_id ? <div className="small mono">claim_id: {session.claim_id}</div> : null}
            </div>

            {state === 'idle' || state === 'error' || state === 'ended' ? (
              <div className="card">
                <div className="connect-device-actions">
                  <button className="btn" type="button" onClick={() => void startPreview('camera')}>
                    Enable Camera
                  </button>
                  <button className="btn" type="button" onClick={() => void startPreview('screen')}>
                    Share Screen
                  </button>
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
