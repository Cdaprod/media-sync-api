(() => {
  const round = (n, p = 2) => Number.isFinite(n) ? Number(n.toFixed(p)) : n;
  const px = (v) => {
    if (typeof v !== 'string') return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const root =
    document.querySelector('.content') ||
    document.querySelector('.app') ||
    document.body;

  const grid =
    document.querySelector('.masonry-columns') ||
    document.querySelector('[data-density-columns]');

  const host =
    document.querySelector('.masonry-host') ||
    grid?.parentElement ||
    null;

  const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));
  const previews = Array.from(document.querySelectorAll('.asset-thumb-preview'));
  const activePreviews = previews.filter((v) => {
    try {
      return !v.paused && !v.ended && v.currentTime > 0;
    } catch {
      return false;
    }
  });

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  const visibleCards = cards.filter((card) => {
    const r = card.getBoundingClientRect();
    return r.bottom > 0 && r.top < viewportH && r.right > 0 && r.left < viewportW;
  });

  const visibleRects = visibleCards.map((card) => {
    const r = card.getBoundingClientRect();
    return {
      el: card,
      left: round(r.left),
      top: round(r.top),
      width: round(r.width),
      height: round(r.height),
      transform: getComputedStyle(card).transform,
      transition: getComputedStyle(card).transition,
    };
  });

  const uniqueLefts = [...new Set(
    visibleRects
      .map((r) => Math.round(r.left))
      .sort((a, b) => a - b)
  )];

  const leftGroups = uniqueLefts.map((left) => {
    const group = visibleRects.filter((r) => Math.abs(r.left - left) <= 2);
    return {
      left,
      count: group.length,
      avgWidth: round(group.reduce((s, r) => s + r.width, 0) / Math.max(group.length, 1)),
    };
  });

  const computedColumns = leftGroups.length;

  const transformResidue = visibleRects.filter((r) => r.transform && r.transform !== 'none');
  const transitionOwned = visibleRects.filter((r) => /transform/i.test(r.transition));

  const densityState = (() => {
    const slider = document.querySelector('#asset-density-slider');
    const gridDataset = grid?.dataset?.densityColumns || grid?.dataset?.columns || null;
    const cssVar = grid ? getComputedStyle(grid).getPropertyValue('--masonry-column-count').trim() : '';
    const debugHook = globalThis.__explorerDensityLayoutDebug?.getSnapshot?.() || null;
    const pinchPerf = globalThis.__explorerPinchPerfDebug?.getStats?.() || null;
    const densityFlip = globalThis.__explorerDensityFlipDebug?.getStats?.() || null;

    return {
      sliderValue: slider ? Number(slider.value) : null,
      gridDatasetColumns: gridDataset ? Number(gridDataset) : null,
      cssVarColumns: cssVar ? Number(cssVar) : null,
      layoutDebug: debugHook,
      pinchPerf,
      densityFlip,
    };
  })();

  const overlayCost = (() => {
    const selected = cards.filter((el) => el.classList.contains('is-selected')).length;
    const active = cards.filter((el) => el.classList.contains('is-active')).length;
    const reinforced = cards.filter((el) => el.classList.contains('is-active-reinforced')).length;
    const hold = cards.filter((el) => el.classList.contains('is-hold-emphasis')).length;

    let pseudoHeavyCount = 0;
    let shadowHeavyCount = 0;

    for (const card of visibleCards) {
      const cs = getComputedStyle(card);
      const after = getComputedStyle(card, '::after');
      const before = getComputedStyle(card, '::before');
      const thumb = card.querySelector('.thumb');
      const thumbAfter = thumb ? getComputedStyle(thumb, '::after') : null;
      const thumbBefore = thumb ? getComputedStyle(thumb, '::before') : null;

      const boxShadow =
        `${cs.boxShadow} ${before?.boxShadow || ''} ${after?.boxShadow || ''} ${thumbBefore?.boxShadow || ''} ${thumbAfter?.boxShadow || ''}`;

      const pseudoContent =
        [before?.content, after?.content, thumbBefore?.content, thumbAfter?.content]
          .filter(Boolean)
          .join(' ');

      if (pseudoContent && pseudoContent !== 'none none none none') pseudoHeavyCount += 1;
      if (boxShadow && boxShadow !== 'none none none none none') shadowHeavyCount += 1;
    }

    return {
      selected,
      active,
      reinforced,
      hold,
      pseudoHeavyVisibleCards: pseudoHeavyCount,
      shadowHeavyVisibleCards: shadowHeavyCount,
    };
  })();

  const layoutHealth = (() => {
    const stageRect = grid?.getBoundingClientRect?.() || null;
    const hostRect = host?.getBoundingClientRect?.() || null;

    const widths = visibleRects.map((r) => r.width);
    const avgWidth = widths.length
      ? round(widths.reduce((a, b) => a + b, 0) / widths.length)
      : 0;

    const widthSpread = widths.length
      ? round(Math.max(...widths) - Math.min(...widths))
      : 0;

    return {
      stageWidth: stageRect ? round(stageRect.width) : null,
      hostWidth: hostRect ? round(hostRect.width) : null,
      visibleCardCount: visibleCards.length,
      computedVisibleColumns: computedColumns,
      uniqueLefts,
      leftGroups,
      avgVisibleCardWidth: avgWidth,
      visibleCardWidthSpread: widthSpread,
    };
  })();

  const assessment = (() => {
    const slider = densityState.sliderValue;
    const dataset = densityState.gridDatasetColumns;
    const cssVar = densityState.cssVarColumns;

    const densityAgreement =
      [slider, dataset, cssVar].every((v) => v == null || v === slider);

    const renderedMatchesDensity =
      slider == null ? null : computedColumns === slider;

    let likelyPrimaryIssue = 'unknown';

    if (slider != null && computedColumns !== slider) {
      if (transformResidue.length) {
        likelyPrimaryIssue = 'stale_transform_residue';
      } else {
        likelyPrimaryIssue = 'layout_commit_or_measurement_desync';
      }
    } else if (activePreviews.length > 0 || overlayCost.shadowHeavyVisibleCards > 0) {
      likelyPrimaryIssue = 'paint_or_compositing_cost';
    } else if (transitionOwned.length > 0) {
      likelyPrimaryIssue = 'css_transform_ownership_conflict';
    } else {
      likelyPrimaryIssue = 'motion_orchestration_cost';
    }

    return {
      densityAgreement,
      renderedMatchesDensity,
      likelyPrimaryIssue,
      notes: {
        mismatchMeans:
          renderedMatchesDensity === false
            ? 'UI density state and visible grid geometry disagree.'
            : 'Visible columns appear aligned with density state.',
        transformResidueMeans:
          transformResidue.length
            ? 'Some cards still have non-none transform after/through motion.'
            : 'No obvious transform residue on visible cards.',
        previewCostMeans:
          activePreviews.length
            ? 'Active preview videos are present during inspection.'
            : 'No active preview videos detected at inspection time.',
      },
    };
  })();

  const report = {
    time: new Date().toISOString(),
    location: window.location.href,
    densityState,
    layoutHealth,
    overlayCost,
    activePreviewCount: activePreviews.length,
    activePreviewElements: activePreviews,
    transformResidueCount: transformResidue.length,
    transformResidueSample: transformResidue.slice(0, 12),
    transitionOwnedCount: transitionOwned.length,
    transitionOwnedSample: transitionOwned.slice(0, 12),
    assessment,
  };

  globalThis.__explorerProbeReport = report;

  console.group('Explorer Density Probe');
  console.log('Report saved as window.__explorerProbeReport');
  console.table({
    sliderValue: densityState.sliderValue,
    gridDatasetColumns: densityState.gridDatasetColumns,
    cssVarColumns: densityState.cssVarColumns,
    computedVisibleColumns: layoutHealth.computedVisibleColumns,
    visibleCardCount: layoutHealth.visibleCardCount,
    activePreviewCount: activePreviews.length,
    transformResidueCount: transformResidue.length,
    transitionOwnedCount: transitionOwned.length,
    likelyPrimaryIssue: assessment.likelyPrimaryIssue,
  });
  console.log('Assessment:', assessment);
  console.log('Layout health:', layoutHealth);
  console.log('Overlay cost:', overlayCost);
  console.log('Transform residue sample:', transformResidue.slice(0, 12));
  console.log('Transition-owned sample:', transitionOwned.slice(0, 12));
  console.log('Full report:', report);
  console.groupEnd();

  return report;
})();