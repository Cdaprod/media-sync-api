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
uniform float u_intensity;
void main(){
  vec2 p = v_uv - u_center;
  p.x *= u_res.x / max(u_res.y, 1.0);
  float d = length(p);
  float age = 1.0 - u_intensity;
  float ringR = mix(0.032, 0.011, age);
  float ringW = mix(0.006, 0.003, age);
  float ring = smoothstep(ringR + ringW, ringR, d) * (1.0 - smoothstep(ringR, max(ringR - ringW, 0.001), d));
  float coreR = mix(0.014, 0.007, age);
  float core = 1.0 - smoothstep(coreR, coreR + 0.0025, d);
  vec3 col = vec3(0.67, 0.45, 1.0);
  float alpha = (ring * 0.88 + core * 0.42) * u_intensity;
  gl_FragColor = vec4(col, alpha);
}
`;

export function useTapShaderOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointRef = useRef<OverlayPoint>(null);
  const intensityRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = createFullscreenWebGLProgram(canvas, VERT, FRAG);
    if (!runtime) return;

    const { gl, program, buffer, dispose } = runtime;
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const uRes = gl.getUniformLocation(program, 'u_res');
    const uCenter = gl.getUniformLocation(program, 'u_center');
    const uIntensity = gl.getUniformLocation(program, 'u_intensity');

    let rafId = 0;
    let prev = performance.now();

    const render = (now: number) => {
      const dt = Math.max(0, (now - prev) / 1000);
      prev = now;
      intensityRef.current = Math.max(0, intensityRef.current - dt * 5.8);

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
      if (uIntensity) gl.uniform1f(uIntensity, intensityRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(rafId);
      dispose();
    };
  }, []);

  const triggerTap = useCallback((point: OverlayPoint) => {
    if (point) pointRef.current = point;
    intensityRef.current = 1;
  }, []);

  return { canvasRef, triggerTap };
}
