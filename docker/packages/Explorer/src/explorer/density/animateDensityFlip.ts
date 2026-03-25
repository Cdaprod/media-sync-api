import { Flip, gsap } from '../../lib/gsap';

export type AnimateDensityFlipOptions = {
  gridEl: HTMLElement;
  itemSelector?: string;
  commitLayout: () => void;
  interactionMode?: 'scrub' | 'settle';
  jumpDistance?: number;
};

const activeByGrid = new WeakMap<HTMLElement, gsap.core.Animation>();
const runIdByGrid = new WeakMap<HTMLElement, number>();

export function animateDensityFlip({
  gridEl,
  itemSelector = '.masonry-card',
  commitLayout,
  interactionMode = 'scrub',
  jumpDistance = 1,
}: AnimateDensityFlipOptions): void {
  const clearTransforms = () => {
    const currentItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
    if (currentItems.length) {
      gsap.set(currentItems, { clearProps: 'transform' });
      for (const card of currentItems) {
        card.style.transition = 'none';
        card.style.transform = 'none';
      }
      queueMicrotask(() => {
        for (const card of currentItems) {
          card.style.removeProperty('transition');
        }
      });
    }
  };

  const previous = activeByGrid.get(gridEl);
  if (previous) {
    previous.kill();
    activeByGrid.delete(gridEl);
  }

  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  if (!items.length) {
    const applyCommit = commitLayout;
    applyCommit();
    clearTransforms();
    return;
  }

  Flip.killFlipsOf(items);
  gsap.killTweensOf(items);
  gsap.set(items, { clearProps: 'transform' });

  const state = Flip.getState(items);
  const nextRunId = (runIdByGrid.get(gridEl) ?? 0) + 1;
  runIdByGrid.set(gridEl, nextRunId);
  commitLayout();

  window.requestAnimationFrame(() => {
      if (runIdByGrid.get(gridEl) !== nextRunId) return;
    window.requestAnimationFrame(() => {
      if (runIdByGrid.get(gridEl) !== nextRunId) {
        clearTransforms();
        return;
      }
      const animation = Flip.from(state, {
        targets: items,
        absolute: false,
        nested: false,
        prune: false,
        scale: true,
        duration: interactionMode === 'scrub'
          ? (jumpDistance >= 2 ? 0.14 : 0.18)
          : (jumpDistance >= 2 ? 0.2 : 0.26),
        ease: interactionMode === 'scrub'
          ? (jumpDistance >= 2 ? 'power3.out' : 'power2.out')
          : (jumpDistance >= 2 ? 'power2.out' : 'power2.inOut'),
        simple: true,
        overwrite: true,
        onComplete: () => {
          clearTransforms();
          if (activeByGrid.get(gridEl) === animation) {
            activeByGrid.delete(gridEl);
          }
        },
        onInterrupt: () => {
          clearTransforms();
          if (activeByGrid.get(gridEl) === animation) {
            activeByGrid.delete(gridEl);
          }
        },
      });

      activeByGrid.set(gridEl, animation);
    });
  });
}
