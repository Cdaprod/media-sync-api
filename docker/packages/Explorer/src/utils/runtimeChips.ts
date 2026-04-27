import type { NodeControlRecord } from '../types/sourceControl';
import type { WebRtcLiveSession } from '../api';

export type RuntimeChipTone =
  | 'status-online'
  | 'status-offline'
  | 'status-waiting'
  | 'status-connected'
  | 'role'
  | 'capability'
  | 'auth'
  | 'muted'
  | 'danger';

export type RuntimeChip = {
  label: string;
  tone: RuntimeChipTone;
};

function hasToken(tokens: string[], needle: string): boolean {
  return tokens.some((token) => token === needle || token.includes(needle));
}

export function buildRuntimeChips(node: NodeControlRecord, liveSession?: WebRtcLiveSession | null): RuntimeChip[] {
  const chips: RuntimeChip[] = [];
  const seen = new Set<string>();

  const addChip = (label: string, tone: RuntimeChipTone) => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    chips.push({ label, tone });
  };

  const status = (node.status || '').toLowerCase();
  if (status === 'healthy' || status === 'online') addChip('online', 'status-online');
  else if (status === 'offline' || status === 'disabled') addChip('offline', 'status-offline');
  else addChip(status || 'unknown', 'muted');

  if (liveSession?.state === 'waiting_for_answer') addChip('waiting answer', 'status-waiting');
  if (liveSession?.state === 'connected') addChip('connected', 'status-connected');

  const tokens = [
    ...(node.roles ?? []),
    ...(node.capabilities ?? []),
    ...(node.advertised_source_kinds ?? []),
    node.metadata?.transport_hint ?? '',
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (hasToken(tokens, 'capture')) addChip('capture', 'role');
  if (hasToken(tokens, 'record') || hasToken(tokens, 'can_record')) addChip('record', 'capability');
  if (hasToken(tokens, 'can_index') || hasToken(tokens, 'index')) addChip('index', 'capability');
  if (hasToken(tokens, 'can_proxy_streams') || hasToken(tokens, 'proxy')) addChip('proxy', 'capability');

  const liveLike = hasToken(tokens, 'live:write')
    || tokens.includes('session')
    || tokens.includes('session-node')
    || tokens.includes('browser_push')
    || tokens.includes('browser-push')
    || node.metadata?.browser_push === 'true'
    || node.metadata?.session_node === 'true'
    || node.metadata?.transport_hint === 'session';
  if (liveLike) addChip('live', 'capability');

  if ((node.auth_type || '').toLowerCase() === 'bearer' || (node.auth_scopes?.length ?? 0) > 0) {
    addChip('bearer', 'auth');
  }

  if (node.source_name === 'string') addChip('test payload', 'danger');

  return chips;
}
