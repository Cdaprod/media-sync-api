import { gsap } from '../../lib/gsap';
import { animateDensityFlip } from './animateDensityFlip';
import { clampColumnCount } from './getColumnCount';

/**
 * Explorer density authority contract:
 * - Controller owns immediate committed layout (`--masonry-column-count` on the live grid element).
 * - React state mirrors committed columns for labels/derived render math.
 * - Scrub state is visual-only live feedback and is not an independent layout source.
 */
export type ExplorerDensityController = {
  getColumns: () => number;
  getScrubValue: () => number;
  setColumns: (nextColumns: number, animated?: boolean) => void;
  scrubTo: (nextValue: number) => void;
  settleScrub: () => void;
  destroy: () => void;
};

export type ExplorerDensityControllerOptions = {
  gridEl: HTMLElement;
  sliderEl: HTMLInputElement;
  initialColumns: number;
  onColumnsCommit: (columns: number) => void;
  minColumns: number;
  maxColumns: number;
};

const SCRUB_SCALE_PER_STEP = 0.035;

export function createExplorerDensityController(options: ExplorerDensityControllerOptions): ExplorerDensityController {
  const {
    gridEl,
    sliderEl,
    initialColumns,
    onColumnsCommit,
    minColumns,
    maxColumns,
  } = options;

  let currentColumns = clampColumnCount(initialColumns);
  let scrubValue = currentColumns;
  let liveTween: gsap.core.Tween | null = null;
  const setScale = gsap.quickSetter(gridEl, 'scale');

  const scaleForScrubValue = (value: number) => {
    const centeredDelta = value - currentColumns;
    return gsap.utils.clamp(0.86, 1.18, 1 - centeredDelta * SCRUB_SCALE_PER_STEP);
  };

  const commitLayoutColumns = (nextColumns: number) => {
    currentColumns = clampColumnCount(nextColumns);
    scrubValue = currentColumns;
    gridEl.style.setProperty('--masonry-column-count', String(currentColumns));
    gridEl.dataset.columns = String(currentColumns);
    sliderEl.value = String(currentColumns);
    onColumnsCommit(currentColumns);
  };

  const applyLiveScrubScale = (nextValue: number) => {
    setScale(scaleForScrubValue(nextValue));
  };

  function setColumns(nextColumns: number, animated = true) {
    const clamped = gsap.utils.clamp(minColumns, maxColumns, clampColumnCount(nextColumns));
    if (clamped === currentColumns) {
      settleScrub();
      return;
    }

    if (animated) {
      animateDensityFlip({
        gridEl,
        commitLayout: () => commitLayoutColumns(clamped),
      });
      settleScrub();
      return;
    }

    commitLayoutColumns(clamped);
    settleScrub();
  }

  function scrubTo(nextValue: number) {
    const clampedValue = gsap.utils.clamp(minColumns, maxColumns, nextValue);
    scrubValue = clampedValue;
    sliderEl.value = String(clampedValue);
    applyLiveScrubScale(clampedValue);

    const nearestStep = Math.round(clampedValue);
    if (nearestStep !== currentColumns) {
      setColumns(nearestStep, true);
      return;
    }

    const distanceToStep = Math.abs(clampedValue - nearestStep);
    if (distanceToStep < 0.18) {
      liveTween?.kill();
      liveTween = gsap.to(gridEl, {
        scale: 1,
        duration: 0.12,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
  }

  function settleScrub() {
    liveTween?.kill();
    liveTween = gsap.to(gridEl, {
      scale: 1,
      duration: 0.16,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }

  function destroy() {
    liveTween?.kill();
    gsap.set(gridEl, { clearProps: 'transform' });
  }

  commitLayoutColumns(currentColumns);

  return {
    getColumns: () => currentColumns,
    getScrubValue: () => scrubValue,
    setColumns,
    scrubTo,
    settleScrub,
    destroy,
  };
}
