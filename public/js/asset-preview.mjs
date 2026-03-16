/**
 * Preview module intake shim.
 *
 * Example:
 *   import { PREVIEW_ACTIONS, getPreviewActionVisibility } from './asset-preview.mjs';
 */
export const PREVIEW_ACTIONS = Object.freeze({
  play: 'play',
  copy: 'copy',
  tag: 'tag',
  obs: 'obs',
  delete: 'delete',
  compose: 'compose',
});

export function normalizePreviewKind(kind) {
  return String(kind || '').toLowerCase();
}

export function buildPreviewMediaDescriptor(item = {}, kind = '') {
  const normalizedKind = normalizePreviewKind(kind);
  const streamUrl = String(item.stream_url || item.streamUrl || '');
  const thumbUrl = String(item.thumb_url || item.thumbnail_url || '');
  const source = normalizedKind === 'image' ? (streamUrl || thumbUrl) : streamUrl;
  const title = String(item.relative_path || 'unnamed').split('/').pop() || 'unnamed';
  return {
    kind: normalizedKind,
    source,
    title,
  };
}

export function getPreviewActionVisibility(kind) {
  const normalized = normalizePreviewKind(kind);
  return {
    showPlay: normalized === 'video' || normalized === 'audio',
  };
}
