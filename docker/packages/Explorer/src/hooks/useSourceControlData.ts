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
    const [nextSources, nextNodes] = await Promise.allSettled([listSources(), listNodes()]);
    if (nextSources.status === 'fulfilled') {
      setSources(Array.isArray(nextSources.value) ? nextSources.value : []);
    }
    if (nextNodes.status === 'fulfilled') {
      setNodes(Array.isArray(nextNodes.value) ? nextNodes.value : []);
    }
    if (nextSources.status === 'rejected' || nextNodes.status === 'rejected') {
      const reasons = [
        nextSources.status === 'rejected'
          ? (nextSources.reason instanceof Error ? nextSources.reason.message : String(nextSources.reason))
          : null,
        nextNodes.status === 'rejected'
          ? (nextNodes.reason instanceof Error ? nextNodes.reason.message : String(nextNodes.reason))
          : null,
      ].filter(Boolean);
      setError(reasons.join(' · ') || 'Failed to load source control data');
    }
    setLoading(false);
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
