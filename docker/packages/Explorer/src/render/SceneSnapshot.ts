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

  const cardEls = Array.from(
    gridRoot.querySelectorAll<HTMLElement>('.masonry-card[data-select-key]'),
  );

  const cards: RenderCardSnapshot[] = cardEls.slice(0, maxCards).map((el, index) => {
    const selectionKey = el.dataset.selectKey || '';
    const img = el.querySelector<HTMLImageElement>('img.asset-thumb, .thumb img, img');
    const titleNode =
      el.querySelector<HTMLElement>('[data-card-title]')
      || el.querySelector<HTMLElement>('.tile-ui-text, .t, .title');

    return {
      id: el.dataset.cardId || selectionKey || `card-${index}`,
      selectionKey,
      rect: rectOf(el),
      thumbUrl: img?.currentSrc || img?.src || undefined,
      kind: el.dataset.kind || 'unknown',
      title: titleNode?.textContent?.trim() || '',
      active: selectionKey === activeSelectionKey,
      selected: el.dataset.active === 'true',
      priority: selectionKey === activeSelectionKey ? 1000 : 100 - index,
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
      width: viewportEl.clientWidth,
      height: viewportEl.clientHeight,
      scrollTop: viewportEl.scrollTop,
    },
    target,
  };
}
