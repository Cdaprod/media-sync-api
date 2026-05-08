import { isLiveRuntimeEventPayload } from './liveSessions';

export type WebRtcLiveState =
  | 'waiting_for_answer'
  | 'connected'
  | 'inactive'
  | string;

export type WebRtcLiveSession = {
  session_id: string;
  node_id: string;
  has_offer?: boolean;
  has_answer?: boolean;
  viewer_count?: number;
  viewer_ids?: string[];
  state?: WebRtcLiveState;
  connection_states?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
};

export type WebRtcLiveSessionListResponse = {
  sessions?: WebRtcLiveSession[];
};

export function normalizeWebRtcLiveSessions(payload: unknown): WebRtcLiveSession[] {
  const normalizeArray = (items: unknown[]): WebRtcLiveSession[] => (
    items.filter((entry): entry is WebRtcLiveSession => Boolean(entry) && !isLiveRuntimeEventPayload(entry))
  );

  if (Array.isArray(payload)) return normalizeArray(payload);

  if (payload && typeof payload === 'object') {
    const maybe = payload as WebRtcLiveSessionListResponse;
    if (Array.isArray(maybe.sessions)) {
      return normalizeArray(maybe.sessions);
    }
  }

  return [];
}

export function getWebRtcSessionState(session: WebRtcLiveSession | null | undefined): WebRtcLiveState {
  if (!session) return 'inactive';
  if (session.state) return session.state;
  if (session.has_offer && !session.has_answer && !(session.viewer_count || 0)) return 'waiting_for_answer';
  if (session.has_answer || (session.viewer_count || 0) > 0) return 'connected';
  return 'inactive';
}
