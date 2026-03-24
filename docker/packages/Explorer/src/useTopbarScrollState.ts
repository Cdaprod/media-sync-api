import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const TOPBAR_TOP_REVEAL_PX = 24;
const TOPBAR_REVEAL_HYSTERESIS_PX = 20;
const TOPBAR_COMPENSATION_SUPPRESS_MS = 140;

interface UseTopbarScrollStateOptions {
  disabled?: boolean;
  scrollRef: RefObject<HTMLDivElement>;
  topbarMeasuredHeight: number;
}

interface UseTopbarScrollStateResult {
  hideTopbar: () => void;
  revealTopbar: () => void;
  setTopbarHidden: (next: boolean) => void;
  suppressAutoToggle: (ms?: number) => void;
  topbarHidden: boolean;
}

export function useTopbarScrollState(
  { disabled = false, scrollRef, topbarMeasuredHeight }: UseTopbarScrollStateOptions,
): UseTopbarScrollStateResult {
  const [topbarHidden, setTopbarHiddenState] = useState(false);
  const hiddenRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const suppressAutoToggleUntilRef = useRef(0);

  const suppressAutoToggle = useCallback((ms = TOPBAR_COMPENSATION_SUPPRESS_MS) => {
    if (typeof performance !== 'undefined') {
      suppressAutoToggleUntilRef.current = performance.now() + ms;
    } else {
      suppressAutoToggleUntilRef.current = Date.now() + ms;
    }
  }, []);

  const setTopbarHidden = useCallback((next: boolean) => {
    if (hiddenRef.current === next) return;
    hiddenRef.current = next;
    setTopbarHiddenState(next);
  }, []);

  const revealTopbar = useCallback(() => {
    setTopbarHidden(false);
  }, [setTopbarHidden]);

  const hideTopbar = useCallback(() => {
    setTopbarHidden(true);
  }, [setTopbarHidden]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;

    lastScrollTopRef.current = host.scrollTop;

    if (disabled) {
      revealTopbar();
      return;
    }

    const processScroll = () => {
      scrollRafRef.current = null;
      const currentTop = Math.max(0, host.scrollTop);
      const delta = currentTop - lastScrollTopRef.current;
      lastScrollTopRef.current = currentTop;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

      if (!delta) return;
      if (now < suppressAutoToggleUntilRef.current) return;

      if (currentTop <= TOPBAR_TOP_REVEAL_PX) {
        revealTopbar();
        return;
      }

      const styles = window.getComputedStyle(host);
      const topbarGap = Number.parseFloat(styles.getPropertyValue('--topbar-gap')) || 0;
      const currentInsetPx = hiddenRef.current ? 0 : Math.max(0, topbarMeasuredHeight + topbarGap);
      const contentTopPx = currentTop - currentInsetPx;

      if (!hiddenRef.current && delta > 0 && contentTopPx >= 0) {
        hideTopbar();
        return;
      }

      if (hiddenRef.current && delta < 0 && contentTopPx <= -TOPBAR_REVEAL_HYSTERESIS_PX) {
        revealTopbar();
      }
    };

    const handleScroll = () => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = window.requestAnimationFrame(processScroll);
    };

    host.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      host.removeEventListener('scroll', handleScroll);
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [disabled, hideTopbar, revealTopbar, scrollRef, topbarMeasuredHeight]);

  return {
    hideTopbar,
    revealTopbar,
    setTopbarHidden,
    suppressAutoToggle,
    topbarHidden,
  };
}
