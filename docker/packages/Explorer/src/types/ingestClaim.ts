export interface IngestClaimRecord {
  claim_id: string;
  candidate_id?: string | null;
  node_id: string;
  source_name: string;
  kind: string;
  local_ref?: string | null;
  materialization_mode?: string | null;
  fingerprint?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  status: string;
  metadata?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}
