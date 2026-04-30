export type NodeTokenSource = 'node-scoped' | 'capture-fallback' | 'legacy-fallback' | 'missing';

const NODE_ID_KEY = 'explorer_capture_node_id';
const CAPTURE_TOKEN_KEY = 'explorer_capture_node_token';
const LEGACY_TOKEN_KEY = 'explorer_node_token';

const readStorage = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
};

export function getStoredNodeId(): string | null {
  return readStorage(NODE_ID_KEY);
}

export function setStoredNodeId(nodeId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NODE_ID_KEY, nodeId);
}

export function getStoredNodeToken(nodeId?: string | null): string | null {
  const resolved = (nodeId || '').trim();
  if (resolved) {
    const scoped = readStorage(`explorer_capture_node_token:${resolved}`);
    if (scoped) return scoped;
  }
  return readStorage(CAPTURE_TOKEN_KEY) || readStorage(LEGACY_TOKEN_KEY);
}

export function setStoredNodeToken(nodeId: string, token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`explorer_capture_node_token:${nodeId}`, token);
  window.localStorage.setItem(CAPTURE_TOKEN_KEY, token);
  window.localStorage.setItem(LEGACY_TOKEN_KEY, token);
}

export function getNodeAuthHeaders(nodeId?: string | null): Record<string, string> {
  const resolvedNodeId = (nodeId || '').trim();
  const token = getStoredNodeToken(resolvedNodeId || undefined);
  if (!token) {
    throw new Error('missing_device_bearer_token');
  }
  return {
    Authorization: `Bearer ${token}`,
    ...(resolvedNodeId ? { 'X-Media-Sync-Node-Id': resolvedNodeId } : {}),
  };
}

export function getNodeAuthDiagnostics(nodeId?: string | null): {
  nodeId: string | null;
  hasToken: boolean;
  tokenSource: NodeTokenSource;
  tokenLength: number;
} {
  const resolvedNodeId = (nodeId || '').trim() || null;
  const scoped = resolvedNodeId ? readStorage(`explorer_capture_node_token:${resolvedNodeId}`) : null;
  const capture = readStorage(CAPTURE_TOKEN_KEY);
  const legacy = readStorage(LEGACY_TOKEN_KEY);
  const token = scoped || capture || legacy || '';
  const tokenSource: NodeTokenSource = scoped ? 'node-scoped' : capture ? 'capture-fallback' : legacy ? 'legacy-fallback' : 'missing';
  return { nodeId: resolvedNodeId, hasToken: !!token, tokenSource, tokenLength: token.length };
}
