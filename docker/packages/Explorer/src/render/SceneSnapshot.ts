import type { FocusSceneSnapshot, RenderCardSnapshot, CameraTarget } from './renderTypes';

function rectOf(el: Element) {
  const r = (el as HTMLElement).getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  };
}

export function captureFocusSceneSnapshot(args: {
  gridRoot: HTMLElement;
  viewportEl: HTMLElement;
  activeSelectionKey?: string | null;
  maxCards?: number;
}): FocusSceneSnapshot {
  const { gridRoot, viewportEl, activeSelectionKey = null, maxCards = 24 } = args;
  const viewportRect = viewportEl.getBoundingClientRect();
  const bufferPx = 240;
  const inBufferedViewport = (rect: { top: number; left: number; width: number; height: number }) => {
    const bottom = rect.top + rect.height;
    const right = rect.left + rect.width;
    return bottom >= (viewportRect.top - bufferPx)
      && rect.top <= (viewportRect.bottom + bufferPx)
      && right >= (viewportRect.left - bufferPx)
      && rect.left <= (viewportRect.right + bufferPx);
  };

  const cardEls = Array.from(
    gridRoot.querySelectorAll<HTMLElement>('.masonry-card[data-select-key]'),
  );

  const prioritizedEls = activeSelectionKey
    ? cardEls.sort((a, b) => {
      const aActive = (a.dataset.selectKey || '') === activeSelectionKey ? 1 : 0;
      const bActive = (b.dataset.selectKey || '') === activeSelectionKey ? 1 : 0;
      return bActive - aActive;
    })
    : cardEls;
  const focusedWindowEls = prioritizedEls.filter((el) => {
    const rect = rectOf(el);
    const key = el.dataset.selectKey || '';
    return key === activeSelectionKey || inBufferedViewport(rect);
  });

  let sampledEls = focusedWindowEls.slice(0, maxCards);
  if (activeSelectionKey) {
    const activeEl = focusedWindowEls.find((el) => (el.dataset.selectKey || '') === activeSelectionKey) || null;
    if (activeEl) {
      const activeRect = rectOf(activeEl);
      const activeCenterX = activeRect.left + (activeRect.width / 2);
      const activeCenterY = activeRect.top + (activeRect.height / 2);
      const ambientNeighborLimit = Math.min(Math.max(0, maxCards - 1), 8);
      const neighbors = focusedWindowEls
        .filter((el) => el !== activeEl)
        .sort((a, b) => {
          const ar = rectOf(a);
          const br = rectOf(b);
          const adx = (ar.left + (ar.width / 2)) - activeCenterX;
          const ady = (ar.top + (ar.height / 2)) - activeCenterY;
          const bdx = (br.left + (br.width / 2)) - activeCenterX;
          const bdy = (br.top + (br.height / 2)) - activeCenterY;
          return (adx * adx + ady * ady) - (bdx * bdx + bdy * bdy);
        })
        .slice(0, ambientNeighborLimit);
      sampledEls = [activeEl, ...neighbors];
    }
  }

  const cards: RenderCardSnapshot[] = sampledEls.map((el, index) => {
    const selectionKey = el.dataset.selectKey || '';
    const img = el.querySelector<HTMLImageElement>('img.asset-thumb, .thumb img, img');
    const titleNode =
      el.querySelector<HTMLElement>('[data-card-title]')
      || el.querySelector<HTMLElement>('.tile-ui-text, .t, .title');

    return {
      id: el.dataset.cardId || selectionKey || `card-${index}`,
      selectionKey,
      rect: rectOf(el),
      thumbUrl: img?.currentSrc || img?.src || img?.dataset.thumbUrl || img?.dataset.thumbFallback || undefined,
      mediaUrl: el.dataset.streamUrl || undefined,
      kind: el.dataset.kind || 'unknown',
      title: titleNode?.textContent?.trim() || '',
      active: selectionKey === activeSelectionKey,
      selected: el.dataset.active === 'true',
      priority: selectionKey === activeSelectionKey ? 2000 : 100 - index,
    };
  });

  let target: CameraTarget | null = null;
  if (activeSelectionKey) {
    const targetEl = gridRoot.querySelector<HTMLElement>(
      `.masonry-card[data-select-key="${CSS.escape(activeSelectionKey)}"]`,
    );
    if (targetEl) {
      const r = targetEl.getBoundingClientRect();
      target = {
        selectionKey: activeSelectionKey,
        centerX: r.left + r.width / 2,
        centerY: r.top + r.height / 2,
        width: r.width,
        height: r.height,
      };
    }
  }

  return {
    cards,
    viewport: {
      left: viewportRect.left,
      top: viewportRect.top,
      width: viewportEl.clientWidth,
      height: viewportEl.clientHeight,
      scrollTop: viewportEl.scrollTop,
    },
    target,
  };
}
