(() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const getSlider = () => document.querySelector('input[type="range"]');

  const setDensity = (n) => {
    const slider = getSlider();
    if (!slider) {
      console.warn('No density slider found');
      return false;
    }
    slider.value = String(n);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  const getVisibleCards = () => {
    const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));
    const vh = window.innerHeight;
    return cards.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < vh;
    });
  };

  const snapshotCards = () => {
    const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));
    const out = new Map();
    for (const el of cards) {
      const id = el.dataset.cardId || el.dataset.selectKey || el.dataset.relative || '';
      if (!id) continue;
      const r = el.getBoundingClientRect();
      out.set(id, {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      });
    }
    return out;
  };

  const diffSnapshots = (before, after) => {
    let totalCompared = 0;
    let movedOver20 = 0;
    let movedOver60 = 0;
    let movedOver120 = 0;
    let resizedWidth = 0;
    let resizedHeight = 0;
    const top20 = [];

    for (const [id, a] of before.entries()) {
      const b = after.get(id);
      if (!b) continue;
      totalCompared += 1;
      const dx = +(b.left - a.left).toFixed(2);
      const dy = +(b.top - a.top).toFixed(2);
      const dw = +(b.width - a.width).toFixed(2);
      const dh = +(b.height - a.height).toFixed(2);
      const moveDistance = +Math.hypot(dx, dy).toFixed(2);

      if (moveDistance > 20) movedOver20 += 1;
      if (moveDistance > 60) movedOver60 += 1;
      if (moveDistance > 120) movedOver120 += 1;
      if (Math.abs(dw) > 0.5) resizedWidth += 1;
      if (Math.abs(dh) > 0.5) resizedHeight += 1;

      top20.push({ id, dx, dy, dw, dh, moveDistance });
    }

    top20.sort((a, b) => b.moveDistance - a.moveDistance);

    return {
      totalCompared,
      movedOver20,
      movedOver60,
      movedOver120,
      resizedWidth,
      resizedHeight,
      top20: top20.slice(0, 20),
    };
  };

  const sampleFrames = async (durationMs = 900) => {
    const samples = [];
    let prev = performance.now();
    const start = prev;

    return new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - prev;
        prev = now;
        samples.push(dt);
        if (now - start >= durationMs) {
          const totalFrames = samples.length;
          const avgFrameMs = +(samples.reduce((a, b) => a + b, 0) / Math.max(totalFrames, 1)).toFixed(2);
          const maxFrameMs = +Math.max(...samples).toFixed(2);
          const over16ms = samples.filter((n) => n > 16.7).length;
          const over24ms = samples.filter((n) => n > 24).length;
          const over32ms = samples.filter((n) => n > 32).length;
          resolve({
            totalFrames,
            avgFrameMs,
            maxFrameMs,
            over16ms,
            over24ms,
            over32ms,
            sample: samples.slice(0, 60).map((n) => +n.toFixed(2)),
          });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  const getMotionDebug = () => {
    try {
      return window.__explorerDensityMotionDebug?.getSnapshot?.() ?? null;
    } catch {
      return null;
    }
  };

  const runStep = async (target) => {
    console.log(`--- Density step → ${target} ---`);

    const before = snapshotCards();
    const beforeVisible = getVisibleCards().length;

    const ok = setDensity(target);
    if (!ok) {
      return { target, error: 'failed_to_set_density' };
    }

    const frame = await sampleFrames(900);
    await wait(120);
    const after = snapshotCards();
    const afterVisible = getVisibleCards().length;
    const churn = diffSnapshots(before, after);
    const motion = getMotionDebug();

    return {
      target,
      beforeVisible,
      afterVisible,
      frame,
      churn,
      motion,
    };
  };

  const run = async (sequence = [1, 5, 2, 4]) => {
    const results = [];
    for (const target of sequence) {
      results.push(await runStep(target));
      await wait(250);
    }
    console.log('=== Density Sweep Results ===');
    console.log(results);
    window.__densitySweepResults = results;
    return results;
  };

  window.__runDensitySweep = run;
  console.log('Ready: run __runDensitySweep()');
})();

__runDensitySweep()