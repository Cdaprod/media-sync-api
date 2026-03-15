# TODO — FX Mode Stabilization Checklist

## 2026-03-15 — Dual-track Explorer upgrades (active)
- [ ] **Commit classification (required):** classify each Explorer feature commit as either shared behavior (patch both static + package) or package-only/static-only with a short written reason.
- [ ] **Paired path locators (required):** include explicit task rows for both codepaths before implementation.
  - [ ] Static path locator(s): `public/explorer.html`, `public/js/explorer-shaders.mjs` (and any additional touched static explorer modules).
  - [ ] Package path locator(s): `docker/packages/Explorer/src/ExplorerApp.tsx`, `docker/packages/Explorer/src/styles.css`, `docker/packages/Explorer/src/api.ts`, `docker/packages/Explorer/src/state.ts` (and any additional touched package modules).
- [ ] **Parity verification rows per feature slice (required):**
  - [ ] UI behavior parity verified between static + package explorers for the touched feature slice.
  - [ ] API request-shape parity verified (query params, payload fields/order, and response handling) between static + package explorers.
- [ ] **Dual-stack testing rows (required):**
  - [ ] Static explorer regression assertions added/updated (or documented no-op with reason).
  - [ ] Explorer package tests added/updated (or documented no-op with reason).
- [ ] **Completion gate (required):** mark task rows `[x]` only when both codepaths are implemented, or when an explicit documented exception explains why only one path changed.

### Future Explorer feature commit template (copy/paste)
- [ ] Feature slice: `<name>`
  - [ ] Classification: `shared` **or** `package-only` / `static-only` (reason: `<short reason>`)
  - [ ] Static path row: `<file/path>`
  - [ ] Package path row: `<file/path>`
  - [ ] Parity verification (UI behavior)
  - [ ] Parity verification (API request shape)
  - [ ] Static regression test row: `<test reference or reason>`
  - [ ] Package test row: `<test reference or reason>`
  - [ ] Completion `[x]` only after both paths done or documented exception recorded.


## 2026-03-15 — Explorer API contract stabilization (completed)
- [x] Added a focused package API contract suite for explorer-used endpoints in `docker/packages/Explorer/tests/api-contract.test.mjs`.
- [x] Locked query-string + JSON body invariants for source/project scoping across sources/projects/media/upload/resolve/delete/move/bulk-delete/bulk-tags/bulk-move/bulk-compose requests.
- [x] Added ordered asset-ref invariants so `assets` arrays remain deterministic and unmodified across bulk delete/tag/move/compose payloads.
- [x] Added failure-path assertions to enforce actionable error messages from `detail`, nested `detail.message`, and `message` payload shapes.
- [x] Verified the suite is self-contained with mocked `fetch` only (no live service dependency).

## 2026-03-15 — Preview/Inspector convergence pass (active)
- [x] Build parity checklist rows for drawer preview layout/controls, tag panel interactions, OBS handoff, Program Monitor handoff, and FX/tile controls scope.
- [x] Port agreed preview/inspector deltas into `docker/packages/Explorer/src/ExplorerApp.tsx` + `src/styles.css` while preserving existing class names where possible.
- [x] Add regression tests for preview drawer action visibility/state transitions and optional integration fallback behavior.
- [ ] Capture a browser screenshot artifact after the next visual QA pass on a running explorer container.

### Preview/Inspector parity checklist rows
- [x] **Drawer preview layout/controls parity**
  - [x] Keep preview media container structure (`.drawer > .drawer-body > .preview`) aligned between static + package explorers.
  - [x] Adopt preview minimum-height/media fitting parity (`min-height`, audio sizing in preview media selectors).
  - [x] Keep drawer action pill set aligned: Play, Copy stream URL, Send to OBS, Program Monitor, Tag, Select toggle, Delete.
- [x] **Tag panel interactions parity**
  - [x] Keep tag panel as drawer overlay (`.drawer-tag-panel`) rather than resizing/shrinking preview area.
  - [x] Keep drawer tag toggle state reset behavior on open/close and focused-item transitions.
  - [x] Preserve prompt-based tag edit API call path for now; defer full inline tag editor parity until dedicated pass.
- [x] **OBS handoff affordances parity**
  - [x] Surface drawer-level OBS pill with disabled state + unavailable-title affordance when integration context is missing.
  - [x] Keep explicit warning toast fallback when OBS integration is unavailable.
- [x] **Program Monitor handoff affordances parity**
  - [x] Surface drawer-level Program Monitor pill with disabled state + unavailable-title affordance when integration context is missing.
  - [x] Keep explicit warning toast fallback when Program Monitor integration is unavailable.
- [x] **FX/tile rendering controls (included vs deferred)**
  - [x] Included: preview/inspector UI parity only (drawer controls, overlay behavior, action availability state).
  - [x] Deferred: static-only FX renderer controls/debug overlays (`window.__tilefx_*`, shader lifecycle probes, physical iPhone proof capture workflows).

### Branch intake checklist (record-first, no assumptions)
- [ ] Intake `me/explorer-shaders-and-compose-api-upgrades` changes into this parity matrix **after** recording concrete refs:
  - [ ] commit hash: `TBD`
  - [ ] compare range / identifier: `TBD`
  - [ ] impacted preview/inspector files: `TBD`
- [ ] Intake `tags.py` branch context into this parity matrix **after** recording concrete refs:
  - [ ] commit hash: `TBD`
  - [ ] compare range / identifier: `TBD`
  - [ ] impacted preview/inspector files: `TBD`



