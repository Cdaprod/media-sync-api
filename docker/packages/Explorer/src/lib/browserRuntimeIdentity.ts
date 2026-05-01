export type BrowserRuntimeTabRole = 'explorer' | 'device' | 'unknown';
export type NodeIdentityTokenSource = 'node-specific' | 'capture' | 'generic' | 'query' | 'none';
export type BrowserRuntimeUiMessageType = 'identity' | 'session' | 'tab-active' | 'request-refresh';

const CAPTURE_NODE_ID_KEY = 'explorer_capture_node_id';
const GENERIC_NODE_ID_KEY = 'explorer_node_id';
const CAPTURE_TOKEN_KEY = 'explorer_capture_node_token';
const GENERIC_TOKEN_KEY = 'explorer_node_token';
const TAB_ROLE_KEY = 'explorer_tab_role';
const ACTIVE_SESSION_ID_KEY = 'explorer_active_session_id';
const ACTIVE_NODE_ID_KEY = 'explorer_active_node_id';
const CHANNEL_NAME = 'thatdamtoolbox-ui';
export const EXPLORER_WINDOW_NAME = 'thatdamtoolbox-explorer';
export const CONNECT_DEVICE_WINDOW_NAME = 'thatdamtoolbox-connect-device';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;
const canUseSessionStorage = () => typeof window !== 'undefined' && !!window.sessionStorage;

export const getCaptureNodeTokenKey = (nodeId: string) => `${CAPTURE_TOKEN_KEY}:${nodeId}`;
export const getStoredNodeId = (): string | null => !canUseStorage() ? null : (window.localStorage.getItem(CAPTURE_NODE_ID_KEY) || window.localStorage.getItem(GENERIC_NODE_ID_KEY));
export const setStoredNodeId = (nodeId: string): void => { if (canUseStorage() && nodeId) { window.localStorage.setItem(CAPTURE_NODE_ID_KEY, nodeId); window.localStorage.setItem(GENERIC_NODE_ID_KEY, nodeId);} };
export function getStoredNodeToken(nodeId?: string | null): { token: string | null; source: NodeIdentityTokenSource } {
  if (!canUseStorage()) return { token: null, source: 'none' };
  if (nodeId) { const scoped = window.localStorage.getItem(getCaptureNodeTokenKey(nodeId)); if (scoped) return { token: scoped, source: 'node-specific' }; }
  const capture = window.localStorage.getItem(CAPTURE_TOKEN_KEY); if (capture) return { token: capture, source: 'capture' };
  const generic = window.localStorage.getItem(GENERIC_TOKEN_KEY); if (generic) return { token: generic, source: 'generic' };
  return { token: null, source: 'none' };
}
export const setStoredNodeToken = (nodeId: string, token: string): void => { if (canUseStorage() && nodeId && token) { window.localStorage.setItem(getCaptureNodeTokenKey(nodeId), token); window.localStorage.setItem(CAPTURE_TOKEN_KEY, token); window.localStorage.setItem(GENERIC_TOKEN_KEY, token);} };

export const getBrowserRuntimeIdentity = (nodeIdOverride?: string | null) => { const nodeId = nodeIdOverride || getStoredNodeId(); const { token, source } = getStoredNodeToken(nodeId); return { nodeId, token, tokenSource: source }; };
export const setBrowserRuntimeIdentity = (nodeId: string, token?: string | null): void => { setStoredNodeId(nodeId); if (token) setStoredNodeToken(nodeId, token); publishBrowserRuntimeIdentity(); };
export const getNodeAuthHeaders = (nodeIdOverride?: string | null): Record<string, string> => { const identity = getBrowserRuntimeIdentity(nodeIdOverride); if (!identity.nodeId || !identity.token) return {}; return { Authorization: `Bearer ${identity.token}`, 'X-Media-Sync-Node-Id': identity.nodeId }; };
export const requireNodeAuthHeaders = (nodeIdOverride?: string | null): Record<string, string> => { const headers = getNodeAuthHeaders(nodeIdOverride); if (!headers.Authorization || !headers['X-Media-Sync-Node-Id']) throw new Error('missing_device_bearer_token'); return headers; };

