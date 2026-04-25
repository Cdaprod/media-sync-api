export type LiveSourceKind = 'camera' | 'screen';
export type LiveSessionStatus = 'idle' | 'previewing' | 'recording' | 'ended';
export type LiveSessionControlAction = 'start_recording' | 'stop_recording';
export type LiveSignalRole = 'device' | 'viewer';

export interface LiveSignalDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface LiveSignalIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface LiveSignalState {
  session_id: string;
  viewer_id?: string | null;
  viewer_ids: string[];
  primary_viewer_id?: string | null;
  offer?: LiveSignalDescription | null;
  answer?: LiveSignalDescription | null;
  ice_from_device: LiveSignalIceCandidate[];
  ice_from_viewer: LiveSignalIceCandidate[];
  updated_at?: string | null;
}

export interface LiveSessionRecord {
  session_id: string;
  node_id: string;
  source_kind: LiveSourceKind;
  status: LiveSessionStatus;
  started_at: string;
  last_heartbeat_at: string;
  chunk_count: number;
  claim_id: string | null;
  latest_chunk_path?: string | null;
  desired_action?: LiveSessionControlAction | null;
  last_control_at?: string | null;
  metadata?: Record<string, unknown>;
}

export type LiveSession = LiveSessionRecord;
