/**
 * public/js/explorer-shaders.mjs
 * Shared AssetFX renderer for explorer cards.
 *
 * Example:
 *   import { AssetFX } from './js/explorer-shaders.mjs';
 *   const fx = new AssetFX();
 *   fx.init(document.getElementById('mediaGrid'));
 *   fx.attachGrid(document.getElementById('mediaGrid'), '.asset');
 */

function ensureRelative(el) {
  if (el && getComputedStyle(el).position === 'static') el.style.position = 'relative';
}

function cssEscape(value) {
  const text = String(value ?? '');
  if (window.CSS?.escape) return window.CSS.escape(text);
  return text.replace(/(["'\\#.:;,!?+*~^$\[\]()=>|/@])/g, '\\$1');
}

function createNode(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const MAX_RECTS = 64;
const FX_GLOBAL = typeof window !== 'undefined' ? window : globalThis;
const RENDERERS = FX_GLOBAL.__assetfx_renderers || new WeakMap();
FX_GLOBAL.__assetfx_renderers = RENDERERS;
let RENDERER_SEQ = Number(FX_GLOBAL.__assetfx_renderer_seq || 0);
let OVERLAY_SEQ = Number(FX_GLOBAL.__assetfx_overlay_seq || 0);
let ROOT_SEQ = Number(FX_GLOBAL.__assetfx_root_seq || 0);
let __DBG_GL_CONTEXTS_CREATED = Number(FX_GLOBAL.__assetfx_dbg_contexts || 0);
let __DBG_RENDERERS_CREATED = Number(FX_GLOBAL.__assetfx_dbg_renderers || 0);
const __DBG_GL_CONTEXT_CALLS = FX_GLOBAL.__assetfx_dbg_context_calls || [];
let __DBG_PREVENTED_SECOND_CONTEXT = Number(FX_GLOBAL.__assetfx_dbg_prevented_second_context || 0);

function ensureOverlayId(canvas) {
  if (!canvas) return '';
  if (!canvas.dataset.assetfxOverlayId) {
    canvas.dataset.assetfxOverlayId = `assetfx-overlay-${++OVERLAY_SEQ}`;
    FX_GLOBAL.__assetfx_overlay_seq = OVERLAY_SEQ;
  }
  return canvas.dataset.assetfxOverlayId;
}

function ensureRootId(rootEl) {
  if (!rootEl) return '';
  if (!rootEl.dataset.assetfxRootId) {
    rootEl.dataset.assetfxRootId = `assetfx-root-${++ROOT_SEQ}`;
    FX_GLOBAL.__assetfx_root_seq = ROOT_SEQ;
  }
  return rootEl.dataset.assetfxRootId;
}

function markContextCall(site, extra = {}) {
  __DBG_GL_CONTEXTS_CREATED += 1;
  FX_GLOBAL.__assetfx_dbg_contexts = __DBG_GL_CONTEXTS_CREATED;
  __DBG_GL_CONTEXT_CALLS.push({
    site,
    ...extra,
    at: new Date().toISOString(),
    stack: (new Error('assetfx-getcontext')).stack || '',
  });
  if (__DBG_GL_CONTEXT_CALLS.length > 20) __DBG_GL_CONTEXT_CALLS.shift();
  FX_GLOBAL.__assetfx_dbg_context_calls = __DBG_GL_CONTEXT_CALLS;
}

function setGlobalContextOwner({ rootEl, canvasEl, stack = '' } = {}) {
  const rootId = ensureRootId(rootEl);
  const canvasId = ensureOverlayId(canvasEl);
  FX_GLOBAL.__assetfx_global_context_owner = {
    canvasId,
    rootId,
    createdAt: FX_GLOBAL.__assetfx_global_context_owner?.createdAt || new Date().toISOString(),
    stack: stack || FX_GLOBAL.__assetfx_global_context_owner?.stack || '',
    canvasEl,
    rootEl,
  };
}

if (typeof window !== 'undefined') {
  window.__assetfx_dbg = {
    get contexts() { return __DBG_GL_CONTEXTS_CREATED; },
    get renderers() { return __DBG_RENDERERS_CREATED; },
    get prevented() { return __DBG_PREVENTED_SECOND_CONTEXT; },
    get calls() { return [...__DBG_GL_CONTEXT_CALLS]; },
  };
  window.__assetfx_audit = () => {
    const overlays = Array.from(document.querySelectorAll('canvas[data-assetfx="overlay"]'));
    const owner = FX_GLOBAL.__assetfx_global_context_owner || null;
    const report = {
      overlays: overlays.length,
      overlayIds: overlays.map((el) => el.dataset.assetfxOverlayId || null),
      roots: overlays.map((el) => el.parentElement?.dataset?.assetfxRootId || null),
      estimatedWebglCanvases: owner?.canvasEl?.isConnected ? 1 : 0,
      contexts: __DBG_GL_CONTEXTS_CREATED,
      renderers: __DBG_RENDERERS_CREATED,
      preventedSecondContext: __DBG_PREVENTED_SECOND_CONTEXT,
      owner: owner ? {
        canvasId: owner.canvasId,
        rootId: owner.rootId,
        createdAt: owner.createdAt,
      } : null,
      calls: __DBG_GL_CONTEXT_CALLS.slice(-10),
    };
    console.table(report.calls.map((entry, i) => ({ idx: i, site: entry.site, rootId: entry.rootId || '', canvasId: entry.canvasId || '', at: entry.at })));
    return report;
  };
}
const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_rect_count;
uniform vec4 u_rects[${MAX_RECTS}];
uniform float u_video[${MAX_RECTS}];

void main(){
  vec2 px = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  vec3 color = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= u_rect_count) break;
    vec4 r = u_rects[i];
    if (px.x < r.x || px.y < r.y || px.x > r.z || px.y > r.w) continue;

    float y = px.y - r.y;
    float line = 0.5 + 0.5 * sin((y * 1.35) + (u_time * 2.2));
    float vignette = 1.0 - smoothstep(0.0, 0.9, distance((px - vec2((r.x + r.z) * 0.5, (r.y + r.w) * 0.5)) / vec2(max((r.z-r.x)*0.5,1.0), max((r.w-r.y)*0.5,1.0)), vec2(0.0)));
    float grain = fract(sin(dot(px + vec2(float(i), u_time), vec2(12.9898, 78.233))) * 43758.5453);

    float scan = mix(0.0, 0.22, u_video[i]) * (0.45 + line * 0.55);
    float sparkle = (grain - 0.5) * 0.08;
    float cardAlpha = 0.18 + (u_video[i] * 0.18);

    color += vec3(0.28, 0.72, 0.95) * scan * vignette + vec3(sparkle * 0.4);
    alpha += cardAlpha * vignette;
  }

  alpha = clamp(alpha, 0.0, 0.55);
  gl_FragColor = vec4(color, alpha);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('shader-create-failed');
  gl.shaderSource(shader, source.trim());
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(shader) || 'shader compile failed';
    gl.deleteShader(shader);
    throw new Error(err);
  }
  return shader;
}

function createProgram(gl, vertSource, fragSource) {
  const program = gl.createProgram();
  if (!program) throw new Error('program-create-failed');
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(program) || 'program-link-failed';
    gl.deleteProgram(program);
    throw new Error(err);
  }
  return program;
}

