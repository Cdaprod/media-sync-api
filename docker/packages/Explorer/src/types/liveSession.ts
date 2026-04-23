export type LiveSourceKind = 'camera' | 'screen';
export type LiveSessionStatus = 'idle' | 'previewing' | 'recording' | 'ended';

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
  metadata?: Record<string, unknown>;
}
