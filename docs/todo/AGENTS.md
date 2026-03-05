# TODO — FX Mode Stabilization Checklist

- [ ] Capture fresh iPhone `?fxdebug=1&fxprobe=1&tilefxMaxTex=320` screenshots confirming `evictReason: none` (or rare) and stable cache bytes while idle.
- [ ] Validate whether any non-thumbnail `<img>` exists inside `.asset` cards; if found, narrow the FX swap-hide selector to avoid hiding metadata imagery.
- [ ] Tune default mobile texture cap (`320` vs `256`) from real-device A/B pass and record the selected default + rationale in AGENTS notes.
- [x] Expand FX swap-hide CSS to cover actual thumbnail surface variants (`.thumb`, `img`, `picture`, `video`, thumb utility classes, `[data-thumb]`, inline `background-image`) only when `data-tex="1"`.
- [x] Add a temporary swap sanity visual (`fx-swap-sanity`) that outlines swapped tiles for 10 seconds after entering FX mode.
- [x] Add TileFX texture upload size contract via `resizeImageForGL(...)` with runtime knob `?tilefxMaxTex=...` and mobile/desktop defaults.
- [x] Ensure texture-cache byte accounting uses final uploaded (resized) dimensions and expose `maxTex` + `avgTexWxH` telemetry in HUD/probe.
- [x] Reduce idle scan churn by adding a 1s FX idle heartbeat and dynamic scan interval (fast while scrolling, slow when idle).
- [x] Pause upload draining in healthy idle state when ready coverage exceeds visible tiles plus overscan margin (`tilefxIdleReadyMargin`).
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once baseline probe shows READY-state stability and low eviction churn.
