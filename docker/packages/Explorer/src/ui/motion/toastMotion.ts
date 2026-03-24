import { gsap } from '../../lib/gsap';

export type ToastMotionController = {
  enter: (el: HTMLElement) => void;
  exit: (el: HTMLElement, onDone?: () => void) => void;
  destroy: () => void;
};

export function createToastMotion(): ToastMotionController {
  const active = new Set<gsap.core.Tween>();

  function track(tween: gsap.core.Tween) {
    active.add(tween);
    tween.eventCallback('onComplete', () => {
      active.delete(tween);
    });
    return tween;
  }

  function enter(el: HTMLElement) {
    gsap.set(el, { y: 10, autoAlpha: 0, scale: 0.985 });
    track(gsap.to(el, {
      y: 0,
      autoAlpha: 1,
      scale: 1,
      duration: 0.22,
      ease: 'power2.out',
      overwrite: 'auto',
    }));
  }

  function exit(el: HTMLElement, onDone?: () => void) {
    track(gsap.to(el, {
      y: -6,
      autoAlpha: 0,
      scale: 0.985,
      duration: 0.16,
      ease: 'power1.inOut',
      overwrite: 'auto',
      onComplete: onDone,
    }));
  }

  function destroy() {
    for (const tween of active) tween.kill();
    active.clear();
  }

  return { enter, exit, destroy };
}
