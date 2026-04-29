export function readDeviceBearerToken(nodeId: string | null): string | null {
  if (typeof window === 'undefined') return null;
  const keys = [
    nodeId ? `explorer_capture_node_token:${nodeId}` : null,
    'explorer_capture_node_token',
    'explorer_node_token',
  ].filter(Boolean) as string[];
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  return null;
}

export function writeDeviceBearerToken(nodeId: string, token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`explorer_capture_node_token:${nodeId}`, token);
  window.localStorage.setItem('explorer_capture_node_token', token);
}
