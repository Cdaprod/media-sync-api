import type { ApiClient, WebRtcLiveSession } from '../../../src/api';

export type LiveBroadcastAlignmentResult =
  | { ok: true; session: WebRtcLiveSession }
  | {
    ok: false;
    reason: 'session_not_listed' | 'node_mismatch' | 'offer_missing' | 'list_failed';
    details?: string;
    sessions?: WebRtcLiveSession[];
  };

export async function ensureLiveBroadcastAlignment(input: {
  api: ApiClient;
  sessionId: string;
  nodeId: string;
}): Promise<LiveBroadcastAlignmentResult> {
  try {
    const sessions = await input.api.listWebRtcLiveSessions();
    const match = sessions.find((session) => session.session_id === input.sessionId);
    if (!match) return { ok: false, reason: 'session_not_listed', sessions };
    if (match.node_id !== input.nodeId) return { ok: false, reason: 'node_mismatch', sessions };
    if (!match.has_offer) return { ok: false, reason: 'offer_missing', sessions };
    return { ok: true, session: match };
  } catch (error) {
    return {
      ok: false,
      reason: 'list_failed',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
