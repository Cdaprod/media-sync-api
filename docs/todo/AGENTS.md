# TODO — FX Mode Stabilization Checklist

- [ ] Add an on-device probe button that logs first 20 visible tile keys + tile states (`DOM_ONLY/REQUESTED/UPLOADING/READY/EVICTED`) to quickly diagnose key thrash in iOS Safari.
- [ ] Add a tiny atlas path experiment for low-memory devices to reduce texture bind churn when many tiles are READY at once.
- [x] Implement TileFX per-tile ownership state machine (`DOM_ONLY/REQUESTED/UPLOADING/READY/EVICTED`) and gate DOM swap to `READY` only.
- [x] Prevent premature DOM thumb hiding by restricting FX thumb hide CSS to `body.fx-mode .asset[data-tex="1"]`.
- [x] Keep FX as renderer swap model: DOM card surface transparent in FX mode while metadata + interaction remain visible/tappable.
- [x] Keep GL placeholder tile visible for non-ready tiles (no transparent holes) while uploads/decode progress.
- [x] Enforce stable key priority in tile collection (`assetId/path/thumbSrc/...`) to reduce cache thrash.
- [x] Add decode-once memoization (`decodedSrcSet`) to avoid repeated `img.decode()` churn for the same source.
- [x] Extend TileFX HUD/debug with swap state counters and health fields (`stateCounts`, `readyTiles`, `pendingTiles`, `swapSetCalls`, `swapClearCalls`).
- [x] Keep conservative FX pipeline budgets (`scan=120ms`, `maxUploadsPerFrame=1`, `maxUploadsPerSecond=8`) and scroll-idle upload gating.
