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
  const longPressProgressFrameRef = useRef<number | null>(null);
  const longPressStartAtRef = useRef(0);
  const longPressPointRef = useRef<{ x: number; y: number } | null>(null);
  const pointerSessionRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    moved: boolean;
    pressX: number;
    pressY: number;
    itemKey: string;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    pressX: 0,
    pressY: 0,
    itemKey: '',
  });
  const longPressFiredRef = useRef(false);
  const gestureModeRef = useRef<GestureMode>('idle');
  const pinchSuppressRef = useRef(false);
  const pinchSuppressUntilRef = useRef(0);

  const clearPendingLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    if (longPressProgressFrameRef.current) {
      window.cancelAnimationFrame(longPressProgressFrameRef.current);
    }
    longPressTimerRef.current = null;
    longPressProgressFrameRef.current = null;
    longPressPointerRef.current = null;
    longPressStartAtRef.current = 0;
    longPressPointRef.current = null;
    pointerSessionRef.current.pointerId = null;
    pointerSessionRef.current.itemKey = '';
    pointerSessionRef.current.moved = false;
    longPressFiredRef.current = false;
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
        clearPendingLongPress();
        const session = pointerSessionRef.current;
        session.pointerId = event.pointerId;
        session.startX = event.clientX;
        session.startY = event.clientY;
        session.pressX = event.clientX;
        session.pressY = event.clientY;
        session.moved = false;
        session.itemKey = itemKey;
        gestureModeRef.current = 'tap_candidate';
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          gestureModeRef.current = 'hold_candidate';
          longPressPointerRef.current = event.pointerId;
          longPressStartAtRef.current = performance.now();
          longPressPointRef.current = { x: session.pressX, y: session.pressY };
          onHoldFeedback?.({ x: session.pressX, y: session.pressY }, true, 0, false);
          const updateHoldProgress = () => {
            if (
              longPressPointerRef.current !== event.pointerId
              || longPressFiredRef.current
              || gestureModeRef.current !== 'hold_candidate'
            ) {
              longPressProgressFrameRef.current = null;
              return;
            }
            const elapsed = Math.max(0, performance.now() - longPressStartAtRef.current);
            const progress = Math.max(0, Math.min(0.92, elapsed / LONG_PRESS_MS));
            const holdPoint = longPressPointRef.current ?? { x: session.pressX, y: session.pressY };
            onHoldFeedback?.(holdPoint, true, progress, false);
            longPressProgressFrameRef.current = window.requestAnimationFrame(updateHoldProgress);
          };
          longPressProgressFrameRef.current = window.requestAnimationFrame(updateHoldProgress);
          longPressTimerRef.current = window.setTimeout(() => {
            const latestSession = pointerSessionRef.current;
            if (
              longPressPointerRef.current !== event.pointerId
              || latestSession.pointerId !== event.pointerId
              || latestSession.itemKey !== itemKey
              || latestSession.moved
              || dragging
              || assetDragActive
              || pinchSuppressRef.current
              || gestureModeRef.current === 'pinch'
            ) return;
            longPressFiredRef.current = true;
            const holdPoint = longPressPointRef.current ?? { x: latestSession.pressX, y: latestSession.pressY };
            if (longPressProgressFrameRef.current) {
              window.cancelAnimationFrame(longPressProgressFrameRef.current);
              longPressProgressFrameRef.current = null;
            }
            onHoldFeedback?.(holdPoint, true, 1, true);
            onHoldEmphasis?.(itemKey, true);
            focusAsset(item, itemKey);
            openContextMenu(latestSession.pressX, latestSession.pressY, resolveContextItems());
          }, LONG_PRESS_MS);
        }
      };

      const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
        const session = pointerSessionRef.current;
        if (session.pointerId !== event.pointerId || session.itemKey !== itemKey) return;
        if (inNoPreviewZone(event.target) || isInteractiveTarget(event.target)) {
          clearPendingLongPress();
          return;
        }
        const dx = event.clientX - session.startX;
        const dy = event.clientY - session.startY;
        const movedFar = (dx * dx + dy * dy) > LONG_PRESS_MOVE_CANCEL_PX * LONG_PRESS_MOVE_CANCEL_PX;
        if (movedFar) {
          session.moved = true;
          clearPendingLongPress();
        }
        if (!session.moved) return;
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
        const session = pointerSessionRef.current;
        if (session.pointerId !== event.pointerId || session.itemKey !== itemKey) return;
        const longPressFired = longPressFiredRef.current;
        const movedBeforeRelease = session.moved;
        clearPendingLongPress();
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
        if (movedBeforeRelease) {
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
        onTapFeedback?.({ x: event.clientX, y: event.clientY });
        if (isSecondTap) {
          focusAsset(item, itemKey);
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
