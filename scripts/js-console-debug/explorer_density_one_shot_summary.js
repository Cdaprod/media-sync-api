(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const slider =
    document.querySelector('#asset-density-slider') ||
    document.querySelector('input[type="range"][id*="density"]') ||
    document.querySelector('input[type="range"]');

  const grid =
    document.querySelector('.masonry-columns') ||
    document.querySelector('[data-density-columns]');

  const scrollHost =
    document.querySelector('.content .scroll[data-density-pinch-surface="true"]') ||
    document.querySelector('.content .scroll') ||
    document.querySelector('.scroll');

  if (!slider || !grid) {
    console.error('Probe failed: slider or grid not found', {
      sliderFound: !!slider,
      gridFound: !!grid,
    });
    return;
  }

  const getVisibleCards = () => {
    const hostRect = (scrollHost || document.documentElement).getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));
    return cards.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > hostRect.top && r.top < hostRect.bottom;
    });
  };

  const isIdentityTransform = (value) => {
    if (!value || value === 'none') return true;
    const normalized = String(value).replace(/\s+/g, '');
    return (
      normalized === 'matrix(1,0,0,1,0,0)' ||
      normalized === 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)'
    );
  };

  const getResidueCount = () => {
    const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));
    return cards.reduce((count, el) => {
      const t = getComputedStyle(el).transform;
      return count + (isIdentityTransform(t) ? 0 : 1);
    }, 0);
  };

  const getColumnCount = () => {
    const visible = getVisibleCards();
    const groups = new Map();
    for (const el of visible) {
      const r = el.getBoundingClientRect();
      groups.set(Math.round(r.left), true);
    }
    return groups.size;
  };

  const getFrameProbe = async (fn, sampleMs = 700) => {
    const frames = [];
    let rafId = 0;
    let running = true;
    let last = performance.now();

    const tick = (now) => {
      if (!running) return;
      frames.push(now - last);
      last = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    await fn();
    await wait(sampleMs);
    running = false;
    cancelAnimationFrame(rafId);

    const avg = frames.length ? frames.reduce((s, v) => s + v, 0) / frames.length : 0;
    return {
      avgMs: Number(avg.toFixed(2)),
      maxMs: Number((frames.length ? Math.max(...frames) : 0).toFixed(2)),
      totalFrames: frames.length,
      over16ms: frames.filter((v) => v > 16).length,
      over24ms: frames.filter((v) => v > 24).length,
      over32ms: frames.filter((v) => v > 32).length,
    };
  };

  const setDensity = async (target) => {
    slider.value = String(target);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    slider.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    slider.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await wait(900);
  };

  const capture = (target, frame) => {
    const layout = window.__explorerDensityLayoutDebug?.getSnapshot?.() || {};
    const motionRaw = window.__explorerDensityMotionDebug?.getSnapshot?.();
    const motion = Array.isArray(motionRaw) ? motionRaw[0] : (motionRaw || {});
    const visibleCols = getColumnCount();

    return {
      target,
      slider: Number(slider.value),
      dataset: Number(grid.dataset.columns || grid.getAttribute('data-density-columns') || 0),
      cssVar: Number(getComputedStyle(grid).getPropertyValue('--masonry-column-count').trim() || 0),
      visibleCols,
      logical: layout.totalLogicalCount ?? null,
      rendered: layout.renderedItemCount ?? null,
      visibleRendered: layout.visibleRenderedItemCount ?? null,
      renderBufferMode: layout.renderBufferMode ?? null,
      layoutComputedItemCount: layout.layoutComputedItemCount ?? null,
      layoutComputationScope: layout.layoutComputationScope ?? null,
      animated: motion.animatedTargetCount ?? null,
      motionActive: motion.motionActive ?? null,
      simplifiedCardMode: motion.simplifiedCardMode ?? null,
      residue: getResidueCount(),
      avgMs: frame.avgMs,
      maxMs: frame.maxMs,
      ok:
        Number(slider.value) === target &&
        Number(grid.dataset.columns || grid.getAttribute('data-density-columns') || 0) === target &&
        Number(getComputedStyle(grid).getPropertyValue('--masonry-column-count').trim() || 0) === target &&
        visibleCols === target,
    };
  };

  const targets = [1, 5, 2, 4];
  const rows = [];

  for (const target of targets) {
    const frame = await getFrameProbe(async () => {
      await setDensity(target);
    });
    rows.push(capture(target, frame));
  }

  const headline = {
    failures: rows.filter((r) => !r.ok).length,
    worstAvgFrameMs: Number(Math.max(...rows.map((r) => r.avgMs || 0)).toFixed(2)),
    worstMaxFrameMs: Number(Math.max(...rows.map((r) => r.maxMs || 0)).toFixed(2)),
    renderedReductionWorking: rows.some(
      (r) => typeof r.rendered === 'number' && typeof r.logical === 'number' && r.rendered < r.logical
    ),
    layoutStillGlobal: rows.some((r) => String(r.layoutComputationScope).toLowerCase().includes('global')),
    likelyPrimaryIssue:
      rows.some((r) => !r.ok)
        ? 'correctness_regression'
        : Math.max(...rows.map((r) => r.avgMs || 0)) > 24
          ? 'remaining_layout_or_render_cost'
          : 'healthy_or_near_healthy',
  };

  const report = { headline, rows };
  window.__densityFollowupReport = report;

  console.log('=== Density Follow-up Headline ===');
  console.table([headline]);
  console.log('=== Density Follow-up Summary ===');
  console.table(
    rows.map((r) => ({
      target: r.target,
      slider: r.slider,
      dataset: r.dataset,
      cssVar: r.cssVar,
      visibleCols: r.visibleCols,
      rendered: r.rendered,
      logical: r.logical,
      visibleRendered: r.visibleRendered,
      bufferMode: r.renderBufferMode,
      layoutCount: r.layoutComputedItemCount,
      layoutScope: r.layoutComputationScope,
      animated: r.animated,
      avgMs: r.avgMs,
      maxMs: r.maxMs,
      residue: r.residue,
      ok: r.ok,
    }))
  );
  console.log('Full report saved as window.__densityFollowupReport');
})();