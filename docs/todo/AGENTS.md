# TODO — FX Mode Stabilization Checklist

- [ ] Add lightweight runtime assertion that logs when `mode==='fx'` but `enabled===false` for >500ms after pressing the FX toggle on mobile Safari.
- [ ] Capture a fresh iPhone `?fxdebug=1&fxprobe=1` screenshot set after this upload-gate fix and confirm HUD shows non-zero `uploadsQueued/uploadsAttempted/uploadsSucceeded`.
- [x] Fix FX toggle activation path so entering FX calls `tileFX.enable()` and leaving FX calls `tileFX.disable()`.
- [x] Remove upload starvation from strict scroll-idle gating by allowing uploads during scroll unless cache pressure is high.
- [x] Expose explicit upload pipeline counters (`uploadsQueued`, `uploadsAttempted`, `uploadsSucceeded`, `uploadsFailed`) in TileFX debug state/HUD.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once baseline probe shows READY-state stability and low eviction churn.
- [x] Add FX debug probe button in `fxdebug=1` mode that logs first 20 visible tiles (key, key source, state, hasTexture, data-tex, image readiness).
- [x] Enforce key-derivation traceability (`assetId|path|relative|thumbSrc|...`) and key-change tracking per card across scans.
- [x] Add “never evict visible” cache policy with minimum-age hysteresis for eviction candidates.
- [x] Expose cache telemetry (`cacheBytes`, `cacheBudgetBytes`, `evictReason`) in TileFX HUD.
- [x] Separate upload drain concerns from draw path (`_drainPendingUploads` called outside `_render`) and gate uploads by mode/enabled/visibility/scroll-idle.
- [x] Improve shader thumbnail mapping with cover-style UV fitting + rounded-rect mask so READY tiles match DOM framing better.
- [x] Keep FX renderer-swap contract: DOM thumbnail hide only on `data-tex="1"`, metadata/interactions remain visible.
