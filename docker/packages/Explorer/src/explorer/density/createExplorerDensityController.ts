import { animateDensityFlip } from './animateDensityFlip';
import { clampColumnCount } from './getColumnCount';

/**
 * Explorer density authority contract:
 * - Masonry layout is always authoritative.
 * - Controller synchronously commits `--masonry-column-count` on the real grid node.
 * - Slider scrub is continuous input; commits are latest-value-wins at frame cadence.
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
  let previousScrubValue = currentColumns;
  let rafId = 0;
  let latestRequestedColumns: number | null = null;
  let frameCommittedColumns: number | null = null;

  const clampToRange = (value: number) => Math.max(minColumns, Math.min(maxColumns, value));

  const valueToColumnCount = (nextValue: number) => {
    if (nextValue > previousScrubValue) return Math.floor(nextValue + 1e-6);
    if (nextValue < previousScrubValue) return Math.ceil(nextValue - 1e-6);
    return Math.round(nextValue);
  };

  const commitLayoutColumns = (nextColumns: number) => {
    currentColumns = clampColumnCount(clampToRange(nextColumns));
    scrubValue = currentColumns;
    gridEl.style.setProperty('--masonry-column-count', String(currentColumns));
    gridEl.dataset.columns = String(currentColumns);
    sliderEl.value = String(currentColumns);
    onColumnsCommit(currentColumns);
  };

  const commitColumns = (
    nextColumns: number,
    animated = true,
    interactionMode: 'scrub' | 'settle' = 'scrub',
  ) => {
    const clamped = clampColumnCount(clampToRange(nextColumns));
    if (clamped === currentColumns) return;

    if (animated) {
      animateDensityFlip({
        gridEl,
        commitLayout: () => commitLayoutColumns(clamped),
        interactionMode,
      });
      return;
    }

    commitLayoutColumns(clamped);
  };

  function setColumns(nextColumns: number, animated = true) {
    commitColumns(nextColumns, animated, 'settle');
  }

  const flushLatestCommit = () => {
    rafId = 0;
    if (latestRequestedColumns == null) return;
    const target = latestRequestedColumns;
    if (target === frameCommittedColumns) return;
    latestRequestedColumns = null;
    frameCommittedColumns = target;
    if (target !== currentColumns) {
      commitColumns(target, true, 'scrub');
    }
  };

  const requestLatestCommit = (nextColumns: number) => {
    latestRequestedColumns = clampColumnCount(clampToRange(nextColumns));
    if (rafId) return;
    rafId = requestAnimationFrame(flushLatestCommit);
  };

  function scrubTo(nextValue: number) {
    const clampedValue = clampToRange(nextValue);
    scrubValue = clampedValue;
    sliderEl.value = String(clampedValue);
    const nextColumns = valueToColumnCount(clampedValue);
    requestLatestCommit(nextColumns);
    previousScrubValue = clampedValue;
  }

  function settleScrub() {
    frameCommittedColumns = null;
    if (latestRequestedColumns != null && latestRequestedColumns !== currentColumns) {
      commitColumns(latestRequestedColumns, true, 'settle');
      latestRequestedColumns = null;
    }
    sliderEl.value = String(currentColumns);
    scrubValue = currentColumns;
    previousScrubValue = currentColumns;
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
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
