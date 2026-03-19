import React, { useCallback, useRef, useState } from 'react';

import type { MediaItem, Project } from './types';

const POINTER_THRESHOLD = 8;
const LONG_PRESS_MOVE_CANCEL_PX = 12;
const LONG_PRESS_MS = 620;

export type AssetPointerHandlers = Pick<
  React.HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onContextMenu'
>;

interface UseAssetInteractionsResult {
  assetDragActive: boolean;
  buildAssetPointerHandlers: (item: MediaItem) => AssetPointerHandlers;
  clearPendingLongPress: () => void;
  dragPathsRef: React.MutableRefObject<string[]>;
  dragging: boolean;
  stopAssetDrag: () => void;
}

interface UseAssetInteractionsOptions {
  activeProject: Project | null;
  assetSelectionKey: (item: MediaItem, projectOverride?: Project | null) => string;
  closeDrawer: () => void;
  focusAsset: (item: MediaItem, itemKey: string) => void;
  inNoPreviewZone: (target: EventTarget | null) => boolean;
  inspectorOpen: boolean;
  itemsBySelectionKey: Map<string, MediaItem>;
  moveMediaSelection: (selectionKeys: string[], project: Project) => Promise<void>;
  onRevealTopbar: () => void;
  openContextMenu: (x: number, y: number, items: MediaItem[]) => void;
  openDrawer: (item: MediaItem) => void;
  projects: Project[];
  selected: Set<string>;
  selectedKeysOrdered: string[];
}

export function useAssetInteractions({
  activeProject,
  assetSelectionKey,
  closeDrawer,
  focusAsset,
  inNoPreviewZone,
  inspectorOpen,
  itemsBySelectionKey,
  moveMediaSelection,
  onRevealTopbar,
  openContextMenu,
  openDrawer,
  projects,
  selected,
  selectedKeysOrdered,
}: UseAssetInteractionsOptions): UseAssetInteractionsResult {
  const [dragging, setDragging] = useState(false);
  const [assetDragActive, setAssetDragActive] = useState(false);
  const dragPathsRef = useRef<string[]>([]);
  const lastTileTapRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPointerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const clearPendingLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = null;
    longPressPointerRef.current = null;
    longPressFiredRef.current = false;
  }, []);

  const stopAssetDrag = useCallback(() => {
    setDragging(false);
    setAssetDragActive(false);
  }, []);

  const buildAssetPointerHandlers = useCallback(
    (item: MediaItem): AssetPointerHandlers => {
      let pointerId: number | null = null;
      let startX = 0;
      let startY = 0;
      let moved = false;
      let pressX = 0;
      let pressY = 0;
      const itemKey = assetSelectionKey(item, activeProject);

      const resolveContextItems = () => (selected.has(itemKey)
        ? selectedKeysOrdered
          .map((path) => itemsBySelectionKey.get(path))
          .filter((entry): entry is MediaItem => Boolean(entry))
        : [item]);

      const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (inNoPreviewZone(event.target)) return;
        if ((event.target as HTMLElement).closest('input, button, a, summary')) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        pressX = event.clientX;
        pressY = event.clientY;
        moved = false;
        clearPendingLongPress();
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          longPressPointerRef.current = pointerId;
          longPressTimerRef.current = window.setTimeout(() => {
            if (longPressPointerRef.current !== pointerId || moved || dragging || assetDragActive) return;
            longPressFiredRef.current = true;
            focusAsset(item, itemKey);
            openContextMenu(pressX, pressY, resolveContextItems());
          }, LONG_PRESS_MS);
        }
      };

      const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
        if (pointerId !== event.pointerId) return;
        if (inNoPreviewZone(event.target)) {
          clearPendingLongPress();
          return;
        }
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const movedFar = (dx * dx + dy * dy) > LONG_PRESS_MOVE_CANCEL_PX * LONG_PRESS_MOVE_CANCEL_PX;
        if (movedFar) {
          moved = true;
          clearPendingLongPress();
        }
        if (!moved) return;
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          return;
        }
        if ((dx * dx + dy * dy) > POINTER_THRESHOLD * POINTER_THRESHOLD) {
          setDragging(true);
          setAssetDragActive(true);
          dragPathsRef.current = selected.has(itemKey)
            ? selectedKeysOrdered
            : [itemKey];
          if (event.clientY <= 56) onRevealTopbar();
        }
      };

      const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
        if (pointerId !== event.pointerId) return;
        const longPressFired = longPressFiredRef.current;
        clearPendingLongPress();
        pointerId = null;
        if (longPressFired) {
          return;
        }
        if (moved) {
          stopAssetDrag();
          const dropEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.chip') as HTMLElement | null;
          if (dropEl?.dataset?.project) {
            const target = projects.find((proj) => (
              proj.name === dropEl.dataset.project
              && String(proj.source || '') === String(dropEl.dataset.source || '')
            ));
            if (target) void moveMediaSelection(dragPathsRef.current, target);
          }
          return;
        }
        const now = Date.now();
        if (inspectorOpen) {
          focusAsset(item, itemKey);
          closeDrawer();
          lastTileTapRef.current = { key: '', at: 0 };
          return;
        }
        const prevTap = lastTileTapRef.current;
        const isSecondTap = prevTap.key === itemKey && (now - prevTap.at) <= 900;
        focusAsset(item, itemKey);
        if (isSecondTap) {
          openDrawer(item);
          lastTileTapRef.current = { key: '', at: 0 };
          return;
        }
        lastTileTapRef.current = { key: itemKey, at: now };
      };

      const handlePointerCancel = () => {
        clearPendingLongPress();
        pointerId = null;
        stopAssetDrag();
      };

      const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        if (inNoPreviewZone(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (dragging) return;
        openContextMenu(event.clientX, event.clientY, resolveContextItems());
      };

      return {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onContextMenu: handleContextMenu,
      };
    },
    [
      activeProject,
      assetDragActive,
      assetSelectionKey,
      clearPendingLongPress,
      closeDrawer,
      focusAsset,
      dragging,
      inNoPreviewZone,
      inspectorOpen,
      itemsBySelectionKey,
      moveMediaSelection,
      onRevealTopbar,
      openContextMenu,
      openDrawer,
      projects,
      selected,
      selectedKeysOrdered,
      stopAssetDrag,
    ],
  );

  return {
    assetDragActive,
    buildAssetPointerHandlers,
    clearPendingLongPress,
    dragPathsRef,
    dragging,
    stopAssetDrag,
  };
}
