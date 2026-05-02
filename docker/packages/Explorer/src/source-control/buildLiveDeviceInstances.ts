import type { LiveSession } from '../types/liveSession';
import type { NodeControlRecord, SourceControlRecord } from '../types/sourceControl';

export type RuntimeAssetLike = {
  node_id?: string | null;
  owner_node_id?: string | null;
  session_id?: string | null;
  asset_id?: string | null;
  state?: string | null;
};

export type LiveDeviceInstance = {
  label: string;
  nodeId: string;
  status?: string;
  sourceName?: string;
  sourceKind?: string;
  sessionId?: string;
  sessionState?: string;
  hasOffer?: boolean;
  hasAnswer?: boolean;
  runtimeAssetId?: string;
  runtimeState?: string;
  watchLiveAvailable: boolean;
  openDeviceAvailable: boolean;
};

export function buildLiveDeviceInstances({
  nodes,
  sources,
  liveSessions,
  runtimeAssets,
}: {
  nodes: NodeControlRecord[];
  sources: SourceControlRecord[];
  liveSessions: LiveSession[];
  runtimeAssets?: RuntimeAssetLike[];
}): LiveDeviceInstance[] {
  const readSessionHasOffer = (session: LiveSession): boolean => {
    const typed = session as LiveSession & { has_offer?: boolean; hasOffer?: boolean; offer?: { sdp?: string | null } | null };
    return Boolean(typed.has_offer || typed.hasOffer || typed.offer?.sdp);
  };

  const readSessionHasAnswer = (session: LiveSession): boolean => {
    const typed = session as LiveSession & { has_answer?: boolean; hasAnswer?: boolean; answer?: { sdp?: string | null } | null };
    return Boolean(typed.has_answer || typed.hasAnswer || typed.answer?.sdp);
  };

  const readSessionState = (session: LiveSession): string | undefined => {
    const typed = session as LiveSession & { state?: string; status?: string };
    return typed.state || typed.status;
  };

  const byNodeId = new Map<string, LiveDeviceInstance>();
  for (const node of nodes) {
    byNodeId.set(node.node_id, {
      nodeId: node.node_id,
      label: node.label || node.node_id,
      status: node.status,
      openDeviceAvailable: true,
      watchLiveAvailable: false,
    });
  }

  for (const source of sources) {
    const ownerNodeId = typeof source.owner_node_id === 'string' ? source.owner_node_id : '';
    if (!ownerNodeId) continue;
    const existing = byNodeId.get(ownerNodeId) || {
      nodeId: ownerNodeId,
      label: ownerNodeId,
      openDeviceAvailable: true,
      watchLiveAvailable: false,
    };
    existing.sourceName = source.name;
    existing.sourceKind = source.kind || source.type || undefined;
    byNodeId.set(ownerNodeId, existing);
  }

  for (const session of liveSessions) {
    const nodeId = typeof session.node_id === 'string' ? session.node_id : '';
    if (!nodeId) continue;
    const existing = byNodeId.get(nodeId) || {
      nodeId,
      label: nodeId,
      openDeviceAvailable: true,
      watchLiveAvailable: false,
    };
    existing.sessionId = session.session_id;
    existing.sessionState = readSessionState(session);
    existing.hasOffer = readSessionHasOffer(session);
    existing.hasAnswer = readSessionHasAnswer(session);
    if (!existing.status) {
      existing.status = existing.sessionState;
    }
    existing.watchLiveAvailable = Boolean(existing.sessionId && existing.hasOffer && existing.hasAnswer);
    byNodeId.set(nodeId, existing);
  }

  for (const asset of runtimeAssets || []) {
    const assetNodeId = typeof asset.node_id === 'string'
      ? asset.node_id
      : (typeof asset.owner_node_id === 'string' ? asset.owner_node_id : '');
    const assetSessionId = typeof asset.session_id === 'string' ? asset.session_id : '';
    const fallbackNodeId = assetSessionId
      ? Array.from(byNodeId.values()).find((entry) => entry.sessionId === assetSessionId)?.nodeId
      : undefined;
    const nodeId = assetNodeId || fallbackNodeId || '';
    if (!nodeId) continue;
    const existing = byNodeId.get(nodeId) || {
      nodeId,
      label: nodeId,
      openDeviceAvailable: true,
      watchLiveAvailable: false,
    };
    existing.runtimeAssetId = typeof asset.asset_id === 'string' ? asset.asset_id : undefined;
    existing.runtimeState = typeof asset.state === 'string' ? asset.state : undefined;
    if (!existing.sessionId && assetSessionId) existing.sessionId = assetSessionId;
    if (!existing.status && existing.runtimeState === 'failed') {
      existing.status = 'failed';
    }
    existing.watchLiveAvailable = Boolean(existing.sessionId && existing.hasOffer && existing.hasAnswer);
    byNodeId.set(nodeId, existing);
  }

  return Array.from(byNodeId.values()).sort((a, b) => a.label.localeCompare(b.label));
}
