'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { LiveSessionRecord } from '../types/liveSession';

interface LiveSourceCardProps {
  session: LiveSessionRecord;
  nodeLabel?: string | null;
}

export function LiveSourceCard({ session, nodeLabel }: LiveSourceCardProps) {
  const [previewTick, setPreviewTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setPreviewTick((prev) => prev + 1);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);
  const previewUrl = useMemo(
    () => `/api/live_sessions/${encodeURIComponent(session.session_id)}/preview/latest?t=${previewTick}`,
    [previewTick, session.session_id],
  );

  const dotClass =
    session.status === 'recording'
      ? 'live-dot live-dot-recording'
      : session.status === 'previewing'
        ? 'live-dot live-dot-previewing'
        : 'live-dot live-dot-idle';

  return (
    <div className="card live-source-card">
      <div className="live-source-head">
        <div className={dotClass} />
        <strong>{nodeLabel || session.node_id}</strong>
      </div>
      <div className="small">{session.node_id}</div>
      <video
        className="connect-device-video"
        style={{ marginTop: 10 }}
        src={previewUrl}
        muted
        playsInline
        autoPlay
      />
      <div className="tagrow" style={{ marginTop: 8 }}>
        <span className="tag">{session.source_kind}</span>
        <span className="tag">{session.status}</span>
        {session.status === 'recording' ? (
          <span className="tag">chunks {session.chunk_count}</span>
        ) : null}
      </div>
      <div style={{ marginTop: 10 }}>
        <a className="btn" href={`/connect/device?node_id=${encodeURIComponent(session.node_id)}`}>
          Open Device
        </a>
      </div>
    </div>
  );
}
