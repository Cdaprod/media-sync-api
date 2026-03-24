import { gsap } from '../../lib/gsap';
import type { OpenCloseController } from './types';

export type DrawerPresentationMode = 'side' | 'sheet';

export type DrawerMotionController = OpenCloseController & {
  setClosedState: () => void;
  syncLayoutMode: () => void;
};

export type DrawerMotionOptions = {
  getMode: () => DrawerPresentationMode;
};

export function createDrawerMotion(
  drawerEl: HTMLElement,
  backdropEl: HTMLElement,
  options: DrawerMotionOptions,
): DrawerMotionController {
  const { getMode } = options;
  let mode = getMode();

  const applyClosedTransform = () => {
    if (mode === 'sheet') {
      gsap.set(drawerEl, { xPercent: 0, yPercent: 110 });
      return;
    }
    gsap.set(drawerEl, { yPercent: 0, xPercent: 100 });
  };

  const tl = gsap.timeline({
    paused: true,
    defaults: { overwrite: 'auto' },
    onStart: () => {
      gsap.set([drawerEl, backdropEl], { pointerEvents: 'auto' });
    },
    onReverseComplete: () => {
      gsap.set(backdropEl, { autoAlpha: 0, pointerEvents: 'none' });
      gsap.set(drawerEl, { pointerEvents: 'none' });
      applyClosedTransform();
    },
  });

  const rebuildTimelineForMode = () => {
    mode = getMode();
    tl.clear();

    tl.fromTo(
      backdropEl,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.16, ease: 'power1.out' },
      0,
    );

    if (mode === 'sheet') {
      tl.fromTo(
        drawerEl,
        { yPercent: 110, xPercent: 0 },
        { yPercent: 0, xPercent: 0, duration: 0.22, ease: 'power3.out' },
        0,
      );
      return;
    }

    tl.fromTo(
      drawerEl,
      { xPercent: 100, yPercent: 0 },
      { xPercent: 0, yPercent: 0, duration: 0.22, ease: 'power3.out' },
      0,
    );
  };

  rebuildTimelineForMode();

  function open() {
    syncLayoutMode();
    tl.play(0);
  }

  function close(onDone?: () => void) {
    syncLayoutMode();
    tl.eventCallback('onReverseComplete', () => {
      gsap.set(backdropEl, { autoAlpha: 0, pointerEvents: 'none' });
      gsap.set(drawerEl, { pointerEvents: 'none' });
      applyClosedTransform();
      onDone?.();
    });
    tl.reverse();
  }

  function setClosedState() {
    syncLayoutMode();
    tl.pause(0);
    gsap.set(backdropEl, { autoAlpha: 0, pointerEvents: 'none' });
    gsap.set(drawerEl, { pointerEvents: 'none' });
    applyClosedTransform();
  }

  function syncLayoutMode() {
    const next = getMode();
    if (next === mode) return;
    mode = next;
    rebuildTimelineForMode();
  }

  function destroy() {
    tl.kill();
  }

  setClosedState();

  return { open, close, setClosedState, syncLayoutMode, destroy };
}
