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


function getStableViewportSize() {
  const vv = window.visualViewport;
  const doc = document.documentElement;
  const vvW = Number(vv?.width || 0);
  const vvH = Number(vv?.height || 0);
  const docW = Number(doc?.clientWidth || 0);
  const docH = Number(doc?.clientHeight || 0);
  const winW = Number(window.innerWidth || 0);
  const winH = Number(window.innerHeight || 0);

  const fallbackW = Math.max(0, docW, winW);
  const fallbackH = Math.max(0, docH, winH);
  const width = (vvW > 0 && vvW >= (fallbackW * 0.6)) ? vvW : fallbackW;
  const height = (vvH > 0 && vvH >= (fallbackH * 0.6)) ? vvH : fallbackH;
  return {
    width: Math.max(1, width || 1),
    height: Math.max(1, height || 1),
  };
}

function getViewportOffsets() {
  const vv = window.visualViewport;
  return {
    x: Number(vv?.offsetLeft || 0),
    y: Number(vv?.offsetTop || 0),
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
const STATE_EVICT_AFTER_MS = 20000;

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
      const r = this._root.getBoundingClientRect();
      this._hoverNx = (e.clientX - r.left) / Math.max(1, r.width);
      this._hoverNy = (e.clientY - r.top) / Math.max(1, r.height);
      this._dirty = true;
    };
    this._onLeave = () => { this._hoverNx = -1; this._hoverNy = -1; };
    this._onDown = (e) => {
      const r = this._root.getBoundingClientRect();
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
    const rr = this._root.getBoundingClientRect();
    const cr = cardEl.getBoundingClientRect();
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

    const rr = this._root.getBoundingClientRect();
    if (rr.width > 0 && rr.height > 0) {
      this._root.querySelectorAll(this._sel).forEach((el) => {
        const r = el.getBoundingClientRect();
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
    lastRectsFrame: 0,
    lastRectsT: 0,
    layoutInvalidations: 0,
    lastInvalidationReason: '',
    canvasRect: null,
    dpr: 1,
    vvOffset: { ox: 0, oy: 0 },
    rootScrollTop: 0,
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
    this._boundWindowResize = () => this._markLayoutDirty('window:resize');
    this._boundContainerResize = () => this._markLayoutDirty('container:resize');
    this._tapGuardCleanup = null;
    this._resizeObserver = null;
    this.sampleHoldMs = SAMPLE_STICK_MS;
    this.sampledCardsUntil = new WeakMap();
    this.debugOverlay = null;
    this._boundVisualViewportChange = () => this._markLayoutDirty('visualViewport:change');
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

  _getCardKey(cardEl) {
    if (!cardEl) return '';
    const existing = this.keyByEl.get(cardEl);
    if (existing) return existing;
    const key = String(
      cardEl.dataset.assetId
      || cardEl.dataset.sha256
      || cardEl.dataset.selectKey
      || cardEl.dataset.relative
      || `assetfx-key-${++this._stateGeneration}`
    );
    this.keyByEl.set(cardEl, key);
    return key;
  }

  _getCardState(cardEl, create = true) {
    const key = this._getCardKey(cardEl);
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
        el: cardEl,
      };
      this.stateByKey.set(key, state);
    }
    if (state && cardEl && state.el !== cardEl) {
      state.el = cardEl;
      state.generation = Number(state.generation || 0) + 1;
    }
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
    this.stateByKey.forEach((state, key) => {
      const age = Math.max(0, nowPerf - Number(state.lastSeenAt || 0));
      const pinned = state.selected || state.pending || state.active;
      if (!state.nearView && !pinned && age > this.evictAfterMs) this.stateByKey.delete(key);
    });
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
      height: '100vh',
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
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '0',
      opacity: this.fxDebug ? '1' : '0',
      display: this.fxDebug ? 'block' : 'none',
    });
    if (!debugOverlay.isConnected || debugOverlay.parentElement !== document.body) document.body.prepend(debugOverlay);

    this.overlay = canvas;
    this.debugOverlay = debugOverlay;
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
    this.overlay = null;
    this.debugOverlay = null;
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
      const thumbState = String(mediaEl.dataset?.thumbState || '').trim().toLowerCase();
      const src = (mediaEl.currentSrc || mediaEl.getAttribute('src') || '').trim();
      const thumbFallback = String(mediaEl.dataset?.thumbFallback || '').trim();
      const hasThumbUrl = String(mediaEl.dataset?.thumbUrl || '').trim().length > 0;
      const ready = !(thumbState && thumbState !== 'loaded')
        && !(hasThumbUrl && thumbFallback && src === thumbFallback)
        && !!src && mediaEl.complete && Number(mediaEl.naturalWidth || 0) > 0;
      if (state) {
        state.thumbLoaded = ready;
        state.renderable = ready;
        state.lastSeenAt = performance.now();
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
    if (!('IntersectionObserver' in window)) {
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
    const rootRect = this.container.getBoundingClientRect();
    const expandedRect = this._expandedRootRect(rootRect);
    const minOverlap = Math.max(18, rootRect.height * 0.1);
    this.trackedCards.forEach((card) => {
      if (!card?.isConnected) {
        this.trackedCards.delete(card);
        return;
      }
      const rect = card.getBoundingClientRect();
      const overlap = Math.min(rect.bottom, expandedRect.bottom) - Math.max(rect.top, expandedRect.top);
      const nearView = this.noVirtualization ? true : overlap > 0;
      const visible = this.noVirtualization ? true : overlap > minOverlap;
      const state = this._getCardState(card, true);
      if (state) {
        state.nearView = nearView;
        state.inView = visible;
        state.lastSeenAt = performance.now();
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
      if (!lowTierFrameSkip || (this._frameCounter % 2) === 0) this._render();
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
      maskTexture: this._maskTexture,
      maskAllocated: this._maskAllocated,
      uCache: this._u,
      debugOverlay: this.debugOverlay,
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
    if (!this.gl || !this.program || !this.quad || !this.overlay || !this.container) return;
    if (this.container.dataset.fxSuspend === '1') {
      this.gl.viewport(0, 0, this.overlay.width || 1, this.overlay.height || 1);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      if (this.debugOverlay) {
        const ctx = this.debugOverlay.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, this.debugOverlay.width, this.debugOverlay.height);
      }
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    let canvasRect = this._lastCanvasRect || this.overlay.getBoundingClientRect();
    if (!this._lastCanvasRect || this.layoutDirty) canvasRect = this.overlay.getBoundingClientRect();
    this._lastCanvasRect = canvasRect;
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
    this.trackedCards.forEach((card) => {
      if (!card?.isConnected) return;
      const state = this._getCardState(card, true);
      if (!state) return;
      state.selected = card.classList.contains('is-selected');
      state.pending = card.dataset.fxEntryPending === '1';
      state.active = this.activeDissolves.has(card);
      state.lastSeenAt = performance.now();
      if (!state.nearView && card.dataset.fxInView !== '1') return;
      if (card.dataset.fxReady !== '1') return;
      if (!this._isRenderableMediaReady(card)) return;
      let cr = this.cardRectCache.get(card);
      if (!cr || this.layoutDirty) {
        cr = card.getBoundingClientRect();
        this.cardRectCache.set(card, cr);
      }
      const viewportOffsets = getViewportOffsets();
      let x1 = (cr.left - canvasRect.left - viewportOffsets.x) * dpr;
      let y1 = (cr.top - canvasRect.top - viewportOffsets.y) * dpr;
      let x2 = (cr.right - canvasRect.left - viewportOffsets.x) * dpr;
      let y2 = (cr.bottom - canvasRect.top - viewportOffsets.y) * dpr;
      x1 += RECT_INSET_PX * dpr;
      y1 += RECT_INSET_PX * dpr;
      x2 -= RECT_INSET_PX * dpr;
      y2 -= RECT_INSET_PX * dpr;
      x1 = Math.max(0, Math.min(width, x1));
      y1 = Math.max(0, Math.min(height, y1));
      x2 = Math.max(0, Math.min(width, x2));
      y2 = Math.max(0, Math.min(height, y2));
      if (x2 <= x1 || y2 <= y1) return;
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
      if (!this.activeDissolves.has(card) && (Date.now() - last >= this.cooldownMs)) {
        this.readyInViewNotPlayedCount += 1;
      }
    });
    const totalCandidates = renderCandidates.length;
    this.renderCandidatesCount = totalCandidates;
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
      window.__assetfx_dbg.lastRectsFrame = Number(window.__assetfx_dbg.lastRectsFrame || 0) + 1;
      window.__assetfx_dbg.lastRectsT = performance.now();
      window.__assetfx_dbg.stateSize = this.stateByKey.size;
      window.__assetfx_dbg.attachedRootId = this._attachedGridRoot?.dataset?.assetfxRootId || null;
      window.__assetfx_dbg.canvasRect = meta.canvasRect || null;
      window.__assetfx_dbg.dpr = Number(meta.dpr || window.devicePixelRatio || 1);
      window.__assetfx_dbg.vvOffset = meta.vvOffset || { ox: 0, oy: 0 };
      window.__assetfx_dbg.rootScrollTop = Number(meta.rootScrollTop || this._attachedGridRoot?.scrollTop || 0);
    }
  }

  _renderDebugRects(cards, width, height) {
    if (!this.debugOverlay) return;
    if (!this.fxDebug) {
      this._publishDebugRects([], {
        canvasRect: this._lastCanvasRect ? {
          left: this._lastCanvasRect.left,
          top: this._lastCanvasRect.top,
          width: this._lastCanvasRect.width,
          height: this._lastCanvasRect.height,
        } : null,
      });
      const ctx = this.debugOverlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.debugOverlay.width || 0, this.debugOverlay.height || 0);
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
    const vv = getViewportOffsets();
    this._publishDebugRects(debugRects, {
      canvasRect: this._lastCanvasRect ? {
        left: this._lastCanvasRect.left,
        top: this._lastCanvasRect.top,
        width: this._lastCanvasRect.width,
        height: this._lastCanvasRect.height,
      } : null,
      dpr: window.devicePixelRatio || 1,
      vvOffset: { ox: vv.x, oy: vv.y },
      rootScrollTop: Number(this._attachedGridRoot?.scrollTop || 0),
    });
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
        position: absolute;
        inset: 0;
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
