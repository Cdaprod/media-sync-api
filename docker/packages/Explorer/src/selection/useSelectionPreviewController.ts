'use client';

import { useCallback, useRef, useState, type SetStateAction } from 'react';

import { toggleSelectionWithOrder } from '../state';

type UseSelectionPreviewControllerArgs = {
  onPreviewActivationChanged?: () => void;
};

export function useSelectionPreviewController({
  onPreviewActivationChanged,
}: UseSelectionPreviewControllerArgs = {}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrderState] = useState<string[]>([]);
  const [activeAssetKey, setActiveAssetKey] = useState('');
  const [previewActivationKey, setPreviewActivationKey] = useState('');
  const [reinforcedActiveKey, setReinforcedActiveKey] = useState('');
  const selectedOrderRef = useRef<string[]>([]);

  const setSelectedOrder = useCallback((nextOrder: SetStateAction<string[]>) => {
    setSelectedOrderState((previous) => {
      const resolved = typeof nextOrder === 'function'
        ? (nextOrder as (prevState: string[]) => string[])(previous)
        : nextOrder;
      selectedOrderRef.current = resolved;
      return resolved;
    });
  }, []);

  const clearSelectionState = useCallback(() => {
    selectedOrderRef.current = [];
    setSelected(new Set());
    setSelectedOrderState([]);
  }, []);

  const toggleSelectedByKey = useCallback((key: string) => {
    if (!key) return;
    setSelected((current) => {
      const { selected: nextSelected, order } = toggleSelectionWithOrder(current, selectedOrderRef.current, key);
      selectedOrderRef.current = order;
      setSelectedOrderState(order);
      return nextSelected;
    });
  }, []);

  const commitPreviewActivationKey = useCallback((nextKey: string) => {
    setPreviewActivationKey((prev) => {
      if (prev !== nextKey) {
        onPreviewActivationChanged?.();
      }
      return nextKey;
    });
  }, [onPreviewActivationChanged]);

  const selectAndActivateAssetKey = useCallback((key: string) => {
    if (!key) return;
    setSelected((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      const nextOrder = [...selectedOrderRef.current.filter((value) => next.has(value)), key];
      setSelectedOrder(nextOrder);
      return next;
    });
    setActiveAssetKey(key);
    setPreviewActivationKey(key);
    setReinforcedActiveKey(key);
    onPreviewActivationChanged?.();
  }, [onPreviewActivationChanged, setSelectedOrder]);

  return {
    selected,
    setSelected,
    selectedOrder,
    setSelectedOrder,
    clearSelectionState,
    toggleSelectedByKey,
    activeAssetKey,
    setActiveAssetKey,
    previewActivationKey,
    setPreviewActivationKey,
    commitPreviewActivationKey,
    reinforcedActiveKey,
    setReinforcedActiveKey,
    selectAndActivateAssetKey,
  };
}