## 2026-03-15 — Explorer compose parity in package (active)
- [x] Added/confirmed typed `bulkComposeAssets(...)` API client helper targeting `POST /api/assets/bulk/compose`.
- [x] Added compose modal flow in `docker/packages/Explorer/src/ExplorerApp.tsx` within existing Actions/select-bar controls (no new route/module tree).
- [x] Compose action now enables only for selections that contain video assets, with deterministic ordered refs preserved for payload generation.
- [x] Compose success now surfaces artifact details in toasts and refreshes scoped media + project data using existing reload flows.
- [x] Added/updated Explorer package tests for disabled selection guardrails, payload ordering, and success refresh/feedback wiring.
- [x] Updated package docs (`docker/packages/Explorer/README.md`) with compose behavior notes.
- [ ] Add an interaction-level render test that drives modal input edits + submit/cancel keyboard handling.



## 2026-03-15 — Explorer Next.js bulk asset action contract (active)
- [x] Add typed bulk asset API helpers in `docker/packages/Explorer/src/api.ts` for delete/tags/move/compose using ordered `{source,project,relative_path}` payloads.
- [x] Extend Next.js explorer asset-ref mapper in `docker/packages/Explorer/src/ExplorerApp.tsx` to resolve ordered refs from selection + focused drawer item with legacy path fallback.
- [x] Route existing selection/action controls to bulk endpoints with explicit toast-based success/failure handling (no silent failures).
- [x] Add targeted Explorer tests validating bulk payload shapes + routing checks for mixed all-project and single-project scenarios.
- [ ] Add interaction-level tests (rendered component) for selection collisions where identical `relative_path` exists across multiple projects.


## 2026-03-15 — Next.js Explorer UI migration slices (active)
- [x] Slice 1: Topbar/projects/actions structure + controls mapped to static explorer brand/title toggle and actions trigger layout.
- [x] Slice 2: Media grid/list card rendering and selection affordances parity pass.
- [x] Slice 3: Inspector drawer + tag panel + action pills parity pass.
- [x] Slice 4: Context menus + delete confirm/modal flows + upload panel affordances parity pass.

## 2026-03-15 — Explorer behavior-first migration primitives (active)
- [x] Extended `docker/packages/Explorer/src/utils.ts` with typed parity helpers for URL/path normalization + clipboard copy fallbacks and centralized upload/stream URL shaping.
- [x] Ported Program Monitor handoff behavior into typed helpers (`buildProgramMonitorDescriptor`, `sendToProgramMonitor`) and wired Explorer selection actions to use the helper boundary.
- [x] Added typed OBS push adapter (`pushAssetToObs`) with browser API/script guardrails and connected drawer action flow.
- [x] Added typed mock/preview boot decision helpers (`shouldUseExplorerMocks`, `isLikelyPreviewEnvironment`, `decideExplorerBootMode`) and wired Explorer boot fallback to mock assets.
- [x] Tightened idempotent action targeting by deriving unique action refs from selected media identity (`source|project|relative_path`) before delete/handoff actions.
- [ ] Add direct unit tests that execute helper functions (not string-presence checks) for boot decisions + Program Monitor payload composition.



## 2026-03-15 — Delete identity collision guard (active)
- [x] Reworked explorer delete resolver matching to use stable asset identity keys (`asset_uuid`/`asset_id` fallback, then `source+project+relative_path`) instead of `relative_path` alone.
- [x] Updated delete entrypoints (context menu, selected-bar, drawer) to pass asset objects where possible so all-project deletes cannot cross-match by path collisions.
- [x] Preserved legacy string-path support with focused/active-project narrowing while preventing broad path-only expansion in all-project scope.
- [x] Added regression assertions in `tests/test_public_explorer_program_monitor.py` to block reintroduction of `wanted.has(ref.relative_path)` logic.
- [ ] Add runtime test coverage that simulates same-relative-path assets across two projects and verifies only the intended asset ref is submitted.

## 2026-03-15 — Explorer custom delete modal styling pass (active)
- [x] Replaced native `window.confirm` delete prompt with a non-blocking in-app modal that matches Explorer theme and preserves async flow.
- [x] Added modal accessibility hooks (`role="dialog"`, `aria-modal`, labelled/described content) and close affordances (Cancel, backdrop tap, Escape key).
- [x] Kept delete scope reconciliation fix intact (`reloadMediaForCurrentScope`) while switching delete flow to await modal confirmation.
- [x] Updated regression assertions in `tests/test_public_explorer_program_monitor.py` for modal wiring + async confirmation branch.
- [ ] Validate iPhone Safari tap ergonomics/spacing for the custom modal against inspector drawer context.

## 2026-03-15 — Explorer delete confirm + post-delete scope reconciliation (active)
- [x] Added an explicit delete confirmation prompt before bulk/inspector delete requests are sent.
- [x] Fixed delete target resolution to honor drawer-focused assets as well as selected assets so single-item drawer deletes always resolve API refs.
- [x] Added scope-aware post-delete reload (`project` vs `all projects`) to prevent the fake-empty/no-project state after successful deletes.
- [x] Added regression assertions in `tests/test_public_explorer_program_monitor.py` for confirm + reload hooks.
- [ ] Validate on iPhone Safari that deleting from drawer keeps current source/project scope hydrated without manual refresh.

