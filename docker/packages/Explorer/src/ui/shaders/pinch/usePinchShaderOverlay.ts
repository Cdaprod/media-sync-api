import { useCallback, useEffect, useRef } from 'react';

export interface PinchShaderState {
  fingerA: { x: number; y: number } | null;
  fingerB: { x: number; y: number } | null;
  active: boolean;
  pulse: number;
  pulseDir: number;
  fade: number;
}

type PinchPoint = { x: number; y: number } | null;

type InternalPinchShaderState = PinchShaderState & {
  nodeCount: number;
};

const VERT_SOURCE = `
attribute vec2 a_pos;
varying   vec2 v_uv;
void main() {
  v_uv = a_pos * .5 + .5;
  gl_Position = vec4(a_pos, 0., 1.);
}
`;

const FRAG_SOURCE = `
precision highp float;
varying vec2 v_uv;

uniform vec2  u_res;
uniform float u_aspect;
uniform float u_time;
uniform vec2  u_a;
uniform vec2  u_b;
uniform float u_active;
uniform float u_fade;
uniform float u_pulse;
uniform float u_pulse_dir;
uniform float u_nodes;

float adist(vec2 p, vec2 c) {
  vec2 d = p - c; d.x *= u_aspect; return length(d);
}
float ring(vec2 p, vec2 c, float r, float iw, float ow) {
  float d = adist(p, c);
  return smoothstep(r-iw,r,d)*(1.-smoothstep(r,r+ow,d));
}
float blob(vec2 p, vec2 c, float r) {
  float d = adist(p,c); return exp(-d*d/(r*r)*4.2);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa=p-a,ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  vec2 d=pa-ba*h; d.x*=u_aspect; return length(d);
}
float segT(vec2 p, vec2 a, vec2 b) {
  vec2 ba=b-a;
  return clamp(dot(p-a,ba)/max(dot(ba,ba),1e-7),0.,1.);
}
float hash21(vec2 p) {
  p=fract(p*vec2(127.1,311.7)); p+=dot(p,p+19.19);
  return fract(p.x*p.y);
}

void main() {
  vec2 uv=v_uv; float fade=u_fade;
  vec2 a=u_a, b=u_b;
  vec3 col=vec3(0.); float alpha=0.;

  float ringR=0.072, innerW=0.003, outerW=0.009;
  float breath=1.+0.013*sin(u_time*3.2);

  float rA=ring(uv,a,ringR*breath,innerW,outerW);
  float rB=ring(uv,b,ringR*breath,innerW,outerW);
  float gA=blob(uv,a,ringR*.60), gB=blob(uv,b,ringR*.60);
  float dotA=1.-smoothstep(.003,.007,adist(uv,a));
  float dotB=1.-smoothstep(.003,.007,adist(uv,b));

  vec3 ringCol=vec3(.28,.72,1.), glowCol=vec3(.12,.45,.95), dotCol=vec3(.75,.92,1.);
  col+=(rA+rB)*ringCol*.95; alpha=max(alpha,max(rA,rB)*.92);
  col+=(gA+gB)*glowCol*.32; alpha=max(alpha,max(gA,gB)*.20);
  col+=(dotA+dotB)*dotCol;  alpha=max(alpha,max(dotA,dotB));

  float sep=adist(a,b);
  float bridgeFade=smoothstep(0.,.14,sep);
  float sd=sdSeg(uv,a,b), t=segT(uv,a,b);
  float taper=smoothstep(0.,.14,t)*smoothstep(1.,.86,t);
  float core=(1.-smoothstep(.000,.005,sd))*taper*bridgeFade;
  float halo=(1.-smoothstep(.005,.028,sd))*taper*bridgeFade;
  float energy=.72+.28*sin(t*12.-u_time*4.);
  vec3 bridgeCol=vec3(.20,.65,1.);
  col+=bridgeCol*core*energy*.90; alpha=max(alpha,core*energy*.88);
  col+=bridgeCol*halo*.28;        alpha=max(alpha,halo*.22);

  float nodeCount=max(0.,min(u_nodes,12.));
  for(int i=1;i<=12;i++){
    float fi=float(i);
    if(fi>nodeCount) continue;
    float nt=fi/(nodeCount+1.);
    vec2 np=mix(a,b,nt);
    float pole=smoothstep(0.,.20,min(adist(np,a),adist(np,b)));
    float nodeR=.007+pole*.005;
    float nd=adist(uv,np);
    float nDot=1.-smoothstep(nodeR*.55,nodeR,nd);
    float nRng=ring(uv,np,nodeR+.005,.0015,.004);
    float nGlw=blob(uv,np,nodeR*2.8);
    vec3 nodeCol=mix(vec3(.35,.78,1.),vec3(.60,.94,1.),pole);
    col+=nodeCol*nDot*bridgeFade;       alpha=max(alpha,nDot*bridgeFade);
    col+=nodeCol*nRng*.55*bridgeFade;   alpha=max(alpha,nRng*.50*bridgeFade);
    col+=nodeCol*nGlw*.18*bridgeFade;   alpha=max(alpha,nGlw*.14*bridgeFade);
  }

  if(u_pulse>.001){
    float pT=u_pulse;
    float pR=ringR+(1.-pT)*.058;
    float pA=ring(uv,a,pR,.002,mix(.010,.004,pT))*pT;
    float pB=ring(uv,b,pR,.002,mix(.010,.004,pT))*pT;
    vec3 pCol=u_pulse_dir>0.?vec3(.22,1.,.52):vec3(1.,.52,.18);
    col+=pCol*(pA+pB)*1.04; alpha=max(alpha,(pA+pB)*.95);
    float bFlash=halo*taper*pT*.55*bridgeFade;
    col+=pCol*bFlash;      alpha=max(alpha,bFlash*.58);
  }

  float grain=(hash21(uv*u_res+u_time*47.3)-.5)*.025;
  alpha=clamp(alpha*fade+grain*fade,0.,1.);
  col=col*fade;
  gl_FragColor=vec4(col,alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SOURCE);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SOURCE);
  if (!vert || !frag) {
    if (vert) gl.deleteShader(vert);
    if (frag) gl.deleteShader(frag);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function usePinchShaderOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<InternalPinchShaderState>({
    fingerA: null,
    fingerB: null,
    active: false,
    pulse: 0,
    pulseDir: 1,
    fade: 0,
    nodeCount: 3,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const program = createProgram(gl);
    if (!program) return;

    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const uRes = gl.getUniformLocation(program, 'u_res');
    const uAspect = gl.getUniformLocation(program, 'u_aspect');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uA = gl.getUniformLocation(program, 'u_a');
    const uB = gl.getUniformLocation(program, 'u_b');
    const uActive = gl.getUniformLocation(program, 'u_active');
    const uFade = gl.getUniformLocation(program, 'u_fade');
    const uPulse = gl.getUniformLocation(program, 'u_pulse');
    const uPulseDir = gl.getUniformLocation(program, 'u_pulse_dir');
    const uNodes = gl.getUniformLocation(program, 'u_nodes');

    const buffer = gl.createBuffer();
    if (!buffer) {
      gl.deleteProgram(program);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let rafId = 0;
    let prev = performance.now();
    const start = prev;

    const resize = () => {
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, width, height);
    };

    const render = (now: number) => {
      const dt = Math.max(0, (now - prev) / 1000);
      prev = now;
      const state = stateRef.current;

      if (!state.active) {
        state.fade = Math.max(0, state.fade - dt * 5.5);
      } else {
        state.fade = Math.min(1, state.fade + dt * 8.5);
      }
      state.pulse = Math.max(0, state.pulse - dt * 3.2);

      resize();

      const w = Math.max(1, canvas.width);
      const h = Math.max(1, canvas.height);
      const baseA = state.fingerA ?? state.fingerB ?? { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
      const baseB = state.fingerB ?? state.fingerA ?? baseA;
      const uvA = [baseA.x / window.innerWidth, 1 - baseA.y / window.innerHeight];
      const uvB = [baseB.x / window.innerWidth, 1 - baseB.y / window.innerHeight];

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (uRes) gl.uniform2f(uRes, w, h);
      if (uAspect) gl.uniform1f(uAspect, w / h);
      if (uTime) gl.uniform1f(uTime, (now - start) / 1000);
      if (uA) gl.uniform2f(uA, uvA[0], uvA[1]);
      if (uB) gl.uniform2f(uB, uvB[0], uvB[1]);
      if (uActive) gl.uniform1f(uActive, state.active ? 1 : 0);
      if (uFade) gl.uniform1f(uFade, state.fade);
      if (uPulse) gl.uniform1f(uPulse, state.pulse);
      if (uPulseDir) gl.uniform1f(uPulseDir, state.pulseDir);
      if (uNodes) gl.uniform1f(uNodes, Math.max(0, Math.min(state.nodeCount, 12)));

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = window.requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize);
    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  const updateFingers = useCallback((a: PinchPoint, b: PinchPoint, active: boolean) => {
    const state = stateRef.current;
    if (a) state.fingerA = a;
    if (b) state.fingerB = b;
    state.active = active;
    if (state.active) {
      state.fade = Math.max(0.32, state.fade);
    }
  }, []);

  const setNodeCount = useCallback((count: number) => {
    const state = stateRef.current;
    state.nodeCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : state.nodeCount;
  }, []);

  const triggerPulse = useCallback((dir: number) => {
    const state = stateRef.current;
    state.pulse = Math.max(state.pulse, 0.94);
    state.pulseDir = dir >= 0 ? 1 : -1;
  }, []);

  const release = useCallback(() => {
    const state = stateRef.current;
    state.active = false;
  }, []);

  return { canvasRef, updateFingers, triggerPulse, release, setNodeCount };
}
