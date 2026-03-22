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
  | "failed";

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
  refreshScope?: {
    project?: string;
    source?: string;
    paths?: string[];
  };
  debugArtifacts?: string[] | null;
}

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
    debugArtifacts: normalizeDebugArtifacts(envelope),
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
