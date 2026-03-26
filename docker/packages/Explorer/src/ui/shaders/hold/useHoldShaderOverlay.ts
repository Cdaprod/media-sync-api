import { useCallback, useEffect, useRef } from 'react';

import { createFullscreenWebGLProgram } from '../core/createFullscreenWebGLProgram';
import type { OverlayPoint } from '../shared/interactionShaderTypes';

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * .5 + .5;
  gl_Position = vec4(a_pos, 0., 1.);
}
`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_active;
uniform float u_progress;
uniform float u_complete;
void main(){
  vec2 p = v_uv - u_center;
  p.x *= u_res.x / max(u_res.y, 1.0);
  float d = length(p);
  float pi = 3.14159265;
  float ringR = 0.052 - u_complete * 0.006;
  float ringW = 0.0045;
  float ring = smoothstep(ringR + ringW, ringR, d) * (1.0 - smoothstep(ringR, ringR - ringW, d));

  float haloR = ringR + 0.024;
  float halo = smoothstep(haloR, ringR - 0.004, d) * 0.26;

  float angle = atan(p.y, p.x);
  float clockwise = fract(1.25 - angle / (2.0 * pi));
  float head = clamp(u_progress, 0.0, 1.0);
  float tail = max(0.0, head - 0.22);
  float arcMask = smoothstep(tail, tail + 0.015, clockwise) * (1.0 - smoothstep(head, head + 0.015, clockwise));
  float arc = ring * arcMask;
  float progressGlow = ring * smoothstep(0.0, 1.0, u_progress);

  vec3 baseCol = vec3(0.60, 0.36, 0.96);
  vec3 arcCol = vec3(0.86, 0.70, 1.0);
  float completionPop = u_complete * (0.72 + halo * 0.35);

  vec3 col = baseCol * (ring * 0.75 + halo * 0.55);
  col += arcCol * (arc * 1.35 + progressGlow * 0.22);
  col += arcCol * completionPop;
  float alpha = (ring * 0.82 + halo * 0.35 + arc * 0.92 + completionPop * 0.55) * u_active;
  gl_FragColor = vec4(col, alpha);
}
`;

export function useHoldShaderOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointRef = useRef<OverlayPoint>(null);
  const activeRef = useRef(false);
  const progressRef = useRef(0);
  const completionRef = useRef(0);
  const completionBeatRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = createFullscreenWebGLProgram(canvas, VERT, FRAG);
    if (!runtime) return;

    const { gl, program, buffer, dispose } = runtime;
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const uRes = gl.getUniformLocation(program, 'u_res');
    const uCenter = gl.getUniformLocation(program, 'u_center');
    const uActive = gl.getUniformLocation(program, 'u_active');
    const uProgress = gl.getUniformLocation(program, 'u_progress');
    const uComplete = gl.getUniformLocation(program, 'u_complete');

    let rafId = 0;
    let prev = performance.now();

    const render = (now: number) => {
      const dt = Math.max(0, (now - prev) / 1000);
      prev = now;
      completionRef.current = Math.max(0, completionRef.current - dt * 8.5);

      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        gl.viewport(0, 0, width, height);
      }

      const point = pointRef.current ?? { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (uRes) gl.uniform2f(uRes, width, height);
      if (uCenter) gl.uniform2f(uCenter, point.x / window.innerWidth, 1 - point.y / window.innerHeight);
      if (uActive) gl.uniform1f(uActive, activeRef.current ? 1 : 0);
      if (uProgress) gl.uniform1f(uProgress, progressRef.current);
      if (uComplete) gl.uniform1f(uComplete, completionRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(rafId);
      dispose();
    };
  }, []);

  const setHoldState = useCallback((point: OverlayPoint, active: boolean, progress: number, completionBeat: number) => {
    if (point) pointRef.current = point;
    activeRef.current = active;
    progressRef.current = Math.max(0, Math.min(1, progress));
    if (completionBeat !== completionBeatRef.current) {
      completionBeatRef.current = completionBeat;
      completionRef.current = 1;
    }
  }, []);

  return { canvasRef, setHoldState };
}
