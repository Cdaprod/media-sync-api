// /scriptable/ComposeUploadInspectBridge.js
// Name in Scriptable iOS: `ComposeUploadInspectBridge`
//
// Usage (Shortcuts):
//   1) Receive files/media (multiple enabled)
//   2) Run Script (Scriptable): ComposeUploadInspectBridge
//   3) In Run Script, set Files = Shortcut Input, and keep Parameter empty
//
// Purpose:
//   Mirror the old working ComposeUpload import/staging behavior and emit
//   a lightweight diagnostic report so we can compare share-input contracts.

const MAX_TEXT = 200;

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

function classifyPathFamily(path) {
  const p = String(path || "");
  if (p.includes("/Containers/Data/PluginKitPlugin/")) return "PluginKitPlugin";
  if (p.includes("/tmp/RunScriptIntent/")) return "RunScriptIntent";
  if (p.includes("/var/mobile/Media/PhotoData/OutgoingTemp/")) return "OutgoingTemp";
  return "other";
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
    const rawPath = toLocalPath(entry?.rawPath) || String(entry?.rawPath || "");
    const sourceValue = String(entry?.sourceValue ?? "");
    const name = rawPath.split("/").pop() || "";
    return `${index + 1}|${rawPath}|${name}|${sourceValue}`;
  });
  const payload = `count=${lines.length};${lines.join(";")}`;
  return `fp-${hashString32(payload)}`;
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
      out.push({
        sourceChannel: lane.key,
        sourceIndex: i,
        sourceValue: String(raw),
        rawPath: path,
      });
    }
  }
  return out;
}

function collectStartupDiagnostics(fm) {
  const lanes = [
    { key: "fileURLs", values: asArray(args.fileURLs) },
    { key: "shortcutParameter", values: asArray(args.shortcutParameter) },
    { key: "shortcutInput", values: asArray(args.shortcutInput) },
    { key: "urls", values: asArray(args.urls) },
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
    argsKeys: Object.keys(args ?? {}),
    lanes: laneDiagnostics,
  };
}

function countByFamily(entries) {
  const counts = {
    PluginKitPlugin: 0,
    RunScriptIntent: 0,
    OutgoingTemp: 0,
    other: 0,
  };
  for (const entry of entries) {
    const family = entry.pathFamily || "other";
    if (Object.prototype.hasOwnProperty.call(counts, family)) counts[family] += 1;
    else counts.other += 1;
  }
  return counts;
}

function buildReportPath(fm) {
  const dir = fm.joinPath(fm.documentsDirectory(), "share-debug");
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  const stagedRoot = fm.joinPath(dir, "bridge-staged");
  if (!fm.fileExists(stagedRoot)) fm.createDirectory(stagedRoot, true);
  return {
    dir,
    stagedRoot,
    latest: fm.joinPath(dir, "compose-upload-inspect-latest.json"),
    stamped: fm.joinPath(dir, `compose-upload-inspect-${Date.now()}.json`),
  };
}

function writeJson(fm, path, value) {
  const tmp = `${path}.tmp`;
  fm.writeString(tmp, JSON.stringify(value, null, 2));
  if (fm.fileExists(path)) fm.remove(path);
  fm.move(tmp, path);
}

