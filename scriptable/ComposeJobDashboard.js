// /scriptable/ComposeJobDashboard.js
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
const ENABLE_STARTUP_ALERT = true;
const ENABLE_FATAL_ALERT = true;

// -----------------------------
// Persistent run management
// -----------------------------

// Use Scriptable's documents directory to persist run state and staged files
const _fmRun = FileManager.local();
const RUNS_DIR = _fmRun.joinPath(_fmRun.documentsDirectory(), "compose-runs");
const LAST_RUN_PATH = _fmRun.joinPath(RUNS_DIR, "last_run.json");
if (!_fmRun.fileExists(RUNS_DIR)) _fmRun.createDirectory(RUNS_DIR, true);

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

function stagePersistentSource(source, stagedPath) {
  if (source?.sourceType === "data" && source?.data) {
    try {
      _fmRun.write(stagedPath, source.data);
      return {
        ok: true,
        method: "incoming_data",
        bytes: _fmRun.fileSize(stagedPath),
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

  const srcPath = source?.path;
  if (!srcPath || !_fmRun.fileExists(srcPath) || _fmRun.isDirectory(srcPath)) {
    return {
      ok: false,
      method: null,
      bytes: null,
      error: "source_unreadable_or_transient:file_not_found",
    };
  }

  try {
    _fmRun.copy(srcPath, stagedPath);
    return {
      ok: true,
      method: "copy",
      bytes: _fmRun.fileSize(stagedPath),
      error: null,
    };
  } catch (copyErr) {
    try {
      const data = _fmRun.read(srcPath);
      if (!data) throw new Error("read returned null data");
      _fmRun.write(stagedPath, data);
      return {
        ok: true,
        method: "read_write",
        bytes: _fmRun.fileSize(stagedPath),
        error: null,
      };
    } catch (readWriteErr) {
      try {
        const data = Data.fromFile(srcPath);
        if (!data) throw new Error("Data.fromFile returned null data");
        _fmRun.write(stagedPath, data);
        return {
          ok: true,
          method: "data_from_file",
          bytes: _fmRun.fileSize(stagedPath),
          error: null,
        };
      } catch (dataErr) {
        return {
          ok: false,
          method: null,
          bytes: null,
          error:
            `source_unreadable_or_transient: copy=${String(copyErr)} read_write=${String(readWriteErr)} data_from_file=${String(dataErr)}`,
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
    const staged = stagePersistentSource(incoming, item.stagedPath);
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

// Process a single item in the run. This uploads one staged clip and updates
// the run state accordingly. It also updates the UI and persists state.
async function runOneStateStepPersistent(wv, state) {
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
  // Final clip completed the compose job
  item.status = "done";
  item.note = "Compose flow completed for final step";
  const finalServer = result.body || null;
  if (
    finalServer?.status === "stored" &&
    (finalServer?.served?.stream_url || finalServer?.served?.download_url)
  ) {
    state.meta.finalMedia = buildFinalMediaDescriptor(finalServer);
  }
  saveRun(state);
  await pushUI(wv, state);
  return true;
}

// Drain the run by continuously processing staged items until none remain
async function drainRunPersistent(wv, state) {
  while (true) {
    const stepped = await runOneStateStepPersistent(wv, state);
    if (!stepped) break;
  }
  return state;
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
  const fileURLsCount = incomingDebug?.fileURLs?.length ?? 0;
  const shortcutInputCount = incomingDebug?.shortcutInput?.length ?? 0;
  const shortcutParameterCount = incomingDebug?.shortcutParameter?.length ?? 0;
  const urlsCount = incomingDebug?.urls?.length ?? 0;

  if (fileURLsCount === 0 && shortcutInputCount > 0) {
    hints.push("No args.fileURLs detected; in Shortcuts set Run Script to Files = Shortcut Input and clear Images/Texts/URLs lanes.");
  }

  if (fileURLsCount > 0 && shortcutParameterCount > 0) {
    hints.push("fileURLs + shortcutParameter were both provided; dashboard is now using fileURLs only. Clear Parameter lane in Shortcuts.");
  }

  if (shortcutParameterCount > 0 || urlsCount > 0) {
    hints.push("Shortcut passed parameter/url data; keep only Files lane populated for compose dashboard runs.");
  }

  if (incomingItems.length === 0 && (fileURLsCount + shortcutInputCount + shortcutParameterCount + urlsCount) > 0) {
    hints.push("Share input was received but no usable path/data entries were collectable.");
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
      const asPath = toLocalPath(raw);
      if (asPath) {
        const normalizedPath = asPath.replace(/\/+/g, "/");
        const pathKey = `path:${normalizedPath}`;
        if (seen.has(pathKey)) continue;
        seen.add(pathKey);
        out.push({
          sourceType: "path",
          sourceChannel: channel.key,
          sourceIndex: i,
          sourceValue: String(raw),
          displayName: normalizedPath.split("/").pop() || normalizedPath,
          path: normalizedPath,
          data: null,
          originalReadableBytes: readDataLengthMaybe(normalizedPath),
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
          sourceValue: String(raw),
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
  const streamUrl = server?.served?.stream_url ?? null;
  const downloadUrl = server?.served?.download_url ?? null;
  const path = server?.path ?? null;

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
    padding: 14px 14px 12px;
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
    height: 52vh;
    border: 0;
    background: #fff;
  }
  video.result-video {
    display: block;
    width: 100%;
    max-height: 52vh;
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
    document.getElementById("meta").textContent = hints.length
      ? headerText + "\\n⚠ " + hints.join(" | ")
      : headerText;

    document.getElementById("sum-total").textContent = String(items.length);
    document.getElementById("sum-done").textContent = String(items.filter(x => x.status === "accepted" || x.status === "done").length);
    document.getElementById("sum-failed").textContent = String(items.filter(x => x.status === "failed" || x.status === "blocked").length);

    renderResult(meta);

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
        stagedPath: item?.stagedPath ?? null,
        originalPath: item?.originalPath ?? null,
      })),
    };
    await evalState(compactState);
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

// --------------------------------------------------
// main flow
// --------------------------------------------------

async function main() {
  const incomingDebug = inspectIncomingArgs();
  const incomingItems = collectIncomingItems();
  const inputHints = deriveInputContractHints(incomingDebug, incomingItems);
  const rawPaths = incomingItems.filter(x => x.sourceType === "path").map(x => x.path);

  if (incomingItems.length > 0) {
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
      };
    }
    const wv = new WebView();
    await wv.loadHTML(buildHTML());
    await pushUI(wv, state);
    wv.present(false);
    await drainRunPersistent(wv, state);
    const completedCount = state.items.filter(x => x.status === "done" || x.status === "accepted").length;
    const failedCount = state.items.filter(x => x.status === "failed").length;
    return {
      ok: true,
      mode: "incremental-dashboard-resumed",
      runId: state.meta.runId,
      requestUrl: state.meta.requestUrl,
      stagedDir: state.meta.stagedDir,
      rawPaths: [],
      incomingDebug,
      inputHints,
      totalCount: state.items.length,
      completedCount,
      failedCount,
      finalMedia: state.meta.finalMedia ?? null,
      items: state.items,
    };
  }
  // Otherwise, create a new run with the incoming files
  const state = createRunSkeletonPersistent(incomingItems);
  state.meta.incomingDebug = incomingDebug;
  state.meta.inputHints = inputHints;
  saveRun(state);
  const wv = new WebView();
  await wv.loadHTML(buildHTML());
  await pushUI(wv, state);
  wv.present(false);
  await stageRunInputsPersistent(wv, state, incomingItems);
  await drainRunPersistent(wv, state);
  const completedCountNew = state.items.filter(x => x.status === "done" || x.status === "accepted").length;
  const failedCountNew = state.items.filter(x => x.status === "failed").length;
  return {
    ok: true,
    mode: "incremental-dashboard",
    runId: state.meta.runId,
    requestUrl: state.meta.requestUrl,
    stagedDir: state.meta.stagedDir,
    rawPaths,
    incomingDebug,
    inputHints,
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