export const setTabRole = (role: BrowserRuntimeTabRole): void => { if (canUseSessionStorage()) window.sessionStorage.setItem(TAB_ROLE_KEY, role); };
export const getTabRole = (): BrowserRuntimeTabRole => { if (!canUseSessionStorage()) return 'unknown'; const role = window.sessionStorage.getItem(TAB_ROLE_KEY); return role === 'explorer' || role === 'device' ? role : 'unknown'; };
export const setActiveRuntimeSession = (sessionId: string | null, nodeId?: string | null): void => {
  if (!canUseSessionStorage()) return;
  if (sessionId) window.sessionStorage.setItem(ACTIVE_SESSION_ID_KEY, sessionId); else window.sessionStorage.removeItem(ACTIVE_SESSION_ID_KEY);
  if (nodeId) window.sessionStorage.setItem(ACTIVE_NODE_ID_KEY, nodeId); else if (!sessionId) window.sessionStorage.removeItem(ACTIVE_NODE_ID_KEY);
  publishBrowserRuntimeSession(sessionId, nodeId);
};
export const getBrowserRuntimeIdentityDiagnostics = (nodeIdOverride?: string | null) => {
  const identity = getBrowserRuntimeIdentity(nodeIdOverride);
  const activeSessionId = canUseSessionStorage() ? window.sessionStorage.getItem(ACTIVE_SESSION_ID_KEY) : null;
  return { nodeId: identity.nodeId, hasToken: Boolean(identity.token), tokenSource: identity.tokenSource, tokenLength: identity.token?.length || 0, tabRole: getTabRole(), activeSessionId };
};

export function importNodeAuthFromQuery(search = typeof window !== 'undefined' ? window.location.search : '') { const params = new URLSearchParams(search); const nodeId = params.get('node_id') || params.get('nodeId'); const token = params.get('token') || params.get('node_token') || params.get('bearer_token'); if (!nodeId) return { imported: false, nodeId: null, tokenSource: 'none' as NodeIdentityTokenSource }; setStoredNodeId(nodeId); if (token) { setStoredNodeToken(nodeId, token); publishBrowserRuntimeIdentity(); return { imported: true, nodeId, tokenSource: 'query' as NodeIdentityTokenSource }; } publishBrowserRuntimeIdentity(); return { imported: true, nodeId, tokenSource: getStoredNodeToken(nodeId).source }; }
export function stripNodeAuthQueryParams(): void { if (typeof window === 'undefined') return; const url = new URL(window.location.href); let changed = false; for (const key of ['token', 'node_token', 'bearer_token']) { if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; } } if (changed) window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`); }

const openChannel = (): BroadcastChannel | null => (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null);
const postUiMessage = (message: Record<string, unknown>): void => {
  const channel = openChannel();
  if (!channel) return;
  channel.postMessage(message);
  channel.close();
};
const openNamedWindow = (url: string, windowName: string): Window | null => {
  if (typeof window === 'undefined') return null;
  const target = window.open(url, windowName);
  if (target) target.focus?.();
  return target;
};
export const publishBrowserRuntimeIdentity = (): void => { const identity = getBrowserRuntimeIdentity(); postUiMessage({ type: 'identity', nodeId: identity.nodeId, hasToken: Boolean(identity.token), tokenSource: identity.tokenSource }); };
export const publishBrowserRuntimeSession = (sessionId: string | null, nodeId?: string | null): void => { postUiMessage({ type: 'session', nodeId: nodeId || getStoredNodeId(), sessionId, role: getTabRole() }); };
export const publishBrowserRuntimeTabActive = (role: BrowserRuntimeTabRole): void => {
  postUiMessage({ type: 'tab-active', role, at: Date.now() });
};
export const requestExplorerRefresh = (reason = 'device-focus'): void => {
  postUiMessage({ type: 'request-refresh', reason, at: Date.now(), role: getTabRole() });
};
export const subscribeBrowserRuntimeChannel = (onMessage: (message: any) => void): (() => void) => { const channel = openChannel(); if (!channel) return () => undefined; channel.onmessage = (event) => onMessage(event.data); return () => channel.close(); };

export const buildOpenDeviceUrl = (basePath = '/connect/device', nodeIdOverride?: string | null): string => { const identity = getBrowserRuntimeIdentity(nodeIdOverride); const params = new URLSearchParams(); if (identity.nodeId) params.set('node_id', identity.nodeId); if (identity.token) params.set('token', identity.token); const query = params.toString(); return query ? `${basePath}?${query}` : basePath; };
export const openDeviceTab = (nodeId?: string | null): void => { openNamedWindow(buildOpenDeviceUrl('/connect/device', nodeId), CONNECT_DEVICE_WINDOW_NAME); };
export const openExplorerTab = (path = '/'): void => { openNamedWindow(path, EXPLORER_WINDOW_NAME); };
export const registerWindowName = (role: BrowserRuntimeTabRole): void => {
  if (typeof window === 'undefined') return;
  if (role === 'explorer') window.name = EXPLORER_WINDOW_NAME;
  if (role === 'device') window.name = CONNECT_DEVICE_WINDOW_NAME;
};
export const pruneLegacyNodeIdentityKeys = (): void => {
  if (!canUseStorage()) return;
  const current = getStoredNodeId();
  for (const key of Object.keys(window.localStorage)) {
    if (!key.startsWith(`${CAPTURE_TOKEN_KEY}:`)) continue;
    if (current && key === getCaptureNodeTokenKey(current)) continue;
    window.localStorage.removeItem(key);
  }
};
