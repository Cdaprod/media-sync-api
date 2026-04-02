(() => {
  const cards = Array.from(document.querySelectorAll('.masonry-card.asset'));

  const viewportCards = cards.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  });

  const readCard = (el) => {
    const cs = getComputedStyle(el);
    const thumb = el.querySelector('.thumb');
    const thumbCs = thumb ? getComputedStyle(thumb) : null;

    return {
      id: el.dataset.cardId || el.dataset.selectKey || '',
      active: el.dataset.active === 'true',
      selected: el.classList.contains('is-selected'),
      reinforced: el.classList.contains('is-active-reinforced'),
      hold: el.classList.contains('is-hold-emphasis'),
      boxShadow: cs.boxShadow,
      filter: cs.filter,
      opacity: cs.opacity,
      willChange: cs.willChange,
      contain: cs.contain,
      transition: cs.transition,
      thumbHasAfter: !!thumb && getComputedStyle(thumb, '::after').content !== 'none',
      thumbHasBefore: !!thumb && getComputedStyle(thumb, '::before').content !== 'none',
      thumbMixBlendMode: thumbCs?.mixBlendMode || '',
    };
  };

  const sample = viewportCards.slice(0, 20).map(readCard);

  const summary = {
    visibleCardCount: viewportCards.length,
    cardsWithBoxShadow: sample.filter((x) => x.boxShadow && x.boxShadow !== 'none').length,
    cardsWithFilter: sample.filter((x) => x.filter && x.filter !== 'none').length,
    cardsWithThumbBefore: sample.filter((x) => x.thumbHasBefore).length,
    cardsWithThumbAfter: sample.filter((x) => x.thumbHasAfter).length,
    activeCards: sample.filter((x) => x.active).length,
    selectedCards: sample.filter((x) => x.selected).length,
    sample,
  };

  console.log('[CardVisualCostProbe] summary:', summary);
  window.__cardVisualCostProbe = summary;
  return summary;
})();