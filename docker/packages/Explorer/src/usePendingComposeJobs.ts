import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPendingComposeItemFromEnvelope,
  derivePendingComposeStatus,
  type ComposeJobEnvelope,
  type PendingComposeItem,
} from "./composeJobs";

interface UsePendingComposeJobsArgs {
  pollIntervalMs?: number;
  fetchJson: (url: string) => Promise<any>;
  onCompletedRefreshScope?: (refreshScope: any) => Promise<void> | void;
}

interface RegisterAcceptedJobInput {
  envelope: ComposeJobEnvelope;
}

export function usePendingComposeJobs({
  pollIntervalMs = 2000,
  fetchJson,
  onCompletedRefreshScope,
}: UsePendingComposeJobsArgs) {
  const [items, setItems] = useState<PendingComposeItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const registerAcceptedJob = useCallback(({ envelope }: RegisterAcceptedJobInput) => {
    const item = buildPendingComposeItemFromEnvelope(envelope);
    setItems((prev) => {
      const existing = prev.find((x) => x.jobId === item.jobId);
      if (existing) {
        return prev.map((x) => (x.jobId === item.jobId ? { ...existing, ...item } : x));
      }
      return [item, ...prev];
    });
  }, []);

  useEffect(() => {
    if (!items.length) return;

    let cancelled = false;

    const tick = async () => {
      const current = itemsRef.current;
      const active = current.filter(
        (item) => item.status === "queued" || item.status === "running" || item.status === "running_long",
      );

      if (!active.length) return;

      for (const item of active) {
        if (!item.jobUrl) continue;
        try {
          const envelope = (await fetchJson(item.jobUrl)) as ComposeJobEnvelope;
          const nextStatus = derivePendingComposeStatus(envelope);

          if (nextStatus === "completed") {
            if (envelope.refresh_scope && onCompletedRefreshScope) {
              await onCompletedRefreshScope(envelope.refresh_scope);
            }
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
                      status: nextStatus,
                      error: envelope.error,
                      debugArtifacts: Array.isArray(envelope.debug_artifacts)
                        ? envelope.debug_artifacts
                        : Array.isArray(envelope.result?.debug_artifacts?.files)
                          ? envelope.result.debug_artifacts.files
                          : null,
                    }
                  : x,
              ),
            );
          }
        } catch (error: any) {
          if (!cancelled) {
            setItems((prev) =>
              prev.map((x) =>
                x.jobId === item.jobId
                  ? {
                      ...x,
                      status: "failed",
                      error: error?.message || "Failed to poll compose job",
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
  }, [items.length, pollIntervalMs, fetchJson, onCompletedRefreshScope]);

  const removeFailedJob = useCallback((jobId: string) => {
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
    removeFailedJob,
  };
}
