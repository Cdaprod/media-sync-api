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
  if (Array.isArray(payload)) return payload.filter(Boolean) as WebRtcLiveSession[];

  if (payload && typeof payload === 'object') {
    const maybe = payload as WebRtcLiveSessionListResponse;
    if (Array.isArray(maybe.sessions)) {
      return maybe.sessions.filter(Boolean);
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
