import type { NodeControlRecord } from '../types/sourceControl';
import type { IngestClaimRecord } from '../types/ingestClaim';

function allRuntimeTokens(node: NodeControlRecord): string[] {
  return [
    ...(node.roles ?? []),
    ...(node.capabilities ?? []),
    ...(node.advertised_source_kinds ?? []),
    node.source_name ?? '',
    node.metadata?.transport_hint ?? '',
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
}

function hasAny(tokens: string[], needles: string[]): boolean {
  return tokens.some((token) => needles.some((needle) => token.includes(needle)));
}

export function isSessionNode(node: NodeControlRecord): boolean {
  return (
    node.metadata?.session_node === 'true'
    || node.metadata?.browser_push === 'true'
    || ['session', 'browser', 'webrtc'].includes(node.metadata?.transport_hint ?? '')
  );
}

export function isTestPayloadNode(node: NodeControlRecord): boolean {
  return (
    node.source_name === 'string'
    || node.roles?.includes('string')
    || node.capabilities?.includes('string')
    || node.advertised_source_kinds?.includes('string')
  );
}

export function getRuntimeKinds(node: NodeControlRecord): string[] {
  const tokens = allRuntimeTokens(node);
  const kinds = new Set<string>();

  if (hasAny(tokens, ['capture', 'camera', 'record', 'can_record', 'can_proxy_streams'])) kinds.add('capture');
  if (hasAny(tokens, ['storage', 'filesystem', 'index', 'can_index'])) kinds.add('storage');
  if (hasAny(tokens, ['process', 'compose', 'transcode', 'analyze'])) kinds.add('process');
  if (hasAny(tokens, ['transport', 'webrtc', 'stream', 'proxy', 'can_proxy_streams'])) kinds.add('transport');

  return Array.from(kinds);
}

export function getRuntimeCapabilityTags(node: NodeControlRecord): string[] {
  const tags = new Set<string>();

  for (const role of node.roles ?? []) tags.add(role);
  for (const capability of node.capabilities ?? []) tags.add(capability);
  for (const kind of node.advertised_source_kinds ?? []) tags.add(kind);

  if (isSessionNode(node)) tags.add('session-node');
  if (node.metadata?.transport_hint) tags.add(node.metadata.transport_hint);

  return Array.from(tags).filter(Boolean);
}

export function getDeviceUrl(nodeId: string): string {
  return `/connect/device?node_id=${encodeURIComponent(nodeId)}`;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const candidate = (value || '').trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    return null;
  }
  return null;
}

export function getRegisteredNodeDeviceUrl(node: NodeControlRecord): string | null {
  return normalizeHttpUrl(node.base_url);
}

export function hasRegisteredNodeDeviceUrl(node: NodeControlRecord): boolean {
  return Boolean(getRegisteredNodeDeviceUrl(node));
}

export function isTestPayloadClaim(claim: IngestClaimRecord): boolean {
  const fields = [claim.node_id, claim.source_name, claim.local_ref, claim.fingerprint, claim.content_type];
  return fields.some((value) => (value ?? '').toLowerCase() === 'string');
}
