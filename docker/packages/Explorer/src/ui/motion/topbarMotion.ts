import { gsap } from '../../lib/gsap';
import type { Destroyable } from './types';

export type TopbarMotionController = Destroyable & {
  show: () => void;
  hide: () => void;
  isHidden: () => boolean;
  refresh: () => void;
};

export function createTopbarMotion(topbarEl: HTMLElement): TopbarMotionController {
  let tween: gsap.core.Tween | null = null;
  let hidden = false;

  function stop() {
    tween?.kill();
    tween = null;
  }

  function show() {
    hidden = false;
    stop();
    gsap.set(topbarEl, { pointerEvents: 'auto' });
    tween = gsap.to(topbarEl, {
      y: 0,
      autoAlpha: 1,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
      clearProps: 'transform',
    });
  }

  function hide() {
    hidden = true;
    stop();
    tween = gsap.to(topbarEl, {
      y: -topbarEl.offsetHeight,
      autoAlpha: 0.98,
      duration: 0.16,
      ease: 'power2.out',
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(topbarEl, { pointerEvents: 'none' });
      },
    });
  }

  function isHidden() {
    return hidden;
  }

  function refresh() {
    if (!hidden) return;
    stop();
    gsap.set(topbarEl, {
      y: -topbarEl.offsetHeight,
      autoAlpha: 0.98,
      pointerEvents: 'none',
    });
  }

  function destroy() {
    stop();
  }

  return { show, hide, isHidden, refresh, destroy };
}
