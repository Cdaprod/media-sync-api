# TODO — FX Mode Stabilization Checklist

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