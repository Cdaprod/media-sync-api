(() => {
  const pick = document.querySelector('.masonry-card.asset');
  if (!pick) {
    console.warn('No asset card found');
    return;
  }

  const read = (el) => {
    const cs = getComputedStyle(el);
    const thumb = el.querySelector('.thumb');
    const tcs = thumb ? getComputedStyle(thumb) : null;
    return {
      transition: cs.transition,
      transform: cs.transform,
      boxShadow: cs.boxShadow,
      filter: cs.filter,
      willChange: cs.willChange,
      contain: cs.contain,
      thumbBefore: thumb ? getComputedStyle(thumb, '::before').content : '',
      thumbAfter: thumb ? getComputedStyle(thumb, '::after').content : '',
      thumbMixBlend: tcs?.mixBlendMode || '',
    };
  };

  const baseline = read(pick);

  window.__styleDiffProbe = {
    baseline,
    during() {
      const current = read(pick);
      const diff = { baseline, current };
      console.log('[StyleDiffProbe] diff:', diff);
      return diff;
    }
  };

  console.log('[StyleDiffProbe] baseline saved. Change density during motion, then run window.__styleDiffProbe.during()');
})();