## 2026-03-08 — FX bootstrap ready-timeout escape hatch (active)
- [x] Addressed bootstrap stall risk where `bootstrap_ready` previously required `bootstrapReady === bootstrapTotal`, allowing one never-ready visible tile to block steady-state entry.
- [x] Added bounded timeout gate (`tilefxBootstrapReadyMs`, default 1200ms) so FX bootstrap advances to commit/steady even when a subset of visible tiles never become ready.
- [x] Preserved existing full-ready fast path and batch-commit behavior for ready tiles; timeout path only prevents indefinite entering-phase lock.
- [x] Added debug counters/telemetry for timeout occurrences (`bootstrapReadyTimedOut`, elapsed/pending fields) and regression assertions in tests.
- [ ] Validate on iPhone that one permanently-failed visible thumbnail no longer blocks FX takeover for neighboring visible cards.

## 2026-03-08 — Editor preview mock fallback without query flag (active)
- [x] Reproduced the remaining gap: top-level local editor preview can fail API boot without `?mock=1`, but previous preview heuristic only treated embedded/opener contexts as preview fallback eligible.
- [x] Broadened `isLikelyPreviewEnvironment()` to treat localhost/loopback/local test hosts as preview contexts for API-failure fallback routing.
- [x] Kept deployed behavior safe: fallback still occurs only after API boot failure and only for local-preview host heuristics, not arbitrary remote `http/https` hosts.
- [x] Added regression assertion in `tests/test_public_explorer_program_monitor.py` for localhost-based preview detection.
- [ ] Validate from text-editor preview “no localStorage.json” path that explorer auto-renders mock assets without needing manual `?mock=1`.

## 2026-03-08 — Explorer mock boot bypass for preview/webview (active)
- [x] Identified root cause: explorer boot still executed API-first `refreshExplorerData()` before mock activation, so preview hosts surfaced sources/projects failure toasts and never entered mock render flow.
- [x] Moved mock decision to early boot gate: explicit mock/file/webview protocol now routes directly into mock state hydration before API source/project fetch calls.
- [x] Added preview fallback routing for local embedded/webview contexts (`window.opener` / iframe on local host) to bypass API boot failures and hydrate mock data.
- [x] Kept deployed safety: non-preview real `http/https` boot path still uses API and does not silently fall back unless preview heuristics match.
- [x] Added regression assertions in `tests/test_public_explorer_program_monitor.py` for early mock boot short-circuit and preview detection helpers.
- [ ] Validate on iOS editor preview that boot failure cards no longer appear and mock assets render immediately.

## 2026-03-08 — Proof snapshot stale-capture reconciliation (active)
- [x] Accepted runtime confirmation that core FX pipeline is live (feed/upload/cache/swap no longer primary blocker).
- [x] Narrowed remaining contradiction to proof export timing: stale non-settled captures could be exported while runtime was already settled in FX.
- [x] Added a minimal `exportTileFxProofSummary()` refresh guard to recapture proof when current runtime is FX+enabled+raf-running but captured proof shows non-running/zero-visible state.
- [x] Kept scope strictly to truth-surface timing; no pipeline/lifecycle/UI architecture changes.
- [ ] Re-check on device that contradictory `view:"fx"` + `enabled:false` proof objects no longer appear once runtime is settled.

## 2026-03-08 — Feed-stage promotion/pipeline reactivation (active)
- [x] Traced the zero-upload idle state to a render-stage feed gate: `_render(...)` used non-null-safe `this.textureCache.has/get` access before cache bootstrap was guaranteed, allowing loop failure and starving feed/upload progression.
- [x] Made render feed checks null-safe (`this.textureCache?.has?.(key)`, `this.textureCache?.get?.(key, now)`) so fed tiles continue to queue/upload even if cache bootstrap is one tick behind.
- [x] Kept scope narrow to collect→feed→upload pipeline continuity; no lifecycle/logging/card-UI rewrites in this pass.
- [x] Added regression assertions for null-safe texture-cache access in render pipeline.
- [ ] Re-check on device/runtime probe that counters move off zero (`uploadsQueued/uploadsAttempted/texturesPending/cache/swapOps`) and tiles progress pending→upload→cache→swap.

## 2026-03-08 — Visible thumb-body ownership policy finalization (active)
- [x] Isolated remaining mixed visual state to thumb-body paint policy: visible/near-visible cards could still present DOM thumb body whenever `data-tex` briefly remained non-`1`/non-`pending`.
- [x] Enforced FX-window painter policy in CSS: any card flagged `data-fx-near-visible="1"` and not `data-tex="1"` now uses placeholder suppression for `.thumb-body`/thumb image painters.
- [x] Preserved DOM ownership for `.asset-ui` metadata, badges, selectors, and affordances; no overlay/UI architecture rewrites were introduced.
- [x] Added a regression assertion in tests for the near-visible non-textured placeholder selector.
- [ ] Re-check on physical iPhone that visible FX window no longer shows normal DOM thumb bodies behind FX/placeholder cards during short scroll-stop cycles.

## 2026-03-08 — Pending→texture stall in visible window (active)
- [x] Traced stall gate to renderer callback ordering: `tile.onTextureReady(...)` only ran after `rectValid` + `visible` draw culls, so some cards remained `data-tex="pending"` when texture became available but draw eligibility lagged.
- [x] Moved texture readiness callback invocation to run immediately after cache lookup for every fed tile (before visible-only culls), while preserving draw culls and swap eligibility rules.
- [x] Kept scope tight to readiness pipeline sequencing (no lifecycle/logging/DOM architecture changes).
- [x] Added regression test asserting `onTextureReady(Boolean(entry?.texture))` executes before `if (!rectValid) return;` and `if (!visible) return;`.
- [ ] Re-check on physical iPhone scroll-stop run that previously stalled placeholder cards now resolve from `pending` to `1` in the visible/near-visible FX window.

