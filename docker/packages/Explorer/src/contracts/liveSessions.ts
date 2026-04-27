import type { LiveSessionRecord } from '../types/liveSession';

export type { LiveSessionRecord };

export function normalizeLiveSessionList(payload: unknown): LiveSessionRecord[] {
  if (Array.isArray(payload)) return payload.filter(Boolean) as LiveSessionRecord[];

  if (payload && typeof payload === 'object') {
    const obj = payload as { sessions?: LiveSessionRecord[]; live_sessions?: LiveSessionRecord[] };
    if (Array.isArray(obj.sessions)) return obj.sessions.filter(Boolean);
    if (Array.isArray(obj.live_sessions)) return obj.live_sessions.filter(Boolean);
  }

  return [];
}
