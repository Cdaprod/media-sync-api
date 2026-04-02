(() => {
  const root = document.querySelector('.content') || document.body;
  const key = 'explorer-paint-ablation';

  if (root.dataset[key] === 'on') {
    root.dataset[key] = 'off';
    document.getElementById('explorer-paint-ablation-style')?.remove();
    console.log('Paint ablation OFF');
    return;
  }

  const style = document.createElement('style');
  style.id = 'explorer-paint-ablation-style';
  style.textContent = `
    .content[data-explorer-paint-ablation="on"] .asset-thumb-preview { display: none !important; }
    .content[data-explorer-paint-ablation="on"] .asset::before,
    .content[data-explorer-paint-ablation="on"] .asset::after,
    .content[data-explorer-paint-ablation="on"] .thumb::before,
    .content[data-explorer-paint-ablation="on"] .thumb::after { display: none !important; }
    .content[data-explorer-paint-ablation="on"] .asset,
    .content[data-explorer-paint-ablation="on"] .row {
      box-shadow: none !important;
      filter: none !important;
    }
    .content[data-explorer-paint-ablation="on"] .asset-overlay {
      opacity: 0.55 !important;
    }
  `;
  document.head.appendChild(style);
  root.dataset.explorerPaintAblation = 'on';
  root.dataset[key] = 'on';
  console.log('Paint ablation ON');
})();