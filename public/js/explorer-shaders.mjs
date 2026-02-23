/**
 * public/js/explorer-shaders.mjs
 * WebGL shader helpers for explorer UI effects.
 */

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source.trim());
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create WebGL program');
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

function createQuad(gl) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Failed to create quad buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  return buffer;
}

function attachQuad(gl, program, quadBuffer) {
  const attribute = gl.getAttribLocation(program, 'a_pos');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
}

function createOverlayCanvas(width, height, styles = {}) {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  Object.assign(canvas.style, {
    width: `${Math.max(1, width)}px`,
    height: `${Math.max(1, height)}px`,
    pointerEvents: 'none',
    display: 'block',
    ...styles,
  });
  return canvas;
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
uniform float u_intensity;
uniform sampler2D u_thumb;
uniform bool u_has_thumb;

void main() {
  vec2 center = vec2(0.5);
  vec2 dir = v_uv - center;
  float intensity = clamp(u_intensity, 0.0, 1.0);
  float aberration = 0.010 * intensity;
  vec3 base = vec3(0.08, 0.12, 0.18);
  if (u_has_thumb) {
    float r = texture2D(u_thumb, v_uv + dir * aberration).r;
    float g = texture2D(u_thumb, v_uv).g;
    float b = texture2D(u_thumb, v_uv - dir * aberration).b;
    base = vec3(r, g, b);
  }

  float radius = length(dir);
  float rim = smoothstep(0.33, 0.62, radius);
  float pulse = 0.45 + 0.55 * sin(u_time * 2.8);
  vec3 glow = mix(vec3(0.18, 0.44, 0.92), vec3(0.45, 0.95, 1.0), pulse);
  base += glow * rim * intensity * 0.42;

  float sparkle = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_time * 28.0) * 43758.5453);
  base += (sparkle - 0.5) * 0.018 * intensity;

  gl_FragColor = vec4(base, intensity);
}
`;

const SCANLINE_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float lines = 0.5 + 0.5 * sin((v_uv.y * u_resolution.y * 1.6) + (u_time * 0.85));
  float scan = mix(0.84, 1.0, lines * lines);
  float grain = (hash(v_uv + fract(u_time * 0.03)) - 0.5) * 0.2;
  float vignette = 1.0 - 0.4 * pow(length(v_uv - 0.5) * 1.5, 2.0);
  float value = (grain + (scan - 1.0) * 0.6) * vignette;
  gl_FragColor = vec4(vec3(value + 0.5), 0.34);
}
`;

const PULSE_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform float u_progress;
uniform vec2 u_resolution;

void main() {
  float p = clamp(u_progress, 0.0, 1.0);
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 uv = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);
  float distance = length(uv);
  float radius = p * 0.8;
  float width = mix(0.09, 0.02, p);
  float ring = smoothstep(width, 0.0, abs(distance - radius));
  float fade = 1.0 - p;
  vec3 color = mix(vec3(0.45, 0.25, 0.95), vec3(0.16, 0.88, 0.96), p);
  gl_FragColor = vec4(color, ring * fade * 0.9);
}
`;

const DISSOLVE_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform float u_progress;
uniform float u_time;
uniform sampler2D u_thumb;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    p = p * 2.1 + vec2(1.7, 9.2);
    amp *= 0.45;
  }
  return value;
}

void main() {
  float progress = clamp(u_progress, 0.0, 1.0);
  float threshold = fbm(v_uv * 4.0 + vec2(u_time * 0.08, 0.0)) * 0.5 + 0.5;
  float mask = smoothstep(progress - 0.12, progress + 0.12, threshold);
  vec3 skeleton = vec3(0.055, 0.07, 0.10);
  float sweep = fract((v_uv.x * 0.6) + (v_uv.y * 0.4) - (u_time * 0.5));
  float shimmer = smoothstep(0.0, 0.3, sweep) * smoothstep(0.6, 0.3, sweep);
  skeleton = mix(skeleton, vec3(0.13, 0.18, 0.26), shimmer * (1.0 - progress));

  vec3 thumb = texture2D(u_thumb, v_uv).rgb;
  float edge = exp(-abs(threshold - progress) * 18.0);
  vec3 flash = vec3(0.34, 0.76, 0.98) * edge * 0.5;
  vec3 color = mix(skeleton, thumb, mask) + flash;
  gl_FragColor = vec4(color, 1.0);
}
`;

