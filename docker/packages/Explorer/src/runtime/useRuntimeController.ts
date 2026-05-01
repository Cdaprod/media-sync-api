'use client';

import { useWebRtcLiveSessions } from '../hooks/useWebRtcLiveSessions';
import type { WebRtcLiveSession } from '../api';

type UseRuntimeControllerArgs = {
  listWebRtcLiveSessions: () => Promise<WebRtcLiveSession[]>;
  poll?: boolean;
};

export function useRuntimeController({
  listWebRtcLiveSessions,
  poll = false,
}: UseRuntimeControllerArgs) {
  const {
    sessions,
    sessionsByNodeId,
    waitingByNodeId,
    reload,
  } = useWebRtcLiveSessions({
    listWebRtcLiveSessions,
    enabled: true,
    poll,
  });

  return {
    sessions,
    sessionsByNodeId,
    waitingByNodeId,
    reload,
  };
}
