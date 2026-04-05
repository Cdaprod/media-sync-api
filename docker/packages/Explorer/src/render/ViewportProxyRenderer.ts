import type { FocusSceneSnapshot, ProxyCameraState, RenderCardSnapshot } from './renderTypes';

const clampChromeScale = (width: number) => Math.max(0.72, Math.min(1, width / 360));

export class ViewportProxyRenderer {
  private root: HTMLElement;
  private mounted = false;
  private worldEl: HTMLElement | null = null;
  private ambientLayerEl: HTMLElement | null = null;
  private activeLayerEl: HTMLElement | null = null;
  private activeSelectionKey = '';
  private activeCardEl: HTMLElement | null = null;
  private activeVideoEl: HTMLVideoElement | null = null;
  private activePosterEl: HTMLImageElement | null = null;
  private activeVideoNodeStableId = 0;
  private renderPassCount = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount() {
    if (this.mounted) return;
    this.root.dataset.proxyRendererMounted = 'true';
    this.root.innerHTML = `
      <div class="proxy-render-surface">
        <div class="proxy-render-world">
          <div class="proxy-render-ambient-layer"></div>
          <div class="proxy-render-active-layer"></div>
        </div>
      </div>
    `;
    this.worldEl = this.root.querySelector<HTMLElement>('.proxy-render-world');
    this.ambientLayerEl = this.root.querySelector<HTMLElement>('.proxy-render-ambient-layer');
    this.activeLayerEl = this.root.querySelector<HTMLElement>('.proxy-render-active-layer');
    this.mounted = true;
  }

  unmount() {
    this.root.innerHTML = '';
    delete this.root.dataset.proxyRendererMounted;
    this.mounted = false;
    this.worldEl = null;
    this.ambientLayerEl = null;
    this.activeLayerEl = null;
    this.activeSelectionKey = '';
    this.activeCardEl = null;
    this.activeVideoEl = null;
    this.activePosterEl = null;
    this.renderPassCount = 0;
  }

  private ensureLayers() {
    if (!this.mounted) this.mount();
    if (!this.worldEl) {
      this.worldEl = this.root.querySelector<HTMLElement>('.proxy-render-world');
    }
    if (!this.ambientLayerEl) {
      this.ambientLayerEl = this.root.querySelector<HTMLElement>('.proxy-render-ambient-layer');
    }
    if (!this.activeLayerEl) {
      this.activeLayerEl = this.root.querySelector<HTMLElement>('.proxy-render-active-layer');
    }
    return Boolean(this.worldEl && this.ambientLayerEl && this.activeLayerEl);
  }

  private buildAmbientCardHtml(card: RenderCardSnapshot) {
    const selectedClass = card.selected ? 'is-selected' : '';
    const thumb = card.thumbUrl
      ? `<img src="${card.thumbUrl}" alt="">`
      : `<div class="proxy-render-fallback">${card.kind}</div>`;

    return `
      <div
        class="proxy-render-card is-ambient ${selectedClass}"
        data-selection-key="${card.selectionKey}"
        data-select-key="${card.selectionKey}"
        data-proxy-active="false"
        data-video-ready="false"
        data-proxy-media-branch="${card.thumbUrl ? 'thumb' : 'fallback'}"
        style="
          left:${card.rect.left}px;
          top:${card.rect.top}px;
          width:${card.rect.width}px;
          height:${card.rect.height}px;
          --proxy-chrome-scale:${clampChromeScale(card.rect.width)};
        "
      >
        <div class="proxy-render-thumb">${thumb}</div>
      </div>
    `;
  }

  private clearActiveCard() {
    if (this.activeLayerEl) {
      this.activeLayerEl.innerHTML = '';
    }
    this.activeSelectionKey = '';
    this.activeCardEl = null;
    this.activeVideoEl = null;
    this.activePosterEl = null;
  }

