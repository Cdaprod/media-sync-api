# TODO — FX Mode Stabilization Checklist

- [x] Move TileFX quad mapping into visual-viewport space (`vv.width/height` + `vv.offsetLeft/offsetTop`) so GL coverage matches card rects on iOS URL-bar collapse/expand.
- [x] Resize `#tilefxCanvas` from `visualViewport` metrics on init + `visualViewport.resize` + `visualViewport.scroll` + `window.resize`.
- [x] Recompute visible tile rects each frame from `tileEl.getBoundingClientRect()` to avoid stale cached layout drift during mobile chrome animations.
- [x] Add `?tilefxDebugRects=1` truth overlay outlines sourced from the same mapped rects used for GL draws.
- [x] Ensure TileFX debug state initialization merges with existing `window.__tilefx_dbg` so HUD/probe read the same state object.
- [ ] Capture iPhone proof run with `?fxdebug=1&fxprobe=1&tilefxMaxTex=512&tilefxDebugRects=1` and verify debug outlines stay locked to card borders while scrolling/address bar transitions.
- [ ] Add optional per-tile debug toast in FX mode when a swapped card (`data-tex=1`) still reports any painter with computed visibility/opacity showing.
- [ ] Evaluate whether desktop default cap should stay `640` or be tuned to `768` after quality/perf profiling.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once painter-leak checks are clean on iPhone.
