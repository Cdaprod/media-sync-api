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
  let coalesceTimer = 0;
  let latestRequestedColumns: number | null = null;
  let lastScrubAt = 0;
  let lastScrubValue = currentColumns;
  const FAST_SCRUB_DELTA = 0.42;
  const FAST_SCRUB_WINDOW_MS = 48;
  const FAST_SCRUB_COALESCE_MS = 34;

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
    latestRequestedColumns = null;
    if (target !== currentColumns) {
      commitColumns(target, true, 'scrub');
    }
  };

  const requestLatestCommit = (nextColumns: number) => {
    latestRequestedColumns = clampColumnCount(clampToRange(nextColumns));
    if (rafId) return;
    rafId = requestAnimationFrame(flushLatestCommit);
  };

  const flushCoalescedCommit = () => {
    coalesceTimer = 0;
    if (latestRequestedColumns == null) return;
    const target = latestRequestedColumns;
    latestRequestedColumns = null;
    if (target !== currentColumns) {
      commitColumns(target, true, 'scrub');
    }
  };

  const requestCoalescedCommit = (nextColumns: number) => {
    latestRequestedColumns = clampColumnCount(clampToRange(nextColumns));
    if (coalesceTimer) return;
    coalesceTimer = window.setTimeout(flushCoalescedCommit, FAST_SCRUB_COALESCE_MS);
  };

  function scrubTo(nextValue: number) {
    const clampedValue = clampToRange(nextValue);
    scrubValue = clampedValue;
    sliderEl.value = String(clampedValue);
    const nextColumns = valueToColumnCount(clampedValue);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const timeDelta = Math.max(1, now - (lastScrubAt || now));
    const valueDelta = Math.abs(clampedValue - lastScrubValue);
    const isFastScrub = timeDelta <= FAST_SCRUB_WINDOW_MS && valueDelta >= FAST_SCRUB_DELTA;
    const isLargeJump = Math.abs(nextColumns - currentColumns) >= 2;
    if (isFastScrub || isLargeJump) {
      requestCoalescedCommit(nextColumns);
    } else {
      requestLatestCommit(nextColumns);
    }
    lastScrubAt = now;
    lastScrubValue = clampedValue;
    previousScrubValue = clampedValue;
  }

  function settleScrub() {
    if (coalesceTimer) {
      window.clearTimeout(coalesceTimer);
      coalesceTimer = 0;
    }
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
    if (coalesceTimer) window.clearTimeout(coalesceTimer);
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
