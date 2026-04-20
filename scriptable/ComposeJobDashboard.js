// /scriptable/ComposeStatefulJobDashboard-2.js
// Name in Scriptable iOS: `ComposeJobDashboard 2.js`
//
// WebView queue UI for media compose/upload jobs.
// Designed for Scriptable + Shortcuts share sheet.
//
// What this does:
// - reads shared media from Scriptable share input
// - prefers fileURLs as the authoritative input channel
// - dedupes incoming files so the same shared clip is not queued twice
// - stabilizes each item into Scriptable temp
// - shows a WebView dashboard with queue rows
// - uploads one file at a time using your incremental compose protocol
// - updates each row as it moves through states
// - shows the final composed video in a result panel using player.html?src=...
// - returns final JSON to Shortcuts
// - expects Files-only Shortcuts wiring; OutgoingTemp-only compatibility paths may be dead on arrival

const BASE = "http://192.168.0.25:8787";
const PROJECT = "P3-SHARED-iOS-Exports";
const TARGET_DIR = "exports";
const MODE = "encode"; // "auto" | "copy" | "encode"
const OUTPUT_NAME = `compose-${Date.now()}`; // base label only; server suffixes it
const SOURCE = "primary";

const STAGE_TO_TEMP = true;
const MAX_TEXT = 220;
// Debug toggles for on-device shortcut triage.
// Keep ENABLE_STARTUP_ALERT=true while diagnosing launch issues.
const ENABLE_STARTUP_ALERT = false;
const ENABLE_FATAL_ALERT = true;

// -----------------------------
// Persistent run management
// -----------------------------

