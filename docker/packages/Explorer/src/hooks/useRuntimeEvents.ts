import { useEffect } from 'react';

export type RuntimeStreamEvent = { id?: string; type: string; payload: Record<string, unknown> };

export function useRuntimeEvents({ enabled = true, onEvent }: { enabled?: boolean; onEvent?: (event: RuntimeStreamEvent) => void } = {}) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if ((window as any).__explorerRuntimeEventsOpen) return;
    (window as any).__explorerRuntimeEventsOpen = true;

    const es = new EventSource('/api/runtime/events');

    es.onmessage = (e) => {
      try {
        const evt = { id: e.lastEventId, type: 'message', payload: JSON.parse(e.data) };
        onEvent?.(evt);
        window.dispatchEvent(new CustomEvent('runtime:event', { detail: evt }));
      } catch {
        // Ignore malformed events.
      }
    };
    es.addEventListener('node.updated', (e) => onEvent?.({ id: (e as MessageEvent).lastEventId, type: 'node.updated', payload: JSON.parse((e as MessageEvent).data || '{}') }));
    es.addEventListener('source.updated', (e) => onEvent?.({ id: (e as MessageEvent).lastEventId, type: 'source.updated', payload: JSON.parse((e as MessageEvent).data || '{}') }));
    es.addEventListener('live_session.updated', (e) => onEvent?.({ id: (e as MessageEvent).lastEventId, type: 'live_session.updated', payload: JSON.parse((e as MessageEvent).data || '{}') }));
    es.addEventListener('runtime_asset.updated', (e) => onEvent?.({ id: (e as MessageEvent).lastEventId, type: 'runtime_asset.updated', payload: JSON.parse((e as MessageEvent).data || '{}') }));
    es.addEventListener('recording.updated', (e) => onEvent?.({ id: (e as MessageEvent).lastEventId, type: 'recording.updated', payload: JSON.parse((e as MessageEvent).data || '{}') }));

    return () => {
      es.close();
      (window as any).__explorerRuntimeEventsOpen = false;
    };
  }, [enabled, onEvent]);
}
