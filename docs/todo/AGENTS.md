# TODO — FX Mode Stabilization Checklist

- [ ] Capture iPhone proof run with `?fxdebug=1&fxprobe=1&tilefxMaxTex=512` to verify no thumb peek-through during fast scroll.
- [ ] Validate whether desktop default should remain `640` or be raised/lowered after quality/perf sampling.
- [ ] Add optional debug toast when any swapped tile (`data-tex=1`) still has visible thumb-surface opacity > 0.
- [x] Replace CSS-only swap ownership with direct element ownership (`thumbSurfaceEl`/`thumbBgEl`) and inline swap control in TileFX renderer.
- [x] Apply DOM swap only after actual GL draw for READY tiles, and restore immediately on non-ready/evicted paths.
- [x] Raise coarse-pointer default texture cap to 512 (`tilefxMaxTex` override still supported).
- [x] Make `evictReason` telemetry non-sticky by reporting `none` while comfortably under cache budget.
- [x] Extend layout debug to report TileFX canvas transformed-ancestor context for compositor-stack troubleshooting.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once swap ownership and cache telemetry stay stable on iPhone.
