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


function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function _vvHeight() {
  const vv = window.visualViewport;
  return (vv && Number(vv.height) > 0) ? Number(vv.height) : Number(window.innerHeight || 1);
}

function setVisualVhVar() {
  const h = Math.max(1, _vvHeight());
  document.documentElement.style.setProperty('--vvh', `${h * 0.01}px`);
}

function resizeCanvasToCss(canvas, dprCap = 2) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Number(rect.width || 0));
  const cssH = Math.max(1, Number(rect.height || 0));
  const dpr = Math.min(Math.max(1, Number(dprCap || 2)), Number(window.devicePixelRatio || 1));
  const pxW = Math.max(1, Math.round(cssW * dpr));
  const pxH = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  return { dpr, cssW, cssH, pxW, pxH };
}

function resizeAllFxCanvases({ dprCap = 2, tilefxRenderer = null, assetfxRenderer = null } = {}) {
  setVisualVhVar();
  const debugCanvas = document.querySelector('canvas.fx-debug-overlay');
  const sharedCanvas = document.querySelector('canvas.fx-shared-overlay');
  const bgCanvas = document.querySelector('#bgImpulseCanvas');
  const tilefxCanvas = document.querySelector('#tilefxCanvas');

  const debugSize = resizeCanvasToCss(debugCanvas, dprCap);
  const sharedSize = resizeCanvasToCss(sharedCanvas, dprCap);
  const bgSize = resizeCanvasToCss(bgCanvas, dprCap);
  const tilefxSize = resizeTileFxCanvasToViewport(tilefxCanvas, dprCap);

  if (tilefxRenderer && tilefxSize && tilefxCanvas) {
    tilefxRenderer.setResolution?.(tilefxCanvas.width, tilefxCanvas.height, tilefxSize.dpr);
  }
  if (assetfxRenderer && sharedSize && sharedCanvas) {
    assetfxRenderer.setResolution?.(sharedCanvas.width, sharedCanvas.height, sharedSize.dpr);
  }
  return { debugSize, sharedSize, bgSize, tilefxSize };
}

if (typeof window !== 'undefined') {
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', () => resizeAllFxCanvases({ dprCap: 2 }), { passive: true });
    vv.addEventListener('scroll', () => resizeAllFxCanvases({ dprCap: 2 }), { passive: true });
  }
  window.addEventListener('resize', () => resizeAllFxCanvases({ dprCap: 2 }), { passive: true });
  setVisualVhVar();
  setTimeout(() => resizeAllFxCanvases({ dprCap: 2 }), 0);
}


function getStableViewportSize() {
  const vv = window.visualViewport;
  const width = Number(vv?.width || window.innerWidth || document.documentElement?.clientWidth || 1);
  const height = _vvHeight();
  return {
    width: Math.max(1, width || 1),
    height: Math.max(1, height || 1),
  };
}

function getViewportMetrics() {
  const size = getStableViewportSize();
  const vv = window.visualViewport;
  return {
    width: size.width,
    height: size.height,
    offsetX: Number(vv?.offsetLeft || 0),
    offsetY: Number(vv?.offsetTop || 0),
    scale: Number(vv?.scale || 1),
  };
}

function resizeTileFxCanvasToViewport(canvas, dprCap = 2) {
  if (!canvas) return null;
  const vp = getViewportMetrics();
  const cssW = Math.max(1, Number(vp.width || 1));
  const cssH = Math.max(1, Number(vp.height || 1));
  const dpr = Math.min(Math.max(1, Number(dprCap || 2)), Number(window.devicePixelRatio || 1));
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const pxW = Math.max(1, Math.round(cssW * dpr));
  const pxH = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  return { dpr, cssW, cssH, pxW, pxH, viewport: vp };
}

function getViewportOffsets() {
  const vv = window.visualViewport;
  return {
    x: Number(vv?.offsetLeft || 0),
    y: Number(vv?.offsetTop || 0),
  };
}

function cloneRect(r) {
  if (!r) return null;
  return {
    left: Number(r.left || 0),
    top: Number(r.top || 0),
    right: Number(r.right || 0),
    bottom: Number(r.bottom || 0),
    width: Number(r.width || 0),
    height: Number(r.height || 0),
    x: Number(r.x || 0),
    y: Number(r.y || 0),
  };
}

