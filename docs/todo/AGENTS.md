# TODO — FX Mode Stabilization Checklist

- [x] Make FX mode exclusive (`window.__tilefx_enabled`) and wire view lifecycle to start/stop/clear TileFX.
- [x] Hard-disable TileFX canvas in non-FX modes (`display:none`, transparent clear, no draw loop).
- [x] Remove aggressive FX-only visual downgrade styles that dim/smoosh cards and hide metadata context.
- [x] Keep metadata overlays/selection UI visible in FX while only swapping thumbnail layer via `data-tex`.
- [x] Gate TileFX upload drain while scrolling (`noteScroll` idle window) to reduce stutter.
- [x] Default explorer startup view to Grid while FX tuning continues.
- [x] Update static regression tests for new FX lifecycle and view-mode invariants.
