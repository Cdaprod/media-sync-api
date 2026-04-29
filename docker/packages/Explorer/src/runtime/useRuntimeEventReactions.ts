'use client';

import { useEffect } from 'react';

type UseRuntimeEventReactionsArgs = {
  reloadLibrarySnapshot: () => Promise<void>;
  reloadLiveSessions: () => Promise<void>;
};

export function useRuntimeEventReactions({
  reloadLibrarySnapshot,
  reloadLiveSessions,
}: UseRuntimeEventReactionsArgs) {
  useEffect(() => {
    const onEvt = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: string }>;
      const evt = customEvent.detail;
      if (!evt || typeof evt !== 'object') return;

      if (evt.type === 'recording.complete') {
        void reloadLibrarySnapshot();
      }

      if (evt.type === 'live.offer') {
        void reloadLiveSessions();
      }
    };

    window.addEventListener('runtime:event', onEvt as EventListener);
    return () => window.removeEventListener('runtime:event', onEvt as EventListener);
  }, [reloadLibrarySnapshot, reloadLiveSessions]);
}
