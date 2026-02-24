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
const MAX_PARALLEL_DECODES = 3;
let ACTIVE_DECODES = 0;
const DECODE_QUEUE = [];

function runDecodeTask(task) {
  ACTIVE_DECODES += 1;
  Promise.resolve()
    .then(task)
    .catch(() => {})
    .finally(() => {
      ACTIVE_DECODES = Math.max(0, ACTIVE_DECODES - 1);
      const next = DECODE_QUEUE.shift();
      if (next) runDecodeTask(next);
    });
}

function decodeImageWithBackpressure(imgEl) {
  if (!imgEl || typeof imgEl.decode !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    const task = async () => {
      try {
        await imgEl.decode();
      } catch {
        // Safari can reject decode() for cross-origin/cached edge cases; fallback to load completion.
      }
      resolve();
    };
    if (ACTIVE_DECODES < MAX_PARALLEL_DECODES) runDecodeTask(task);
    else DECODE_QUEUE.push(task);
  });
}

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
    get activeDissolves() { return FX_GLOBAL.__assetfx_instance?.activeDissolves?.size || 0; },
    get pendingDissolves() { return FX_GLOBAL.__assetfx_instance?.pendingDissolves?.length || 0; },
    get visibleCards() { return FX_GLOBAL.__assetfx_instance?.visibleCards?.size || 0; },
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
      activeDissolves: FX_GLOBAL.__assetfx_instance?.activeDissolves?.size || 0,
      pendingDissolves: FX_GLOBAL.__assetfx_instance?.pendingDissolves?.length || 0,
      visibleCards: FX_GLOBAL.__assetfx_instance?.visibleCards?.size || 0,
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
uniform sampler2D u_tile_params;

vec4 sampleParams(int idx) {
  float x = (float(idx) + 0.5) / float(${MAX_RECTS});
  return texture2D(u_tile_params, vec2(x, 0.5));
}

