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

  render(snapshot: FocusSceneSnapshot, camera: ProxyCameraState) {
    if (!this.mounted) this.mount();

    const world = this.root.querySelector<HTMLElement>('.proxy-render-world');
    if (!world) return;

    world.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;

    world.innerHTML = snapshot.cards
      .sort((a, b) => b.priority - a.priority)
      .map((card) => {
        const activeClass = card.active ? 'is-active' : '';
        const selectedClass = card.selected ? 'is-selected' : '';
        const thumb = card.thumbUrl
          ? `<img src="${card.thumbUrl}" alt="">`
          : `<div class="proxy-render-fallback">${card.kind}</div>`;

        return `
          <div
            class="proxy-render-card ${activeClass} ${selectedClass}"
            data-selection-key="${card.selectionKey}"
            style="
              left:${card.rect.left}px;
              top:${card.rect.top}px;
              width:${card.rect.width}px;
              height:${card.rect.height}px;
            "
          >
            <div class="proxy-render-thumb">${thumb}</div>
          </div>
        `;
      })
      .join('');
  }
}
