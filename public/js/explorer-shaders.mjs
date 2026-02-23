/**
 * public/js/explorer-shaders.mjs
 * Asset explorer WebGL/CSS visual effects with iPhone-safe fallbacks.
 *
 * Example:
 *   import { AssetFX } from './js/explorer-shaders.mjs';
 *   const fx = new AssetFX();
 *   fx.attachGrid(document.getElementById('mediaGrid'), '.asset');
 */

function createElement(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function ensureRelative(el) {
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
}

function cssEscape(value) {
  const text = String(value ?? '');
  if (window.CSS?.escape) return window.CSS.escape(text);
  return text.replace(/(["'\\#.:;,!?+*~^$\[\]()=>|/@])/g, '\\$1');
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, source.trim());
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'shader compile error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function buildProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create program');
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'program link error';
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return program;
}

function createQuad(gl) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Could not create quad buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return buffer;
}

function useQuad(gl, program, buffer) {
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const HOVER_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_strength;
uniform sampler2D u_thumb;
uniform bool u_has_thumb;

void main() {
  vec2 center = vec2(0.5);
  vec2 dir = v_uv - center;
  float strength = clamp(u_strength, 0.0, 1.0);
  float ca = 0.012 * strength;
  vec3 color = vec3(0.08, 0.12, 0.18);

  if (u_has_thumb) {
    float r = texture2D(u_thumb, v_uv + dir * ca).r;
    float g = texture2D(u_thumb, v_uv).g;
    float b = texture2D(u_thumb, v_uv - dir * ca).b;
    color = vec3(r, g, b);
  }

  float edge = smoothstep(0.36, 0.70, length(dir));
  float pulse = 0.5 + 0.5 * sin(u_time * 3.0);
  vec3 glow = mix(vec3(0.25, 0.55, 1.0), vec3(0.55, 0.95, 1.0), pulse);
  color += glow * edge * strength * 0.70;

  gl_FragColor = vec4(color, strength);
}
`;

const DISSOLVE_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform float u_progress;
uniform float u_time;
uniform sampler2D u_thumb;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  float progress = clamp(u_progress, 0.0, 1.0);
  float field = noise(v_uv * 6.0 + vec2(u_time * 0.2, 0.0));
  float mask = smoothstep(progress - 0.15, progress + 0.15, field);
  float sweep = fract((v_uv.x * 0.7 + v_uv.y * 0.35) - u_time * 0.5);
  float shimmer = smoothstep(0.0, 0.3, sweep) * smoothstep(0.7, 0.3, sweep);
  vec3 skeleton = mix(vec3(0.06, 0.08, 0.12), vec3(0.16, 0.21, 0.30), shimmer * (1.0 - progress));
  vec3 thumb = texture2D(u_thumb, v_uv).rgb;
  float edge = exp(-abs(field - progress) * 18.0);
  vec3 edgeColor = vec3(0.45, 0.88, 1.0) * edge * 0.65;
  gl_FragColor = vec4(mix(skeleton, thumb, mask) + edgeColor, 1.0);
}
`;

export class ExplorerShaders {}

export class AssetFX {
  constructor() {
    this.webglEnabled = supportsWebGL();
    this.hoverCanvas = null;
    this.hoverGL = null;
    this.hoverProgram = null;
    this.hoverQuad = null;
    this.hoverTexture = null;
    this.hoverHasTexture = false;
    this.hoverTarget = null;
    this.hoverStrength = 0;
    this.hoverGoal = 0;
    this.hoverStart = performance.now();
    this.hoverRaf = 0;
    this.touchTimer = null;
    this.boundGrids = new WeakSet();
  }

  attachGrid(gridEl, cardSelector = '.asset') {
    if (!gridEl || this.boundGrids.has(gridEl)) return;
    this.boundGrids.add(gridEl);

    gridEl.addEventListener('pointerenter', (event) => {
      const card = event.target.closest(cardSelector);
      if (card) this._focus(card);
    }, true);

    gridEl.addEventListener('pointerleave', (event) => {
      const card = event.target.closest(cardSelector);
      if (card && card === this.hoverTarget) this._blur();
    }, true);

    gridEl.addEventListener('touchstart', (event) => {
      const card = event.target.closest(cardSelector);
      if (!card) return;
      this._focus(card);
      clearTimeout(this.touchTimer);
      this.touchTimer = setTimeout(() => this._blur(), 700);
    }, { passive: true });

    gridEl.addEventListener('touchend', () => {
      clearTimeout(this.touchTimer);
      this.touchTimer = setTimeout(() => this._blur(), 180);
    }, { passive: true });

    gridEl.addEventListener('touchcancel', () => {
      clearTimeout(this.touchTimer);
      this._blur();
    }, { passive: true });
  }

  addScanline(cardEl) {
    if (!cardEl || cardEl.dataset.scanlineFx === 'on') return () => {};
    ensureRelative(cardEl);
    cardEl.dataset.scanlineFx = 'on';

    const overlay = createElement('div', 'fx-scanline-overlay');
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: '2',
      mixBlendMode: 'overlay',
      backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 1px, rgba(0,0,0,0.0) 2px, rgba(0,0,0,0.0) 4px)',
      opacity: '0.42',
      transition: 'opacity 220ms ease',
      animation: 'fx-scanline-pan 4.5s linear infinite',
    });

    this._ensureSharedStyles();
    cardEl.appendChild(overlay);

    return () => {
      overlay.remove();
      delete cardEl.dataset.scanlineFx;
    };
  }

  pulse(cardEl, { duration = 520 } = {}) {
    if (!cardEl) return () => {};
    ensureRelative(cardEl);
    const ring = createElement('div', 'fx-selection-pulse');
    Object.assign(ring.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: 'inherit',
      border: '2px solid rgba(80, 220, 255, 0.88)',
      boxShadow: '0 0 0 0 rgba(80, 220, 255, 0.65)',
      pointerEvents: 'none',
      zIndex: '12',
      animation: `fx-selection-pulse ${Math.max(240, duration)}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
    });

    this._ensureSharedStyles();
    cardEl.appendChild(ring);
    const timeout = window.setTimeout(() => ring.remove(), Math.max(240, duration) + 80);
    return () => {
      clearTimeout(timeout);
      ring.remove();
    };
  }

  dissolve(cardEl, imgEl, { duration = 600 } = {}) {
    if (!cardEl || !imgEl) return { cancel: () => {} };
    ensureRelative(cardEl);

    if (!this.webglEnabled) {
      const fallback = this._cssDissolve(cardEl, imgEl, duration);
      return { cancel: fallback };
    }

    const rect = cardEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((rect.width || 160) * dpr));
    canvas.height = Math.max(1, Math.round((rect.height || 160) * dpr));
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: '3',
    });

    cardEl.appendChild(canvas);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      canvas.remove();
      const fallback = this._cssDissolve(cardEl, imgEl, duration);
      return { cancel: fallback };
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    let program;
    let quad;
    try {
      program = buildProgram(gl, VERT, DISSOLVE_FRAG);
      quad = createQuad(gl);
    } catch {
      canvas.remove();
      const fallback = this._cssDissolve(cardEl, imgEl, duration);
      return { cancel: fallback };
    }

    let texture = null;
    let revealStart = 0;
    let raf = 0;
    let cancelled = false;
    const startedAt = performance.now();

    const loadTexture = () => {
      if (cancelled) return;
      try {
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgEl);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      } catch {
        texture = null;
      }
      revealStart = performance.now();
      imgEl.style.opacity = '0';
      imgEl.style.transition = 'opacity 0s';
      setTimeout(() => {
        imgEl.style.transition = 'opacity 100ms ease';
        imgEl.style.opacity = '1';
      }, Math.round(duration * 0.85));
    };

    const draw = () => {
      if (cancelled) return;
      const now = performance.now();
      const progress = revealStart ? Math.min(1, (now - revealStart) / duration) : 0;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      useQuad(gl, program, quad);
      gl.uniform1f(gl.getUniformLocation(program, 'u_progress'), progress);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), (now - startedAt) * 0.001);
      if (texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_thumb'), 0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (progress >= 1 || !canvas.isConnected) {
        canvas.remove();
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) {
      loadTexture();
    } else {
      imgEl.addEventListener('load', loadTexture, { once: true });
    }

    raf = requestAnimationFrame(draw);

    return {
      cancel: () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        canvas.remove();
      },
    };
  }

  destroy() {
    cancelAnimationFrame(this.hoverRaf);
    this.hoverRaf = 0;
    clearTimeout(this.touchTimer);
    this.touchTimer = null;
    if (this.hoverCanvas) this.hoverCanvas.remove();
    this.hoverCanvas = null;
    this.hoverGL = null;
    this.hoverProgram = null;
    this.hoverQuad = null;
    this.hoverTexture = null;
    this.hoverHasTexture = false;
    this.hoverTarget = null;
    this.hoverStrength = 0;
    this.hoverGoal = 0;
  }

  _focus(cardEl) {
    if (!cardEl) return;
    this._setCardFocusStyle(cardEl, true);
    this.hoverTarget = cardEl;
    this.hoverGoal = 1;
    this._startHoverLoop();
  }

  _blur() {
    if (this.hoverTarget) this._setCardFocusStyle(this.hoverTarget, false);
    this.hoverGoal = 0;
  }

  _startHoverLoop() {
    if (this.hoverRaf) return;
    if (!this.webglEnabled) return;
    this._ensureHoverCanvas();
    if (!this.hoverGL || !this.hoverProgram || !this.hoverQuad) return;
    const tick = () => {
      this._drawHover();
      this.hoverRaf = requestAnimationFrame(tick);
    };
    this.hoverRaf = requestAnimationFrame(tick);
  }

  _drawHover() {
    const gl = this.hoverGL;
    const canvas = this.hoverCanvas;
    const card = this.hoverTarget;
    if (!gl || !canvas || !this.hoverProgram || !this.hoverQuad) return;

    this.hoverStrength += (this.hoverGoal - this.hoverStrength) * 0.14;
    if (!card || !card.isConnected) {
      this.hoverGoal = 0;
      this.hoverTarget = null;
    }

    if (!this.hoverTarget || this.hoverStrength < 0.01) {
      canvas.style.opacity = '0';
      return;
    }

    const active = this.hoverTarget;
    const rect = active.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    Object.assign(canvas.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      opacity: String(this.hoverStrength),
    });

    this._syncHoverTexture(active);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.hoverProgram);
    useQuad(gl, this.hoverProgram, this.hoverQuad);
    gl.uniform1f(gl.getUniformLocation(this.hoverProgram, 'u_time'), (performance.now() - this.hoverStart) * 0.001);
    gl.uniform1f(gl.getUniformLocation(this.hoverProgram, 'u_strength'), this.hoverStrength);
    if (this.hoverHasTexture && this.hoverTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.hoverTexture);
      gl.uniform1i(gl.getUniformLocation(this.hoverProgram, 'u_thumb'), 0);
      gl.uniform1i(gl.getUniformLocation(this.hoverProgram, 'u_has_thumb'), 1);
    } else {
      gl.uniform1i(gl.getUniformLocation(this.hoverProgram, 'u_has_thumb'), 0);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _ensureHoverCanvas() {
    if (this.hoverCanvas) return;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'fixed',
      pointerEvents: 'none',
      borderRadius: 'inherit',
      zIndex: '32',
      opacity: '0',
      transition: 'opacity 140ms ease',
    });
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      canvas.remove();
      this.webglEnabled = false;
      return;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    try {
      this.hoverProgram = buildProgram(gl, VERT, HOVER_FRAG);
      this.hoverQuad = createQuad(gl);
      this.hoverGL = gl;
      this.hoverCanvas = canvas;
    } catch {
      canvas.remove();
      this.webglEnabled = false;
      this.hoverGL = null;
      this.hoverProgram = null;
      this.hoverQuad = null;
    }
  }

  _syncHoverTexture(cardEl) {
    const gl = this.hoverGL;
    if (!gl) return;
    const img = cardEl.querySelector('img.asset-thumb');
    if (!img?.complete || img.naturalWidth === 0) {
      this.hoverHasTexture = false;
      return;
    }
    try {
      if (!this.hoverTexture) this.hoverTexture = gl.createTexture();
      if (!this.hoverTexture) {
        this.hoverHasTexture = false;
        return;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.hoverTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.hoverHasTexture = true;
    } catch {
      this.hoverHasTexture = false;
    }
  }

  _setCardFocusStyle(cardEl, active) {
    if (!cardEl) return;
    cardEl.style.transition = cardEl.style.transition || 'transform 180ms ease, box-shadow 180ms ease, filter 180ms ease';
    if (active) {
      cardEl.style.transform = 'translateY(-1px) scale(1.01)';
      cardEl.style.boxShadow = '0 8px 20px rgba(40, 180, 255, 0.35), 0 0 0 1px rgba(80, 220, 255, 0.45) inset';
      cardEl.style.filter = 'saturate(1.12)';
    } else {
      cardEl.style.transform = '';
      cardEl.style.boxShadow = '';
      cardEl.style.filter = '';
    }
  }

  _cssDissolve(cardEl, imgEl, duration) {
    ensureRelative(cardEl);
    const veil = createElement('div', 'fx-dissolve-fallback');
    Object.assign(veil.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: '3',
      background: 'linear-gradient(125deg, rgba(28,45,78,0.95), rgba(39,95,143,0.72), rgba(92,189,223,0.38))',
      opacity: '1',
      transition: `opacity ${Math.max(220, duration)}ms ease`,
    });
    cardEl.appendChild(veil);

    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      imgEl.style.opacity = '0';
      imgEl.style.transition = 'opacity 0s';
      requestAnimationFrame(() => {
        veil.style.opacity = '0';
        setTimeout(() => {
          imgEl.style.transition = 'opacity 120ms ease';
          imgEl.style.opacity = '1';
          veil.remove();
        }, Math.max(80, Math.round(duration * 0.7)));
      });
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) {
      reveal();
    } else {
      imgEl.addEventListener('load', reveal, { once: true });
    }

    return () => {
      cancelled = true;
      veil.remove();
    };
  }

  _ensureSharedStyles() {
    if (document.getElementById('asset-fx-shared-styles')) return;
    const style = document.createElement('style');
    style.id = 'asset-fx-shared-styles';
    style.textContent = `
      @keyframes fx-selection-pulse {
        0% { opacity: 0.95; transform: scale(0.94); box-shadow: 0 0 0 0 rgba(80,220,255,0.58); }
        70% { opacity: 0.55; transform: scale(1.02); box-shadow: 0 0 0 12px rgba(80,220,255,0.0); }
        100% { opacity: 0; transform: scale(1.04); box-shadow: 0 0 0 18px rgba(80,220,255,0.0); }
      }
      @keyframes fx-scanline-pan {
        0% { background-position-y: 0; }
        100% { background-position-y: 16px; }
      }
    `;
    document.head.appendChild(style);
  }
}

export { cssEscape };
