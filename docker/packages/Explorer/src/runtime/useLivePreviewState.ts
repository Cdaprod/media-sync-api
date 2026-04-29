'use client';

import { useCallback, useState } from 'react';

type ActiveLivePreview = {
  sessionId: string;
  nodeId: string;
  label?: string;
};

export function useLivePreviewState() {
  const [activeLivePreview, setActiveLivePreview] = useState<ActiveLivePreview | null>(null);

  const openLivePreview = useCallback((sessionId: string, nodeId: string, label?: string) => {
    setActiveLivePreview({ sessionId, nodeId, label });
  }, []);

  const closeLivePreview = useCallback(() => {
    setActiveLivePreview(null);
  }, []);

  return {
    activeLivePreview,
    openLivePreview,
    closeLivePreview,
  };
}
