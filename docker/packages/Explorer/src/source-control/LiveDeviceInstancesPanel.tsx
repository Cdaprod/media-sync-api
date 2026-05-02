import React from 'react';

import type { LiveDeviceInstance } from './buildLiveDeviceInstances';
import { LiveDeviceInstanceCard } from './LiveDeviceInstanceCard';

type Props = {
  instances: LiveDeviceInstance[];
  onOpenDevice: (nodeId: string) => void;
  onWatchLive: (sessionId: string) => void;
};

export function LiveDeviceInstancesPanel({ instances, onOpenDevice, onWatchLive }: Props) {
  if (!instances.length) return null;
  return (
    <div className="card runtime-surface-card runtime-live-instances-card">
      <strong>LIVE DEVICE INSTANCES</strong>
      <div className="small">Merged node/source/live/runtime lane visibility for device instances.</div>
      <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
        {instances.map((instance) => (
          <LiveDeviceInstanceCard
            key={`live-instance-${instance.nodeId}`}
            instance={instance}
            onOpenDevice={onOpenDevice}
            onWatchLive={onWatchLive}
          />
        ))}
      </div>
    </div>
  );
}