function cloneVV(vv) {
  if (!vv) return null;
  return {
    width: Number(vv.width || 0),
    height: Number(vv.height || 0),
    scale: Number(vv.scale || 1),
    offsetLeft: Number(vv.offsetLeft || 0),
    offsetTop: Number(vv.offsetTop || 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MaskField
// Builds a per-frame heatmap texture from layout data (not pixels).
// Independent of DOM virtualization — rebuilt from live getBoundingClientRect().
// Pointer events feed persistent impulses via alpha decay.
// ─────────────────────────────────────────────────────────────────────────────

const MASK_SIZE = 512;
const MASK_DECAY_ALPHA = 0.07;
const IMPULSE_RADIUS = 48;
const IMPULSE_STRENGTH = 0.70;
const IMPULSE_LIFETIME = 1800;
const HOVER_RADIUS = 28;
const HOVER_STRENGTH = 0.38;
const STATE_EVICT_AFTER_MS = 300000;
const STATE_MAX_KEYS = 1200;
const NEAR_VIEW_MAX = 180;

export class MaskField {
  constructor(gridRoot, assetSel = '.asset') {
    this._root = gridRoot;
    this._sel = assetSel;
    this._canvas = document.createElement('canvas');
    this._canvas.width = MASK_SIZE;
    this._canvas.height = MASK_SIZE;
    this._canvas.className = 'fx-mask-canvas';
    Object.assign(this._canvas.style, { display: 'none', position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
    this._root.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: false });
    this._impulses = [];
    this._hoverNx = -1;
    this._hoverNy = -1;
    this._rafId = null;
    this._dirty = true;

    this._onMove = (e) => {
      const r = cloneRect(this._root.getBoundingClientRect());
      this._hoverNx = (e.clientX - r.left) / Math.max(1, r.width);
      this._hoverNy = (e.clientY - r.top) / Math.max(1, r.height);
      this._dirty = true;
    };
    this._onLeave = () => { this._hoverNx = -1; this._hoverNy = -1; };
    this._onDown = (e) => {
      const r = cloneRect(this._root.getBoundingClientRect());
      const nx = (e.clientX - r.left) / Math.max(1, r.width);
      const ny = (e.clientY - r.top) / Math.max(1, r.height);
      this._impulses.push({ nx, ny, strength: IMPULSE_STRENGTH, radius: IMPULSE_RADIUS, born: performance.now() });
      this._dirty = true;
    };

    this._root.addEventListener('pointermove', this._onMove, { passive: true });
    this._root.addEventListener('pointerleave', this._onLeave, { passive: true });
    this._root.addEventListener('pointerdown', this._onDown, { passive: true });
    this._tick();
  }

  pulseCard(cardEl) {
    if (!cardEl) return;
    const rr = cloneRect(this._root.getBoundingClientRect());
    const cr = cloneRect(cardEl.getBoundingClientRect());
    const nx = (cr.left + cr.width * 0.5 - rr.left) / Math.max(1, rr.width);
    const ny = (cr.top + cr.height * 0.5 - rr.top) / Math.max(1, rr.height);
    this._impulses.push({ nx, ny, strength: 0.92, radius: 58, born: performance.now() });
    this._dirty = true;
  }

  get canvas() { return this._canvas; }


  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._root.removeEventListener('pointermove', this._onMove);
    this._root.removeEventListener('pointerleave', this._onLeave);
    this._root.removeEventListener('pointerdown', this._onDown);
    this._canvas.remove();
  }

  _tick() {
    this._rafId = requestAnimationFrame(() => {
      if (this._dirty) { this._rebuild(); this._dirty = false; }
      this._dirty = (this._hoverNx >= 0) || this._impulses.length > 0;
      this._tick();
    });
  }

  _rebuild() {
    const ctx = this._ctx;
    const W = MASK_SIZE;
    const H = MASK_SIZE;
    const now = performance.now();
    ctx.fillStyle = `rgba(0,0,0,${MASK_DECAY_ALPHA})`;
    ctx.fillRect(0, 0, W, H);

    const rr = cloneRect(this._root.getBoundingClientRect());
    if (rr.width > 0 && rr.height > 0) {
      this._root.querySelectorAll(this._sel).forEach((el) => {
        const r = cloneRect(el.getBoundingClientRect());
        const x = ((r.left - rr.left) / rr.width) * W;
        const y = ((r.top - rr.top) / rr.height) * H;
        const w = (r.width / rr.width) * W;
        const h = (r.height / rr.height) * H;
        if (w > 0 && h > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.055)';
          ctx.fillRect(x, y, w, h);
        }
      });
    }

    if (this._hoverNx >= 0) this._blob(this._hoverNx * W, this._hoverNy * H, HOVER_RADIUS, HOVER_STRENGTH, '74,240,192');

    this._impulses = this._impulses.filter((imp) => {
      const age = now - imp.born;
      if (age > IMPULSE_LIFETIME) return false;
      const t = age / IMPULSE_LIFETIME;
      this._blob(imp.nx * W, imp.ny * H, imp.radius * (1 + t * 1.8), imp.strength * (1 - t * t), '124,200,255');
      return true;
    });
  }

  _blob(cx, cy, radius, alpha, rgb) {
    const r = Math.max(1, radius);
    const g = this._ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(0.5, `rgba(${rgb},${alpha * 0.5})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    this._ctx.fillStyle = g;
    this._ctx.beginPath();
    this._ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this._ctx.fill();
  }
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
const RECT_INSET_PX = 4;
const ALWAYS_ON_PASS_ENABLED = true;
const SAMPLE_STICK_MS = 420;
const SETTLE_DELAY_MS = 120;
const FAST_SCROLL_THRESHOLD = 0.95;
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
FX_GLOBAL.__assetfx_dbg_last_rects = [];
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
    get nearViewCards() { return FX_GLOBAL.__assetfx_instance?.nearViewCards?.size || 0; },
    get readyInViewNotPlayedCount() { return FX_GLOBAL.__assetfx_instance?.readyInViewNotPlayedCount || 0; },
    get renderSampledCount() { return FX_GLOBAL.__assetfx_instance?.renderSampledCount || 0; },
    get renderCandidatesCount() { return FX_GLOBAL.__assetfx_instance?.renderCandidatesCount || 0; },
    get droppedByCapCount() { return FX_GLOBAL.__assetfx_instance?.droppedByCapCount || 0; },
    get maxRenderCardsAdaptive() { return FX_GLOBAL.__assetfx_instance?.maxRenderCardsAdaptive || 0; },
    get scrollVelocityEma() { return FX_GLOBAL.__assetfx_instance?.scrollVelocityEma || 0; },
    get motionDamp() { return FX_GLOBAL.__assetfx_instance?.motionDamp || 0; },
    get fpsEma() { return FX_GLOBAL.__assetfx_instance?.fpsEma || 0; },
    get sampleCursor() { return FX_GLOBAL.__assetfx_instance?.sampleCursor || 0; },
    get samplingFrozen() { return FX_GLOBAL.__assetfx_instance?.samplingFrozen === true; },
    get stickyRetainedCount() { return FX_GLOBAL.__assetfx_instance?.stickyRetainedCount || 0; },
    get entryPendingCount() { return FX_GLOBAL.__assetfx_instance?.entryPendingCount || 0; },
    get stateSize() { return FX_GLOBAL.__assetfx_instance?.stateByKey?.size || 0; },
    get attachedRootId() { return FX_GLOBAL.__assetfx_instance?._attachedGridRoot?.dataset?.assetfxRootId || null; },
    get calls() { return [...__DBG_GL_CONTEXT_CALLS]; },
    lastRects: [],
    lastRectsLen: 0,
    lastRectsFrame: 0,
    lastRectsT: 0,
    layoutInvalidations: 0,
    lastInvalidationReason: '',
    canvasRect: null,
    dpr: 1,
    vvOffset: { ox: 0, oy: 0 },
    rootScrollTop: 0,
    sampleMapA: null,
    sampleMapC: null,
    canvasTopPlusVvOy: null,
    lastRectsReason: '',
    lastEarlyReturnReason: '',
    debugBanner: '',
    tickFrame: 0,
    tickExitReason: '',
    candidatesBuilt: 0,
    sampleWanted: 0,
    sampleIssued: 0,
    sampleDone: 0,
    texturesAlive: 0,
    mode: 'full',
    dissolveMode: 'scene',
    lastException: '',
    lastExceptionT: 0,
    vvState: null,
  };
  window.__assetfx_audit = () => {
    const overlays = Array.from(document.querySelectorAll('canvas[data-assetfx="overlay"]'));
    const allCanvases = Array.from(document.querySelectorAll('canvas'));
    const owner = FX_GLOBAL.__assetfx_global_context_owner || null;
    const webglCalls = Array.isArray(FX_GLOBAL.__webgl_ctx_calls) ? FX_GLOBAL.__webgl_ctx_calls : [];
    const webglCanvasKeys = new Set(webglCalls.map((entry) => `${entry?.canvasId || 'no-id'}::${entry?.dataset?.assetfxOverlayId || 'no-overlay'}`));
    const report = {
      contextsCreated: __DBG_GL_CONTEXTS_CREATED,
      contextsPrevented: __DBG_PREVENTED_SECOND_CONTEXT,
      overlayCanvases: overlays.length,
      allCanvases: allCanvases.length,
      webglCanvases: webglCanvasKeys.size,
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
      nearViewCards: FX_GLOBAL.__assetfx_instance?.nearViewCards?.size || 0,
      readyInViewNotPlayedCount: FX_GLOBAL.__assetfx_instance?.readyInViewNotPlayedCount || 0,
      renderSampledCount: FX_GLOBAL.__assetfx_instance?.renderSampledCount || 0,
      renderCandidatesCount: FX_GLOBAL.__assetfx_instance?.renderCandidatesCount || 0,
      droppedByCapCount: FX_GLOBAL.__assetfx_instance?.droppedByCapCount || 0,
      maxRenderCardsAdaptive: FX_GLOBAL.__assetfx_instance?.maxRenderCardsAdaptive || 0,
      alwaysOnPassEnabled: ALWAYS_ON_PASS_ENABLED,
      scrollVelocityEma: FX_GLOBAL.__assetfx_instance?.scrollVelocityEma || 0,
      motionDamp: FX_GLOBAL.__assetfx_instance?.motionDamp || 0,
      fpsEma: FX_GLOBAL.__assetfx_instance?.fpsEma || 0,
      capNow: FX_GLOBAL.__assetfx_instance?.capNow || 0,
      renderPixelsNow: FX_GLOBAL.__assetfx_instance?.renderPixelsNow || 0,
      sampleCursor: FX_GLOBAL.__assetfx_instance?.sampleCursor || 0,
      samplingFrozen: FX_GLOBAL.__assetfx_instance?.samplingFrozen === true,
      stickyRetainedCount: FX_GLOBAL.__assetfx_instance?.stickyRetainedCount || 0,
      sweepFilledCount: FX_GLOBAL.__assetfx_instance?.sweepFilledCount || 0,
      entryPendingCount: FX_GLOBAL.__assetfx_instance?.entryPendingCount || 0,
      attachedRootId: FX_GLOBAL.__assetfx_instance?.container?.dataset?.assetfxRootId || null,
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

if (typeof window !== 'undefined') {
  window.__assetfx_dump_canvases = () => (
    [...document.querySelectorAll('canvas')].map((c) => ({
      id: c.id || null,
      assetfx: c.dataset.assetfx || null,
      overlayId: c.dataset.assetfxOverlayId || null,
      rootId: c.dataset.assetfxRootId || null,
      w: c.width,
      h: c.height,
      className: c.className || null,
    }))
  );
}
const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_rect_count;
uniform vec4 u_rects[${MAX_RECTS}];
uniform sampler2D u_tile_params;
uniform float u_motion_damp;
uniform float u_scroll_fast;
uniform float u_selected;
uniform float u_select_pulse;
uniform sampler2D u_mask;
uniform float u_mask_enabled;

vec4 sampleParams(int idx) {
  float x = (float(idx) + 0.5) / float(${MAX_RECTS});
  return texture2D(u_tile_params, vec2(x, 0.5));
}

void main(){
  vec2 px = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float globalVignette = 1.0 - smoothstep(0.18, 0.95, length(uv - vec2(0.5)));
  float globalGrain = fract(sin(dot((uv + vec2(u_time * 0.02, u_time * 0.01)) * 171.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  float globalScan = 0.5 + 0.5 * sin((uv.y * u_resolution.y * 0.03) + u_time * 1.0);
  vec3 color = vec3(0.022, 0.045, 0.074) * (0.58 + globalVignette * 0.42);
  color += vec3(globalGrain * 0.01);
  color += vec3(0.02, 0.045, 0.07) * globalScan * (0.02 + 0.05 * u_motion_damp);
  float alpha = 0.055 + globalVignette * 0.035;

  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= u_rect_count) break;
    vec4 r = u_rects[i];
    if (px.x < r.x || px.y < r.y || px.x > r.z || px.y > r.w) continue;

    vec2 tileUV = (px - r.xy) / max(r.zw - r.xy, vec2(1.0));
    tileUV = clamp(tileUV, 0.0, 1.0);
    vec4 params = sampleParams(i);
    float sel = params.g;
    float energy = params.b;
    float ready = params.a;
    if (ready <= 0.01) continue;

    float edge = smoothstep(0.0, 0.08, tileUV.x) * smoothstep(0.0, 0.08, tileUV.y)
      * smoothstep(0.0, 0.08, 1.0 - tileUV.x) * smoothstep(0.0, 0.08, 1.0 - tileUV.y);
    float centerGlow = 1.0 - smoothstep(0.1, 0.92, length(tileUV - vec2(0.5)));
    float grain = fract(sin(dot(tileUV * (48.0 + float(i)), vec2(12.9898, 78.233)) + u_time * 1.8) * 43758.5453);

    // single shared material pass for all assets (no type-specific sweeps)
    vec3 base = mix(vec3(0.07, 0.17, 0.28), vec3(0.10, 0.26, 0.42), edge);
    float verticalPulse = 0.5 + 0.5 * sin((tileUV.y * 320.0) + u_time * 1.6);
    float fresnel = pow(1.0 - clamp(dot(normalize(tileUV - vec2(0.5)), vec2(0.0, 1.0)), 0.0, 1.0), 2.0);
    float selectedEnergy = sel * (0.95 + (u_selected * 0.35) + (u_select_pulse * 0.75));
    float scrollCalm = 1.0 - smoothstep(0.0, 1.0, u_scroll_fast);
    float glare = (fresnel * 0.22 + verticalPulse * 0.11) * scrollCalm;
    vec3 glass = vec3(0.28, 0.78, 1.0) * glare * selectedEnergy;

    vec3 material = base
      + vec3(0.045, 0.10, 0.16) * centerGlow
      + vec3(0.08, 0.18, 0.30) * verticalPulse * 0.14
      + glass * 1.04
      + vec3((grain - 0.5) * 0.026);

    float cardAlpha = (0.05 + edge * 0.13 + energy * 0.11 + selectedEnergy * (0.14 + 0.08 * scrollCalm)) * ready;
    color += material * ready;
    alpha += cardAlpha;
  }

  vec4 maskTex = texture2D(u_mask, vec2(v_uv.x, 1.0 - v_uv.y));
  float maskV = (maskTex.r + maskTex.g + maskTex.b) / 3.0;
  float gate = smoothstep(0.06, 0.85, maskV);
  color += vec3(0.03, 0.11, 0.16) * maskV * (0.22 + 0.28 * (1.0 - u_scroll_fast));
  alpha += gate * 0.05 * u_mask_enabled;

  alpha = clamp(alpha, 0.0, 0.54);
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

const TILE_STATE = Object.freeze({
  DOM_ONLY: 'DOM_ONLY',
  REQUESTED: 'REQUESTED',
  UPLOADING: 'UPLOADING',
  READY: 'READY',
  EVICTED: 'EVICTED',
});

const TILE_SWAP_STATE = Object.freeze({
  DOM_VISIBLE: 'DOM_VISIBLE',
  FX_SWAPPED: 'FX_SWAPPED',
  RESTORING: 'RESTORING',
});

if (typeof window !== 'undefined') {
  window.__tilefx_probe = window.__tilefx_probe || {
    timestamp: 0,
    visibleTiles: [],
    stateCounts: {},
    readyTiles: 0,
    pendingTiles: 0,
    swapSetCalls: 0,
    swapClearCalls: 0,
    cacheBytes: 0,
    cacheBudgetBytes: 0,
    evictReason: null,
    maxTexEdge: 0,
    avgTexWidth: 0,
    avgTexHeight: 0,
  };
}

const TILEFX_VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const TILEFX_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform vec4 u_rect;
uniform vec3 u_type_color;
uniform float u_selected;
uniform float u_time;
uniform sampler2D u_tex;
uniform float u_has_tex;
uniform vec2 u_tex_size;

void main(){
  vec2 px = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  if (px.x < u_rect.x || px.y < u_rect.y || px.x > u_rect.z || px.y > u_rect.w) discard;

  vec2 tileSizePx = max(u_rect.zw - u_rect.xy, vec2(1.0));
  vec2 tileUV = (px - u_rect.xy) / tileSizePx;
  tileUV = clamp(tileUV, 0.0, 1.0);
  vec2 tileCenterPx = (tileUV - 0.5) * tileSizePx;
  float radius = min(tileSizePx.x, tileSizePx.y) * 0.09;
  vec2 q = abs(tileCenterPx) - (tileSizePx * 0.5 - vec2(radius));
  float sdf = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
  float mask = 1.0 - smoothstep(0.0, 1.6, sdf);

  vec2 toEdge = min(tileUV, 1.0 - tileUV);
  float edge = min(toEdge.x, toEdge.y);
  float edgeBand = smoothstep(0.0, 0.12, edge);
  float border = 1.0 - smoothstep(0.015, 0.05, edge);

  float pulse = 0.5 + 0.5 * sin((tileUV.x + tileUV.y) * 7.0 + u_time * 1.25);
  float selectionBoost = 1.0 + (u_selected * 0.45);
  vec3 glassBase = vec3(0.06, 0.09, 0.16) + vec3(0.04, 0.06, 0.10) * pulse * 0.45;
  vec3 glow = u_type_color * (0.18 + border * 0.65) * selectionBoost;

  vec3 tex = vec3(0.12, 0.16, 0.24);
  tex += vec3(0.02) * sin((tileUV.x * 61.0 + tileUV.y * 47.0 + u_time * 0.35));
  if (u_has_tex > 0.5) {
    vec2 texSize = max(u_tex_size, vec2(1.0));
    float tileAspect = tileSizePx.x / tileSizePx.y;
    float texAspect = texSize.x / texSize.y;
    vec2 coverUV = tileUV;
    if (texAspect > tileAspect) {
      float sx = tileAspect / texAspect;
      coverUV.x = (tileUV.x - 0.5) * sx + 0.5;
    } else {
      float sy = texAspect / tileAspect;
      coverUV.y = (tileUV.y - 0.5) * sy + 0.5;
    }
    coverUV = clamp(coverUV, 0.0, 1.0);
    tex = texture2D(u_tex, coverUV).rgb;
  }
  vec3 mixed = mix(glassBase, tex, 0.94 * u_has_tex);
  vec3 color = mixed + glow * (0.20 + border * 0.45) + u_type_color * (1.0 - edgeBand) * 0.05;
  color *= mask;

  float alphaBase = mix(0.86, 1.0, u_has_tex);
  float alpha = alphaBase * mask;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

function resizeImageForGL(img, maxEdge = 320){
  const w = Number(img?.naturalWidth || img?.videoWidth || img?.width || 0);
  const h = Number(img?.naturalHeight || img?.videoHeight || img?.height || 0);
  if (!w || !h) return { img, w, h, resized: false };
  const safeMaxEdge = Math.max(64, Number(maxEdge || 320));
  const scale = Math.min(1, safeMaxEdge / Math.max(w, h));
  if (scale >= 1) return { img, w, h, resized: false };
  const rw = Math.max(1, Math.round(w * scale));
  const rh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) return { img, w, h, resized: false };
  ctx.imageSmoothingEnabled = true;
  try { ctx.imageSmoothingQuality = 'high'; } catch {}
  ctx.drawImage(img, 0, 0, rw, rh);
  return { img: canvas, w: rw, h: rh, resized: true };
}

class TextureCacheLRU {
  constructor(gl, { maxTextures = 96, maxBytes = 128 * 1024 * 1024, maxTexEdge = 320 } = {}) {
    this.gl = gl;
    this.maxTextures = Math.max(12, Number(maxTextures || 96));
    this.maxBytes = Math.max(8 * 1024 * 1024, Number(maxBytes || (128 * 1024 * 1024)));
    this.map = new Map();
    this.totalBytes = 0;
    this.evictions = 0;
    this.lastEvictReason = 'none';
    this.uploadCounts = new Map();
    this.visibleKeySet = new Set();
    this.minEvictAgeMs = 1500;
    this.maxTexEdge = Math.max(64, Number(maxTexEdge || 320));
  }

  setVisibleKeys(keys) {
    this.visibleKeySet = keys instanceof Set ? new Set(keys) : new Set();
  }

  _estimateBytes(width = 0, height = 0) {
    const w = Math.max(1, Number(width || 0));
    const h = Math.max(1, Number(height || 0));
    return Math.max(4, w * h * 4);
  }

  _evictIfNeeded(now = performance.now()) {
    if (!this.map.size) return;
    this.lastEvictReason = 'none';
    while (this.map.size > this.maxTextures || this.totalBytes > this.maxBytes) {
      let oldestKey = '';
      let oldestAt = Infinity;
      this.map.forEach((entry, key) => {
        if (this.visibleKeySet.has(key)) return;
        const age = Math.max(0, now - Number(entry.lastUsedAt || 0));
        if (age < this.minEvictAgeMs) return;
        if (entry.lastUsedAt < oldestAt) {
          oldestAt = entry.lastUsedAt;
          oldestKey = key;
        }
      });
      if (!oldestKey) {
        this.lastEvictReason = 'NO_ELIGIBLE_KEY';
        break;
      }
      const entry = this.map.get(oldestKey);
      if (!entry) break;
      try { this.gl.deleteTexture(entry.texture); } catch {}
      this.totalBytes = Math.max(0, this.totalBytes - Number(entry.bytes || 0));
      this.map.delete(oldestKey);
      this.evictions += 1;
      this.lastEvictReason = 'OVER_BUDGET';
    }
  }

  has(key) {
    return this.map.has(key);
  }

  get(key, now = performance.now()) {
    const entry = this.map.get(key);
    if (!entry) return null;
    entry.lastUsedAt = now;
    return entry;
  }

  upsertFromImage(key, img, now = performance.now()) {
    if (!key || !img) return { uploaded: false, entry: null, reason: 'MISSING_SOURCE' };
    const gl = this.gl;
    const existing = this.map.get(key);
    if (existing) {
      existing.lastUsedAt = now;
      return { uploaded: false, entry: existing, reason: 'ALREADY_CACHED' };
    }
    const tex = gl.createTexture();
    if (!tex) return { uploaded: false, entry: null, reason: 'TEXTURE_ALLOC_FAILED' };
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    } catch {}
    const resized = resizeImageForGL(img, this.maxTexEdge);
    const uploadSource = resized?.img || img;
    const width = Number(resized?.w || uploadSource?.naturalWidth || uploadSource?.videoWidth || uploadSource?.width || 0) || 1;
    const height = Number(resized?.h || uploadSource?.naturalHeight || uploadSource?.videoHeight || uploadSource?.height || 0) || 1;
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uploadSource);
    } catch {
      gl.deleteTexture(tex);
      return { uploaded: false, entry: null, reason: 'TEX_IMAGE_FAILED' };
    }
    const bytes = this._estimateBytes(width, height);
    const entry = { texture: tex, bytes, width, height, lastUsedAt: now };
    this.map.set(key, entry);
    this.uploadCounts.set(key, Number(this.uploadCounts.get(key) || 0) + 1);
    this.totalBytes += bytes;
    this._evictIfNeeded(now);
    return { uploaded: true, entry };
  }

  totalReuploads() {
    let total = 0;
    this.uploadCounts.forEach((count) => {
      if (count > 1) total += (count - 1);
    });
    return total;
  }

  averageTextureSize() {
    if (!this.map.size) return { width: 0, height: 0 };
    let w = 0;
    let h = 0;
    this.map.forEach((entry) => {
      w += Number(entry?.width || 0);
      h += Number(entry?.height || 0);
    });
    return {
      width: Math.round(w / this.map.size),
      height: Math.round(h / this.map.size),
    };
  }

  destroy() {
    this.map.forEach((entry) => {
      try { this.gl.deleteTexture(entry.texture); } catch {}
    });
    this.map.clear();
    this.totalBytes = 0;
  }
}

export class TileFXRenderer {
  constructor({ canvas = null, onFail = null } = {}) {
    this.canvas = canvas || null;
    this.onFail = typeof onFail === 'function' ? onFail : null;
    this.mode = 'grid';
    this.enabled = false;
    this.raf = 0;
    this.failed = false;
    this.failReason = '';
    this.tiles = [];
    this._tileSource = null;
    this._lastScanAt = 0;
    this._frame = 0;
    this._uploadsWindow = [];
    this._drawCalls = 0;
    this._lastFrameMs = 0;
    this._pendingUploads = new Map();
    this._drainTraceByKey = new Map();
    this.tileStateByKey = new Map();
    this.decodedSrcSet = new Set();
    this._texturesUploaded = 0;
    this._uploadReject = { notReady: 0, zeroSize: 0, tainted: 0, unknown: 0 };
    this._lastUploadError = '';
    this._uploadAttempt = 0;
    this._uploadsQueued = 0;
    this._uploadsAttempted = 0;
    this._uploadsSucceeded = 0;
    this._uploadsFailed = 0;
    this._pendingReady = 0;
    this._pendingWaitLoad = 0;
    this._srcMissing = 0;
    const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const maxTexParam = Number(new URLSearchParams(window.location.search).get('tilefxMaxTex') || 0);
    this.maxTexEdge = Math.max(64, maxTexParam || (coarse ? 512 : 640));
    this.idleUploadOverscan = Math.max(0, Number(new URLSearchParams(window.location.search).get('tilefxIdleReadyMargin') || 6));
    this.uploadBudgetPerSecond = Math.max(1, Number(new URLSearchParams(window.location.search).get('fxtileuploads') || 8));
    this.maxUploadsPerFrame = Math.max(1, Number(new URLSearchParams(window.location.search).get('fxtileuploadsframe') || 1));
    this.uploadPauseMs = 250;
    this.backpressureUntil = 0;
    this.isScrolling = false;
    this.scrollIdleDelayMs = 140;
    this._scrollIdleTimer = 0;
    this._lastScrollAt = 0;
    this.dprCap = 2;
    this.gl = null;
    this.program = null;
    this.quad = null;
    this.u = null;
    this.textureCache = null;
    this._domSwapStyleState = new WeakMap();
    this._domSwapBgState = new WeakMap();
    this._swappedTileRefs = new Map();
    this._swapStateByTile = new WeakMap();
    this._swapSeenFrameByTile = new WeakMap();
    this._swapStartedAtByTile = new WeakMap();
    this._swapReleaseDelayFrames = 10;
    this._swapReleaseDelayMs = 260;
    this._swapMinHoldMs = 320;
    this._swapReleaseIdleMs = 260;
    this._swapReleaseNearVisibleIdleMs = 520;
    this._swapReleaseNearVisibleDelayFrames = 20;
    this._swapReleaseNearVisibleDelayMs = 520;
    this._swapReleaseBlocked = 0;
    this._swapReleaseAllowed = 0;
    this._visibleSwapReleaseBlocked = 0;
    this._offscreenSwapReleaseAllowed = 0;
    this._lastOwnershipRows = [];
    this._lastDrawByTileEl = new WeakMap();
    this._fxEntryPhase = 'steady';
    this._fxEntryStartedAt = 0;
    this._bootstrapVisibleTileEls = new Set();
    this._swapLeakLoggedKeys = new Set();
    this._illegalDisableLogged = false;
    this._debugRectLayer = null;
    this._debugRectPool = [];
    this._debugRectMismatchLogged = new Set();
    this.debugRectsEnabled = new URLSearchParams(window.location.search).get('tilefxDebugRects') === '1';

    if (typeof window !== 'undefined') {
      const prevDbg = window.__tilefx_dbg || {};
      window.__tilefx_dbg = {
        ...prevDbg,
        mode: 'grid',
        visibleCount: 0,
        overscanCount: 0,
        uploadsThisSecond: 0,
        texturesUploaded: 0,
        texturesPending: 0,
        uploadAttempt: 0,
        uploadsQueued: 0,
        uploadsAttempted: 0,
        uploadsSucceeded: 0,
        uploadsFailed: 0,
        maxTexEdge: 0,
        avgTexWidth: 0,
        avgTexHeight: 0,
        pendingReady: 0,
        pendingWaitLoad: 0,
        srcMissing: 0,
        uploadOk: 0,
        uploadFail: 0,
        lastUploadError: '',
        lastFailReason: '',
        texturesInCache: 0,
        texturesEvicted: 0,
        reuploadsTotal: 0,
        enabled: false,
        rafRunning: false,
        scrolling: false,
        scrollIdleMs: 0,
        tilesVisible: 0,
        tilesFed: 0,
        tilesDrawn: 0,
        drawCalls: 0,
        dpr: 1,
        dprCap: 2,
        lastFrameMs: 0,
        backpressureUntil: 0,
        failed: false,
        failReason: '',
        uploadReject: { notReady: 0, zeroSize: 0, tainted: 0, unknown: 0 },
        stateCounts: { domOnly: 0, requested: 0, uploading: 0, ready: 0, evicted: 0 },
        readyTiles: 0,
        pendingTiles: 0,
        swapSetCalls: 0,
        swapClearCalls: 0,
        swapReleaseBlocked: 0,
        swapReleaseAllowed: 0,
        visibleSwapReleaseBlocked: 0,
        offscreenSwapReleaseAllowed: 0,
        fedVisibleRatio: 1,
        visibleReady: 0,
        visibleUploading: 0,
        visibleDomOnly: 0,
        visibleSwapped: 0,
        rectMismatch: 0,
        rectMismatchRows: [],
        illegalDisableBlocked: 0,
        lastIllegalDisable: null,
      };
    }

    if (!this.canvas) {
      this._setFailed('NO_CANVAS');
      return;
    }
    this._initGL();
    this._bindContextGuards();
  }

  _setFailed(reason = 'UNKNOWN') {
    this.failed = true;
    this.failReason = String(reason || 'UNKNOWN');
    if (window.__tilefx_dbg) {
      window.__tilefx_dbg.failed = true;
      window.__tilefx_dbg.failReason = this.failReason;
    }
    if (this.onFail) this.onFail(this.failReason);
  }

  _initGL() {
    try {
      const gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
      if (!gl) throw new Error('WEBGL_UNAVAILABLE');
      this.gl = gl;
      this.program = createProgram(gl, TILEFX_VERT, TILEFX_FRAG);
      this.quad = createQuad(gl);
      this.u = {
        u_resolution: gl.getUniformLocation(this.program, 'u_resolution'),
        u_rect: gl.getUniformLocation(this.program, 'u_rect'),
        u_type_color: gl.getUniformLocation(this.program, 'u_type_color'),
        u_selected: gl.getUniformLocation(this.program, 'u_selected'),
        u_time: gl.getUniformLocation(this.program, 'u_time'),
        u_tex: gl.getUniformLocation(this.program, 'u_tex'),
        u_has_tex: gl.getUniformLocation(this.program, 'u_has_tex'),
        u_tex_size: gl.getUniformLocation(this.program, 'u_tex_size'),
      };
      this.textureCache = new TextureCacheLRU(gl, {
        maxTextures: Number(new URLSearchParams(window.location.search).get('fxtilecache') || 96),
        maxBytes: Number(new URLSearchParams(window.location.search).get('fxtilecachemb') || 128) * 1024 * 1024,
        maxTexEdge: this.maxTexEdge,
      });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      bindQuad(gl, this.program, this.quad);
    } catch (e) {
      this._setFailed(e?.message || 'GL_INIT_FAILED');
    }
  }

  _bindContextGuards() {
    if (!this.canvas) return;
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this._setFailed('WEBGL_CONTEXT_LOST');
    }, { passive: false });
  }

  setTileSource(fn) {
    this._tileSource = typeof fn === 'function' ? fn : null;
  }

  _setTileState(key, state) {
    if (!key) return;
    this.tileStateByKey.set(key, state);
  }

  _stateCounts() {
    const counts = { domOnly: 0, requested: 0, uploading: 0, ready: 0, evicted: 0 };
    this.tileStateByKey.forEach((state) => {
      if (state === TILE_STATE.READY) counts.ready += 1;
      else if (state === TILE_STATE.REQUESTED) counts.requested += 1;
      else if (state === TILE_STATE.UPLOADING) counts.uploading += 1;
      else if (state === TILE_STATE.EVICTED) counts.evicted += 1;
      else counts.domOnly += 1;
    });
    return counts;
  }

  getTileState(key = '') {
    const k = String(key || '');
    if (!k) return TILE_STATE.DOM_ONLY;
    return this.tileStateByKey.get(k) || TILE_STATE.DOM_ONLY;
  }

  setMode(mode = 'grid') {
    const prevMode = this.mode;
    const next = String(mode || 'grid').toLowerCase();
    this.mode = (next === 'fx' || next === 'grid' || next === 'list') ? next : 'grid';
    if (this.mode === 'fx' && prevMode !== 'fx') {
      this._fxEntryPhase = 'bootstrap_collect';
      this._fxEntryStartedAt = performance.now();
      this._bootstrapVisibleTileEls = new Set();
    } else if (this.mode !== 'fx') {
      this._fxEntryPhase = 'steady';
      this._fxEntryStartedAt = 0;
      this._bootstrapVisibleTileEls = new Set();
    }
    if (window.__tilefx_dbg) window.__tilefx_dbg.mode = this.mode;
  }

  getFxEntryPhase() {
    return String(this._fxEntryPhase || 'steady');
  }

  _isEnteringPhase() {
    return this.mode === 'fx' && String(this._fxEntryPhase || 'steady') !== 'steady';
  }

  getFxLifecycleStage() {
    return this._isEnteringPhase() ? 'entering' : 'steady';
  }

  setEnabled(enabled = false) {
    this.enabled = enabled === true;
    if (window.__tilefx_dbg) window.__tilefx_dbg.enabled = this.enabled;
    if (this.enabled) this._start();
    else this.stop();
  }

  enable() {
    this.setEnabled(true);
  }

  disable(reason = '', { allowInFxView = false } = {}) {
    const why = String(reason || 'unspecified');
    const activeView = String((typeof window !== 'undefined' ? window.__explorer_view : '') || '');
    const captureStack = () => {
      try { return new Error().stack || ''; } catch { return ''; }
    };
    if (!allowInFxView && activeView === 'fx') {
      const stack = captureStack();
      if (!this._illegalDisableLogged) {
        try {
          console.error('[tilefx] illegal disable during FX view', { reason: why, stack });
        } catch {}
        this._illegalDisableLogged = true;
      }
      if (window.__tilefx_dbg) {
        window.__tilefx_dbg.illegalDisableBlocked = Number(window.__tilefx_dbg.illegalDisableBlocked || 0) + 1;
        window.__tilefx_dbg.lastIllegalDisable = { reason: why, stack, t: Date.now() };
      }
      return false;
    }
    this._illegalDisableLogged = false;
    const debugLifecycle = new URLSearchParams(window.location.search).get('fxdebug') === '1';
    if (debugLifecycle) {
      try {
        console.debug('[tilefx] disable', { reason: why, view: activeView || 'unknown' });
      } catch {}
    }
    if (window.__tilefx_dbg) {
      window.__tilefx_dbg.lastDisable = {
        reason: why,
        view: activeView || 'unknown',
        t: Date.now(),
      };
    }
    this.setEnabled(false);
    this.clear();
    this._drawCalls = 0;
    if (window.__tilefx_dbg) window.__tilefx_dbg.drawCalls = 0;
    return true;
  }

  restoreAllDomSwaps(reason = 'restore:all') {
    const swapped = Array.from(this._swappedTileRefs.entries());
    swapped.forEach(([tileEl, tile]) => {
      if (!tileEl || !tileEl.isConnected) {
        this._swappedTileRefs.delete(tileEl);
        return;
      }
      this.applyDomSwap(tile, false, reason);
      this._swapSeenFrameByTile.delete(tileEl);
    });
  }

  teardownForModeExit({ removeCanvas = false } = {}) {
    this.disable('teardownForModeExit');
    this.restoreAllDomSwaps('restore:teardown');
    this.tiles = [];
    this.tileStateByKey.clear();
    this._pendingUploads.clear();
    this._drainTraceByKey.clear();
    this._uploadsWindow = [];
    this._domSwapStyleState = new WeakMap();
    this._domSwapBgState = new WeakMap();
    this._swappedTileRefs = new Map();
    this._debugRectLayer = null;
    this._debugRectPool = [];
    this.debugRectsEnabled = new URLSearchParams(window.location.search).get('tilefxDebugRects') === '1';
    this._lastScrollAt = 0;
    this.isScrolling = false;
    if (this.textureCache) {
      this.textureCache.destroy();
      this.textureCache = null;
    }
    if (removeCanvas && this.canvas?.parentNode) {
      try { this.canvas.parentNode.removeChild(this.canvas); } catch {}
      this.canvas = null;
    }
    if (window.__tilefx_dbg) {
      window.__tilefx_dbg.tilesFed = 0;
      window.__tilefx_dbg.tilesVisible = 0;
      window.__tilefx_dbg.tilesDrawn = 0;
      window.__tilefx_dbg.texturesPending = 0;
      window.__tilefx_dbg.texturesInCache = 0;
      window.__tilefx_dbg.cacheBytes = 0;
      window.__tilefx_dbg.drawCalls = 0;
      window.__tilefx_dbg.rafRunning = false;
      window.__tilefx_dbg.enabled = false;
    }
  }

  noteScroll() {
    this.isScrolling = true;
    this._lastScrollAt = performance.now();
    if (window.__tilefx_dbg) window.__tilefx_dbg.scrolling = true;
    if (this._scrollIdleTimer) clearTimeout(this._scrollIdleTimer);
    this._scrollIdleTimer = setTimeout(() => {
      this.isScrolling = false;
      this._scrollIdleTimer = 0;
      if (window.__tilefx_dbg) window.__tilefx_dbg.scrolling = false;
    }, this.scrollIdleDelayMs);
  }

  start() {
    this.enable();
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this._scrollIdleTimer) clearTimeout(this._scrollIdleTimer);
    this._scrollIdleTimer = 0;
    this._clearDebugRects();
    if (window.__tilefx_dbg) window.__tilefx_dbg.rafRunning = false;
  }

  clear() {
    const gl = this.gl;
    if (!gl || !this.canvas) return;
    gl.viewport(0, 0, this.canvas.width || 1, this.canvas.height || 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  _getSwapState(tileEl) {
    if (!tileEl) return TILE_SWAP_STATE.DOM_VISIBLE;
    return this._swapStateByTile.get(tileEl) || TILE_SWAP_STATE.DOM_VISIBLE;
  }

  _setSwapState(tileEl, nextState = TILE_SWAP_STATE.DOM_VISIBLE, reason = '') {
    if (!tileEl) return;
    this._swapStateByTile.set(tileEl, nextState);
    if (window.__tilefx_dbg && reason) {
      const rows = Array.isArray(window.__tilefx_dbg.swapTransitions) ? window.__tilefx_dbg.swapTransitions : [];
      rows.push({ t: Math.round(performance.now()), state: String(nextState), reason: String(reason || ''), key: String(tileEl.dataset?.fxCardId || tileEl.dataset?.relativePath || '') });
      window.__tilefx_dbg.swapTransitions = rows.slice(-40);
    }
  }

  _getTileRectInVisualViewport(tileRect, viewportMetrics) {
    const vp = viewportMetrics || getViewportMetrics();
    const rect = tileRect || { left: 0, top: 0, width: 0, height: 0 };
    const left = Number(rect.left || 0) - Number(vp.offsetX || 0);
    const top = Number(rect.top || 0) - Number(vp.offsetY || 0);
    const width = Number(rect.width || 0);
    const height = Number(rect.height || 0);
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  _cssRectToCanvasRect(localRect, dpr = 1) {
    const r = localRect || { left: 0, top: 0, right: 0, bottom: 0 };
    return {
      x1: Number(r.left || 0) * Number(dpr || 1),
      y1: Number(r.top || 0) * Number(dpr || 1),
      x2: Number(r.right || 0) * Number(dpr || 1),
      y2: Number(r.bottom || 0) * Number(dpr || 1),
    };
  }

  _canReleaseSwap(tileEl, now = performance.now()) {
    if (!tileEl) return true;
    const startedAt = Number(this._swapStartedAtByTile.get(tileEl) || 0);
    if (!startedAt) return true;
    return (now - startedAt) >= this._swapMinHoldMs;
  }

  applyDomSwap(tile, swapped = false, reason = '') {
    const tileEl = tile?.tileEl || null;
    const paintEls = Array.isArray(tile?.thumbPaintEls) && tile.thumbPaintEls.length
      ? tile.thumbPaintEls
      : [tile?.thumbSurfaceEl || tile?.thumbEl].filter(Boolean);
    const thumbBgEl = tile?.thumbBgEl || null;
    if (!tileEl) return;
    tileEl.dataset.tex = swapped ? '1' : '0';
    tileEl.classList.toggle('fx-swapped', !!swapped);
    if (swapped) {
      this._swappedTileRefs.set(tileEl, tile);
      this._swapStartedAtByTile.set(tileEl, performance.now());
      this._setSwapState(tileEl, TILE_SWAP_STATE.FX_SWAPPED, reason || 'swap:on');
    } else {
      this._swappedTileRefs.delete(tileEl);
      this._swapStartedAtByTile.delete(tileEl);
      this._setSwapState(tileEl, TILE_SWAP_STATE.RESTORING, reason || 'swap:off');
    }
    if (!paintEls.length) return;
    for (const paintEl of paintEls) {
      if (!paintEl) continue;
      const prior = this._domSwapStyleState.get(paintEl) || {
        opacity: paintEl.style.opacity || '',
        visibility: paintEl.style.visibility || '',
        filter: paintEl.style.filter || '',
        transform: paintEl.style.transform || '',
        willChange: paintEl.style.willChange || '',
        pointerEvents: paintEl.style.pointerEvents || '',
      };
      if (!this._domSwapStyleState.has(paintEl)) this._domSwapStyleState.set(paintEl, prior);
      if (swapped) {
        paintEl.style.opacity = '0';
        paintEl.style.visibility = 'hidden';
        paintEl.style.filter = 'none';
        paintEl.style.transform = 'translateZ(0)';
        paintEl.style.willChange = 'opacity';
        paintEl.style.pointerEvents = 'none';
      } else {
        paintEl.style.opacity = prior.opacity;
        paintEl.style.visibility = prior.visibility;
        paintEl.style.filter = prior.filter;
        paintEl.style.transform = prior.transform;
        paintEl.style.willChange = prior.willChange;
        paintEl.style.pointerEvents = prior.pointerEvents;
      }
    }
    const bgNodes = [thumbBgEl, ...paintEls].filter(Boolean);
    if (swapped) {
      bgNodes.forEach((bgNode) => {
        const computedBg = String(getComputedStyle(bgNode).backgroundImage || '').trim();
        const isThumbSurface = bgNode.classList?.contains('thumb') || bgNode.closest?.('.thumb') === bgNode;
        if (!isThumbSurface && (!computedBg || computedBg === 'none')) return;
        if (!this._domSwapBgState.has(bgNode)) {
          this._domSwapBgState.set(bgNode, {
            backgroundImage: bgNode.style.backgroundImage || '',
            background: bgNode.style.background || '',
            backgroundColor: bgNode.style.backgroundColor || '',
          });
        }
        bgNode.style.backgroundImage = 'none';
        if (isThumbSurface) {
          bgNode.style.background = 'transparent';
          bgNode.style.backgroundColor = 'transparent';
        }
      });
      return;
    }
    bgNodes.forEach((bgNode) => {
      if (!this._domSwapBgState.has(bgNode)) return;
      const priorBg = this._domSwapBgState.get(bgNode) || {};
      bgNode.style.backgroundImage = priorBg.backgroundImage || '';
      bgNode.style.background = priorBg.background || '';
      bgNode.style.backgroundColor = priorBg.backgroundColor || '';
      this._domSwapBgState.delete(bgNode);
    });
    this._setSwapState(tileEl, TILE_SWAP_STATE.DOM_VISIBLE, reason || 'swap:restored');
  }


  hasTexture(key = '') {
    const k = String(key || '');
    if (!k || !this.textureCache) return false;
    return this.textureCache.has(k);
  }

  updateTiles(tileList) {
    this.tiles = Array.isArray(tileList) ? tileList : [];
    if (window.__tilefx_dbg) window.__tilefx_dbg.tilesFed = this.tiles.length;
    if (!this.enabled || this.mode !== 'fx' || !Array.isArray(this.tiles) || this.tiles.length === 0) return;
    for (const tile of this.tiles) {
      const key = String(tile?.key || '');
      if (!key || this._pendingUploads.has(key) || this.hasTexture(key)) continue;
      this._queueTileImageUpload(tile, key);
    }
    this._drainPendingUploads(performance.now());
  }

  _typeColor(type = '') {
    const t = String(type || '').toLowerCase();
    if (t === 'video') return [0.28, 0.60, 1.0];
    if (t === 'image') return [0.68, 0.36, 1.0];
    if (t === 'audio') return [1.0, 0.72, 0.24];
    return [0.54, 0.66, 0.96];
  }

  _refreshTileList(now) {
    void now;
    if (!Array.isArray(this.tiles) || this.tiles.length === 0) return;
    for (const tile of this.tiles) {
      const tileEl = tile?.tileEl;
      if (!tileEl || !tileEl.isConnected) continue;
      const rect = tileEl.getBoundingClientRect();
      tile.rect = {
        left: Number(rect.left || 0),
        top: Number(rect.top || 0),
        width: Number(rect.width || 0),
        height: Number(rect.height || 0),
      };
    }
  }

  _ensureDebugRectLayer() {
    if (!this.debugRectsEnabled || !this.canvas) return null;
    if (this._debugRectLayer?.isConnected) return this._debugRectLayer;
    const layer = document.createElement('div');
    layer.className = 'tilefx-debug-rect-layer';
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '99995',
      pointerEvents: 'none',
    });
    document.body.appendChild(layer);
    this._debugRectLayer = layer;
    return layer;
  }

  _clearDebugRects() {
    if (this._debugRectLayer) this._debugRectLayer.style.display = 'none';
  }


  _canReleaseVisibleSwap(drawMeta = null, now = performance.now()) {
    if (!drawMeta?.tileEl) return this._canReleaseSwap(null, now);
    if (drawMeta.visible) {
      this._swapReleaseBlocked += 1;
      this._visibleSwapReleaseBlocked += 1;
      return false;
    }
    if (this.isScrolling) {
      this._swapReleaseBlocked += 1;
      return false;
    }
    if (!this._canReleaseSwap(drawMeta.tileEl, now)) {
      this._swapReleaseBlocked += 1;
      return false;
    }
    return true;
  }

  _reconcileVisibleOwnerFromTruth(tile, {
    shouldFxOwner = false,
    swapState = TILE_SWAP_STATE.DOM_VISIBLE,
    reasonFx = 'ownership:visible-fx',
    reasonDom = 'ownership:visible-dom',
  } = {}) {
    const tileEl = tile?.tileEl || null;
    if (!tileEl) return 'DOM';
    if (shouldFxOwner) {
      if (swapState !== TILE_SWAP_STATE.FX_SWAPPED) {
        this.applyDomSwap(tile, true, reasonFx);
        if (window.__tilefx_dbg) window.__tilefx_dbg.swapSetCalls = Number(window.__tilefx_dbg.swapSetCalls || 0) + 1;
      }
      return 'FX';
    }
    if (swapState === TILE_SWAP_STATE.FX_SWAPPED) {
      this.applyDomSwap(tile, false, reasonDom);
      if (window.__tilefx_dbg) window.__tilefx_dbg.swapClearCalls = Number(window.__tilefx_dbg.swapClearCalls || 0) + 1;
    }
    return 'DOM';
  }

  syncVisibleTileOwnership(activeTiles = [], drawResults = new Map(), now = performance.now()) {
    const rows = [];
    const active = Array.isArray(activeTiles) ? activeTiles : [];
    const visibleRows = [];
    active.forEach((tile) => {
      const tileEl = tile?.tileEl || null;
      if (!tileEl || !tileEl.isConnected) return;
      const drawMeta = drawResults.get(tileEl) || {};
      if (drawMeta.visible !== true) return;
      const hasTexture = drawMeta.hasTexture === true;
      const wasDrawnThisPass = drawMeta.wasDrawnThisPass === true;
      const rectValid = drawMeta.rectValid === true;
      visibleRows.push({ tile, tileEl, hasTexture, wasDrawnThisPass, rectValid, ready: hasTexture && wasDrawnThisPass && rectValid });
    });
    const visibleSet = new Set(visibleRows.map((row) => row.tileEl));
    if (this.mode !== 'fx') {
      this._bootstrapVisibleTileEls = new Set();
      this._fxEntryPhase = 'steady';
    }
    if (!(this._bootstrapVisibleTileEls instanceof Set)) {
      this._bootstrapVisibleTileEls = new Set();
    }
    if (this.mode === 'fx' && this._fxEntryPhase === 'bootstrap_collect') {
      this._bootstrapVisibleTileEls = new Set(visibleSet);
      visibleRows.forEach(({ tile }) => {
        if (String(tile?.tileEl?.dataset?.tex || '0') === '1') {
          this.applyDomSwap(tile, false, 'bootstrap:collect-reset');
        }
      });
      this._fxEntryPhase = 'bootstrap_ready';
    }
    if (this.mode === 'fx' && this._fxEntryPhase !== 'steady') {
      const keep = new Set();
      for (const tileEl of this._bootstrapVisibleTileEls) {
        if (visibleSet.has(tileEl)) keep.add(tileEl);
      }
      this._bootstrapVisibleTileEls = keep;
    }
    const bootstrapRows = visibleRows.filter((row) => this._bootstrapVisibleTileEls.has(row.tileEl));
    const bootstrapTotal = bootstrapRows.length;
    const bootstrapReady = bootstrapRows.filter((row) => row.ready).length;
    const bootstrapReadyRatio = bootstrapTotal > 0 ? (bootstrapReady / bootstrapTotal) : 0;
    const hasVisibleDualOwner = bootstrapRows.some((row) => {
      const swapState = this._getSwapState(row.tileEl);
      return swapState === TILE_SWAP_STATE.FX_SWAPPED && !row.ready;
    });
    if (this.mode === 'fx' && this._fxEntryPhase === 'bootstrap_ready') {
      if (bootstrapTotal === 0) {
        this._fxEntryPhase = 'steady';
      } else if (bootstrapReady === bootstrapTotal && !hasVisibleDualOwner) {
        this._fxEntryPhase = 'bootstrap_commit';
      }
    }
    if (this.mode === 'fx' && this._fxEntryPhase === 'bootstrap_commit') {
      bootstrapRows.forEach(({ tile, ready }) => {
        if (ready) {
          const swapState = this._getSwapState(tile?.tileEl || null);
          if (swapState !== TILE_SWAP_STATE.FX_SWAPPED) {
            this.applyDomSwap(tile, true, 'bootstrap:batch-commit');
            if (window.__tilefx_dbg) window.__tilefx_dbg.swapSetCalls = Number(window.__tilefx_dbg.swapSetCalls || 0) + 1;
          }
        }
      });
      this._fxEntryPhase = 'steady';
    }
    const blockVisibleSwapCommit = this._isEnteringPhase();
    const inSteady = this.mode === 'fx' && this._fxEntryPhase === 'steady';
    active.forEach((tile) => {
      const tileEl = tile?.tileEl || null;
      if (!tileEl || !tileEl.isConnected) return;
      const drawMeta = drawResults.get(tileEl) || {};
      const swapState = this._getSwapState(tileEl);
      const visible = drawMeta.visible === true;
      const hasTexture = drawMeta.hasTexture === true;
      const wasDrawnThisPass = drawMeta.wasDrawnThisPass === true;
      const rectValid = drawMeta.rectValid === true;
      const isSwapEligible = this.mode === 'fx' && this.enabled && visible && hasTexture && wasDrawnThisPass && rectValid;
      const visibleSteadyLock = inSteady && isSwapEligible;
      const key = String(tile?.key || tileEl.dataset?.fxCardId || '');
      const queued = key ? this._pendingUploads.has(key) : false;
      const pending = key ? this._pendingUploads.get(key) : null;
      const trace = key ? this._drainTraceByKey.get(key) : null;
      let owner = 'DOM';
      let releaseBlocked = false;

      if (visibleSteadyLock) {
        owner = this._reconcileVisibleOwnerFromTruth(tile, {
          shouldFxOwner: true,
          swapState,
          reasonFx: 'steady:visible-lock',
        });
      } else if (visible && inSteady) {
        owner = this._reconcileVisibleOwnerFromTruth(tile, {
          shouldFxOwner: false,
          swapState,
          reasonDom: 'steady:draw-truth-lost',
        });
      } else if (isSwapEligible && !blockVisibleSwapCommit) {
        owner = this._reconcileVisibleOwnerFromTruth(tile, {
          shouldFxOwner: true,
          swapState,
          reasonFx: 'ownership:drawn-visible',
        });
      } else if (swapState === TILE_SWAP_STATE.FX_SWAPPED) {
        // Active/fed tiles do not release ownership here; only untracked tiles may release.
        this._swapReleaseBlocked += 1;
        releaseBlocked = true;
      }

      rows.push({
        key,
        state: String(this.getTileState(key)),
        visible,
        fed: true,
        wasDrawnThisPass,
        rectValid,
        hasTexture,
        queued,
        inUploadInFlight: Boolean(pending?.inFlight),
        drainEvaluated: Boolean(pending?.drainEvaluated || trace?.drainEvaluated),
        drainAttempted: Boolean(pending?.drainAttempted || trace?.drainAttempted),
        failureReason: String(pending?.failureReason || trace?.failureReason || ''),
        swapState: String(swapState || TILE_SWAP_STATE.DOM_VISIBLE),
        dataTex: String(tileEl.dataset?.tex || '0'),
        owner,
        releaseBlocked,
      });
    });
    this._lastOwnershipRows = rows;
    if (window.__tilefx_dbg) {
      window.__tilefx_dbg.fxEntryPhase = String(this._fxEntryPhase || 'steady');
      window.__tilefx_dbg.bootstrapVisibleCount = Number(this._bootstrapVisibleTileEls?.size || 0);
      window.__tilefx_dbg.bootstrapReadyRatio = Number(bootstrapReadyRatio || 0);
    }
    return rows;
  }

  getVisibleOwnershipRows(limit = 12) {
    const max = Math.max(1, Number(limit || 12));
    const domRows = this._collectVisibleDomOwnershipRows(max);
    if (domRows.length) return domRows.slice(0, max);
    const rows = Array.isArray(this._lastOwnershipRows) ? this._lastOwnershipRows : [];
    if (rows.length) return rows.slice(0, max);
    return (Array.isArray(this.tiles) ? this.tiles : []).slice(0, max).map((tile) => {
      const tileEl = tile?.tileEl || null;
      const key = String(tile?.key || tileEl?.dataset?.fxCardId || '');
      const swapState = this._getSwapState(tileEl);
      const hasTexture = key ? this.hasTexture(key) : false;
      const queued = key ? this._pendingUploads.has(key) : false;
      const pending = key ? this._pendingUploads.get(key) : null;
      const trace = key ? this._drainTraceByKey.get(key) : null;
      return {
        key,
        state: String(this.getTileState(key)),
        visible: true,
        fed: true,
        wasDrawnThisPass: false,
        rectValid: true,
        hasTexture,
        queued,
        inUploadInFlight: Boolean(pending?.inFlight),
        drainEvaluated: Boolean(pending?.drainEvaluated || trace?.drainEvaluated),
        drainAttempted: Boolean(pending?.drainAttempted || trace?.drainAttempted),
        failureReason: String(pending?.failureReason || trace?.failureReason || ''),
        swapState: String(swapState || TILE_SWAP_STATE.DOM_VISIBLE),
        dataTex: String(tileEl?.dataset?.tex || '0'),
        owner: (swapState === TILE_SWAP_STATE.FX_SWAPPED && hasTexture) ? 'FX' : 'DOM',
        releaseBlocked: false,
      };
    });
  }

  getUploadLiveState(key = '') {
    const normalizedKey = String(key || '');
    const pending = normalizedKey ? this._pendingUploads.get(normalizedKey) : null;
    const trace = normalizedKey ? this._drainTraceByKey.get(normalizedKey) : null;
    const textureReady = normalizedKey ? this.hasTexture(normalizedKey) : false;
    const state = {
      key: normalizedKey,
      inPendingUploads: Boolean(normalizedKey && this._pendingUploads.has(normalizedKey)),
      inUploadInFlight: Boolean(pending?.inFlight),
      inTextureCache: textureReady,
    };
    if (!textureReady && !state.inPendingUploads) {
      const reason = String(pending?.failureReason || trace?.failureReason || this._lastUploadError || '');
      if (reason) state.failureReason = reason;
    }
    return state;
  }

  _collectVisibleDomOwnershipRows(limit = 12) {
    const max = Math.max(1, Number(limit || 12));
    const rootEl = document.getElementById('mediaGridRoot') || document.querySelector('[data-fx-grid-root="1"]');
    const gridEl = document.getElementById('mediaGrid') || rootEl?.querySelector?.('#mediaGrid');
    if (!rootEl || !gridEl) return [];
    const rootRect = rootEl.getBoundingClientRect();
    const fedEls = new Set((Array.isArray(this.tiles) ? this.tiles : []).map((tile) => tile?.tileEl).filter(Boolean));
    const rows = [];
    const cards = Array.from(gridEl.querySelectorAll('.asset'));
    for (const tileEl of cards) {
      if (!tileEl || !tileEl.isConnected) continue;
      const rect = tileEl.getBoundingClientRect();
      const visible = !(rect.bottom < rootRect.top || rect.top > rootRect.bottom || rect.right < rootRect.left || rect.left > rootRect.right);
      if (!visible) continue;
      const key = String(tileEl.dataset?.assetId || tileEl.dataset?.path || tileEl.dataset?.relative || tileEl.dataset?.sha256 || tileEl.dataset?.fxCardId || '');
      const drawMeta = this._lastDrawByTileEl.get(tileEl) || {};
      const swapState = this._getSwapState(tileEl);
      const rectValid = drawMeta.rectValid === true || (Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0);
      const hasTexture = drawMeta.hasTexture === true || (key ? this.hasTexture(key) : false);
      const wasDrawnThisPass = drawMeta.wasDrawnThisPass === true;
      const queued = key ? this._pendingUploads.has(key) : false;
      const pending = key ? this._pendingUploads.get(key) : null;
      const trace = key ? this._drainTraceByKey.get(key) : null;
      const owner = (swapState === TILE_SWAP_STATE.FX_SWAPPED && hasTexture) ? 'FX' : 'DOM';
      rows.push({
        key,
        state: String(this.getTileState(key)),
        visible: true,
        fed: fedEls.has(tileEl),
        wasDrawnThisPass,
        rectValid,
        hasTexture,
        queued,
        inUploadInFlight: Boolean(pending?.inFlight),
        drainEvaluated: Boolean(pending?.drainEvaluated || trace?.drainEvaluated),
        drainAttempted: Boolean(pending?.drainAttempted || trace?.drainAttempted),
        failureReason: String(pending?.failureReason || trace?.failureReason || ''),
        swapState: String(swapState || TILE_SWAP_STATE.DOM_VISIBLE),
        dataTex: String(tileEl.dataset?.tex || '0'),
        owner,
        releaseBlocked: false,
      });
      if (rows.length >= max) break;
    }
    return rows;
  }

  _renderDebugRects(debugRects = []) {
    if (!this.debugRectsEnabled) return;
    const layer = this._ensureDebugRectLayer();
    if (!layer) return;
    const rects = Array.isArray(debugRects) ? debugRects : [];
    layer.style.display = rects.length ? 'block' : 'none';
    while (this._debugRectPool.length < rects.length) {
      const node = document.createElement('div');
      Object.assign(node.style, {
        position: 'fixed',
        boxSizing: 'border-box',
        border: '1px solid rgba(84, 214, 255, 0.95)',
        boxShadow: 'inset 0 0 0 1px rgba(10, 20, 40, 0.8)',
        pointerEvents: 'none',
      });
      this._debugRectPool.push(node);
      layer.appendChild(node);
    }
    this._debugRectPool.forEach((node, idx) => {
      const r = rects[idx];
      if (!r) {
        node.style.display = 'none';
        return;
      }
      node.style.display = 'block';
      node.style.left = `${r.left}px`;
      node.style.top = `${r.top}px`;
      node.style.width = `${Math.max(1, r.width)}px`;
      node.style.height = `${Math.max(1, r.height)}px`;
      const measured = node.getBoundingClientRect();
      const mismatch = Math.abs(Number(measured.left || 0) - Number(r.left || 0)) + Math.abs(Number(measured.top || 0) - Number(r.top || 0));
      if (mismatch > 2) {
        const key = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
        if (!this._debugRectMismatchLogged.has(key)) {
          this._debugRectMismatchLogged.add(key);
          console.warn('[tilefx] rect mismatch', { mismatch, expected: r, measured: { left: measured.left, top: measured.top, width: measured.width, height: measured.height } });
        }
      }
    });
  }

  _restoreUntrackedSwaps(activeTileEls = new Set(), now = performance.now(), visibleTileEls = new Set(), nearVisibleTileEls = new Set(), protectedTileEls = new Set()) {
    if (!this._swappedTileRefs.size) return;
    const active = activeTileEls instanceof Set ? activeTileEls : new Set();
    const visible = visibleTileEls instanceof Set ? visibleTileEls : new Set();
    const nearVisible = nearVisibleTileEls instanceof Set ? nearVisibleTileEls : new Set();
    const protectedTiles = protectedTileEls instanceof Set ? protectedTileEls : new Set();
    if (this.isScrolling) return;
    const idleFor = Math.max(0, now - Number(this._lastScrollAt || 0));
    for (const [tileEl, tile] of Array.from(this._swappedTileRefs.entries())) {
      if (!tileEl || !tileEl.isConnected) {
        this._swappedTileRefs.delete(tileEl);
        continue;
      }
      if (active.has(tileEl)) {
        if (visible.has(tileEl)) {
          this._swapReleaseBlocked += 1;
          this._visibleSwapReleaseBlocked += 1;
        }
        this._swapSeenFrameByTile.set(tileEl, { frame: this._frame, t: now });
        continue;
      }
      const seen = this._swapSeenFrameByTile.get(tileEl) || { frame: this._frame, t: now };
      const frameGap = Math.max(0, this._frame - Number(seen.frame || 0));
      const msGap = Math.max(0, now - Number(seen.t || now));
      if (visible.has(tileEl)) {
        this._swapReleaseBlocked += 1;
        this._visibleSwapReleaseBlocked += 1;
        continue;
      }
      if (nearVisible.has(tileEl)) {
        const nearVisibleHold = idleFor < this._swapReleaseNearVisibleIdleMs
          || frameGap < this._swapReleaseNearVisibleDelayFrames
          || msGap < this._swapReleaseNearVisibleDelayMs
          || !this._canReleaseSwap(tileEl, now);
        if (nearVisibleHold) {
          this._swapReleaseBlocked += 1;
          this._visibleSwapReleaseBlocked += 1;
          continue;
        }
      }
      if (this.mode === 'fx' && this._fxEntryPhase !== 'steady' && protectedTiles.has(tileEl)) {
        this._swapReleaseBlocked += 1;
        this._visibleSwapReleaseBlocked += 1;
        continue;
      }
      if (frameGap < this._swapReleaseDelayFrames && msGap < this._swapReleaseDelayMs) continue;
      if (idleFor < this._swapReleaseIdleMs || !this._canReleaseSwap(tileEl, now)) {
        this._swapReleaseBlocked += 1;
        continue;
      }
      this._swapReleaseAllowed += 1;
      this.applyDomSwap(tile, false, 'restore:untracked');
      this._swapSeenFrameByTile.delete(tileEl);
    }
  }

  _recordUploadReject(reason = 'unknown') {
    const key = String(reason || 'unknown');
    const table = this._uploadReject;
    if (!table) return;
    if (!(key in table)) table.unknown = Number(table.unknown || 0) + 1;
    else table[key] = Number(table[key] || 0) + 1;
    if (window.__tilefx_dbg) {
      window.__tilefx_dbg.uploadReject = { ...table };
    }
  }

  _resolveTileSource(tile) {
    const img = tile?.thumbEl || null;
    const kind = String(tile?.thumbKind || '').toLowerCase();
    const thumbSrc = String(tile?.thumbSrc || '').trim();
    if (img) {
      const thumbUrl = String(img.dataset?.thumbUrl || '').trim();
      const imgUrl = String(thumbUrl || img.currentSrc || img.getAttribute('src') || '').trim();
      if (imgUrl) return { kind: 'img', source: img, url: imgUrl };
      if (thumbSrc) return { kind: kind || 'url', source: null, url: thumbSrc };
      return { kind: 'img', source: img, url: '' };
    }
    if (!thumbSrc) return { kind: 'none', source: null, url: '' };
    if (kind === 'cssbg') return { kind: 'cssbg', source: null, url: thumbSrc };
    if (kind === 'videoposter' || kind === 'poster') return { kind: 'poster', source: null, url: thumbSrc };
    return { kind: 'url', source: null, url: thumbSrc };
  }

  async _prepareImageForUpload(source) {
    if (!source) throw new Error('SOURCE_MISSING');
    if (source instanceof HTMLImageElement) {
      if (!source.complete) {
        await new Promise((resolve) => {
          const done = () => resolve();
          source.addEventListener('load', done, { once: true, passive: true });
          source.addEventListener('error', done, { once: true, passive: true });
        });
      }
      const srcKey = String(source.currentSrc || source.getAttribute('src') || '');
      if (srcKey && this.decodedSrcSet.has(srcKey)) {
        const w = Number(source.naturalWidth || 0);
        const h = Number(source.naturalHeight || 0);
        if (w <= 0 || h <= 0) throw new Error('ZERO_SIZE');
        return source;
      }
      if (typeof source.decode === 'function') {
        try { await source.decode(); } catch {}
      }
      const w = Number(source.naturalWidth || 0);
      const h = Number(source.naturalHeight || 0);
      if (w <= 0 || h <= 0) throw new Error('ZERO_SIZE');
      if (srcKey) this.decodedSrcSet.add(srcKey);
      return source;
    }
    throw new Error('UNSUPPORTED_SOURCE');
  }

  _queueUrlImage(url) {
    return new Promise((resolve, reject) => {
      let abs = '';
      try {
        abs = new URL(url, window.location.href).toString();
      } catch {
        reject(new Error('BAD_URL'));
        return;
      }
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const prepared = await this._prepareImageForUpload(img);
          resolve(prepared);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('URL_LOAD_FAIL'));
      img.src = abs;
    });
  }

  _queueTileImageUpload(tile, key) {
    if (!key) return;
    this._uploadAttempt += 1;
    const visibleCount = Math.max(1, Number(this.tiles?.length || 0));
    const maxPending = Math.max(24, visibleCount * 2);
    if (this._pendingUploads.size >= maxPending) {
      if (window.__tilefx_dbg) {
        window.__tilefx_dbg.pendingCap = maxPending;
        window.__tilefx_dbg.pendingClamped = Number(window.__tilefx_dbg.pendingClamped || 0) + 1;
      }
      return;
    }
    if (this.textureCache?.has?.(key)) return;
    if (this._pendingUploads.has(key)) return;
    this._setTileState(key, TILE_STATE.REQUESTED);
    const resolved = this._resolveTileSource(tile);
    const pending = {
      kind: resolved.kind,
      ready: false,
      failed: false,
      inFlight: true,
      drainEvaluated: false,
      drainAttempted: false,
      failureReason: '',
      source: null,
      lastError: '',
    };
    this._pendingUploads.set(key, pending);
    this._drainTraceByKey.set(key, {
      drainEvaluated: false,
      drainAttempted: false,
      failureReason: '',
    });
    this._uploadsQueued += 1;
    if (window.__tilefx_dbg) window.__tilefx_dbg.lastVisiblePipeline = { key, stage: 'queued', kind: resolved.kind };

    if (resolved.kind === 'none') {
      this._srcMissing += 1;
      pending.failed = true;
      pending.inFlight = false;
      pending.failureReason = 'NO_SOURCE';
      this._drainTraceByKey.set(key, {
        drainEvaluated: true,
        drainAttempted: false,
        failureReason: 'NO_SOURCE',
      });
      pending.lastError = 'NO_SOURCE';
      this._lastUploadError = pending.lastError;
      if (window.__tilefx_dbg) window.__tilefx_dbg.lastFailReason = this._lastUploadError;
      this._recordUploadReject('unknown');
      this._setTileState(key, TILE_STATE.DOM_ONLY);
      return;
    }

    if (resolved.kind === 'img') {
      const imgEl = resolved.source;
      const canUseElement = !!(imgEl && imgEl.complete && Number(imgEl.naturalWidth || 0) > 0);
      if (!canUseElement) this._pendingWaitLoad += 1;
      const prepPromise = canUseElement
        ? this._prepareImageForUpload(imgEl)
        : (resolved.url
          ? this._queueUrlImage(resolved.url).catch(() => this._prepareImageForUpload(imgEl))
          : this._prepareImageForUpload(imgEl));
      prepPromise
        .then((prepared) => {
          pending.source = prepared;
          pending.ready = true;
          this._pendingReady += 1;
          this._setTileState(key, TILE_STATE.UPLOADING);
          if (window.__tilefx_dbg) window.__tilefx_dbg.lastVisiblePipeline = { key, stage: 'source_ready', kind: resolved.kind };
        })
        .catch((error) => {
          pending.failed = true;
          pending.inFlight = false;
          pending.failureReason = String(error?.message || 'IMG_PREP_FAIL');
          this._drainTraceByKey.set(key, {
            drainEvaluated: true,
            drainAttempted: false,
            failureReason: pending.failureReason,
          });
          pending.lastError = String(error?.message || 'IMG_PREP_FAIL');
          this._lastUploadError = pending.lastError;
          if (window.__tilefx_dbg) window.__tilefx_dbg.lastFailReason = this._lastUploadError;
          if (pending.lastError.includes('ZERO_SIZE')) this._recordUploadReject('zeroSize');
          else this._recordUploadReject('notReady');
          this._setTileState(key, TILE_STATE.DOM_ONLY);
        });
      return;
    }

    this._queueUrlImage(resolved.url)
      .then((prepared) => {
        pending.source = prepared;
        pending.ready = true;
        this._pendingReady += 1;
        this._setTileState(key, TILE_STATE.UPLOADING);
      })
      .catch((error) => {
        pending.failed = true;
        pending.inFlight = false;
        pending.failureReason = String(error?.message || 'URL_PREP_FAIL');
        this._drainTraceByKey.set(key, {
          drainEvaluated: true,
          drainAttempted: false,
          failureReason: pending.failureReason,
        });
        pending.lastError = String(error?.message || 'URL_PREP_FAIL');
        this._lastUploadError = pending.lastError;
        if (window.__tilefx_dbg) window.__tilefx_dbg.lastFailReason = this._lastUploadError;
        if (pending.lastError.includes('ZERO_SIZE')) this._recordUploadReject('zeroSize');
        else this._recordUploadReject('unknown');
        this._setTileState(key, TILE_STATE.DOM_ONLY);
      });
  }

  _settlePendingUploadsAsFailed(reason = 'UPLOAD_DRAIN_UNAVAILABLE') {
    const message = String(reason || 'UPLOAD_DRAIN_UNAVAILABLE');
    for (const [key, pending] of Array.from(this._pendingUploads.entries())) {
      if (!key || !pending) continue;
      pending.failed = true;
      pending.inFlight = false;
      pending.failureReason = message;
      this._drainTraceByKey.set(key, {
        drainEvaluated: true,
        drainAttempted: false,
        failureReason: message,
      });
      pending.lastError = message;
      this._lastUploadError = message;
      this._uploadsFailed += 1;
      this._recordUploadReject('unknown');
      this._setTileState(key, TILE_STATE.DOM_ONLY);
      this._pendingUploads.delete(key);
    }
    if (window.__tilefx_dbg) window.__tilefx_dbg.lastFailReason = message;
  }

  _drainPendingUploads(now) {
    if (this._pendingUploads.size <= 0) return;
    const glUnavailable = !this.gl || this.failed;
    if (glUnavailable && this.enabled && this.mode === 'fx') {
      const failureReason = this.failed
        ? (this.failReason || 'WEBGL_UNAVAILABLE')
        : 'WEBGL_UNAVAILABLE';
      this._settlePendingUploadsAsFailed(failureReason);
      return;
    }
    if (!this.textureCache && this.gl) {
      this.textureCache = new TextureCacheLRU(this.gl, {
        maxTextures: Number(new URLSearchParams(window.location.search).get('fxtilecache') || 96),
        maxBytes: Number(new URLSearchParams(window.location.search).get('fxtilecachemb') || 128) * 1024 * 1024,
        maxTexEdge: this.maxTexEdge,
      });
    }
    if (!this.textureCache) return;
    if (!this.enabled || this.mode !== 'fx') return;
    if (document.visibilityState !== 'visible') return;
    const cacheBudget = Math.max(1, Number(this.textureCache?.maxBytes || 0));
    const cachePressure = (Number(this.textureCache?.totalBytes || 0) / cacheBudget) >= 0.9;
    if (this.isScrolling && cachePressure) return;
    const readyCount = Number(this._stateCounts().ready || 0);
    const visibleTarget = Number(this.tiles?.length || 0) + this.idleUploadOverscan;
    const maxPending = Math.max(24, Number(this.tiles?.length || 1) * 2);
    const vp = getViewportMetrics();
    let visibleMissingTextures = 0;
    const tiles = Array.isArray(this.tiles) ? this.tiles : [];
    for (const tile of tiles) {
      const key = String(tile?.key || '');
      if (!key || this.textureCache.has(key)) continue;
      const rect = tile?.rect || tile?.tileEl?.getBoundingClientRect?.() || null;
      if (!rect) continue;
      const left = Number(rect.left || 0) - Number(vp.offsetX || 0);
      const top = Number(rect.top || 0) - Number(vp.offsetY || 0);
      const right = left + Number(rect.width || 0);
      const bottom = top + Number(rect.height || 0);
      const visible = !(right <= 0 || bottom <= 0 || left >= Number(vp.width || 0) || top >= Number(vp.height || 0));
      if (visible) visibleMissingTextures += 1;
    }
    if (window.__tilefx_dbg) {
      window.__tilefx_dbg.pendingCap = maxPending;
      window.__tilefx_dbg.visibleMissingTextures = visibleMissingTextures;
    }
    if (!this.isScrolling && readyCount >= visibleTarget && visibleMissingTextures <= 0) return;
    if (now < this.backpressureUntil) return;
    if (this._uploadsWindow.length >= this.uploadBudgetPerSecond) return;

    let uploadsThisFrame = 0;
    const visiblePendingKeys = [];
    const otherPendingKeys = [];
    const tileByKey = new Map();
    for (const row of tiles) {
      const rowKey = String(row?.key || '');
      if (rowKey) tileByKey.set(rowKey, row);
    }
    for (const [key, pending] of Array.from(this._pendingUploads.entries())) {
      if (!key || !pending) continue;
      const tile = tileByKey.get(key) || null;
      if (!tile) {
        otherPendingKeys.push([key, pending]);
        continue;
      }
      const rect = tile?.rect || tile?.tileEl?.getBoundingClientRect?.() || null;
      if (!rect) {
        otherPendingKeys.push([key, pending]);
        continue;
      }
      const left = Number(rect.left || 0) - Number(vp.offsetX || 0);
      const top = Number(rect.top || 0) - Number(vp.offsetY || 0);
      const right = left + Number(rect.width || 0);
      const bottom = top + Number(rect.height || 0);
      const visible = !(right <= 0 || bottom <= 0 || left >= Number(vp.width || 0) || top >= Number(vp.height || 0));
      if (visible) visiblePendingKeys.push([key, pending]);
      else otherPendingKeys.push([key, pending]);
    }
    const pendingWork = visiblePendingKeys.concat(otherPendingKeys);
    for (const [key, pending] of pendingWork) {
      if (uploadsThisFrame >= this.maxUploadsPerFrame) break;
      pending.drainEvaluated = true;
      this._drainTraceByKey.set(key, {
        drainEvaluated: true,
        drainAttempted: Boolean(pending.drainAttempted),
        failureReason: String(pending.failureReason || ''),
      });
      if (!pending || pending.failed) {
        this._pendingUploads.delete(key);
        continue;
      }
      if (!pending.ready || !pending.source) continue;
      if (this.textureCache.has(key)) {
        this._pendingUploads.delete(key);
        continue;
      }
      let uploadSource = pending.source;
      try {
        if (typeof createImageBitmap === 'function' && uploadSource instanceof HTMLCanvasElement) {
          uploadSource = createImageBitmap(uploadSource);
        }
      } catch {}
      uploadsThisFrame += 1;
      this._uploadsAttempted += 1;
      pending.drainAttempted = true;
      this._drainTraceByKey.set(key, {
        drainEvaluated: true,
        drainAttempted: true,
        failureReason: String(pending.failureReason || ''),
      });
      Promise.resolve(uploadSource).then((resolvedSource) => {
        if (!resolvedSource) {
          this._lastUploadError = 'UPLOAD_SOURCE_MISSING';
          if (window.__tilefx_dbg) window.__tilefx_dbg.lastFailReason = this._lastUploadError;
          this._recordUploadReject('unknown');
          this._uploadsFailed += 1;
          pending.inFlight = false;
          pending.failureReason = this._lastUploadError;
          this._drainTraceByKey.set(key, {
            drainEvaluated: true,
            drainAttempted: true,
            failureReason: this._lastUploadError,
          });
          this._pendingUploads.delete(key);
          this._setTileState(key, TILE_STATE.DOM_ONLY);
          return;
        }
        let up = this.textureCache.upsertFromImage(key, resolvedSource, now);
        if (!up.uploaded && String(up.reason || '').includes('TEX_IMAGE') && pending.source && pending.source !== resolvedSource) {
          up = this.textureCache.upsertFromImage(key, pending.source, now);
        }
        if (up.uploaded) {
          if (window.__tilefx_dbg) window.__tilefx_dbg.lastVisiblePipeline = { key, stage: 'texture_uploaded' };
          this._uploadsWindow.push(now);
          this._texturesUploaded += 1;
          this._uploadsSucceeded += 1;
          this._setTileState(key, TILE_STATE.UPLOADING);
          pending.inFlight = false;
          pending.failureReason = '';
          this._drainTraceByKey.set(key, {
            drainEvaluated: true,
            drainAttempted: true,
            failureReason: '',
          });
          this._pendingUploads.delete(key);
        } else {
          this._lastUploadError = String(up.reason || 'UPLOAD_REJECTED');
          if (window.__tilefx_dbg) window.__tilefx_dbg.lastFailReason = this._lastUploadError;
          if (this._lastUploadError.includes('TEX_IMAGE')) this._recordUploadReject('tainted');
          else if (this._lastUploadError.includes('MISSING') || this._lastUploadError.includes('ZERO')) this._recordUploadReject('zeroSize');
          else this._recordUploadReject('unknown');
          this._uploadsFailed += 1;
          pending.inFlight = false;
          pending.failureReason = this._lastUploadError;
          this._drainTraceByKey.set(key, {
            drainEvaluated: true,
            drainAttempted: true,
            failureReason: this._lastUploadError,
          });
          this._pendingUploads.delete(key);
          this._setTileState(key, TILE_STATE.DOM_ONLY);
        }
        try { resolvedSource.close?.(); } catch {}
      }).catch((error) => {
        const msg = String(error?.message || 'UPLOAD_SOURCE_FAIL');
        this._lastUploadError = msg;
        if (window.__tilefx_dbg) window.__tilefx_dbg.lastFailReason = this._lastUploadError;
        if (msg.toLowerCase().includes('security') || msg.toLowerCase().includes('taint')) this._recordUploadReject('tainted');
        else this._recordUploadReject('unknown');
        pending.inFlight = false;
        pending.failureReason = msg;
        this._drainTraceByKey.set(key, {
          drainEvaluated: true,
          drainAttempted: true,
          failureReason: msg,
        });
        this._pendingUploads.delete(key);
        this._setTileState(key, TILE_STATE.DOM_ONLY);
      });
    }
  }


  _resize() {
    if (!this.canvas) return;
    const sizes = resizeAllFxCanvases({ dprCap: this.dprCap, tilefxRenderer: this });
    const tileSize = sizes.tilefxSize;
    if (!tileSize) return;
    const w = Math.max(1, this.canvas.width || tileSize.pxW);
    const h = Math.max(1, this.canvas.height || tileSize.pxH);
    if (window.__tilefx_dbg) {
      window.__tilefx_dbg.dpr = tileSize.dpr;
      window.__tilefx_dbg.dprCap = this.dprCap;
      window.__tilefx_dbg.backpressureUntil = this.backpressureUntil;
    }
    return { dpr: tileSize.dpr, width: w, height: h };
  }

  setResolution(width, height, dpr = 1) {
    const gl = this.gl;
    if (!gl || !this.canvas) return;
    const w = Math.max(1, Math.round(Number(width || this.canvas.width || 1)));
    const h = Math.max(1, Math.round(Number(height || this.canvas.height || 1)));
    gl.viewport(0, 0, w, h);
    if (this.program && this.u?.u_resolution) {
      gl.useProgram(this.program);
      gl.uniform2f(this.u.u_resolution, w, h);
    }
    if (window.__tilefx_dbg) window.__tilefx_dbg.dpr = Number(dpr || window.devicePixelRatio || 1);
  }

  _render(now) {
    if (this.failed || !this.gl || this.mode !== 'fx' || !this.enabled) return;
    this._refreshTileList(now);
    const dims = this._resize();
    if (!dims) return;
    const gl = this.gl;
    const dpr = dims.dpr;
    const vp = getViewportMetrics();
    gl.viewport(0, 0, dims.width, dims.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    bindQuad(gl, this.program, this.quad);
    gl.uniform2f(this.u.u_resolution, dims.width, dims.height);
    gl.uniform1f(this.u.u_time, now * 0.001);

    let drawCalls = 0;
    this._visibleSwapReleaseBlocked = 0;
    this._offscreenSwapReleaseAllowed = 0;
    const tiles = this.tiles || [];
    const visibleKeySet = new Set();
    const debugRects = [];
    const activeTileEls = new Set();
    const visibleTileEls = new Set();
    const nearVisibleTileEls = new Set();
    const drawResults = new Map();
    tiles.forEach((tile) => {
      const k = String(tile?.key || '');
      if (k) visibleKeySet.add(k);
      if (tile?.tileEl) activeTileEls.add(tile.tileEl);
    });
    this.textureCache?.setVisibleKeys?.(visibleKeySet);
    tiles.forEach((tile) => {
      const rect = tile?.rect;
      if (!rect) return;
      const localRect = this._getTileRectInVisualViewport(rect, vp);
      const localLeft = localRect.left;
      const localTop = localRect.top;
      const localRight = localRect.right;
      const localBottom = localRect.bottom;
      const canvasRect = this._cssRectToCanvasRect(localRect, dpr);
      const x1 = canvasRect.x1;
      const y1 = canvasRect.y1;
      const x2 = canvasRect.x2;
      const y2 = canvasRect.y2;
      const tileEl = tile?.tileEl || null;
      const visible = !(localRight <= 0 || localBottom <= 0 || localLeft >= vp.width || localTop >= vp.height);
      const nearVisible = !(localRight <= -140 || localBottom <= -140 || localLeft >= (vp.width + 140) || localTop >= (vp.height + 140));
      const rectValid = Number.isFinite(x1 + y1 + x2 + y2) && x2 > x1 && y2 > y1;
      const key = String(tile?.key || '');
      if (tileEl) {
        drawResults.set(tileEl, {
          tile,
          tileEl,
          key,
          visible,
          rectValid,
          hasTexture: false,
          wasDrawnThisPass: false,
        });
      }
      if (key && !this.textureCache?.has?.(key)) {
        // Fed tiles are upload-first: queue texture prep even if visibility/rect state is temporarily stale.
        this._queueTileImageUpload(tile, key);
      }
      const entry = key ? this.textureCache?.get?.(key, now) : null;
      if (tileEl) {
        if (nearVisible) nearVisibleTileEls.add(tileEl);
        if (visible) visibleTileEls.add(tileEl);
        if (drawResults.has(tileEl) && entry?.texture) drawResults.get(tileEl).hasTexture = true;
      }
      if (typeof tile?.onTextureReady === 'function') {
        try {
          tile.onTextureReady(Boolean(entry?.texture));
        } catch {}
      }
      if (!rectValid) return;
      if (!visible) return;
      if (this.debugRectsEnabled) debugRects.push({ left: localLeft, top: localTop, width: localRight - localLeft, height: localBottom - localTop });

      const color = this._typeColor(tile.type);
      gl.uniform4f(this.u.u_rect, x1, y1, x2, y2);
      gl.uniform3f(this.u.u_type_color, color[0], color[1], color[2]);
      gl.uniform1f(this.u.u_selected, tile.selected ? 1 : 0);

      let hasTex = 0;
      const priorState = key ? (this.tileStateByKey.get(key) || TILE_STATE.DOM_ONLY) : TILE_STATE.DOM_ONLY;
      const swapState = this._getSwapState(tileEl);
      const idleFor = Math.max(0, now - Number(this._lastScrollAt || 0));
      if (tileEl) this._swapSeenFrameByTile.set(tileEl, { frame: this._frame, t: now });
      if (key && !this.textureCache?.has?.(key)) {
        if (priorState === TILE_STATE.READY) {
          this._setTileState(key, TILE_STATE.EVICTED);
          if (swapState === TILE_SWAP_STATE.FX_SWAPPED) {
            const canReleaseByIdle = idleFor >= this._swapReleaseIdleMs;
            const canRelease = canReleaseByIdle && this._canReleaseVisibleSwap({ tileEl, visible }, now);
            if (canRelease) {
              this.applyDomSwap(tile, false, 'evicted');
              if (window.__tilefx_dbg) window.__tilefx_dbg.swapClearCalls = Number(window.__tilefx_dbg.swapClearCalls || 0) + 1;
              this._swapReleaseAllowed += 1;
              this._offscreenSwapReleaseAllowed += 1;
            }
          }
        }
      }
      let shouldSwapSet = false;
      if (entry?.texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        gl.uniform1i(this.u.u_tex, 0);
        gl.uniform2f(this.u.u_tex_size, Number(entry.width || 1), Number(entry.height || 1));
        hasTex = 1;
        this._setTileState(key, TILE_STATE.READY);
        shouldSwapSet = Boolean(tileEl && swapState !== TILE_SWAP_STATE.FX_SWAPPED);
        if (tileEl && drawResults.has(tileEl)) drawResults.get(tileEl).hasTexture = true;
      } else if (tileEl && swapState === TILE_SWAP_STATE.FX_SWAPPED) {
        this._setTileState(key, TILE_STATE.DOM_ONLY);
        if (drawResults.has(tileEl)) drawResults.get(tileEl).releaseBlocked = true;
      }
      if (!hasTex) gl.uniform2f(this.u.u_tex_size, 1, 1);
      gl.uniform1f(this.u.u_has_tex, hasTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (tileEl && drawResults.has(tileEl)) drawResults.get(tileEl).wasDrawnThisPass = true;
      if (shouldSwapSet && tileEl && drawResults.has(tileEl)) {
        drawResults.get(tileEl).isSwapEligible = true;
      }
      drawCalls += 1;
    });

    this._renderDebugRects(debugRects);
    this._lastDrawByTileEl = new WeakMap();
    drawResults.forEach((meta, tileEl) => {
      if (!tileEl || !meta) return;
      this._lastDrawByTileEl.set(tileEl, {
        visible: meta.visible === true,
        rectValid: meta.rectValid === true,
        hasTexture: meta.hasTexture === true,
        wasDrawnThisPass: meta.wasDrawnThisPass === true,
        pipeline: (window.__tilefx_dbg && window.__tilefx_dbg.lastVisiblePipeline && window.__tilefx_dbg.lastVisiblePipeline.key === String(meta.key || ''))
          ? window.__tilefx_dbg.lastVisiblePipeline.stage
          : '',
      });
    });
    this.syncVisibleTileOwnership(tiles, drawResults, now);
    this._restoreUntrackedSwaps(activeTileEls, now, visibleTileEls, nearVisibleTileEls, this._bootstrapVisibleTileEls);
    this._uploadsWindow = this._uploadsWindow.filter((t) => (now - t) <= 1000);
    if (this._uploadsWindow.length > this.uploadBudgetPerSecond) {
      this.backpressureUntil = now + this.uploadPauseMs;
    } else if (this.backpressureUntil && now >= this.backpressureUntil) {
      this.backpressureUntil = 0;
    }
    this._drawCalls = drawCalls;
    if (window.__tilefx_dbg) {
      const stateCounts = this._stateCounts();
      const ownershipRows = Array.isArray(this._lastOwnershipRows) ? this._lastOwnershipRows : [];
      const visibleRows = ownershipRows.filter((row) => row?.visible === true);
      const visibleReady = visibleRows.filter((row) => row.hasTexture === true && row.rectValid === true).length;
      const visibleUploading = Math.max(0, visibleRows.length - visibleReady);
      const visibleDomOnly = visibleRows.filter((row) => row.owner !== 'FX').length;
      const visibleSwapped = visibleRows.filter((row) => row.owner === 'FX').length;
      window.__tilefx_dbg.visibleCount = tiles.length;
      window.__tilefx_dbg.tilesVisible = tiles.length;
      window.__tilefx_dbg.overscanCount = tiles.length;
      window.__tilefx_dbg.uploadsThisSecond = this._uploadsWindow.length;
      window.__tilefx_dbg.texturesUploaded = this._texturesUploaded;
      window.__tilefx_dbg.texturesPending = this._pendingUploads.size;
      window.__tilefx_dbg.uploadAttempt = this._uploadAttempt;
      window.__tilefx_dbg.uploadsQueued = this._uploadsQueued;
      window.__tilefx_dbg.uploadsAttempted = this._uploadsAttempted;
      window.__tilefx_dbg.uploadsSucceeded = this._uploadsSucceeded;
      window.__tilefx_dbg.uploadsFailed = this._uploadsFailed;
      const avgTex = this.textureCache?.averageTextureSize?.() || { width: 0, height: 0 };
      window.__tilefx_dbg.maxTexEdge = Number(this.maxTexEdge || 0);
      window.__tilefx_dbg.avgTexWidth = Number(avgTex.width || 0);
      window.__tilefx_dbg.avgTexHeight = Number(avgTex.height || 0);
      window.__tilefx_dbg.pendingReady = this._pendingReady;
      window.__tilefx_dbg.pendingWaitLoad = this._pendingWaitLoad;
      window.__tilefx_dbg.srcMissing = this._srcMissing;
      window.__tilefx_dbg.uploadOk = this._texturesUploaded;
      window.__tilefx_dbg.uploadFail = Number(this._uploadReject.notReady || 0) + Number(this._uploadReject.zeroSize || 0) + Number(this._uploadReject.tainted || 0) + Number(this._uploadReject.unknown || 0);
      window.__tilefx_dbg.lastUploadError = this._lastUploadError || '';
      window.__tilefx_dbg.lastFailReason = this._lastUploadError || '';
      window.__tilefx_dbg.uploadReject = { ...this._uploadReject };
      window.__tilefx_dbg.texturesInCache = this.textureCache?.map?.size || 0;
      window.__tilefx_dbg.cacheBytes = this.textureCache?.totalBytes || 0;
      window.__tilefx_dbg.cacheBudgetBytes = this.textureCache?.maxBytes || 0;
      const cacheBytes = Number(this.textureCache?.totalBytes || 0);
      const cacheBudgetBytes = Number(this.textureCache?.maxBytes || 0);
      const rawEvictReason = String(this.textureCache?.lastEvictReason || 'none');
      window.__tilefx_dbg.evictReason = (cacheBudgetBytes > 0 && cacheBytes < (cacheBudgetBytes * 0.85)) ? 'none' : rawEvictReason;
      window.__tilefx_dbg.texturesEvicted = this.textureCache?.evictions || 0;
      window.__tilefx_dbg.reuploadsTotal = this.textureCache?.totalReuploads?.() || 0;
      window.__tilefx_dbg.drawCalls = drawCalls;
      window.__tilefx_dbg.tilesDrawn = drawCalls;
      window.__tilefx_dbg.stateCounts = stateCounts;
      window.__tilefx_dbg.viewport = {
        width: Number(vp.width || 0),
        height: Number(vp.height || 0),
        offsetX: Number(vp.offsetX || 0),
        offsetY: Number(vp.offsetY || 0),
        scale: Number(vp.scale || 1),
      };
      window.__tilefx_dbg.readyTiles = stateCounts.ready;
      window.__tilefx_dbg.pendingTiles = stateCounts.requested + stateCounts.uploading;
      window.__tilefx_dbg.visibleReady = visibleReady;
      window.__tilefx_dbg.visibleUploading = visibleUploading;
      window.__tilefx_dbg.visibleDomOnly = visibleDomOnly;
      window.__tilefx_dbg.visibleSwapped = visibleSwapped;
      window.__tilefx_dbg.fxLifecycleStage = this.getFxLifecycleStage();
      window.__tilefx_dbg.swapReleaseBlocked = this._swapReleaseBlocked;
      window.__tilefx_dbg.swapReleaseAllowed = this._swapReleaseAllowed;
      window.__tilefx_dbg.visibleSwapReleaseBlocked = this._visibleSwapReleaseBlocked;
      window.__tilefx_dbg.offscreenSwapReleaseAllowed = this._offscreenSwapReleaseAllowed;
      window.__tilefx_dbg.fedVisibleRatio = Number((Number(tiles.length || 0) > 0 ? (Number(visibleTileEls.size || 0) / Number(tiles.length || 1)) : 1).toFixed(3));
      window.__tilefx_dbg.rafRunning = this.raf > 0;
      window.__tilefx_dbg.scrolling = this.isScrolling;
      window.__tilefx_dbg.scrollIdleMs = this.isScrolling ? 0 : Math.max(0, now - Number(this._lastScrollAt || 0));
      window.__tilefx_dbg.lastFrameMs = this._lastFrameMs;
      window.__tilefx_dbg.backpressureUntil = this.backpressureUntil;
      window.__tilefx_dbg.dprCap = this.dprCap;
    }
  }

  _adaptDprFromFrameMs(frameMs) {
    this.dprCap = 2;
  }

  _start() {
    if (this.raf) return;
    const loop = () => {
      const fxModeActive = typeof document !== 'undefined' && document.body?.classList?.contains('fx-mode');
      if (!this.enabled || this.mode !== 'fx' || !fxModeActive) {
        this.stop();
        return;
      }
      const t0 = performance.now();
      try {
        this._drainPendingUploads(t0);
        this._render(t0);
      } catch (e) {
        this._setFailed(e?.message || 'TILEFX_RENDER_FAILED');
      } finally {
        this._lastFrameMs = performance.now() - t0;
        this._adaptDprFromFrameMs(this._lastFrameMs);
        this._frame += 1;
        if (window.__tilefx_dbg) {
          window.__tilefx_dbg.rafRunning = this.raf > 0;
          if (this.mode !== 'fx' && Number(window.__tilefx_dbg.drawCalls || 0) > 0) {
            console.error('TileFX invariant: drawCalls > 0 while mode != fx');
            this.stop();
            this.clear();
            window.__tilefx_dbg.drawCalls = 0;
          }
        }
        if (this.enabled) this.raf = requestAnimationFrame(loop);
        else this.raf = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.stop();
    if (this._scrollIdleTimer) clearTimeout(this._scrollIdleTimer);
    this._scrollIdleTimer = 0;
    this._pendingUploads.clear();
    this._drainTraceByKey.clear();
    this.textureCache?.destroy();
    this.textureCache = null;
  }
}

export class AssetFX {
  constructor() {
    this.container = null;
    this.overlay = null;
    this.gl = null;
    this.program = null;
    this.quad = null;
    this.tileParamTexture = null;
    this.raf = 0;

    this._maskField = null;
    this._maskTexture = null;
    this._maskAllocated = false;
    this._u = null;
    this.start = performance.now();

    this.boundGrids = new WeakSet();
    this.trackedCards = new Set();
    this.visibleCards = new Set();
    this.nearViewCards = new Set();
    this.lastPlayedAt = new WeakMap();
    this.lastExitedAt = new WeakMap();
    this.cooldownMs = 1000;
    this.maxActiveEffects = 6;
    this.maxPendingDissolves = 60;
    this.minRenderCards = 18;
    this.maxRenderCardsLowTier = 22;
    this.maxRenderCardsHighTier = 30;
    this.maxRenderCardsAdaptive = this.maxRenderCardsLowTier;
    this.maxRenderPixelsLowTier = 1450000;
    this.maxRenderPixelsHighTier = 2400000;
    this.renderPixelsNow = 0;
    this.readyFadeMs = 240;
    this.entryMs = 260;
    this.scrollVelocityEma = 0;
    this.motionDamp = 1;
    this.scrollFast = 0;
    this.selectPulse = 0;
    this.selectionGlowTarget = 0;
    this.fpsEma = 60;
    this.capNow = this.maxRenderCardsAdaptive;
    this._lastFrameAt = 0;
    this._lastScrollAt = 0;
    this._lastScrollY = 0;
    this._frameCounter = 0;
    this.sampleCursor = 0;
    this.samplingFrozen = false;
    this.samplingSettleUntil = 0;
    this.lastSampledCards = [];
    this.stickyRetainedCount = 0;
    this.sweepFilledCount = 0;
    this.entryPendingCount = 0;

    this.activeDissolves = new Set();
    this.pendingDissolves = [];
    this.layoutDirty = true;
    this.cardRectCache = new WeakMap();
    this.readyInViewNotPlayedCount = 0;
    this.renderSampledCount = 0;
    this.renderCandidatesCount = 0;
    this.droppedByCapCount = 0;
    this.prefetchViewportY = 1.5;
    this.stateByKey = new Map();
    this.keyByEl = new WeakMap();
    this._stateGeneration = 0;
    this._debugRenderTick = 0;
    this.evictAfterMs = Math.max(500, Number(new URLSearchParams(window.location.search).get('fxevictms') || STATE_EVICT_AFTER_MS));
    this.maxStateKeys = Math.max(120, Number(new URLSearchParams(window.location.search).get('fxmaxstate') || STATE_MAX_KEYS));
    this.nearViewCardsMax = Math.max(24, Number(new URLSearchParams(window.location.search).get('fxnearmax') || NEAR_VIEW_MAX));
    this.renderableFallbackMs = Math.max(120, Number(new URLSearchParams(window.location.search).get('fxfallbackms') || 680));

    this.prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
      : false;
    this.liteFx = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('fx') === 'lite'
      : false;
    this.fxDebug = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('fxdebug') === '1'
      : false;
    this.noVirtualization = typeof window !== 'undefined'
      ? (() => {
          const params = new URLSearchParams(window.location.search);
          return params.get('novirt') === '1' || params.get('keep') === '1';
        })()
      : false;
    this.useIntersectionObserver = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('fxio') !== '0'
      : true;
    const dissolveParam = typeof window !== 'undefined'
      ? String(new URLSearchParams(window.location.search).get('fxdissolve') || '').toLowerCase()
      : '';
    this.dissolveMode = (dissolveParam === '1' || dissolveParam === 'tile') ? 'tile' : 'scene';

    this.visibilityObserver = null;
    this.scrollReplayScheduled = false;
    this.fallbackSweepEnabled = !('IntersectionObserver' in window);

    this.pointerState = new Map();
    this._attachedGridRoot = null;
    this._attachedCardSelector = '.asset';
    this._boundScheduleReplay = (event) => {
      this._recordScrollMotion(event);
      this._markLayoutDirty('grid:scroll');
    };
    this._boundWindowResize = () => {
      resizeAllFxCanvases({ dprCap: 2, assetfxRenderer: this });
      this._markLayoutDirty('window:resize');
    };
    this._boundContainerResize = () => this._markLayoutDirty('container:resize');
    this._tapGuardCleanup = null;
    this._resizeObserver = null;
    this.sampleHoldMs = SAMPLE_STICK_MS;
    this.sampledCardsUntil = new WeakMap();
    this.debugOverlay = null;
    this.debugDomLayer = null;
    this.debugBannerEl = null;
    this._debugNoRectsStreak = 0;
    this._debugLastFrameTs = 0;
    this._debugLastReason = '';
    this._domDiscoverCap = 220;
    this._boundVisualViewportChange = () => {
      resizeAllFxCanvases({ dprCap: 2, assetfxRenderer: this });
      this._markLayoutDirty('visualViewport:change');
    };
    this._boundInvalidationRoot = null;
    this._invalidationsBound = false;

    this._ensureSharedStyles();
    if (typeof window !== 'undefined') window.__assetfx_instance = this;
  }



  _recordScrollMotion(event) {
    const root = this._attachedGridRoot || this.container;
    if (!root) return;
    const now = performance.now();
    const y = Number(root.scrollTop || 0);
    if (this._lastScrollAt > 0) {
      const dt = Math.max(1, now - this._lastScrollAt);
      const dy = Math.abs(y - this._lastScrollY);
      const v = dy / dt; // px/ms
      this.scrollVelocityEma = (this.scrollVelocityEma * 0.82) + (v * 0.18);
      this.samplingSettleUntil = now + SETTLE_DELAY_MS;
    }
    this._lastScrollAt = now;
    this._lastScrollY = y;
  }

  _updateMotionDamp() {
    const now = performance.now();
    const age = this._lastScrollAt > 0 ? (now - this._lastScrollAt) : 1000;
    const vDecayed = this.scrollVelocityEma * Math.exp(-age / 220);
    this.motionDamp = 1.0 - smoothstep(0.2, 1.2, vDecayed);
    this.scrollFast = Math.max(0, Math.min(1, vDecayed / FAST_SCROLL_THRESHOLD));
  }

  _updateSelectionGlow(nowPerf, selectedCount) {
    this.selectionGlowTarget = selectedCount > 0 ? 1 : 0;
    const easeMs = this.selectionGlowTarget > this.selectPulse ? 220 : 320;
    const dt = this._lastFrameAt > 0 ? Math.max(0, nowPerf - this._lastFrameAt) : 16;
    const t = Math.min(1, dt / easeMs);
    this.selectPulse += (this.selectionGlowTarget - this.selectPulse) * t;
  }

  _getKeyEl(el) {
    if (!el) return null;
    if (el.classList?.contains('asset')) return el;
    return el.closest?.('.asset') || el;
  }

  _getCardKey(cardEl) {
    const keyEl = this._getKeyEl(cardEl);
    if (!keyEl) return '';
    const existing = this.keyByEl.get(keyEl) || this.keyByEl.get(cardEl);
    if (existing) return existing;
    const key = String(
      keyEl.dataset.assetId
      || keyEl.dataset.sha256
      || keyEl.dataset.selectKey
      || keyEl.dataset.relative
      || `assetfx-key-${++this._stateGeneration}`
    );
    this.keyByEl.set(keyEl, key);
    if (cardEl && cardEl !== keyEl) this.keyByEl.set(cardEl, key);
    const mediaEl = keyEl.__fxThumb || keyEl.querySelector('img.asset-thumb,video,audio');
    if (mediaEl) this.keyByEl.set(mediaEl, key);
    return key;
  }

  _getCardState(cardEl, create = true) {
    const keyEl = this._getKeyEl(cardEl);
    const key = this._getCardKey(keyEl);
    if (!key) return null;
    let state = this.stateByKey.get(key);
    if (!state && create) {
      state = {
        key,
        enterAt: 0,
        readyAt: 0,
        lastSeenAt: 0,
        lastRect: null,
        inView: false,
        nearView: false,
        thumbLoaded: false,
        renderable: false,
        sampledUntil: 0,
        entryPlayed: false,
        exitPlayedAt: 0,
        generation: 1,
        selected: false,
        pending: false,
        active: false,
        thumbBlockedAt: 0,
        el: keyEl,
      };
      this.stateByKey.set(key, state);
    }
    if (state && keyEl && state.el !== keyEl) {
      state.el = keyEl;
      state.generation = Number(state.generation || 0) + 1;
    }
    if (cardEl && cardEl !== keyEl) this.keyByEl.set(cardEl, key);
    return state;
  }

  _bindInvalidations() {
    const gridRoot = this._attachedGridRoot;
    if (!gridRoot) return;
    if (this._invalidationsBound && this._boundInvalidationRoot === gridRoot) return;
    if (this._invalidationsBound) this._unbindInvalidations();
    gridRoot.addEventListener('scroll', this._boundScheduleReplay, { passive: true });
    gridRoot.addEventListener('touchmove', this._boundScheduleReplay, { passive: true });
    window.addEventListener('resize', this._boundWindowResize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._boundVisualViewportChange, { passive: true });
      window.visualViewport.addEventListener('scroll', this._boundVisualViewportChange, { passive: true });
    }
    this._boundInvalidationRoot = gridRoot;
    this._invalidationsBound = true;
  }

  _unbindInvalidations() {
    const gridRoot = this._boundInvalidationRoot;
    if (!gridRoot) return;
    gridRoot.removeEventListener('scroll', this._boundScheduleReplay);
    gridRoot.removeEventListener('touchmove', this._boundScheduleReplay);
    window.removeEventListener('resize', this._boundWindowResize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._boundVisualViewportChange);
      window.visualViewport.removeEventListener('scroll', this._boundVisualViewportChange);
    }
    this._boundInvalidationRoot = null;
    this._invalidationsBound = false;
  }

  _evictState(nowPerf = performance.now()) {
    const removable = [];
    this.stateByKey.forEach((state, key) => {
      const age = Math.max(0, nowPerf - Number(state.lastSeenAt || 0));
      const pinned = state.selected || state.pending || state.active;
      if (!state.nearView && !pinned && age > this.evictAfterMs) {
        removable.push([key, age]);
      }
    });
    removable.forEach(([key]) => this.stateByKey.delete(key));

    if (this.stateByKey.size <= this.maxStateKeys) return;
    const candidates = [];
    this.stateByKey.forEach((state, key) => {
      const pinned = state.selected || state.pending || state.active || state.inView || state.nearView;
      if (pinned) return;
      candidates.push([key, Number(state.lastSeenAt || 0)]);
    });
    candidates.sort((a, b) => a[1] - b[1]);
    while (this.stateByKey.size > this.maxStateKeys && candidates.length) {
      const [key] = candidates.shift();
      this.stateByKey.delete(key);
    }
  }

  _capNearViewCards() {
    if (this.nearViewCards.size <= this.nearViewCardsMax) return;
    const candidates = [];
    this.nearViewCards.forEach((card) => {
      const state = this._getCardState(card, false);
      const seen = Number(state?.lastSeenAt || 0);
      candidates.push([card, seen]);
    });
    candidates.sort((a, b) => a[1] - b[1]);
    while (this.nearViewCards.size > this.nearViewCardsMax && candidates.length) {
      const [card] = candidates.shift();
      if (card?.dataset?.fxInView === '1') continue;
      this.nearViewCards.delete(card);
    }
  }

  _iterCards(collection) {
    if (!collection) return [];
    if (collection instanceof Map) return collection.values();
    if (typeof collection.values === 'function') return collection.values();
    return collection;
  }

  _discoverCardsFromDom(limit = this._domDiscoverCap) {
    const root = this._attachedGridRoot || this.container;
    if (!root || !this._attachedCardSelector) return;
    const cards = root.querySelectorAll(this._attachedCardSelector);
    let seen = 0;
    cards.forEach((card) => {
      if (seen >= limit) return;
      if (!card?.isConnected) return;
      this.trackedCards.add(card);
      this._getCardState(card, true);
      seen += 1;
    });
  }

  _setTickExit(reason = '') {
    const dbg = window.__assetfx_dbg;
    if (!dbg) return;
    dbg.tickExitReason = String(reason || '');
  }

  _setDebugReason(reason = '', extra = {}) {
    const dbg = window.__assetfx_dbg;
    if (!dbg) return;
    const label = String(reason || '');
    dbg.lastRectsReason = label;
    if (label.startsWith('EARLY_RETURN')) dbg.lastEarlyReturnReason = label;
    if (typeof extra.candidates === 'number') dbg.renderCandidatesCount = Number(extra.candidates);
    this._debugLastReason = label;
  }

  _syncDebugBanner() {
    if (!this.fxDebug) return;
    if (!this.debugBannerEl) return;
    const dbg = window.__assetfx_dbg || {};
    const visible = Number(dbg.visibleCards || 0);
    const hasRects = Number(dbg.lastRectsLen || 0) > 0;
    const frameAt = Number(dbg.lastRectsT || 0);
    const stalled = (performance.now() - frameAt) > 250;
    const noRects = visible > 0 && !hasRects;
    this._debugNoRectsStreak = noRects ? (this._debugNoRectsStreak + 1) : 0;
    const show = this._debugNoRectsStreak > 3 || stalled;
    if (!show) {
      this.debugBannerEl.style.display = 'none';
      if (dbg) dbg.debugBanner = '';
      return;
    }
    const reason = String(dbg.lastRectsReason || this._debugLastReason || 'UNKNOWN');
    const text = `FXDEBUG: no rects (attached=${this.container ? 1 : 0} gl=${this.gl ? 1 : 0} root=${this._attachedGridRoot ? 1 : 0} canvasRect=${dbg.canvasRect ? 1 : 0} candidates=${Number(dbg.renderCandidatesCount || 0)} earlyReturn=${reason.startsWith('EARLY_RETURN') ? 1 : 0} reason=${reason})`;
    this.debugBannerEl.textContent = text;
    this.debugBannerEl.style.display = 'block';
    if (dbg) dbg.debugBanner = text;
  }

  _markLayoutDirty(reason = 'unspecified') {
    this.layoutDirty = true;
    this.cardRectCache = new WeakMap();
    this._lastCanvasRect = null;
    if (window.__assetfx_dbg) {
      window.__assetfx_dbg.layoutInvalidations = (window.__assetfx_dbg.layoutInvalidations || 0) + 1;
      window.__assetfx_dbg.lastInvalidationReason = reason;
    }
    this._scheduleReplaySweep();
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
      this._maskTexture = shared.maskTexture || null;
      this._maskAllocated = shared.maskAllocated === true;
      this._u = shared.uCache || this._u;
      this.debugOverlay = shared.debugOverlay || null;
      this.debugDomLayer = shared.debugDomLayer || this.debugDomLayer;
      this.debugBannerEl = shared.debugBannerEl || this.debugBannerEl;
      this.raf = shared.raf;
      return;
    }

    const owner = FX_GLOBAL.__assetfx_global_context_owner;
    if (owner?.canvasEl?.isConnected && owner?.rootEl?.isConnected) {
      const ownerShared = this._getRenderer(owner.rootEl);
      if (ownerShared) {
        if (owner.canvasEl.parentElement !== document.body) {
          document.body.appendChild(owner.canvasEl);
        }
        this.container = container;
        this.overlay = owner.canvasEl;
        this.gl = ownerShared.gl;
        this.program = ownerShared.program;
        this.quad = ownerShared.quad;
        this.tileParamTexture = ownerShared.tileParamTexture;
        this._maskTexture = ownerShared.maskTexture || null;
        this._maskAllocated = ownerShared.maskAllocated === true;
        this._u = ownerShared.uCache || this._u;
        this.debugOverlay = ownerShared.debugOverlay || null;
        this.debugDomLayer = ownerShared.debugDomLayer || this.debugDomLayer;
        this.debugBannerEl = ownerShared.debugBannerEl || this.debugBannerEl;
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
    const canvases = Array.from(document.querySelectorAll('canvas[data-assetfx="overlay"]'));
    const canvas = canvases.shift() || createNode('canvas', 'fx-shared-overlay');
    canvases.forEach((node) => node.remove());
    canvas.classList.add('fx-shared-overlay');
    canvas.dataset.assetfx = 'overlay';
    Object.assign(canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: 'calc(var(--vvh, 1vh) * 100)',
      pointerEvents: 'none',
      zIndex: '0',
      opacity: '0.9',
    });
    if (!canvas.isConnected || canvas.parentElement !== document.body) document.body.prepend(canvas);

    const debugCanvases = Array.from(document.querySelectorAll('canvas[data-assetfx="debug"]'));
    const debugOverlay = debugCanvases.shift() || createNode('canvas', 'fx-debug-overlay');
    debugCanvases.forEach((node) => node.remove());
    debugOverlay.classList.add('fx-debug-overlay');
    debugOverlay.dataset.assetfx = 'debug';
    Object.assign(debugOverlay.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: 'calc(var(--vvh, 1vh) * 100)',
      pointerEvents: 'none',
      zIndex: '0',
      opacity: this.fxDebug ? '1' : '0',
      display: this.fxDebug ? 'block' : 'none',
    });
    if (!debugOverlay.isConnected || debugOverlay.parentElement !== document.body) document.body.prepend(debugOverlay);

    const debugLayers = Array.from(document.querySelectorAll('div[data-assetfx="debug-layer"]'));
    const debugDomLayer = debugLayers.shift() || createNode('div', 'fx-debug-dom-layer');
    debugLayers.forEach((node) => node.remove());
    debugDomLayer.classList.add('fx-debug-dom-layer');
    debugDomLayer.dataset.assetfx = 'debug-layer';
    Object.assign(debugDomLayer.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '9999',
      display: this.fxDebug ? 'block' : 'none',
    });
    if (!debugDomLayer.isConnected || debugDomLayer.parentElement !== document.body) document.body.appendChild(debugDomLayer);

    const debugBanners = Array.from(document.querySelectorAll('div[data-assetfx="debug-banner"]'));
    const debugBanner = debugBanners.shift() || createNode('div', 'fx-debug-banner');
    debugBanners.forEach((node) => node.remove());
    debugBanner.dataset.assetfx = 'debug-banner';
    Object.assign(debugBanner.style, {
      position: 'fixed',
      left: '8px',
      right: '8px',
      top: '8px',
      zIndex: '10000',
      font: '11px/1.3 monospace',
      color: '#9ff3ff',
      background: 'rgba(6, 16, 30, 0.82)',
      border: '1px solid rgba(120, 255, 170, 0.45)',
      borderRadius: '8px',
      padding: '6px 8px',
      display: 'none',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
    if (!debugBanner.isConnected || debugBanner.parentElement !== document.body) document.body.appendChild(debugBanner);

    this.overlay = canvas;
    this.debugOverlay = debugOverlay;
    this.debugDomLayer = debugDomLayer;
    this.debugBannerEl = debugBanner;
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
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if ('UNPACK_COLORSPACE_CONVERSION_WEBGL' in gl) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    } catch {}

    try {
      this.program = createProgram(gl, VERT, FRAG);
      this._cacheUniforms();
      this.quad = createQuad(gl);
      this.tileParamTexture = gl.createTexture();
      if (this.tileParamTexture) {
        gl.bindTexture(gl.TEXTURE_2D, this.tileParamTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      this._maskTexture = gl.createTexture();
      if (this._maskTexture) {
        gl.bindTexture(gl.TEXTURE_2D, this._maskTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      this._maskAllocated = false;
    } catch {
      this.program = null;
      this.quad = null;
      this.tileParamTexture = null;
      this._maskTexture = null;
      this._maskAllocated = false;
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
      this._maskTexture = null;
      this._maskAllocated = false;
    });

    canvas.addEventListener('webglcontextrestored', () => {
      if (!this.gl) return;
      try {
        this.program = createProgram(this.gl, VERT, FRAG);
        this._cacheUniforms();
        this.quad = createQuad(this.gl);
        this.tileParamTexture = this.gl.createTexture();
        if (this.tileParamTexture) {
          this.gl.bindTexture(this.gl.TEXTURE_2D, this.tileParamTexture);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        }
        this._maskTexture = this.gl.createTexture();
        if (this._maskTexture) {
          this.gl.bindTexture(this.gl.TEXTURE_2D, this._maskTexture);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        }
        this._maskAllocated = false;
      } catch {
        this.program = null;
        this.quad = null;
        this.tileParamTexture = null;
        this._maskTexture = null;
        this._maskAllocated = false;
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
    if (this.debugOverlay) this.debugOverlay.remove();
    if (this.debugDomLayer) this.debugDomLayer.remove();
    if (this.debugBannerEl) this.debugBannerEl.remove();
    this.overlay = null;
    this.debugOverlay = null;
    this.debugDomLayer = null;
    this.debugBannerEl = null;
    this.gl = null;
    this.program = null;
    this.quad = null;
    this.tileParamTexture = null;
    this._maskTexture = null;
    this._maskAllocated = false;
    if (this._maskField) { this._maskField.destroy(); this._maskField = null; }
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
    this.nearViewCards.clear();
    this.activeDissolves.clear();
    this.pendingDissolves = [];
    this.readyInViewNotPlayedCount = 0;
    this.renderSampledCount = 0;
    this.renderCandidatesCount = 0;
    this.droppedByCapCount = 0;
    this.lastPlayedAt = new WeakMap();
    this.lastExitedAt = new WeakMap();
    this.boundGrids = new WeakSet();
    this.pointerState.clear();
    this.pendingDissolves = [];
    this.stateByKey.clear();
    this.keyByEl = new WeakMap();
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

    this._bindInvalidations();
    resizeAllFxCanvases({ dprCap: 2, assetfxRenderer: this });
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._boundContainerResize);
      this._resizeObserver.observe(gridRoot);
    }

    this._tapGuardCleanup = this._wireTapGuard(gridRoot, cardSelector);
    if (this._maskField) this._maskField.destroy();
    this._maskField = new MaskField(gridRoot, cardSelector);
    this._ensureObserver(gridRoot);
  }

  detachGrid() {
    const gridRoot = this._attachedGridRoot;
    if (!gridRoot) return;
    this._unbindInvalidations();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (typeof this._tapGuardCleanup === 'function') this._tapGuardCleanup();
    if (this._maskField) { this._maskField.destroy(); this._maskField = null; }
    this._tapGuardCleanup = null;
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
    this.pointerState.clear();
    this.layoutDirty = true;
    this.cardRectCache = new WeakMap();
    this.pendingDissolves = [];
    this.nearViewCards.clear();
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
    if (imgEl) {
      cardEl.__fxThumb = imgEl;
      const key = this._getCardKey(cardEl);
      if (key) this.keyByEl.set(imgEl, key);
    }
    const state = this._getCardState(cardEl, true);
    if (state) {
      state.lastSeenAt = performance.now();
      state.selected = cardEl.classList.contains('is-selected');
    }
    this.trackedCards.add(cardEl);
    if (cardEl.dataset.fxInView === '1') this.visibleCards.add(cardEl);
    if (this.visibilityObserver) this.visibilityObserver.observe(cardEl);
    this._markLayoutDirty();
  }

  bindCardMedia(cardEl, mediaEl, { kind = '' } = {}) {
    if (!cardEl || !mediaEl) return;
    const key = this._getCardKey(cardEl);
    if (key) this.keyByEl.set(mediaEl, key);
    cardEl.dataset.fxKind = kind || '';
    cardEl.dataset.fxReady = '0';
    cardEl.dataset.ready = '0';
    this.trackViewport(cardEl, mediaEl);
    this.dissolve(cardEl, mediaEl, { allowReplay: true });

    if (typeof mediaEl.__fxReadyCleanup === 'function') mediaEl.__fxReadyCleanup();

    const markReady = async () => {
      if (kind === 'image' || mediaEl.tagName === 'IMG') {
        await decodeImageWithBackpressure(mediaEl);
      }
      cardEl.dataset.fxReady = '1';
      cardEl.dataset.ready = '1';
      cardEl.dataset.fxReadyAt = String(performance.now());
      const state = this._getCardState(cardEl, true);
      if (state) {
        state.readyAt = performance.now();
        state.thumbLoaded = true;
        state.renderable = true;
        state.lastSeenAt = performance.now();
      }
      if (cardEl.dataset.fxInView === '1') this.visibleCards.add(cardEl);
      this._markLayoutDirty();
      this._ensureEntryPending(cardEl, mediaEl, this.entryMs);
      this._maybePlayEntryOnReady(cardEl, mediaEl, kind);
    };

    const markError = () => {
      cardEl.dataset.fxReady = '0';
      cardEl.dataset.ready = '0';
      this.visibleCards.delete(cardEl);
      const state = this._getCardState(cardEl, true);
      if (state) {
        state.thumbLoaded = false;
        state.renderable = false;
        state.lastSeenAt = performance.now();
      }
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


  pulse(cardEl, { duration = 520 } = {}) {
    if (!cardEl) return;
    ensureRelative(cardEl);
    const ring = createNode('div', 'fx-selection-pulse');
    ring.style.animationDuration = `${Math.max(220, duration)}ms`;
    cardEl.appendChild(ring);
    setTimeout(() => ring.remove(), Math.max(220, duration) + 90);
    this._maskField?.pulseCard(cardEl);
  }

  dissolve(cardEl, imgEl, { duration = this.entryMs, allowReplay = false } = {}) {
    if (!cardEl || !imgEl) return { cancel: () => {} };
    if (typeof imgEl.__fxDissolveCleanup === 'function') imgEl.__fxDissolveCleanup();

    const play = () => {
      if (imgEl.dataset.thumbUrl && imgEl.getAttribute('src') === imgEl.dataset.thumbFallback) return;
      this._playEntry(cardEl, imgEl, duration, allowReplay);
    };

    const onLoad = () => play();
    imgEl.addEventListener('load', onLoad);
    if (imgEl.complete && imgEl.naturalWidth > 0) play();

    imgEl.__fxDissolveCleanup = () => imgEl.removeEventListener('load', onLoad);
    return { cancel: imgEl.__fxDissolveCleanup };
  }

  _playDissolve(cardEl, imgEl, duration, allowReplay) {
    this._playEntry(cardEl, imgEl, duration, allowReplay);
  }

  _ensureEntryPending(cardEl, imgEl, duration = this.entryMs) {
    if (!cardEl || !imgEl) return;
    if (cardEl.dataset.fxEntryPlayed === '1') return;
    if (cardEl.dataset.fxEntryPending === '1') return;
    cardEl.dataset.fxEntryPending = '1';
    cardEl.dataset.fxEntryFrames = '2';
    cardEl.__fxEntryMedia = imgEl;
    cardEl.__fxEntryDuration = duration;
    this.entryPendingCount += 1;
  }

  _playEntry(cardEl, imgEl, duration, allowReplay) {
    if (!this._canRunFx()) return;
    const now = Date.now();
    const last = this.lastPlayedAt.get(cardEl) || 0;
    if (allowReplay && now - last < this.cooldownMs) return;
    this.lastPlayedAt.set(cardEl, now);
    this._ensureEntryPending(cardEl, imgEl, duration);
  }


  _canRunFx() {
    return !this.prefersReducedMotion && !this.liteFx;
  }

  setDissolveMode(mode = 'scene') {
    const next = String(mode || 'scene').toLowerCase();
    this.dissolveMode = next === 'tile' ? 'tile' : 'scene';
    if (window.__assetfx_dbg) window.__assetfx_dbg.dissolveMode = this.dissolveMode;
  }

  _isRenderableMediaReady(cardEl) {
    if (!cardEl?.isConnected) return false;
    const state = this._getCardState(cardEl, true);
    const mediaEl = cardEl.__fxThumb || cardEl.querySelector('img.asset-thumb,video,audio');
    if (!mediaEl?.isConnected) {
      if (state) state.renderable = false;
      return false;
    }

    const tag = (mediaEl.tagName || '').toUpperCase();
    if (tag === 'IMG') {
      const now = performance.now();
      const thumbState = String(mediaEl.dataset?.thumbState || '').trim().toLowerCase();
      const src = (mediaEl.currentSrc || mediaEl.getAttribute('src') || '').trim();
      const thumbFallback = String(mediaEl.dataset?.thumbFallback || '').trim();
      const hasThumbUrl = String(mediaEl.dataset?.thumbUrl || '').trim().length > 0;
      const mediaReady = !!src && mediaEl.complete && Number(mediaEl.naturalWidth || 0) > 0;
      const thumbBlocked = !!(thumbState && thumbState !== 'loaded');
      const fallbackBlocked = !!(hasThumbUrl && thumbFallback && src === thumbFallback);
      let ready = mediaReady && !thumbBlocked && !fallbackBlocked;
      if (!ready && mediaReady && (thumbBlocked || fallbackBlocked)) {
        if (state && !state.thumbBlockedAt) state.thumbBlockedAt = now;
        const blockedFor = state ? (now - Number(state.thumbBlockedAt || now)) : 0;
        const visibleLike = cardEl.dataset.fxInView === '1' || this.visibleCards.has(cardEl) || !!state?.nearView;
        if (visibleLike && blockedFor >= this.renderableFallbackMs) ready = true;
      }
      if (state) {
        state.thumbLoaded = ready;
        state.renderable = ready;
        state.lastSeenAt = now;
        state.thumbBlockedAt = ready ? 0 : Number(state.thumbBlockedAt || now);
      }
      return ready;
    }
    if (tag === 'VIDEO') {
      const ready = Number(mediaEl.readyState || 0) >= 2;
      if (state) {
        state.thumbLoaded = ready;
        state.renderable = ready;
        state.lastSeenAt = performance.now();
      }
      return ready;
    }
    if (tag === 'AUDIO') {
      const ready = Number(mediaEl.readyState || 0) >= 1;
      if (state) {
        state.thumbLoaded = ready;
        state.renderable = ready;
        state.lastSeenAt = performance.now();
      }
      return ready;
    }
    if (state) state.renderable = false;
    return false;
  }

  _enqueueDissolve(cardEl, imgEl, duration) {
    if (!cardEl || !imgEl || this.prefersReducedMotion) return;
    if (this.dissolveMode !== 'tile' && cardEl?.dataset?.fxForceDissolve !== '1') return;
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
      veil.style.opacity = String(0.18 + this.motionDamp * 0.42);
      cardEl.appendChild(veil);

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
    if (this.noVirtualization && !visible) return false;
    const next = visible ? '1' : '0';
    if (card.dataset.fxInView === next) return false;
    card.dataset.fxInView = next;
    const state = this._getCardState(card, true);
    if (state) {
      state.inView = visible;
      state.nearView = visible || state.nearView;
      state.lastSeenAt = performance.now();
      if (visible && !state.enterAt) state.enterAt = performance.now();
      state.selected = card.classList.contains('is-selected');
    }
    if (state?.nearView) this.nearViewCards.add(card);
    else this.nearViewCards.delete(card);
    this._capNearViewCards();
    if (visible && card.dataset.fxReady === '1') {
      this.visibleCards.add(card);
      const mediaEl = card.__fxThumb || card.querySelector('img.asset-thumb,video,audio');
      if (mediaEl) this._ensureEntryPending(card, mediaEl, this.entryMs);
    }
    else {
      if (card.dataset.fxReady === '1' && !this.noVirtualization) this._playExit(card);
      this.visibleCards.delete(card);
      this.sampledCardsUntil.delete(card);
      if (state) state.sampledUntil = 0;
      this.nearViewCards.delete(card);
      card.dataset.fxEntryPending = '0';
      this.pendingDissolves = this.pendingDissolves.filter((entry) => entry.cardEl !== card);
    }
    this.layoutDirty = true;
    return true;
  }

  _maybePlayEntryOnReady(cardEl, mediaEl, kind = '') {
    if (!cardEl || !mediaEl) return;
    if (!this._canRunFx()) return;
    if (cardEl.dataset.fxInView !== '1' && !this.visibleCards.has(cardEl)) return;
    if (this.activeDissolves.has(cardEl)) return;
    const now = Date.now();
    const last = this.lastPlayedAt.get(cardEl) || 0;
    if (now - last < this.cooldownMs) return;
    this._ensureEntryPending(cardEl, mediaEl, this.entryMs);
  }


  _pruneDisconnected() {
    this.trackedCards.forEach((card) => {
      if (!card?.isConnected) {
        const state = this._getCardState(card, false);
        if (state) {
          state.nearView = false;
          state.inView = false;
          state.renderable = false;
        }
        this.trackedCards.delete(card);
      }
    });
    this.visibleCards.forEach((card) => {
      if (!card?.isConnected) this.visibleCards.delete(card);
    });
    this.nearViewCards.forEach((card) => {
      if (!card?.isConnected) this.nearViewCards.delete(card);
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
    if (this.noVirtualization) {
      this.fallbackSweepEnabled = true;
      this.trackedCards.forEach((card) => this._setCardInView(card, true));
      return;
    }
    if (!this.useIntersectionObserver || !('IntersectionObserver' in window)) {
      this.fallbackSweepEnabled = true;
      return;
    }

    this.fallbackSweepEnabled = false;
    const overscanY = Math.max(64, Math.round((rootEl?.clientHeight || 0) * this.prefetchViewportY));
    this.visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const card = entry.target;
        if (!card?.isConnected) continue;
        const state = this._getCardState(card, true);
        if (state) {
          state.nearView = entry.isIntersecting;
          state.lastSeenAt = performance.now();
          if (state.nearView) this.nearViewCards.add(card);
          else this.nearViewCards.delete(card);
          this._capNearViewCards();
        }
        const img = card.__fxThumb || card.querySelector('img.asset-thumb');
        if (!img) continue;
        if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
          const entered = this._setCardInView(card, true);
          if (entered && img.complete && img.naturalWidth > 0) {
            if (this._canRunFx()) this._playDissolve(card, img, this.entryMs, true);
            if (!this.prefersReducedMotion) this._showVisibleHint(card);
          }
        } else {
          this._setCardInView(card, false);
        }
      }
    }, {
      root: rootEl,
      threshold: [0.2, 0.35, 0.65],
      rootMargin: `${overscanY}px 0px ${overscanY}px 0px`,
    });

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

  _expandedRootRect(rootRect) {
    const extraY = Math.max(0, Number(rootRect?.height || 0) * this.prefetchViewportY);
    return {
      top: Number(rootRect?.top || 0) - extraY,
      bottom: Number(rootRect?.bottom || 0) + extraY,
      left: Number(rootRect?.left || 0),
      right: Number(rootRect?.right || 0),
    };
  }

  _replaySweep() {
    this._pruneDisconnected();
    if (!this.container || !this.trackedCards.size) return;
    this.layoutDirty = true;
    this.cardRectCache = new WeakMap();
    const rootRect = cloneRect(this.container.getBoundingClientRect());
    const expandedRect = this._expandedRootRect(rootRect);
    const minOverlap = Math.max(18, rootRect.height * 0.1);
    this.trackedCards.forEach((card) => {
      if (!card?.isConnected) {
        this.trackedCards.delete(card);
        return;
      }
      const rect = cloneRect(card.getBoundingClientRect());
      const overlap = Math.min(rect.bottom, expandedRect.bottom) - Math.max(rect.top, expandedRect.top);
      const nearView = this.noVirtualization ? true : overlap > 0;
      const visible = this.noVirtualization ? true : overlap > minOverlap;
      const state = this._getCardState(card, true);
      if (state) {
        state.nearView = nearView;
        state.inView = visible;
        state.lastSeenAt = performance.now();
        if (state.nearView) this.nearViewCards.add(card);
        else this.nearViewCards.delete(card);
        this._capNearViewCards();
      }
      if (visible) {
        const entered = this._setCardInView(card, true);
        const img = card.__fxThumb || card.querySelector('img.asset-thumb');
        if (entered && img?.complete && img.naturalWidth > 0) {
          if (this._canRunFx()) this._playDissolve(card, img, this.entryMs, true);
          if (!this.prefersReducedMotion) this._showVisibleHint(card);
        }
      } else {
        this._setCardInView(card, false);
      }
    });
  }

  _showVisibleHint(cardEl) {
    if (this.prefersReducedMotion || this.liteFx) return;
    if (this.scrollVelocityEma > 0.35 || this.motionDamp < 0.8) return;
    if (Math.random() > 0.35) return;
    ensureRelative(cardEl);
    const hint = createNode('div', 'fx-visible-hint');
    cardEl.appendChild(hint);
    setTimeout(() => hint.remove(), 320);
  }



  _playExit(cardEl, { duration = 260 } = {}) {
    if (!cardEl || !this._canRunFx()) return;
    const now = Date.now();
    const last = this.lastExitedAt.get(cardEl) || 0;
    if (now - last < Math.max(420, this.cooldownMs * 0.6)) return;
    this.lastExitedAt.set(cardEl, now);
    const state = this._getCardState(cardEl, true);
    if (state) state.exitPlayedAt = now;
    ensureRelative(cardEl);
    const veil = createNode('div', 'fx-exit-veil');
    veil.style.animationDuration = `${Math.max(180, duration)}ms`;
    cardEl.appendChild(veil);
    setTimeout(() => veil.remove(), Math.max(180, duration) + 80);
  }

  _startLoop() {
    if (this.raf || !this.gl || !this.program || !this.quad || !this.overlay || !this.container) return;
    const tick = () => {
      try {
        if (window.__assetfx_dbg) {
          window.__assetfx_dbg.tickFrame = Number(window.__assetfx_dbg.tickFrame || 0) + 1;
        }
        const now = performance.now();
        if (this._lastFrameAt > 0) {
          const dt = Math.max(1, now - this._lastFrameAt);
          const fps = 1000 / dt;
          this.fpsEma = (this.fpsEma * 0.9) + (fps * 0.1);
        }
        this._lastFrameAt = now;
        this._frameCounter += 1;
        const deviceMemory = Number(window.navigator?.deviceMemory || 0);
        const smallScreen = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
        const lowTierFrameSkip = !this.fxDebug && ((deviceMemory > 0 && deviceMemory <= 4) || smallScreen) && this.scrollVelocityEma > 0.85;
        if (!lowTierFrameSkip || (this._frameCounter % 2) === 0) {
          this._setTickExit('RUN');
          this._render();
        } else {
          this._setTickExit('EARLY_RETURN:THROTTLED');
          this._publishDebugRects(window.__assetfx_dbg?.lastRects || [], { lastRectsReason: 'EARLY_RETURN:THROTTLED' });
        }
      } catch (e) {
        window.__assetfx_dbg = window.__assetfx_dbg || {};
        window.__assetfx_dbg.lastException = String(e && (e.stack || e.message || e));
        window.__assetfx_dbg.lastExceptionT = performance.now();
      } finally {
        this.raf = requestAnimationFrame(tick);
        if (this.container && RENDERERS.has(this.container)) {
          const shared = RENDERERS.get(this.container);
          shared.raf = this.raf;
        }
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
      maskTexture: this._maskTexture,
      maskAllocated: this._maskAllocated,
      uCache: this._u,
      debugOverlay: this.debugOverlay,
      debugDomLayer: this.debugDomLayer,
      debugBannerEl: this.debugBannerEl,
      raf: this.raf,
    });
  }

  _cacheUniforms() {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const loc = (name) => gl.getUniformLocation(this.program, name);
    this._u = {
      u_resolution: loc('u_resolution'),
      u_time: loc('u_time'),
      u_rect_count: loc('u_rect_count'),
      u_rects: loc('u_rects'),
      u_tile_params: loc('u_tile_params'),
      u_motion_damp: loc('u_motion_damp'),
      u_scroll_fast: loc('u_scroll_fast'),
      u_selected: loc('u_selected'),
      u_select_pulse: loc('u_select_pulse'),
      u_mask: loc('u_mask'),
      u_mask_enabled: loc('u_mask_enabled'),
    };
  }

  _render() {
    this._pruneDisconnected();
    this._discoverCardsFromDom();
    if (!this.gl || !this.program || !this.quad || !this.overlay || !this.container) {
      this._setDebugReason('EARLY_RETURN:NOT_ATTACHED');
      this._setTickExit('EARLY_RETURN:NOT_ATTACHED');
      this._publishDebugRects([], { lastRectsReason: 'EARLY_RETURN:NOT_ATTACHED' });
      this._syncDebugBanner();
      return;
    }
    if (this.container.dataset.fxSuspend === '1') {
      this.gl.viewport(0, 0, this.overlay.width || 1, this.overlay.height || 1);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      if (this.debugOverlay) {
        const ctx = this.debugOverlay.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, this.debugOverlay.width, this.debugOverlay.height);
      }
      if (this.debugDomLayer) this.debugDomLayer.replaceChildren();
      this._setDebugReason('EARLY_RETURN:DEBUG_DISABLED');
      this._setTickExit('EARLY_RETURN:DEBUG_DISABLED');
      this._publishDebugRects([], { lastRectsReason: 'EARLY_RETURN:DEBUG_DISABLED' });
      this._syncDebugBanner();
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let canvasRect = this._lastCanvasRect || cloneRect(this.overlay.getBoundingClientRect());
    if (!this._lastCanvasRect || this.layoutDirty) canvasRect = cloneRect(this.overlay.getBoundingClientRect());
    this._lastCanvasRect = canvasRect;
    if (!canvasRect || !Number.isFinite(canvasRect.width) || !Number.isFinite(canvasRect.height) || canvasRect.width <= 0 || canvasRect.height <= 0) {
      this._setDebugReason('EARLY_RETURN:CANVAS_RECT_NULL');
      this._setTickExit('EARLY_RETURN:CANVAS_RECT_NULL');
      this._publishDebugRects([], { lastRectsReason: 'EARLY_RETURN:CANVAS_RECT_NULL', canvasRect: null });
      this._syncDebugBanner();
      return;
    }
    const viewport = getStableViewportSize();
    const width = Math.max(1, Math.round((viewport.width || canvasRect.width || 1) * dpr));
    const height = Math.max(1, Math.round((viewport.height || canvasRect.height || 1) * dpr));
    if (this.overlay.width !== width || this.overlay.height !== height) {
      this.overlay.width = width;
      this.overlay.height = height;
    }

    this._updateMotionDamp();
    const cards = [];
    const renderCandidates = [];
    this.renderSampledCount = 0;
    this.renderCandidatesCount = 0;
    this.droppedByCapCount = 0;
    this.readyInViewNotPlayedCount = 0;
    if (this.layoutDirty) this.cardRectCache = new WeakMap();
    const cx = width * 0.5;
    const cy = height * 0.5;
    for (const card of this._iterCards(this.trackedCards)) {
      if (!card?.isConnected) continue;
      const state = this._getCardState(card, true);
      if (!state) continue;
      state.selected = card.classList.contains('is-selected');
      state.pending = card.dataset.fxEntryPending === '1';
      state.active = this.activeDissolves.has(card);
      state.lastSeenAt = performance.now();
      let cr = this.cardRectCache.get(card);
      if (!cr || this.layoutDirty) {
        cr = cloneRect(card.getBoundingClientRect());
        this.cardRectCache.set(card, cr);
      }
      const inViewNow = cr.bottom >= canvasRect.top
        && cr.top <= canvasRect.bottom
        && cr.right >= canvasRect.left
        && cr.left <= canvasRect.right;
      const nearBandPx = Math.max(48, canvasRect.height * this.prefetchViewportY);
      const nearViewNow = cr.bottom >= (canvasRect.top - nearBandPx)
        && cr.top <= (canvasRect.bottom + nearBandPx)
        && cr.right >= canvasRect.left
        && cr.left <= canvasRect.right;
      state.inView = inViewNow;
      state.nearView = nearViewNow;
      card.dataset.fxInView = inViewNow ? '1' : '0';
      if (inViewNow) this.visibleCards.add(card);
      else this.visibleCards.delete(card);
      if (nearViewNow) this.nearViewCards.add(card);
      else this.nearViewCards.delete(card);
      this._capNearViewCards();
      if (!nearViewNow) continue;
      if (card.dataset.fxReady !== '1') continue;
      if (!this._isRenderableMediaReady(card)) continue;
      let x1 = (cr.left - canvasRect.left) * dpr;
      let y1 = (cr.top - canvasRect.top) * dpr;
      let x2 = (cr.right - canvasRect.left) * dpr;
      let y2 = (cr.bottom - canvasRect.top) * dpr;
      x1 += RECT_INSET_PX * dpr;
      y1 += RECT_INSET_PX * dpr;
      x2 -= RECT_INSET_PX * dpr;
      y2 -= RECT_INSET_PX * dpr;
      x1 = Math.max(0, Math.min(width, x1));
      y1 = Math.max(0, Math.min(height, y1));
      x2 = Math.max(0, Math.min(width, x2));
      y2 = Math.max(0, Math.min(height, y2));
      if (x2 <= x1 || y2 <= y1) continue;
      state.lastRect = { x1, y1, x2, y2 };
      const typeCode = 0;
      const selected = card.classList.contains('is-selected') ? 1 : 0;
      const readyAt = Number(card.dataset.fxReadyAt || 0);
      const readyFade = readyAt > 0 ? Math.min(1, (performance.now() - readyAt) / this.readyFadeMs) : 1;
      const energy = Math.min(0.76, (0.12 + selected * 0.2) * (0.64 + readyFade * 0.36) * (0.56 + this.motionDamp * 0.44));
      const tileCenterX = (x1 + x2) * 0.5;
      const tileCenterY = (y1 + y2) * 0.5;
      const dist2 = ((tileCenterX - cx) * (tileCenterX - cx)) + ((tileCenterY - cy) * (tileCenterY - cy));
      const holdUntil = this.sampledCardsUntil.get(card) || 0;
      const holdBoost = holdUntil > performance.now() ? -1e12 : 0;
      renderCandidates.push([x1, y1, x2, y2, typeCode, selected, energy, readyFade, dist2 + holdBoost, card]);

      const last = this.lastPlayedAt.get(card) || 0;
      if (inViewNow && !this.activeDissolves.has(card) && (Date.now() - last >= this.cooldownMs)) {
        this.readyInViewNotPlayedCount += 1;
      }
    }
    const totalCandidates = renderCandidates.length;
    this.renderCandidatesCount = totalCandidates;
    if (window.__assetfx_dbg) {
      window.__assetfx_dbg.candidatesBuilt = totalCandidates;
      window.__assetfx_dbg.sampleWanted = totalCandidates;
      window.__assetfx_dbg.sampleIssued = 0;
      window.__assetfx_dbg.sampleDone = 0;
      window.__assetfx_dbg.texturesAlive = Number(!!this.tileParamTexture) + Number(!!this._maskTexture);
      window.__assetfx_dbg.mode = this.gl ? 'full' : 'off';
    }
    const deviceMemory = Number(window.navigator?.deviceMemory || 0);
    const smallScreen = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
    const lowTier = (deviceMemory > 0 && deviceMemory <= 4) || smallScreen;
    const pixelBudgetCap = lowTier ? this.maxRenderPixelsLowTier : this.maxRenderPixelsHighTier;
    const pixelBudgetDynamic = Math.round(width * height * (lowTier ? 0.9 : 1.2));
    const pixelBudget = Math.min(pixelBudgetCap, pixelBudgetDynamic);
    this.renderPixelsNow = 0;
    const dynamicCap = lowTier ? this.maxRenderCardsLowTier : this.maxRenderCardsHighTier;
    const visibleDrivenCap = Math.min(MAX_RECTS, Math.max(this.minRenderCards, totalCandidates + 4));
    let adaptiveMaxRenderCards = Math.min(totalCandidates, Math.min(dynamicCap, visibleDrivenCap));
    if (this.fpsEma > 55) adaptiveMaxRenderCards = Math.min(totalCandidates, Math.min(MAX_RECTS, adaptiveMaxRenderCards + 4));
    if (this.fpsEma < 45) adaptiveMaxRenderCards = Math.max(this.minRenderCards, adaptiveMaxRenderCards - 4);
    adaptiveMaxRenderCards = Math.min(totalCandidates, adaptiveMaxRenderCards);
    this.maxRenderCardsAdaptive = adaptiveMaxRenderCards;
    this.capNow = adaptiveMaxRenderCards;
    const nowPerf = performance.now();
    const freezeByVelocity = this.scrollVelocityEma > FAST_SCROLL_THRESHOLD;
    const freezeBySettle = nowPerf < this.samplingSettleUntil;
    this.samplingFrozen = freezeByVelocity || freezeBySettle;

    const rowsByCard = new Map(renderCandidates.map((row) => [row[9], row]));
    const selectedVisibleCards = renderCandidates
      .filter((row) => row[5] > 0)
      .map((row) => row[9]);
    const stickyCards = [];
    rowsByCard.forEach((row, card) => {
      const stickUntil = this.sampledCardsUntil.get(card) || 0;
      if (stickUntil > nowPerf) stickyCards.push(card);
    });

    const visibleOrder = [...renderCandidates].sort((a, b) => ((a[1] - b[1]) || (a[0] - b[0])));
    const sweepCards = [];
    if (visibleOrder.length) {
      if (this.sampleCursor >= visibleOrder.length) this.sampleCursor = this.sampleCursor % visibleOrder.length;
      let cursor = this.sampleCursor;
      while (sweepCards.length < adaptiveMaxRenderCards && sweepCards.length < visibleOrder.length) {
        sweepCards.push(visibleOrder[cursor][9]);
        cursor = (cursor + 1) % visibleOrder.length;
      }
      if (!this.samplingFrozen) {
        const step = this.motionDamp > 0.75 ? 2 : 1;
        this.sampleCursor = (this.sampleCursor + step) % visibleOrder.length;
      }
    }

    const frozenCards = this.samplingFrozen ? this.lastSampledCards.filter((card) => rowsByCard.has(card)) : [];
    const selectedCards = [];
    const selectedSet = new Set();
    const pushCard = (card, force = false) => {
      if (!card || selectedSet.has(card) || !rowsByCard.has(card) || selectedCards.length >= adaptiveMaxRenderCards) return;
      const row = rowsByCard.get(card);
      const rowPixels = Math.max(1, (row[2] - row[0]) * (row[3] - row[1]));
      if (!force && (this.renderPixelsNow + rowPixels) > pixelBudget) return;
      this.renderPixelsNow += rowPixels;
      selectedCards.push(card);
      selectedSet.add(card);
    };

    stickyCards.forEach((card) => pushCard(card));
    if (this.samplingFrozen) frozenCards.forEach((card) => pushCard(card));
    sweepCards.forEach((card) => pushCard(card));

    const sampledCards = new Set();
    this.stickyRetainedCount = 0;
    selectedCards.forEach((card) => {
      const row = rowsByCard.get(card);
      if (!row) return;
      cards.push(row);
      sampledCards.add(card);
      const stickUntil = this.sampledCardsUntil.get(card) || 0;
      if (stickUntil > nowPerf) this.stickyRetainedCount += 1;
      this.sampledCardsUntil.set(card, nowPerf + SAMPLE_STICK_MS);
      const state = this._getCardState(card, true);
      if (state) state.sampledUntil = nowPerf + SAMPLE_STICK_MS;
      if (this.fxDebug) {
        const sticky = stickUntil > nowPerf;
        this._renderDebugBadge(card, { sampled: true, sticky, pending: false, inView: true, ready: true, alwaysOn: ALWAYS_ON_PASS_ENABLED });
      }
    });
    this.sweepFilledCount = Math.max(0, cards.length - this.stickyRetainedCount);
    if (window.__assetfx_dbg) {
      window.__assetfx_dbg.sampleIssued = selectedCards.length;
      window.__assetfx_dbg.sampleDone = cards.length;
    }
    this.lastSampledCards = [...sampledCards];

    selectedVisibleCards.forEach((card) => {
      const row = rowsByCard.get(card);
      if (!row) return;
      if (sampledCards.has(card)) return;
      cards.push(row);
      sampledCards.add(card);
      this.renderPixelsNow += Math.max(1, (row[2] - row[0]) * (row[3] - row[1]));
      this.sampledCardsUntil.set(card, nowPerf + SAMPLE_STICK_MS);
      const state = this._getCardState(card, true);
      if (state) state.sampledUntil = nowPerf + SAMPLE_STICK_MS;
    });

    // finalize pending entry once sampling decision settles (sampled or 2 raf cycles)
    this.entryPendingCount = 0;
    this.visibleCards.forEach((card) => {
      if (!card?.isConnected) return;
      if (card.dataset.fxReady !== '1' || card.dataset.fxInView !== '1') return;
      if (card.dataset.fxEntryPlayed === '1') return;
      if (card.dataset.fxEntryPending !== '1') return;
      const framesLeft = Math.max(0, Number(card.dataset.fxEntryFrames || '0'));
      const shouldFinalize = sampledCards.has(card) || framesLeft <= 0;
      if (shouldFinalize) {
        const mediaEl = card.__fxEntryMedia || card.__fxThumb || card.querySelector('img.asset-thumb,video,audio');
        if (mediaEl) this._enqueueDissolve(card, mediaEl, Number(card.__fxEntryDuration || this.entryMs));
        card.dataset.fxEntryPending = '0';
        card.dataset.fxEntryPlayed = '1';
        card.dataset.fxEntryFrames = '0';
      } else {
        card.dataset.fxEntryFrames = String(framesLeft - 1);
        this.entryPendingCount += 1;
      }
    });

    if (this.fxDebug) {
      this.trackedCards.forEach((card) => {
        if (!card?.isConnected) return;
        const state = this._getCardState(card, true);
        const ready = !!state?.renderable;
        const inView = !!state?.inView;
        const sampled = sampledCards.has(card);
        const pending = ready && inView && !sampled;
        const sticky = sampled && ((this.sampledCardsUntil.get(card) || 0) > (nowPerf + SAMPLE_STICK_MS - 16));
        this._renderDebugBadge(card, { ready, inView, sampled, pending, sticky, alwaysOn: ALWAYS_ON_PASS_ENABLED });
      });
    }
    this.renderSampledCount = cards.length;
    this.droppedByCapCount = Math.max(0, totalCandidates - cards.length);
    this._updateSelectionGlow(nowPerf, selectedVisibleCards.length);
    this.layoutDirty = false;
    this._evictState(nowPerf);
    this._renderDebugRects(cards, width, height);

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

    const U = this._u;
    if (!U) return;

    gl.uniform2f(U.u_resolution, width, height);
    gl.uniform1f(U.u_time, (performance.now() - this.start) * 0.001);
    gl.uniform1i(U.u_rect_count, Math.min(cards.length, MAX_RECTS));
    gl.uniform1f(U.u_motion_damp, this.motionDamp);
    gl.uniform1f(U.u_scroll_fast, this.scrollFast);
    gl.uniform1f(U.u_selected, selectedVisibleCards.length > 0 ? 1 : 0);
    gl.uniform1f(U.u_select_pulse, this.selectPulse * (0.5 + 0.5 * Math.sin((nowPerf - this.start) * (Math.PI * 2 / 2500))));
    gl.uniform4fv(U.u_rects, rectData);
    if (this.tileParamTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tileParamTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_RECTS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, tileParamData);
      gl.uniform1i(U.u_tile_params, 0);
    }

    const hasMask = !!(this._maskField && this._maskTexture);
    gl.uniform1f(U.u_mask_enabled, hasMask ? 1.0 : 0.0);
    if (hasMask) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._maskTexture);
      if (!this._maskAllocated) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MASK_SIZE, MASK_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this._maskAllocated = true;
        this._saveRenderer(this.container);
      }
      try {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      } catch {}
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._maskField.canvas);
      gl.uniform1i(U.u_mask, 1);
    } else {
      this._maskAllocated = false;
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _publishDebugRects(debugRects, meta = {}) {
    const safeRects = Array.isArray(debugRects) ? debugRects : [];
    FX_GLOBAL.__assetfx_dbg_last_rects = safeRects;
    if (window.__assetfx_dbg) {
      window.__assetfx_dbg.lastRects = safeRects;
      window.__assetfx_dbg.lastRectsLen = safeRects.length;
      window.__assetfx_dbg.lastRectsFrame = Number(window.__assetfx_dbg.lastRectsFrame || 0) + 1;
      window.__assetfx_dbg.lastRectsT = performance.now();
      window.__assetfx_dbg.stateSize = this.stateByKey.size;
      window.__assetfx_dbg.attachedRootId = this._attachedGridRoot?.dataset?.assetfxRootId || null;
      window.__assetfx_dbg.canvasRect = meta.canvasRect || null;
      window.__assetfx_dbg.dpr = Number(meta.dpr || window.devicePixelRatio || 1);
      window.__assetfx_dbg.vvOffset = meta.vvOffset || { ox: 0, oy: 0 };
      window.__assetfx_dbg.vvState = meta.vvState || null;
      window.__assetfx_dbg.rootScrollTop = Number(meta.rootScrollTop || this._attachedGridRoot?.scrollTop || 0);
      window.__assetfx_dbg.visibleCards = this.visibleCards.size;
      window.__assetfx_dbg.nearViewCards = this.nearViewCards.size;
      window.__assetfx_dbg.sampleMapA = meta.sampleMapA || null;
      window.__assetfx_dbg.sampleMapC = meta.sampleMapC || null;
      window.__assetfx_dbg.canvasTopPlusVvOy = Number.isFinite(Number(meta.canvasTopPlusVvOy)) ? Number(meta.canvasTopPlusVvOy) : null;
      window.__assetfx_dbg.dissolveMode = this.dissolveMode;
      const reason = String(meta.lastRectsReason || (safeRects.length > 0 ? 'OK' : 'NO_CANDIDATES'));
      window.__assetfx_dbg.lastRectsReason = reason;
      if (reason.startsWith('EARLY_RETURN')) window.__assetfx_dbg.lastEarlyReturnReason = reason;
    }
    this._syncDebugBanner();
  }

  _renderDebugRects(cards, width, height) {
    if (!this.debugOverlay) return;
    if (!this.fxDebug) {
      this._publishDebugRects([], {
        lastRectsReason: 'DEBUG_DISABLED',
        canvasRect: this._lastCanvasRect ? {
          left: this._lastCanvasRect.left,
          top: this._lastCanvasRect.top,
          width: this._lastCanvasRect.width,
          height: this._lastCanvasRect.height,
        } : null,
      });
      const ctx = this.debugOverlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.debugOverlay.width || 0, this.debugOverlay.height || 0);
      if (this.debugDomLayer) this.debugDomLayer.replaceChildren();
      return;
    }
    const ctx = this.debugOverlay.getContext('2d');
    if (!ctx) return;
    if (this.debugOverlay.width !== width || this.debugOverlay.height !== height) {
      this.debugOverlay.width = width;
      this.debugOverlay.height = height;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60, 200, 255, 0.9)';
    ctx.strokeRect(0.5, 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
    ctx.strokeStyle = 'rgba(120, 255, 170, 0.95)';
    const debugRects = [];
    cards.forEach((row, idx) => {
      const x = row[0];
      const y = row[1];
      const w = Math.max(1, row[2] - row[0]);
      const h = Math.max(1, row[3] - row[1]);
      const card = row[9] || null;
      const key = card?.dataset?.assetId
        || card?.dataset?.selectKey
        || card?.dataset?.sha256
        || card?.dataset?.relative
        || String(idx);
      debugRects.push({ key, x1: row[0], y1: row[1], x2: row[2], y2: row[3] });
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
      if (idx < 24) {
        ctx.fillStyle = 'rgba(10, 16, 32, 0.72)';
        ctx.fillRect(x + 2, y + 2, 20, 12);
        ctx.fillStyle = '#8ef0ff';
        ctx.font = '10px monospace';
        ctx.fillText(String(idx + 1), x + 4, y + 11);
      }
    });
    const vvState = cloneVV(window.visualViewport);
    const vv = getViewportOffsets();
    const sample = cards.length ? cards[0] : null;
    const sampleMapA = sample
      ? { x: Number(sample[0] / (window.devicePixelRatio || 1)), y: Number(sample[1] / (window.devicePixelRatio || 1)) }
      : null;
    const sampleMapC = sample
      ? { x: Number(sampleMapA?.x ?? 0) - vv.x, y: Number(sampleMapA?.y ?? 0) - vv.y }
      : null;
    const canvasTopPlusVvOy = this._lastCanvasRect ? Number(this._lastCanvasRect.top + vv.y) : null;
    this._publishDebugRects(debugRects, {
      lastRectsReason: debugRects.length > 0 ? 'OK' : 'NO_CANDIDATES',
      canvasRect: this._lastCanvasRect ? {
        left: this._lastCanvasRect.left,
        top: this._lastCanvasRect.top,
        width: this._lastCanvasRect.width,
        height: this._lastCanvasRect.height,
      } : null,
      dpr: window.devicePixelRatio || 1,
      vvOffset: { ox: vv.x, oy: vv.y },
      vvState,
      rootScrollTop: Number(this._attachedGridRoot?.scrollTop || 0),
      sampleMapA,
      sampleMapC,
      canvasTopPlusVvOy,
    });
    if (this.debugDomLayer) {
      this.debugDomLayer.replaceChildren();
      const dpr = window.devicePixelRatio || 1;
      debugRects.forEach((r) => {
        const node = document.createElement('div');
        node.className = 'fx-debug-dom-rect';
        const x = r.x1 / dpr;
        const y = r.y1 / dpr;
        const w = Math.max(1, (r.x2 - r.x1) / dpr);
        const h = Math.max(1, (r.y2 - r.y1) / dpr);
        Object.assign(node.style, {
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          width: `${w}px`,
          height: `${h}px`,
          border: '1px solid rgba(120, 255, 170, 0.95)',
          borderRadius: '3px',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: '9999',
        });
        this.debugDomLayer.appendChild(node);
      });
    }
  }

  setResolution(width, height) {
    const gl = this.gl;
    if (!gl || !this.overlay) return;
    const w = Math.max(1, Math.round(Number(width || this.overlay.width || 1)));
    const h = Math.max(1, Math.round(Number(height || this.overlay.height || 1)));
    gl.viewport(0, 0, w, h);
    if (this.program && this._u?.u_resolution) {
      gl.useProgram(this.program);
      gl.uniform2f(this._u.u_resolution, w, h);
    }
  }

  _renderDebugBadge(cardEl, { ready = false, inView = false, sampled = false, pending = false, sticky = false, alwaysOn = true } = {}) {
    if (!this.fxDebug || !cardEl) return;
    let badge = cardEl.querySelector('.fx-debug-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'fx-debug-badge';
      cardEl.appendChild(badge);
    }
    badge.textContent = `${alwaysOn ? 'A' : '-'}${ready ? 'R' : '-'}${inView ? 'V' : '-'}${sampled ? (sticky ? 'K' : 'S') : (pending ? 'P' : '-')}`;
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
        background: linear-gradient(180deg, rgba(20, 42, 76, 0.95), rgba(66, 129, 182, 0.66), rgba(90, 219, 255, 0.22));
        transition: opacity 320ms ease;
        opacity: 0.74;
      }
      .fx-dissolve-veil.is-active { opacity: 0; }
      .asset.fx-entry-active {
        transform: translateY(-0.5px) scale(1.005);
        transition: transform 160ms ease-out;
      }
      .fx-exit-veil {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 5;
        background: linear-gradient(180deg, rgba(5, 9, 16, 0.56), rgba(8, 18, 32, 0.08));
        animation: fx-exit-veil 260ms ease-out forwards;
      }
      .fx-visible-hint {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 4;
        mix-blend-mode: screen;
        background: linear-gradient(135deg, rgba(86,126,196,0.14), rgba(120,219,255,0.06), rgba(8,14,25,0));
        animation: fx-visible-hint 200ms ease-out forwards;
      }
      .fx-debug-overlay {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: calc(var(--vvh, 1vh) * 100);
        pointer-events: none;
        z-index: 4;
      }
      .fx-debug-badge {
        position: absolute;
        right: 6px;
        bottom: 6px;
        z-index: 13;
        font-size: 10px;
        font-family: monospace;
        background: rgba(0,0,0,0.75);
        color: #9ef;
        border: 1px solid rgba(158,238,255,0.4);
        border-radius: 6px;
        padding: 2px 4px;
        pointer-events: none;
      }
      @keyframes fx-selection-pulse {
        0% { opacity: 0.95; transform: scale(0.94); box-shadow: 0 0 0 0 rgba(80,220,255,0.58); }
        70% { opacity: 0.55; transform: scale(1.02); box-shadow: 0 0 0 12px rgba(80,220,255,0.0); }
        100% { opacity: 0; transform: scale(1.04); box-shadow: 0 0 0 18px rgba(80,220,255,0.0); }
      }
      @keyframes fx-exit-veil {
        0% { opacity: 0.0; }
        35% { opacity: 0.72; }
        100% { opacity: 0.0; }
      }
      @keyframes fx-visible-hint {
        0% { opacity: 0; transform: scale(0.99); }
        30% { opacity: 0.58; }
        100% { opacity: 0; transform: scale(1.01); }
      }
      @media (prefers-reduced-motion: reduce) {
        .fx-selection-pulse, .fx-visible-hint, .fx-dissolve-veil, .fx-exit-veil { animation: none !important; transition: none !important; }
        .asset.fx-entry-active { transform: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
}

export { cssEscape };
