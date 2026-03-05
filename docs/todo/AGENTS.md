# TODO — FX Mode Stabilization Checklist

- [ ] Capture iPhone proof run with `?fxdebug=1&fxprobe=1&tilefxMaxTex=512` and verify zero visible thumb painters on swapped tiles via `window.debugLogTilePainters(...)`.
- [ ] Add optional per-tile debug toast in FX mode when a swapped card (`data-tex=1`) still reports any painter with computed visibility/opacity showing.
- [ ] Evaluate whether desktop default cap should stay `640` or be tuned to `768` after quality/perf profiling.
- [x] Move from single-surface swap to multi-surface painter ownership (`thumbPaintEls`) collected per tile.
- [x] Update `applyDomSwap(...)` to hide/restore all painter elements via WeakMap-backed inline style restore, while preserving metadata overlays.
- [x] Apply `fx-swapped` class on card as swap-state marker and CSS/debug fallback.
- [x] Add FX debug helper `window.debugLogTilePainters(...)` for live painter visibility/background diagnostics.
- [x] Keep CSS hide rule as narrow img-only failsafe (primary swap done in JS), avoiding broad non-thumbnail hide side effects.
- [x] Extend layout debug with TileFX canvas transformed-ancestor diagnostics for compositor-stack analysis.
- [x] Keep `evictReason` telemetry non-sticky under low cache pressure and coarse-pointer default cap at `512`.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once painter-leak checks are clean on iPhone.
