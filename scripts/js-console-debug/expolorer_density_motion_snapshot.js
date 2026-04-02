(() => {
  const snap = window.__explorerDensityMotionDebug?.getSnapshot?.();
  console.log('DensityMotionDebug snapshot:', snap);
  window.__lastDensityMotionDebug = snap;
})();
