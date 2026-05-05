import type { LiveSessionRecord } from '../types/liveSession';

export type { LiveSessionRecord };

export type LiveRuntimeEventPayload = {
  session_id: string;
  node_id?: string;
  action?: string;
  viewer_id?: string;
  state?: string;
  updated_at?: string;
  [key: string]: unknown;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function isLiveRuntimeEventPayload(value: unknown): value is LiveRuntimeEventPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const sessionId = readString(record.session_id);
  if (!sessionId) return false;
  const action = readString(record.action);
  const viewerId = readString(record.viewer_id);
  const state = readString(record.state);
  const hasDurableSourceKind = Boolean(readString(record.source_kind) || readString(record.sourceKind));
  const hasDurableStatus = Boolean(readString(record.status));
  if (hasDurableSourceKind && hasDurableStatus) return false;
  return Boolean(action || viewerId || state);
}

export function isLiveSignalOverlay(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Boolean(
    readString(record.session_id)
      && (
        typeof record.has_offer === 'boolean'
        || typeof record.has_answer === 'boolean'
        || typeof record.viewer_count === 'number'
        || Array.isArray(record.viewer_ids)
      ),
  );
}

export function isDurableLiveSessionRecord(value: unknown): value is LiveSessionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (isLiveRuntimeEventPayload(record)) return false;
  const sessionId = readString(record.session_id);
  const nodeId = readString(record.node_id);
  const sourceKind = readString(record.source_kind) || readString(record.sourceKind);
  const status = readString(record.status);
  return Boolean(sessionId && nodeId && sourceKind && status);
}

export function normalizeLiveSessionList(payload: unknown): LiveSessionRecord[] {
  const normalizeArray = (items: unknown[]): LiveSessionRecord[] => items.filter(isDurableLiveSessionRecord);

  if (Array.isArray(payload)) return normalizeArray(payload);

  if (payload && typeof payload === 'object') {
    const obj = payload as { sessions?: unknown[]; live_sessions?: unknown[] };
    if (Array.isArray(obj.sessions)) return normalizeArray(obj.sessions);
    if (Array.isArray(obj.live_sessions)) return normalizeArray(obj.live_sessions);
  }

  return [];
}
