import { Flip, gsap } from '../../lib/gsap';
import { addBubblySettle } from './addBubblySettle';

export type AnimateDensityFlipOptions = {
  gridEl: HTMLElement;
  itemSelector?: string;
  commitLayout: () => void;
};

export function animateDensityFlip({
  gridEl,
  itemSelector = '.asset, .row, .pending-compose-card',
  commitLayout,
}: AnimateDensityFlipOptions): void {
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  if (!items.length) {
    commitLayout();
    return;
  }

  const state = Flip.getState(items);
  commitLayout();
  const visibleItems = Array.from(gridEl.querySelectorAll<HTMLElement>(itemSelector));
  Flip.from(state, {
    absolute: false,
    nested: true,
    prune: true,
    scale: true,
    duration: 0.32,
    ease: 'power2.out',
    simple: false,
    onEnter: (elements) => {
      gsap.fromTo(
        elements,
        { autoAlpha: 0, scale: 0.98 },
        { autoAlpha: 1, scale: 1, duration: 0.18, ease: 'power2.out' },
      );
    },
    onComplete: () => {
      gsap.set(visibleItems, { clearProps: 'transform' });
      void addBubblySettle(visibleItems);
    },
  });
}
