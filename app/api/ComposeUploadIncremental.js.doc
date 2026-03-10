// Shortcuts → Receive Media (Select Multiple ON) → Run Script (Scriptable)
// In Run Script action:
//   - Script: ComposeUploadIncremental
//   - Files: Shortcut Input   ✅
//   - leave Parameter empty   ✅
//
// This version speaks the incremental compose protocol:
//
//   X-Compose-Time   -> session/run id
//   X-Compose-Index  -> 1-based clip index
//   X-Compose-Count  -> total clip count
//
// Server behavior expected:
// - every non-final clip returns 202 {"status":"staged", ...}
// - final clip returns 200 {"status":"stored"|... , ...}
// - if compose fails on final clip, rerunning with the SAME RUN_ID can retry
//
// Script always returns Shortcut Output.

const BASE = "http://192.168.0.25:8787";
const PROJECT = "P3-SHARED-iOS-Exports";
const TARGET_DIR = "exports";
const MODE = "encode";         // "auto" | "copy" | "encode"
const OUTPUT_NAME = "auto";    // base label only; server will produce stem-NNNN.mp4
const SOURCE = "primary";

// Optional:
// Set this to true if you want to stage to Scriptable temp first.
// Useful when iOS sandbox access is flaky.
const STAGE_TO_TEMP = true;

// ---------- helpers ----------
function asArray(x) {
  return x == null ? [] : (Array.isArray(x) ? x : [x]);
}

function toLocalPath(v) {
  if (v == null) return null;
  const s = String(v);
  if (s.startsWith("file://")) return s.replace(/^file:\/\//, "").replace(/^\/+/, "/");
  if (s.startsWith("/")) return s;
  return null;
}

function short(s, n = 180) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function collectPaths() {
  const fileURLs = asArray(args.fileURLs);
  const param = asArray(args.shortcutParameter);
  const input = asArray(args.shortcutInput);
  const urls = asArray(args.urls);

  const raw = [...fileURLs, ...param, ...input, ...urls];
  const out = [];
  const seen = new Set();

  for (const item of raw) {
    const p = toLocalPath(item);
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function extname(path) {
  const m = String(path).match(/(\.[A-Za-z0-9]+)$/);
  return m ? m[1] : ".mov";
}

function buildUrl() {
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

function normalizeResponseStatus(resp) {
  if (!resp) return null;
  if (typeof resp.statusCode === "number") return resp.statusCode;
  if (typeof resp.status === "number") return resp.status;
  return null;
}

async function stageInputs(paths) {
  const fm = FileManager.local();
  if (!STAGE_TO_TEMP) return { staged: paths.slice(), tempDir: null, failures: [] };

  const tempDir = fm.joinPath(fm.temporaryDirectory(), `compose_${Date.now()}`);
  fm.createDirectory(tempDir, true);

  const staged = [];
  const failures = [];

  for (let i = 0; i < paths.length; i++) {
    const src = paths[i];
    if (!fm.fileExists(src)) {
      failures.push(`missing: ${src}`);
      continue;
    }

    const ext = extname(src);
    const dst = fm.joinPath(tempDir, `clip_${String(i).padStart(4, "0")}${ext}`);

    try {
      fm.copy(src, dst);
      staged.push(dst);
    } catch (e1) {
      try {
        const data = fm.read(src);
        fm.write(dst, data);
        staged.push(dst);
      } catch (e2) {
        failures.push(`copy/read failed: ${src} :: ${String(e1)} :: ${String(e2)}`);
      }
    }
  }

  return { staged, tempDir, failures };
}

async function sendOneClip({ filePath, fileIndex1, totalCount, runId, url }) {
  const filename = String(filePath).split("/").pop() || `clip_${fileIndex1}.mov`;

  const req = new Request(url);
  req.method = "POST";

  req.headers = {
    "X-Compose-Time": runId,
    "X-Compose-Index": String(fileIndex1), // 1-based; server normalizes
    "X-Compose-Count": String(totalCount),
  };

  req.addFileToMultipart(filePath, "files", filename);
  req.addParameterToMultipart("client", "scriptable");
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
    req2.addParameterToMultipart("client", "scriptable");
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

async function main() {
  const debug = {
    argsKeys: Object.keys(args),
    fileURLsCount: asArray(args.fileURLs).length,
    shortcutParameter: args.shortcutParameter == null ? null : typeof args.shortcutParameter,
    shortcutInput: args.shortcutInput == null ? null : typeof args.shortcutInput,
  };

  const candidates = collectPaths();
  debug.candidatesCount = candidates.length;
  debug.firstCandidate = candidates[0] ? short(candidates[0]) : null;

  if (!candidates.length) {
    return {
      ok: false,
      reason: "No files received from Shortcuts.",
      fix: "In Run Script set Files → Shortcut Input, not Parameter.",
      debug,
    };
  }

  const { staged, tempDir, failures } = await stageInputs(candidates);
  debug.stagedCount = staged.length;
  debug.failuresCount = failures.length;
  debug.failureSample = failures.slice(0, 3).map(short);
  debug.tempDir = tempDir;

  if (!staged.length) {
    return {
      ok: false,
      reason: "Could not stage any files.",
      debug,
    };
  }

  const url = buildUrl();
  const runId = makeRunId(staged.length);

  const stepResults = [];
  let finalServer = null;

  for (let i = 0; i < staged.length; i++) {
    const filePath = staged[i];
    const fileIndex1 = i + 1;

    const result = await sendOneClip({
      filePath,
      fileIndex1,
      totalCount: staged.length,
      runId,
      url,
    });

    stepResults.push({
      index: fileIndex1,
      statusCode: result.statusCode,
      ok: result.ok,
      bodyStatus: result.body?.status ?? null,
      note: result.body?.note ?? null,
      path: result.body?.path ?? null,
      error: result.error ?? null,
    });

    if (!result.ok) {
      return {
        ok: false,
        runId,
        requestUrl: url,
        sentCount: i,
        totalCount: staged.length,
        failedAt: fileIndex1,
        status: result.statusCode,
        error: result.error,
        raw: result.raw,
        steps: stepResults,
        debug,
      };
    }

    const statusCode = result.statusCode ?? 0;

    if (statusCode >= 400) {
      return {
        ok: false,
        runId,
        requestUrl: url,
        sentCount: i,
        totalCount: staged.length,
        failedAt: fileIndex1,
        status: statusCode,
        server: result.body,
        steps: stepResults,
        debug,
      };
    }

    finalServer = result.body;
  }

  return {
    ok: true,
    mode: "incremental",
    runId,
    requestUrl: url,
    stagedCount: staged.length,
    totalCount: staged.length,
    server: finalServer,
    steps: stepResults,
    debug,
  };
}

// ---------- Shortcuts-safe wrapper ----------
let out = null;
try {
  out = await main();
} catch (e) {
  out = {
    ok: false,
    fatal: String(e),
    argsKeys: Object.keys(args),
  };
} finally {
  Script.setShortcutOutput(out ?? { ok: false, reason: "no output" });
  Script.complete();
}