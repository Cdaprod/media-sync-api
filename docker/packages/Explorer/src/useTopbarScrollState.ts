import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const TOPBAR_TOP_REVEAL_PX = 24;
const TOPBAR_HIDE_START_PX = 72;
const TOPBAR_HIDE_DELTA_PX = 20;
const TOPBAR_REVEAL_DELTA_PX = 16;

interface UseTopbarScrollStateOptions {
  disabled?: boolean;
  scrollRef: RefObject<HTMLDivElement>;
}

interface UseTopbarScrollStateResult {
  hideTopbar: () => void;
  revealTopbar: () => void;
  setTopbarHidden: (next: boolean) => void;
  topbarHidden: boolean;
}

export function useTopbarScrollState(
  { disabled = false, scrollRef }: UseTopbarScrollStateOptions,
): UseTopbarScrollStateResult {
  const [topbarHidden, setTopbarHiddenState] = useState(false);
  const hiddenRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollDeltaBudgetRef = useRef(0);

  const setTopbarHidden = useCallback((next: boolean) => {
    if (hiddenRef.current === next) return;
    hiddenRef.current = next;
    setTopbarHiddenState(next);
  }, []);

  const revealTopbar = useCallback(() => {
    scrollDeltaBudgetRef.current = 0;
    setTopbarHidden(false);
  }, [setTopbarHidden]);

  const hideTopbar = useCallback(() => {
    scrollDeltaBudgetRef.current = 0;
    setTopbarHidden(true);
  }, [setTopbarHidden]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;

    lastScrollTopRef.current = host.scrollTop;
    scrollDeltaBudgetRef.current = 0;

    if (disabled) {
      revealTopbar();
      return;
    }

    const processScroll = () => {
      scrollRafRef.current = null;
      const currentTop = Math.max(0, host.scrollTop);
      const delta = currentTop - lastScrollTopRef.current;
      lastScrollTopRef.current = currentTop;

      if (!delta) return;
      scrollDeltaBudgetRef.current += delta;

      if (currentTop <= TOPBAR_TOP_REVEAL_PX) {
        revealTopbar();
        return;
      }

      if (scrollDeltaBudgetRef.current >= TOPBAR_HIDE_DELTA_PX && currentTop > TOPBAR_HIDE_START_PX) {
        hideTopbar();
        return;
      }

      if (scrollDeltaBudgetRef.current <= -TOPBAR_REVEAL_DELTA_PX) {
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
  }, [disabled, hideTopbar, revealTopbar, scrollRef]);

  return {
    hideTopbar,
    revealTopbar,
    setTopbarHidden,
    topbarHidden,
  };
}
