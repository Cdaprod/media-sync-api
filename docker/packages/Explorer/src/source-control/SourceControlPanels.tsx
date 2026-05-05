import React from 'react';

import type { WebRtcLiveSession } from '../contracts/live';
import type { NodeControlRecord, SourceControlRecord } from '../types/sourceControl';
import { buildRuntimeChips } from '../utils/runtimeChips';
import { buildLiveDeviceInstances, type RuntimeAssetLike } from './buildLiveDeviceInstances';
import { CanonicalSourceCard } from './CanonicalSourceCard';
import { LiveDeviceInstancesPanel } from './LiveDeviceInstancesPanel';
import { RemoteSourceSurfaceCard } from './RemoteSourceSurfaceCard';
import { RuntimeNodeCard } from './RuntimeNodeCard';

type Props = {
  sourceControlLoading: boolean;
  sourceControlError: string | null;
  sourceControlSnapshot: { sources: SourceControlRecord[] };
  canonicalSources: SourceControlRecord[];
  remoteSources: SourceControlRecord[];
  runtimeNodes: NodeControlRecord[];
  runtimeSources: SourceControlRecord[];
  webRtcLiveSessions: WebRtcLiveSession[];
  runtimeAssets: RuntimeAssetLike[];
  healthyNodes: NodeControlRecord[];
  onOpenDevice: (nodeId: string) => void;
  onWatchLive: (session: WebRtcLiveSession) => void;
  onOpenSourceContextMenu: (event: React.MouseEvent, source: SourceControlRecord) => void;
  onOpenRuntimeContextMenu: (event: React.MouseEvent, node: NodeControlRecord) => void;
};

export function SourceControlPanels({
  sourceControlLoading,
  sourceControlError,
  sourceControlSnapshot,
  canonicalSources,
  remoteSources,
  runtimeNodes,
  runtimeSources,
  webRtcLiveSessions,
  runtimeAssets,
  healthyNodes,
  onOpenDevice,
  onWatchLive,
  onOpenSourceContextMenu,
  onOpenRuntimeContextMenu,
}: Props) {
  const liveDeviceInstances = buildLiveDeviceInstances({
    nodes: runtimeNodes,
    sources: runtimeSources,
    liveSessions: webRtcLiveSessions,
    runtimeAssets,
  });

  const webRtcSessionsByNodeId = new Map<string, WebRtcLiveSession>();
  for (const session of webRtcLiveSessions) {
    if (session.node_id) webRtcSessionsByNodeId.set(session.node_id, session);
  }

  if (sourceControlLoading) {
    return (
      <div className="card">
        <strong>Loading sources…</strong>
        <div className="small">Fetching canonical and remote source-bearing participants.</div>
      </div>
    );
  }
  if (sourceControlError) {
    return (
      <div className="card">
        <strong>Source control unavailable</strong>
        <div className="small">{sourceControlError}</div>
      </div>
    );
  }
  if (runtimeSources.length === 0) {
    return (
      <div className="card">
        <strong>No sources</strong>
        <div className="small">No canonical or remote source-bearing participants are currently visible.</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <strong>Summary</strong>
        <div className="small">{canonicalSources.length} canonical · {remoteSources.length} remote · {runtimeNodes.length} nodes</div>
        <div className="small">{healthyNodes.length} healthy · {sourceControlSnapshot.sources.length} total sources</div>
        <div className="small">{webRtcLiveSessions.length} live WebRTC sessions</div>
      </div>

      <LiveDeviceInstancesPanel
        instances={liveDeviceInstances}
        onOpenDevice={onOpenDevice}
        onWatchLive={(sessionId) => {
          const session = webRtcLiveSessions.find((entry) => entry.session_id === sessionId);
          if (session) onWatchLive(session);
        }}
      />

      {canonicalSources.length > 0 ? (
        <details className="card runtime-surface-card">
          <summary><strong>Canonical sources</strong></summary>
          <strong>Canonical sources</strong>
          <div className="small">Authority-local sources visible through the canonical source registry.</div>
          <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
            {canonicalSources.map((source, index) => (
              <CanonicalSourceCard key={`canonical-${source.name}-${index}`} source={source} onContextMenu={onOpenSourceContextMenu} />
            ))}
          </div>
        </details>
      ) : null}

      {remoteSources.length > 0 ? (
        <details className="card runtime-surface-card">
          <summary><strong>Remote source surfaces</strong></summary>
          <strong>Remote source surfaces</strong>
          <div className="small">Source surfaces published through connect/control-plane registration and merged into source inventory.</div>
          <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
            {remoteSources.map((source, index) => (
              <RemoteSourceSurfaceCard
                key={`remote-${source.owner_node_id || 'unknown'}-${source.name}-${index}`}
                source={source}
                owner={runtimeNodes.find((node) => node.node_id === source.owner_node_id)}
                onContextMenu={onOpenSourceContextMenu}
              />
            ))}
          </div>
        </details>
      ) : null}

      {runtimeNodes.length > 0 ? (
        <details className="card runtime-surface-card">
          <summary><strong>Registered runtimes</strong></summary>
          <strong>Registered runtimes</strong>
          <div className="small">Control-plane view of registered runtime nodes.</div>
          <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
            {runtimeNodes.map((node) => (
              <RuntimeNodeCard
                key={node.node_id}
                node={node}
                liveSession={webRtcSessionsByNodeId.get(node.node_id)}
                chips={buildRuntimeChips(node, webRtcSessionsByNodeId.get(node.node_id))}
                onContextMenu={onOpenRuntimeContextMenu}
              />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}
