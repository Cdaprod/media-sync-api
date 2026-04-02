(() => {
  const content = document.querySelector('.content');
  const app = document.querySelector('.app');
  const main = document.querySelector('.main');

  const report = {
    contentClass: content?.className || '',
    appClass: app?.className || '',
    mainClass: main?.className || '',
    hasPinchPerfActive: !!content?.classList.contains('pinch-perf-active'),
    hasDensityMotionActive: !!content?.classList.contains('density-motion-active'),
  };

  console.log('[MotionModeProbe] report:', report);
  window.__motionModeProbe = report;
  return report;
})();