## 2026-03-08 — Non-FX disable logging policy cleanup (active)
- [x] Confirmed `sync:setView:non-fx` is a legitimate lifecycle transition path from `setView(...)` and startup bootstrap.
- [x] Changed `TileFXRenderer.disable(...)` so legal non-FX disables no longer emit warning/error stack spam; illegal disable-in-FX remains error-level.
- [x] Kept lifecycle behavior scoped: no ownership pipeline or watchdog architecture changes in this patch.
- [x] Reduced startup duplicate non-FX disable calls by avoiding redundant `setView('grid')` when already in grid mode after initial data refresh.
- [x] Updated tests to assert legal-disable logging uses debug-level path and legacy warn path is absent.
- [ ] Re-check on physical iPhone that grid/list transitions no longer show `[tilefx] DISABLE sync:setView:non-fx` warning stack noise.

## 2026-03-08 — Near-visible tracking before visible cull (active)
- [x] Moved near-visible set membership so edge tiles are tracked before the visible-only render-candidate cull.
- [x] Kept `visibleTileEls` restricted to actually visible tiles.
- [x] Preserved non-visible render candidate early return behavior.
- [x] Added a regression test that asserts near-visible registration occurs before `if (!visible) return;`.
- [ ] Re-run physical iPhone short scroll-stop cycle to confirm edge tiles remain under near-visible swap-hold hysteresis after leaving viewport.

## 2026-03-07 — Full visible-window FX coherence (active)
- [x] Identified remaining mixed-window cause: visible cards could stay plain grid-style before first collect pass because placeholder ownership was applied incrementally from collector timing.
- [x] Added immediate visible-window pending stamp on FX entry (`markVisibleFxWindowPending('setView:fx')`) so currently visible cards become `pending` or `1`, not `0`.
- [x] Removed `window.__tilefx_enabled` dependency from visible pending assignment in collector so FX-view visible cards do not wait for enable-flag timing to enter placeholder state.
- [x] Verified early FX window now starts fully coherent in-container (`visibleCount:20`, `pending:20`, `zero:0` immediately after entry).
- [ ] Re-check same behavior on physical iPhone Safari and confirm no lower-window plain-grid patch remains.

## 2026-03-07 — Visible FX placeholder ownership policy (active)
- [x] Identified visible DOM-thumb fallback path: cards were defaulting to `data-tex="0"` for non-ready states in `collectTileFxTiles()` / `onTextureReady(...)`, allowing full DOM thumb body paint in FX view.
- [x] Enforced visible/near-visible FX fallback policy: non-ready cards now stay in `data-tex="pending"` (FX placeholder) instead of full DOM thumb body.
- [x] Added explicit FX placeholder visual treatment for `data-tex="pending"` and hid `.thumb-body` paint nodes for that state.
- [x] Added warm re-entry retention: cards in overscan keep placeholder ownership (`pending`) and only drop to `0` when fully culled out of overscan.
- [ ] Re-check on physical iPhone Safari that this removes the “normal asset behind FX asset” appearance after settle + short scroll-stop.

## 2026-03-07 — Verdict/domSwap truth reconciliation (active)
- [x] Treated `health: dual_owner` under otherwise healthy visible FX ownership as a verdict-layer mismatch, not a pipeline failure.
- [x] Updated health verdict logic to prefer current visible ownership truth (`visibleSwapped/visibleDomOnly/visibleMissingTextures`) and avoid stale dual-owner verdicts after settle.
- [x] Tightened visible painter leak detection to count actual thumbnail paint contributors only (hidden/non-painting wrappers no longer counted).
- [x] Cleared stale leak counters when no swapped tiles are present so old leak state does not poison health verdicts.
- [ ] Re-check on physical iPhone Safari that HUD health now aligns with `window.logVisibleTileOwnership(12)` and `window.exportTileFxProofSummary?.()` after scroll-stop.

## 2026-03-07 — Physical iPhone parity handoff (active)
### Explorer parity feature buckets (Static ↔ Next.js)

| Feature bucket | Static | Next.js | Parity | Static locator (grep target) | Next.js locator (grep target) |
| --- | --- | --- | --- | --- | --- |
| Shell/layout (topbar, projects drawer, actions panel, inspector drawer, context menu, modals) | [x] | [x] | [ ] | `public/explorer.html` → `function openProjectsDrawer()` / `function openInspectorDrawer()` / `function openAssetContextMenu(` / `function openDeleteConfirmModal(` | `docker/packages/Explorer/src/ExplorerApp.tsx` → `toggleProjectsDrawer` / `renderInspectorDrawer` / `handleAssetContextMenu` / `renderDeleteConfirmModal` |
| Media behavior (search, type filter, sort options, quick filters, select/multi-select, move/delete/tag, upload) | [x] | [x] | [ ] | `public/explorer.html` → `function applyMediaFilters()` / `function sortMediaItems(` / `function submitUpload(` / `function applyTagsToSelection(` | `docker/packages/Explorer/src/ExplorerApp.tsx` → `applyMediaFilters` / `sortMedia` / `handleUploadSubmit` / `handleApplyTags` |
| Integrations (Program Monitor handoff, OBS push, mock boot, TileFX) | [x] | [x] | [ ] | `public/js/program_monitor_handoff.js` (`sendProgramMonitorSelection`) + `public/js/obs-push.js` (`pushMediaToOBS`) + `public/js/explorer-mock-assets.mjs` (`buildMockExplorerState`) + `public/js/explorer-shaders.mjs` (`class TileFXRenderer`) | `docker/packages/Explorer/src/ExplorerApp.tsx` → `handleProgramMonitorHandoff` / `handleSendToOBS` / `resolveMockMode` / `tileFx` integration block |
| Data/API (source selection, all-projects feed, project-scoped actions, absolute URL normalization) | [x] | [x] | [ ] | `public/explorer.html` → `function loadSources(` / `function loadAllProjectsMedia(` / `function canRunProjectScopedAction(` / `function toAbsoluteMediaUrl(` | `docker/packages/Explorer/src/api.ts` → `toAbsoluteUrl` + `docker/packages/Explorer/src/ExplorerApp.tsx` → `loadSources` / `loadAllProjectsMedia` / `isProjectActionEnabled` |

