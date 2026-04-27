import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { PendingRecordingAsset } from '../liveRecordings';

interface PendingRecordingAssetCardProps {
  item: PendingRecordingAsset;
  onStop?: (recordingId: string) => void;
  onDismiss?: (recordingId: string) => void;
  onOpenSavedAsset?: (assetUrl: string) => void;
}

const CARD_STYLES = `
.pending-recording-card {
  width: 100%;
  min-height: 220px;
  border-radius: 10px;
  background: #12121c;
  border: 1px solid #2c2530;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
}

.pending-recording-thumb {
  position: relative;
  min-height: 150px;
  flex: 1 1 auto;
  overflow: hidden;
  background: radial-gradient(circle at 50% 35%, rgba(255, 74, 74, 0.14), transparent 42%),
              linear-gradient(160deg, #0a0a12 0%, #151020 100%);
}

.pending-recording-video,
.pending-recording-preview-img {
  width: 100%;
  height: 100%;
  min-height: 150px;
  object-fit: cover;
  display: block;
  background: #000;
}

.pending-recording-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,0.56);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pending-recording-rec {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(0,0,0,0.58);
  border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.88);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  backdrop-filter: blur(6px);
}

.pending-recording-rec-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ff4444;
  animation: pendingRecordingPulse 1s ease-in-out infinite;
}

.pending-recording-card[data-status="uploading"] .pending-recording-rec-dot,
.pending-recording-card[data-status="finalizing"] .pending-recording-rec-dot {
  background: #38b6ff;
}

.pending-recording-card[data-status="failed"] .pending-recording-rec-dot {
  background: #db4343;
  animation: none;
}

.pending-recording-footer {
  padding: 10px 12px;
  background: #12121c;
  border-top: 1px solid #1e1e2e;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pending-recording-name {
  font-size: 12px;
  color: #d8ccd1;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pending-recording-meta,
.pending-recording-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #8a7f88;
  flex-wrap: wrap;
}

.pending-recording-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
  background: #ff4444;
  animation: pendingRecordingPulse 1.2s ease-in-out infinite;
}

.pending-recording-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.pending-recording-action {
  appearance: none;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.05);
  color: #d0d3e6;
  border-radius: 6px;
  padding: 6px 9px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.pending-recording-action:hover {
  background: rgba(255,255,255,0.09);
}

.pending-recording-error {
  font-size: 11px;
  line-height: 1.35;
  color: #f4a1a1;
  word-break: break-word;
}

@keyframes pendingRecordingPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.35; transform: scale(0.88); }
}
`;

function formatElapsed(ms: number | undefined): string {
  const safeMs = Math.max(0, Math.floor(ms || 0));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function statusLabel(status: PendingRecordingAsset['status']): string {
  switch (status) {
    case 'recording':
      return 'RECORDING';
    case 'stopping':
      return 'STOPPING';
    case 'uploading':
      return 'UPLOADING';
    case 'finalizing':
      return 'FINALIZING';
    case 'saved':
      return 'SAVED';
    case 'failed':
      return 'FAILED';
    default:
      return 'RECORDING';
  }
}

function footerLabel(status: PendingRecordingAsset['status']): string {
  switch (status) {
    case 'recording':
      return 'capturing live stream';
    case 'stopping':
      return 'closing recorder';
    case 'uploading':
      return 'saving to media source';
    case 'finalizing':
      return 'refreshing asset index';
    case 'saved':
      return 'recording saved';
    case 'failed':
      return 'recording failed';
    default:
      return 'capturing live stream';
  }
}

export default function PendingRecordingAssetCard({
  item,
  onStop,
  onDismiss,
  onOpenSavedAsset,
}: PendingRecordingAssetCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [localElapsed, setLocalElapsed] = useState(item.elapsedMs || 0);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!item.stream) return;

    videoRef.current.srcObject = item.stream;

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [item.stream]);

  useEffect(() => {
    if (item.status !== 'recording') {
      setLocalElapsed(item.elapsedMs || localElapsed);
      return;
    }

    const started = new Date(item.startedAt).getTime();
    if (!Number.isFinite(started)) return;

    const timer = window.setInterval(() => {
      setLocalElapsed(Date.now() - started);
    }, 500);

    return () => window.clearInterval(timer);
  }, [item.elapsedMs, item.startedAt, item.status, localElapsed]);

  const label = useMemo(() => statusLabel(item.status), [item.status]);
  const footer = useMemo(() => footerLabel(item.status), [item.status]);

  return (
    <>
      <style>{CARD_STYLES}</style>
      <div
        className="pending-recording-card"
        data-status={item.status}
        data-recording-id={item.recordingId}
        data-pending-recording-card="true"
      >
        <div className="pending-recording-thumb">
          {item.stream ? (
            <video
              ref={videoRef}
              className="pending-recording-video"
              autoPlay
              muted
              playsInline
              controls={false}
            />
          ) : item.previewObjectUrl ? (
            <img
              className="pending-recording-preview-img"
              src={item.previewObjectUrl}
              alt={item.outputName}
              draggable={false}
            />
          ) : (
            <div className="pending-recording-empty">
              Live preview pending
            </div>
          )}

          <div className="pending-recording-rec">
            <span className="pending-recording-rec-dot" />
            <span>{label}</span>
            {item.status === 'recording' ? <span>{formatElapsed(localElapsed)}</span> : null}
          </div>
        </div>

        <div className="pending-recording-footer">
          <div className="pending-recording-name">{item.outputName}</div>

          <div className="pending-recording-meta">
            <span>live</span>
            <span>• {item.nodeId}</span>
            <span>• {item.targetDir}</span>
          </div>

          <div className="pending-recording-status-row">
            <div className="pending-recording-status-dot" />
            <span>{footer}</span>
          </div>

          {item.error ? (
            <div className="pending-recording-error">{item.error}</div>
          ) : null}

          <div className="pending-recording-actions">
            {item.status === 'recording' && onStop ? (
              <button
                type="button"
                className="pending-recording-action"
                data-pending-recording-stop="true"
                onClick={() => onStop(item.recordingId)}
              >
                Stop
              </button>
            ) : null}

            {item.assetUrl && onOpenSavedAsset ? (
              <button
                type="button"
                className="pending-recording-action"
                onClick={() => onOpenSavedAsset(item.assetUrl || '')}
              >
                Open
              </button>
            ) : null}

            {(item.status === 'failed' || item.status === 'saved') && onDismiss ? (
              <button
                type="button"
                className="pending-recording-action"
                onClick={() => onDismiss(item.recordingId)}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
