'use client';

import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const VERT = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main(){
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAG = `
  precision highp float;
  varying vec2 v_uv;
  uniform vec2  u_res;
  uniform float u_time;

  #define PI  3.14159265358979
  #define TAU 6.28318530717959

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

  vec3 palette(float depth, float angle){
    float h = depth * 0.18 + u_time * 0.12;
    vec3 amber  = vec3(1.00, 0.50, 0.06);
    vec3 violet = vec3(0.30, 0.06, 0.85);
    vec3 ice    = vec3(0.06, 0.65, 1.00);
    float ta = sin(h) * 0.5 + 0.5;
    float tb = sin(h * 0.61 + 1.9) * 0.5 + 0.5;
    float angWarm = sin(angle + u_time * 0.08) * 0.5 + 0.5;
    vec3 base = mix(mix(violet, amber, ta * 0.7), ice, tb * 0.3);
    return base * (0.7 + 0.3 * angWarm);
  }

  void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    uv.x *= u_res.x / u_res.y;

    float sway = sin(u_time * 0.19) * 0.10;
    float nod  = cos(u_time * 0.14) * 0.07;
    uv -= vec2(sway, nod);

    float radius = length(uv);
    float angle  = atan(uv.y, uv.x);

    float speed = 1.4;
    float depth = 1.0 / max(radius, 0.001) + u_time * speed;

    float twist  = depth * 0.22 + sin(depth * 0.11) * 0.5;
    float tAngle = angle + twist;

    float ringFreq1 = 2.8;
    float ring1 = sin(fract(depth * ringFreq1) * TAU);
    float ringFreq2 = 2.8;
    float ring2 = sin(fract(depth * ringFreq2 + 0.5) * TAU);

    float angMod  = 0.82 + 0.18 * sin(tAngle * 5.0 + depth * 0.3);
    float angMod2 = 0.88 + 0.12 * cos(tAngle * 3.0 - depth * 0.2);

    float sharpness = 18.0;
    float g1 = pow(max(ring1 * angMod,  0.0), sharpness);
    float g2 = pow(max(ring2 * angMod2, 0.0), sharpness) * 0.6;

    float att  = radius * 1.6;
    float glow = (g1 + g2) * att;

    vec3 col = palette(depth, tAngle) * glow;

    float centerGlow = exp(-radius * 3.5);
    col += palette(depth + 40.0, angle) * centerGlow * 0.25;

    col += vec3(0.008, 0.003, 0.018);

    col = col / (col + vec3(0.45));
    col = pow(max(col, 0.0), vec3(0.88));

    float vig = 1.0 - smoothstep(0.5, 1.35, length((v_uv*2.0-1.0) * vec2(0.75, 0.95)));
    col *= vig;

    col += (hash(v_uv * u_res + fract(u_time * 0.07)) - 0.5) * 0.014;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

type RenderResources = {
  buffer: WebGLBuffer | null;
  fragmentShader: WebGLShader | null;
  program: WebGLProgram | null;
  vertexShader: WebGLShader | null;
};

const EMPTY_RESOURCES: RenderResources = {
  buffer: null,
  fragmentShader: null,
  program: null,
  vertexShader: null,
};

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('shader allocation error');
  }
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) ?? 'shader compile error';
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}

function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('program allocation error');
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) ?? 'program link error';
    gl.deleteProgram(program);
    throw new Error(error);
  }
  return program;
}

function Coords() {
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0, depth: 0, sector: 0 });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const frameMs = mediaQuery.matches ? 1000 / 12 : 1000 / 30;
    const t0 = performance.now();
    let raf = 0;
    let lastTick = t0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - lastTick < frameMs) {
        return;
      }
      lastTick = now;
      const t = (now - t0) / 1000;
      setCoords({
        x: Math.sin(t * 0.23) * 0.12,
        y: Math.cos(t * 0.17) * 0.07,
        z: t * 1.8,
        depth: t * 1.8 * 3.2,
        sector: Math.floor(t / 8),
      });
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fmt = (n: number, d = 2) => n.toFixed(d).padStart(7);

  return (
    <>
      <div className="void-hud void-hud-left" aria-hidden="true">
        <div>X  {fmt(coords.x, 4)}</div>
        <div>Y  {fmt(coords.y, 4)}</div>
        <div>Z  {fmt(coords.z, 2)}</div>
      </div>
      <div className="void-hud void-hud-right" aria-hidden="true">
        <div>DEPTH   {fmt(coords.depth, 1)}m</div>
        <div>SECTOR  {String(coords.sector).padStart(4, '0')}</div>
      </div>
    </>
  );
}

function TunnelCanvas({ onUnavailable }: { onUnavailable: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let disposed = false;
    let lastWidth = 0;
    let lastHeight = 0;
    let gl: WebGLRenderingContext | null = null;
    let resources: RenderResources = { ...EMPTY_RESOURCES };
    let uRes: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let scale = 0.85;
    let frameMs = 1000 / 60;
    const t0 = performance.now();
    let lastFrame = t0;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const applyMotionPreferences = () => {
      scale = mediaQuery.matches ? 0.65 : 0.85;
      frameMs = mediaQuery.matches ? 1000 / 30 : 1000 / 60;
      lastWidth = 0;
      lastHeight = 0;
    };

    const releaseResources = () => {
      if (!gl) {
        resources = { ...EMPTY_RESOURCES };
        uRes = null;
        uTime = null;
        return;
      }
      if (!gl.isContextLost()) {
        if (resources.buffer) gl.deleteBuffer(resources.buffer);
        if (resources.program) gl.deleteProgram(resources.program);
        if (resources.vertexShader) gl.deleteShader(resources.vertexShader);
        if (resources.fragmentShader) gl.deleteShader(resources.fragmentShader);
      }
      resources = { ...EMPTY_RESOURCES };
      uRes = null;
      uTime = null;
    };

    const resize = () => {
      if (!gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, mediaQuery.matches ? 1.5 : 2);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr * scale));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr * scale));
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    const initScene = () => {
      releaseResources();
      gl = canvas.getContext('webgl', {
        antialias: false,
        alpha: false,
        depth: false,
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
        stencil: false,
      });
      if (!gl) {
        onUnavailable();
        return false;
      }

      try {
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERT);
        const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
        const program = linkProgram(gl, vertexShader, fragmentShader);
        const buffer = gl.createBuffer();
        if (!buffer) {
          throw new Error('buffer allocation error');
        }
        resources = { buffer, fragmentShader, program, vertexShader };

        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW,
        );

        const aPos = gl.getAttribLocation(program, 'a_pos');
        if (aPos < 0) {
          throw new Error('a_pos attribute missing');
        }
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        uRes = gl.getUniformLocation(program, 'u_res');
        uTime = gl.getUniformLocation(program, 'u_time');
        gl.clearColor(0, 0, 0, 1);
        resize();
        return true;
      } catch (error) {
        console.error('Explorer not-found WebGL initialization failed.', error);
        onUnavailable();
        releaseResources();
        return false;
      }
    };

    const render = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(render);
      if (!gl || !resources.program || !uRes || !uTime || document.hidden) {
        return;
      }
      if (now - lastFrame < frameMs * 0.9) {
        return;
      }
      lastFrame = now;
      resize();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const restart = () => {
      cancelAnimationFrame(raf);
      applyMotionPreferences();
      if (initScene()) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(render);
      }
    };

    const handleResize = () => resize();
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        lastFrame = performance.now();
        resize();
      }
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      releaseResources();
    };
    const handleContextRestored = () => {
      restart();
    };

    const handleMotionPreferenceChange = () => {
      applyMotionPreferences();
      resize();
    };

    mediaQuery.addEventListener?.('change', handleMotionPreferenceChange);
    mediaQuery.addListener?.(handleMotionPreferenceChange);
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    applyMotionPreferences();
    restart();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      mediaQuery.removeEventListener?.('change', handleMotionPreferenceChange);
      mediaQuery.removeListener?.(handleMotionPreferenceChange);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      releaseResources();
      gl = null;
    };
  }, [onUnavailable]);

  return <canvas ref={canvasRef} className="void-canvas" data-webgl-canvas="tunnel" aria-hidden="true" />;
}

export default function NotFound() {
  const router = useRouter();
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const handleSurface = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (window.history.length > 1) {
        router.back();
        return;
      }
      router.replace('/');
    },
    [router],
  );

  return (
    <main className="void-page" data-explorer-default-not-found="true">
      <style jsx>{`
        :global(html),
        :global(body) {
          width: 100%;
          height: 100%;
          background: #000;
          overflow: hidden;
        }

        @keyframes breathe {
          0%,
          100% {
            opacity: 0.88;
            filter: brightness(1);
          }
          50% {
            opacity: 1;
            filter: brightness(1.12);
          }
        }

        @keyframes fadein {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .void-page {
          position: relative;
          min-height: 100dvh;
          width: 100%;
          overflow: clip;
          background:
            radial-gradient(circle at 50% 58%, rgba(116, 58, 255, 0.18), transparent 26%),
            radial-gradient(circle at 50% 50%, rgba(16, 8, 36, 0.78), rgba(0, 0, 0, 0.98) 72%);
          isolation: isolate;
        }

        .void-page::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.36));
          pointer-events: none;
          z-index: 1;
        }

        .void-canvas {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          display: block;
          z-index: 0;
          transform: translateZ(0);
          backface-visibility: hidden;
          touch-action: none;
        }

        .void-center {
          position: fixed;
          inset: 0;
          z-index: 3;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          padding: 32px 20px 108px;
          text-align: center;
          pointer-events: none;
        }

        .label404 {
          font-family: var(--font-void-display), Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
          font-size: clamp(120px, 25vw, 260px);
          line-height: 0.88;
          letter-spacing: -0.02em;
          color: transparent;
          background: linear-gradient(
            160deg,
            rgba(255, 255, 255, 0.96) 0%,
            rgba(180, 160, 255, 0.85) 40%,
            rgba(100, 80, 200, 0.5) 100%
          );
          -webkit-background-clip: text;
          background-clip: text;
          mix-blend-mode: screen;
          text-shadow: 0 0 42px rgba(120, 88, 255, 0.16);
          animation: breathe 4.2s ease-in-out infinite;
        }

        .tagline {
          margin-top: 28px;
          font-family: var(--font-void-mono), ui-monospace, monospace;
          font-style: italic;
          font-weight: 300;
          font-size: clamp(11px, 1.6vw, 18px);
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(160, 140, 255, 0.75);
          mix-blend-mode: screen;
          animation: fadein 2.4s ease 0.6s both;
        }

        .surfaceCta {
          margin-top: 52px;
          min-width: min(330px, calc(100vw - 64px));
          font-family: var(--font-void-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: clamp(10px, 1.2vw, 14px);
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.42);
          text-decoration: none;
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 14px 32px;
          border-radius: 2px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(98, 72, 173, 0.07));
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.18);
          transition:
            color 180ms ease,
            border-color 180ms ease,
            background 180ms ease,
            transform 180ms ease,
            box-shadow 180ms ease;
          animation: fadein 2.8s ease 1.2s both;
          cursor: pointer;
          pointer-events: auto;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          gap: 0.8em;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .surfaceCta:hover,
        .surfaceCta:focus-visible {
          color: rgba(218, 206, 255, 0.95);
          border-color: rgba(180, 140, 255, 0.42);
          background: rgba(120, 80, 255, 0.11);
          box-shadow: 0 18px 48px rgba(42, 20, 88, 0.28);
          transform: translateY(-1px);
          outline: none;
        }

        .surfaceCta:active {
          transform: translateY(0);
          background: rgba(120, 80, 255, 0.16);
        }

        .void-fallback {
          position: fixed;
          left: 50%;
          bottom: 112px;
          z-index: 4;
          transform: translateX(-50%);
          font-family: var(--font-void-mono), ui-monospace, monospace;
          font-size: clamp(10px, 1vw, 12px);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(196, 182, 255, 0.72);
          padding: 10px 14px;
          border: 1px solid rgba(171, 146, 255, 0.18);
          background: rgba(11, 7, 24, 0.58);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          white-space: nowrap;
          pointer-events: none;
        }

        :global(.void-hud) {
          position: fixed;
          bottom: 24px;
          z-index: 3;
          font-family: var(--font-void-mono), ui-monospace, monospace;
          font-style: italic;
          font-weight: 300;
          font-size: 10px;
          letter-spacing: 0.18em;
          pointer-events: none;
          line-height: 1.8;
        }

        :global(.void-hud-left) {
          left: 28px;
          color: rgba(255, 255, 255, 0.18);
        }

        :global(.void-hud-right) {
          right: 28px;
          color: rgba(160, 130, 255, 0.3);
          text-align: right;
        }

        .srOnly {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .label404,
          .tagline,
          .surfaceCta {
            animation-duration: 0.01ms;
            animation-iteration-count: 1;
          }

          .surfaceCta {
            transition: none;
          }
        }

        @media (max-width: 720px) {
          .void-center {
            padding-top: 64px;
            padding-bottom: 144px;
          }

          .tagline {
            margin-top: 20px;
            letter-spacing: 0.2em;
            max-width: min(92vw, 24ch);
          }

          .surfaceCta {
            min-width: min(320px, calc(100vw - 40px));
            margin-top: 42px;
          }

          .void-fallback {
            bottom: 94px;
            max-width: calc(100vw - 32px);
            white-space: normal;
            text-align: center;
            line-height: 1.5;
          }

          :global(.void-hud) {
            bottom: 18px;
            font-size: 9px;
          }

          :global(.void-hud-left) {
            left: 18px;
          }

          :global(.void-hud-right) {
            right: 18px;
          }
        }
      `}</style>

      <TunnelCanvas onUnavailable={() => setWebglUnavailable(true)} />

      <div className="void-center">
        <h1 className="label404">404</h1>
        <p className="tagline">This page fell through the void</p>
        <a href="/" className="surfaceCta" onClick={handleSurface}>
          <span aria-hidden="true">←</span>
          <span>Surface</span>
          <span className="srOnly">Return to the Explorer surface</span>
        </a>
      </div>

      {webglUnavailable ? (
        <div className="void-fallback" data-webgl-fallback="true" aria-live="polite">
          WebGL tunnel unavailable — returning through the stillness.
        </div>
      ) : null}

      <Coords />
    </main>
  );
}
