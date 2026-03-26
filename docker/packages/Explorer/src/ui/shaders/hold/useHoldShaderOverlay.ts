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
uniform float u_hold;
void main(){
  vec2 p = v_uv - u_center;
  p.x *= u_res.x / max(u_res.y, 1.0);
  float d = length(p);
  float ring = smoothstep(0.22 - u_hold * 0.04, 0.05, d) * (1.0 - smoothstep(0.05, 0.02, d));
  float halo = smoothstep(0.42 - u_hold * 0.08, 0.0, d);
  vec3 col = mix(vec3(0.44, 0.24, 0.86), vec3(0.66, 0.38, 1.0), u_hold);
  float alpha = (ring * 0.7 + halo * 0.22) * u_active;
  gl_FragColor = vec4(col, alpha);
}
`;

export function useHoldShaderOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointRef = useRef<OverlayPoint>(null);
  const activeRef = useRef(false);
  const holdRef = useRef(0);

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
    const uHold = gl.getUniformLocation(program, 'u_hold');

    let rafId = 0;
    let prev = performance.now();

    const render = (now: number) => {
      const dt = Math.max(0, (now - prev) / 1000);
      prev = now;
      holdRef.current = activeRef.current
        ? Math.min(1, holdRef.current + dt * 3)
        : Math.max(0, holdRef.current - dt * 4);

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
      if (uHold) gl.uniform1f(uHold, holdRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(rafId);
      dispose();
    };
  }, []);

  const setHoldState = useCallback((point: OverlayPoint, active: boolean) => {
    if (point) pointRef.current = point;
    activeRef.current = active;
  }, []);

  return { canvasRef, setHoldState };
}
