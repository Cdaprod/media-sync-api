import { Flip, gsap } from '../../lib/gsap';

export type AnimateDensityFlipOptions = {
  gridEl: HTMLElement;
  itemSelector?: string;
  commitLayout: () => void;
  interactionMode?: 'scrub' | 'settle';
};

const activeByGrid = new WeakMap<HTMLElement, gsap.core.Animation>();
const runIdByGrid = new WeakMap<HTMLElement, number>();

export function animateDensityFlip({
  gridEl,
  itemSelector = '.masonry-card',
  commitLayout,
  interactionMode = 'scrub',
}: AnimateDensityFlipOptions): void {
  const clearTransforms = () => {
    const currentItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
    if (currentItems.length) {
      gsap.set(currentItems, { clearProps: 'transform' });
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
        duration: interactionMode === 'scrub' ? 0.16 : 0.24,
        ease: interactionMode === 'scrub' ? 'power2.out' : 'power2.inOut',
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
