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
  itemSelector = '.masonry-column > .asset, .masonry-column > .pending-compose-card, .list .row',
  commitLayout,
  interactionMode = 'scrub',
}: AnimateDensityFlipOptions): void {
  const previous = activeByGrid.get(gridEl);
  if (previous) {
    previous.kill();
    activeByGrid.delete(gridEl);
  }

  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  if (!items.length) {
    commitLayout();
    return;
  }

  const state = Flip.getState(items);
  commitLayout();

  const nextItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  const animation = Flip.from(state, {
    absolute: true,
    nested: true,
    prune: true,
    scale: false,
    duration: interactionMode === 'scrub' ? 0.085 : 0.16,
    ease: 'power2.out',
    simple: true,
    overwrite: 'auto',
    onEnter: (elements) => {
      gsap.fromTo(
        elements,
        { autoAlpha: 0.74 },
        { autoAlpha: 1, duration: 0.09, ease: 'power1.out', overwrite: 'auto' },
      );
    },
    onComplete: () => {
      gsap.set(nextItems, { clearProps: 'transform,opacity' });
      if (activeByGrid.get(gridEl) === animation) {
        activeByGrid.delete(gridEl);
      }
    },
    onInterrupt: () => {
      gsap.set(nextItems, { clearProps: 'transform,opacity' });
      if (activeByGrid.get(gridEl) === animation) {
        activeByGrid.delete(gridEl);
      }
    },
  });

  activeByGrid.set(gridEl, animation);
}
