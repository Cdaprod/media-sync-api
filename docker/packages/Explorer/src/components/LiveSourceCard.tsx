'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { LiveSessionRecord } from '../types/liveSession';

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
}

export function LiveSourceCard({ session, apiBase = '', onOpen }: LiveSourceCardProps) {
  const isActive = session.status === 'previewing' || session.status === 'recording';
  const previewUrl = usePreviewUrl(apiBase, session.session_id, isActive);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current || !previewUrl) return;
    const img = new Image();
    img.onload = () => {
      if (imgRef.current) imgRef.current.src = previewUrl;
    };
    img.src = previewUrl;
  }, [previewUrl]);

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
