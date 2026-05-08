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
  const hasWebRtcSessionShape = Boolean(
    readString(record.node_id)
      && (
        typeof record.has_offer === 'boolean'
        || typeof record.has_answer === 'boolean'
        || typeof record.viewer_count === 'number'
        || Array.isArray(record.viewer_ids)
      ),
  );
  if ((hasDurableSourceKind && hasDurableStatus) || hasWebRtcSessionShape) return false;
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


export type PrimaryLiveSessionRejectionReason =
  | 'runtime-event'
  | 'missing-node-source'
  | 'ended'
  | 'failed'
  | 'superseded'
  | 'stale'
  | 'lower-priority';

export type PrimaryLiveSessionSelectionReason =
  | 'active-with-offer-and-answer'
  | 'active-with-offer'
  | 'active-no-offer'
  | 'newest-non-ended'
  | 'none';

export type PrimaryLiveSessionSelection<TSession = LiveSessionRecord> = {
  nodeId: string;
  sourceKind: string;
  selectedSessionId: string | null;
  selectedSession: TSession | null;
  selectionReason: PrimaryLiveSessionSelectionReason;
  rejectedSessionIds: Array<{ sessionId: string; reason: PrimaryLiveSessionRejectionReason }>;
};

export type SelectPrimaryLiveSessionInput<TSession = LiveSessionRecord> = {
  sessions: TSession[];
  nodeId?: string;
  sourceKind?: string;
  signalBySessionId?: Map<string, unknown> | Record<string, unknown>;
  nowMs?: number;
  staleAfterMs?: number;
};

const ACTIVE_LIVE_SESSION_STATES = new Set(['active', 'previewing', 'recording', 'waiting_for_answer', 'connected']);
const ENDED_LIVE_SESSION_STATES = new Set(['ended', 'disconnected', 'inactive']);
const FAILED_LIVE_SESSION_STATES = new Set(['failed', 'publisher_failed']);

