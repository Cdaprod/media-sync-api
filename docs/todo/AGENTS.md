# TODO — FX Mode Stabilization Checklist

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
