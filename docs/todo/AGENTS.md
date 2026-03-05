# TODO — FX Mode Stabilization Checklist

- [ ] Capture iPhone proof run for lifecycle isolation (`fx -> grid -> list`) showing `enabled:0`, `raf:0`, `drawCalls:0` outside FX mode.
- [ ] Add optional runtime warning toast when non-FX mode detects `window.__tilefx_dbg.rafRunning===true` for >250ms.
- [ ] Validate if full-canvas teardown (`removeCanvas:true`) should be enabled behind query flag for deeper GPU reset diagnostics.
- [x] Enforce mode-scoped TileFX teardown from `public/explorer.html` via `destroyTileFX()` whenever leaving FX mode.
- [x] Add renderer-level hard lifecycle reset (`teardownForModeExit`) that clears RAF, tiles, pending uploads, cache textures, and debug counters.
- [x] Guard TileFX RAF loop against ghost rendering by requiring `document.body.classList.contains('fx-mode')` each frame.
- [x] Add CSS failsafe to hide `#tilefxCanvas` whenever body is not in `.fx-mode`.
- [x] Expose lifecycle control hooks (`window.destroyTileFX`, `window.setViewMode`) for runtime diagnosis.
- [ ] Capture fresh iPhone `?fxdebug=1&fxprobe=1&tilefxMaxTex=320` screenshots confirming `evictReason: none` (or rare) and stable cache bytes while idle.
- [ ] Validate whether any non-thumbnail `<img>` exists inside `.asset` cards; if found, narrow the FX swap-hide selector to avoid hiding metadata imagery.
- [ ] Tune default mobile texture cap (`320` vs `256`) from real-device A/B pass and record the selected default + rationale in AGENTS notes.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once baseline probe shows READY-state stability and low eviction churn.
