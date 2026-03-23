export type ComposeJobApiStatus = "queued" | "running" | "completed" | "failed";

export interface ComposeJobEnvelope {
  job_id: string;
  status: "accepted" | ComposeJobApiStatus;
  job_status?: ComposeJobApiStatus;
  project: string;
  source: string;
  flow?: string;
  output_name: string;
  target_dir: string;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  mode_requested?: "auto" | "copy" | "encode" | string;
  input_count?: number;
  input_preview?: string[];
  refresh_scope?: {
    project?: string;
    source?: string;
    paths?: string[];
  };
  job_url?: string;
  result?: any;
  error?: string;
  debug_artifacts?: string[] | null;
}

export type PendingComposeViewStatus =
  | "queued"
  | "running"
  | "running_long"
  | "reconnecting"
  | "finalizing"
  | "failed";

export interface PendingComposeRefreshScope {
  project?: string;
  source?: string;
  paths?: string[];
}

export interface PendingComposeItem {
  jobId: string;
  project: string;
  source: string;
  targetDir: string;
  outputName: string;
  modeRequested?: "auto" | "copy" | "encode" | string;
  inputCount?: number;
  inputPreview?: string[];
  createdAt?: string;
  status: PendingComposeViewStatus;
  error?: string;
  jobUrl?: string;
  refreshScope?: PendingComposeRefreshScope;
  completedPath?: string;
  debugArtifacts?: string[] | null;
}

export interface PersistedPendingComposeJobRecord {
  jobId: string;
  jobUrl: string;
  project: string;
  source: string;
  targetDir: string;
  outputName: string;
  createdAt?: string;
  modeRequested?: "auto" | "copy" | "encode" | string;
  inputCount?: number;
  refreshScope?: PendingComposeRefreshScope;
}

export const PENDING_COMPOSE_STORAGE_KEY = "media-sync.explorer.pending-compose-jobs";

function normalizeDebugArtifacts(envelope: ComposeJobEnvelope): string[] | null {
  if (Array.isArray(envelope.debug_artifacts)) {
    return envelope.debug_artifacts;
  }
  const resultArtifacts = envelope.result?.debug_artifacts;
  if (Array.isArray(resultArtifacts)) {
    return resultArtifacts;
  }
  if (Array.isArray(resultArtifacts?.files)) {
    return resultArtifacts.files;
  }
  return null;
}

function normalizeCompletedPath(envelope: ComposeJobEnvelope): string | undefined {
  const resultPath = envelope.result?.path;
  if (typeof resultPath === "string" && resultPath.trim()) {
    return resultPath.trim();
  }
  return undefined;
}

function normalizeRefreshScope(value: unknown): PendingComposeRefreshScope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const scope = value as Record<string, unknown>;
  const project = typeof scope.project === "string" && scope.project.trim() ? scope.project.trim() : undefined;
  const source = typeof scope.source === "string" && scope.source.trim() ? scope.source.trim() : undefined;
  const paths = Array.isArray(scope.paths)
    ? scope.paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0)
    : undefined;
  if (!project && !source && !paths?.length) return undefined;
  return { project, source, paths };
}

export function buildPendingComposeItemFromEnvelope(
  envelope: ComposeJobEnvelope,
): PendingComposeItem {
  const initialStatus =
    envelope.job_status === "running"
      ? "running"
      : envelope.job_status === "failed"
        ? "failed"
        : "queued";

  return {
    jobId: envelope.job_id,
    project: envelope.project,
    source: envelope.source,
    targetDir: envelope.target_dir,
    outputName: envelope.output_name,
    modeRequested: envelope.mode_requested,
    inputCount: envelope.input_count,
    inputPreview: envelope.input_preview,
    createdAt: envelope.created_at ?? undefined,
    status: initialStatus,
    error: envelope.error,
    jobUrl: envelope.job_url,
    refreshScope: envelope.refresh_scope,
    completedPath: normalizeCompletedPath(envelope),
    debugArtifacts: normalizeDebugArtifacts(envelope),
  };
}

export function buildPendingComposeItemFromPersistedRecord(
  record: PersistedPendingComposeJobRecord,
): PendingComposeItem {
  return {
    jobId: record.jobId,
    jobUrl: record.jobUrl,
    project: record.project,
    source: record.source,
    targetDir: record.targetDir,
    outputName: record.outputName,
    createdAt: record.createdAt,
    modeRequested: record.modeRequested,
    inputCount: record.inputCount,
    refreshScope: record.refreshScope,
    status: "queued",
  };
}

