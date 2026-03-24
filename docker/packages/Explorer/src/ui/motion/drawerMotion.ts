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
  let tween: gsap.core.Tween | null = null;

  const stop = () => {
    tween?.kill();
    tween = null;
  };

  const closedVector = () => {
    const rect = drawerEl.getBoundingClientRect();
    const width = Math.max(rect.width, window.innerWidth * 0.65);
    const height = Math.max(rect.height, window.innerHeight * 0.65);
    if (mode === 'sheet') {
      return { x: 0, y: height + 24 };
    }
    return { x: width + 24, y: 0 };
  };

  const activateBackdrop = () => {
    gsap.set(backdropEl, { autoAlpha: 1, pointerEvents: 'auto' });
  };

  const deactivateBackdrop = () => {
    gsap.set(backdropEl, { autoAlpha: 0, pointerEvents: 'none' });
  };

  function open() {
    syncLayoutMode();
    stop();
    activateBackdrop();
    gsap.set(drawerEl, { pointerEvents: 'auto', zIndex: 80 });
    tween = gsap.to(drawerEl, {
      x: 0,
      y: 0,
      duration: 0.18,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  }

  function close(onDone?: () => void) {
    syncLayoutMode();
    stop();
    const closed = closedVector();
    tween = gsap.to(drawerEl, {
      x: closed.x,
      y: closed.y,
      duration: 0.16,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(drawerEl, { pointerEvents: 'none' });
        deactivateBackdrop();
        onDone?.();
      },
    });
  }

  function setClosedState() {
    syncLayoutMode();
    stop();
    const closed = closedVector();
    gsap.set(drawerEl, {
      x: closed.x,
      y: closed.y,
      pointerEvents: 'none',
      zIndex: 80,
    });
    deactivateBackdrop();
  }

  function syncLayoutMode() {
    const next = getMode();
    if (next === mode) return;
    mode = next;
    const closed = closedVector();
    gsap.set(drawerEl, { x: closed.x, y: closed.y });
  }

  function destroy() {
    stop();
  }

  setClosedState();

  return { open, close, setClosedState, syncLayoutMode, destroy };
}
