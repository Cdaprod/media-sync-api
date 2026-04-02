(() => {
  if (globalThis.__explorerDensityWatchStop) {
    globalThis.__explorerDensityWatchStop();
  }

  let raf = 0;
  const rows = [];

  const tick = () => {
    const slider = document.querySelector('#asset-density-slider');
    const grid = document.querySelector('.masonry-columns');
    const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));
    const visible = cards.filter((card) => {
      const r = card.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });

    const lefts = [...new Set(
      visible.map((card) => Math.round(card.getBoundingClientRect().left)).sort((a, b) => a - b)
    )];

    const transforms = visible.filter((card) => getComputedStyle(card).transform !== 'none').length;

    rows.push({
      t: Math.round(performance.now()),
      slider: slider ? Number(slider.value) : null,
      dataset: grid?.dataset?.densityColumns || grid?.dataset?.columns || null,
      cssVar: grid ? getComputedStyle(grid).getPropertyValue('--masonry-column-count').trim() : null,
      visibleCols: lefts.length,
      visibleCards: visible.length,
      transformedVisibleCards: transforms,
    });

    if (rows.length > 300) rows.shift();
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  globalThis.__explorerDensityWatchStop = () => {
    cancelAnimationFrame(raf);
    console.table(rows.slice(-40));
    globalThis.__explorerDensityWatchRows = rows;
    console.log('Saved as window.__explorerDensityWatchRows');
  };

  console.log('Density watch started. Run __explorerDensityWatchStop() to stop and print.');
})();