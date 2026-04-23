import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NodeControlRecord, SourceControlRecord, SourceControlSnapshot } from '../types/sourceControl';

interface UseSourceControlDataOptions {
  listSources: () => Promise<SourceControlRecord[]>;
  listNodes: () => Promise<NodeControlRecord[]>;
}

export function useSourceControlData({
  listSources,
  listNodes,
}: UseSourceControlDataOptions) {
  const [sources, setSources] = useState<SourceControlRecord[]>([]);
  const [nodes, setNodes] = useState<NodeControlRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSources, nextNodes] = await Promise.all([listSources(), listNodes()]);
      setSources(Array.isArray(nextSources) ? nextSources : []);
      setNodes(Array.isArray(nextNodes) ? nextNodes : []);
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load source control data';
      setError(message);
    }
    finally {
      setLoading(false);
    }
  }, [listNodes, listSources]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const snapshot: SourceControlSnapshot = useMemo(() => ({
    sources,
    nodes,
  }), [nodes, sources]);

  const canonicalSources = useMemo(
    () => sources.filter((source) => (source.authority || 'canonical') === 'canonical'),
    [sources],
  );

  const remoteSources = useMemo(
    () => sources.filter((source) => (source.authority || 'canonical') !== 'canonical'),
    [sources],
  );

  const healthyNodes = useMemo(
    () => nodes.filter((node) => node.status === 'healthy'),
    [nodes],
  );

  return {
    snapshot,
    sources,
    nodes,
    canonicalSources,
    remoteSources,
    healthyNodes,
    loading,
    error,
    reload,
  };
}
