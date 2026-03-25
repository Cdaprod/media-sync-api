import { animateDensityFlip } from './animateDensityFlip';

/**
 * Explorer density authority contract:
 * - Masonry layout is always authoritative.
 * - Controller synchronously commits `--masonry-column-count` on the real grid node.
 * - Scrub path is direct-manipulation: latest finger position commits immediately.
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
  sliderEl?: HTMLInputElement | null;
  initialColumns: number;
  onColumnsCommit: (columns: number) => void;
  minColumns: number;
  maxColumns: number;
};

function clampColumns(value: number, minColumns: number, maxColumns: number): number {
  if (!Number.isFinite(value)) return minColumns;
  return Math.max(minColumns, Math.min(maxColumns, Math.round(value)));
}

export function createExplorerDensityController(options: ExplorerDensityControllerOptions): ExplorerDensityController {
  const {
    gridEl,
    sliderEl,
    initialColumns,
    onColumnsCommit,
    minColumns,
    maxColumns,
  } = options;

  let currentColumns = clampColumns(initialColumns, minColumns, maxColumns);
  let scrubValue = currentColumns;
  let destroyed = false;

  const commitLayoutColumns = (nextColumns: number) => {
    currentColumns = clampColumns(nextColumns, minColumns, maxColumns);
    scrubValue = currentColumns;
    gridEl.style.setProperty('--masonry-column-count', String(currentColumns));
    gridEl.dataset.columns = String(currentColumns);
    if (sliderEl) sliderEl.value = String(currentColumns);
    onColumnsCommit(currentColumns);
  };

  const runAnimatedCommit = (nextColumns: number, interactionMode: 'scrub' | 'settle') => {
    const safeColumns = clampColumns(nextColumns, minColumns, maxColumns);
    if (safeColumns === currentColumns) return;
    currentColumns = safeColumns;
    animateDensityFlip({
      gridEl,
      interactionMode,
      commitLayout: () => {
        commitLayoutColumns(safeColumns);
      },
    });
  };

  function setColumns(nextColumns: number, animated = true) {
    if (destroyed) return;
    const safeColumns = clampColumns(nextColumns, minColumns, maxColumns);
    if (safeColumns === currentColumns) return;

    if (!animated) {
      commitLayoutColumns(safeColumns);
      return;
    }

    runAnimatedCommit(safeColumns, 'settle');
  }

  function scrubTo(nextValue: number) {
    if (destroyed) return;
    const safeColumns = clampColumns(nextValue, minColumns, maxColumns);
    scrubValue = safeColumns;
    if (sliderEl) sliderEl.value = String(safeColumns);
    if (safeColumns === currentColumns) return;
    runAnimatedCommit(safeColumns, 'scrub');
  }

  function settleScrub() {
    if (destroyed) return;
    if (sliderEl) sliderEl.value = String(currentColumns);
    scrubValue = currentColumns;
  }

  function destroy() {
    destroyed = true;
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