export class ExplorerShaders {}

export class AssetFX {
  constructor() {
    this._hoverCanvas = null;
    this._hoverGL = null;
    this._hoverProgram = null;
    this._hoverQuad = null;
    this._hoverActiveCard = null;
    this._hoverIntensity = 0;
    this._hoverTargetIntensity = 0;
    this._hoverTexture = null;
    this._hoverTextureReady = false;
    this._hoverStart = performance.now();
    this._hoverRaf = null;
    this._touchTimer = null;
    this._gridListeners = new WeakSet();
  }

  _runHoverLoop() {
    if (this._hoverRaf) cancelAnimationFrame(this._hoverRaf);
    const tick = () => {
      this._drawHover();
      this._hoverRaf = requestAnimationFrame(tick);
    };
    this._hoverRaf = requestAnimationFrame(tick);
  }

  _createHoverCanvas() {
    if (this._hoverCanvas) return;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'fixed',
      zIndex: '30',
      borderRadius: '4px',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 160ms ease',
    });
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this._hoverCanvas = canvas;
    this._hoverGL = gl;
    this._hoverProgram = createProgram(gl, VERT, HOVER_FRAG);
    this._hoverQuad = createQuad(gl);
    this._hoverStart = performance.now();
    this._runHoverLoop();
  }

  _drawHover() {
    if (!this._hoverCanvas || !this._hoverGL || !this._hoverProgram || !this._hoverQuad) return;
    this._hoverIntensity += (this._hoverTargetIntensity - this._hoverIntensity) * 0.12;

    const gl = this._hoverGL;
    const canvas = this._hoverCanvas;
    const card = this._hoverActiveCard;

    if (!card || !card.isConnected) {
      this._hoverTargetIntensity = 0;
      this._hoverActiveCard = null;
      if (this._hoverIntensity < 0.01) {
        canvas.style.opacity = '0';
        return;
      }
    }

    const active = this._hoverActiveCard;
    if (!active || !active.isConnected) return;
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
      opacity: String(this._hoverIntensity),
    });

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this._hoverProgram);
    attachQuad(gl, this._hoverProgram, this._hoverQuad);

    const timeLoc = gl.getUniformLocation(this._hoverProgram, 'u_time');
    const intensityLoc = gl.getUniformLocation(this._hoverProgram, 'u_intensity');
    const thumbLoc = gl.getUniformLocation(this._hoverProgram, 'u_thumb');
    const hasThumbLoc = gl.getUniformLocation(this._hoverProgram, 'u_has_thumb');
    gl.uniform1f(timeLoc, (performance.now() - this._hoverStart) * 0.001);
    gl.uniform1f(intensityLoc, this._hoverIntensity);

    if (this._hoverTextureReady && this._hoverTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._hoverTexture);
      gl.uniform1i(thumbLoc, 0);
      gl.uniform1i(hasThumbLoc, 1);
    } else {
      gl.uniform1i(hasThumbLoc, 0);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _loadTexture(gl, img) {
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  _focusCard(card) {
    if (!card) return;
    this._createHoverCanvas();
    if (!this._hoverGL) return;
    this._hoverActiveCard = card;
    this._hoverTargetIntensity = 1;
    this._hoverTexture = null;
    this._hoverTextureReady = false;
    const img = card.querySelector('img.asset-thumb');
    if (img?.complete && img.naturalWidth > 0) {
      try {
        this._hoverTexture = this._loadTexture(this._hoverGL, img);
        this._hoverTextureReady = Boolean(this._hoverTexture);
      } catch {
        this._hoverTextureReady = false;
      }
    }
  }

  _blurCard() {
    this._hoverTargetIntensity = 0;
  }

  attachGrid(gridEl, cardSelector = '.asset') {
    if (!gridEl || this._gridListeners.has(gridEl)) return;
    this._gridListeners.add(gridEl);

    gridEl.addEventListener('pointerenter', (event) => {
      const card = event.target.closest(cardSelector);
      if (card) this._focusCard(card);
    }, true);
    gridEl.addEventListener('pointerleave', (event) => {
      const card = event.target.closest(cardSelector);
      if (!card) return;
      if (this._hoverActiveCard === card) this._blurCard();
    }, true);
    gridEl.addEventListener('touchstart', (event) => {
      const card = event.target.closest(cardSelector);
      if (!card) return;
      this._focusCard(card);
      clearTimeout(this._touchTimer);
      this._touchTimer = setTimeout(() => this._blurCard(), 650);
    }, { passive: true });
    gridEl.addEventListener('touchend', () => {
      clearTimeout(this._touchTimer);
      this._touchTimer = setTimeout(() => this._blurCard(), 180);
    }, { passive: true });
    gridEl.addEventListener('touchcancel', () => {
      clearTimeout(this._touchTimer);
      this._blurCard();
    }, { passive: true });
  }

  addScanline(cardEl) {
    if (!cardEl || cardEl.dataset.scanlineFx === 'on') return () => {};
    cardEl.dataset.scanlineFx = 'on';
    const rect = cardEl.getBoundingClientRect();
    const canvas = createOverlayCanvas(rect.width || 160, rect.height || 160, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '2',
      borderRadius: 'inherit',
      mixBlendMode: 'overlay',
      opacity: '0.65',
    });

    if (getComputedStyle(cardEl).position === 'static') {
      cardEl.style.position = 'relative';
    }
    cardEl.appendChild(canvas);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return () => {};
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const program = createProgram(gl, VERT, SCANLINE_FRAG);
    const quad = createQuad(gl);
    const start = performance.now();

    let raf = 0;
    const draw = () => {
      if (!canvas.isConnected) {
        cancelAnimationFrame(raf);
        return;
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      attachQuad(gl, program, quad);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), (performance.now() - start) * 0.001);
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      canvas.remove();
      delete cardEl.dataset.scanlineFx;
    };
  }

  pulse(cardEl, { duration = 520 } = {}) {
    if (!cardEl) return;
    if (getComputedStyle(cardEl).position === 'static') cardEl.style.position = 'relative';
    const rect = cardEl.getBoundingClientRect();
    const canvas = createOverlayCanvas(rect.width || 160, rect.height || 160, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '10',
      borderRadius: 'inherit',
    });
    cardEl.appendChild(canvas);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      canvas.remove();
      return;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const program = createProgram(gl, VERT, PULSE_FRAG);
    const quad = createQuad(gl);
    const start = performance.now();

    let raf = 0;
    const draw = () => {
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / duration);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      attachQuad(gl, program, quad);
      gl.uniform1f(gl.getUniformLocation(program, 'u_progress'), progress);
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (progress >= 1 || !canvas.isConnected) {
        canvas.remove();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }

  dissolve(cardEl, imgEl, { duration = 700 } = {}) {
    if (!cardEl || !imgEl) return { cancel: () => {} };
    if (getComputedStyle(cardEl).position === 'static') cardEl.style.position = 'relative';
    const rect = cardEl.getBoundingClientRect();
    const canvas = createOverlayCanvas(rect.width || 160, rect.height || 160, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '3',
      borderRadius: 'inherit',
    });
    cardEl.appendChild(canvas);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      canvas.remove();
      return { cancel: () => {} };
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const program = createProgram(gl, VERT, DISSOLVE_FRAG);
    const quad = createQuad(gl);
    const start = performance.now();
    let revealStart = null;
    let texture = null;
    let raf = 0;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      const now = performance.now();
      const progress = revealStart === null ? 0 : Math.min(1, (now - revealStart) / duration);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      attachQuad(gl, program, quad);
      gl.uniform1f(gl.getUniformLocation(program, 'u_progress'), progress);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), (now - start) * 0.001);
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

    const onLoad = () => {
      if (cancelled) return;
      try {
        texture = this._loadTexture(gl, imgEl);
      } catch {
        texture = null;
      }
      revealStart = performance.now();
      imgEl.style.opacity = '0';
      imgEl.style.transition = 'opacity 0s';
      setTimeout(() => {
        imgEl.style.transition = 'opacity 120ms ease';
        imgEl.style.opacity = '1';
      }, Math.round(duration * 0.84));
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) {
      onLoad();
    } else {
      imgEl.addEventListener('load', onLoad, { once: true });
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
    if (this._hoverRaf) cancelAnimationFrame(this._hoverRaf);
    this._hoverRaf = null;
    clearTimeout(this._touchTimer);
    if (this._hoverCanvas) this._hoverCanvas.remove();
    this._hoverCanvas = null;
    this._hoverGL = null;
    this._hoverProgram = null;
    this._hoverQuad = null;
  }
}
