'use client';

import { useCallback, useEffect, useState } from 'react';

import type { LiveSessionRecord } from '../types/liveSession';
import { shouldPollLiveSurface } from '../utils/polling';

interface UseLiveSessionsOptions {
  listLiveSessions: () => Promise<LiveSessionRecord[]>;
  enabled?: boolean;
}

export function useLiveSessions({ listLiveSessions, enabled = false }: UseLiveSessionsOptions) {
  const [sessions, setSessions] = useState<LiveSessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listLiveSessions();
      setSessions(Array.isArray(next) ? next : []);
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
      if (!shouldPollLiveSurface()) return;
      void reload();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled, reload]);

  return { sessions, loading, error, reload };
}
