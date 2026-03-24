import { gsap } from '../../lib/gsap';
import type { Destroyable } from './types';

export type TopbarSnapBandOptions = {
  scroller: HTMLElement;
  getTopbarOpen: () => boolean;
  getTopbarClearance: () => number;
  thresholdPx?: number;
  minVelocityPxPerFrame?: number;
};

export type TopbarSnapBandController = Destroyable & {
  notifyPointerDown: () => void;
  notifyPointerUp: () => void;
  notifyScroll: () => void;
  cancel: () => void;
};

export function createTopbarSnapBand(options: TopbarSnapBandOptions): TopbarSnapBandController {
  const {
    scroller,
    getTopbarOpen,
    getTopbarClearance,
    thresholdPx = 10,
    minVelocityPxPerFrame = 1.25,
  } = options;

  let isPointerDown = false;
  let settleTween: gsap.core.Tween | null = null;
  let rafId = 0;
  let lastScrollTop = scroller.scrollTop;
  let lastVelocity = 0;

  function cancel() {
    settleTween?.kill();
    settleTween = null;
  }

  function currentTarget() {
    return getTopbarOpen() ? getTopbarClearance() : 0;
  }

  function withinSnapBand(target: number) {
    return Math.abs(scroller.scrollTop - target) <= thresholdPx;
  }

  function lowVelocity() {
    return Math.abs(lastVelocity) <= minVelocityPxPerFrame;
  }

  function settleIfNeeded() {
    rafId = 0;
    if (isPointerDown) return;

    const target = currentTarget();
    if (!withinSnapBand(target)) return;
    if (!lowVelocity()) return;

    cancel();
    settleTween = gsap.to(scroller, {
      scrollTop: target,
      duration: 0.14,
      ease: 'power2.out',
      overwrite: 'auto',
      onComplete: () => {
        settleTween = null;
      },
    });
  }

  function queueSettleCheck() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(settleIfNeeded);
  }

  function notifyPointerDown() {
    isPointerDown = true;
    cancel();
  }

  function notifyPointerUp() {
    isPointerDown = false;
    queueSettleCheck();
  }

  function notifyScroll() {
    const next = scroller.scrollTop;
    lastVelocity = next - lastScrollTop;
    lastScrollTop = next;

    if (!isPointerDown) {
      queueSettleCheck();
    }
  }

  function destroy() {
    cancel();
    if (rafId) cancelAnimationFrame(rafId);
  }

  return {
    notifyPointerDown,
    notifyPointerUp,
    notifyScroll,
    cancel,
    destroy,
  };
}
