import { useEffect } from 'react';

export type RuntimeStreamEvent = { id?: string; type: string; payload: Record<string, unknown> };

export function useRuntimeEvents({ enabled = true, onEvent }: { enabled?: boolean; onEvent?: (event: RuntimeStreamEvent) => void } = {}) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if ((window as any).__explorerRuntimeEventsOpen) return;
    (window as any).__explorerRuntimeEventsOpen = true;

    const es = new EventSource('/api/runtime/events');
    const publishDebug = (patch: Record<string, unknown>) => {
      (window as any).__explorerPollingDebug = {
        ...((window as any).__explorerPollingDebug || {}),
        ...patch,
      };
    };
    publishDebug({
      eventStreamConnected: false,
      lastEventStreamUrl: '/api/runtime/events',
    });
    const parseData = (value: string): Record<string, unknown> => {
      try { return JSON.parse(value || '{}'); } catch { return {}; }
    };
    es.onopen = () => {
      publishDebug({
        eventStreamConnected: true,
        lastEventStreamOpenAt: Date.now(),
        lastEventStreamReadyState: es.readyState,
        lastEventStreamUrl: '/api/runtime/events',
      });
    };

    es.onmessage = (e) => {
      try {
        const evt = { id: e.lastEventId, type: 'message', payload: parseData(e.data) };
        publishDebug({
          eventStreamConnected: true,
          lastEventStreamMessageAt: Date.now(),
          lastEventStreamReadyState: es.readyState,
          lastEventStreamUrl: '/api/runtime/events',
        });
        onEvent?.(evt);
        window.dispatchEvent(new CustomEvent('runtime:event', { detail: evt }));
      } catch {
        // Ignore malformed events.
      }
    };
    const wire = (type: string) => es.addEventListener(type, (e) => {
      publishDebug({
        eventStreamConnected: true,
        lastEventStreamMessageAt: Date.now(),
        lastEventStreamReadyState: es.readyState,
        lastEventStreamUrl: '/api/runtime/events',
      });
      onEvent?.({ id: (e as MessageEvent).lastEventId, type, payload: parseData((e as MessageEvent).data) });
    });
    ['node.updated', 'source.updated', 'live_session.updated', 'live_session.deleted', 'runtime_asset.updated', 'recording.updated', 'ingest_claim.updated', 'ingest_claim.deleted', 'reconnect', 'missed_sequence', 'snapshot_required'].forEach(wire);
    es.onerror = () => {
      if (typeof window !== 'undefined') {
        publishDebug({
          eventStreamConnected: false,
          lastEventStreamErrorAt: Date.now(),
          lastEventStreamReadyState: es.readyState,
          lastEventStreamUrl: '/api/runtime/events',
        });
      }
    };

    return () => {
      es.close();
      (window as any).__explorerRuntimeEventsOpen = false;
    };
  }, [enabled, onEvent]);
}
