// /scriptable/ComposeUpload.js
// Name in Scriptable iOS `ComposeUploadIncremental`
// Shortcuts → Receive Media (Select Multiple ON) → Run Script (Scriptable)
// In Run Script action:
//   - Script: ComposeUpload
//   - Files: Shortcut Input   ✅
//   - (leave Parameter empty) ✅
//
// This script ALWAYS returns Shortcut Output so Shortcuts won’t throw
// "completed without output".

const BASE = "http://192.168.0.25:8787";
const PROJECT = "P3-SHARED-iOS-Exports";
const TARGET_DIR = "exports";
const MODE = "encode";       // "auto" | "copy" | "encode"
//const OUTPUT_NAME = "auto";
const OUTPUT_NAME = `compose-${Date.now()}.mp4`;
const SOURCE = "primary";

// ---------- helpers ----------
function asArray(x){ return x == null ? [] : (Array.isArray(x) ? x : [x]); }
function toLocalPath(v){
  if (v == null) return null;
  const s = String(v);
  if (s.startsWith("file://")) return s.replace(/^file:\/\//, "").replace(/^\/+/, "/");
  if (s.startsWith("/")) return s;
  return null;
}
function short(s,n=140){ s=String(s??""); return s.length>n? s.slice(0,n)+"…":s; }

function collectPaths(){
  // Primary: when Run Script → Files: Shortcut Input is used
  const fileURLs = asArray(args.fileURLs);

  // Fallbacks (if you accidentally wired Parameter, etc.)
  const param = asArray(args.shortcutParameter);
  const input = asArray(args.shortcutInput);
  const urls  = asArray(args.urls);

  const raw = [...fileURLs, ...param, ...input, ...urls];
  const out = [];
  const seen = new Set();

  for (const item of raw){
    const p = toLocalPath(item);
    if (p && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

async function main(){
  const fm = FileManager.local();

  const debug = {
    argsKeys: Object.keys(args),
    fileURLsCount: asArray(args.fileURLs).length,
    shortcutParameter: args.shortcutParameter == null ? null : typeof args.shortcutParameter,
    shortcutInput: args.shortcutInput == null ? null : typeof args.shortcutInput,
  };

  const candidates = collectPaths();
  debug.candidatesCount = candidates.length;
  debug.firstCandidate = candidates[0] ? short(candidates[0]) : null;

  if (!candidates.length){
    return {
      ok: false,
      reason: "No files received from Shortcuts.",
      fix: "In the Run Script action set Files → Shortcut Input (not Parameter).",
      debug
    };
  }

  // Stage into Scriptable temp dir to avoid sandbox weirdness
  const tempDir = fm.joinPath(fm.temporaryDirectory(), `compose_${Date.now()}`);
  fm.createDirectory(tempDir, true);

  const staged = [];
  const failures = [];

  for (let i=0; i<candidates.length; i++){
    const src = candidates[i];

    if (!fm.fileExists(src)){
      failures.push(`missing: ${src}`);
      continue;
    }

    const ext = (src.toLowerCase().match(/\.([a-z0-9]+)$/)?.[0]) ?? ".mov";
    const dst = fm.joinPath(tempDir, `clip_${String(i).padStart(4,"0")}${ext}`);

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

  debug.stagedCount = staged.length;
  debug.failuresCount = failures.length;
  debug.failureSample = failures.slice(0, 3).map(short);

  if (staged.length < 1){
    return {
      ok: false,
      reason: "Could not stage any files (sandbox read denied).",
      debug
    };
  }

  const url =
    `${BASE}/api/projects/${encodeURIComponent(PROJECT)}/compose/upload` +
    `?output_name=${encodeURIComponent(OUTPUT_NAME)}` +
    `&target_dir=${encodeURIComponent(TARGET_DIR)}` +
    `&mode=${encodeURIComponent(MODE)}` +
    (SOURCE ? `&source=${encodeURIComponent(SOURCE)}` : "");

  const req = new Request(url);
  req.method = "POST";

  // IMPORTANT: field name MUST be "files" to match FastAPI files: List[UploadFile] = File(...)
  for (const p of staged){
    const filename = p.split("/").pop();
    req.addFileToMultipart(p, "files", filename);
  }

  req.addParameterToMultipart("client", "scriptable");
  req.addParameterToMultipart("file_count", String(staged.length));

  try {
    const json = await req.loadJSON();
    return {
      ok: true,
      stagedCount: staged.length,
      requestUrl: url,
      server: json,
      debug
    };
  } catch (e1) {
    let raw = "";
    try { raw = await req.loadString(); } catch (e2) { raw = `loadString failed: ${String(e2)}`; }
    return {
      ok: false,
      requestUrl: url,
      stagedCount: staged.length,
      error: String(e1),
      status: req.response?.statusCode ?? null,
      headers: req.response?.headers ?? null,
      raw,
      debug
    };
  }
}

// ---------- Shortcuts-safe wrapper ----------
let resultText = "";

try {
  const out = await main();
  resultText =
    out?.server?.served?.stream_url ??
    out?.server?.served?.download_url ??
    out?.server?.path ??
    "compose ok";
} catch (e) {
  resultText = `compose error: ${String(e)}`;
}

Script.setShortcutOutput(resultText);
Script.complete();