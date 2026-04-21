// /scriptable/ShareContractProbe.js
// Name in Scriptable iOS: `ShareContractProbe`
//
// Usage (Shortcuts):
//   1) Receive media/files from Photos share sheet (multiple enabled)
//   2) Run Script (Scriptable): ShareContractProbe
//   3) In Run Script action set Files = Shortcut Input; keep Parameter empty
//
// Example:
//   Photos -> Share -> Run Shortcut -> ShareContractProbe
//
// Purpose:
//   Isolate current-invocation share import contract behavior without any compose/upload logic.

function asArray(x) {
  return x == null ? [] : (Array.isArray(x) ? x : [x]);
}

function toLocalPath(v) {
  if (v == null) return null;
  let s = String(v);
  if (s.startsWith("file://")) {
    try { s = decodeURIComponent(s); } catch (_) {}
    return s.replace(/^file:\/\//, "").replace(/^\/+/, "/");
  }
  if (s.startsWith("/")) {
    try { s = decodeURIComponent(s); } catch (_) {}
    return s;
  }
  return null;
}

function classifyPathFamily(path) {
  const p = String(path || "");
  if (p.includes("/Containers/Data/PluginKitPlugin/")) return "PluginKitPlugin";
  if (p.includes("/tmp/RunScriptIntent/")) return "RunScriptIntent";
  if (p.includes("/var/mobile/Media/PhotoData/OutgoingTemp/")) return "OutgoingTemp";
  return "other";
}

function buildProbeDir(fm) {
  const root = fm.joinPath(fm.documentsDirectory(), "share-debug");
  if (!fm.fileExists(root)) fm.createDirectory(root, true);
  const stagedRoot = fm.joinPath(root, "probe-staged");
  if (!fm.fileExists(stagedRoot)) fm.createDirectory(stagedRoot, true);
  const runDir = fm.joinPath(stagedRoot, `probe-${Date.now()}`);
  if (!fm.fileExists(runDir)) fm.createDirectory(runDir, true);
  return { root, runDir };
}

async function main() {
  const fm = FileManager.local();
  const { runDir } = buildProbeDir(fm);
  const lanes = [
    { key: "fileURLs", values: asArray(args.fileURLs) },
    { key: "shortcutParameter", values: asArray(args.shortcutParameter) },
    { key: "shortcutInput", values: asArray(args.shortcutInput) },
    { key: "urls", values: asArray(args.urls) },
  ];

  const items = [];
  const seen = new Set();
  let recoveredCount = 0;

  for (const lane of lanes) {
    for (let i = 0; i < lane.values.length; i++) {
      const raw = lane.values[i];
      const rawString = String(raw);
      const normalizedPath = toLocalPath(raw);
      const dedupeKey = normalizedPath ? `path:${normalizedPath}` : `raw:${lane.key}:${i}:${rawString}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const exists = normalizedPath ? (fm.fileExists(normalizedPath) && !fm.isDirectory(normalizedPath)) : false;
      const item = {
        lane: lane.key,
        laneIndex: i,
        rawString,
        normalizedPath,
        pathFamily: classifyPathFamily(normalizedPath),
        existsAtCollect: exists,
        isDirectory: normalizedPath ? fm.isDirectory(normalizedPath) : false,
        readResult: {
          method: null,
          bytes: null,
          error: null,
          stagedPath: null,
        },
      };

      if (!normalizedPath) {
        item.readResult.error = "not_a_local_path";
        items.push(item);
        continue;
      }

      const ext = (normalizedPath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[0]) || ".mov";
      const dstPath = fm.joinPath(runDir, `probe_${String(items.length).padStart(4, "0")}${ext}`);

      try {
        const data = fm.read(normalizedPath);
        if (!data) throw new Error("read returned null data");
        fm.write(dstPath, data);
        item.readResult.method = "read";
        item.readResult.bytes = fm.fileSize(dstPath);
        item.readResult.stagedPath = dstPath;
        recoveredCount += 1;
      } catch (readErr) {
        try {
          const data = Data.fromFile(normalizedPath);
          if (!data) throw new Error("Data.fromFile returned null data");
          fm.write(dstPath, data);
          item.readResult.method = "data_from_file";
          item.readResult.bytes = fm.fileSize(dstPath);
          item.readResult.stagedPath = dstPath;
          recoveredCount += 1;
        } catch (dataErr) {
          item.readResult.error = `read=${String(readErr)} data_from_file=${String(dataErr)}`;
        }
      }

      items.push(item);
    }
  }

  const laneSummary = {};
  for (const lane of lanes) {
    const laneItems = items.filter(item => item.lane === lane.key);
    laneSummary[lane.key] = {
      rawCount: lane.values.length,
      rawSamples: lane.values.slice(0, 2).map(v => String(v)),
      normalizedSamples: laneItems.slice(0, 2).map(item => item.normalizedPath),
      existsSamples: laneItems.slice(0, 2).map(item => item.existsAtCollect),
      recoveredCount: laneItems.filter(item => !!item.readResult.method).length,
    };
  }

  return {
    ok: true,
    argsKeys: Object.keys(args ?? {}),
    recoveredCount,
    stagedDir: runDir,
    laneSummary,
    items,
  };
}

let output;
try {
  output = await main();
} catch (e) {
  output = { ok: false, error: String(e) };
}

Script.setShortcutOutput(JSON.stringify(output, null, 2));
Script.complete();
