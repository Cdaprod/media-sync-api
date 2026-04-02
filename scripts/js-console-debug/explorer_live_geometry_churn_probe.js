(() => {
  const sampleFrames = [];
  let running = true;
  let prev = null;

  const getVisibleCards = () => Array.from(document.querySelectorAll('.masonry-card.asset'))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    })
    .slice(0, 40);

  function capture() {
    const cards = getVisibleCards().map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.cardId || el.dataset.selectKey || '',
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      };
    });

    if (prev) {
      let moved = 0;
      let resized = 0;
      for (const card of cards) {
        const old = prev.find((x) => x.id === card.id);
        if (!old) continue;
        const dx = Math.abs(card.left - old.left);
        const dy = Math.abs(card.top - old.top);
        const dw = Math.abs(card.width - old.width);
        const dh = Math.abs(card.height - old.height);
        if (dx > 0.5 || dy > 0.5) moved++;
        if (dw > 0.5 || dh > 0.5) resized++;
      }
      sampleFrames.push({
        moved,
        resized,
        visible: cards.length,
      });
    }

    prev = cards;
    if (running) requestAnimationFrame(capture);
  }

  requestAnimationFrame(capture);

  window.__geometryChurnProbe = {
    finish() {
      running = false;
      const summary = {
        frameSamples: sampleFrames.length,
        maxMoved: Math.max(0, ...sampleFrames.map((x) => x.moved)),
        maxResized: Math.max(0, ...sampleFrames.map((x) => x.resized)),
        samples: sampleFrames.slice(0, 120),
      };
      console.log('[GeometryChurnProbe] summary:', summary);
      window.__geometryChurnProbeLast = summary;
      return summary;
    }
  };

  console.log('[GeometryChurnProbe] armed. Change density, then run window.__geometryChurnProbe.finish()');
})();