// docker/packages/Explorer/app/connect/device/DevicePickerSheet.tsx

'use client';

import { useState, useEffect } from 'react';
import { RemoteCameraNode } from './deviceMonitorTypes';

interface DevicePickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  localDevices: MediaDeviceInfo[];
  localPermission: 'prompt' | 'granted' | 'denied';
  remoteNodes: RemoteCameraNode[];
  selectedDeviceId: string | null;
  onSelectLocalDevice: (deviceId: string) => void | Promise<void>;
  onUseSelectedLocalDevice: () => void | Promise<void>;
  mode: 'local' | 'remote';
  onModeChange: (mode: 'local' | 'remote') => void;
  onOpenRemoteNode: (nodeId: string) => void;
  onRefresh: () => void;
}

export default function DevicePickerSheet({
  isOpen,
  onClose,
  localDevices,
  localPermission,
  remoteNodes,
  selectedDeviceId,
  onSelectLocalDevice,
  onUseSelectedLocalDevice,
  mode,
  onModeChange,
  onOpenRemoteNode,
  onRefresh,
}: DevicePickerSheetProps) {
  const [pendingId, setPendingId] = useState<string | null>(selectedDeviceId);

  useEffect(() => {
    if (isOpen) setPendingId(selectedDeviceId);
  }, [isOpen, selectedDeviceId]);

  if (!isOpen) return null;

  const handleSelectRemote = (nodeId: string) => onOpenRemoteNode(nodeId);

  const handleConfirm = async () => { await onUseSelectedLocalDevice(); };

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker-sheet" onClick={e => e.stopPropagation()}>
        <div className="picker-header">
          <h2>Select a device</h2>
          <div className="device-monitor-segment">
            <button type="button" className={mode === 'local' ? 'active' : ''} onClick={() => onModeChange('local')}>Local</button>
            <button type="button" className={mode === 'remote' ? 'active' : ''} onClick={() => onModeChange('remote')}>Remote</button>
          </div>
          <button className="btn-pill" onClick={onClose}>Close</button>
        </div>
        <div className="picker-body">
          <section style={{ order: mode === 'local' ? 0 : 1 }}>
            <p className="picker-section-title">Local cameras</p>
            <div className="device-list">
              {localDevices.length === 0 && (
                <div className="device-empty">
                  {localPermission === 'prompt' ? 'Request permission to see cameras' : 'No local cameras detected.'}
                </div>
              )}
              {localDevices.map(d => (
                <button
                  key={d.deviceId}
                  className={`device-btn ${pendingId === d.deviceId ? 'active' : ''}`}
                  onClick={() => { setPendingId(d.deviceId); void onSelectLocalDevice(d.deviceId); }}
                >
                  <span>{d.label || `Camera ${d.deviceId.slice(0,8)}`}</span>
                </button>
              ))}
            </div>
          </section>
          <section style={{ order: mode === 'remote' ? 0 : 1 }}>
            <p className="picker-section-title">Remote cameras (Explorer nodes)</p>
            <div className="device-list">
              {remoteNodes.length === 0 ? (
                <div className="device-warn">
                  No Explorer camera nodes are online. Open /connect/device on another device or register a capture node.
                </div>
              ) : (
                remoteNodes.map(node => (
                  <button
                    key={node.node_id}
                    className="device-btn"
                    onClick={() => handleSelectRemote(node.node_id)}
                  >
                    <span>{node.label}</span>
                    <span className="device-desc">remote unavailable here</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
        <div className="picker-footer">
          <button className="btn-pill" onClick={onRefresh}>Refresh</button>
          <div className="right">
            <button className="btn-pill" onClick={onClose}>Cancel</button>
            <button
              className="btn-pill solid"
              disabled={!pendingId || !localDevices.some(d => d.deviceId === pendingId)}
              onClick={handleConfirm}
            >
              Use selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