async function stageImmediately(fm, rawEntries, stageDir, invocationFingerprint) {
  const staged = [];
  const failures = [];

  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    const src = entry.rawPath;
    const exists = fm.fileExists(src) && !fm.isDirectory(src);
    entry.fileExistsAtCollect = exists;
    entry.pathFamily = classifyPathFamily(src);

    if (!exists) {
      failures.push({
        index1: i + 1,
        sourcePath: src,
        sourceChannel: entry.sourceChannel,
        pathFamily: entry.pathFamily,
        error: "source_unreadable_or_transient:file_not_found",
      });
      continue;
    }

    const ext = (src.toLowerCase().match(/\.([a-z0-9]+)$/)?.[0]) || ".mov";
    const dst = fm.joinPath(stageDir, `clip_${String(i).padStart(4, "0")}${ext}`);

    try {
      fm.copy(src, dst);
      staged.push({
        index1: i + 1,
        sourcePath: src,
        stagedPath: dst,
        stageMethod: "copy",
        stagedBytes: fm.fileSize(dst),
        pathFamily: entry.pathFamily,
        invocationFingerprint,
      });
      continue;
    } catch (copyErr) {
      try {
        const data = fm.read(src);
        if (!data) throw new Error("read returned null data");
        fm.write(dst, data);
        staged.push({
          index1: i + 1,
          sourcePath: src,
          stagedPath: dst,
          stageMethod: "read_write",
          stagedBytes: fm.fileSize(dst),
          pathFamily: entry.pathFamily,
          invocationFingerprint,
        });
        continue;
      } catch (readErr) {
        try {
          const data = Data.fromFile(src);
          if (!data) throw new Error("Data.fromFile returned null data");
          fm.write(dst, data);
          staged.push({
            index1: i + 1,
            sourcePath: src,
            stagedPath: dst,
            stageMethod: "data_from_file",
            stagedBytes: fm.fileSize(dst),
            pathFamily: entry.pathFamily,
            invocationFingerprint,
          });
          continue;
        } catch (dataErr) {
          failures.push({
            index1: i + 1,
            sourcePath: src,
            sourceChannel: entry.sourceChannel,
            pathFamily: entry.pathFamily,
            error: `copy=${String(copyErr)} read_write=${String(readErr)} data_from_file=${String(dataErr)}`,
          });
        }
      }
    }
  }

  return { staged, failures };
}

function buildSummaryText(report) {
  const fam = report.pathFamilyCounts;
  const allOutgoingDead = report.rawEntries.length > 0 &&
    report.rawEntries.every(e => e.pathFamily === "OutgoingTemp" && !e.fileExistsAtCollect);

  return [
    `Inputs: ${report.rawEntries.length}`,
    `Staged: ${report.staged.length}`,
    `Failures: ${report.failures.length}`,
    `Families: PluginKit=${fam.PluginKitPlugin}, RunScriptIntent=${fam.RunScriptIntent}, OutgoingTemp=${fam.OutgoingTemp}, other=${fam.other}`,
    `All OutgoingTemp dead: ${allOutgoingDead ? "yes" : "no"}`,
    `Report: ${report.reportPaths.latest}`,
  ].join("\n");
}

async function main() {
  const fm = FileManager.local();
  const reportPaths = buildReportPath(fm);
  const startupDiagnostics = collectStartupDiagnostics(fm);
  const rawEntries = collectRawSharePaths();
  const invocationFingerprint = computeInvocationFingerprint(rawEntries);

  const stageDir = fm.joinPath(reportPaths.stagedRoot, `compose_bridge_${Date.now()}`);
  if (!fm.fileExists(stageDir)) fm.createDirectory(stageDir, true);

  const stageResult = await stageImmediately(fm, rawEntries, stageDir, invocationFingerprint);

  const report = {
    generatedAt: new Date().toISOString(),
    argsSummary: {
      keys: Object.keys(args ?? {}),
      fileURLsCount: asArray(args.fileURLs).length,
      shortcutInputCount: asArray(args.shortcutInput).length,
      shortcutParameterCount: asArray(args.shortcutParameter).length,
      urlsCount: asArray(args.urls).length,
    },
    startupDiagnostics,
    rawEntries,
    invocationFingerprint,
    pathFamilyCounts: countByFamily(rawEntries),
    itemCount: rawEntries.length,
    staged: stageResult.staged,
    failures: stageResult.failures,
    stageDir,
    reportPaths,
  };

  writeJson(fm, reportPaths.latest, report);
  writeJson(fm, reportPaths.stamped, report);

  const alert = new Alert();
  alert.title = "ComposeUploadInspectBridge";
  alert.message = buildSummaryText(report);
  alert.addAction("OK");
  await alert.present();

  return report;
}

let out;
try {
  const report = await main();
  out = {
    ok: true,
    reportPath: report.reportPaths.latest,
    invocationFingerprint: report.invocationFingerprint,
    stagedCount: report.staged.length,
    failureCount: report.failures.length,
    familyCounts: report.pathFamilyCounts,
    firstRawPath: report.rawEntries[0]?.rawPath || null,
  };
} catch (e) {
  out = {
    ok: false,
    error: short(String(e), 500),
  };
}

Script.setShortcutOutput(JSON.stringify(out, null, 2));
Script.complete();