- [x] Confirmed parity run should use existing tools only (`window.logVisibleTileOwnership(12)`, `window.exportTileFxProofSummary?.()`).
- [x] Kept container-side work closed (no new HUD/proof/toast/watchdog systems added in this handoff step).
- [ ] Run on physical iPhone Safari in FX view after settle:
  - `window.logVisibleTileOwnership(12)`
  - `window.exportTileFxProofSummary?.()`
- [ ] Run short scroll-stop cycle on iPhone (down/stop, up/stop), then repeat the same two commands.
- [ ] Capture one concrete remaining issue (if any) and patch only that single issue next.

## 2026-03-07 — Post-proof stabilization focus (active)
- [x] Keep renderer behavior stable for seeded single-card and multi-visible viewport checks without adding new instrumentation surfaces.
- [x] Remove clearly redundant compensating code from now-stable upload/pending paths (no behavior widening).
- [ ] Validate parity on physical iPhone Safari with existing truth tools only (`window.logVisibleTileOwnership(12)` + compact proof-summary line).
- [ ] Resolve one final concrete on-device visual issue if parity still diverges after settle.

- [ ] Consolidate legacy repeated proof-capture TODOs into this single parity section as older items are completed.

## 2026-03-07 — Multi-visible FX stability pass (active)
- [x] Validated a multi-visible viewport where multiple rows reach `hasTexture:true`, `wasDrawnThisPass:true`, and `owner:"FX"` after settle.
- [x] Tightened FX entry coherence by requiring full bootstrap-visible readiness before `bootstrap_commit` (removed partial 90% fallback commit behavior).
- [x] Ran short scroll-stop cycle checks (down/stop, up/stop) and confirmed no persistent visible `dual_owner` rows after settle.
- [x] Kept single-card drain/texture maturity intact while stabilizing multi-visible behavior.
- [ ] Re-run the same multi-visible + scroll-stop checks on physical iPhone Safari for parity evidence.

## 2026-03-07 — Drain-stage truth + in-flight settlement (active)
- [x] Focused only on the next failing stage (`drain`) for seeded key `ingest/originals/img0.jpg` after resolve/queue were already proven.
- [x] Added deterministic pending settlement when FX drain is unavailable (`WEBGL_UNAVAILABLE` / renderer failed) so keys do not hang forever in pending/in-flight.
- [x] Added per-key drain trace truth (`drainEvaluated`, `drainAttempted`, `failureReason`) and surfaced it through existing visible ownership rows + upload live-state path.
- [x] Re-ran seeded 1-card runtime check and confirmed progression to texture/draw/owner (`inTextureCache:true`, `wasDrawnThisPass:true`, `owner:"FX"`).
- [ ] Re-check the same seeded drain path on physical iPhone Safari and collect one console sample for parity.

## 2026-03-07 — Queue truth reflection for seeded key (active)
- [x] Verified seeded key live state directly (`inPendingUploads`, `inUploadInFlight`, `inTextureCache`) instead of inferring queue from breadcrumbs only.
- [x] Fixed null texture-cache guard in `_queueTileImageUpload(...)` so queue insertion is possible before cache init.
- [x] Reflected queued truth in visible ownership rows (`queued` from `_pendingUploads.has(key)`).
- [x] Confirmed seeded key now reports `queued:true` and `inPendingUploads:true` in runtime trace.
- [ ] Continue from next stage (`drain`) on WebGL-capable runtime to validate texture/draw/owner progression.

## 2026-03-07 — Queue-stage fix for single visible seeded tile (active)
- [x] Bound diagnostics to the real visible DOM card and runtime key (`ingest/originals/img0.jpg`) instead of null placeholders.
- [x] Fixed queue-stage path so visible texture-missing tiles are queued from `updateTiles(...)` collector flow.
- [x] Triggered upload drain from collector updates after queueing to reduce render-loop-only dependency for visible pending work.
- [ ] Re-validate on non-headless/runtime-WebGL-capable target that queue now flips true and progresses to texture/draw/owner stages.
- [ ] If queue is true but ownership remains DOM, continue with next failing stage (`drain` → `texture` → `draw` → `owner`) using the same seeded key.

## 2026-03-07 — Single visible card FX maturity (active)
- [x] Identified single-card stall stage after lifecycle fix: visible image prep could wait on DOM image readiness and never reach URL preload in time for seeded 1-card runs.
- [x] Made single-card `img` prep deterministic: use DOM image immediately when ready, otherwise preload by URL first and only then fall back to DOM image prep.
- [x] Kept visible-first upload drain priority for pending keys so the one visible tile is serviced before non-visible warm work.
- [ ] Validate seeded 1-card run reaches `hasTexture:true`, `wasDrawnThisPass:true`, `owner:"FX"` in `window.logVisibleTileOwnership(12)`.
- [ ] Validate proof summary line shows `visibleReady>0`, `visibleSwapped>0`, and `visibleMissingTextures` falling after settle.

