import { animateDensityFlip } from './animateDensityFlip';
import { clampColumnCount } from './getColumnCount';

/**
 * Explorer density authority contract:
 * - Masonry layout is always authoritative.
 * - Controller synchronously commits `--masonry-column-count` on the real grid node.
 * - Slider scrub is continuous input, but layout commits happen at discrete column thresholds.
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

const DENSITY_STEP_HYSTERESIS = 0.55;

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

  const clampToRange = (value: number) => Math.max(minColumns, Math.min(maxColumns, value));

  const commitLayoutColumns = (nextColumns: number) => {
    currentColumns = clampColumnCount(clampToRange(nextColumns));
    scrubValue = currentColumns;
    gridEl.style.setProperty('--masonry-column-count', String(currentColumns));
    gridEl.dataset.columns = String(currentColumns);
    sliderEl.value = String(currentColumns);
    onColumnsCommit(currentColumns);
  };

  function setColumns(nextColumns: number, animated = true) {
    const clamped = clampColumnCount(clampToRange(nextColumns));
    if (clamped === currentColumns) return;

    if (animated) {
      animateDensityFlip({
        gridEl,
        commitLayout: () => commitLayoutColumns(clamped),
      });
      return;
    }

    commitLayoutColumns(clamped);
  }

  function scrubTo(nextValue: number) {
    const clampedValue = clampToRange(nextValue);
    scrubValue = clampedValue;

    // keep native thumb movement smooth even with fractional drag values
    sliderEl.value = String(clampedValue);

    let nextColumns = currentColumns;
    while (clampedValue >= nextColumns + DENSITY_STEP_HYSTERESIS && nextColumns < maxColumns) {
      nextColumns += 1;
    }
    while (clampedValue <= nextColumns - DENSITY_STEP_HYSTERESIS && nextColumns > minColumns) {
      nextColumns -= 1;
    }

    if (nextColumns !== currentColumns) {
      setColumns(nextColumns, true);
    }
  }

  function settleScrub() {
    sliderEl.value = String(currentColumns);
    scrubValue = currentColumns;
  }

  function destroy() {
    gridEl.style.removeProperty('will-change');
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
