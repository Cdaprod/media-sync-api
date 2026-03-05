# TODO — FX Mode Stabilization Checklist

- [x] Prevent unintended TileFX shutdown during viewport/layout churn by guarding `destroyTileFX(...)` while FX view remains active and requiring explicit non-FX transition reasons.
- [x] Add disable-call stack telemetry (`[tilefx] DISABLE`) so accidental renderer shutdown paths can be identified quickly from mobile Safari logs.
- [x] Keep viewport event handling resize/collect-only in FX mode (no teardown), including lightweight visualViewport live collect + short debounce collect.
- [x] Restore swapped DOM painters for cards that fall out of the active fed tile set so scroll-away tiles do not remain hidden/disappear when returning.
- [ ] Capture iPhone proof run showing HUD `mode: fx | enabled: 1 | raf: 1` remains stable during aggressive scroll + Safari chrome collapse/expand.
- [ ] Capture iPhone proof run with `?fxdebug=1&fxprobe=1&tilefxDebugRects=1` and verify debug outlines stay locked to card borders while assets no longer vanish after offscreen travel.
- [ ] Add optional per-tile debug toast in FX mode when a swapped card (`data-tex=1`) still reports any painter with computed visibility/opacity showing.
- [ ] Evaluate whether desktop default cap should stay `640` or be tuned to `768` after quality/perf profiling.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once painter-leak checks are clean on iPhone.
