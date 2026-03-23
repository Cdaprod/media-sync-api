import React, { useEffect, useMemo, useRef } from "react";

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

.pending-compose-water-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 1;
}

.pending-compose-water-svg .water-bg {
  fill: #121224;
}

.pending-compose-water-svg .water-body {
  opacity: 0.9;
}

.pending-compose-water-svg .water-rear {
  opacity: 0.38;
}

.pending-compose-water-svg .water-front {
  opacity: 0.68;
}

.pending-compose-water-svg .water-highlight {
  opacity: 0.4;
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

.pending-compose-card[data-status="failed"] .pending-compose-status-dot,
.pending-compose-card[data-status="failed"] .pending-compose-icon {
  animation: none !important;
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

const SVG_WIDTH = 600;
const SVG_HEIGHT = 220;
const WAVE_SPAN = 1200;
const REAR_WAVE_FLOOR = 172;
const FRONT_WAVE_FLOOR = 158;
const BODY_SURFACE_PATH = "M0 164 C75 158 145 170 225 164 C305 158 385 169 470 164 C555 158 640 168 730 164 C820 159 910 170 1005 164 C1090 159 1155 168 1200 164";
const REAR_WAVE_PATH = "M0 144 C85 136 170 152 255 145 C350 138 445 154 540 145 C640 136 740 151 840 145 C945 139 1045 154 1140 145 C1175 142 1195 143 1200 144";
const FRONT_WAVE_PATH = "M0 132 C55 118 110 148 175 133 C250 118 325 149 405 133 C490 117 565 150 645 133 C730 118 805 149 890 133 C970 118 1045 148 1125 133 C1160 126 1185 128 1200 132";

function buildClosedWavePath(curvePath: string, floorY: number) {
  return `${curvePath} L ${WAVE_SPAN} ${floorY} L 0 ${floorY} Z`;
}

function applySvgTranslate(target: SVGGElement | null, x: number, y: number) {
  if (!target) return;
  target.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
}

function PendingComposeWaterSvg({
  solid,
  back,
  status,
}: {
  solid: string;
  back: string;
  status: PendingComposeJobStatus;
}) {
  const surfaceGroupRef = useRef<SVGGElement | null>(null);
  const rearWaveGroupRef = useRef<SVGGElement | null>(null);
  const frontWaveGroupRef = useRef<SVGGElement | null>(null);
  const highlightGroupRef = useRef<SVGGElement | null>(null);
  const animated = status !== "failed";
  const bodyPath = useMemo(() => buildClosedWavePath(BODY_SURFACE_PATH, SVG_HEIGHT), []);
  const rearWaveFillPath = useMemo(() => buildClosedWavePath(REAR_WAVE_PATH, REAR_WAVE_FLOOR), []);
  const frontWaveFillPath = useMemo(() => buildClosedWavePath(FRONT_WAVE_PATH, FRONT_WAVE_FLOOR), []);

  useEffect(() => {
    const surfaceGroup = surfaceGroupRef.current;
    const rearWaveGroup = rearWaveGroupRef.current;
    const frontWaveGroup = frontWaveGroupRef.current;
    const highlightGroup = highlightGroupRef.current;
    if (!surfaceGroup || !rearWaveGroup || !frontWaveGroup || !highlightGroup) return;

    const bobAmplitude = status === "running_long" ? 5.5 : 7.5;
    const bobPeriodSeconds = status === "running_long" ? 4.8 : 4.2;
    const rearSpeed = status === "running_long" ? 12 : 18;
    const frontSpeed = status === "running_long" ? 24 : 32;

    applySvgTranslate(surfaceGroup, 0, 0);
    applySvgTranslate(rearWaveGroup, 0, 0);
    applySvgTranslate(frontWaveGroup, 0, 0);
    applySvgTranslate(highlightGroup, 0, 0);

    if (!animated) {
      return;
    }

    let frameId = 0;
    const startedAt = performance.now();

    const tick = (timestamp: number) => {
      const elapsedSeconds = (timestamp - startedAt) / 1000;
      const bobOffset = Math.sin((elapsedSeconds / bobPeriodSeconds) * Math.PI * 2) * bobAmplitude;
      const rearOffset = -((elapsedSeconds * rearSpeed) % WAVE_SPAN);
      const frontOffset = -((elapsedSeconds * frontSpeed) % WAVE_SPAN);

      applySvgTranslate(surfaceGroup, 0, bobOffset);
      applySvgTranslate(rearWaveGroup, rearOffset, 0);
      applySvgTranslate(frontWaveGroup, frontOffset, 0);
      applySvgTranslate(highlightGroup, frontOffset, 0);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [animated, status]);

  return (
    <svg
      className="pending-compose-water-svg"
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-water-svg="true"
    >
      <rect className="water-bg" x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} />
      <g ref={surfaceGroupRef}>
        <path className="water-body" d={bodyPath} fill={solid} />
        <g ref={rearWaveGroupRef} className="water-rear">
          <path d={rearWaveFillPath} fill={back} />
          <path d={rearWaveFillPath} fill={back} transform={`translate(${WAVE_SPAN} 0)`} />
        </g>
        <g ref={frontWaveGroupRef} className="water-front">
          <path d={frontWaveFillPath} fill={solid} />
          <path d={frontWaveFillPath} fill={solid} transform={`translate(${WAVE_SPAN} 0)`} />
        </g>
        <g ref={highlightGroupRef} className="water-highlight">
          <path
            d={FRONT_WAVE_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={FRONT_WAVE_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            transform={`translate(${WAVE_SPAN} 0)`}
          />
        </g>
      </g>
    </svg>
  );
}

function getVisualState(status: PendingComposeJobStatus) {
  switch (status) {
    case "queued":
      return {
        solid: "#2aa8ff",
        back: "#2aa8ff",
        dot: "#38b6ff",
        badge: "QUEUED",
        label: "QUEUED",
        footer: "job queued",
      };
    case "running":
      return {
        solid: "#2aa8ff",
        back: "#2aa8ff",
        dot: "#38b6ff",
        badge: "COMPOSING",
        label: "COMPOSING",
        footer: "job running",
      };
    case "running_long":
      return {
        solid: "#ff9b1e",
        back: "#ff9b1e",
        dot: "#ff9b1e",
        badge: "TAKING LONGER",
        label: "COMPOSING",
        footer: "job still running",
      };
    case "reconnecting":
      return {
        solid: "#7868ff",
        back: "#7868ff",
        dot: "#9e8cff",
        badge: "RECONNECTING",
        label: "RECONNECTING",
        footer: "waiting to resume",
      };
    case "finalizing":
      return {
        solid: "#2aa8ff",
        back: "#2aa8ff",
        dot: "#38b6ff",
        badge: "FINALIZING",
        label: "FINALIZING",
        footer: "refreshing result",
      };
    case "failed":
      return {
        solid: "#db4343",
        back: "#db4343",
        dot: "#db4343",
        badge: "FAILED",
        label: "FAILED",
        footer: "job failed",
      };
    default:
      return {
        solid: "#2aa8ff",
        back: "#2aa8ff",
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
          <PendingComposeWaterSvg
            solid={visual.solid}
            back={visual.back}
            status={item.status}
          />

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
