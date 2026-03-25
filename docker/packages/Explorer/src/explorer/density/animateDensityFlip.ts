import { Flip, gsap } from '../../lib/gsap';

export type AnimateDensityFlipOptions = {
  gridEl: HTMLElement;
  itemSelector?: string;
  commitLayout: () => void;
  interactionMode?: 'scrub' | 'settle';
};

const activeByGrid = new WeakMap<HTMLElement, gsap.core.Animation>();
const VISIBLE_BUFFER_PX = 280;
const MAX_ANIMATED_ITEMS = 72;

function findScrollHost(gridEl: HTMLElement): HTMLElement | null {
  return gridEl.closest('.scroll');
}

function toFiniteNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function pickVisibleAnimationTargets(
  gridEl: HTMLElement,
  allItems: HTMLElement[],
): HTMLElement[] {
  if (allItems.length <= MAX_ANIMATED_ITEMS) return allItems;
  const scrollHost = findScrollHost(gridEl);
  if (!scrollHost) return allItems.slice(0, MAX_ANIMATED_ITEMS);

  const gridTopInScroll = gridEl.offsetTop;
  const viewportTopInGrid = scrollHost.scrollTop - gridTopInScroll - VISIBLE_BUFFER_PX;
  const viewportBottomInGrid = viewportTopInGrid + scrollHost.clientHeight + (VISIBLE_BUFFER_PX * 2);
  const viewportMid = (viewportTopInGrid + viewportBottomInGrid) / 2;

  const visibleItems = allItems.filter((item) => {
    const top = toFiniteNumber(item.dataset.layoutTop);
    const bottom = toFiniteNumber(item.dataset.layoutBottom);
    if (top == null || bottom == null) return true;
    return bottom >= viewportTopInGrid && top <= viewportBottomInGrid;
  });

  if (visibleItems.length <= MAX_ANIMATED_ITEMS) return visibleItems;

  return visibleItems
    .map((item) => {
      const top = toFiniteNumber(item.dataset.layoutTop) ?? viewportMid;
      const bottom = toFiniteNumber(item.dataset.layoutBottom) ?? viewportMid;
      const mid = (top + bottom) / 2;
      return { item, distance: Math.abs(mid - viewportMid) };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, MAX_ANIMATED_ITEMS)
    .map(({ item }) => item);
}

export function animateDensityFlip({
  gridEl,
  itemSelector = '.masonry-columns > .masonry-card',
  commitLayout,
  interactionMode = 'scrub',
}: AnimateDensityFlipOptions): void {
  const allItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  if (!allItems.length) {
    commitLayout();
    return;
  }
  const items = pickVisibleAnimationTargets(gridEl, allItems);
  if (!items.length) {
    commitLayout();
    return;
  }

  const previous = activeByGrid.get(gridEl);
  if (previous) {
    previous.kill();
    activeByGrid.delete(gridEl);
  }

  Flip.killFlipsOf(items);
  gsap.killTweensOf(items);

  const state = Flip.getState(items);
  commitLayout();

  const animation = Flip.from(state, {
    targets: items,
    absolute: true,
    nested: false,
    prune: true,
    scale: false,
    duration: interactionMode === 'scrub' ? 0.14 : 0.2,
    ease: 'power2.out',
    simple: true,
    overwrite: 'auto',
    onComplete: () => {
      gsap.set(items, { clearProps: 'transform' });
      if (activeByGrid.get(gridEl) === animation) {
        activeByGrid.delete(gridEl);
      }
    },
    onInterrupt: () => {
      gsap.set(items, { clearProps: 'transform' });
      if (activeByGrid.get(gridEl) === animation) {
        activeByGrid.delete(gridEl);
      }
    },
  });

  activeByGrid.set(gridEl, animation);
}
