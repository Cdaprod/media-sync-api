import { gsap } from '../../lib/gsap';
import type { OpenCloseController } from './types';

export function createModalMotion(modalEl: HTMLElement, cardEl: HTMLElement): OpenCloseController {
  const tl = gsap.timeline({
    paused: true,
    defaults: { overwrite: 'auto' },
    onStart: () => {
      gsap.set(modalEl, { pointerEvents: 'auto' });
    },
    onReverseComplete: () => {
      gsap.set(modalEl, { pointerEvents: 'none' });
    },
  });

  tl.fromTo(
    modalEl,
    { autoAlpha: 0 },
    { autoAlpha: 1, duration: 0.16, ease: 'power1.out' },
    0,
  ).fromTo(
    cardEl,
    { y: 16, scale: 0.985, autoAlpha: 0 },
    { y: 0, scale: 1, autoAlpha: 1, duration: 0.2, ease: 'power2.out' },
    0,
  );

  return {
    open() {
      tl.play();
    },
    close(onDone?: () => void) {
      tl.eventCallback('onReverseComplete', () => {
        gsap.set(modalEl, { pointerEvents: 'none' });
        onDone?.();
      });
      tl.reverse();
    },
    destroy() {
      tl.kill();
    },
  };
}
