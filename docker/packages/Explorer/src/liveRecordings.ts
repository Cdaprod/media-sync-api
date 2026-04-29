import type { MediaItem } from './types';

export type PendingRecordingStatus =
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'completed'
  | 'finalizing'
  | 'saved'
  | 'failed';

export interface PendingRecordingAsset {
  recordingId: string;
  sessionId: string;
  nodeId: string;
  project: string;
  source: string;
  targetDir: string;
  outputName: string | null;
  createdAt: string;
  startedAt: string;
  status: PendingRecordingStatus;
  elapsedMs?: number;
  stream?: MediaStream | null;
  previewObjectUrl?: string | null;
  assetUrl?: string | null;
  completedPath?: string | null;
  error?: string;
}

export function buildPendingRecordingId(sessionId: string): string {
  return `rec-${sessionId}-${Date.now().toString(36)}`;
}

export function buildPendingRecordingOutputName(nodeId: string, sessionId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cleanNode = nodeId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'node';
  const cleanSession = sessionId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'session';
  return `${cleanNode}-${cleanSession}-${stamp}.webm`;
}

export function pendingRecordingHoldsNewestSlot(status: PendingRecordingStatus): boolean {
  return status === 'recording'
    || status === 'stopping'
    || status === 'uploading'
    || status === 'finalizing';
}

export function sortPendingRecordingAssetsForDisplay(items: PendingRecordingAsset[]): PendingRecordingAsset[] {
  return [...items].sort((left, right) => {
    const leftPriority = pendingRecordingHoldsNewestSlot(left.status) ? 0 : 1;
    const rightPriority = pendingRecordingHoldsNewestSlot(right.status) ? 0 : 1;

    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    const leftMs = new Date(left.createdAt).getTime();
    const rightMs = new Date(right.createdAt).getTime();

    if (Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) {
      return rightMs - leftMs;
    }

    return left.recordingId.localeCompare(right.recordingId);
  });
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/').trim();
}

function baseName(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function pendingRecordingCandidateOutputPaths(item: PendingRecordingAsset): string[] {
  const values = new Set<string>();

  const completedPath = typeof item.completedPath === 'string' ? normalizePath(item.completedPath) : '';
  const outputName = typeof item.outputName === 'string' ? normalizePath(item.outputName) : '';
  const targetDir = typeof item.targetDir === 'string' ? normalizePath(item.targetDir) : '';

  if (completedPath) values.add(completedPath);
  if (targetDir && outputName) values.add(normalizePath(`${targetDir}/${outputName}`));
  if (outputName) values.add(outputName);

  return Array.from(values);
}

export function pendingRecordingMatchesMediaItem(
  item: PendingRecordingAsset,
  mediaItem: MediaItem,
): boolean {
  const itemProject = String(mediaItem.project_name || mediaItem.project || '').trim();
  const itemSource = String(mediaItem.project_source || mediaItem.source || '').trim() || 'primary';

  if (itemProject !== item.project) return false;
  if (itemSource !== (item.source || 'primary')) return false;

  const relativePath = normalizePath(String(mediaItem.relative_path || ''));
  if (!relativePath) return false;

  const candidatePaths = pendingRecordingCandidateOutputPaths(item);
  if (!candidatePaths.length) return false;

  const relativeBase = baseName(relativePath);

  return candidatePaths.some((candidate) => (
    relativePath === candidate
    || relativeBase === baseName(candidate)
    || relativePath.endsWith(`/${baseName(candidate)}`)
  ));
}