## 2026-03-07 — Multi-card/device follow-up (deferred)
- [ ] After single-card maturity is stable, run multi-card + iPhone parity checks.

## 2026-03-07 — Visible ownership truth-path repair (new)
- [x] Treated FX-active empty ownership rows with visible DOM cards as an ownership-truth bug in `window.logVisibleTileOwnership(limit)`.
- [x] Updated ownership logging to include visible DOM card count and explicit truth-bug flag in returned summary (`visibleDomCards`, `ownershipTruthBug`).
- [x] Updated `TileFXRenderer.getVisibleOwnershipRows(limit)` to source rows from current visible DOM card set first via `_collectVisibleDomOwnershipRows(...)`.
- [x] Added per-frame draw-truth carryover (`_lastDrawByTileEl`) so ownership rows can report current `wasDrawnThisPass`/`rectValid`/`hasTexture` truth.
- [x] Expanded ownership row payload to include `fed`, `rectValid`, and `swapState` for compact visible truth inspection.
- [ ] Validate on physical iPhone: run `window.__explorer_view`, `window.logVisibleTileOwnership(12)`, `window.exportTileFxProofSummary?.()` and confirm non-empty visible rows when cards are onscreen.
- [ ] Capture one iPhone sample output for `window.logVisibleTileOwnership(12)` showing non-empty rows matching onscreen cards.

## 2026-03-07 — Steady-state visible ownership discipline (new)
- [x] Added steady visible-lock ownership rule in `syncVisibleTileOwnership(...)` to keep visible draw-valid tiles FX-owned (`steady:visible-lock`).
- [x] Added next-pass steady mismatch correction for visible tiles that are FX-swapped but lose draw-truth (`steady:draw-truth-lost`).
- [x] Preserved visible-first sync ordering (visible ownership decisions before untracked cleanup pass).
- [x] Tightened near-visible release to stronger hold windows in `_restoreUntrackedSwaps(...)` while keeping visible release blocked.
- [x] Reduced steady feed/promotion churn in `collectTileFxTiles()` (conservative overscan/maxFed/maxPromoted for steady mode, especially coarse-pointer/mobile).
- [ ] Validate on physical iPhone Safari: enter FX → settle → scroll one screen → stop, then confirm no visible DOM↔FX flip-flop after settle.
- [ ] Capture one short `window.logVisibleTileOwnership(12)` sample after the scroll-stop check and attach in PR notes.

## 2026-03-07 — Strict visible-batch FX entry completion (new)
- [x] Replaced single bootstrap stage with explicit TileFX entry phases: `bootstrap_collect`, `bootstrap_ready`, `bootstrap_commit`, `steady`.
- [x] Tightened bootstrap-ready threshold to require 100% of captured visible bootstrap tiles to be draw-ready before commit.
- [x] Added bootstrap visible-set stabilization so visible tiles remain DOM-owned until batch commit (no per-tile stagger during entry).
- [x] Added grouped batch commit path (`bootstrap:batch-commit`) for visible tiles so ownership switch occurs coherently.
- [x] Blocked offscreen promotions while entry phase is non-steady in `collectTileFxTiles()` (`maxPromoted = 0`, visible-only feed behavior).
- [x] Prevented bootstrap-visible swap cleanup release by protecting bootstrap-set tiles in `_restoreUntrackedSwaps(...)` until steady.
- [ ] Validate on physical iPhone Safari that entering FX no longer presents mixed visible DOM/FX ownership after settle.
- [ ] Capture one iPhone console sample (`window.logVisibleTileOwnership(12)`) showing coherent ownership after bootstrap commit.

## 2026-03-06 — Physical-proof verdict pass + lifecycle lock completion (new)
- [x] Added `window.logTileFxProofSummary(reason)` to capture + export + log proof summaries without mutating TileFX lifecycle/swap state.
- [x] Extended proof export with explicit verdict fields (`proofPass`, `health`) and lifecycle artifact state (`deadOverlayHidden`, `deadOverlayReason`).
- [x] Tightened visible-set health diagnostics with `visibleReadyButNotSwapped`, `visibleSwappedButNoTexture`, and visible-only rect mismatch aggregates (`rectMismatchVisibleCount`, `rectMismatchMaxPx`, `rectMismatchAvgPx`).
- [x] Expanded lockstep rows to include per-axis rect deltas (`fxVsDomX/Y`, `overlayVsDomX/Y`) while keeping mismatch thresholding visible-only.
- [x] Kept hard disable guard + telemetry (`illegalDisableBlocked`, `lastIllegalDisable`) and confirmed no new non-view lifecycle mutators were introduced.
- [ ] Run physical iPhone Safari proof capture with aggressive scroll/chrome collapse and attach exported `proofPass: true` snapshots.

## 2026-03-06 — Lifecycle invariant guard + proof summary export (new)
- [x] Added hard TileFX disable guard in renderer (`disable(reason, {allowInFxView})`) that blocks illegal disable attempts while `window.__explorer_view === 'fx'` and logs stack traces.
- [x] Added proof export helper `window.exportTileFxProofSummary()` with compact JSON-safe lifecycle/visible-set/cache/viewport fields for physical iPhone capture workflows.
- [x] Added `computeTileFxHealthVerdict()` and surfaced health state in compact + expanded HUD rows.
- [x] Added debug `Capture Proof` button in `fxdebug=1&tilefxProof=1` mode to run `captureTileFxProof(...)` and export summary in one action.
- [x] Added defensive dead-overlay handling: first liveness failure in FX view hides the TileFX canvas to avoid stale glow overlays while renderer is down.
- [x] Added renderer telemetry for blocked illegal disables (`illegalDisableBlocked`, `lastIllegalDisable`) for root-cause tracing.
- [ ] Run physical iPhone Safari validation and attach exported proof summary payloads for aggressive scroll/chrome-collapse sessions.

