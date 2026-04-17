import { useCallback, useEffect, useRef, useState } from 'react';

const TOPBAR_REVEAL_HYSTERESIS_PX = 20;
const TOPBAR_COMPENSATION_SUPPRESS_MS = 140;

interface UseTopbarScrollStateOptions {
  disabled?: boolean;
  scrollEl: HTMLDivElement | null;
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
  { disabled = false, scrollEl, topbarMeasuredHeight }: UseTopbarScrollStateOptions,
): UseTopbarScrollStateResult {
  const [topbarHidden, setTopbarHiddenState] = useState(false);
  const hiddenRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const suppressAutoToggleUntilRef = useRef(0);

  const suppressAutoToggle = useCallback((ms = TOPBAR_COMPENSATION_SUPPRESS_MS) => {
    if (scrollHostRef.current) {
      lastScrollTopRef.current = Math.max(0, scrollHostRef.current.scrollTop);
    }
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
    const host = scrollEl;
    if (!host) return;
    scrollHostRef.current = host;

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

      const getOpenInsetPx = () => {
        const styles = window.getComputedStyle(host);
        const topbarGap = Number.parseFloat(styles.getPropertyValue('--topbar-gap')) || 0;
        return Math.max(0, topbarMeasuredHeight + topbarGap);
      };
      const openInsetPx = getOpenInsetPx();
      const currentInsetPx = openInsetPx;
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
      if (scrollHostRef.current === host) {
        scrollHostRef.current = null;
      }
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [disabled, hideTopbar, revealTopbar, scrollEl, topbarMeasuredHeight]);

  return {
    hideTopbar,
    revealTopbar,
    setTopbarHidden,
    suppressAutoToggle,
    topbarHidden,
  };
}
