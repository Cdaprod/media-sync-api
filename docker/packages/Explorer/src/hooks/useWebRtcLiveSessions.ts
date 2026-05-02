'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

import type { WebRtcLiveSession } from '../api';

type UseWebRtcLiveSessionsArgs = {
  listWebRtcLiveSessions: () => Promise<WebRtcLiveSession[]>;
  enabled?: boolean;
  poll?: boolean;
  initialLoad?: boolean;
};

type UseWebRtcLiveSessionsResult = {
  sessions: WebRtcLiveSession[];
  sessionsByNodeId: Map<string, WebRtcLiveSession>;
  waitingByNodeId: Map<string, WebRtcLiveSession>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setSessions: React.Dispatch<React.SetStateAction<WebRtcLiveSession[]>>;
  applyLiveSessionUpdate: (payload: Record<string, unknown>) => void;
  removeLiveSession: (payload: Record<string, unknown>) => void;
};

function pollIntervalMs(sessions: WebRtcLiveSession[]): number {
  return sessions.some((session) => session.state === 'waiting_for_answer') ? 2000 : 5000;
}

export function useWebRtcLiveSessions({
  listWebRtcLiveSessions,
  enabled = true,
  poll = false,
  initialLoad = false,
}: UseWebRtcLiveSessionsArgs): UseWebRtcLiveSessionsResult {
  const [sessions, setSessions] = useState<WebRtcLiveSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionsRef = useRef<WebRtcLiveSession[]>([]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setSessions([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await listWebRtcLiveSessions();
      setSessions(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load WebRTC sessions');
    } finally {
      setLoading(false);
    }
  }, [enabled, listWebRtcLiveSessions]);

  useEffect(() => {
    if (!initialLoad) return;
    if (!enabled) return;
    void reload();
  }, [enabled, initialLoad, reload]);

  useEffect(() => {
    if (!enabled || !poll) return;

    let timer: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const delay = pollIntervalMs(sessionsRef.current);
      timer = window.setTimeout(tick, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        scheduleNext();
        return;
      }
      await reload();
      scheduleNext();
    };

    const onVisibilityChange = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      void reload().finally(scheduleNext);
    };

    scheduleNext();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, poll, reload]);

  const sessionsByNodeId = useMemo(() => {
    const entries = new Map<string, WebRtcLiveSession>();
    for (const session of sessions) {
      if (session.node_id) entries.set(session.node_id, session);
    }
    return entries;
  }, [sessions]);

  const waitingByNodeId = useMemo(() => {
    const entries = new Map<string, WebRtcLiveSession>();
    for (const session of sessions) {
      if (session.node_id && session.state === 'waiting_for_answer') {
        entries.set(session.node_id, session);
      }
    }
    return entries;
  }, [sessions]);
  const applyLiveSessionUpdate = useCallback((payload: Record<string, unknown>) => {
    setSessions((prev) => {
      const id = String(payload.session_id ?? payload.id ?? '').trim();
      if (!id) return prev;
      let seen = false;
      const next = prev.map((entry) => {
        const entryId = String((entry as any).session_id ?? '').trim();
        if (entryId !== id) return entry;
        seen = true;
        return { ...entry, ...payload } as WebRtcLiveSession;
      });
      return seen ? next : [...next, payload as WebRtcLiveSession];
    });
  }, []);
  const removeLiveSession = useCallback((payload: Record<string, unknown>) => {
    const id = String(payload.session_id ?? payload.id ?? '').trim();
    if (!id) return;
    setSessions((prev) => prev.filter((entry) => String((entry as any).session_id ?? '').trim() !== id));
  }, []);

  return {
    sessions,
    sessionsByNodeId,
    waitingByNodeId,
    loading,
    error,
    reload,
    setSessions,
    applyLiveSessionUpdate,
    removeLiveSession,
  };
}
