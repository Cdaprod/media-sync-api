import { useCallback, useRef } from 'react';

import type { ApiClient } from '../api';
import type { LibrarySnapshot } from '../types';

interface LoadLibraryOptions {
  source?: string;
  scope?: 'all';
}

/**
 * Single-flight aggregate library snapshot loader.
 *
 * Example:
 *   const { loadExplorerSnapshot } = useLibrarySnapshot(api);
 *   const snapshot = await loadExplorerSnapshot({ scope: 'all' });
 */
export function useLibrarySnapshot(api: ApiClient) {
  const inflightRef = useRef<Promise<LibrarySnapshot> | null>(null);

  const loadExplorerSnapshot = useCallback(async (options: LoadLibraryOptions = {}) => {
    if (inflightRef.current) {
      return inflightRef.current;
    }
    const request = api.listLibrarySnapshot(options.source, options.scope ?? 'all')
      .finally(() => {
        inflightRef.current = null;
      });
    inflightRef.current = request;
    return request;
  }, [api]);

  return { loadExplorerSnapshot };
}
