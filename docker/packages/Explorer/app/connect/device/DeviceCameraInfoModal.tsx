// docker/packages/Explorer/app/connect/device/DeviceCameraInfoModal.tsx

'use client';

interface DeviceCameraInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDeviceLabel: string;
  permission: string;
  deviceId: string | null;
  sessionId?: string;
  claimId?: string;
  nodeId?: string;
  chunkCount?: number;
  sourceKind?: string | null;
  peerStatus?: string;
}

export default function DeviceCameraInfoModal({
  isOpen,
  onClose,
  selectedDeviceLabel,
  permission,
  deviceId,
  sessionId,
  claimId,
  nodeId,
  chunkCount,
  sourceKind,
  peerStatus,
}: DeviceCameraInfoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Camera info</span>
          <button className="btn-pill" onClick={onClose}>Done</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Selected camera</label>
            <div className="field-val">{selectedDeviceLabel || 'None'}</div>
          </div>
          <div className="modal-field">
            <label>Permission</label>
            <div className="field-val">{permission}</div>
          </div>
          <div className="modal-field">
            <label>Device ID</label>
            <div className="field-val">{deviceId || '—'}</div>
          </div>
          {nodeId && (
            <div className="modal-field">
              <label>Node ID</label>
              <div className="field-val">{nodeId}</div>
            </div>
          )}
          {sessionId && (
            <div className="modal-field">
              <label>Session ID</label>
              <div className="field-val">{sessionId}</div>
            </div>
          )}
          {claimId && (
            <div className="modal-field">
              <label>Claim ID</label>
              <div className="field-val">{claimId}</div>
            </div>
          )}
          {chunkCount !== undefined && (
            <div className="modal-field">
              <label>Chunks recorded</label>
              <div className="field-val">{chunkCount}</div>
            </div>
          )}
          {sourceKind && (
            <div className="modal-field">
              <label>Source kind</label>
              <div className="field-val">{sourceKind}</div>
            </div>
          )}
          {peerStatus && (
            <div className="modal-field">
              <label>WebRTC status</label>
              <div className="field-val">{peerStatus}</div>
            </div>
          )}
          <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
            This device publishes a live Explorer session. Record from Explorer to save this stream as a media asset.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-pill" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}