## 2026-03-06 — Final stabilization proof + visible-set pass (new)
- [x] Added proof capture mode (`?tilefxProof=1`) with `window.captureTileFxProof(reason)` writing `window.__tilefx_proof` (liveness counters, viewport metrics, top visible tile rows/rects).
- [x] Added hard FX liveness assertions without auto-recovery; first failure is stored in `window.__tilefx_dbg.firstLivenessFailure` and logged once.
- [x] Added lockstep rect probe (`computeTileFxRectLockstep`) capturing >2px mismatches into `window.__tilefx_dbg.rectMismatchRows` with HUD `rectMismatch` reporting.
- [x] Completed single-owner swap diagnostics with per-card `visiblePainterLeakCount`, debug leak rows, and one-time leak warnings (toasts only when `tilefxPainterToast=1`).
- [x] Tightened swap release churn rules with idle gating (`_swapReleaseIdleMs`) and debug counters (`swapReleaseBlocked` / `swapReleaseAllowed`).
- [x] Made fed-set behavior deterministic (visible-first, bounded overscan promotion while scrolling, `visiblePromotedThisPass` telemetry).
- [x] Added visible-only health fields (`visibleReady`, `visibleUploading`, `visibleDomOnly`, `visibleSwapped`) to prioritize runtime truth for on-screen tiles.
- [x] Added compact-by-default HUD mode (non-`fxdebug`) to reduce visual obstruction while keeping expanded diagnostics available in debug sessions.
- [x] Gated swap-sanity visual outlines behind `fxdebug` so production FX mode avoids temporary debug overlays.
- [ ] Capture physical iPhone Safari proof logs/screens using `?tilefxProof=1` and attach `window.__tilefx_proof` snapshots from aggressive scroll runs.

## 2026-03-06 — Runtime ownership reset (new)
- [x] Removed TileFX watchdog auto-recovery + recovery toast paths (`heartbeat` + `visualViewport`) so viewport churn no longer re-arms FX runtime.
- [x] Locked TileFX lifecycle to `setView(...)` transitions only (`fx` enables/starts, non-FX disables/stops/clears/restores swaps/hides canvas).
- [x] Added `restoreAllDomSwaps(...)` support and wired non-FX exit + guarded destroy path to restore DOM thumbnail surfaces deterministically.
- [x] Added explicit layer-contract diagnostics (`logTileFxLayerContract`) and normalized z-index tokens so HUD/probe/toasts stay above TileFX canvas.
- [x] Updated HUD alert semantics to focus on lifecycle invariants instead of stale fail-state carryover from prior mode.
- [ ] Capture iPhone proof run showing no repeated `FX runtime recovered` toasts and no watchdog recovery spam during rapid scroll + Safari chrome collapse/expand.
- [ ] Capture iPhone proof run confirming FX tiles and DOM metadata move in lockstep with no dual-owner thumbnail flicker.
- [ ] Evaluate whether to drop temporary `fx-swap-sanity` class pulse once no-swap-flicker proof is validated on device.

## Prior checklist (retained)
- [x] Enforce authoritative per-tile FX swap states (`DOM_VISIBLE` / `FX_SWAPPED` / `RESTORING`) in `TileFXRenderer` using WeakMap state, with transition reasons logged in FX debug mode.
- [x] Keep swapped painter suppression inline-style based across `thumbPaintEls` (opacity/visibility/background restore), with dataset values treated as reflected state only.
- [x] Add swap restore hysteresis for tiles leaving the active fed set (frame/time delay + minimum hold) and skip transient unswaps while scrolling to prevent scroll-away disappearance.
- [x] Keep viewport event handlers collect/resize-only and avoid watchdog lifecycle intervention while FX view is active.
- [x] Add debug rect mismatch detector (`>2px`) with one-time logging and extended layout diagnostics (`tileFxCanvasTransformChain`) for transformed/filter/backdrop ancestor chains.
- [x] Enforce FX-safe compositor CSS (`fx-safemode`) and pseudo-painter kill rules for swapped tiles to avoid residual underlayer paints.
- [x] Bound fed/pending pressure in FX mode (adaptive overscan + pending cap telemetry) to reduce upload churn and gradual-takeover flicker.
- [ ] Capture iPhone proof run showing HUD `mode: fx | enabled: 1 | raf: 1` remains stable during aggressive scroll + Safari chrome collapse/expand.
- [ ] Capture iPhone proof run with `?fxdebug=1&fxprobe=1&tilefxDebugRects=1` and verify debug outlines stay locked to card borders while assets no longer vanish after offscreen travel.
- [ ] Evaluate whether desktop default cap should stay `640` or be tuned to `768` after quality/perf profiling.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once painter-leak checks are clean on iPhone.
## 2026-03-06 — Lifecycle invariant lock pass (new)
- [x] Made `syncTileFxLifecycleToView(view, reason, opts)` the only lifecycle mutator path used by `setView(...)` and `destroyTileFX(...)`.
- [x] Added post-sync `assertTileFxViewLifecycle(reason)` with immediate correction attempts for FX/non-FX mismatches.
- [x] Added containment fallback `containTileFxInvariantFailure(...)` to force DOM-owned safety state (hide canvas + restore swaps + dead-overlay markers) when lifecycle cannot be corrected.
- [x] Removed collect/heartbeat liveness checks that were acting as runtime lifecycle mutators/noise surfaces.
- [x] Kept visualViewport handlers resize/collect-only and documented the contract inline.
- [x] Tightened illegal-disable guard logging in shader runtime to one stack log per illegal-disable streak while preserving telemetry increments.
- [ ] Capture physical iPhone Safari proof showing `mode: fx | enabled: 1 | raf: 1` through chrome collapse/expand + aggressive scroll.
- [ ] Capture physical iPhone Safari proof showing no `LIFECYCLE_INVARIANT` in steady FX mode and no recovery-toast waterfall.

