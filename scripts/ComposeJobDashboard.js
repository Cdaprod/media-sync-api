// /scriptable/ComposeJobDashboard.js
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

function collectPaths() {
  const fileURLs = asArray(args.fileURLs);
  const shortcutInput = asArray(args.shortcutInput);
  const shortcutParameter = asArray(args.shortcutParameter);
  const urls = asArray(args.urls);

  const primary =
    fileURLs.length > 0
      ? fileURLs
      : shortcutInput.length > 0
        ? shortcutInput
        : shortcutParameter.length > 0
          ? shortcutParameter
          : urls;

  const fm = FileManager.local();
  const out = [];
  const seenPaths = new Set();
  const seenFingerprints = new Set();

  for (const item of primary) {
    const p = toLocalPath(item);
    if (!p) continue;

    const normalized = p.replace(/\/+/g, "/");
    if (seenPaths.has(normalized)) continue;

    const base = normalized.split("/").pop() || normalized;
    let size = null;
    let mtime = null;

    try {
      if (fm.fileExists(normalized) && !fm.isDirectory(normalized)) {
        size = fm.fileSize(normalized);
        try {
          const d = fm.modificationDate(normalized);
          mtime = d ? d.toISOString() : null;
        } catch (_) {
          mtime = null;
        }
      }
    } catch (_) {}

    const fingerprint = `${base}::${size ?? "?"}::${mtime ?? "?"}`;
    if (seenFingerprints.has(fingerprint)) continue;

    seenPaths.add(normalized);
    seenFingerprints.add(fingerprint);
    out.push(normalized);
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
        <div class="k">Completed</div>
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

    document.getElementById("meta").textContent =
      (meta.project || "--") + " · " +
      (meta.mode || "--") + " · " +
      (meta.outputName || "--") + " · " +
      (meta.runId || "--");

    document.getElementById("sum-total").textContent = String(items.length);
    document.getElementById("sum-done").textContent = String(items.filter(x => x.status === "done").length);
    document.getElementById("sum-failed").textContent = String(items.filter(x => x.status === "failed").length);

    renderResult(meta);

    const list = document.getElementById("list");
    list.innerHTML = items.map(item => {
      const badge = esc(item.status || "queued");
      const serverBlock = item.server
        ? '<div class="server">' + esc(JSON.stringify(item.server, null, 2)) + '</div>'
        : '';

      return (
        '<div class="card">' +
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
  const payloadB64 = stateToBase64(state);
  await wv.evaluateJavaScript(
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

// --------------------------------------------------
// upload
// --------------------------------------------------

async function sendOneClip({ filePath, fileIndex1, totalCount, runId, url }) {
  const filename = String(filePath).split("/").pop() || `clip_${fileIndex1}.mov`;

  const req = new Request(url);
  req.method = "POST";
  req.headers = {
    "X-Compose-Time": runId,
    "X-Compose-Index": String(fileIndex1),
    "X-Compose-Count": String(totalCount),
  };

  req.addFileToMultipart(filePath, "files", filename);
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
    req2.addFileToMultipart(filePath, "files", filename);
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
  const rawPaths = collectPaths();

  if (!rawPaths.length) {
    return {
      ok: false,
      reason: "No files received from Shortcuts/share sheet.",
      fix: "In Run Script set Files → Shortcut Input.",
      debug: {
        fileURLs: asArray(args.fileURLs).map(toLocalPath),
        shortcutInput: asArray(args.shortcutInput).map(toLocalPath),
        shortcutParameter: asArray(args.shortcutParameter).map(toLocalPath),
        urls: asArray(args.urls).map(toLocalPath),
      },
    };
  }

  const { tempDir, items } = await stageInputs(rawPaths);
  const runId = makeRunId(items.length);
  const url = buildComposeUrl();

  const state = {
    meta: {
      project: PROJECT,
      mode: MODE,
      outputName: OUTPUT_NAME,
      source: SOURCE,
      runId,
      requestUrl: url,
      tempDir,
      rawPathCount: rawPaths.length,
    },
    items: items.map(item => ({
      ...item,
      originalReadableBytesHuman: humanBytes(item.originalReadableBytes),
      stagedBytesHuman: humanBytes(item.stagedBytes),
    })),
  };

  const wv = new WebView();
  await wv.loadHTML(buildHTML());
  await pushUI(wv, state);
  wv.present(false);

  if (!state.items.length) {
    return {
      ok: false,
      reason: "No stageable items were found from shared input.",
      rawPaths,
      state,
    };
  }

  let finalServer = null;

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];

    if (item.status === "failed") {
      await pushUI(wv, state);
      continue;
    }

    item.status = "uploading";
    item.note = "Uploading to compose session…";
    await pushUI(wv, state);

    const result = await sendOneClip({
      filePath: item.stagedPath,
      fileIndex1: item.index1,
      totalCount: state.items.length,
      runId,
      url,
    });

    if (!result.ok) {
      item.status = "failed";
      item.note = "Upload/request failed";
      item.error = result.error || "Unknown request error";
      item.server = {
        status: result.statusCode,
        raw: result.raw,
      };
      await pushUI(wv, state);
      continue;
    }

    item.server = result.body || null;

    const code = result.statusCode ?? 0;
    if (code >= 400) {
      item.status = "failed";
      item.note = "Server returned error";
      item.error = `HTTP ${code}`;
      await pushUI(wv, state);
      continue;
    }

    if (result.body?.status === "staged") {
      item.status = "accepted";
      item.note = result.body?.note || "Accepted into incremental compose session";
      await pushUI(wv, state);
      continue;
    }

    item.status = "done";
    item.note = "Compose flow completed for final step";
    finalServer = result.body || null;

    if (
      finalServer?.status === "stored" &&
      (finalServer?.served?.stream_url || finalServer?.served?.download_url)
    ) {
      state.meta.finalMedia = buildFinalMediaDescriptor(finalServer);
    }

    await pushUI(wv, state);
  }

  return {
    ok: true,
    mode: "incremental-dashboard",
    runId,
    requestUrl: url,
    tempDir,
    rawPaths,
    totalCount: state.items.length,
    completedCount: state.items.filter(x => x.status === "done" || x.status === "accepted").length,
    failedCount: state.items.filter(x => x.status === "failed").length,
    server: finalServer,
    items: state.items,
  };
}

// --------------------------------------------------
// shortcuts-safe wrapper
// --------------------------------------------------

let out = null;

try {
  out = await main();
} catch (e) {
  out = {
    ok: false,
    fatal: String(e),
    argsKeys: Object.keys(args ?? {}),
  };
} finally {
  Script.setShortcutOutput(JSON.stringify(out ?? { ok: false, reason: "no output" }, null, 2));
  Script.complete();
}