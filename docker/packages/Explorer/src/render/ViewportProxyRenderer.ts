import type { FocusSceneSnapshot, ProxyCameraState } from './renderTypes';

export class ViewportProxyRenderer {
  private root: HTMLElement;
  private mounted = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount() {
    if (this.mounted) return;
    this.root.dataset.proxyRendererMounted = 'true';
    this.root.innerHTML = `
      <div class="proxy-render-surface">
        <div class="proxy-render-world"></div>
      </div>
    `;
    this.mounted = true;
  }

  unmount() {
    this.root.innerHTML = '';
    delete this.root.dataset.proxyRendererMounted;
    this.mounted = false;
  }

  render(snapshot: FocusSceneSnapshot, camera: ProxyCameraState, opts?: {
    showActiveChrome?: boolean;
  }) {
    if (!this.mounted) this.mount();
    const showActiveChrome = opts?.showActiveChrome ?? true;

    const world = this.root.querySelector<HTMLElement>('.proxy-render-world');
    if (!world) return;

    world.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;

    world.innerHTML = snapshot.cards
      .sort((a, b) => b.priority - a.priority)
      .map((card) => {
        const activeClass = card.active ? 'is-active' : '';
        const ambientClass = card.active ? '' : 'is-ambient';
        const selectedClass = card.selected ? 'is-selected' : '';
        const activeMarker = card.active ? 'true' : 'false';
        const chromeScale = Math.max(0.72, Math.min(1, card.rect.width / 360));
        const thumb = (card.active && card.kind === 'video' && card.mediaUrl)
          ? `
            ${card.thumbUrl ? `<img class="proxy-render-poster" src="${card.thumbUrl}" alt="">` : ''}
            <video class="proxy-render-video" src="${card.mediaUrl}" muted autoplay loop playsinline preload="auto"></video>
          `
          : card.thumbUrl
            ? `<img src="${card.thumbUrl}" alt="">`
          : `<div class="proxy-render-fallback">${card.kind}</div>`;
        const activeChrome = showActiveChrome && card.active
          ? '<div class="proxy-render-scrim"></div><div class="proxy-render-ui-slot" data-proxy-ui-slot="true"></div>'
          : '';

        return `
          <div
            class="proxy-render-card ${activeClass} ${ambientClass} ${selectedClass}"
            data-selection-key="${card.selectionKey}"
            data-select-key="${card.selectionKey}"
            data-proxy-active="${activeMarker}"
            style="
              left:${card.rect.left}px;
              top:${card.rect.top}px;
              width:${card.rect.width}px;
              height:${card.rect.height}px;
              --proxy-chrome-scale:${chromeScale};
            "
          >
            <div class="proxy-render-thumb">${thumb}</div>
            ${activeChrome}
          </div>
        `;
      })
      .join('');
  }
}
