import { Flip, gsap } from '../../lib/gsap';

export type AnimateDensityFlipOptions = {
  gridEl: HTMLElement;
  itemSelector?: string;
  commitLayout: () => void;
  interactionMode?: 'scrub' | 'settle';
};

const activeByGrid = new WeakMap<HTMLElement, gsap.core.Animation>();

export function animateDensityFlip({
  gridEl,
  itemSelector = '.masonry-columns > .masonry-card',
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
