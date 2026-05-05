'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { isDurableLiveSessionRecord, selectPrimaryLiveSessionsByNodeSource } from '../contracts/liveSessions';
import type { LiveSessionRecord } from '../types/liveSession';

interface UseLiveSessionsOptions {
  listLiveSessions: () => Promise<LiveSessionRecord[]>;
  enabled?: boolean;
}
type IdRecord = Record<string, unknown>;
const readRuntimeId = (record: IdRecord): string | null => String(record.session_id ?? record.id ?? '').trim() || null;

export function useLiveSessions({ listLiveSessions, enabled = false }: UseLiveSessionsOptions) {
  const [sessions, setSessions] = useState<LiveSessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listLiveSessions();
      setSessions(Array.isArray(next) ? next.filter(isDurableLiveSessionRecord) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live sessions');
    } finally {
      setLoading(false);
    }
  }, [listLiveSessions]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void reload();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled, reload]);

  const applyLiveSessionUpdate = useCallback((payload: IdRecord) => {
    if (!isDurableLiveSessionRecord(payload)) return;
    setSessions((prev) => {
      const id = readRuntimeId(payload);
      if (!id) return prev;
      let seen = false;
      const next = prev.map((entry) => {
        if (readRuntimeId(entry as unknown as IdRecord) !== id) return entry;
        seen = true;
        return { ...entry, ...payload } as LiveSessionRecord;
      });
      return seen ? next : [...next, payload as LiveSessionRecord];
    });
  }, []);
  const removeLiveSession = useCallback((payload: IdRecord) => {
    const id = readRuntimeId(payload);
    if (!id) return;
    setSessions((prev) => prev.filter((entry) => readRuntimeId(entry as unknown as IdRecord) !== id));
  }, []);

  const primarySelectionByNodeSource = useMemo(() => selectPrimaryLiveSessionsByNodeSource<LiveSessionRecord>(sessions), [sessions]);

  return { sessions, primarySelectionByNodeSource, loading, error, reload, setSessions, applyLiveSessionUpdate, removeLiveSession };
}
