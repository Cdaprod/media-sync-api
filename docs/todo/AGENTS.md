# TODO — FX Mode Stabilization Checklist

- [ ] Capture iPhone probe output (`Probe FX`) after scroll-stop and attach key/state logs to next handoff so we can confirm key stability under real Safari kinetic scroll.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once baseline probe shows READY-state stability and low eviction churn.
- [x] Add FX debug probe button in `fxdebug=1` mode that logs first 20 visible tiles (key, key source, state, hasTexture, data-tex, image readiness).
- [x] Enforce key-derivation traceability (`assetId|path|relative|thumbSrc|...`) and key-change tracking per card across scans.
- [x] Add “never evict visible” cache policy with minimum-age hysteresis for eviction candidates.
- [x] Expose cache telemetry (`cacheBytes`, `cacheBudgetBytes`, `evictReason`) in TileFX HUD.
- [x] Separate upload drain concerns from draw path (`_drainPendingUploads` called outside `_render`) and gate uploads by mode/enabled/visibility/scroll-idle.
- [x] Improve shader thumbnail mapping with cover-style UV fitting + rounded-rect mask so READY tiles match DOM framing better.
- [x] Keep FX renderer-swap contract: DOM thumbnail hide only on `data-tex="1"`, metadata/interactions remain visible.
