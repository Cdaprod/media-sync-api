// /scriptable/ComposeUpload.js
// Name in Scriptable iOS: ComposeUpload
//
// Purpose:
// - Canonical current-selection staging authority for share-sheet compose flows.
// - Stages files from this invocation into Scriptable-owned storage and emits JSON summary.
//
// Example shortcut wiring:
// - Run Script (Scriptable): ComposeUpload
// - Input: Shortcut Input (Files)

const fm = FileManager.local();
const shareDebugDir = fm.joinPath(fm.documentsDirectory(), "share-debug");
if (!fm.fileExists(shareDebugDir)) fm.createDirectory(shareDebugDir, true);
const stageRoot = fm.joinPath(shareDebugDir, "compose-upload-staged");
if (!fm.fileExists(stageRoot)) fm.createDirectory(stageRoot, true);

function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`;
  fm.writeString(tmp, JSON.stringify(value, null, 2));
  if (fm.fileExists(path)) fm.remove(path);
  fm.move(tmp, path);
}

async function main() {
  const importer = importModule("CurrentSelectionImporter");
  const result = importer.stageCurrentSelectionFromArgs({
    args,
    fm,
    stageRoot,
    stagePrefix: "compose-upload",
  });

  const output = {
    ok: result.stagedEntries.length > 0,
    stagedCount: result.stagedEntries.length,
    failureCount: result.failures.length,
    invocationFingerprint: result.invocationFingerprint,
    stagedEntries: result.stagedEntries,
    failures: result.failures,
    startupDiagnostics: result.startupDiagnostics,
  };

  writeJsonAtomic(fm.joinPath(shareDebugDir, "compose-upload-latest.json"), output);

  const alert = new Alert();
  alert.title = output.ok ? "ComposeUpload" : "ComposeUpload failed";
  alert.message =
    `staged=${output.stagedCount}\n` +
    `failures=${output.failureCount}\n` +
    `first=${output.stagedEntries[0]?.rawPath || "(none)"}`;
  alert.addAction("OK");
  await alert.present();

  Script.setShortcutOutput(output);
}

try {
  await main();
} catch (error) {
  const message = String(error?.stack || error);
  const alert = new Alert();
  alert.title = "ComposeUpload fatal";
  alert.message = message;
  alert.addAction("OK");
  await alert.present();
  Script.setShortcutOutput({ ok: false, error: message });
}

Script.complete();
