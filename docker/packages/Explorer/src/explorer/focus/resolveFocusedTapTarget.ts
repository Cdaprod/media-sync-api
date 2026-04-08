/**
 * Focused retarget contract:
 * - visible ambient proxy cards must remain direct hit targets
 * - proxy surface/world wrappers must not own primary pointer hits
 * - asset tap => retarget
 * - true empty space => close
 */
export type FocusedTapHitKind =
  | 'proxy-card-root'
  | 'proxy-card-child'
  | 'proxy-surface'
  | 'body'
  | 'other';

export type FocusedTapResolution = {
  kind: FocusedTapHitKind;
  proxyCardEl: HTMLElement | null;
  selectionKey: string;
};

export function resolveFocusedTapTarget(target: HTMLElement | null): FocusedTapResolution {
  if (!target) {
    return { kind: 'other', proxyCardEl: null, selectionKey: '' };
  }
  const proxyCardEl = target.closest<HTMLElement>('.proxy-render-card[data-selection-key]');
  if (proxyCardEl) {
    const selectionKey = proxyCardEl.dataset.selectionKey || '';
    return {
      kind: target === proxyCardEl ? 'proxy-card-root' : 'proxy-card-child',
      proxyCardEl,
      selectionKey,
    };
  }
  if (target.classList.contains('proxy-render-surface')) {
    return { kind: 'proxy-surface', proxyCardEl: null, selectionKey: '' };
  }
  if (target === document.body) {
    return { kind: 'body', proxyCardEl: null, selectionKey: '' };
  }
  return { kind: 'other', proxyCardEl: null, selectionKey: '' };
}
