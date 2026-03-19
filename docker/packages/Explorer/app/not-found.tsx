'use client'

import { useEffect, useRef, useState } from 'react'

// ── shader sources (verbatim from working HTML) ───────────────────────────────

const VERT = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main(){
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`

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
`

// ── WebGL helpers ─────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile error')
  return s
}

function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'program link error')
  return p
}

// ── Tunnel canvas component ───────────────────────────────────────────────────

function TunnelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = (
      canvas.getContext('webgl', { antialias: false, alpha: false }) as WebGLRenderingContext | null
    )
    if (!gl) return

    // compile
    const prog = linkProgram(
      gl,
      compileShader(gl, gl.VERTEX_SHADER, VERT),
      compileShader(gl, gl.FRAGMENT_SHADER, FRAG),
    )
    gl.useProgram(prog)

    // fullscreen quad
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes  = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')

    const DPR   = Math.min(window.devicePixelRatio || 1, 2)
    const SCALE = 0.85
    let lw = 0, lh = 0

    function resize() {
      const w = Math.floor(window.innerWidth  * DPR * SCALE)
      const h = Math.floor(window.innerHeight * DPR * SCALE)
      if (w === lw && h === lh) return
      lw = w; lh = h
      canvas.width  = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }

    window.addEventListener('resize', resize, { passive: true })
    resize()

    const t0 = performance.now()
    let raf = 0
    let lastRaf = t0
    const FRAME_MS = 1000 / 60

    function loop(now: number) {
      raf = requestAnimationFrame(loop)
      if (now - lastRaf < FRAME_MS * 0.9) return
      lastRaf = now
      resize()
      const t = (now - t0) / 1000
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, t)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    raf = requestAnimationFrame(loop)

    const onContextLost = (e: Event) => e.preventDefault()
    canvas.addEventListener('webglcontextlost', onContextLost)

    // cleanup
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'block',
      }}
    />
  )
}

// ── HUD coords ────────────────────────────────────────────────────────────────

function Coords() {
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0, depth: 0, sector: 0 })

  useEffect(() => {
    const t0 = performance.now()
    let raf = 0

    function tick() {
      raf = requestAnimationFrame(tick)
      const t = (performance.now() - t0) / 1000
      setCoords({
        x:      Math.sin(t * 0.23) * 0.12,
        y:      Math.cos(t * 0.17) * 0.07,
        z:      t * 1.8,
        depth:  t * 1.8 * 3.2,
        sector: Math.floor(t / 8),
      })
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const fmt = (n: number, d = 2) => n.toFixed(d).padStart(7)

  return (
    <>
      {/* bottom-left */}
      <div style={{
        position: 'fixed', bottom: 24, left: 28,
        fontFamily: '"DM Mono", ui-monospace, monospace',
        fontStyle: 'italic', fontWeight: 300,
        fontSize: 10, letterSpacing: '0.18em',
        color: 'rgba(255,255,255,0.18)',
        pointerEvents: 'none', zIndex: 10,
        lineHeight: 1.8,
      }}>
        <div>X  {fmt(coords.x, 4)}</div>
        <div>Y  {fmt(coords.y, 4)}</div>
        <div>Z  {fmt(coords.z, 2)}</div>
      </div>

      {/* bottom-right */}
      <div style={{
        position: 'fixed', bottom: 24, right: 28,
        fontFamily: '"DM Mono", ui-monospace, monospace',
        fontStyle: 'italic', fontWeight: 300,
        fontSize: 10, letterSpacing: '0.18em',
        color: 'rgba(160,130,255,0.3)',
        pointerEvents: 'none', zIndex: 10,
        textAlign: 'right', lineHeight: 1.8,
      }}>
        <div>DEPTH   {fmt(coords.depth, 1)}m</div>
        <div>SECTOR  {String(coords.sector).padStart(4, '0')}</div>
      </div>
    </>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function NotFound() {
  return (
    <>
      {/*
        Google Fonts -- add to your layout.tsx <head> instead if preferred:
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:ital,wght@1,300&display=swap" rel="stylesheet" />
      */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:ital,wght@0,300;1,300&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }

        @keyframes breathe {
          0%, 100% { opacity: 0.88; filter: brightness(1); }
          50%       { opacity: 1.0;  filter: brightness(1.12); }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .label-404 {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(120px, 25vw, 260px);
          line-height: 0.88;
          letter-spacing: -0.02em;
          color: transparent;
          background: linear-gradient(
            160deg,
            rgba(255,255,255,0.96) 0%,
            rgba(180,160,255,0.85) 40%,
            rgba(100,80,200,0.5) 100%
          );
          -webkit-background-clip: text;
          background-clip: text;
          mix-blend-mode: screen;
          animation: breathe 4.2s ease-in-out infinite;
        }

        .tagline {
          margin-top: 28px;
          font-family: 'DM Mono', monospace;
          font-style: italic;
          font-weight: 300;
          font-size: clamp(11px, 1.6vw, 18px);
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(160, 140, 255, 0.75);
          mix-blend-mode: screen;
          animation: fadein 2.4s ease 0.6s both;
        }

        .back-link {
          margin-top: 52px;
          font-family: 'DM Mono', monospace;
          font-weight: 300;
          font-size: clamp(10px, 1.2vw, 14px);
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          text-decoration: none;
          border: 1px solid rgba(255,255,255,0.12);
          padding: 12px 32px;
          border-radius: 2px;
          transition: color 0.3s, border-color 0.3s, background 0.3s;
          animation: fadein 2.8s ease 1.2s both;
          cursor: pointer;
        }
        .back-link:hover {
          color: rgba(200, 180, 255, 0.95);
          border-color: rgba(180, 140, 255, 0.4);
          background: rgba(120, 80, 255, 0.08);
        }
      `}</style>

      {/* WebGL background */}
      <TunnelCanvas />

      {/* centered UI */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div className="label-404">404</div>
        <div className="tagline">This page fell through the void</div>
        <a
          href="/"
          className="back-link"
          style={{ pointerEvents: 'all' }}
          onClick={(e) => { e.preventDefault(); history.back() }}
        >
          ← Surface
        </a>
      </div>

      {/* telemetry HUD */}
      <Coords />
    </>
  )
}