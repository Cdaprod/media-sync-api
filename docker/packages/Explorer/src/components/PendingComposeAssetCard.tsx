import React, { useMemo } from "react";

export type PendingComposeJobStatus =
  | "queued"
  | "running"
  | "running_long"
  | "reconnecting"
  | "finalizing"
  | "failed";

export interface PendingComposeAsset {
  jobId: string;
  project: string;
  source: string;
  targetDir: string;
  outputName: string;
  modeRequested?: "auto" | "copy" | "encode" | string;
  inputCount?: number;
  inputPreview?: string[];
  createdAt?: string;
  status: PendingComposeJobStatus;
  error?: string;
  debugArtifacts?: string[] | null;
}

interface PendingComposeAssetCardProps {
  item: PendingComposeAsset;
  onDismiss?: (() => void) | undefined;
}

const CARD_STYLES = `
.pending-compose-card {
  width: 100%;
  min-height: 220px;
  border-radius: 10px;
  background: #12121c;
  border: 1px solid #252535;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
}

.pending-compose-thumb {
  position: relative;
  min-height: 150px;
  flex: 1 1 auto;
  overflow: hidden;
  background: linear-gradient(160deg, #0d0d1a 0%, #131326 100%);
}

.pending-compose-water-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 52%;
  z-index: 2;
}

.pending-compose-wave {
  position: absolute;
  left: 0;
  width: 200%;
  height: 34px;
  z-index: 3;
}

.pending-compose-wave.back {
  top: -16px;
  opacity: 0.42;
  animation: pendingComposeWavePan 4.2s linear infinite;
}

.pending-compose-wave.front {
  top: -24px;
  opacity: 0.92;
  animation: pendingComposeWavePan 2.6s linear infinite reverse;
}

.pending-compose-water-body {
  position: absolute;
  top: 8px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
}

.pending-compose-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(255,255,255,0.06) 0%, transparent 35%);
  z-index: 5;
  pointer-events: none;
}

.pending-compose-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
}

.pending-compose-icon {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1.5px solid rgba(255,255,255,0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.34);
  backdrop-filter: blur(6px);
  animation: pendingComposeIconPulse 2.4s ease-in-out infinite;
}

.pending-compose-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: rgba(255,255,255,0.72);
  text-transform: uppercase;
  background: rgba(0,0,0,0.42);
  backdrop-filter: blur(4px);
  padding: 3px 10px;
  border-radius: 4px;
}

.pending-compose-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: rgba(0,0,0,0.48);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.60);
  padding: 3px 7px;
  border-radius: 4px;
  z-index: 20;
}

.pending-compose-footer {
  padding: 10px 12px;
  background: #12121c;
  border-top: 1px solid #1e1e2e;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pending-compose-name {
  font-size: 12px;
  color: #c8c8d8;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pending-compose-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #7a7a95;
  flex-wrap: wrap;
}

.pending-compose-status-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #70708c;
}

.pending-compose-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
  animation: pendingComposeDotBlink 1.8s ease-in-out infinite;
}

.pending-compose-error {
  font-size: 11px;
  line-height: 1.35;
  color: #f4a1a1;
  word-break: break-word;
}

.pending-compose-debug {
  font-size: 10px;
  line-height: 1.3;
  color: #d7b27a;
}

.pending-compose-actions {
  display: flex;
  justify-content: flex-end;
}

.pending-compose-dismiss {
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

.pending-compose-dismiss:hover {
  background: rgba(255,255,255,0.09);
}

.pending-compose-card[data-status="failed"] .pending-compose-wave.back,
.pending-compose-card[data-status="failed"] .pending-compose-wave.front,
.pending-compose-card[data-status="failed"] .pending-compose-status-dot,
.pending-compose-card[data-status="failed"] .pending-compose-icon {
  animation: none !important;
}

@keyframes pendingComposeWavePan {
  from { transform: translateX(0%); }
  to   { transform: translateX(-50%); }
}

@keyframes pendingComposeIconPulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50%      { opacity: 1; transform: scale(1.06); }
}

@keyframes pendingComposeDotBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.28; }
}
`;

const WAVE_PATH =
  "M0,18 C25,2 50,34 75,18 C100,2 125,34 150,18 C175,2 200,34 225,18 C250,2 275,34 300,18 C325,2 350,34 375,18 C400,2 425,34 450,18 C475,2 500,34 525,18 C550,2 575,34 600,18 L600,36 L0,36 Z";