  private ensureActiveCardShell(card: RenderCardSnapshot) {
    if (!this.activeLayerEl) return null;
    this.activeLayerEl.innerHTML = `
      <div
        class="proxy-render-card is-active"
        data-selection-key="${card.selectionKey}"
        data-select-key="${card.selectionKey}"
        data-proxy-active="true"
        data-video-ready="false"
      >
        <div class="proxy-render-thumb"></div>
      </div>
    `;
    this.activeCardEl = this.activeLayerEl.querySelector<HTMLElement>('.proxy-render-card[data-proxy-active="true"]');
    return this.activeCardEl;
  }

  private reconcileActiveCard(card: RenderCardSnapshot | null, showActiveChrome: boolean) {
    if (!card) {
      this.clearActiveCard();
      return { activeNodeReused: false, activeMediaRecreated: false };
    }

    const sameSelection = Boolean(this.activeCardEl && this.activeSelectionKey === card.selectionKey);
    let activeNodeReused = sameSelection;
    let activeMediaRecreated = false;

    if (!sameSelection) {
      this.activeSelectionKey = card.selectionKey;
      this.ensureActiveCardShell(card);
      this.activeVideoEl = null;
      this.activePosterEl = null;
      activeNodeReused = false;
      activeMediaRecreated = true;
    }

    const activeCardEl = this.activeCardEl;
    if (!activeCardEl) {
      return { activeNodeReused: false, activeMediaRecreated: true };
    }

    const thumbEl = activeCardEl.querySelector<HTMLElement>('.proxy-render-thumb');
    if (!thumbEl) {
      return { activeNodeReused: false, activeMediaRecreated: true };
    }

    const mediaBranch = (card.kind === 'video' && card.mediaUrl) ? 'video' : (card.thumbUrl ? 'thumb' : 'fallback');
    activeCardEl.className = `proxy-render-card is-active ${card.selected ? 'is-selected' : ''}`;
    activeCardEl.dataset.selectionKey = card.selectionKey;
    activeCardEl.dataset.selectKey = card.selectionKey;
    activeCardEl.dataset.proxyActive = 'true';
    activeCardEl.dataset.proxyMediaBranch = mediaBranch;
    activeCardEl.style.left = `${card.rect.left}px`;
    activeCardEl.style.top = `${card.rect.top}px`;
    activeCardEl.style.width = `${card.rect.width}px`;
    activeCardEl.style.height = `${card.rect.height}px`;
    activeCardEl.style.setProperty('--proxy-chrome-scale', String(clampChromeScale(card.rect.width)));

    if (mediaBranch === 'video' && card.mediaUrl) {
      let videoEl = this.activeVideoEl;
      if (!videoEl || videoEl.parentElement !== thumbEl) {
        videoEl = thumbEl.querySelector<HTMLVideoElement>('.proxy-render-video');
      }
      if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.className = 'proxy-render-video';
        videoEl.muted = true;
        videoEl.autoplay = true;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.preload = 'auto';
        thumbEl.appendChild(videoEl);
        this.activeVideoNodeStableId += 1;
        videoEl.dataset.proxyStableVideoId = String(this.activeVideoNodeStableId);
        activeMediaRecreated = true;
      }
      if (videoEl.src !== card.mediaUrl) {
        videoEl.src = card.mediaUrl;
      }
      this.activeVideoEl = videoEl;

      let posterEl = this.activePosterEl;
      if (!posterEl || posterEl.parentElement !== thumbEl) {
        posterEl = thumbEl.querySelector<HTMLImageElement>('.proxy-render-poster');
      }
      if (card.thumbUrl) {
        if (!posterEl) {
          posterEl = document.createElement('img');
          posterEl.className = 'proxy-render-poster';
          posterEl.alt = '';
          thumbEl.appendChild(posterEl);
          activeMediaRecreated = true;
        }
        if (posterEl.src !== card.thumbUrl) {
          posterEl.src = card.thumbUrl;
        }
      }
      else if (posterEl) {
        posterEl.remove();
        posterEl = null;
        activeMediaRecreated = true;
      }
      this.activePosterEl = posterEl;

      const fallbackEl = thumbEl.querySelector<HTMLElement>('.proxy-render-fallback');
      if (fallbackEl) {
        fallbackEl.remove();
      }
      void videoEl.play().catch(() => {});
    }
    else {
      if (this.activeVideoEl) {
        this.activeVideoEl.remove();
        this.activeVideoEl = null;
        activeMediaRecreated = true;
      }
      if (this.activePosterEl) {
        this.activePosterEl.remove();
        this.activePosterEl = null;
        activeMediaRecreated = true;
      }
      const fallbackKind = card.kind;
      if (card.thumbUrl) {
        let imgEl = thumbEl.querySelector<HTMLImageElement>('img:not(.proxy-render-poster)');
        if (!imgEl) {
          imgEl = document.createElement('img');
          imgEl.alt = '';
          thumbEl.appendChild(imgEl);
          activeMediaRecreated = true;
        }
        if (imgEl.src !== card.thumbUrl) {
          imgEl.src = card.thumbUrl;
        }
        const fallbackEl = thumbEl.querySelector<HTMLElement>('.proxy-render-fallback');
        if (fallbackEl) fallbackEl.remove();
      }
      else {
        let fallbackEl = thumbEl.querySelector<HTMLElement>('.proxy-render-fallback');
        if (!fallbackEl) {
          fallbackEl = document.createElement('div');
          fallbackEl.className = 'proxy-render-fallback';
          thumbEl.appendChild(fallbackEl);
          activeMediaRecreated = true;
        }
        fallbackEl.textContent = fallbackKind;
        const imgEl = thumbEl.querySelector<HTMLImageElement>('img:not(.proxy-render-poster)');
        if (imgEl) imgEl.remove();
      }
    }

