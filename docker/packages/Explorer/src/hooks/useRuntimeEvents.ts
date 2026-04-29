import { useEffect } from 'react';

export function useRuntimeEvents({ enabled = true }: { enabled?: boolean } = {}) {
  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource('/api/events');

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        window.dispatchEvent(new CustomEvent('runtime:event', { detail: evt }));
      } catch {
        // Ignore malformed events.
      }
    };

    return () => es.close();
  }, [enabled]);
}
