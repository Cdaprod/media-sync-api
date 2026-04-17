import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPendingComposeItemFromEnvelope,
  derivePendingComposeStatus,
  pendingComposeMatchesMediaItem,
  pendingComposeReconnectDelayMs,
  PENDING_COMPOSE_STORAGE_KEY,
  restorePendingComposeItemsFromStorage,
  serializePendingComposeItemsForStorage,
  type ComposeJobEnvelope,
  type PendingComposeItem,
} from "../composeJobs";
import type { MediaItem } from "../types";

const RESTORED_PENDING_COMPOSE_RECOVERY_MS = 8_000;
const RESTORED_PENDING_COMPOSE_MAX_ATTEMPTS = 2;

interface UsePendingComposeJobsArgs {
  pollIntervalMs?: number;
  fetchJson: (url: string) => Promise<any>;
  mediaItems?: MediaItem[];
  onCompletedRefreshScope?: (refreshScope: any) => Promise<void> | void;
}

interface RegisterAcceptedJobInput {
  envelope: ComposeJobEnvelope;
}

function readPersistedPendingComposeItems(): PendingComposeItem[] {
  if (typeof window === "undefined") return [];
  return restorePendingComposeItemsFromStorage(window.localStorage.getItem(PENDING_COMPOSE_STORAGE_KEY));
}