function createQuad(gl) {
  const buf = gl.createBuffer();
  if (!buf) throw new Error('quad-buffer-failed');
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return buf;
}

function bindQuad(gl, program, buffer) {
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

export class ExplorerShaders {}

export class AssetFX {
  constructor() {
    this.container = null;
    this.overlay = null;
    this.gl = null;
    this.program = null;
    this.quad = null;
    this.raf = 0;
    this.start = performance.now();

    this.boundGrids = new WeakSet();
    this.trackedCards = new Set();
    this.lastPlayedAt = new WeakMap();
    this.cooldownMs = 1000;

    this.visibilityObserver = null;
    this.scrollReplayScheduled = false;
    this.fallbackSweepEnabled = !('IntersectionObserver' in window);

    this.pointerState = new Map();
    this._attachedGridRoot = null;
    this._attachedCardSelector = '.asset';
    this._boundScheduleReplay = () => this._scheduleReplaySweep();
    this._boundWindowResize = () => this._scheduleReplaySweep();
    this._tapGuardCleanup = null;

    this._ensureSharedStyles();
  }

  init(container) {
    if (!container) return;
    const rootId = ensureRootId(container);
    if (this.container === container && this.overlay?.isConnected && this.gl) {
      this._startLoop();
      return;
    }
    const shared = this._getRenderer(container);
    if (shared){
      this.container = container;
      this.overlay = shared.overlay;
      this.gl = shared.gl;
      this.program = shared.program;
      this.quad = shared.quad;
      this.raf = shared.raf;
      return;
    }

    const owner = FX_GLOBAL.__assetfx_global_context_owner;
    if (owner?.canvasEl?.isConnected && owner?.rootEl?.isConnected) {
      const ownerShared = this._getRenderer(owner.rootEl);
      if (ownerShared) {
        if (owner.canvasEl.parentElement !== container) {
          ensureRelative(container);
          container.appendChild(owner.canvasEl);
        }
        this.container = container;
        this.overlay = owner.canvasEl;
        this.gl = ownerShared.gl;
        this.program = ownerShared.program;
        this.quad = ownerShared.quad;
        this.raf = ownerShared.raf;
        RENDERERS.set(container, ownerShared);
        setGlobalContextOwner({ rootEl: container, canvasEl: owner.canvasEl, stack: owner.stack });
        if (!FX_GLOBAL.__assetfx_warned_second_context) {
          console.info('AssetFX: prevented second WebGL context; reusing global overlay');
          FX_GLOBAL.__assetfx_warned_second_context = true;
        }
        __DBG_PREVENTED_SECOND_CONTEXT += 1;
        FX_GLOBAL.__assetfx_dbg_prevented_second_context = __DBG_PREVENTED_SECOND_CONTEXT;
        this._startLoop();
        return;
      }
    }

    this.destroyRenderer();

    this.container = container;
    ensureRelative(container);
    const canvases = Array.from(container.querySelectorAll('canvas[data-assetfx="overlay"]'));
    const canvas = canvases.shift() || createNode('canvas', 'fx-shared-overlay');
    canvases.forEach((node) => node.remove());
    canvas.classList.add('fx-shared-overlay');
    canvas.dataset.assetfx = 'overlay';
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '2',
      opacity: '0.92',
    });
    if (!canvas.isConnected || canvas.parentElement !== container) container.appendChild(canvas);
    this.overlay = canvas;
    ensureOverlayId(canvas);
    container.dataset.fxRendererId = String(++RENDERER_SEQ);
    FX_GLOBAL.__assetfx_renderer_seq = RENDERER_SEQ;

    __DBG_RENDERERS_CREATED += 1;
    FX_GLOBAL.__assetfx_dbg_renderers = __DBG_RENDERERS_CREATED;
    this._saveRenderer(container);

    markContextCall('AssetFX.init:webgl', { rootId, canvasId: canvas.dataset.assetfxOverlayId });
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      this.gl = null;
      this.program = null;
      this._saveRenderer(container);
      return;
    }
    this.gl = gl;
    setGlobalContextOwner({ rootEl: container, canvasEl: canvas, stack: (new Error('assetfx-context-owner')).stack || '' });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    try {
      this.program = createProgram(gl, VERT, FRAG);
      this.quad = createQuad(gl);
    } catch {
      this.program = null;
      this.quad = null;
      this._saveRenderer(container);
      return;
    }

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.program = null;
      this.quad = null;
    });

    canvas.addEventListener('webglcontextrestored', () => {
      if (!this.gl) return;
      try {
        this.program = createProgram(this.gl, VERT, FRAG);
        this.quad = createQuad(this.gl);
      } catch {
        this.program = null;
        this.quad = null;
      }
      this._saveRenderer(container);
      this._startLoop();
    });

    this._saveRenderer(container);
    this._startLoop();
  }

  destroyRenderer() {
    const owner = FX_GLOBAL.__assetfx_global_context_owner;
    if (owner?.canvasEl && this.overlay && owner.canvasEl === this.overlay) FX_GLOBAL.__assetfx_global_context_owner = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
    this.gl = null;
    this.program = null;
    this.quad = null;
    if (this.container && RENDERERS.has(this.container)) RENDERERS.delete(this.container);
  }

  destroy() {
    this.detachGrid();
    this.destroyRenderer();
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
    this.trackedCards.clear();
    this.lastPlayedAt = new WeakMap();
    this.boundGrids = new WeakSet();
    this.pointerState.clear();
  }

  attachGrid(gridRoot, cardSelector = '.asset') {
    if (!gridRoot) return;
    const rootId = ensureRootId(gridRoot);
    if (this._attachedGridRoot === gridRoot) return;
    this.detachGrid();
    this._attachedGridRoot = gridRoot;
    this._attachedCardSelector = cardSelector;
    this.boundGrids.add(gridRoot);
    this.init(gridRoot);

    const owner = FX_GLOBAL.__assetfx_global_context_owner;
    if (owner && owner.rootId && owner.rootId !== rootId) {
      setGlobalContextOwner({ rootEl: gridRoot, canvasEl: this.overlay, stack: owner.stack });
    }

    gridRoot.addEventListener('scroll', this._boundScheduleReplay, { passive: true });
    gridRoot.addEventListener('touchmove', this._boundScheduleReplay, { passive: true });
    window.addEventListener('resize', this._boundWindowResize, { passive: true });

    this._tapGuardCleanup = this._wireTapGuard(gridRoot, cardSelector);
    this._ensureObserver(gridRoot);
  }

  detachGrid() {
    const gridRoot = this._attachedGridRoot;
    if (!gridRoot) return;
    gridRoot.removeEventListener('scroll', this._boundScheduleReplay);
    gridRoot.removeEventListener('touchmove', this._boundScheduleReplay);
    window.removeEventListener('resize', this._boundWindowResize);
    if (typeof this._tapGuardCleanup === 'function') this._tapGuardCleanup();
    this._tapGuardCleanup = null;
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
    this.pointerState.clear();
    if (!this.trackedCards.size) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.container) this._saveRenderer(this.container);
    }
    this._attachedGridRoot = null;
    this._attachedCardSelector = '.asset';
  }

  trackViewport(cardEl, imgEl = null) {
    if (!cardEl) return;
    if (imgEl) cardEl.__fxThumb = imgEl;
    this.trackedCards.add(cardEl);
    if (this.visibilityObserver) this.visibilityObserver.observe(cardEl);
    if (this.fallbackSweepEnabled) this._scheduleReplaySweep();
  }

  bindCardMedia(cardEl, imgEl, { kind = '' } = {}) {
    if (!cardEl || !imgEl) return;
    cardEl.dataset.fxKind = kind || '';
    this.trackViewport(cardEl, imgEl);
    if (kind === 'video') this.addScanline(cardEl);
    this.dissolve(cardEl, imgEl, { allowReplay: true });
  }

  addScanline(cardEl) {
    if (!cardEl) return;
    cardEl.dataset.fxScanline = '1';
    this._scheduleReplaySweep();
  }

  pulse(cardEl, { duration = 520 } = {}) {
    if (!cardEl) return;
    ensureRelative(cardEl);
    const ring = createNode('div', 'fx-selection-pulse');
    ring.style.animationDuration = `${Math.max(220, duration)}ms`;
    cardEl.appendChild(ring);
    setTimeout(() => ring.remove(), Math.max(220, duration) + 90);
  }

  dissolve(cardEl, imgEl, { duration = 520, allowReplay = false } = {}) {
    if (!cardEl || !imgEl) return { cancel: () => {} };
    if (typeof imgEl.__fxDissolveCleanup === 'function') imgEl.__fxDissolveCleanup();

    const play = () => {
      if (imgEl.dataset.thumbUrl && imgEl.getAttribute('src') === imgEl.dataset.thumbFallback) return;
      this._playDissolve(cardEl, imgEl, duration, allowReplay);
    };

    const onLoad = () => play();
    imgEl.addEventListener('load', onLoad);
    if (imgEl.complete && imgEl.naturalWidth > 0) play();

    imgEl.__fxDissolveCleanup = () => imgEl.removeEventListener('load', onLoad);
    return { cancel: imgEl.__fxDissolveCleanup };
  }

  _playDissolve(cardEl, imgEl, duration, allowReplay) {
    const now = Date.now();
    const last = this.lastPlayedAt.get(cardEl) || 0;
    if (allowReplay && now - last < this.cooldownMs) return;
    this.lastPlayedAt.set(cardEl, now);

    ensureRelative(cardEl);
    const veil = createNode('div', 'fx-dissolve-veil');
    veil.style.transitionDuration = `${Math.max(180, duration)}ms`;
    cardEl.appendChild(veil);
    this._boostScanline(cardEl, Math.max(200, duration * 0.7));

    requestAnimationFrame(() => {
      veil.classList.add('is-active');
      setTimeout(() => veil.remove(), Math.max(200, duration) + 120);
    });

    imgEl.style.opacity = '0';
    imgEl.style.transition = 'opacity 120ms ease';
    requestAnimationFrame(() => { imgEl.style.opacity = '1'; });
  }

  _ensureObserver(rootEl) {
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
    if (!('IntersectionObserver' in window)) {
      this.fallbackSweepEnabled = true;
      return;
    }

    this.fallbackSweepEnabled = false;
    this.visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const card = entry.target;
        if (!card?.isConnected) continue;
        const img = card.__fxThumb || card.querySelector('img.asset-thumb');
        if (!img) continue;
        if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
          if (card.dataset.fxInView !== '1') {
            card.dataset.fxInView = '1';
            if (img.complete && img.naturalWidth > 0) {
              this._playDissolve(card, img, 420, true);
              this._showVisibleHint(card);
            }
          }
        } else {
          card.dataset.fxInView = '0';
        }
      }
    }, { root: rootEl, threshold: [0.35, 0.65] });

    this.trackedCards.forEach((card) => this.visibilityObserver.observe(card));
  }

  _wireTapGuard(gridEl, cardSelector) {
    const threshold = 13;
    const onPointerDown = (event) => {
      const input = event.target.closest('input[type="checkbox"][data-select-key]');
      if (!input) return;
      if (cardSelector && !event.target.closest(cardSelector)) return;
      this.pointerState.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        moved: false,
        input,
        startedAt: Date.now(),
      });
    };

    const onPointerMove = (event) => {
      const rec = this.pointerState.get(event.pointerId);
      if (!rec) return;
      const dx = event.clientX - rec.x;
      const dy = event.clientY - rec.y;
      if ((dx * dx + dy * dy) > threshold * threshold) rec.moved = true;
    };

    const finish = (event) => {
      const rec = this.pointerState.get(event.pointerId);
      if (!rec) return;
      this.pointerState.delete(event.pointerId);
      if (!rec.input?.isConnected) return;
      if (rec.moved) rec.input.dataset.fxSuppressToggle = '1';
    };

    gridEl.addEventListener('pointerdown', onPointerDown, true);
    gridEl.addEventListener('pointermove', onPointerMove, true);
    gridEl.addEventListener('pointerup', finish, true);
    gridEl.addEventListener('pointercancel', finish, true);

    return () => {
      gridEl.removeEventListener('pointerdown', onPointerDown, true);
      gridEl.removeEventListener('pointermove', onPointerMove, true);
      gridEl.removeEventListener('pointerup', finish, true);
      gridEl.removeEventListener('pointercancel', finish, true);
    };
  }

  _scheduleReplaySweep() {
    if (this.scrollReplayScheduled) return;
    this.scrollReplayScheduled = true;
    requestAnimationFrame(() => {
      this.scrollReplayScheduled = false;
      this._replaySweep();
    });
  }

  _replaySweep() {
    if (!this.container || !this.trackedCards.size) return;
    const rootRect = this.container.getBoundingClientRect();
    const minOverlap = Math.max(18, rootRect.height * 0.1);
    this.trackedCards.forEach((card) => {
      if (!card?.isConnected) {
        this.trackedCards.delete(card);
        return;
      }
      const rect = card.getBoundingClientRect();
      const overlap = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);
      const visible = overlap > minOverlap;
      const wasVisible = card.dataset.fxInView === '1';
      if (visible && !wasVisible) {
        card.dataset.fxInView = '1';
        const img = card.__fxThumb || card.querySelector('img.asset-thumb');
        if (img?.complete && img.naturalWidth > 0) {
          this._playDissolve(card, img, 420, true);
          this._showVisibleHint(card);
        }
      } else if (!visible && wasVisible) {
        card.dataset.fxInView = '0';
      }
    });
  }

  _showVisibleHint(cardEl) {
    ensureRelative(cardEl);
    const hint = createNode('div', 'fx-visible-hint');
    cardEl.appendChild(hint);
    setTimeout(() => hint.remove(), 430);
  }

  _boostScanline(cardEl, duration = 320) {
    cardEl.dataset.fxScanlineBoost = '1';
    setTimeout(() => {
      if (cardEl?.isConnected) cardEl.dataset.fxScanlineBoost = '0';
    }, duration);
  }

  _startLoop() {
    if (this.raf || !this.gl || !this.program || !this.quad || !this.overlay || !this.container) return;
    const tick = () => {
      this._render();
      this.raf = requestAnimationFrame(tick);
      if (this.container && RENDERERS.has(this.container)) {
        const shared = RENDERERS.get(this.container);
        shared.raf = this.raf;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  _getRenderer(container) {
    const shared = RENDERERS.get(container);
    if (!shared) return null;
    if (!shared.overlay?.isConnected) {
      RENDERERS.delete(container);
      return null;
    }
    return shared;
  }

  _saveRenderer(container) {
    if (!container || !this.overlay) return;
    RENDERERS.set(container, {
      overlay: this.overlay,
      gl: this.gl,
      program: this.program,
      quad: this.quad,
      raf: this.raf,
    });
  }

  _render() {
    if (!this.gl || !this.program || !this.quad || !this.overlay || !this.container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.overlay.width !== width || this.overlay.height !== height) {
      this.overlay.width = width;
      this.overlay.height = height;
    }

    const cards = [];
    this.trackedCards.forEach((card) => {
      if (!card?.isConnected) return;
      if (card.dataset.fxInView !== '1') return;
      const cr = card.getBoundingClientRect();
      const x1 = (cr.left - rect.left) * dpr;
      const y1 = (cr.top - rect.top) * dpr;
      const x2 = (cr.right - rect.left) * dpr;
      const y2 = (cr.bottom - rect.top) * dpr;
      const inBounds = x2 > 0 && y2 > 0 && x1 < width && y1 < height;
      if (!inBounds) return;
      const isVideo = card.dataset.fxKind === 'video' ? 1 : 0;
      const boosted = card.dataset.fxScanlineBoost === '1' ? 1 : 0;
      cards.push([x1, y1, x2, y2, isVideo, boosted]);
    });

    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!cards.length) return;

    gl.useProgram(this.program);
    bindQuad(gl, this.program, this.quad);

    const rectData = new Float32Array(MAX_RECTS * 4);
    const videoData = new Float32Array(MAX_RECTS);
    cards.slice(0, MAX_RECTS).forEach((row, i) => {
      rectData[i * 4] = row[0];
      rectData[i * 4 + 1] = row[1];
      rectData[i * 4 + 2] = row[2];
      rectData[i * 4 + 3] = row[3];
      videoData[i] = row[4] ? (row[5] ? 1.0 : 0.82) : 0.25;
    });

    gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_time'), (performance.now() - this.start) * 0.001);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_rect_count'), Math.min(cards.length, MAX_RECTS));
    gl.uniform4fv(gl.getUniformLocation(this.program, 'u_rects'), rectData);
    gl.uniform1fv(gl.getUniformLocation(this.program, 'u_video'), videoData);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _ensureSharedStyles() {
    if (document.getElementById('asset-fx-shared-styles')) return;
    const style = document.createElement('style');
    style.id = 'asset-fx-shared-styles';
    style.textContent = `
      .fx-selection-pulse {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 2px solid rgba(80, 220, 255, 0.88);
        box-shadow: 0 0 0 0 rgba(80, 220, 255, 0.6);
        pointer-events: none;
        z-index: 12;
        animation: fx-selection-pulse 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .fx-dissolve-veil {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 3;
        opacity: 0.9;
        background: linear-gradient(130deg, rgba(20, 42, 76, 0.95), rgba(66, 129, 182, 0.66), rgba(90, 219, 255, 0.22));
        transition: opacity 420ms ease;
      }
      .fx-dissolve-veil.is-active { opacity: 0; }
      .fx-visible-hint {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 4;
        mix-blend-mode: screen;
        background: linear-gradient(135deg, rgba(86,126,196,0.45), rgba(120,219,255,0.2), rgba(8,14,25,0));
        animation: fx-visible-hint 380ms ease-out forwards;
      }
      @keyframes fx-selection-pulse {
        0% { opacity: 0.95; transform: scale(0.94); box-shadow: 0 0 0 0 rgba(80,220,255,0.58); }
        70% { opacity: 0.55; transform: scale(1.02); box-shadow: 0 0 0 12px rgba(80,220,255,0.0); }
        100% { opacity: 0; transform: scale(1.04); box-shadow: 0 0 0 18px rgba(80,220,255,0.0); }
      }
      @keyframes fx-visible-hint {
        0% { opacity: 0; transform: scale(0.99); }
        30% { opacity: 0.9; }
        100% { opacity: 0; transform: scale(1.01); }
      }
    `;
    document.head.appendChild(style);
  }
}

export { cssEscape };
