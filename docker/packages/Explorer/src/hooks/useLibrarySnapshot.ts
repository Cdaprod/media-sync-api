import { useCallback, useRef, useState } from 'react';

import type { ApiClient } from '../api';
import type { LibrarySnapshot, MediaItem, Project, Source } from '../types';

interface LoadLibraryOptions {
  source?: string;
  scope?: 'all';
}

interface UseLibrarySnapshotState {
  snapshot: LibrarySnapshot | null;
  sources: Source[];
  projects: Project[];
  assets: MediaItem[];
  jobs: Array<Record<string, unknown>>;
  generatedAt: string | null;
  isLoading: boolean;
  error: string;
  refreshLibrarySnapshot: (options?: LoadLibraryOptions) => Promise<LibrarySnapshot>;
  applySnapshot: (nextSnapshot: LibrarySnapshot) => void;
  clearSnapshotError: () => void;
}

/**
 * Single-flight aggregate library snapshot loader.
 *
 * Example:
 *   const { loadExplorerSnapshot } = useLibrarySnapshot(api);
 *   const snapshot = await loadExplorerSnapshot({ scope: 'all' });
 */
export function useLibrarySnapshot(api: ApiClient): UseLibrarySnapshotState {
  const inflightRef = useRef<Promise<LibrarySnapshot> | null>(null);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<MediaItem[]>([]);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const applySnapshot = useCallback((nextSnapshot: LibrarySnapshot) => {
    setSnapshot(nextSnapshot);
    setSources(Array.isArray(nextSnapshot.sources) ? nextSnapshot.sources : []);
    setProjects(Array.isArray(nextSnapshot.projects) ? nextSnapshot.projects : []);
    setAssets(Array.isArray(nextSnapshot.assets) ? nextSnapshot.assets : []);
    setJobs(Array.isArray(nextSnapshot.jobs) ? nextSnapshot.jobs : []);
    setGeneratedAt(nextSnapshot.generated_at ?? null);
    setError('');
  }, []);

  const clearSnapshotError = useCallback(() => {
    setError('');
  }, []);

  const refreshLibrarySnapshot = useCallback(async (options: LoadLibraryOptions = {}) => {
    if (inflightRef.current) {
      return inflightRef.current;
    }
    setIsLoading(true);
    const request = api.listLibrarySnapshot(options.source, options.scope ?? 'all')
      .then((nextSnapshot) => {
        applySnapshot(nextSnapshot);
        return nextSnapshot;
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load library snapshot';
        setError(message);
        throw err;
      })
      .finally(() => {
        setIsLoading(false);
        inflightRef.current = null;
      });
    inflightRef.current = request;
    return request;
  }, [api, applySnapshot]);

  return {
    snapshot,
    sources,
    projects,
    assets,
    jobs,
    generatedAt,
    isLoading,
    error,
    refreshLibrarySnapshot,
    applySnapshot,
    clearSnapshotError,
  };
}
