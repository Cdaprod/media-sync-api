(() => {
  const state = {
    running: false,
    frames: [],
    start: 0,
    last: 0,
  };

  function begin(label = 'density-motion') {
    state.running = true;
    state.frames = [];
    state.start = performance.now();
    state.last = state.start;

    function tick(now) {
      if (!state.running) return;
      const dt = now - state.last;
      state.last = now;
      state.frames.push(dt);
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    console.log(`[DensityFrameProbe] armed for "${label}". Change density, then run window.__densityFrameProbe.finish()`);
  }

  function finish() {
    state.running = false;
    const frames = state.frames.slice();
    const total = frames.length;
    const over16 = frames.filter((x) => x > 16.7).length;
    const over24 = frames.filter((x) => x > 24).length;
    const over32 = frames.filter((x) => x > 32).length;
    const max = frames.length ? Math.max(...frames) : 0;
    const avg = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;

    const summary = {
      totalFrames: total,
      avgFrameMs: Number(avg.toFixed(2)),
      maxFrameMs: Number(max.toFixed(2)),
      over16ms: over16,
      over24ms: over24,
      over32ms: over32,
      sample: frames.slice(0, 60).map((x) => Number(x.toFixed(2))),
    };

    console.log('[DensityFrameProbe] summary:', summary);
    window.__densityFrameProbeLast = summary;
    return summary;
  }

  window.__densityFrameProbe = { begin, finish };
  begin();
})();