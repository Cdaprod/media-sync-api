(() => {
  const previews = Array.from(document.querySelectorAll('.asset-thumb-preview'));

  const report = previews.map((el) => ({
    src: el.currentSrc || el.src || '',
    paused: el.paused,
    readyState: el.readyState,
    currentTime: Number(el.currentTime.toFixed(2)),
    muted: el.muted,
    loop: el.loop,
    visible: (() => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    })(),
  }));

  const summary = {
    totalPreviewVideos: report.length,
    visiblePreviewVideos: report.filter((x) => x.visible).length,
    playingPreviewVideos: report.filter((x) => !x.paused).length,
    playingVisiblePreviewVideos: report.filter((x) => x.visible && !x.paused).length,
    report,
  };

  console.log('[MediaPreviewProbe] summary:', summary);
  window.__mediaPreviewProbe = summary;
  return summary;
})();