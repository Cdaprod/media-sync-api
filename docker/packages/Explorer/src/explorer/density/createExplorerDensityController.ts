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
  let rafId = 0;
  let latestRequestedColumns: number | null = null;

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
        interactionMode: 'scrub',
      });
      return;
    }

    commitLayoutColumns(clamped);
  }

  const flushLatestCommit = () => {
    rafId = 0;
    if (latestRequestedColumns == null) return;
    const target = latestRequestedColumns;
    latestRequestedColumns = null;
    if (target !== currentColumns) {
      setColumns(target, true);
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
    requestLatestCommit(Math.round(clampedValue));
  }

  function settleScrub() {
    if (latestRequestedColumns != null && latestRequestedColumns !== currentColumns) {
      setColumns(latestRequestedColumns, true);
      latestRequestedColumns = null;
    }
    sliderEl.value = String(currentColumns);
    scrubValue = currentColumns;
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