function Wave({
  fill,
  className,
}: {
  fill: string;
  className: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 36"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d={WAVE_PATH} fill={fill} />
    </svg>
  );
}

function getVisualState(status: PendingComposeJobStatus) {
  switch (status) {
    case "queued":
      return {
        solid: "rgba(42,168,255,0.86)",
        back: "rgba(42,168,255,0.46)",
        dot: "#38b6ff",
        badge: "QUEUED",
        label: "QUEUED",
        footer: "job queued",
      };
    case "running":
      return {
        solid: "rgba(42,168,255,0.86)",
        back: "rgba(42,168,255,0.46)",
        dot: "#38b6ff",
        badge: "COMPOSING",
        label: "COMPOSING",
        footer: "job running",
      };
    case "running_long":
      return {
        solid: "rgba(255,155,30,0.86)",
        back: "rgba(255,155,30,0.46)",
        dot: "#ff9b1e",
        badge: "TAKING LONGER",
        label: "COMPOSING",
        footer: "job still running",
      };
    case "reconnecting":
      return {
        solid: "rgba(120,104,255,0.86)",
        back: "rgba(120,104,255,0.46)",
        dot: "#9e8cff",
        badge: "RECONNECTING",
        label: "RECONNECTING",
        footer: "waiting to resume",
      };
    case "finalizing":
      return {
        solid: "rgba(42,168,255,0.86)",
        back: "rgba(42,168,255,0.46)",
        dot: "#38b6ff",
        badge: "FINALIZING",
        label: "FINALIZING",
        footer: "refreshing result",
      };
    case "failed":
      return {
        solid: "rgba(219,67,67,0.86)",
        back: "rgba(219,67,67,0.46)",
        dot: "#db4343",
        badge: "FAILED",
        label: "FAILED",
        footer: "job failed",
      };
    default:
      return {
        solid: "rgba(42,168,255,0.86)",
        back: "rgba(42,168,255,0.46)",
        dot: "#38b6ff",
        badge: "COMPOSING",
        label: "COMPOSING",
        footer: "job running",
      };
  }
}

export default function PendingComposeAssetCard({
  item,
  onDismiss,
}: PendingComposeAssetCardProps) {
  const visual = useMemo(() => getVisualState(item.status), [item.status]);

  return (
    <>
      <style>{CARD_STYLES}</style>
      <div
        className="pending-compose-card"
        data-status={item.status}
        data-job-id={item.jobId}
        data-pending-compose-card="true"
      >
        <div className="pending-compose-thumb">
          <div className="pending-compose-water-wrap">
            <Wave fill={visual.back} className="pending-compose-wave back" />
            <Wave fill={visual.solid} className="pending-compose-wave front" />
            <div
              className="pending-compose-water-body"
              style={{ background: visual.solid }}
            />
            <div className="pending-compose-sheen" />
          </div>

          <div className="pending-compose-overlay">
            <div className="pending-compose-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7h10M7 2l5 5-5 5"
                  stroke="rgba(255,255,255,0.82)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="pending-compose-label">{visual.label}</span>
          </div>

          <span className="pending-compose-badge">{visual.badge}</span>
        </div>

        <div className="pending-compose-footer">
          <div className="pending-compose-name">{item.outputName}</div>

          <div className="pending-compose-meta">
            <span>{item.modeRequested ?? "encode"}</span>
            {typeof item.inputCount === "number" ? <span>• {item.inputCount} clips</span> : null}
            {item.targetDir ? <span>• {item.targetDir}</span> : null}
          </div>

          <div className="pending-compose-status-row">
            <div
              className="pending-compose-status-dot"
              style={{ background: visual.dot }}
            />
            <span>{visual.footer}</span>
          </div>

          {item.status === "failed" && item.error ? (
            <div className="pending-compose-error">{item.error}</div>
          ) : null}

          {item.status === "failed" && item.debugArtifacts?.length ? (
            <div className="pending-compose-debug">
              debug artifacts preserved
            </div>
          ) : null}

          {item.status === "failed" && onDismiss ? (
            <div className="pending-compose-actions">
              <button
                type="button"
                className="pending-compose-dismiss"
                data-pending-compose-dismiss="true"
                onClick={onDismiss}
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
