import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { MediaItem, Project } from './types';
import { isInteractiveTarget } from './utils';

const POINTER_THRESHOLD = 8;
const LONG_PRESS_MOVE_CANCEL_PX = 12;
const LONG_PRESS_MS = 620;
type GestureMode = 'idle' | 'tap_candidate' | 'hold_candidate' | 'drag' | 'pinch';

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
  onTapFeedback?: (point: { x: number; y: number }) => void;
  onHoldFeedback?: (
    point: { x: number; y: number } | null,
    active: boolean,
    progress: number,
    completed: boolean,
  ) => void;
  onTapStage?: (stage: 'first' | 'second', itemKey: string) => void;
  onHoldEmphasis?: (itemKey: string | null, active: boolean) => void;
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
  onTapFeedback,
  onHoldFeedback,
  onTapStage,
  onHoldEmphasis,
}: UseAssetInteractionsOptions): UseAssetInteractionsResult {
  const [dragging, setDragging] = useState(false);
  const [assetDragActive, setAssetDragActive] = useState(false);
  const dragPathsRef = useRef<string[]>([]);
  const lastTileTapRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPointerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const holdStartedAtRef = useRef(0);
  const holdProgressRafRef = useRef<number | null>(null);
  const holdCompletedRef = useRef(false);
  const gestureModeRef = useRef<GestureMode>('idle');
  const pinchSuppressRef = useRef(false);
  const pinchSuppressUntilRef = useRef(0);

  const clearPendingLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = null;
    longPressPointerRef.current = null;
    longPressFiredRef.current = false;
    holdStartedAtRef.current = 0;
    holdCompletedRef.current = false;
    if (holdProgressRafRef.current) {
      window.cancelAnimationFrame(holdProgressRafRef.current);
    }
    holdProgressRafRef.current = null;
    onHoldFeedback?.(null, false, 0, false);
    onHoldEmphasis?.(null, false);
  }, [onHoldEmphasis, onHoldFeedback]);

  const stopAssetDrag = useCallback(() => {
    setDragging(false);
    setAssetDragActive(false);
    if (gestureModeRef.current === 'drag') {
      gestureModeRef.current = 'idle';
    }
  }, []);

  useEffect(() => {
    const onTouchStartCapture = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      pinchSuppressRef.current = true;
      gestureModeRef.current = 'pinch';
      clearPendingLongPress();
    };

    const onTouchEndCapture = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      const wasPinchGesture = gestureModeRef.current === 'pinch' || pinchSuppressRef.current;
      pinchSuppressRef.current = false;
      if (wasPinchGesture) {
        pinchSuppressUntilRef.current = Date.now() + 220;
      }
      if (gestureModeRef.current === 'pinch') {
        gestureModeRef.current = 'idle';
      }
    };

    document.addEventListener('touchstart', onTouchStartCapture, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEndCapture, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchEndCapture, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStartCapture, { capture: true });
      document.removeEventListener('touchend', onTouchEndCapture, { capture: true });
      document.removeEventListener('touchcancel', onTouchEndCapture, { capture: true });
    };
  }, [clearPendingLongPress]);

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
        if (isInteractiveTarget(event.target)) return;
        if (
          pinchSuppressRef.current
          || gestureModeRef.current === 'pinch'
          || Date.now() < pinchSuppressUntilRef.current
        ) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        pressX = event.clientX;
        pressY = event.clientY;
        moved = false;
        clearPendingLongPress();
        gestureModeRef.current = 'tap_candidate';
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          gestureModeRef.current = 'hold_candidate';
          holdStartedAtRef.current = performance.now();
          holdCompletedRef.current = false;
          onHoldFeedback?.({ x: pressX, y: pressY }, true, 0, false);
          const updateHoldProgress = () => {
            if (holdStartedAtRef.current <= 0) return;
            const elapsed = performance.now() - holdStartedAtRef.current;
            const progress = Math.max(0, Math.min(1, elapsed / LONG_PRESS_MS));
            onHoldFeedback?.({ x: pressX, y: pressY }, true, progress, holdCompletedRef.current);
            if (progress < 1 && !holdCompletedRef.current) {
              holdProgressRafRef.current = window.requestAnimationFrame(updateHoldProgress);
              return;
            }
            holdProgressRafRef.current = null;
          };
          holdProgressRafRef.current = window.requestAnimationFrame(updateHoldProgress);
          longPressPointerRef.current = pointerId;
          longPressTimerRef.current = window.setTimeout(() => {
            if (
              longPressPointerRef.current !== pointerId
              || moved
              || dragging
              || assetDragActive
              || pinchSuppressRef.current
              || gestureModeRef.current === 'pinch'
            ) return;
            longPressFiredRef.current = true;
            holdCompletedRef.current = true;
            onHoldFeedback?.({ x: pressX, y: pressY }, true, 1, true);
            onHoldEmphasis?.(itemKey, true);
            focusAsset(item, itemKey);
            openContextMenu(pressX, pressY, resolveContextItems());
          }, LONG_PRESS_MS);
        }
      };

      const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
        if (pointerId !== event.pointerId) return;
        if (inNoPreviewZone(event.target) || isInteractiveTarget(event.target)) {
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
          gestureModeRef.current = 'drag';
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
        if (pinchSuppressRef.current || gestureModeRef.current === 'pinch') {
          gestureModeRef.current = 'idle';
          return;
        }
        if (Date.now() < pinchSuppressUntilRef.current) {
          gestureModeRef.current = 'idle';
          return;
        }
        if (longPressFired) {
          gestureModeRef.current = 'idle';
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
          gestureModeRef.current = 'idle';
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
        onTapFeedback?.({ x: event.clientX, y: event.clientY });
        if (isSecondTap) {
          onTapStage?.('second', itemKey);
          openDrawer(item);
          lastTileTapRef.current = { key: '', at: 0 };
          gestureModeRef.current = 'idle';
          return;
        }
        onTapStage?.('first', itemKey);
        lastTileTapRef.current = { key: itemKey, at: now };
        gestureModeRef.current = 'idle';
      };

      const handlePointerCancel = () => {
        clearPendingLongPress();
        pointerId = null;
        gestureModeRef.current = 'idle';
        stopAssetDrag();
      };

      const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        if (inNoPreviewZone(event.target) || isInteractiveTarget(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (
          pinchSuppressRef.current
          || gestureModeRef.current === 'pinch'
          || Date.now() < pinchSuppressUntilRef.current
        ) return;
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
