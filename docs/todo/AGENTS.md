# TODO — FX Mode Stabilization Checklist

- [ ] Add a lightweight runtime probe that snapshots FX/non-FX canvas states (`display`, `pos`, `drawCalls`) directly to HUD for one-tap mobile verification.
- [ ] Consider adding `requestIdleCallback` upload promotion fallback for iOS where scroll-idle timers can jitter on kinetic scroll.
- [x] Make FX mode exclusive (`window.__tilefx_enabled`) and wire view lifecycle to start/stop/clear TileFX.
- [x] Hard-disable TileFX canvas in non-FX modes (`display:none`, transparent clear, no draw loop).
- [x] Remove aggressive FX-only visual downgrade styles that dim/smoosh cards and hide metadata context.
- [x] Keep metadata overlays/selection UI visible in FX while only swapping thumbnail layer via `data-tex`.
- [x] Gate TileFX upload drain while scrolling (`noteScroll` idle window) to reduce stutter.
- [x] Enforce conservative FX pipeline budgets (`TILEFX_SCAN_MIN_INTERVAL_MS=120`, `maxUploadsPerFrame=1`, `maxUploadsPerSecond=8`).
- [x] Add FX health invariants to HUD/debug (`enabled`, `rafRunning`, `tilesFed/drawn`, `scrolling`, `scrollIdleMs`, non-FX draw-call guard).
- [x] Default explorer startup view to Grid while FX tuning continues.
- [x] Update static regression tests for new FX lifecycle and view-mode invariants.