export function usePendingComposeJobs({
  pollIntervalMs = 2000,
  fetchJson,
  mediaItems = [],
  onCompletedRefreshScope,
}: UsePendingComposeJobsArgs) {
  const [items, setItems] = useState<PendingComposeItem[]>(() => readPersistedPendingComposeItems());
  const itemsRef = useRef(items);
  const pollAttemptsRef = useRef(new Map<string, number>());
  const nextPollAtRef = useRef(new Map<string, number>());
  const mediaItemsRef = useRef(mediaItems);
  itemsRef.current = items;
  mediaItemsRef.current = mediaItems;

  const hasConfirmedOutput = useCallback((item: PendingComposeItem) => {
    return mediaItemsRef.current.some((mediaItem) => pendingComposeMatchesMediaItem(item, mediaItem));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!items.length) {
      window.localStorage.removeItem(PENDING_COMPOSE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      PENDING_COMPOSE_STORAGE_KEY,
      serializePendingComposeItemsForStorage(items),
    );
  }, [items]);

  const registerAcceptedJob = useCallback(({ envelope }: RegisterAcceptedJobInput) => {
    const item = buildPendingComposeItemFromEnvelope(envelope);
    pollAttemptsRef.current.delete(item.jobId);
    nextPollAtRef.current.delete(item.jobId);
    setItems((prev) => {
      const existing = prev.find((x) => x.jobId === item.jobId);
      if (existing) {
        return prev.map((x) => (x.jobId === item.jobId ? {
          ...existing,
          ...item,
          recoveredFromStorage: false,
          recoveryStartedAt: undefined,
        } : x));
      }
      return [{
        ...item,
        recoveredFromStorage: false,
        recoveryStartedAt: undefined,
      }, ...prev];
    });
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const removable = items
      .filter((item) => (item.status === "reconnecting" || item.status === "finalizing") && hasConfirmedOutput(item))
      .map((item) => item.jobId);
    if (!removable.length) return;
    setItems((prev) => prev.filter((item) => !removable.includes(item.jobId)));
  }, [hasConfirmedOutput, items, mediaItems]);

  useEffect(() => {
    if (!items.length) return;

    let cancelled = false;

    const tick = async () => {
      const current = itemsRef.current;
      const active = current.filter(
        (item) => item.status === "queued"
          || item.status === "running"
          || item.status === "running_long"
          || item.status === "reconnecting",
      );

      if (!active.length) return;

      for (const item of active) {
        if (!item.jobUrl) continue;
        const nextAllowedPollAt = nextPollAtRef.current.get(item.jobId) ?? 0;
        if (Date.now() < nextAllowedPollAt) continue;
        try {
          const envelope = (await fetchJson(item.jobUrl)) as ComposeJobEnvelope;
          const nextStatus = derivePendingComposeStatus(envelope);
          pollAttemptsRef.current.delete(item.jobId);
          nextPollAtRef.current.delete(item.jobId);

          if (nextStatus === "completed") {
            if (envelope.refresh_scope && onCompletedRefreshScope) {
              await onCompletedRefreshScope(envelope.refresh_scope);
            }
            const completedCandidate: PendingComposeItem = {
              ...item,
              completedPath: typeof envelope.result?.path === "string" ? envelope.result.path : item.completedPath,
              refreshScope: envelope.refresh_scope ?? item.refreshScope,
            };
            if (hasConfirmedOutput(completedCandidate)) {
              pollAttemptsRef.current.delete(item.jobId);
              nextPollAtRef.current.delete(item.jobId);
              if (!cancelled) {
                setItems((prev) => prev.filter((x) => x.jobId !== item.jobId));
              }
              continue;
            }
            if (!cancelled) {
              setItems((prev) =>
                prev.map((x) =>
                  x.jobId === item.jobId
                    ? {
                        ...x,
                        status: "finalizing",
                        error: envelope.error,
                        refreshScope: envelope.refresh_scope ?? x.refreshScope,
                        completedPath: typeof envelope.result?.path === "string" ? envelope.result.path : x.completedPath,
                        debugArtifacts: Array.isArray(envelope.debug_artifacts)
                          ? envelope.debug_artifacts
                          : Array.isArray(envelope.result?.debug_artifacts?.files)
                            ? envelope.result.debug_artifacts.files
                            : x.debugArtifacts,
                        recoveredFromStorage: false,
                        recoveryStartedAt: undefined,
                      }
                    : x,
                ),
              );
            }
            continue;
          }

          if (!cancelled) {
            setItems((prev) =>
              prev.map((x) =>
                x.jobId === item.jobId
                  ? {
                      ...x,
                      status: nextStatus,
                      error: envelope.error,
                      refreshScope: envelope.refresh_scope ?? x.refreshScope,
                      debugArtifacts: Array.isArray(envelope.debug_artifacts)
                        ? envelope.debug_artifacts
                        : Array.isArray(envelope.result?.debug_artifacts?.files)
                          ? envelope.result.debug_artifacts.files
                          : x.debugArtifacts,
                      recoveredFromStorage: false,
                      recoveryStartedAt: undefined,
                    }
                  : x,
              ),
            );
          }
        } catch {
          const attemptCount = (pollAttemptsRef.current.get(item.jobId) ?? 0) + 1;
          const recoveryStartedMs = item.recoveryStartedAt
            ? new Date(item.recoveryStartedAt).getTime()
            : Number.NaN;
          const recoveryElapsedMs = Number.isFinite(recoveryStartedMs) ? Date.now() - recoveryStartedMs : 0;
          const shouldDiscardRecoveredItem = item.recoveredFromStorage
            && (hasConfirmedOutput(item)
              || attemptCount >= RESTORED_PENDING_COMPOSE_MAX_ATTEMPTS
              || recoveryElapsedMs >= RESTORED_PENDING_COMPOSE_RECOVERY_MS);
          if (shouldDiscardRecoveredItem) {
            pollAttemptsRef.current.delete(item.jobId);
            nextPollAtRef.current.delete(item.jobId);
            if (!cancelled) {
              setItems((prev) => prev.filter((x) => x.jobId !== item.jobId));
            }
            continue;
          }
          pollAttemptsRef.current.set(item.jobId, attemptCount);
          nextPollAtRef.current.set(item.jobId, Date.now() + pendingComposeReconnectDelayMs(attemptCount, pollIntervalMs));
          if (!cancelled) {
            setItems((prev) =>
              prev.map((x) =>
                x.jobId === item.jobId
                    ? {
                      ...x,
                      status: "reconnecting",
                      error: undefined,
                      recoveryStartedAt: x.recoveryStartedAt ?? new Date().toISOString(),
                    }
                  : x,
              ),
            );
          }
        }
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, pollIntervalMs);

    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [items.length, pollIntervalMs, fetchJson, hasConfirmedOutput, mediaItems, onCompletedRefreshScope]);

  const removePendingJob = useCallback((jobId: string) => {
    pollAttemptsRef.current.delete(jobId);
    nextPollAtRef.current.delete(jobId);
    setItems((prev) => prev.filter((x) => x.jobId !== jobId));
  }, []);

  const pendingItemsByProjectAndDir = useMemo(() => {
    const map = new Map<string, PendingComposeItem[]>();
    for (const item of items) {
      const key = `${item.project}::${item.targetDir}`;
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    }
    return map;
  }, [items]);

  return {
    pendingComposeItems: items,
    pendingItemsByProjectAndDir,
    registerAcceptedJob,
    removePendingJob,
  };
}