function readRecordString(record: unknown, key: string): string {
  if (!record || typeof record !== 'object') return '';
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readSessionSourceKind(record: unknown): string {
  return readRecordString(record, 'source_kind') || readRecordString(record, 'sourceKind') || 'camera';
}

function readSessionStatus(record: unknown): string {
  return readRecordString(record, 'status') || readRecordString(record, 'state');
}

function readSessionTimestampMs(record: unknown): number {
  const raw = readRecordString(record, 'updated_at')
    || readRecordString(record, 'last_heartbeat_at')
    || readRecordString(record, 'started_at')
    || readRecordString(record, 'created_at');
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readSignalOverlay(signalBySessionId: SelectPrimaryLiveSessionInput['signalBySessionId'], sessionId: string): Record<string, unknown> | null {
  if (!signalBySessionId || !sessionId) return null;
  const value = signalBySessionId instanceof Map ? signalBySessionId.get(sessionId) : signalBySessionId[sessionId];
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function sessionHasOffer(record: unknown, signal: Record<string, unknown> | null): boolean {
  if (typeof (record as Record<string, unknown>).has_offer === 'boolean') return Boolean((record as Record<string, unknown>).has_offer);
  if (typeof signal?.has_offer === 'boolean') return Boolean(signal.has_offer);
  const metadata = record && typeof record === 'object' ? (record as Record<string, unknown>).metadata : null;
  if (metadata && typeof metadata === 'object' && typeof (metadata as Record<string, unknown>).has_offer === 'boolean') return Boolean((metadata as Record<string, unknown>).has_offer);
  return false;
}

function sessionHasAnswerOrViewer(record: unknown, signal: Record<string, unknown> | null): boolean {
  const direct = record as Record<string, unknown>;
  if (typeof direct.has_answer === 'boolean' && direct.has_answer) return true;
  if (typeof direct.viewer_count === 'number' && direct.viewer_count > 0) return true;
  if (Array.isArray(direct.viewer_ids) && direct.viewer_ids.length > 0) return true;
  if (typeof signal?.has_answer === 'boolean' && signal.has_answer) return true;
  if (typeof signal?.viewer_count === 'number' && signal.viewer_count > 0) return true;
  if (Array.isArray(signal?.viewer_ids) && signal.viewer_ids.length > 0) return true;
  const metadata = direct.metadata;
  if (metadata && typeof metadata === 'object') {
    const meta = metadata as Record<string, unknown>;
    if (meta.has_answer === true) return true;
    if (typeof meta.viewer_count === 'number' && meta.viewer_count > 0) return true;
  }
  return false;
}

function isSessionSuperseded(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  const direct = record as Record<string, unknown>;
  if (readRecordString(direct, 'superseded_by_session_id')) return true;
  const metadata = direct.metadata;
  return Boolean(metadata && typeof metadata === 'object' && readRecordString(metadata, 'superseded_by_session_id'));
}

function selectionReasonForRank(rank: number): PrimaryLiveSessionSelectionReason {
  if (rank >= 40) return 'active-with-offer-and-answer';
  if (rank >= 30) return 'active-with-offer';
  if (rank >= 20) return 'active-no-offer';
  if (rank >= 10) return 'newest-non-ended';
  return 'none';
}

export function selectPrimaryLiveSessionForNodeSource<TSession = LiveSessionRecord>({
  sessions,
  nodeId,
  sourceKind,
  signalBySessionId,
  nowMs = Date.now(),
  staleAfterMs = 90_000,
}: SelectPrimaryLiveSessionInput<TSession>): PrimaryLiveSessionSelection<TSession> {
  const rejectedSessionIds: PrimaryLiveSessionSelection['rejectedSessionIds'] = [];
  const candidates: Array<{ session: TSession; sessionId: string; rank: number; timestamp: number; hasOffer: boolean }> = [];
  const wantedNodeId = (nodeId || '').trim();
  const wantedSourceKind = (sourceKind || '').trim() || 'camera';

  for (const session of sessions || []) {
    const sessionId = readRecordString(session, 'session_id') || readRecordString(session, 'id');
    if (!sessionId) continue;
    if (isLiveRuntimeEventPayload(session)) {
      rejectedSessionIds.push({ sessionId, reason: 'runtime-event' });
      continue;
    }
    const candidateNodeId = readRecordString(session, 'node_id');
    const candidateSourceKind = readSessionSourceKind(session);
    if ((wantedNodeId && candidateNodeId !== wantedNodeId) || (wantedSourceKind && candidateSourceKind !== wantedSourceKind)) {
      rejectedSessionIds.push({ sessionId, reason: 'missing-node-source' });
      continue;
    }
    const status = readSessionStatus(session);
    if (isSessionSuperseded(session)) {
      rejectedSessionIds.push({ sessionId, reason: 'superseded' });
      continue;
    }
    if (ENDED_LIVE_SESSION_STATES.has(status)) {
      rejectedSessionIds.push({ sessionId, reason: 'ended' });
      continue;
    }
    if (FAILED_LIVE_SESSION_STATES.has(status)) {
      rejectedSessionIds.push({ sessionId, reason: 'failed' });
      continue;
    }
    const timestamp = readSessionTimestampMs(session);
    if (timestamp > 0 && staleAfterMs > 0 && nowMs - timestamp > staleAfterMs && ACTIVE_LIVE_SESSION_STATES.has(status)) {
      rejectedSessionIds.push({ sessionId, reason: 'stale' });
      continue;
    }
    const signal = readSignalOverlay(signalBySessionId, sessionId);
    const hasOffer = sessionHasOffer(session, signal);
    const hasAnswer = sessionHasAnswerOrViewer(session, signal);
    const active = ACTIVE_LIVE_SESSION_STATES.has(status);
    let rank = 0;
    if (active && hasOffer && hasAnswer) rank = 40;
    else if (active && hasOffer) rank = 30;
    else if (active) rank = 20;
    else if (!ENDED_LIVE_SESSION_STATES.has(status)) rank = 10;
    if (rank <= 0) {
      rejectedSessionIds.push({ sessionId, reason: 'lower-priority' });
      continue;
    }
    candidates.push({ session, sessionId, rank, timestamp, hasOffer });
  }

  candidates.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (a.hasOffer !== b.hasOffer) return a.hasOffer ? -1 : 1;
    return b.timestamp - a.timestamp;
  });

  const selected = candidates[0] || null;
  for (const candidate of candidates.slice(1)) rejectedSessionIds.push({ sessionId: candidate.sessionId, reason: 'lower-priority' });
  return {
    nodeId: selected ? readRecordString(selected.session, 'node_id') : wantedNodeId,
    sourceKind: selected ? readSessionSourceKind(selected.session) : wantedSourceKind,
    selectedSessionId: selected?.sessionId ?? null,
    selectedSession: selected?.session ?? null,
    selectionReason: selected ? selectionReasonForRank(selected.rank) : 'none',
    rejectedSessionIds,
  };
}

export function selectPrimaryLiveSessionsByNodeSource<TSession = LiveSessionRecord>(
  sessions: TSession[],
  signalBySessionId?: SelectPrimaryLiveSessionInput<TSession>['signalBySessionId'],
): Map<string, PrimaryLiveSessionSelection<TSession>> {
  const groups = new Map<string, TSession[]>();
  for (const session of sessions || []) {
    if (!session || typeof session !== 'object' || isLiveRuntimeEventPayload(session)) continue;
    const nodeId = readRecordString(session, 'node_id');
    const sourceKind = readSessionSourceKind(session);
    if (!nodeId || !sourceKind) continue;
    const key = `${nodeId}::${sourceKind}`;
    const group = groups.get(key) || [];
    group.push(session);
    groups.set(key, group);
  }
  const selections = new Map<string, PrimaryLiveSessionSelection<TSession>>();
  for (const [key, group] of groups) {
    const [nodeId, sourceKind] = key.split('::');
    selections.set(key, selectPrimaryLiveSessionForNodeSource({ sessions: group, nodeId, sourceKind, signalBySessionId }));
  }
  return selections;
}
