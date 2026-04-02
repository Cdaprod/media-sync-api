(() => {
  const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));
  const before = new Map();

  cards.forEach((el) => {
    const id = el.dataset.cardId || el.dataset.selectKey || '';
    const rect = el.getBoundingClientRect();
    before.set(id, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  });

  console.log('Density motion sample armed.');
  console.log('Now change density, then run: window.__explorerDensityMotionSample.finish()');

  window.__explorerDensityMotionSample = {
    finish() {
      const afterCards = Array.from(document.querySelectorAll('.masonry-card.asset'));
      const deltas = [];

      afterCards.forEach((el) => {
        const id = el.dataset.cardId || el.dataset.selectKey || '';
        const prev = before.get(id);
        if (!prev) return;
        const rect = el.getBoundingClientRect();

        deltas.push({
          id,
          dx: +(rect.left - prev.left).toFixed(2),
          dy: +(rect.top - prev.top).toFixed(2),
          dw: +(rect.width - prev.width).toFixed(2),
          dh: +(rect.height - prev.height).toFixed(2),
          moveDistance: +Math.hypot(rect.left - prev.left, rect.top - prev.top).toFixed(2),
        });
      });

      deltas.sort((a, b) => b.moveDistance - a.moveDistance);

      const summary = {
        totalCompared: deltas.length,
        movedOver20px: deltas.filter((d) => d.moveDistance > 20).length,
        movedOver60px: deltas.filter((d) => d.moveDistance > 60).length,
        movedOver120px: deltas.filter((d) => d.moveDistance > 120).length,
        resizedWidth: deltas.filter((d) => Math.abs(d.dw) > 1).length,
        resizedHeight: deltas.filter((d) => Math.abs(d.dh) > 1).length,
        top20: deltas.slice(0, 20),
      };

      console.log('Density motion summary:', summary);
      window.__explorerDensityMotionSampleReport = summary;
      return summary;
    },
  };
})();