import React from 'react';

import type { LiveDeviceInstance } from './buildLiveDeviceInstances';

type Props = {
  instance: LiveDeviceInstance;
  onOpenDevice: (nodeId: string) => void;
  onWatchLive: (sessionId: string) => void;
};

export function LiveDeviceInstanceCard({ instance, onOpenDevice, onWatchLive }: Props) {
  return (
    <div className="card runtime-live-instance-card" key={`live-instance-${instance.nodeId}`}>
      <strong>{instance.label}</strong>
      <div className="small">node_id: {instance.nodeId}</div>
      {instance.sourceName ? <div className="small">source: {instance.sourceName} ({instance.sourceKind || 'unknown'})</div> : null}
      {instance.status ? <div className="small">status: {instance.status}</div> : null}
      {instance.sessionId ? <div className="small">session: {instance.sessionId} ({instance.sessionState || 'unknown'})</div> : null}
      <div className="tagrow">
        {(instance.status === 'auth_failed' || instance.status === 'offline') ? <span className="tag bad">auth_failed</span> : null}
        <span className={`tag ${instance.sessionId ? 'good' : ''}`}>session:{instance.sessionId ? 'yes' : 'no'}</span>
        <span className={`tag ${instance.hasOffer ? 'good' : ''}`}>offer:{instance.hasOffer ? 'yes' : 'no'}</span>
        <span className={`tag ${instance.hasAnswer ? 'good' : ''}`}>answer:{instance.hasAnswer ? 'yes' : 'no'}</span>
        {instance.runtimeState ? <span className="tag">{instance.runtimeState}</span> : null}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {instance.openDeviceAvailable && !instance.sessionId ? (
          <button className="btn" type="button" onClick={() => onOpenDevice(instance.nodeId)}>Open Device</button>
        ) : null}
        {instance.watchLiveAvailable && instance.sessionId ? (
          <button className="btn" type="button" onClick={() => onWatchLive(instance.sessionId!)}>Watch Live</button>
        ) : instance.sessionId && instance.unavailableReason ? (
          <div className="small">unavailable: {instance.unavailableReason}</div>
        ) : null}
      </div>
    </div>
  );
}