## 2026-03-06 — Visible ownership + scroll stability pass (new)
- [x] Added draw-truth ownership sync helper (`syncVisibleTileOwnership(...)`) so visible thumbnail swaps require texture + rect-valid + drawn-this-pass truth.
- [x] Added compact ownership probe `window.logVisibleTileOwnership(limit)` for on-device visible tile ownership inspection without expanding proof payload surfaces.
- [x] Blocked visible swap release in renderer cleanup paths and added counters (`visibleSwapReleaseBlocked`, `offscreenSwapReleaseAllowed`).
- [x] Updated `_restoreUntrackedSwaps(...)` to receive visible tile set and never release currently visible swapped tiles.
- [x] Reduced mobile/coarse-pointer fed-set churn (smaller scrolling overscan/maxFed/promotions) and added `fedVisibleRatio` telemetry.
- [x] Added HUD lifecycle stability field (`lifecycleStable`) derived from view/enabled/raf/dead-overlay state.
- [x] Kept collect/scroll/viewport paths lifecycle-neutral (no new lifecycle mutations, watchdogs, or recovery loops).
- [ ] Capture physical iPhone Safari run after aggressive scroll-stop and paste one `window.logVisibleTileOwnership()` console sample in PR notes.
- [ ] Validate on iPhone that visible thumbnails no longer flip DOM↔FX ownership at viewport edges during scroll.

## 2026-03-06 — Renderer behavior finish pass (new)
- [x] Enforced draw-truth-only swap eligibility (`visible + texture + drawn this pass + valid rect`) so cache/READY alone can no longer claim ownership.
- [x] Blocked swap release for active/fed tiles in ownership sync path.
- [x] Restricted untracked swap release to non-visible and non-near-visible tiles only.
- [x] Re-prioritized overscan promotions by viewport distance and reduced scroll-time feed caps to reduce gradual page takeover.
- [x] Kept lifecycle/proof/hud feature surface unchanged (behavior-only pass).
- [ ] Validate on physical iPhone Safari that visible tiles no longer alternate DOM/FX at viewport edges after aggressive scroll-stop.
- [ ] Capture and attach one `window.logVisibleTileOwnership(12)` output after aggressive scroll-stop.

## 2026-03-06 — Lifecycle bootstrap deadlock fix (new)
- [x] Fixed `assertTileFxViewLifecycle(...)` to accept scheduled RAF (`tileFX.raf > 0`) during startup before first-frame debug flags update.
- [x] Removed false containment trigger that could hide canvas + restore swaps before first render tick.
- [x] Kept behavior surface stable (no new diagnostics/proof/hud/watchdog additions).
- [ ] Re-run physical iPhone Safari check to confirm FX startup no longer falls into immediate `LIFECYCLE_INVARIANT` on entry.

## 2026-03-06 — Thumb painter leak + ownership snapshot fix (new)
- [x] Added `.thumb` + optional `.thumb .scrim` to `thumbPaintEls` so swap suppression includes wrapper paint surfaces, not only `<img>`.
- [x] Updated leak detector to ignore hidden painter nodes and avoid false positives caused by hidden elements retaining CSS background values.
- [x] Expanded DOM swap background snapshot/restore for thumb paint nodes (`backgroundImage/background/backgroundColor`) to prevent residual wrapper paint during FX ownership.
- [x] Updated visible ownership snapshot fallback so `window.logVisibleTileOwnership(limit)` reports fed rows even before first ownership cache update.
- [ ] Validate on iPhone that swapped painter leak logs no longer report `DIV.thumb` offenders for visible swapped tiles.
- [ ] Capture and attach non-empty `window.logVisibleTileOwnership(12)` output from physical iPhone FX session after scroll-stop.

## 2026-03-06 — Metadata-safe thumb/body split (new)
- [x] Split asset tile visual stack into `.thumb-body` (thumbnail paint) and `.asset-ui` (metadata/controls) to prevent metadata loss during FX swap suppression.
- [x] Moved `.asset-overlay` + selector/badges/title/subtitle and preview/play affordances into `.asset-ui` DOM layer.
- [x] Updated `thumbPaintEls` collection to track `.thumb-body` painters instead of suppressing `.thumb` container ownership.
- [x] Updated leak candidate scanning to inspect `.thumb-body` painters with the new DOM structure.
- [ ] Validate on iPhone Safari that metadata remains visible while `data-tex="1"` tiles are FX-owned.
- [ ] Capture one pasted `.asset` outerHTML sample from iPhone session after the split for handoff proof.

## 2026-03-06 — FX lifecycle runtime-truth alignment (new)
- [x] Aligned lifecycle/health verdict checks with live renderer truth (`tileFX.enabled`, scheduled RAF) to avoid false lifecycle-invariant output during startup transitions.
- [x] Updated compact/expanded HUD runtime labels to report effective renderer status rather than debug-field lag alone.
- [x] Kept lifecycle authority architecture unchanged and avoided new diagnostics/recovery additions.
- [ ] Verify on physical iPhone that HUD now remains `mode: fx | enabled: 1 | raf: 1` during steady FX runtime after startup.
