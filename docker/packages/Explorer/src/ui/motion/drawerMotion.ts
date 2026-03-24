import { gsap } from '../../lib/gsap';
import type { OpenCloseController } from './types';

export type DrawerMotionController = OpenCloseController & {
  setClosedState: () => void;
};

export function createDrawerMotion(drawerEl: HTMLElement, backdropEl: HTMLElement): DrawerMotionController {
  const tl = gsap.timeline({
    paused: true,
    defaults: { overwrite: 'auto' },
    onStart: () => {
      gsap.set([drawerEl, backdropEl], { pointerEvents: 'auto' });
    },
    onReverseComplete: () => {
      gsap.set(backdropEl, { autoAlpha: 0, pointerEvents: 'none' });
      gsap.set(drawerEl, { pointerEvents: 'none' });
    },
  });

  tl.fromTo(
    backdropEl,
    { autoAlpha: 0 },
    { autoAlpha: 1, duration: 0.16, ease: 'power1.out' },
    0,
  ).fromTo(
    drawerEl,
    { xPercent: 100 },
    { xPercent: 0, duration: 0.22, ease: 'power3.out' },
    0,
  );

  function open() {
    tl.play();
  }

  function close() {
    tl.reverse();
  }

  function setClosedState() {
    tl.pause(0);
    gsap.set(backdropEl, { autoAlpha: 0, pointerEvents: 'none' });
    gsap.set(drawerEl, { xPercent: 100, pointerEvents: 'none' });
  }

  function destroy() {
    tl.kill();
  }

  setClosedState();

  return { open, close, setClosedState, destroy };
}