    const existingScrim = activeCardEl.querySelector<HTMLElement>('.proxy-render-scrim');
    const existingUiSlot = activeCardEl.querySelector<HTMLElement>('.proxy-render-ui-slot[data-proxy-ui-slot="true"]');
    if (showActiveChrome) {
      if (!existingScrim) {
        const scrim = document.createElement('div');
        scrim.className = 'proxy-render-scrim';
        activeCardEl.appendChild(scrim);
      }
      if (!existingUiSlot) {
        const uiSlot = document.createElement('div');
        uiSlot.className = 'proxy-render-ui-slot';
        uiSlot.dataset.proxyUiSlot = 'true';
        activeCardEl.appendChild(uiSlot);
      }
    }
    else {
      if (existingScrim) existingScrim.remove();
      if (existingUiSlot) existingUiSlot.remove();
    }

    return { activeNodeReused, activeMediaRecreated };
  }

  render(snapshot: FocusSceneSnapshot, camera: ProxyCameraState, opts?: {
    showActiveChrome?: boolean;
  }) {
    if (!this.ensureLayers()) return;
    const showActiveChrome = opts?.showActiveChrome ?? true;
    this.renderPassCount += 1;

    const world = this.worldEl as HTMLElement;
    const ambientLayer = this.ambientLayerEl as HTMLElement;

    world.style.setProperty('--proxy-world-scale', String(Math.max(0.001, camera.scale)));
    world.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;

    const sorted = [...snapshot.cards].sort((a, b) => b.priority - a.priority);
    const activeCard = sorted.find((card) => card.active) || null;
    ambientLayer.innerHTML = sorted
      .filter((card) => !card.active)
      .map((card) => this.buildAmbientCardHtml(card))
      .join('');

    const reconcile = this.reconcileActiveCard(activeCard, showActiveChrome);
    (globalThis as typeof globalThis & {
      __explorerProxyRendererDebug?: {
        activeSelectionKey: string;
        activeVideoNodeStableId: string;
        renderPassCount: number;
        activeNodeReused: boolean;
        activeMediaRecreated: boolean;
      };
    }).__explorerProxyRendererDebug = {
      activeSelectionKey: this.activeSelectionKey,
      activeVideoNodeStableId: this.activeVideoEl?.dataset.proxyStableVideoId || '',
      renderPassCount: this.renderPassCount,
      activeNodeReused: reconcile.activeNodeReused,
      activeMediaRecreated: reconcile.activeMediaRecreated,
    };
  }
}
