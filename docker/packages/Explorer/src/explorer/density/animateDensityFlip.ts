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
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  if (!items.length) {
    commitLayout();
    return;
  }

  const previous = activeByGrid.get(gridEl);
  if (previous) {
    previous.kill();
    gsap.set(items, { clearProps: 'transform' });
    activeByGrid.delete(gridEl);
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
      if (runIdByGrid.get(gridEl) !== nextRunId) return;
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
    });
  });
}
