import { clampColumnCount } from './getColumnCount';
import { animateDensityFlip } from './animateDensityFlip';

export type ExplorerDensityController = {
  getColumns: () => number;
  setColumns: (nextColumns: number, animated?: boolean) => void;
  nudgeColumns: (delta: number, animated?: boolean) => void;
  destroy: () => void;
};

export type ExplorerDensityControllerOptions = {
  gridEl: HTMLElement;
  sliderEl?: HTMLInputElement | null;
  initialColumns: number;
  onColumnsChange: (columns: number) => void;
};

export function createExplorerDensityController(options: ExplorerDensityControllerOptions): ExplorerDensityController {
  const {
    gridEl,
    sliderEl,
    initialColumns,
    onColumnsChange,
  } = options;

  let currentColumns = clampColumnCount(initialColumns);

  function syncSlider() {
    if (sliderEl) sliderEl.value = String(currentColumns);
  }

  function commitColumns(nextColumns: number) {
    currentColumns = nextColumns;
    syncSlider();
    onColumnsChange(currentColumns);
    gridEl.dataset.columns = String(currentColumns);
  }

  function setColumns(nextColumns: number, animated = true) {
    const clamped = clampColumnCount(nextColumns);
    if (clamped === currentColumns) return;

    if (animated) {
      animateDensityFlip({
        gridEl,
        commitLayout: () => commitColumns(clamped),
      });
      return;
    }

    commitColumns(clamped);
  }

  function nudgeColumns(delta: number, animated = true) {
    setColumns(currentColumns + delta, animated);
  }

  function destroy() {
    // no-op; kept for controller parity
  }

  syncSlider();
  onColumnsChange(currentColumns);
  gridEl.dataset.columns = String(currentColumns);

  return {
    getColumns: () => currentColumns,
    setColumns,
    nudgeColumns,
    destroy,
  };
}
