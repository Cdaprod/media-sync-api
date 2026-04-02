(() => {
  const card =
    document.querySelector('.masonry-card.asset[data-card-id]') ||
    document.querySelector('.masonry-card.asset');

  if (!card) {
    console.error('No visible asset card found');
    return;
  }

  const nodes = {
    tl: card.querySelector('.asset-ol-tl'),
    tr: card.querySelector('.asset-ol-tr'),
    bl: card.querySelector('.asset-ol-bl'),
    bottom: card.querySelector('.asset-ol-bottom'),
  };

  const read = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      opacity: Number(cs.opacity),
      transform: cs.transform,
      transition: cs.transition,
      display: cs.display,
      visibility: cs.visibility,
    };
  };

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
      hostClassName: motion.classHostClassName ?? null,
      gesture: motion.gestureClassApplied ?? false,
      motion: motion.motionClassApplied ?? false,
      settling: motion.settlingClassApplied ?? false,
      tl: read(nodes.tl),
      tr: read(nodes.tr),
      bl: read(nodes.bl),
      bottom: read(nodes.bottom),
    });

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  window.__stopOverlayStyleProbe = () => {
    running = false;
    cancelAnimationFrame(rafId);

    const minOpacity = (key) => Math.min(...samples.map((s) => s[key]?.opacity ?? 1));
    const maxOpacity = (key) => Math.max(...samples.map((s) => s[key]?.opacity ?? 0));

    const summary = {
      gestureSeen: samples.some((s) => s.gesture),
      motionSeen: samples.some((s) => s.motion),
      settlingSeen: samples.some((s) => s.settling),

      tlMinOpacity: minOpacity('tl'),
      trMinOpacity: minOpacity('tr'),
      blMinOpacity: minOpacity('bl'),
      bottomMinOpacity: minOpacity('bottom'),

      tlMaxOpacity: maxOpacity('tl'),
      trMaxOpacity: maxOpacity('tr'),
      blMaxOpacity: maxOpacity('bl'),
      bottomMaxOpacity: maxOpacity('bottom'),

      tlEverHidden: minOpacity('tl') < 0.1,
      trEverHidden: minOpacity('tr') < 0.1,
      blEverHidden: minOpacity('bl') < 0.1,
      bottomEverHidden: minOpacity('bottom') < 0.1,

      tlEverVisible: maxOpacity('tl') > 0.9,
      trEverVisible: maxOpacity('tr') > 0.9,
      blEverVisible: maxOpacity('bl') > 0.9,
      bottomEverVisible: maxOpacity('bottom') > 0.9,

      finalHostClassName: samples[samples.length - 1]?.hostClassName ?? null,
      sampleCount: samples.length,
    };

    window.__overlayStyleProbeReport = { summary, samples };

    console.log('=== Overlay Style Probe Summary ===');
    console.table([summary]);
    console.log('First 80 samples:');
    console.table(samples.slice(0, 80));
    console.log('Full report saved as window.__overlayStyleProbeReport');
  };

  console.log('Probe armed. Do the density gesture, hold briefly, release, wait a second, then run: window.__stopOverlayStyleProbe()');
})();