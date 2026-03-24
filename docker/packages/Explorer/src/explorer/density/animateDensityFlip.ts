import { Flip, gsap } from '../../lib/gsap';

export type AnimateDensityFlipOptions = {
  gridEl: HTMLElement;
  itemSelector?: string;
  commitLayout: () => void;
};

export function animateDensityFlip({
  gridEl,
  itemSelector = '.masonry-column > .asset, .masonry-column > .pending-compose-card, .list .row',
  commitLayout,
}: AnimateDensityFlipOptions): void {
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  if (!items.length) {
    commitLayout();
    return;
  }

  const state = Flip.getState(items);
  commitLayout();

  const nextItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  Flip.from(state, {
    absolute: true,
    nested: true,
    prune: true,
    scale: false,
    duration: 0.2,
    ease: 'power2.out',
    simple: true,
    onEnter: (elements) => {
      gsap.fromTo(
        elements,
        { autoAlpha: 0.6 },
        { autoAlpha: 1, duration: 0.12, ease: 'power1.out' },
      );
    },
    onComplete: () => {
      gsap.set(nextItems, { clearProps: 'transform,opacity' });
    },
  });
}
