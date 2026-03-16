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

export function getPreviewActionVisibility(kind) {
  const normalized = String(kind || '').toLowerCase();
  return {
    showPlay: normalized === 'video' || normalized === 'audio',
  };
}
