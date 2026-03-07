# TODO — FX Mode Stabilization Checklist

## 2026-03-07 — Abstraction compression + visible FX ownership maturation (new)
- [x] Added simplified lifecycle stage helpers (`_isEnteringPhase()`, `getFxLifecycleStage()`) so architecture reads primarily as entering vs steady.
- [x] Added guarded bootstrap commit fallback (`>=90% ready` after 1200ms) to prevent single-tile stalls from blocking visible FX ownership indefinitely.
- [x] Added bootstrap empty-set transition to `steady` so entry cannot stall with zero captured visible tiles.
- [x] Updated visible counters to derive from visible ownership rows (`visibleReady/Swapped/DomOnly`) instead of global state counts.
- [x] Kept reconcile-path ownership authority and DOM metadata boundary unchanged.
- [ ] Validate on physical iPhone that `visibleReady` and `visibleSwapped` rise above zero in settled FX sessions with real visible media.
- [ ] Capture iPhone sample (`window.logVisibleTileOwnership(12)`) and proof summary line after enter FX → settle → short scroll → stop.

## 2026-03-07 — Dual-owner collapse from live visible ownership truth (new)
- [x] Added binary visible-owner reconcile helper (`_reconcileVisibleOwnerFromTruth(...)`) so visible tiles are collapsed deterministically to DOM or FX from current draw-truth.
- [x] Routed steady visible-lock and draw-truth-loss paths through the same reconcile helper to avoid visible mixed-owner persistence across frames.
- [x] Removed bootstrap recapture-on-empty behavior so entry keeps a stable captured visible set and avoids row-by-row reclaim resets.
- [x] Kept ownership sync ordering (visible sync before cleanup) and avoided adding new proof/HUD/recovery surfaces.
- [ ] Validate on physical iPhone Safari that visible `dual_owner` does not persist after settle.
- [ ] Capture one iPhone `window.logVisibleTileOwnership(12)` sample and one short proof-summary line after enter FX → settle → short scroll → stop.

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
