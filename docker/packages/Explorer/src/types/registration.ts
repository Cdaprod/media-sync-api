import type { NodeControlRecord, SourceControlRecord } from './sourceControl';

export interface RegisterNodeAuth {
  type: 'bearer';
  token: string;
  token_preview: string;
  scopes: string[];
  header: string;
  node_id_header: string;
  shown_once: boolean;
}

export interface RegisterNodeRequest {
  node_id: string;
  label: string;
  base_url: string;
  roles: string[];
  capabilities: string[];
  source_name?: string | null;
  source_kind?: string | null;
  source_authority?: string | null;
  advertised_source_kinds?: string[];
  ephemeral: boolean;
  metadata?: Record<string, string>;
}

export interface RegisterNodeResponse {
  ok: boolean;
  registered_node?: NodeControlRecord;
  source_record?: SourceControlRecord;
  authority?: Record<string, unknown>;
  device_url?: string;
  message?: string;
  auth?: RegisterNodeAuth;
}
