'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastMessage } from '../types';

export function useExplorerFeedbackController() {
  const timeouts = useRef<number[]>([]);
  const lastOperationToastRef = useRef<Map<string, number>>(new Map());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const beginToastExit = useCallback((id: string) => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)));
  }, []);
  const addToast = useCallback((type: ToastMessage['type'], title: string, message: string, operationId?: string) => {
    if (operationId) {
      const now = Date.now();
      const lastShownAt = lastOperationToastRef.current.get(operationId) ?? 0;
      if (now - lastShownAt < 500) return `${operationId}-deduped`;
      lastOperationToastRef.current.set(operationId, now);
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, title, message, exiting: false }]);
    const timeout = window.setTimeout(() => beginToastExit(id), 3100);
    timeouts.current.push(timeout);
    return id;
  }, [beginToastExit]);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);
  useEffect(() => () => {
    timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
  }, []);
  return { toasts, addToast, dismissToast, beginToastExit };
}
