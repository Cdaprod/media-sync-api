// /scriptable/CurrentSelectionImporter.js
// Shared current-selection importer used by ComposeUpload and compose dashboards.
// Example (Scriptable):
//   const importer = importModule("CurrentSelectionImporter")
//   const result = importer.stageCurrentSelectionFromArgs({ args, fm: FileManager.local(), stageRoot: "..." })

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

function extname(path) {
  const m = String(path || "").match(/(\.[A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

function classifyPathFamily(path) {
  const p = String(path || "");
  return {
    isPluginKit: p.includes("/Containers/Data/PluginKitPlugin/"),
    isRunScriptIntent: p.includes("/tmp/RunScriptIntent/"),
    isOutgoingTemp: p.includes("/var/mobile/Media/PhotoData/OutgoingTemp/"),
    raw: p,
  };
}

function computeInvocationFingerprint(rawEntries) {
  const list = (rawEntries || []).map(e => `${e.sourceChannel}|${e.sourceValue || ""}|${e.rawPath || ""}`);
  const normalized = `${list.length}::${list.join("\n")}`;
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `fp-${hash.toString(16).padStart(8, "0")}`;
}

function collectRawEntries(argsObj, fm) {
  const lanes = [
    { key: "fileURLs", values: asArray(argsObj?.fileURLs) },
    { key: "shortcutParameter", values: asArray(argsObj?.shortcutParameter) },
    { key: "shortcutInput", values: asArray(argsObj?.shortcutInput) },
    { key: "urls", values: asArray(argsObj?.urls) },
  ];
  const out = [];
  const seen = new Set();
  let sourceIndex = 0;
  for (const lane of lanes) {
    for (let i = 0; i < lane.values.length; i++) {
      const raw = lane.values[i];
      const rawPath = toLocalPath(raw);
      if (!rawPath || seen.has(rawPath)) continue;
      seen.add(rawPath);
      out.push({
        sourceChannel: lane.key,
        sourceIndex,
        sourceValue: String(raw),
        rawPath,
        family: classifyPathFamily(rawPath),
        existsAtCollect: !!(fm.fileExists(rawPath) && !fm.isDirectory(rawPath)),
      });
      sourceIndex += 1;
    }
  }
  return out;
}

function collectStartupDiagnostics(argsObj, fm) {
  const lanes = [
    { key: "fileURLs", values: asArray(argsObj?.fileURLs) },
    { key: "shortcutParameter", values: asArray(argsObj?.shortcutParameter) },
    { key: "shortcutInput", values: asArray(argsObj?.shortcutInput) },
    { key: "urls", values: asArray(argsObj?.urls) },
  ];
  const laneDiagnostics = {};
  for (const lane of lanes) {
    const normalized = lane.values.map(v => toLocalPath(v)).filter(Boolean);
    laneDiagnostics[lane.key] = {
      rawCount: lane.values.length,
      rawSamples: lane.values.slice(0, 2).map(v => String(v)),
      normalizedPathSamples: normalized.slice(0, 2),
      normalizedPathExistsSamples: normalized.slice(0, 2).map(path => (
        fm.fileExists(path) && !fm.isDirectory(path)
      )),
    };
  }
  return {
    argsKeys: Object.keys(argsObj ?? {}),
    lanes: laneDiagnostics,
  };
}

function tryStageReadablePathNow(fm, srcPath, dstPath) {
  try {
    const data = fm.read(srcPath);
    if (!data) throw new Error("read returned null data");
    fm.write(dstPath, data);
    return { ok: true, method: "read_write", error: null };
  } catch (readErr) {
    try {
      const data = Data.fromFile(srcPath);
      if (!data) throw new Error("Data.fromFile returned null data");
      fm.write(dstPath, data);
      return { ok: true, method: "data_from_file", error: null };
    } catch (dataErr) {
      return {
        ok: false,
        method: null,
        error: `read_write=${String(readErr)} data_from_file=${String(dataErr)}`,
      };
    }
  }
}

function stageCurrentSelectionFromArgs({ args, fm, stageRoot, stagePrefix = "current-selection" }) {
  if (!fm || !stageRoot) {
    throw new Error("stageCurrentSelectionFromArgs requires fm and stageRoot");
  }
  if (!fm.fileExists(stageRoot)) fm.createDirectory(stageRoot, true);
  const runDir = fm.joinPath(stageRoot, `${stagePrefix}-${Date.now()}`);
  if (!fm.fileExists(runDir)) fm.createDirectory(runDir, true);

  const rawEntries = collectRawEntries(args, fm);
  const stagedEntries = [];
  const failures = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    const srcPath = entry.rawPath;
    const ext = extname(srcPath) || ".mov";
    const dstPath = fm.joinPath(runDir, `clip_${String(i).padStart(4, "0")}${ext}`);
    const staged = tryStageReadablePathNow(fm, srcPath, dstPath);
    if (staged.ok) {
      stagedEntries.push({
        sourceChannel: "current_selection",
        sourceIndex: i,
        sourceValue: entry.sourceValue,
        rawPath: dstPath,
        family: classifyPathFamily(dstPath),
        existsAtCollect: true,
        fromCurrentSelection: true,
        stageMethod: staged.method,
      });
      continue;
    }
    failures.push({
      index1: i + 1,
      sourcePath: srcPath,
      sourceChannel: entry.sourceChannel,
      pathFamily: entry.family,
      error: staged.error || "current_selection_stage_failed",
    });
  }

  return {
    rawEntries,
    stagedEntries,
    failures,
    invocationFingerprint: computeInvocationFingerprint(rawEntries),
    startupDiagnostics: collectStartupDiagnostics(args, fm),
  };
}

module.exports = {
  stageCurrentSelectionFromArgs,
};