void main(){
  vec2 px = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  vec3 color = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= u_rect_count) break;
    vec4 r = u_rects[i];
    if (px.x < r.x || px.y < r.y || px.x > r.z || px.y > r.w) continue;

    vec2 tileUV = (px - r.xy) / max(r.zw - r.xy, vec2(1.0));
    tileUV = clamp(tileUV, 0.0, 1.0);
    vec4 params = sampleParams(i);
    float typeV = params.r * 2.0;
    float sel = params.g;
    float energy = params.b;
    float ready = params.a;
    if (ready <= 0.01) continue;

    float edge = smoothstep(0.0, 0.08, tileUV.x) * smoothstep(0.0, 0.08, tileUV.y)
      * smoothstep(0.0, 0.08, 1.0 - tileUV.x) * smoothstep(0.0, 0.08, 1.0 - tileUV.y);
    float radial = 1.0 - smoothstep(0.18, 0.92, length(tileUV - vec2(0.5)));
    float grain = fract(sin(dot(tileUV * (48.0 + float(i)), vec2(12.9898, 78.233)) + u_time * 1.8) * 43758.5453);

    // type-driven material basis
    vec3 base = mix(vec3(0.07, 0.17, 0.28), vec3(0.10, 0.26, 0.42), edge);
    float videoMix = smoothstep(0.65, 1.35, typeV);
    float audioMix = smoothstep(1.55, 2.3, typeV);

    float scan = (0.5 + 0.5 * sin((tileUV.y * 580.0) + u_time * 2.4)) * videoMix;
    float shimmer = (0.5 + 0.5 * sin((tileUV.x * 52.0) + u_time * 4.4)) * audioMix;
    float imageVignette = smoothstep(0.95, 0.28, length(tileUV - vec2(0.5))) * (1.0 - videoMix) * (1.0 - audioMix);

    // selection glass pass
    float streak = smoothstep(0.44, 0.5, fract(tileUV.x + tileUV.y * 0.35 + u_time * 0.22));
    float fresnel = pow(1.0 - clamp(dot(normalize(tileUV - vec2(0.5)), vec2(0.65, 0.35)), 0.0, 1.0), 2.0);
    vec3 glass = vec3(0.28, 0.78, 1.0) * (fresnel * 0.42 + streak * 0.22) * sel;

    vec3 material = base
      + vec3(0.05, 0.11, 0.18) * imageVignette
      + vec3(0.18, 0.42, 0.68) * scan
      + vec3(0.26, 0.36, 0.72) * shimmer
      + glass
      + vec3((grain - 0.5) * 0.045);

    float cardAlpha = (0.06 + edge * 0.2 + energy * 0.18 + sel * 0.25) * ready;
    color += material * ready;
    alpha += cardAlpha;
  }

  alpha = clamp(alpha, 0.0, 0.62);
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
    this.tileParamTexture = null;
    this.raf = 0;
    this.start = performance.now();

    this.boundGrids = new WeakSet();
    this.trackedCards = new Set();
    this.visibleCards = new Set();
    this.lastPlayedAt = new WeakMap();
    this.cooldownMs = 1000;
    this.maxActiveEffects = 6;
    this.maxPendingDissolves = 60;
    this.maxRenderCards = 28;
    this.readyFadeMs = 220;

    this.activeDissolves = new Set();
    this.pendingDissolves = [];
    this.layoutDirty = true;
    this.cardRectCache = new WeakMap();

    this.prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
      : false;
    this.liteFx = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('fx') === 'lite'
      : false;

    this.visibilityObserver = null;
    this.scrollReplayScheduled = false;
    this.fallbackSweepEnabled = !('IntersectionObserver' in window);

    this.pointerState = new Map();
    this._attachedGridRoot = null;
    this._attachedCardSelector = '.asset';
    this._boundScheduleReplay = () => this._scheduleReplaySweep();
    this._boundWindowResize = () => this._scheduleReplaySweep();
    this._boundContainerResize = () => {
      this.layoutDirty = true;
      this._scheduleReplaySweep();
    };
    this._tapGuardCleanup = null;
    this._resizeObserver = null;

    this._ensureSharedStyles();
    if (typeof window !== 'undefined') window.__assetfx_instance = this;
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
      this.tileParamTexture = shared.tileParamTexture;
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
        this.tileParamTexture = ownerShared.tileParamTexture;
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
      this.tileParamTexture = gl.createTexture();
      if (this.tileParamTexture) {
        gl.bindTexture(gl.TEXTURE_2D, this.tileParamTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
    } catch {
      this.program = null;
      this.quad = null;
      this.tileParamTexture = null;
      this._saveRenderer(container);
      return;
    }

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.program = null;
      this.quad = null;
      this.tileParamTexture = null;
    });

    canvas.addEventListener('webglcontextrestored', () => {
      if (!this.gl) return;
      try {
        this.program = createProgram(this.gl, VERT, FRAG);
        this.quad = createQuad(this.gl);
        this.tileParamTexture = this.gl.createTexture();
        if (this.tileParamTexture) {
          this.gl.bindTexture(this.gl.TEXTURE_2D, this.tileParamTexture);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        }
      } catch {
        this.program = null;
        this.quad = null;
        this.tileParamTexture = null;
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
    this.tileParamTexture = null;
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
    this.visibleCards.clear();
    this.activeDissolves.clear();
    this.pendingDissolves = [];
    this.lastPlayedAt = new WeakMap();
    this.boundGrids = new WeakSet();
    this.pointerState.clear();
    this.pendingDissolves = [];
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
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._boundContainerResize);
      this._resizeObserver.observe(gridRoot);
    }

    this._tapGuardCleanup = this._wireTapGuard(gridRoot, cardSelector);
    this._ensureObserver(gridRoot);
  }

  detachGrid() {
    const gridRoot = this._attachedGridRoot;
    if (!gridRoot) return;
    gridRoot.removeEventListener('scroll', this._boundScheduleReplay);
    gridRoot.removeEventListener('touchmove', this._boundScheduleReplay);
    window.removeEventListener('resize', this._boundWindowResize);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (typeof this._tapGuardCleanup === 'function') this._tapGuardCleanup();
    this._tapGuardCleanup = null;
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
    this.pointerState.clear();
    this.layoutDirty = true;
    this.cardRectCache = new WeakMap();
    this.pendingDissolves = [];
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
    if (cardEl.dataset.fxInView === '1') this.visibleCards.add(cardEl);
    if (this.visibilityObserver) this.visibilityObserver.observe(cardEl);
    if (this.fallbackSweepEnabled) this._scheduleReplaySweep();
  }

  bindCardMedia(cardEl, mediaEl, { kind = '' } = {}) {
    if (!cardEl || !mediaEl) return;
    cardEl.dataset.fxKind = kind || '';
    cardEl.dataset.fxReady = '0';
    cardEl.dataset.ready = '0';
    this.trackViewport(cardEl, mediaEl);
    if (kind === 'video') this.addScanline(cardEl);
    this.dissolve(cardEl, mediaEl, { allowReplay: true });

    if (typeof mediaEl.__fxReadyCleanup === 'function') mediaEl.__fxReadyCleanup();

    const markReady = async () => {
      if (kind === 'image' || mediaEl.tagName === 'IMG') {
        await decodeImageWithBackpressure(mediaEl);
      }
      cardEl.dataset.fxReady = '1';
      cardEl.dataset.ready = '1';
      cardEl.dataset.fxReadyAt = String(performance.now());
      if (cardEl.dataset.fxInView === '1') this.visibleCards.add(cardEl);
    };

    const markError = () => {
      cardEl.dataset.fxReady = '0';
      cardEl.dataset.ready = '0';
      this.visibleCards.delete(cardEl);
    };

    const onImgLoad = () => { void markReady(); };
    const onVideoReady = () => { void markReady(); };

    const isImage = kind === 'image' || mediaEl.tagName === 'IMG';
    const isVideo = kind === 'video' || mediaEl.tagName === 'VIDEO';
    const isAudio = kind === 'audio' || mediaEl.tagName === 'AUDIO';

    if (isImage && mediaEl.complete && mediaEl.naturalWidth > 0) void markReady();
    else if (isVideo && mediaEl.readyState >= 2) void markReady();
    else if (isAudio && mediaEl.readyState >= 1) void markReady();
    else {
      if (isImage) {
        mediaEl.addEventListener('load', onImgLoad, { once: true });
        mediaEl.addEventListener('error', markError, { once: true });
      } else if (isVideo) {
        mediaEl.addEventListener('loadeddata', onVideoReady, { once: true });
        mediaEl.addEventListener('error', markError, { once: true });
      } else if (isAudio) {
        mediaEl.addEventListener('loadedmetadata', onVideoReady, { once: true });
        mediaEl.addEventListener('error', markError, { once: true });
      }
    }

    mediaEl.__fxReadyCleanup = () => {
      mediaEl.removeEventListener('load', onImgLoad);
      mediaEl.removeEventListener('loadeddata', onVideoReady);
      mediaEl.removeEventListener('loadedmetadata', onVideoReady);
      mediaEl.removeEventListener('error', markError);
    };
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
    if (!this._canRunFx()) return;
    const now = Date.now();
    const last = this.lastPlayedAt.get(cardEl) || 0;
    if (allowReplay && now - last < this.cooldownMs) return;
    this.lastPlayedAt.set(cardEl, now);

    this._enqueueDissolve(cardEl, imgEl, duration);
  }


  _canRunFx() {
    return !this.prefersReducedMotion && !this.liteFx;
  }

  _enqueueDissolve(cardEl, imgEl, duration) {
    if (!cardEl || !imgEl || this.prefersReducedMotion) return;
    this._pruneDisconnected();
    if (cardEl.dataset.fxReady !== '1') return;
    if (!this.visibleCards.has(cardEl)) return;
    if (this.activeDissolves.has(cardEl)) return;
    const exists = this.pendingDissolves.some((entry) => entry.cardEl === cardEl);
    if (exists) return;
    this.pendingDissolves.push({ cardEl, imgEl, duration, queuedAt: performance.now() });
    if (this.pendingDissolves.length > this.maxPendingDissolves) {
      this.pendingDissolves.splice(0, this.pendingDissolves.length - this.maxPendingDissolves);
    }
    this._runNextDissolve();
  }

  _runNextDissolve() {
    this._pruneDisconnected();
    while (this.pendingDissolves.length && this.activeDissolves.size < this.maxActiveEffects) {
      const task = this.pendingDissolves.pop();
      if (!task?.cardEl?.isConnected || !task?.imgEl?.isConnected) continue;
      const { cardEl, duration } = task;
      if (!this.visibleCards.has(cardEl)) continue;
      this.activeDissolves.add(cardEl);

      ensureRelative(cardEl);
      const veil = createNode('div', 'fx-dissolve-veil');
      veil.style.transitionDuration = `${Math.max(180, duration)}ms`;
      cardEl.appendChild(veil);
      this._boostScanline(cardEl, Math.max(200, duration * 0.7));

      const finalize = () => {
        veil.remove();
        cardEl.classList.remove('fx-entry-active');
        this.activeDissolves.delete(cardEl);
        this._runNextDissolve();
      };

      cardEl.classList.add('fx-entry-active');
      requestAnimationFrame(() => {
        veil.classList.add('is-active');
        const doneMs = Math.max(200, duration) + 120;
        setTimeout(() => {
          try {
            finalize();
          } catch {
            this.activeDissolves.delete(cardEl);
            this._runNextDissolve();
          }
        }, doneMs);
      });
    }
  }

  _setCardInView(card, visible) {
    const next = visible ? '1' : '0';
    if (card.dataset.fxInView === next) return false;
    card.dataset.fxInView = next;
    if (visible && card.dataset.fxReady === '1') this.visibleCards.add(card);
    else {
      this.visibleCards.delete(card);
      this.pendingDissolves = this.pendingDissolves.filter((entry) => entry.cardEl !== card);
    }
    this.layoutDirty = true;
    return true;
  }


  _pruneDisconnected() {
    this.trackedCards.forEach((card) => {
      if (!card?.isConnected) this.trackedCards.delete(card);
    });
    this.visibleCards.forEach((card) => {
      if (!card?.isConnected) this.visibleCards.delete(card);
    });
    this.activeDissolves.forEach((card) => {
      if (!card?.isConnected) this.activeDissolves.delete(card);
    });
    this.pendingDissolves = this.pendingDissolves.filter((entry) => (
      !!entry?.cardEl?.isConnected && !!entry?.imgEl?.isConnected && this.visibleCards.has(entry.cardEl)
    ));
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
          const entered = this._setCardInView(card, true);
          if (entered && img.complete && img.naturalWidth > 0) {
            if (this._canRunFx()) this._playDissolve(card, img, 420, true);
            if (!this.prefersReducedMotion) this._showVisibleHint(card);
          }
        } else {
          this._setCardInView(card, false);
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
    this._pruneDisconnected();
    if (!this.container || !this.trackedCards.size) return;
    this.layoutDirty = true;
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
      if (visible) {
        const entered = this._setCardInView(card, true);
        const img = card.__fxThumb || card.querySelector('img.asset-thumb');
        if (entered && img?.complete && img.naturalWidth > 0) {
          if (this._canRunFx()) this._playDissolve(card, img, 420, true);
          if (!this.prefersReducedMotion) this._showVisibleHint(card);
        }
      } else {
        this._setCardInView(card, false);
      }
    });
  }

  _showVisibleHint(cardEl) {
    if (this.prefersReducedMotion || this.liteFx) return;
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
      tileParamTexture: this.tileParamTexture,
      raf: this.raf,
    });
  }

  _render() {
    this._pruneDisconnected();
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
    let sampled = 0;
    if (this.layoutDirty) this.cardRectCache = new WeakMap();
    this.visibleCards.forEach((card) => {
      if (sampled >= this.maxRenderCards) return;
      if (!card?.isConnected) return;
      if (card.dataset.fxInView !== '1') return;
      if (card.dataset.fxReady !== '1') return;
      let cr = this.cardRectCache.get(card);
      if (!cr || this.layoutDirty) {
        cr = card.getBoundingClientRect();
        this.cardRectCache.set(card, cr);
      }
      const x1 = (cr.left - rect.left) * dpr;
      const y1 = (cr.top - rect.top) * dpr;
      const x2 = (cr.right - rect.left) * dpr;
      const y2 = (cr.bottom - rect.top) * dpr;
      const inBounds = x2 > 0 && y2 > 0 && x1 < width && y1 < height;
      if (!inBounds) return;
      const kind = card.dataset.fxKind || '';
      const typeCode = kind === 'video' ? 1 : (kind === 'audio' ? 2 : 0);
      const selected = card.classList.contains('is-selected') ? 1 : 0;
      const boosted = card.dataset.fxScanlineBoost === '1' ? 1 : 0;
      const readyAt = Number(card.dataset.fxReadyAt || 0);
      const readyFade = readyAt > 0 ? Math.min(1, (performance.now() - readyAt) / this.readyFadeMs) : 1;
      const energy = Math.min(1, 0.24 + selected * 0.5 + boosted * 0.26 + (typeCode == 1 ? 0.14 : 0.0));
      cards.push([x1, y1, x2, y2, typeCode, selected, energy, readyFade]);
      sampled += 1;
    });
    this.layoutDirty = false;

    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!cards.length) return;

    gl.useProgram(this.program);
    bindQuad(gl, this.program, this.quad);

    const rectData = new Float32Array(MAX_RECTS * 4);
    const tileParamData = new Uint8Array(MAX_RECTS * 4);
    cards.slice(0, MAX_RECTS).forEach((row, i) => {
      rectData[i * 4] = row[0];
      rectData[i * 4 + 1] = row[1];
      rectData[i * 4 + 2] = row[2];
      rectData[i * 4 + 3] = row[3];
      tileParamData[i * 4] = Math.max(0, Math.min(255, Math.round((row[4] / 2) * 255))); // type packed in R
      tileParamData[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(row[5] * 255))); // selected in G
      tileParamData[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(row[6] * 255))); // energy in B
      tileParamData[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(row[7] * 255))); // ready in A
    });

    gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_time'), (performance.now() - this.start) * 0.001);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_rect_count'), Math.min(cards.length, MAX_RECTS));
    gl.uniform4fv(gl.getUniformLocation(this.program, 'u_rects'), rectData);
    if (this.tileParamTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tileParamTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_RECTS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, tileParamData);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_tile_params'), 0);
    }
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
        background: linear-gradient(130deg, rgba(20, 42, 76, 0.95), rgba(66, 129, 182, 0.66), rgba(90, 219, 255, 0.22));
        transform-origin: left center;
        transform: scaleX(1);
        transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .fx-dissolve-veil.is-active { transform: scaleX(0.01); }
      .asset.fx-entry-active {
        transform: translateY(-1px) scale(1.01);
        transition: transform 160ms ease-out;
      }
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
      @media (prefers-reduced-motion: reduce) {
        .fx-selection-pulse, .fx-visible-hint, .fx-dissolve-veil { animation: none !important; transition: none !important; }
        .asset.fx-entry-active { transform: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
}

export { cssEscape };
