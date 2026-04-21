// /scriptable/ShareContractProbe.js
// Name in Scriptable iOS: ShareContractProbe
//
// Purpose:
// - inspect what Scriptable actually receives from Photos/Shortcuts
// - visibly show the result on-device
// - persist a latest report to Documents/share-debug/share-contract-probe-latest.json
// - attempt durable copy of anything readable into Documents/share-debug/probe-staged/

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

function ensureDir(fm, path) {
  if (!fm.fileExists(path)) fm.createDirectory(path, true);
}

function writeJsonAtomic(fm, path, value) {
  const tmp = `${path}.tmp`;
  fm.writeString(tmp, JSON.stringify(value, null, 2));
  if (fm.fileExists(path)) fm.remove(path);
  fm.move(tmp, path);
}

function buildProbePaths(fm) {
  const root = fm.joinPath(fm.documentsDirectory(), "share-debug");
  ensureDir(fm, root);

  const stagedRoot = fm.joinPath(root, "probe-staged");
  ensureDir(fm, stagedRoot);

  const runId = `probe-${Date.now()}`;
  const runDir = fm.joinPath(stagedRoot, runId);
  ensureDir(fm, runDir);

  const latestReport = fm.joinPath(root, "share-contract-probe-latest.json");
  const runReport = fm.joinPath(root, `${runId}.json`);

  return { root, stagedRoot, runDir, latestReport, runReport, runId };
}

function laneSpec() {
  return [
    { key: "fileURLs", values: asArray(args?.fileURLs) },
    { key: "shortcutParameter", values: asArray(args?.shortcutParameter) },
    { key: "shortcutInput", values: asArray(args?.shortcutInput) },
    { key: "urls", values: asArray(args?.urls) },
  ];
}

async function probe() {
  const fm = FileManager.local();
  const paths = buildProbePaths(fm);
  const lanes = laneSpec();

  const items = [];
  const successfulPaths = [];
  const failedPaths = [];
  const seen = new Set();

  for (const lane of lanes) {
    for (let i = 0; i < lane.values.length; i++) {
      const raw = lane.values[i];
      const rawString = String(raw);
      const normalizedPath = toLocalPath(raw);
      const dedupeKey = normalizedPath ? `path:${normalizedPath}` : `raw:${lane.key}:${i}:${rawString}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const exists = normalizedPath
        ? (fm.fileExists(normalizedPath) && !fm.isDirectory(normalizedPath))
        : false;

      const item = {
        lane: lane.key,
        laneIndex: i,
        rawString,
        normalizedPath,
        pathFamily: classifyPathFamily(normalizedPath),
        existsAtCollect: exists,
        isDirectory: normalizedPath ? !!fm.isDirectory(normalizedPath) : false,
        readResult: {
          method: null,
          bytes: null,
          error: null,
          stagedPath: null,
        },
      };

      if (!normalizedPath) {
        item.readResult.error = "not_a_local_path";
        failedPaths.push({
          lane: lane.key,
          normalizedPath: null,
          error: item.readResult.error,
        });
        items.push(item);
        continue;
      }

      const ext = (normalizedPath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[0]) || ".mov";
      const dstPath = fm.joinPath(paths.runDir, `probe_${String(items.length).padStart(4, "0")}${ext}`);

      try {
        const data = fm.read(normalizedPath);
        if (!data) throw new Error("read returned null data");
        fm.write(dstPath, data);
        item.readResult.method = "read";
        item.readResult.bytes = fm.fileSize(dstPath);
        item.readResult.stagedPath = dstPath;
        successfulPaths.push(dstPath);
      } catch (readErr) {
        try {
          const data = Data.fromFile(normalizedPath);
          if (!data) throw new Error("Data.fromFile returned null data");
          fm.write(dstPath, data);
          item.readResult.method = "data_from_file";
          item.readResult.bytes = fm.fileSize(dstPath);
          item.readResult.stagedPath = dstPath;
          successfulPaths.push(dstPath);
        } catch (dataErr) {
          item.readResult.error = `read=${String(readErr)} data_from_file=${String(dataErr)}`;
          failedPaths.push({
            lane: lane.key,
            normalizedPath,
            error: item.readResult.error,
          });
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
      families: laneItems.slice(0, 2).map(item => item.pathFamily),
      existsSamples: laneItems.slice(0, 2).map(item => item.existsAtCollect),
      readSuccessCount: laneItems.filter(item => item.readResult.method === "read").length,
      dataFromFileSuccessCount: laneItems.filter(item => item.readResult.method === "data_from_file").length,
      stagedCount: laneItems.filter(item => !!item.readResult.stagedPath).length,
    };
  }

  const result = {
    ok: true,
    runId: paths.runId,
    argsKeys: Object.keys(args ?? {}),
    currentInvocationDurablyReadable: successfulPaths.length > 0,
    successfulPaths,
    failedPaths,
    recoveredCount: successfulPaths.length,
    stagedDir: paths.runDir,
    latestReportPath: paths.latestReport,
    laneSummary,
    items,
  };

  writeJsonAtomic(fm, paths.latestReport, result);
  writeJsonAtomic(fm, paths.runReport, result);

  return result;
}

async function showResult(result) {
  const alert = new Alert();
  alert.title = result.ok ? "ShareContractProbe" : "ShareContractProbe failed";
  if (!result.ok) {
    alert.message = String(result.error || "Unknown error");
    await alert.present();
    return;
  }

  const laneBits = Object.entries(result.laneSummary).map(([k, v]) => {
    return `${k}: raw=${v.rawCount}, staged=${v.stagedCount}`;
  });

  alert.message =
    `Readable now: ${result.currentInvocationDurablyReadable ? "yes" : "no"}\n` +
    `Recovered: ${result.recoveredCount}\n` +
    `Run: ${result.runId}\n` +
    `Report: ${result.latestReportPath}\n\n` +
    laneBits.join("\n");

  alert.addAction("OK");
  await alert.present();
}

let output;
try {
  output = await probe();
  await showResult(output);
} catch (e) {
  output = { ok: false, error: String(e) };
  const alert = new Alert();
  alert.title = "ShareContractProbe fatal";
  alert.message = String(e);
  alert.addAction("OK");
  await alert.present();
}

Script.setShortcutOutput(JSON.stringify(output, null, 2));
Script.complete();