export function derivePendingComposeStatus(
  envelope: ComposeJobEnvelope,
): PendingComposeViewStatus | "completed" {
  const rawStatus = envelope.status === "accepted"
    ? (envelope.job_status ?? "queued")
    : envelope.status;

  if (rawStatus === "completed") return "completed";
  if (rawStatus === "failed") return "failed";
  if (rawStatus === "queued") return "queued";

  const startedAt = envelope.started_at ?? envelope.created_at;
  if (!startedAt) return "running";

  const startedMs = new Date(startedAt).getTime();
  if (Number.isFinite(startedMs)) {
    const elapsedMs = Date.now() - startedMs;
    if (elapsedMs > 45_000) return "running_long";
  }

  return "running";
}

export function pendingComposeHoldsNewestSlot(status: PendingComposeViewStatus): boolean {
  return status === "queued"
    || status === "running"
    || status === "running_long"
    || status === "reconnecting"
    || status === "finalizing";
}

function pendingComposeStatusPriority(status: PendingComposeViewStatus): number {
  return pendingComposeHoldsNewestSlot(status) ? 0 : 1;
}

export function sortPendingComposeItemsForDisplay(items: PendingComposeItem[]): PendingComposeItem[] {
  return [...items].sort((left, right) => {
    const leftPriority = pendingComposeStatusPriority(left.status);
    const rightPriority = pendingComposeStatusPriority(right.status);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftCreated = new Date(left.createdAt || 0).getTime();
    const rightCreated = new Date(right.createdAt || 0).getTime();
    if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
      return rightCreated - leftCreated;
    }

    return left.jobId.localeCompare(right.jobId);
  });
}


export function toPersistedPendingComposeJobRecord(
  item: PendingComposeItem,
): PersistedPendingComposeJobRecord | null {
  if (!item.jobId || !item.jobUrl) return null;
  return {
    jobId: item.jobId,
    jobUrl: item.jobUrl,
    project: item.project,
    source: item.source || "primary",
    targetDir: item.targetDir,
    outputName: item.outputName,
    createdAt: item.createdAt,
    modeRequested: item.modeRequested,
    inputCount: item.inputCount,
    refreshScope: item.refreshScope,
  };
}

function normalizePersistedPendingComposeJobRecord(
  value: unknown,
): PersistedPendingComposeJobRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const jobId = typeof record.jobId === "string" && record.jobId.trim() ? record.jobId.trim() : "";
  const jobUrl = typeof record.jobUrl === "string" && record.jobUrl.trim() ? record.jobUrl.trim() : "";
  const project = typeof record.project === "string" && record.project.trim() ? record.project.trim() : "";
  const source = typeof record.source === "string" && record.source.trim() ? record.source.trim() : "primary";
  const targetDir = typeof record.targetDir === "string" && record.targetDir.trim() ? record.targetDir.trim() : "";
  const outputName = typeof record.outputName === "string" && record.outputName.trim() ? record.outputName.trim() : "";
  if (!jobId || !jobUrl || !project || !targetDir || !outputName) return null;
  const createdAt = typeof record.createdAt === "string" && record.createdAt.trim() ? record.createdAt.trim() : undefined;
  const modeRequested = typeof record.modeRequested === "string" && record.modeRequested.trim() ? record.modeRequested.trim() : undefined;
  const inputCount = typeof record.inputCount === "number" ? record.inputCount : undefined;
  return {
    jobId,
    jobUrl,
    project,
    source,
    targetDir,
    outputName,
    createdAt,
    modeRequested,
    inputCount,
    refreshScope: normalizeRefreshScope(record.refreshScope),
  };
}

export function serializePendingComposeItemsForStorage(items: PendingComposeItem[]): string {
  const records = items
    .map((item) => toPersistedPendingComposeJobRecord(item))
    .filter((item): item is PersistedPendingComposeJobRecord => Boolean(item));
  return JSON.stringify(records);
}

export function restorePendingComposeItemsFromStorage(raw: string | null | undefined): PendingComposeItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const deduped = new Map<string, PendingComposeItem>();
    parsed.forEach((value) => {
      const record = normalizePersistedPendingComposeJobRecord(value);
      if (!record) return;
      deduped.set(record.jobId, buildPendingComposeItemFromPersistedRecord(record));
    });
    return Array.from(deduped.values());
  } catch {
    return [];
  }
}

export function pendingComposeReconnectDelayMs(attemptCount: number, pollIntervalMs: number): number {
  const safeAttempts = Math.max(1, attemptCount);
  return Math.min(pollIntervalMs * (2 ** safeAttempts), 30_000);
}