// Use Scriptable's documents directory to persist run state and staged files
const _fmRun = FileManager.local();
const RUNS_DIR = _fmRun.joinPath(_fmRun.documentsDirectory(), "compose-runs");
const LAST_RUN_PATH = _fmRun.joinPath(RUNS_DIR, "last_run.json");
const SHARE_DEBUG_DIR = _fmRun.joinPath(_fmRun.documentsDirectory(), "share-debug");
const BRIDGE_LATEST_REPORT_PATH = _fmRun.joinPath(SHARE_DEBUG_DIR, "compose-upload-inspect-latest.json");
const INLINE_BRIDGE_STAGE_ROOT = _fmRun.joinPath(SHARE_DEBUG_DIR, "inline-bridge-staged");
if (!_fmRun.fileExists(RUNS_DIR)) _fmRun.createDirectory(RUNS_DIR, true);
if (!_fmRun.fileExists(SHARE_DEBUG_DIR)) _fmRun.createDirectory(SHARE_DEBUG_DIR, true);
if (!_fmRun.fileExists(INLINE_BRIDGE_STAGE_ROOT)) _fmRun.createDirectory(INLINE_BRIDGE_STAGE_ROOT, true);

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(s, fallback = null) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`;
  _fmRun.writeString(tmp, JSON.stringify(value, null, 2));
  if (_fmRun.fileExists(path)) _fmRun.remove(path);
  _fmRun.move(tmp, path);
}

function runDirForPersistent(runId) {
  const dir = _fmRun.joinPath(RUNS_DIR, runId);
  if (!_fmRun.fileExists(dir)) _fmRun.createDirectory(dir, true);
  return dir;
}

function stagedDirForPersistent(runId) {
  const dir = _fmRun.joinPath(runDirForPersistent(runId), "staged");
  if (!_fmRun.fileExists(dir)) _fmRun.createDirectory(dir, true);
  return dir;
}

function manifestPathFor(runId) {
  return _fmRun.joinPath(runDirForPersistent(runId), "run.json");
}

function saveRun(state) {
  state.meta.updatedAt = nowIso();
  const path = manifestPathFor(state.meta.runId);
  writeJsonAtomic(path, state);
  // update sentinel
  const sentinel = {
    runId: state.meta.runId,
    path,
    updatedAt: state.meta.updatedAt,
    status: null,
  };
  writeJsonAtomic(LAST_RUN_PATH, sentinel);
}

function loadRunPersistent(runId) {
  const path = manifestPathFor(runId);
  if (!_fmRun.fileExists(path)) return null;
  return safeJsonParse(_fmRun.readString(path), null);
}

function loadLastRunPersistent() {
  if (!_fmRun.fileExists(LAST_RUN_PATH)) return null;
  const sentinel = safeJsonParse(_fmRun.readString(LAST_RUN_PATH), null);
  if (!sentinel?.runId) return null;
  return loadRunPersistent(sentinel.runId);
}

function listRunIds() {
  const names = _fmRun.listContents(RUNS_DIR) || [];
  return names.filter(name => name !== "last_run.json" && _fmRun.isDirectory(_fmRun.joinPath(RUNS_DIR, name)));
}

function loadLatestRecoverableRun() {
  const ids = listRunIds();
  const runs = ids.map(id => loadRunPersistent(id)).filter(Boolean);
  runs.sort((a, b) => String(b.meta?.updatedAt || 0).localeCompare(String(a.meta?.updatedAt || 0)));
  return runs.length > 0 ? runs[0] : null;
}

function hashString32(input) {
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function computeInvocationFingerprint(rawEntries) {
  const lines = (rawEntries ?? []).map((entry, index) => {
    const rawPath = normalizeCandidatePath(entry?.rawPath) || "";
    const sourceValue = String(entry?.sourceValue ?? "");
    const name = rawPath.split("/").pop() || "";
    return `${index + 1}|${rawPath}|${name}|${sourceValue}`;
  });
  const payload = `count=${lines.length};${lines.join(";")}`;
  return `fp-${hashString32(payload)}`;
}

function loadBridgeFallbackEntries({
  expectedCount = null,
  maxAgeMs = 60000,
  nowMs = Date.now(),
  expectedFingerprint = null,
  enforceFingerprintMatch = false,
  expectedInvocationId = null,
  enforceInvocationMatch = false,
  enforceCountMatch = false,
  allowStaleWhenDeadOutgoingOnly = false,
} = {}) {
  const base = { bridgeFingerprint: null, bridgeCount: 0 };
  if (!_fmRun.fileExists(BRIDGE_LATEST_REPORT_PATH)) {
    return { ok: false, reason: "bridge_fallback_missing_report", entries: [], ...base };
  }
  const report = safeJsonParse(_fmRun.readString(BRIDGE_LATEST_REPORT_PATH), null);
  if (!report) {
    return { ok: false, reason: "bridge_fallback_malformed_report", entries: [], ...base };
  }

  const staged = Array.isArray(report?.staged) ? report.staged : [];
  const bridgeFingerprint = String(report?.invocationFingerprint || computeInvocationFingerprint(report?.rawEntries || []));
  const bridgeCount = staged.length;
  const withReport = { bridgeFingerprint, bridgeCount };
  if (staged.length === 0) {
    return { ok: false, reason: "bridge_fallback_zero_staged_rows", entries: [], ...withReport };
  }

  if (enforceFingerprintMatch && expectedFingerprint && bridgeFingerprint !== String(expectedFingerprint)) {
    return { ok: false, reason: "stale_bridge_report_fingerprint_mismatch", entries: [], ...withReport };
  }

  const reportItemCount = Number(report?.itemCount ?? staged.length);
  if (enforceCountMatch && expectedCount != null && expectedCount > 0 && Number.isFinite(reportItemCount) && reportItemCount !== expectedCount) {
    return { ok: false, reason: "stale_bridge_report_count_mismatch", entries: [], ...withReport };
  }

  if (enforceInvocationMatch && expectedInvocationId) {
    const invocationId = report?.invocationId ? String(report.invocationId) : null;
    if (!invocationId || invocationId !== String(expectedInvocationId)) {
      return { ok: false, reason: "bridge_fallback_invocation_mismatch", entries: [], ...withReport };
    }
  }

  const createdMs = Date.parse(report?.createdAt ?? report?.generatedAt ?? "");
  if (!allowStaleWhenDeadOutgoingOnly && Number.isFinite(createdMs)) {
    const ageMs = nowMs - createdMs;
    if (ageMs > maxAgeMs) {
      return { ok: false, reason: "bridge_fallback_report_too_old", entries: [], ...withReport };
    }
  }

  const out = [];
  for (let i = 0; i < staged.length; i++) {
    const row = staged[i];
    const path = row?.stagedPath ? String(row.stagedPath) : null;
    if (!path) continue;
    if (!_fmRun.fileExists(path) || _fmRun.isDirectory(path)) continue;
    out.push({
      sourceChannel: "bridge_report",
      sourceIndex: i,
      sourceValue: path,
      rawPath: path,
      family: classifyPathFamily(path),
      existsAtCollect: true,
      fromBridgeReport: true,
      bridgeInvocationId: report?.invocationId ?? null,
    });
  }

  if (out.length === 0) {
    return { ok: false, reason: "bridge_fallback_no_live_staged_paths", entries: [], ...withReport };
  }
  if (enforceCountMatch && expectedCount != null && expectedCount > 0 && out.length !== expectedCount) {
    return { ok: false, reason: "stale_bridge_report_count_mismatch", entries: [], ...withReport };
  }

  return { ok: true, reason: null, entries: out, ...withReport };
}


function ingestInlineBridgeStyleFromArgs() {
  const lanes = [
    { key: "fileURLs", values: asArray(args.fileURLs) },
    { key: "shortcutParameter", values: asArray(args.shortcutParameter) },
    { key: "shortcutInput", values: asArray(args.shortcutInput) },
    { key: "urls", values: asArray(args.urls) },
  ];
  const runDir = _fmRun.joinPath(INLINE_BRIDGE_STAGE_ROOT, `inline-bridge-${Date.now()}`);
  if (!_fmRun.fileExists(runDir)) _fmRun.createDirectory(runDir, true);

  const out = [];
  const seen = new Set();
  let index = 0;
  for (const lane of lanes) {
    for (let i = 0; i < lane.values.length; i++) {
      const raw = lane.values[i];
      const srcPath = toLocalPath(raw);
      if (!srcPath || seen.has(srcPath)) continue;
      seen.add(srcPath);
      if (!_fmRun.fileExists(srcPath) || _fmRun.isDirectory(srcPath)) continue;
      const ext = extname(srcPath) || ".mov";
      const dstPath = _fmRun.joinPath(runDir, `clip_${String(index).padStart(4, "0")}${ext}`);
      try {
        _fmRun.copy(srcPath, dstPath);
      } catch (copyErr) {
        try {
          const data = _fmRun.read(srcPath);
          if (!data) throw new Error("read returned null data");
          _fmRun.write(dstPath, data);
        } catch (readErr) {
          try {
            const data = Data.fromFile(srcPath);
            if (!data) throw new Error("Data.fromFile returned null data");
            _fmRun.write(dstPath, data);
          } catch (_) {
            continue;
          }
        }
      }
      out.push({
        sourceChannel: "inline_bridge",
        sourceIndex: index,
        sourceValue: String(raw),
        rawPath: dstPath,
        family: classifyPathFamily(dstPath),
        existsAtCollect: true,
        fromInlineBridge: true,
      });
      index += 1;
    }
  }
  return out;
}

function clearLastRunPointer() {
  if (!_fmRun.fileExists(LAST_RUN_PATH)) return;
  try {
    _fmRun.remove(LAST_RUN_PATH);
  } catch (_) {}
}

function cleanupOldRuns({ keepRunId = null } = {}) {
  const names = _fmRun.listContents(RUNS_DIR) || [];
  for (const name of names) {
    if (name === "last_run.json") continue;
    if (keepRunId && name === keepRunId) continue;
    const fullPath = _fmRun.joinPath(RUNS_DIR, name);
    try {
      if (_fmRun.isDirectory(fullPath)) _fmRun.remove(fullPath);
    } catch (_) {}
  }
}

function hasBlockingFailuresBeforeIndex(state, index1) {
  return (state?.items ?? []).some(item => (
    item.index1 < index1 && (item.status === "failed" || item.status === "blocked")
  ));
}

function markRemainingItemsBlocked(state, reason, errorCode) {
  for (const item of state.items) {
    if (item.status === "queued" || item.status === "staged") {
      item.status = "blocked";
      item.note = reason;
      item.error = errorCode;
    }
  }
}

function isRetryableFailureItem(item) {
  const err = String(item?.error || "");
  const note = String(item?.note || "");
  const nonRetryableErrors = [
    "share_input_only_dead_outgoingtemp_paths",
    "source_unreadable_or_transient:file_not_found",
    "source_missing_path_property",
    "source_missing_raw_entry",
  ];
  if (nonRetryableErrors.includes(err)) return false;
  if (note.includes("Share input did not provide a live temp file path")) return false;
  if (item?.status !== "failed" && item?.status !== "blocked") return false;
  return true;
}

function deriveRetryableFailure(items) {
  const failed = (items ?? []).filter(item => item?.status === "failed" || item?.status === "blocked");
  if (failed.length === 0) return null;
  return failed.some(isRetryableFailureItem);
}

function stagePersistentSource(source, stagedPath) {
  if (source?.sourceType === "data" && source?.data) {
    try {
      const dataBytes = readDataLengthFromData(source.data);
      _fmRun.write(stagedPath, source.data);
      return {
        ok: true,
        method: "incoming_data",
        bytes: dataBytes ?? _fmRun.fileSize(stagedPath),
        debug: {
          resolvedPath: null,
          preferredPath: source?.preferredPath ?? null,
          rawPath: source?.rawPath ?? null,
          pathCandidates: source?.pathCandidates ?? [],
          family: classifyPathFamily(null),
          existedBeforeStage: null,
        },
        error: null,
      };
    } catch (dataWriteErr) {
      return {
        ok: false,
        method: null,
        bytes: null,
        error: `source_data_write_failed:${String(dataWriteErr)}`,
      };
    }
  }

  const fallbackSelection = choosePreferredPath([
    source?.preferredPath,
    source?.rawPath,
    source?.path,
    source?.originalPath,
    ...(source?.pathCandidates ?? []),
  ]);
  const srcPath = fallbackSelection.preferredPath ?? null;
  if (!srcPath) {
    return {
      ok: false,
      method: null,
      bytes: null,
      debug: {
        resolvedPath: null,
        preferredPath: source?.preferredPath ?? null,
        rawPath: source?.rawPath ?? null,
        pathCandidates: fallbackSelection.pathCandidates,
        family: classifyPathFamily(null),
        existedBeforeStage: null,
        hasPreferredPath: !!source?.preferredPath,
        hasRawPath: !!source?.rawPath,
        hasPath: !!source?.path,
        hasOriginalPath: !!source?.originalPath,
      },
      error: "source_missing_path_property",
    };
  }
  const srcExists = _fmRun.fileExists(srcPath) && !_fmRun.isDirectory(srcPath);
  if (!srcExists) {
    return {
      ok: false,
      method: null,
      bytes: null,
      debug: {
        resolvedPath: srcPath,
        preferredPath: source?.preferredPath ?? null,
        rawPath: source?.rawPath ?? null,
        pathCandidates: fallbackSelection.pathCandidates,
        family: classifyPathFamily(srcPath),
        existedBeforeStage: false,
      },
      error: "source_unreadable_or_transient:file_not_found",
    };
  }

  try {
    const data = Data.fromFile(srcPath);
    if (!data) throw new Error("Data.fromFile returned null data");
    const dataBytes = readDataLengthFromData(data);
    _fmRun.write(stagedPath, data);
    return {
      ok: true,
      method: "data_from_file",
      bytes: dataBytes ?? _fmRun.fileSize(stagedPath),
      debug: {
        resolvedPath: srcPath,
        preferredPath: source?.preferredPath ?? null,
        rawPath: source?.rawPath ?? null,
        pathCandidates: fallbackSelection.pathCandidates,
        family: classifyPathFamily(srcPath),
        existedBeforeStage: true,
      },
      error: null,
    };
  } catch (dataErr) {
    try {
      const data = _fmRun.read(srcPath);
      if (!data) throw new Error("read returned null data");
      const dataBytes = readDataLengthFromData(data);
      _fmRun.write(stagedPath, data);
      return {
        ok: true,
        method: "read_write",
        bytes: dataBytes ?? _fmRun.fileSize(stagedPath),
        debug: {
          resolvedPath: srcPath,
          preferredPath: source?.preferredPath ?? null,
          rawPath: source?.rawPath ?? null,
          pathCandidates: fallbackSelection.pathCandidates,
          family: classifyPathFamily(srcPath),
          existedBeforeStage: true,
        },
        error: null,
      };
    } catch (readWriteErr) {
      try {
        _fmRun.copy(srcPath, stagedPath);
        return {
          ok: true,
          method: "copy",
          bytes: _fmRun.fileSize(stagedPath),
          debug: {
            resolvedPath: srcPath,
            preferredPath: source?.preferredPath ?? null,
            rawPath: source?.rawPath ?? null,
            pathCandidates: fallbackSelection.pathCandidates,
            family: classifyPathFamily(srcPath),
            existedBeforeStage: true,
          },
          error: null,
        };
      } catch (copyErr) {
        return {
          ok: false,
          method: null,
          bytes: null,
          debug: {
            resolvedPath: srcPath,
            preferredPath: source?.preferredPath ?? null,
            rawPath: source?.rawPath ?? null,
            pathCandidates: fallbackSelection.pathCandidates,
            family: classifyPathFamily(srcPath),
            existedBeforeStage: true,
          },
          error:
            `source_unreadable_or_transient: data_from_file=${String(dataErr)} read_write=${String(readWriteErr)} copy=${String(copyErr)}`,
        };
      }
    }
  }
}

// Build a new persistent run state from incoming items. Staging is performed
// in a later step so the WebView can render immediately.
function createRunSkeletonPersistent(incomingItems) {
  const runId = makeRunId(incomingItems.length);
  const runDir = runDirForPersistent(runId);
  const stagedDir = stagedDirForPersistent(runId);
  const requestUrl = buildComposeUrl();
  const items = [];

  for (let i = 0; i < incomingItems.length; i++) {
    const incoming = incomingItems[i];
    const fallbackBase = `item_${i + 1}`;
    const base = incoming?.displayName || fallbackBase;
    const inferredExt = incoming?.sourceType === "path" ? (extname(incoming.path) || ".bin") : ".mov";
    const ext = inferredExt || ".bin";
    const stagedPath = _fmRun.joinPath(stagedDir, `clip_${String(i).padStart(4, "0")}${ext}`);
    const item = {
      id: `item-${i + 1}`,
      index1: i + 1,
      originalPath: incoming?.path ?? null,
      originalName: base,
      guessedKind: guessKind(base),
      originalReadableBytes: incoming?.originalReadableBytes ?? null,
      sourceType: incoming?.sourceType ?? "unknown",
      sourceChannel: incoming?.sourceChannel ?? "unknown",
      sourceIndex: incoming?.sourceIndex ?? i,
      sourceValue: incoming?.sourceValue ?? null,
      rawPath: incoming?.rawPath ?? null,
      preferredPath: incoming?.preferredPath ?? incoming?.path ?? null,
      pathCandidates: incoming?.pathCandidates ?? [],
      pathFamily: incoming?.pathFamily ?? classifyPathFamily(incoming?.path ?? null),
      debugRawSourceValue: incoming?.sourceValue ?? null,
      debugPreferredPath: incoming?.preferredPath ?? incoming?.path ?? null,
      debugPathCandidates: incoming?.pathCandidates ?? [],
      stagingDebug: null,
      stagedPath,
      stagedBytes: null,
      stageMethod: null,
      status: "queued",
      note: "Queued for staging",
      server: null,
      error: null,
      previewKind: "placeholder",
      previewUrl: null,
      previewLabel: null,
      previewIndexLabel: null,
    };

    const preview = buildPreviewDescriptor({
      name: item.originalName,
      kind: item.guessedKind,
      index1: item.index1,
    });
    item.previewKind = preview.previewKind;
    item.previewUrl = preview.previewUrl;
    item.previewLabel = preview.previewLabel;
    item.previewIndexLabel = preview.previewIndexLabel;

    items.push({
      ...item,
      originalReadableBytesHuman: humanBytes(item.originalReadableBytes),
      stagedBytesHuman: humanBytes(item.stagedBytes),
    });
  }

  const state = {
    meta: {
      project: PROJECT,
      mode: MODE,
      outputName: OUTPUT_NAME,
      source: SOURCE,
      runId,
      requestUrl,
      runDir,
      stagedDir,
      rawPathCount: incomingItems.filter(x => x.sourceType === "path").length,
      incomingCount: incomingItems.length,
      finalMedia: null,
    },
    items,
  };

  saveRun(state);
  return state;
}

async function stageRunInputsPersistent(wv, state, incomingItems) {
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    if (item.status !== "queued") continue;

    item.note = "Staging into Scriptable storage…";
    saveRun(state);
    await pushUI(wv, state);

    const incoming = incomingItems[i];
    const resolvedSourcePath =
      incoming?.preferredPath ??
      incoming?.rawPath ??
      incoming?.path ??
      incoming?.originalPath ??
      null;
    item.stagingDebug = {
      sourceType: incoming?.sourceType ?? null,
      hasPath: !!incoming?.path,
      hasOriginalPath: !!incoming?.originalPath,
      rawSourceValue: incoming?.sourceValue ?? null,
      normalizedPath: incoming?.path ?? null,
      hasPluginKitPath: !!incoming?.pathFamily?.isPluginKit,
      hasRunScriptIntentPath: !!incoming?.pathFamily?.isRunScriptIntent,
      hasOutgoingTempPath: !!incoming?.pathFamily?.isOutgoingTemp,
      resolvedPath: resolvedSourcePath,
      existedBeforeStage:
        !!resolvedSourcePath &&
        _fmRun.fileExists(resolvedSourcePath) &&
        !_fmRun.isDirectory(resolvedSourcePath),
    };
    const staged = stagePersistentSource(incoming, item.stagedPath);
    item.stagingDebug = {
      ...(item.stagingDebug ?? {}),
      ...(staged?.debug ?? {}),
      resolvedPath: staged?.debug?.resolvedPath ?? resolvedSourcePath,
    };
    if (staged.ok) {
      item.stagedBytes = staged.bytes;
      item.stageMethod = staged.method;
      item.status = "staged";
      item.note = `Staged via ${staged.method}`;
    } else {
      item.status = "failed";
      item.note = "Staging failed";
      item.error = staged.error;
    }
    item.stagedBytesHuman = humanBytes(item.stagedBytes);

    saveRun(state);
    await pushUI(wv, state);
  }
}

async function stageRunInputsPersistentFast(state, incomingItems) {
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    if (item.status !== "queued") continue;

    const incoming = incomingItems[i];
    const resolvedSourcePath =
      incoming?.preferredPath ??
      incoming?.rawPath ??
      incoming?.path ??
      incoming?.originalPath ??
      null;
    item.stagingDebug = {
      sourceType: incoming?.sourceType ?? null,
      hasPath: !!incoming?.path,
      hasOriginalPath: !!incoming?.originalPath,
      rawSourceValue: incoming?.sourceValue ?? null,
      normalizedPath: incoming?.path ?? null,
      hasPluginKitPath: !!incoming?.pathFamily?.isPluginKit,
      hasRunScriptIntentPath: !!incoming?.pathFamily?.isRunScriptIntent,
      hasOutgoingTempPath: !!incoming?.pathFamily?.isOutgoingTemp,
      resolvedPath: resolvedSourcePath,
      existedBeforeStage:
        !!resolvedSourcePath &&
        _fmRun.fileExists(resolvedSourcePath) &&
        !_fmRun.isDirectory(resolvedSourcePath),
    };
    const staged = stagePersistentSource(incoming, item.stagedPath);
    item.stagingDebug = {
      ...(item.stagingDebug ?? {}),
      ...(staged?.debug ?? {}),
      resolvedPath: staged?.debug?.resolvedPath ?? resolvedSourcePath,
    };
    if (staged.ok) {
      item.stagedBytes = staged.bytes;
      item.stageMethod = staged.method;
      item.status = "staged";
      item.note = `Staged via ${staged.method}`;
    } else {
      item.status = "failed";
      item.note = "Staging failed";
      item.error = staged.error;
    }
    item.stagedBytesHuman = humanBytes(item.stagedBytes);
  }
  saveRun(state);
}

// Process a single item in the run. This uploads one staged clip and updates
// the run state accordingly. It also updates the UI and persists state.
async function runOneStateStepPersistent(wv, state, options = {}) {
  const allowFinalJobPolling = options.allowFinalJobPolling !== false;
  const item = state.items.find(x => x.status === "staged");
  if (!item) return false;

  if (hasBlockingFailuresBeforeIndex(state, item.index1)) {
    const isFinalItem = item.index1 === state.items.length;
    item.status = "blocked";
    item.note = isFinalItem
      ? "Cannot finalize compose because earlier clips failed."
      : "Blocked from upload because earlier clips failed.";
    item.error = isFinalItem
      ? "client_prevented_finalization_missing_prior_indices"
      : "client_blocked_due_to_prior_failures";
    markRemainingItemsBlocked(
      state,
      "Run blocked until a fresh upload is started.",
      "client_blocked_due_to_prior_failures"
    );
    saveRun(state);
    await pushUI(wv, state);
    return true;
  }

  item.status = "uploading";
  item.note = "Uploading to compose session…";
  saveRun(state);
  await pushUI(wv, state);
  const result = await sendOneClip({
    filePath: item.stagedPath,
    fileIndex1: item.index1,
    totalCount: state.items.length,
    runId: state.meta.runId,
    url: state.meta.requestUrl,
  });
  if (!result.ok) {
    item.status = "failed";
    item.note = "Upload/request failed";
    item.error = result.error || "Unknown request error";
    item.server = {
      status: result.statusCode,
      raw: result.raw,
    };
    saveRun(state);
    await pushUI(wv, state);
    return true;
  }
  item.server = result.body || null;
  const code = result.statusCode ?? 0;
  if (code >= 400) {
    item.status = "failed";
    item.note = "Server returned error";
    item.error = `HTTP ${code}`;
    saveRun(state);
    await pushUI(wv, state);
    return true;
  }
  if (result.body?.status === "staged") {
    // Non-final clip accepted into compose session
    item.status = "accepted";
    item.note = result.body?.note || "Accepted into incremental compose session";
    saveRun(state);
    await pushUI(wv, state);
    return true;
  }
  const finalServer = result.body || null;
  if (
    finalServer?.status === "stored" &&
    (finalServer?.served?.stream_url || finalServer?.served?.download_url || finalServer?.stream_url || finalServer?.download_url)
  ) {
    item.status = "done";
    item.note = "Compose flow completed for final step";
    item.server = finalServer;
    state.meta.finalMedia = buildFinalMediaDescriptor(finalServer);
    saveRun(state);
    await pushUI(wv, state);
    return true;
  }

  if (finalServer?.job_url) {
    item.status = allowFinalJobPolling ? "uploading" : "accepted";
    item.note = allowFinalJobPolling
      ? "Compose job queued; waiting for backend worker to start."
      : "Submission complete. Compose job queued on backend. Reopen dashboard to inspect progress.";
    item.server = finalServer;
    state.meta.lastKnownJobUrl = finalServer.job_url;
    state.meta.lastKnownJobStatus = String(finalServer?.job_status || finalServer?.status || "queued");
    state.meta.lastKnownJobStartedAt = finalServer?.started_at ?? null;
    state.meta.submissionSucceeded = true;
    state.meta.submissionPendingInspect = !allowFinalJobPolling;
    saveRun(state);
    await pushUI(wv, state);

    if (!allowFinalJobPolling) return true;

    const polled = await pollComposeJobUntilComplete({
      jobUrl: finalServer.job_url,
      intervalMs: 1200,
      maxAttempts: 90,
    });

    if (!polled.ok) {
      item.status = "failed";
      item.note = "Compose job polling failed";
      item.error = polled.error || "compose_job_poll_timeout";
      item.server = polled.body || finalServer;
      if (polled.lastStatus || polled.lastStartedAt != null) {
        item.server = {
          ...(item.server ?? {}),
          poll_debug: {
            lastStatus: polled.lastStatus ?? null,
            lastStartedAt: polled.lastStartedAt ?? null,
          },
        };
      }
      saveRun(state);
      await pushUI(wv, state);
      return true;
    }

    item.status = "done";
    item.note = "Compose job completed and final media is ready";
    item.server = polled.body || finalServer;
    state.meta.finalMedia = buildFinalMediaDescriptor(item.server);
    saveRun(state);
    await pushUI(wv, state);
    return true;
  }

  item.status = "done";
  item.note = "Compose flow completed for final step";
  item.server = finalServer;
  saveRun(state);
  await pushUI(wv, state);
  return true;
}

// Drain the run by continuously processing staged items until none remain
async function drainRunPersistent(wv, state, options = {}) {
  while (true) {
    const stepped = await runOneStateStepPersistent(wv, state, options);
    if (!stepped) break;
  }
  return state;
}

function findPendingComposeJobItem(state) {
  if (state?.meta?.finalMedia) return null;
  const items = state?.items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item?.server?.job_url) continue;
    if (item.status === "done" && state.meta?.finalMedia) continue;
    return item;
  }
  return null;
}

async function refreshPendingComposeJobForInspect(state, { intervalMs = 1200, maxAttempts = 8 } = {}) {
  const item = findPendingComposeJobItem(state);
  if (!item?.server?.job_url) return false;

  const polled = await pollComposeJobUntilComplete({
    jobUrl: item.server.job_url,
    intervalMs,
    maxAttempts,
  });

  if (polled.ok) {
    item.status = "done";
    item.note = "Compose job completed and final media is ready";
    item.server = polled.body || item.server;
    state.meta.finalMedia = buildFinalMediaDescriptor(item.server);
    state.meta.submissionPendingInspect = false;
    state.meta.lastKnownJobStatus = "completed";
    saveRun(state);
    return true;
  }

  const status = polled.lastStatus || String(item.server?.job_status || item.server?.status || "queued");
  item.status = "accepted";
  item.note = "Submission complete. Compose job still running. Refresh status.";
  item.server = {
    ...(polled.body || item.server || {}),
    poll_debug: {
      lastStatus: polled.lastStatus ?? null,
      lastStartedAt: polled.lastStartedAt ?? null,
      inspectPollError: polled.error || null,
    },
  };
  state.meta.lastKnownJobStatus = status;
  state.meta.lastKnownJobStartedAt = polled.lastStartedAt ?? null;
  state.meta.submissionPendingInspect = true;
  saveRun(state);
  return true;
}

// --------------------------------------------------
// helpers
// --------------------------------------------------

function asArray(x) {
  return x == null ? [] : (Array.isArray(x) ? x : [x]);
}

function short(s, n = MAX_TEXT) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function sleep(ms) {
  return new Promise(resolve => {
    Timer.schedule(ms, false, resolve);
  });
}

function toLocalPath(v) {
  if (v == null) return null;
  let s = String(v);

  if (s.startsWith("file://")) {
    try {
      s = decodeURIComponent(s);
    } catch (_) {}
    return s.replace(/^file:\/\//, "").replace(/^\/+/, "/");
  }

  if (s.startsWith("/")) {
    try {
      s = decodeURIComponent(s);
    } catch (_) {}
    return s;
  }

  return null;
}

function normalizeCandidatePath(value) {
  const p = toLocalPath(value);
  return p ? p.replace(/\/+/g, "/") : null;
}

function classifyPathFamily(path) {
  const p = String(path || "");
  return {
    isPluginKit: p.includes("/Containers/Data/PluginKitPlugin/"),
    isRunScriptIntent: p.includes("/tmp/RunScriptIntent/"),
    isOutgoingTemp: p.includes("/var/mobile/Media/PhotoData/OutgoingTemp/"),
  };
}

function scorePath(path) {
  if (!path) return -9999;
  const family = classifyPathFamily(path);
  if (family.isPluginKit) return 300;
  if (family.isRunScriptIntent) return 200;
  if (family.isOutgoingTemp) return -100;
  return 0;
}

function choosePreferredPath(paths) {
  const unique = [];
  const seen = new Set();
  for (const path of paths || []) {
    const normalized = normalizeCandidatePath(path);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  unique.sort((a, b) => scorePath(b) - scorePath(a));
  return {
    preferredPath: unique[0] || null,
    pathCandidates: unique,
  };
}

function extname(path) {
  const m = String(path).match(/(\.[A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

function guessKind(path) {
  const ext = extname(path);
  if ([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"].includes(ext)) return "image";
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(ext)) return "audio";
  return "unknown";
}

function buildPreviewDescriptor({ name, kind, index1 }) {
  const ext = extname(name).replace(".", "").toUpperCase();
  const fallback = (kind || "FILE").slice(0, 4).toUpperCase();
  const label = ext || fallback;
  return {
    previewKind: "placeholder",
    previewUrl: null,
    previewLabel: label,
    previewIndexLabel: `#${String(index1).padStart(2, "0")}`,
  };
}

