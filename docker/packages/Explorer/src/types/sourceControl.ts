export interface SourceControlRecord {
  name: string;
  root: string | null;
  type: string;
  enabled: boolean;
  accessible: boolean;
  instructions?: string | null;

  kind?: string | null;
  authority?: string | null;
  owner_node_id?: string | null;
  local_only?: boolean | null;
  can_index?: boolean | null;
  can_proxy?: boolean | null;
  can_record?: boolean | null;
  metadata?: Record<string, string>;
  token_preview?: string | null;
  auth_type?: string | null;
  auth_scopes?: string[];
}

export interface NodeControlRecord {
  node_id: string;
  label: string;
  base_url: string | null;
  roles: string[];
  capabilities: string[];
  source_name?: string | null;
  enabled: boolean;
  status: 'unknown' | 'healthy' | 'degraded' | 'offline';
  version?: string | null;
  advertised_source_kinds: string[];
  ephemeral: boolean;
  last_heartbeat_at?: string | null;
  metadata?: Record<string, string>;
  token_preview?: string | null;
  auth_type?: string | null;
  auth_scopes?: string[];
}

export interface SourceControlSnapshot {
  sources: SourceControlRecord[];
  nodes: NodeControlRecord[];
}
