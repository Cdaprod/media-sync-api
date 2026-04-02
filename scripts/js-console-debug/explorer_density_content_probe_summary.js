(() => {
  const content = document.querySelector('.content');
  if (!content) {
    console.error('No .content host found');
    return;
  }

  const samples = [];
  let rafId = 0;
  let running = true;
  const start = performance.now();

  const tick = () => {
    if (!running) return;

    const motionRaw = window.__explorerDensityMotionDebug?.getSnapshot?.();
    const motion = Array.isArray(motionRaw) ? motionRaw[0] : (motionRaw || {});

    samples.push({
      t: Math.round(performance.now() - start),
      className: content.className,
      gestureClass: content.classList.contains('density-gesture-active'),
      motionClass: content.classList.contains('density-motion-active'),
      settlingClass: content.classList.contains('density-motion-settling'),
      debugGestureApplied: motion.gestureClassApplied ?? null,
      debugMotionApplied: motion.motionClassApplied ?? null,
      debugSettlingApplied: motion.settlingClassApplied ?? null,
      classHostTag: motion.classHostTag ?? null,
      classHostClassName: motion.classHostClassName ?? null,
    });

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  window.__stopDensityClassHostProbe = () => {
    running = false;
    cancelAnimationFrame(rafId);

    const summary = {
      gestureSeen: samples.some((s) => s.gestureClass),
      motionSeen: samples.some((s) => s.motionClass),
      settlingSeen: samples.some((s) => s.settlingClass),
      debugGestureSeen: samples.some((s) => s.debugGestureApplied === true),
      debugMotionSeen: samples.some((s) => s.debugMotionApplied === true),
      debugSettlingSeen: samples.some((s) => s.debugSettlingApplied === true),
      hostTag: samples.find((s) => s.classHostTag)?.classHostTag ?? null,
      hostClassName: samples.find((s) => s.classHostClassName)?.classHostClassName ?? null,
      sampleCount: samples.length,
    };

    window.__densityClassHostProbeReport = { summary, samples };
    console.log('=== Density Class Host Probe Summary ===');
    console.table([summary]);
    console.log('First 60 samples:');
    console.table(samples.slice(0, 60));
    console.log('Full report saved as window.__densityClassHostProbeReport');
  };

  console.log('Probe armed. Do the density gesture, then run: window.__stopDensityClassHostProbe()');
})();