function normalizeResponseStatus(resp) {
  if (!resp) return null;
  if (typeof resp.statusCode === "number") return resp.statusCode;
  if (typeof resp.status === "number") return resp.status;
  return null;
}

function humanBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "--";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildComposeUrl() {
  return (
    `${BASE}/api/projects/${encodeURIComponent(PROJECT)}/compose/upload` +
    `?output_name=${encodeURIComponent(OUTPUT_NAME)}` +
    `&target_dir=${encodeURIComponent(TARGET_DIR)}` +
    `&mode=${encodeURIComponent(MODE)}` +
    (SOURCE ? `&source=${encodeURIComponent(SOURCE)}` : "")
  );
}

function makeRunId(fileCount) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ios-${Date.now()}-${fileCount}-${rand}`;
}

function isDataLike(value) {
  return !!value && typeof value.toBase64String === "function";
}

function readDataLengthFromData(data) {
  try {
    const b64 = data.toBase64String();
    const padding = (b64.match(/=*$/)?.[0]?.length) || 0;
    const bytes = Math.floor((b64.length * 3) / 4) - padding;
    return bytes >= 0 ? bytes : null;
  } catch (_) {
    return null;
  }
}

function inspectIncomingArgs() {
  function countEntries(value) {
    return asArray(value).length;
  }
  function stringifyEntry(value) {
    try {
      return short(String(value), 180);
    } catch (_) {
      return "<unstringifiable>";
    }
  }
  function mapEntries(value) {
    return asArray(value).slice(0, 6).map((entry, index) => ({
      index,
      type: typeof entry,
      dataLike: isDataLike(entry),
      value: stringifyEntry(entry),
    }));
  }
  return {
    argsKeys: Object.keys(args ?? {}),
    fileURLsType: typeof args?.fileURLs,
    shortcutInputType: typeof args?.shortcutInput,
    shortcutParameterType: typeof args?.shortcutParameter,
    urlsType: typeof args?.urls,
    fileURLsCount: countEntries(args?.fileURLs),
    shortcutInputCount: countEntries(args?.shortcutInput),
    shortcutParameterCount: countEntries(args?.shortcutParameter),
    urlsCount: countEntries(args?.urls),
    fileURLs: mapEntries(args?.fileURLs),
    shortcutInput: mapEntries(args?.shortcutInput),
    shortcutParameter: mapEntries(args?.shortcutParameter),
    urls: mapEntries(args?.urls),
  };
}

function deriveInputContractHints(incomingDebug, incomingItems) {
  const hints = [];
  const fileURLsCount = incomingDebug?.fileURLsCount ?? 0;
  const shortcutInputCount = incomingDebug?.shortcutInputCount ?? 0;
  const shortcutParameterCount = incomingDebug?.shortcutParameterCount ?? 0;
  const urlsCount = incomingDebug?.urlsCount ?? 0;

  if (fileURLsCount === 0 && shortcutInputCount > 0) {
    hints.push("No args.fileURLs detected; in Shortcuts set Run Script to Files = Shortcut Input and clear Images/Texts/URLs lanes.");
  }

  if (fileURLsCount > 0 && shortcutParameterCount > 0) {
    hints.push("fileURLs + shortcutParameter were both provided; dashboard is now using fileURLs only. Clear Parameter lane in Shortcuts.");
  }

  if ((shortcutParameterCount > 0 || urlsCount > 0) && fileURLsCount === 0) {
    hints.push("Shortcut passed parameter/url data; keep only Files lane populated for compose dashboard runs.");
  }

  if (incomingItems.length === 0 && (fileURLsCount + shortcutInputCount + shortcutParameterCount + urlsCount) > 0) {
    hints.push("Share input was received but no usable path/data entries were collectable.");
  }

  const hasOutgoingTempOnly = incomingItems.some(item => (
    item?.sourceType === "path" &&
    !!item?.pathFamily?.isOutgoingTemp &&
    !item?.pathCandidates?.some(candidate => {
      const f = classifyPathFamily(candidate);
      return f.isPluginKit || f.isRunScriptIntent;
    })
  ));
  if (hasOutgoingTempOnly) {
    hints.push("Incoming path resolved to Photos OutgoingTemp compatibility export; this path family is unstable.");
  }

  return hints;
}

function collectIncomingItems() {
  const allChannels = [
    { key: "fileURLs", values: asArray(args.fileURLs) },
    { key: "shortcutInput", values: asArray(args.shortcutInput) },
    { key: "shortcutParameter", values: asArray(args.shortcutParameter) },
    { key: "urls", values: asArray(args.urls) },
  ];

  const primaryChannel =
    allChannels.find(channel => channel.values.length > 0) ??
    { key: "none", values: [] };

  const channels = [primaryChannel];

  const out = [];
  const seen = new Set();

  for (const channel of channels) {
    for (let i = 0; i < channel.values.length; i++) {
      const raw = channel.values[i];
      const sourceValue = String(raw);
      const rawPath = normalizeCandidatePath(raw);
      if (rawPath) {
        const selection = choosePreferredPath([rawPath, sourceValue]);
        const preferredPath = selection.preferredPath ?? rawPath;
        const pathKey = `path:${preferredPath}`;
        if (seen.has(pathKey)) continue;
        seen.add(pathKey);
        out.push({
          sourceType: "path",
          sourceChannel: channel.key,
          sourceIndex: i,
          sourceValue,
          displayName: preferredPath.split("/").pop() || preferredPath,
          path: preferredPath,
          rawPath,
          preferredPath,
          pathCandidates: selection.pathCandidates,
          pathFamily: classifyPathFamily(preferredPath),
          data: null,
          originalReadableBytes: readDataLengthMaybe(preferredPath),
        });
        continue;
      }

      if (isDataLike(raw)) {
        const bytes = readDataLengthFromData(raw);
        const dataKey = `data:${channel.key}:${i}:${bytes ?? "?"}`;
        if (seen.has(dataKey)) continue;
        seen.add(dataKey);
        out.push({
          sourceType: "data",
          sourceChannel: channel.key,
          sourceIndex: i,
          sourceValue,
          displayName: `shared_${channel.key}_${String(i + 1).padStart(3, "0")}.mov`,
          path: null,
          data: raw,
          originalReadableBytes: bytes,
        });
      }
    }
  }

  return out;
}

function collectRawSharePaths() {
  const lanes = [
    { key: "fileURLs", values: asArray(args.fileURLs) },
    { key: "shortcutParameter", values: asArray(args.shortcutParameter) },
    { key: "shortcutInput", values: asArray(args.shortcutInput) },
    { key: "urls", values: asArray(args.urls) },
  ];
  const out = [];
  const seen = new Set();
  for (const lane of lanes) {
    for (let i = 0; i < lane.values.length; i++) {
      const raw = lane.values[i];
      const path = toLocalPath(raw);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const family = classifyPathFamily(path);
      out.push({
        sourceChannel: lane.key,
        sourceIndex: i,
        sourceValue: String(raw),
        rawPath: path,
        family,
        existsAtCollect: _fmRun.fileExists(path) && !_fmRun.isDirectory(path),
      });
    }
  }
  return out;
}

function summarizeRawPathEntries(rawEntries) {
  return (rawEntries ?? []).map(entry => ({
    sourceChannel: entry.sourceChannel,
    rawPath: entry.rawPath,
    pathFamily: entry.family?.isPluginKit
      ? "PluginKit"
      : entry.family?.isRunScriptIntent
        ? "RunScriptIntent"
        : entry.family?.isOutgoingTemp
          ? "OutgoingTemp"
          : "other",
    existsAtCollect: !!entry.existsAtCollect,
  }));
}

async function stageRawSharePathsImmediatelyIntoRun(state, rawEntries) {
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    const rawEntry = rawEntries[i];
    if (!rawEntry) {
      item.status = "failed";
      item.note = "Missing raw source entry";
      item.error = "source_missing_raw_entry";
      continue;
    }

    const srcPath = rawEntry.rawPath;
    item.stagingDebug = {
      sourceType: "path",
      hasPath: true,
      hasOriginalPath: !!item.originalPath,
      rawSourceValue: rawEntry.sourceValue,
      normalizedPath: srcPath,
      hasPluginKitPath: !!rawEntry.family?.isPluginKit,
      hasRunScriptIntentPath: !!rawEntry.family?.isRunScriptIntent,
      hasOutgoingTempPath: !!rawEntry.family?.isOutgoingTemp,
      family: rawEntry.family ?? classifyPathFamily(srcPath),
      pathCandidates: [srcPath],
      resolvedPath: srcPath,
      existedBeforeStage: !!rawEntry.existsAtCollect,
      sourceChannel: rawEntry.sourceChannel,
    };

    if (!_fmRun.fileExists(srcPath) || _fmRun.isDirectory(srcPath)) {
      item.status = "failed";
      item.note = "Staging failed";
      item.error = "source_unreadable_or_transient:file_not_found";
      item.stagedBytes = null;
      item.stageMethod = null;
      item.stagedBytesHuman = humanBytes(item.stagedBytes);
      continue;
    }

    try {
      _fmRun.copy(srcPath, item.stagedPath);
      item.stageMethod = "copy";
      item.stagedBytes = _fmRun.fileSize(item.stagedPath);
      item.status = "staged";
      item.note = "Staged via copy";
    } catch (copyErr) {
      try {
        const data = _fmRun.read(srcPath);
        if (!data) throw new Error("read returned null data");
        _fmRun.write(item.stagedPath, data);
        item.stageMethod = "read_write";
        item.stagedBytes = readDataLengthFromData(data) ?? _fmRun.fileSize(item.stagedPath);
        item.status = "staged";
        item.note = "Staged via read_write";
      } catch (readWriteErr) {
        try {
          const data = Data.fromFile(srcPath);
          if (!data) throw new Error("Data.fromFile returned null data");
          _fmRun.write(item.stagedPath, data);
          item.stageMethod = "data_from_file";
          item.stagedBytes = readDataLengthFromData(data) ?? _fmRun.fileSize(item.stagedPath);
          item.status = "staged";
          item.note = "Staged via data_from_file";
        } catch (dataErr) {
          item.status = "failed";
          item.note = "Staging failed";
          item.error =
            `source_unreadable_or_transient: copy=${String(copyErr)} read_write=${String(readWriteErr)} data_from_file=${String(dataErr)}`;
          item.stageMethod = null;
          item.stagedBytes = null;
        }
      }
    }
    item.stagedBytesHuman = humanBytes(item.stagedBytes);
  }
  saveRun(state);
}

function readDataLengthMaybe(path) {
  try {
    const data = Data.fromFile(path);
    if (!data) return null;
    const b64 = data.toBase64String();
    if (!b64) return null;
    const padding = (b64.match(/=*$/)?.[0]?.length) || 0;
    const bytes = Math.floor((b64.length * 3) / 4) - padding;
    return bytes >= 0 ? bytes : null;
  } catch (_) {
    return null;
  }
}

function buildFinalMediaDescriptor(server) {
  const served = server?.served ?? {};
  const streamUrl = served?.stream_url ?? server?.stream_url ?? null;
  const downloadUrl = served?.download_url ?? server?.download_url ?? null;
  const path = server?.path ?? served?.path ?? null;

  const playerUrl = streamUrl
    ? `${BASE}/player.html?src=${encodeURIComponent(streamUrl)}`
    : null;

  return {
    stream_url: streamUrl,
    download_url: downloadUrl,
    path,
    player_url: playerUrl,
    render_mode: playerUrl ? "iframe" : "video",
  };
}

function stateToBase64(state) {
  const json = JSON.stringify(state ?? {});
  return Data.fromString(json).toBase64String();
}

// --------------------------------------------------
// staging
// --------------------------------------------------

async function stabilizeSharedFile(srcPath, dstPath) {
  const fm = FileManager.local();

  if (!fm.fileExists(srcPath)) {
    throw new Error(`Source does not exist: ${srcPath}`);
  }

  try {
    fm.copy(srcPath, dstPath);
    return {
      method: "copy",
      path: dstPath,
      stagedBytes: fm.fileSize(dstPath),
    };
  } catch (copyErr) {
    try {
      const data = fm.read(srcPath);
      fm.write(dstPath, data);

      let bytes = null;
      try {
        bytes = fm.fileSize(dstPath);
      } catch (_) {}

      return {
        method: "read_write",
        path: dstPath,
        stagedBytes: bytes,
      };
    } catch (rwErr) {
      throw new Error(
        `Failed to stabilize file.\ncopy: ${String(copyErr)}\nread/write: ${String(rwErr)}`
      );
    }
  }
}

async function stageInputs(paths) {
  const fm = FileManager.local();

  const tempDir = fm.joinPath(fm.temporaryDirectory(), `compose_job_${Date.now()}`);
  fm.createDirectory(tempDir, true);

  const items = [];

  for (let i = 0; i < paths.length; i++) {
    const src = paths[i];
    const base = src.split("/").pop() || `item_${i + 1}`;
    const ext = extname(src) || ".bin";
    const dst = fm.joinPath(tempDir, `clip_${String(i).padStart(4, "0")}${ext}`);

    const item = {
      id: `item-${i + 1}`,
      index1: i + 1,
      originalPath: src,
      originalName: base,
      guessedKind: guessKind(src),
      originalReadableBytes: readDataLengthMaybe(src),
      stagedPath: null,
      stagedBytes: null,
      stageMethod: null,
      status: "queued",
      note: "Waiting to stage",
      server: null,
      error: null,
    };

    try {
      if (!STAGE_TO_TEMP) {
        item.stagedPath = src;
        item.stagedBytes = item.originalReadableBytes;
        item.stageMethod = "direct";
        item.status = "staged";
        item.note = "Using original path directly";
      } else {
        const stabilized = await stabilizeSharedFile(src, dst);
        item.stagedPath = stabilized.path;
        item.stagedBytes = stabilized.stagedBytes;
        item.stageMethod = stabilized.method;
        item.status = "staged";
        item.note = `Staged via ${stabilized.method}`;
      }
    } catch (e) {
      item.status = "failed";
      item.error = String(e);
      item.note = "Staging failed";
    }

    items.push(item);
  }

  return { tempDir, items };
}

// --------------------------------------------------
// webview ui
// --------------------------------------------------

function buildHTML() {
  return `
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Compose Job Dashboard</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #000;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    height: 100%;
  }
  body {
    display: flex;
    flex-direction: column;
  }
  .header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(18,18,18,.96);
    border-bottom: 1px solid #2a2a2a;
    padding: 68px 14px 12px;
    backdrop-filter: blur(10px);
  }
  .title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .meta {
    font-size: 12px;
    color: #aaa;
    line-height: 1.45;
    word-break: break-word;
  }
  .summary {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0,1fr));
    gap: 8px;
  }
  .pill {
    background: #151515;
    border: 1px solid #2b2b2b;
    border-radius: 10px;
    padding: 10px;
  }
  .pill .k {
    font-size: 11px;
    color: #999;
    margin-bottom: 4px;
  }
  .pill .v {
    font-size: 15px;
    font-weight: 700;
  }
  .result-panel {
    background: #0d0d0d;
    border: 1px solid #2a2a2a;
    border-radius: 16px;
    padding: 12px;
    margin: 12px 12px 0;
  }
  .result-title {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .result-meta {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 10px;
    word-break: break-word;
  }
  .result-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  .btn {
    display: inline-block;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #333;
    background: #181818;
    color: #fff;
    text-decoration: none;
    font-size: 12px;
  }
  .player-wrap {
    margin-top: 8px;
    border-radius: 12px;
    overflow: hidden;
    background: #111;
    border: 1px solid #222;
  }
  iframe.result-frame {
    display: block;
    width: 100%;
    height: 38vh;
    border: 0;
    background: #000;
  }
  video.result-video {
    display: block;
    width: 100%;
    max-height: 38vh;
    background: #000;
  }
  .hint {
    margin-top: 8px;
    font-size: 11px;
    color: #8f8f8f;
    line-height: 1.4;
  }
  .list {
    padding: 12px;
    overflow: auto;
    flex: 1;
  }
  .card {
    background: #101010;
    border: 1px solid #272727;
    border-radius: 14px;
    padding: 12px;
    margin-bottom: 10px;
  }
  .card-main {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .card-body {
    min-width: 0;
    flex: 1;
  }
  .thumb {
    width: 84px;
    height: 84px;
    border-radius: 12px;
    border: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex-shrink: 0;
    background: linear-gradient(180deg, #1a1a1a, #0f0f0f);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb-label {
    font-size: 12px;
    font-weight: 700;
    color: #d0d0d0;
    letter-spacing: 0.08em;
  }
  .thumb-index {
    font-size: 11px;
    color: #9d9d9d;
  }
  .thumb.accepted, .thumb.done {
    border-color: #275c33;
    background: linear-gradient(180deg, #102315, #0f1b12);
  }
  .thumb.failed {
    border-color: #6a2626;
    background: linear-gradient(180deg, #2c1010, #1e0e0e);
  }
  .thumb.blocked {
    border-color: #7a5925;
    background: linear-gradient(180deg, #2a1b07, #1f170d);
  }
  .row1 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .name {
    font-size: 14px;
    font-weight: 700;
    word-break: break-word;
  }
  .badge {
    flex-shrink: 0;
    font-size: 11px;
    border-radius: 999px;
    padding: 5px 8px;
    border: 1px solid #333;
    background: #181818;
    color: #ddd;
  }
  .badge.queued { background: #1a1a1a; color: #aaa; }
  .badge.staged { background: #122033; color: #8fc3ff; border-color: #23466e; }
  .badge.uploading { background: #2a2008; color: #ffd36d; border-color: #6f5a22; }
  .badge.accepted { background: #102315; color: #87df9b; border-color: #275c33; }
  .badge.done { background: #0f2a1b; color: #7ef0a3; border-color: #296942; }
  .badge.failed { background: #2c1010; color: #ff8f8f; border-color: #6a2626; }
  .badge.blocked { background: #2a1b07; color: #f7ce86; border-color: #7a5925; }
  .sub {
    font-size: 12px;
    color: #aaa;
    line-height: 1.45;
    word-break: break-word;
  }
  .path {
    margin-top: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: #8f8f8f;
    word-break: break-all;
  }
  .debug-mini {
    margin-top: 6px;
    font-size: 11px;
    color: #8d8d8d;
    line-height: 1.4;
    word-break: break-word;
  }
  .server {
    margin-top: 8px;
    padding: 8px;
    background: #0b0b0b;
    border: 1px solid #232323;
    border-radius: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: #cfcfcf;
    white-space: pre-wrap;
    word-break: break-word;
  }
  details.server-details {
    margin-top: 8px;
  }
  details.server-details > summary {
    font-size: 12px;
    color: #a7a7a7;
    cursor: pointer;
    list-style: none;
  }
  details.server-details > summary::-webkit-details-marker {
    display: none;
  }
  .action-root { margin-top: 8px; }
  .action-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .action-note {
    font-size: 11px;
    color: #a8a8a8;
    line-height: 1.3;
  }
  .action-btn {
    display: inline-block;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid #3b3b3b;
    background: #171717;
    color: #f2f2f2;
    font-size: 12px;
    text-decoration: none;
  }
  .action-btn.retryable {
    border-color: #275c33;
    background: #102315;
    color: #95e6aa;
  }
  .action-btn.non-retryable {
    border-color: #7a5925;
    background: #2a1b07;
    color: #f7ce86;
  }
  details.run-debug-details {
    margin-top: 8px;
    font-size: 12px;
    color: #a9a9a9;
  }
  details.run-debug-details > summary {
    cursor: pointer;
    list-style: none;
  }
  details.run-debug-details > summary::-webkit-details-marker {
    display: none;
  }
  .run-debug-body {
    margin-top: 8px;
    padding: 8px;
    border: 1px solid #232323;
    border-radius: 10px;
    background: #0d0d0d;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: #b7b7b7;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .hidden {
    display: none !important;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title">Compose Job Dashboard</div>
    <div class="meta" id="meta">Preparing…</div>
    <div class="summary">
      <div class="pill">
        <div class="k">Total</div>
        <div class="v" id="sum-total">0</div>
      </div>
      <div class="pill">
        <div class="k">Progress</div>
        <div class="v" id="sum-done">0</div>
      </div>
      <div class="pill">
        <div class="k">Failed</div>
        <div class="v" id="sum-failed">0</div>
      </div>
    </div>
    <div id="action-root" class="action-root"></div>
    <details id="run-debug-details" class="run-debug-details">
      <summary>Run debug details</summary>
      <div id="run-debug-body" class="run-debug-body">No debug data.</div>
    </details>
  </div>

  <div id="result-root" class="hidden"></div>
  <div class="list" id="list"></div>

<script>
  window.STATE = { meta: {}, items: [] };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderResult(meta) {
    const root = document.getElementById("result-root");
    const finalMedia = meta && meta.finalMedia ? meta.finalMedia : null;

    if (!finalMedia) {
      root.className = "hidden";
      root.innerHTML = "";
      return;
    }

    const streamUrl = finalMedia.stream_url || "";
    const downloadUrl = finalMedia.download_url || "";
    const playerUrl = finalMedia.player_url || "";
    const path = finalMedia.path || "";
    const mode = finalMedia.render_mode || "iframe";

    let playerHtml = "";

    if (mode === "iframe" && playerUrl) {
      playerHtml =
        '<div class="player-wrap">' +
          '<iframe class="result-frame" src="' + esc(playerUrl) + '" allow="autoplay; fullscreen"></iframe>' +
        '</div>' +
        '<div class="hint">If the player area stays blank, tap Open player.</div>';
    } else if (streamUrl) {
      playerHtml =
        '<div class="player-wrap">' +
          '<video class="result-video" controls playsinline preload="metadata" src="' + esc(streamUrl) + '"></video>' +
        '</div>';
    }

    root.className = "result-panel";
    root.innerHTML =
      '<div class="result-title">Composed Output</div>' +
      '<div class="result-meta">' + esc(path || streamUrl || downloadUrl || "No output path") + '</div>' +
      '<div class="result-links">' +
        (playerUrl ? '<a class="btn" href="' + esc(playerUrl) + '">Open player</a>' : '') +
        (streamUrl ? '<a class="btn" href="' + esc(streamUrl) + '">Open stream URL</a>' : '') +
        (downloadUrl ? '<a class="btn" href="' + esc(downloadUrl) + '">Open download URL</a>' : '') +
      '</div>' +
      playerHtml;
  }

  function renderAction(meta, items) {
    const root = document.getElementById("action-root");
    const hasFailures = items.some(item => item.status === "failed" || item.status === "blocked");
    const retryable = meta.retryableFailure === true;
    if (!hasFailures) {
      root.innerHTML = "";
      return;
    }
    if (retryable) {
      root.innerHTML =
        '<div class="action-row">' +
          '<span class="action-btn retryable">Retry upload</span>' +
          '<span class="action-note">Re-run shortcut to resume persisted run.</span>' +
        '</div>';
      return;
    }
    root.innerHTML =
      '<div class="action-row">' +
        '<span class="action-btn non-retryable">Re-share from Photos</span>' +
        '<span class="action-note">Current share paths are no longer live.</span>' +
      '</div>';
  }

  function renderRunDebug(meta) {
    const details = document.getElementById("run-debug-details");
    const body = document.getElementById("run-debug-body");
    const debug = {
      recoveryPathUsed: meta.recoveryPathUsed || "none",
      inlineBridgeRecoveredCount: meta.inlineBridgeRecoveredCount ?? 0,
      bridgeReportRecoveredCount: meta.bridgeReportRecoveredCount ?? 0,
      bridgeReportRejectReason: meta.bridgeReportRejectReason || null,
      currentInvocationFingerprint: meta.currentInvocationFingerprint || null,
      bridgeInvocationFingerprint: meta.bridgeInvocationFingerprint || null,
      fallbackCurrentCount: meta.fallbackCurrentCount ?? 0,
      fallbackBridgeCount: meta.fallbackBridgeCount ?? 0,
      retryableFailure: meta.retryableFailure == null ? null : !!meta.retryableFailure,
      fallbackRecoveryDebug: meta.fallbackRecoveryDebug || null,
    };
    body.textContent = JSON.stringify(debug, null, 2);
    details.open = false;
  }

  function render() {
    const state = window.STATE || { meta: {}, items: [] };
    const meta = state.meta || {};
    const items = state.items || [];

    const hints = Array.isArray(meta.inputHints) ? meta.inputHints : [];
    const headerText =
      (meta.project || "--") + " · " +
      (meta.mode || "--") + " · " +
      (meta.outputName || "--") + " · " +
      (meta.runId || "--");
    const warningLine = hints.length ? "⚠ " + hints.join(" | ") : "";
    const modeLine = meta.invocationMode === "submit"
      ? "Submitted. Reopen dashboard to inspect progress."
      : "";
    const metaLines = [headerText, warningLine, modeLine].filter(Boolean);
    document.getElementById("meta").textContent = metaLines.join("\\n");

    document.getElementById("sum-total").textContent = String(items.length);
    document.getElementById("sum-done").textContent = String(items.filter(x => x.status === "accepted" || x.status === "done").length);
    document.getElementById("sum-failed").textContent = String(items.filter(x => x.status === "failed" || x.status === "blocked").length);

    renderResult(meta);
    renderAction(meta, items);
    renderRunDebug(meta);

    const list = document.getElementById("list");
    list.innerHTML = items.map(item => {
      const badge = esc(item.status || "queued");
      const previewKind = item.previewKind || "placeholder";
      const previewLabel = esc(item.previewLabel || "FILE");
      const previewIndexLabel = esc(item.previewIndexLabel || "");
      const previewUrl = item.previewUrl ? esc(item.previewUrl) : "";
      const thumbHtml = previewKind === "data_url" && previewUrl
        ? '<div class="thumb ' + badge + '"><img src="' + previewUrl + '" alt="preview" /></div>'
        : '<div class="thumb ' + badge + '">' +
            '<div class="thumb-label">' + previewLabel + '</div>' +
            (previewIndexLabel ? '<div class="thumb-index">' + previewIndexLabel + '</div>' : '') +
          '</div>';
      const serverBlock = item.server
        ? '<details class="server-details"><summary>Server details</summary><div class="server">' + esc(JSON.stringify(item.server, null, 2)) + '</div></details>'
        : '';

      return (
        '<div class="card">' +
          '<div class="card-main">' +
            thumbHtml +
            '<div class="card-body">' +
              '<div class="row1">' +
                '<div class="name">' + esc(item.index1) + '. ' + esc(item.originalName) + '</div>' +
                '<div class="badge ' + badge + '">' + badge + '</div>' +
              '</div>' +
              '<div class="sub">' +
                'kind: ' + esc(item.guessedKind) + ' · ' +
                'readable: ' + esc(item.originalReadableBytesHuman || "--") + ' · ' +
                'staged: ' + esc(item.stagedBytesHuman || "--") + ' · ' +
                'method: ' + esc(item.stageMethod || "--") +
              '</div>' +
              '<div class="sub" style="margin-top:6px;">' + esc(item.note || "") + '</div>' +
              (item.error ? '<div class="sub" style="margin-top:6px;color:#ff9b9b;">' + esc(item.error) + '</div>' : '') +
              (item.stagingDebug ? (
                '<details class="server-details"><summary>Staging debug</summary><div class="debug-mini">' +
                  'srcType=' + esc(item.stagingDebug.sourceType || "--") + ' · ' +
                  'path=' + esc(item.stagingDebug.hasPath ? "yes" : "no") + ' · ' +
                  'origPath=' + esc(item.stagingDebug.hasOriginalPath ? "yes" : "no") + ' · ' +
                  'exists=' + esc(item.stagingDebug.existedBeforeStage ? "yes" : "no") + '<br>' +
                  'raw=' + esc(item.stagingDebug.rawSourceValue || "--") + '<br>' +
                  'normalized=' + esc(item.stagingDebug.normalizedPath || "--") + '<br>' +
                  'pluginKit=' + esc(item.stagingDebug.hasPluginKitPath ? "yes" : "no") + ' · ' +
                  'runIntent=' + esc(item.stagingDebug.hasRunScriptIntentPath ? "yes" : "no") + ' · ' +
                  'outgoing=' + esc(item.stagingDebug.hasOutgoingTempPath ? "yes" : "no") + '<br>' +
                  'family=' + esc(
                    item.stagingDebug?.family?.isPluginKit
                      ? "PluginKit"
                      : item.stagingDebug?.family?.isRunScriptIntent
                        ? "RunScriptIntent"
                        : item.stagingDebug?.family?.isOutgoingTemp
                          ? "OutgoingTemp"
                          : "other"
                  ) + ' · ' +
                  'candidates=' + esc((item.stagingDebug.pathCandidates || []).length) + '<br>' +
                  'resolved=' + esc(item.stagingDebug.resolvedPath || "--") +
                '</div></details>'
              ) : '') +
              '<div class="path">' + esc(item.stagedPath || item.originalPath || "") + '</div>' +
            '</div>' +
          '</div>' +
          serverBlock +
        '</div>'
      );
    }).join("");
  }

  window.setState = function (nextState) {
    window.STATE = nextState || { meta: {}, items: [] };
    render();
  };

  render();
</script>
</body>
</html>
`;
}

async function pushUI(wv, state) {
  if (!wv) return;
  async function evalState(nextState) {
    const payloadB64 = stateToBase64(nextState);
    return wv.evaluateJavaScript(
      `
        (function () {
          try {
            const json = atob(${JSON.stringify(payloadB64)});
            const parsed = JSON.parse(json);
            window.setState(parsed);
            return "ok";
          } catch (e) {
            document.body.innerHTML = "<pre style='color:white;background:black;padding:16px;white-space:pre-wrap;word-break:break-word;'>" + String(e) + "</pre>";
            return "error:" + String(e);
          }
        })();
      `,
      false
    );
  }

  try {
    await evalState(state);
  } catch (_) {
    const compactState = {
      meta: {
        project: state?.meta?.project ?? null,
        mode: state?.meta?.mode ?? null,
        outputName: state?.meta?.outputName ?? null,
        runId: state?.meta?.runId ?? null,
        inputHints: state?.meta?.inputHints ?? [],
        finalMedia: state?.meta?.finalMedia ?? null,
      },
      items: (state?.items ?? []).map(item => ({
        index1: item?.index1,
        originalName: item?.originalName,
        guessedKind: item?.guessedKind,
        originalReadableBytesHuman: item?.originalReadableBytesHuman ?? "--",
        stagedBytesHuman: item?.stagedBytesHuman ?? "--",
        stageMethod: item?.stageMethod ?? null,
        status: item?.status ?? "queued",
        note: item?.note ?? null,
        error: item?.error ? short(item.error, 160) : null,
        previewKind: item?.previewKind ?? "placeholder",
        previewUrl: item?.previewUrl ?? null,
        previewLabel: item?.previewLabel ?? null,
        previewIndexLabel: item?.previewIndexLabel ?? null,
        stagingDebug: item?.stagingDebug ?? null,
        stagedPath: item?.stagedPath ?? null,
        originalPath: item?.originalPath ?? null,
      })),
    };
    await evalState(compactState);
  }
}

async function presentDashboardWebView(wv, state) {
  await wv.loadHTML(buildHTML());
  await pushUI(wv, state);
  // Scriptable paints more reliably when this is a final awaited report view.
  try {
    await wv.present(false);
  } catch (_) {
    await wv.present(true);
  }
}

// --------------------------------------------------
// upload
// --------------------------------------------------

function guessMimeTypeFromPath(path) {
  const ext = extname(path);
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".m4v") return "video/x-m4v";
  if (ext === ".avi") return "video/x-msvideo";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".webm") return "video/webm";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

function addMultipartFileWithFallback(req, filePath, fieldName, filename) {
  try {
    req.addFileToMultipart(filePath, fieldName, filename);
    return "file_path";
  } catch (_) {
    const data = Data.fromFile(filePath);
    if (!data) throw new Error(`Failed to read staged file for multipart fallback: ${filePath}`);
    req.addFileDataToMultipart(data, guessMimeTypeFromPath(filePath), fieldName, filename);
    return "file_data";
  }
}

async function sendOneClip({ filePath, fileIndex1, totalCount, runId, url }) {
  const filename = String(filePath).split("/").pop() || `clip_${fileIndex1}.mov`;

  const req = new Request(url);
  req.method = "POST";
  req.headers = {
    "X-Compose-Time": runId,
    "X-Compose-Index": String(fileIndex1),
    "X-Compose-Count": String(totalCount),
  };

  addMultipartFileWithFallback(req, filePath, "files", filename);
  req.addParameterToMultipart("client", "scriptable-dashboard");
  req.addParameterToMultipart("file_count", "1");

  try {
    const json = await req.loadJSON();
    return {
      ok: true,
      statusCode: normalizeResponseStatus(req.response),
      body: json,
    };
  } catch (e1) {
    const req2 = new Request(url);
    req2.method = "POST";
    req2.headers = {
      "X-Compose-Time": runId,
      "X-Compose-Index": String(fileIndex1),
      "X-Compose-Count": String(totalCount),
    };
    addMultipartFileWithFallback(req2, filePath, "files", filename);
    req2.addParameterToMultipart("client", "scriptable-dashboard");
    req2.addParameterToMultipart("file_count", "1");

    let raw = "";
    try {
      raw = await req2.loadString();
    } catch (e2) {
      raw = `loadString failed: ${String(e2)}`;
    }

    return {
      ok: false,
      statusCode: normalizeResponseStatus(req2.response),
      error: String(e1),
      raw,
    };
  }
}

async function pollComposeJobUntilComplete({
  jobUrl,
  intervalMs = 1200,
  maxAttempts = 90,
  queuedNoStartMaxAttempts = 25,
} = {}) {
  let queuedNoStartAttempts = 0;
  let lastStatus = null;
  let lastStartedAt = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const req = new Request(jobUrl);
    req.method = "GET";

    let body = null;
    try {
      body = await req.loadJSON();
    } catch (e) {
      if (attempt === maxAttempts - 1) {
        return {
          ok: false,
          error: `compose_job_poll_timeout:job_poll_failed:${String(e)}`,
          body: null,
          lastStatus,
          lastStartedAt,
        };
      }
      await sleep(intervalMs);
      continue;
    }

    const served = body?.served ?? null;
    const hasFinalMedia = !!(served?.stream_url || served?.download_url || body?.stream_url || body?.download_url);
    if (hasFinalMedia) {
      return { ok: true, body };
    }

    const status = String(body?.job_status ?? body?.status ?? "").toLowerCase();
    lastStatus = status || null;
    lastStartedAt = body?.started_at ?? null;
    if (status === "queued" && !body?.started_at) {
      queuedNoStartAttempts += 1;
      if (queuedNoStartAttempts >= queuedNoStartMaxAttempts) {
        return {
          ok: false,
          error: "compose_job_poll_timeout:queued_not_started",
          body,
          lastStatus,
          lastStartedAt,
        };
      }
    } else {
      queuedNoStartAttempts = 0;
    }
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      return { ok: false, error: `job_terminal_state:${status}`, body, lastStatus, lastStartedAt };
    }

    await sleep(intervalMs);
  }

  return {
    ok: false,
    error: "compose_job_poll_timeout:max_attempts_exceeded",
    body: null,
    lastStatus,
    lastStartedAt,
  };
}

// --------------------------------------------------
// main flow
// --------------------------------------------------

async function main() {
  const submitMode = (asArray(args.fileURLs).length + asArray(args.shortcutInput).length + asArray(args.shortcutParameter).length + asArray(args.urls).length) > 0;
  const incomingDebug = inspectIncomingArgs();
  const incomingItems = collectIncomingItems();
  let rawPathEntries = collectRawSharePaths();
  const inputHints = deriveInputContractHints(incomingDebug, incomingItems);
  let inlineBridgeIngestUsed = false;
  let reportBridgeFallbackUsed = false;
  let recoveryPathUsed = rawPathEntries.length > 0 ? "direct_path" : "none";
  let inlinePrimaryAttempted = false;
  let inlinePrimaryRecoveredCount = 0;
  let inlinePrimaryRejectReason = null;

  if (rawPathEntries.length > 0) {
    inlinePrimaryAttempted = true;
    const primaryInlineEntries = ingestInlineBridgeStyleFromArgs();
    inlinePrimaryRecoveredCount = primaryInlineEntries.length;
    if (primaryInlineEntries.length > 0 && primaryInlineEntries.length === rawPathEntries.length) {
      rawPathEntries = primaryInlineEntries;
      inlineBridgeIngestUsed = true;
      recoveryPathUsed = "inline_bridge";
      inputHints.push(
        `Primary durable ingest succeeded in current invocation (${primaryInlineEntries.length} staged).`
      );
    } else if (primaryInlineEntries.length > 0 && primaryInlineEntries.length !== rawPathEntries.length) {
      inlinePrimaryRejectReason = "inline_primary_count_mismatch";
      inputHints.push(
        `Primary inline ingest skipped due to count mismatch (raw=${rawPathEntries.length}, inline=${primaryInlineEntries.length}).`
      );
    } else {
      inlinePrimaryRejectReason = "inline_primary_no_live_paths";
    }
  }

  const currentInvocationFingerprint = computeInvocationFingerprint(rawPathEntries);
  const fallbackRecoveryDebug = {
    deadOutgoingTempOnly: false,
    inlinePrimaryAttempted,
    inlinePrimaryRecoveredCount,
    inlinePrimaryRejectReason,
    inlineBridgeAttempted: false,
    inlineBridgeRecoveredCount: 0,
    bridgeReportAttempted: false,
    bridgeReportRecoveredCount: 0,
    bridgeReportRejectReason: null,
    currentFingerprint: currentInvocationFingerprint,
    bridgeFingerprint: null,
    currentCount: rawPathEntries.length,
    bridgeCount: 0,
    recoveryPathUsed,
  };

  let deadOutgoingTempOnly =
    rawPathEntries.length > 0 &&
    rawPathEntries.every(entry => entry.family?.isOutgoingTemp && !entry.existsAtCollect);
  fallbackRecoveryDebug.deadOutgoingTempOnly = deadOutgoingTempOnly;

  if (deadOutgoingTempOnly) {
    fallbackRecoveryDebug.inlineBridgeAttempted = true;
    const inlineBridgeEntries = ingestInlineBridgeStyleFromArgs();
    fallbackRecoveryDebug.inlineBridgeRecoveredCount = inlineBridgeEntries.length;
    if (inlineBridgeEntries.length > 0) {
      rawPathEntries = inlineBridgeEntries;
      deadOutgoingTempOnly = false;
      inlineBridgeIngestUsed = true;
      inputHints.push(
        `Incoming share paths were dead OutgoingTemp entries; recovered by inline bridge-style durable ingest in this invocation (${inlineBridgeEntries.length} staged).`
      );
    } else {
      fallbackRecoveryDebug.bridgeReportAttempted = true;
      const bridgeFallback = loadBridgeFallbackEntries({
        expectedCount: rawPathEntries.length,
        expectedFingerprint: currentInvocationFingerprint,
        allowStaleWhenDeadOutgoingOnly: true,
      });
      fallbackRecoveryDebug.bridgeReportRejectReason = bridgeFallback.ok ? null : bridgeFallback.reason || "bridge_fallback_unknown_reject";
      fallbackRecoveryDebug.bridgeReportRecoveredCount = bridgeFallback.entries.length;
      fallbackRecoveryDebug.bridgeFingerprint = bridgeFallback.bridgeFingerprint ?? null;
      fallbackRecoveryDebug.bridgeCount = Number(bridgeFallback.bridgeCount || 0);

      if (bridgeFallback.ok && bridgeFallback.entries.length > 0) {
        rawPathEntries = bridgeFallback.entries;
        deadOutgoingTempOnly = false;
        reportBridgeFallbackUsed = true;
        fallbackRecoveryDebug.recoveryPathUsed = "bridge_report";
        inputHints.push(
          "Recovered using bridge-staged files."
        );
      } else {
        fallbackRecoveryDebug.recoveryPathUsed = inlineBridgeIngestUsed ? "inline_bridge" : "none";
        inputHints.push(
          "Dead OutgoingTemp recovery failed: no usable inline or bridge-staged files."
        );
      }
    }
  }
  const rawPaths = rawPathEntries.map(x => x.rawPath);
  if (!reportBridgeFallbackUsed && !inlineBridgeIngestUsed && rawPathEntries.length > 0) {
    fallbackRecoveryDebug.recoveryPathUsed = "direct_path";
  } else if (inlineBridgeIngestUsed) {
    fallbackRecoveryDebug.recoveryPathUsed = "inline_bridge";
  }
  const inputFamilySummary = summarizeRawPathEntries(rawPathEntries);
  if (deadOutgoingTempOnly) {
    inputHints.push(
      "Share input paths were dead; re-share from Photos to retry."
    );
  }

  if (incomingItems.length > 0 || rawPathEntries.length > 0) {
    clearLastRunPointer();
    cleanupOldRuns();
  }

  // When no new files are provided, try to resume the most recent unfinished run
  if (!incomingItems.length) {
    let state = loadLastRunPersistent() || loadLatestRecoverableRun();
    if (!state) {
      return {
        ok: false,
        reason: "No usable share input received from Shortcuts/share sheet and no previous run found to resume.",
        incomingDebug,
        inputHints,
        inputFamilySummary,
      };
    }
    await refreshPendingComposeJobForInspect(state, { intervalMs: 1200, maxAttempts: 8 });
    await drainRunPersistent(null, state, { allowFinalJobPolling: true });
    state.meta.retryableFailure = deriveRetryableFailure(state.items);
    state.meta.recoveryPathUsed = state.meta.recoveryPathUsed || "none";
    state.meta.invocationMode = "inspect";
    saveRun(state);
    const wv = new WebView();
    await presentDashboardWebView(wv, state);
    const completedCount = state.items.filter(x => x.status === "done" || x.status === "accepted").length;
    const failedCount = state.items.filter(x => x.status === "failed").length;
    return {
      ok: true,
      mode: "incremental-dashboard-resumed",
      runId: state.meta.runId,
      requestUrl: state.meta.requestUrl,
      stagedDir: state.meta.stagedDir,
      rawPaths: [],
      invocationMode: "inspect",
      incomingDebug,
      inputHints,
      inputFamilySummary,
      bridgeFallbackUsed: !!state.meta.bridgeFallbackUsed,
      inlineBridgeIngestUsed: !!state.meta.inlineBridgeIngestUsed,
      reportBridgeFallbackUsed: !!state.meta.reportBridgeFallbackUsed,
      deadOutgoingTempOnly: !!state.meta.deadOutgoingTempOnly,
      inlineBridgeAttempted: !!state.meta.inlineBridgeAttempted,
      inlineBridgeRecoveredCount: Number(state.meta.inlineBridgeRecoveredCount || 0),
      bridgeReportAttempted: !!state.meta.bridgeReportAttempted,
      bridgeReportRecoveredCount: Number(state.meta.bridgeReportRecoveredCount || 0),
      bridgeReportRejectReason: state.meta.bridgeReportRejectReason || null,
      currentInvocationFingerprint: state.meta.currentInvocationFingerprint || null,
      bridgeInvocationFingerprint: state.meta.bridgeInvocationFingerprint || null,
      fallbackCurrentCount: Number(state.meta.fallbackCurrentCount || 0),
      fallbackBridgeCount: Number(state.meta.fallbackBridgeCount || 0),
      retryableFailure: state.meta.retryableFailure == null ? null : !!state.meta.retryableFailure,
      recoveryPathUsed: state.meta.recoveryPathUsed || "none",
      submissionSucceeded: !!state.meta.submissionSucceeded,
      submissionPendingInspect: !!state.meta.submissionPendingInspect,
      lastKnownJobUrl: state.meta.lastKnownJobUrl || null,
      lastKnownJobStatus: state.meta.lastKnownJobStatus || null,
      lastKnownJobStartedAt: state.meta.lastKnownJobStartedAt || null,
      totalCount: state.items.length,
      completedCount,
      failedCount,
      finalMedia: state.meta.finalMedia ?? null,
      items: state.items,
    };
  }
  // Otherwise, create a new run with incoming files.
  const incomingForFreshRun = rawPathEntries.length > 0
    ? rawPathEntries.map(entry => ({
        sourceType: "path",
        sourceChannel: entry.sourceChannel,
        sourceIndex: entry.sourceIndex,
        sourceValue: entry.sourceValue,
        displayName: entry.rawPath.split("/").pop() || entry.rawPath,
        path: entry.rawPath,
        rawPath: entry.rawPath,
        preferredPath: entry.rawPath,
        pathCandidates: [entry.rawPath],
        pathFamily: entry.family,
        data: null,
        originalReadableBytes: readDataLengthMaybe(entry.rawPath),
      }))
    : incomingItems;
  const state = createRunSkeletonPersistent(incomingForFreshRun);
  state.meta.incomingDebug = incomingDebug;
  state.meta.inputHints = inputHints;
  state.meta.inputFamilySummary = inputFamilySummary;
  state.meta.bridgeFallbackUsed = rawPathEntries.some(entry => !!entry.fromBridgeReport);
  state.meta.inlineBridgeIngestUsed = inlineBridgeIngestUsed;
  state.meta.reportBridgeFallbackUsed = reportBridgeFallbackUsed;
  state.meta.fallbackRecoveryDebug = fallbackRecoveryDebug;
  state.meta.deadOutgoingTempOnly = fallbackRecoveryDebug.deadOutgoingTempOnly;
  state.meta.inlineBridgeAttempted = fallbackRecoveryDebug.inlineBridgeAttempted;
  state.meta.inlineBridgeRecoveredCount = fallbackRecoveryDebug.inlineBridgeRecoveredCount;
  state.meta.bridgeReportAttempted = fallbackRecoveryDebug.bridgeReportAttempted;
  state.meta.bridgeReportRecoveredCount = fallbackRecoveryDebug.bridgeReportRecoveredCount;
  state.meta.bridgeReportRejectReason = fallbackRecoveryDebug.bridgeReportRejectReason;
  state.meta.currentInvocationFingerprint = fallbackRecoveryDebug.currentFingerprint;
  state.meta.bridgeInvocationFingerprint = fallbackRecoveryDebug.bridgeFingerprint;
  state.meta.fallbackCurrentCount = fallbackRecoveryDebug.currentCount;
  state.meta.fallbackBridgeCount = fallbackRecoveryDebug.bridgeCount;
  state.meta.recoveryPathUsed = fallbackRecoveryDebug.recoveryPathUsed || "none";
  state.meta.retryableFailure = deriveRetryableFailure(state.items);
  saveRun(state);

  if (deadOutgoingTempOnly) {
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      const rawEntry = rawPathEntries[i];
      item.status = "failed";
      item.note = "Share input did not provide a live temp file path.";
      item.error = "share_input_only_dead_outgoingtemp_paths";
      item.stagingDebug = {
        sourceType: "path",
        hasPath: true,
        hasOriginalPath: !!item.originalPath,
        rawSourceValue: rawEntry?.sourceValue ?? null,
        normalizedPath: rawEntry?.rawPath ?? null,
        hasPluginKitPath: !!rawEntry?.family?.isPluginKit,
        hasRunScriptIntentPath: !!rawEntry?.family?.isRunScriptIntent,
        hasOutgoingTempPath: !!rawEntry?.family?.isOutgoingTemp,
        family: rawEntry?.family ?? classifyPathFamily(rawEntry?.rawPath ?? null),
        pathCandidates: rawEntry?.rawPath ? [rawEntry.rawPath] : [],
        resolvedPath: rawEntry?.rawPath ?? null,
        existedBeforeStage: !!rawEntry?.existsAtCollect,
        sourceChannel: rawEntry?.sourceChannel ?? null,
        fallbackRecoveryDebug,
      };
      item.stageMethod = null;
      item.stagedBytes = null;
      item.stagedBytesHuman = humanBytes(item.stagedBytes);
    }
    state.meta.retryableFailure = false;
    state.meta.recoveryPathUsed = fallbackRecoveryDebug.recoveryPathUsed || "none";
    saveRun(state);
    if (!submitMode) {
      const wv = new WebView();
      await presentDashboardWebView(wv, state);
    }
    return {
      ok: false,
      reason: "All incoming paths were dead OutgoingTemp compatibility exports.",
      error: "share_input_only_dead_outgoingtemp_paths",
      runId: state.meta.runId,
      invocationMode: submitMode ? "submit" : "inspect",
      requestUrl: state.meta.requestUrl,
      stagedDir: state.meta.stagedDir,
      rawPaths,
      incomingDebug,
      inputHints,
      inputFamilySummary,
      bridgeFallbackUsed: false,
      inlineBridgeIngestUsed: false,
      reportBridgeFallbackUsed: false,
      deadOutgoingTempOnly: fallbackRecoveryDebug.deadOutgoingTempOnly,
      inlineBridgeAttempted: fallbackRecoveryDebug.inlineBridgeAttempted,
      inlineBridgeRecoveredCount: fallbackRecoveryDebug.inlineBridgeRecoveredCount,
      bridgeReportAttempted: fallbackRecoveryDebug.bridgeReportAttempted,
      bridgeReportRecoveredCount: fallbackRecoveryDebug.bridgeReportRecoveredCount,
      bridgeReportRejectReason: fallbackRecoveryDebug.bridgeReportRejectReason,
      currentInvocationFingerprint: fallbackRecoveryDebug.currentFingerprint,
      bridgeInvocationFingerprint: fallbackRecoveryDebug.bridgeFingerprint,
      fallbackCurrentCount: fallbackRecoveryDebug.currentCount,
      fallbackBridgeCount: fallbackRecoveryDebug.bridgeCount,
      retryableFailure: false,
      recoveryPathUsed: fallbackRecoveryDebug.recoveryPathUsed || "none",
      submissionSucceeded: false,
      submissionPendingInspect: false,
      lastKnownJobUrl: null,
      lastKnownJobStatus: null,
      lastKnownJobStartedAt: null,
      totalCount: state.items.length,
      completedCount: 0,
      failedCount: state.items.length,
      finalMedia: null,
      items: state.items,
    };
  }

  // For fresh runs, import raw shared paths immediately using old working ComposeUpload-style staging.
  if (rawPathEntries.length > 0) {
    await stageRawSharePathsImmediatelyIntoRun(state, rawPathEntries);
  } else {
    // Fallback for non-path payloads.
    await stageRunInputsPersistentFast(state, incomingItems);
  }

  await drainRunPersistent(null, state, { allowFinalJobPolling: !submitMode });
  state.meta.retryableFailure = deriveRetryableFailure(state.items);
  state.meta.recoveryPathUsed = state.meta.recoveryPathUsed || fallbackRecoveryDebug.recoveryPathUsed || "none";
  state.meta.invocationMode = submitMode ? "submit" : "inspect";
  saveRun(state);
  if (!submitMode) {
    const wv = new WebView();
    await presentDashboardWebView(wv, state);
  }
  const completedCountNew = state.items.filter(x => x.status === "done" || x.status === "accepted").length;
  const failedCountNew = state.items.filter(x => x.status === "failed").length;
  return {
    ok: true,
    mode: submitMode ? "incremental-submit" : "incremental-dashboard",
    invocationMode: submitMode ? "submit" : "inspect",
    runId: state.meta.runId,
    requestUrl: state.meta.requestUrl,
    stagedDir: state.meta.stagedDir,
    rawPaths,
    incomingDebug,
    inputHints,
    inputFamilySummary,
    bridgeFallbackUsed: !!state.meta.bridgeFallbackUsed,
    inlineBridgeIngestUsed: !!state.meta.inlineBridgeIngestUsed,
    reportBridgeFallbackUsed: !!state.meta.reportBridgeFallbackUsed,
    deadOutgoingTempOnly: !!state.meta.deadOutgoingTempOnly,
    inlineBridgeAttempted: !!state.meta.inlineBridgeAttempted,
    inlineBridgeRecoveredCount: Number(state.meta.inlineBridgeRecoveredCount || 0),
    bridgeReportAttempted: !!state.meta.bridgeReportAttempted,
    bridgeReportRecoveredCount: Number(state.meta.bridgeReportRecoveredCount || 0),
    bridgeReportRejectReason: state.meta.bridgeReportRejectReason || null,
    currentInvocationFingerprint: state.meta.currentInvocationFingerprint || null,
    bridgeInvocationFingerprint: state.meta.bridgeInvocationFingerprint || null,
    fallbackCurrentCount: Number(state.meta.fallbackCurrentCount || 0),
    fallbackBridgeCount: Number(state.meta.fallbackBridgeCount || 0),
    retryableFailure: state.meta.retryableFailure == null ? null : !!state.meta.retryableFailure,
    recoveryPathUsed: state.meta.recoveryPathUsed || "none",
    submissionSucceeded: !!state.meta.submissionSucceeded,
    submissionPendingInspect: !!state.meta.submissionPendingInspect,
    lastKnownJobUrl: state.meta.lastKnownJobUrl || null,
    lastKnownJobStatus: state.meta.lastKnownJobStatus || null,
    lastKnownJobStartedAt: state.meta.lastKnownJobStartedAt || null,
    totalCount: state.items.length,
    completedCount: completedCountNew,
    failedCount: failedCountNew,
    finalMedia: state.meta.finalMedia ?? null,
    items: state.items,
  };
}

// --------------------------------------------------
// shortcuts-safe wrapper
// --------------------------------------------------

async function smokeTestStart() {
  if (!ENABLE_STARTUP_ALERT) return;
  const alert = new Alert();
  alert.title = "Compose script started";
  alert.message = JSON.stringify({
    argsKeys: Object.keys(args ?? {}),
    fileURLsCount: asArray(args?.fileURLs).length,
    shortcutInputCount: asArray(args?.shortcutInput).length,
    shortcutParameterCount: asArray(args?.shortcutParameter).length,
    urlsCount: asArray(args?.urls).length,
  }, null, 2);
  await alert.present();
}

let out = null;

try {
  await smokeTestStart();
  out = await main();
} catch (e) {
  if (ENABLE_FATAL_ALERT) {
    const alert = new Alert();
    alert.title = "Compose script fatal";
    alert.message = String(e);
    await alert.present();
  }
  out = {
    ok: false,
    fatal: String(e),
    argsKeys: Object.keys(args ?? {}),
  };
} finally {
  Script.setShortcutOutput(JSON.stringify(out ?? { ok: false, reason: "no output" }, null, 2));
  Script.complete();
}
