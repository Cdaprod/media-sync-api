'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const VERT = `
  attribute vec2 a_pos; varying vec2 v_uv;
  void main(){ v_uv=a_pos*.5+.5; gl_Position=vec4(a_pos,0.,1.); }
`;

const FRAG = `
  precision highp float;
  varying vec2 v_uv;
  uniform vec2  u_res;
  uniform float u_time;
  uniform float u_envMix;
  uniform float u_warp;
  uniform float u_camZ;

  #define TAU 6.28318530717959

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

  float panelSeam(vec2 uv,vec2 sz,float w){
    vec2 t=fract(uv/sz);
    vec2 s=smoothstep(0.,w,t)*(1.-smoothstep(1.-w,1.,t));
    return pow(1.-min(s.x,s.y),3.);
  }

  vec3 tealGrade(vec3 col,float amt){
    float l=dot(col,vec3(.2126,.7152,.0722));
    return mix(col,vec3(l*.22,l*.78,l*1.18),amt);
  }

  vec3 sharedBlueField(vec2 uv,vec2 wuv,float em,float wp){
    float r1=length(wuv),r2=length(uv-vec2(.24,.02));
    float cFog=exp(-length(uv)*2.2),vpFog=exp(-r2*2.4);
    float bands=smoothstep(.35,1.,.5+.5*sin(r1*8.-u_time*1.8+sin(u_time*.4)*.8));
    float cross=smoothstep(.08,.50,em)*(1.-smoothstep(.75,1.0,em));
    vec3 f=mix(vec3(.005,.010,.020),vec3(.01,.28,.48),cFog*.5+vpFog*.5);
    f=mix(f,vec3(.04,.70,.90),bands*.15+vpFog*.35);
    return f*(.12+.55*cross);
  }

  vec3 envA(vec2 uv){
    vec2 p=uv-vec2(sin(u_time*.19)*.10,cos(u_time*.14)*.07);
    float r=length(p),a=atan(p.y,p.x);
    float d=1./max(r,.001)+u_time*0.75;
    float ta=a+d*.22+sin(d*.11)*.5;
    float g1=pow(max(sin(fract(d*2.8)*TAU)*(.82+.18*sin(ta*5.+d*.3)),0.),18.);
    float g2=pow(max(sin(fract(d*2.8+.5)*TAU)*(.88+.12*cos(ta*4.-d*.2)),0.),18.)*.6;
    float h=d*.18+u_time*.12;
    float t1=sin(h)*.5+.5,t2=sin(h*.61+1.9)*.5+.5;
    vec3 col=mix(mix(vec3(.01,.08,.18),vec3(.02,.35,.55),t1*.8),vec3(.04,.82,1.),t2*.45)
            *(0.7+.3*(sin(ta+u_time*.08)*.5+.5));
    col*=(g1+g2)*r*1.6;
    col+=col*exp(-r*3.5)*.25;
    col+=vec3(.005,.010,.020);
    return col;
  }

  vec3 envB(vec2 sc){
    vec3 ro=vec3(-.6+sin(u_time*.19)*.015,-.28+cos(u_time*.14)*.018,u_camZ);
    vec3 rd=normalize(vec3((sc+vec2(.30,.05))*.58,1.));
    float roll=sin(u_time*.10)*.018;
    float cr=cos(roll),sr=sin(roll);
    rd.xy=vec2(cr*rd.x-sr*rd.y,sr*rd.x+cr*rd.y);

    vec3 tH=vec3(.06,.90,1.),tD=vec3(.02,.40,.65),nB=vec3(.002,.012,.028);
    vec3 aH=vec3(1.,.44,.03),vP=vec3(.04,.82,1.);
    float p1=.68+.32*sin(u_time*.50),p2=.68+.32*sin(u_time*.36+1.3);
    float wX=1.2,fY=-1.;

    float tW=(rd.x>.0001)?(wX-ro.x)/rd.x:1e9;
    float tF=(rd.y<-.0001)?(fY-ro.y)/rd.y:1e9;
    if(tW<.01)tW=1e9; if(tF<.01)tF=1e9;

    vec3 col=vec3(0.);
    if(tW<tF&&tW<1e8){
      vec3 h=ro+rd*tW; float fog=exp(-tW*.055);
      float sm=panelSeam(vec2(h.z*.38,h.y*.55),vec2(1.),.044)*p1;
      vec3 wc=nB+tH*sm*.65;
      wc+=vP*exp(-length(vec2(h.z-(u_camZ+28.),h.y*1.2))*.07)*.85*fog;
      wc+=tD*.35*fog;
      wc+=aH*clamp(exp(-max(h.y-fY,0.)*10.)*exp(-max(h.z-u_camZ,0.)*.45),0.,.22)*.10;
      col=wc*fog;
    } else if(tF<1e8){
      vec3 h=ro+rd*tF; float fog=exp(-tF*.042);
      float sm=panelSeam(vec2(h.x*.65,h.z*.38),vec2(1.),.036)*p2;
      vec3 fc=vec3(.001,.004,.008)+tH*sm*.28;
      fc+=vP*exp(-length(vec2(h.x*.5,h.z-(u_camZ+28.)))*.06)*.18*fog;
      fc+=tH*exp(-abs(h.x-wX)*16.)*.45*fog;
      col=fc;
    }
    float vA=dot(normalize(rd),normalize(vec3(.30,.05,1.)));
    col+=vP*pow(max(vA,0.),40.)*.8;
    col+=tD*exp(-length(vec2(rd.x-.30,rd.y-.05))*3.)*.06;
    col+=vec3(.005,.010,.020);
    return col;
  }

  void main(){
    vec2 uv=v_uv*2.-1.; uv.x*=u_res.x/u_res.y;
    float wp=pow(u_warp,2.2);
    vec2 wuv=uv*(1.-wp*.88);

    vec3 cA=u_envMix<.999?envA(wuv):vec3(0.);
    vec3 cB=u_envMix>.001?envB(uv):vec3(0.);

    float cc=smoothstep(.10,.40,u_envMix)*(1.-smoothstep(.70,.96,u_envMix));
    cA=tealGrade(cA,cc*.42); cB=tealGrade(cB,cc*.28);

    float bL=smoothstep(.28,.82,u_envMix);
    float sM=smoothstep(.18,.88,u_envMix);
    vec3 col=mix(cA,cB,sM*bL+u_envMix*(1.-bL));
    float centerDist=length(uv);
    float capAmt=smoothstep(.08,.55,u_envMix)*(1.-smoothstep(.75,1.,u_envMix));
    float luma=dot(col,vec3(.2126,.7152,.0722));
    float capLuma=min(luma,.18+centerDist*.55);
    col*=mix(1.,capLuma/max(luma,.001),capAmt*.7);
    col+=sharedBlueField(uv,wuv,u_envMix,wp);

    float flashStr=pow(u_warp,4.)*exp(-length(uv)*5.)*2.2;
    float flashFade=1.-smoothstep(.35,.70,u_envMix);
    col+=vec3(.34,.74,1.)*flashStr*flashFade;

    col=col/(col+vec3(.45));
    col=pow(max(col,0.),vec3(.88));
    vec3 voidDark=vec3(.005,.010,.020);
    float vS=mix(.5,.35,u_envMix),vO=mix(1.35,.95,u_envMix+wp*.3);
    float vigAmt=smoothstep(vS,vO,length((v_uv*2.-1.)*vec2(.75,.95)));
    col=mix(col,voidDark,vigAmt);
    col+=(hash(v_uv*u_res+fract(u_time*.07))-.5)*.014;
    gl_FragColor=vec4(clamp(col,0.,1.),1.);
  }
`;

type Phase = 'idle' | 'warp' | 'arrival' | 'exit';

type ShaderBundle = {
  fragmentShader: WebGLShader;
  program: WebGLProgram;
  vertexShader: WebGLShader;
};

type RendererResources = {
  buffer: WebGLBuffer;
  bundle: ShaderBundle;
  uCamZ: WebGLUniformLocation | null;
  uEnvMix: WebGLUniformLocation | null;
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uWarp: WebGLUniformLocation | null;
};

type SceneNodes = {
  arrivalPanel: HTMLDivElement | null;
  arrivalWrap: HTMLDivElement | null;
  btnSurface: HTMLButtonElement | null;
  canvas: HTMLCanvasElement | null;
  hd: HTMLDivElement | null;
  hs: HTMLDivElement | null;
  hudL: HTMLDivElement | null;
  hudR: HTMLDivElement | null;
  hx: HTMLDivElement | null;
  hy: HTMLDivElement | null;
  hz: HTMLDivElement | null;
  label404: HTMLHeadingElement | null;
  tagline: HTMLParagraphElement | null;
  voidStack: HTMLDivElement | null;
  voidWrap: HTMLDivElement | null;
};

const WARP_DUR = 4.2;
const EXIT_DUR = 1.2;
const FRAME_MS = 1000 / 60;
const REDUCED_FRAME_MS = 1000 / 30;
const c01 = (value: number) => Math.max(0, Math.min(1, value));
const eio = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const sjs = (a: number, b: number, x: number) => {
  const t = c01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('shader allocation error');
  }
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) ?? 'shader error';
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): ShaderBundle {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error('program allocation error');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) ?? 'link error';
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(error);
  }
  return { fragmentShader, program, vertexShader };
}

function releaseRenderer(gl: WebGLRenderingContext | null, resources: RendererResources | null) {
  if (!gl || !resources) return;
  if (!gl.isContextLost()) {
    gl.deleteBuffer(resources.buffer);
    gl.deleteProgram(resources.bundle.program);
    gl.deleteShader(resources.bundle.vertexShader);
    gl.deleteShader(resources.bundle.fragmentShader);
  }
}

function useReducedMotionPreference() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener?.('change', sync);
    mediaQuery.addListener?.(sync);
    return () => {
      mediaQuery.removeEventListener?.('change', sync);
      mediaQuery.removeListener?.(sync);
    };
  }, []);

  return prefersReducedMotion;
}

export default function NotFound() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotionPreference();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voidWrapRef = useRef<HTMLDivElement>(null);
  const voidStackRef = useRef<HTMLDivElement>(null);
  const label404Ref = useRef<HTMLHeadingElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const btnSurfaceRef = useRef<HTMLButtonElement>(null);
  const arrivalWrapRef = useRef<HTMLDivElement>(null);
  const arrivalPanelRef = useRef<HTMLDivElement>(null);
  const hudLRef = useRef<HTMLDivElement>(null);
  const hudRRef = useRef<HTMLDivElement>(null);
  const hxRef = useRef<HTMLDivElement>(null);
  const hyRef = useRef<HTMLDivElement>(null);
  const hzRef = useRef<HTMLDivElement>(null);
  const hdRef = useRef<HTMLDivElement>(null);
  const hsRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>('idle');
  const phaseStartRef = useRef(0);
  const envMixRef = useRef(0);
  const warpRef = useRef(0);
  const camZRef = useRef(0);
  const didNavigateRef = useRef(false);
  const arrivalTimerRef = useRef<number | null>(null);
  const styleCacheRef = useRef<Record<string, string>>({});
  const textCacheRef = useRef<Record<string, string>>({});
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const navigateHome = useCallback(() => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    router.push('/');
  }, [router]);

  const setStyleValue = useCallback((cacheKey: string, node: HTMLElement | null, property: string, value: string) => {
    if (!node) return;
    if (styleCacheRef.current[cacheKey] === value) return;
    styleCacheRef.current[cacheKey] = value;
    node.style.setProperty(property, value);
  }, []);

  const setTextValue = useCallback((cacheKey: string, node: HTMLElement | null, value: string) => {
    if (!node) return;
    if (textCacheRef.current[cacheKey] === value) return;
    textCacheRef.current[cacheKey] = value;
    node.textContent = value;
  }, []);

  const applyArrivalState = useCallback(() => {
    const arrivalWrap = arrivalWrapRef.current;
    const arrivalPanel = arrivalPanelRef.current;
    const voidWrap = voidWrapRef.current;
    arrivalTimerRef.current = null;
    phaseRef.current = 'arrival';
    warpRef.current = 0;
    envMixRef.current = 1;
    voidWrap?.classList.add('arrival-ready');
    arrivalWrap?.classList.add('show');
    hudLRef.current?.classList.add('amber');
    hudRRef.current?.classList.add('amber');
    arrivalTimerRef.current = window.setTimeout(() => {
      arrivalPanel?.classList.add('visible');
    }, 240);
  }, []);

  const beginWarp = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    if (prefersReducedMotion) {
      navigateHome();
      return;
    }
    phaseRef.current = 'warp';
    phaseStartRef.current = performance.now();
    btnSurfaceRef.current?.setAttribute('disabled', 'true');
  }, [navigateHome, prefersReducedMotion]);

  const beginExit = useCallback(() => {
    if (phaseRef.current !== 'arrival') return;
    phaseRef.current = 'exit';
    phaseStartRef.current = performance.now();
    arrivalPanelRef.current?.classList.remove('visible');
    arrivalWrapRef.current?.classList.add('exiting');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null = null;
    let resources: RendererResources | null = null;
    let raf = 0;
    let lastFrame = performance.now();
    let lastWidth = 0;
    let lastHeight = 0;
    let disposed = false;
    const t0 = performance.now();
    const sceneNodes: SceneNodes = {
      arrivalPanel: arrivalPanelRef.current,
      arrivalWrap: arrivalWrapRef.current,
      btnSurface: btnSurfaceRef.current,
      canvas,
      hd: hdRef.current,
      hs: hsRef.current,
      hudL: hudLRef.current,
      hudR: hudRRef.current,
      hx: hxRef.current,
      hy: hyRef.current,
      hz: hzRef.current,
      label404: label404Ref.current,
      tagline: taglineRef.current,
      voidStack: voidStackRef.current,
      voidWrap: voidWrapRef.current,
    };

    const resize = () => {
      if (!gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    const initRenderer = () => {
      releaseRenderer(gl, resources);
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
        resources = null;
        setWebglUnavailable(true);
        return false;
      }
      try {
        const bundle = createProgram(gl);
        const buffer = gl.createBuffer();
        if (!buffer) {
          throw new Error('buffer allocation error');
        }
        gl.useProgram(bundle.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const aPos = gl.getAttribLocation(bundle.program, 'a_pos');
        if (aPos < 0) {
          throw new Error('a_pos attribute missing');
        }
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        resources = {
          buffer,
          bundle,
          uCamZ: gl.getUniformLocation(bundle.program, 'u_camZ'),
          uEnvMix: gl.getUniformLocation(bundle.program, 'u_envMix'),
          uRes: gl.getUniformLocation(bundle.program, 'u_res'),
          uTime: gl.getUniformLocation(bundle.program, 'u_time'),
          uWarp: gl.getUniformLocation(bundle.program, 'u_warp'),
        };
        gl.clearColor(0, 0, 0, 1);
        setWebglUnavailable(false);
        resize();
        return true;
      } catch (error) {
        console.error('Explorer not-found scene initialization failed.', error);
        releaseRenderer(gl, resources);
        resources = null;
        setWebglUnavailable(true);
        return false;
      }
    };

    const renderScene = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(renderScene);
      if (document.hidden) return;
      const minFrameMs = prefersReducedMotion ? REDUCED_FRAME_MS : FRAME_MS;
      if (now - lastFrame < minFrameMs * 0.92) {
        return;
      }
      lastFrame = now;
      resize();

      const t = (now - t0) / 1000;
      const elapsed = phaseStartRef.current > 0 ? (now - phaseStartRef.current) / 1000 : 0;
      const phase = phaseRef.current;

      if (phase === 'warp') {
        const progress = c01(elapsed / WARP_DUR);
        warpRef.current = eio(progress);
        envMixRef.current = sjs(0.45, 0.92, progress);

        setStyleValue('void-wrap-opacity', sceneNodes.voidWrap, 'opacity', String(c01(1 - progress * 2.3)));
        setStyleValue(
          'void-stack-transform',
          sceneNodes.voidStack,
          'transform',
          `translate3d(${Math.sin(progress * Math.PI) * 8}px, ${-progress * 32}vh, ${progress * 320}px) rotateX(${progress * 72}deg) scale(${1 + progress * 0.22})`,
        );
        setStyleValue(
          'label-transform',
          sceneNodes.label404,
          'transform',
          `translate3d(0, ${-progress * 4}vh, ${progress * 180}px) rotateX(${progress * 16}deg) scaleX(${1 + progress * 0.05}) scaleY(${1 + progress * 0.36})`,
        );
        setStyleValue('label-opacity', sceneNodes.label404, 'opacity', String(c01(1 - progress * 1.35)));
        setStyleValue('label-filter', sceneNodes.label404, 'filter', `blur(${progress * 10}px)`);
        setStyleValue(
          'tagline-transform',
          sceneNodes.tagline,
          'transform',
          `translate3d(0, ${progress * 1.5}vh, ${progress * 42}px) rotateX(${progress * 18}deg) scale(${1 + progress * 0.03})`,
        );
        setStyleValue('tagline-opacity', sceneNodes.tagline, 'opacity', String(c01(1 - progress * 2.2)));
        setStyleValue('tagline-filter', sceneNodes.tagline, 'filter', `blur(${progress * 4}px)`);
        setStyleValue(
          'surface-transform',
          sceneNodes.btnSurface,
          'transform',
          `translate3d(0, ${progress * 2.2}vh, ${progress * 24}px) rotateX(${progress * 18}deg) scale(${1 + progress * 0.02})`,
        );
        setStyleValue('surface-opacity', sceneNodes.btnSurface, 'opacity', String(c01(1 - progress * 2.4)));
        setStyleValue('surface-filter', sceneNodes.btnSurface, 'filter', `blur(${progress * 4}px)`);

        if (progress >= 1) {
          applyArrivalState();
        }
      }

      if (phase === 'arrival') {
        envMixRef.current = 1;
        warpRef.current = 0;
      }

      if (phase === 'exit') {
        const progress = c01(elapsed / EXIT_DUR);
        setStyleValue('canvas-opacity', sceneNodes.canvas, 'opacity', String(1 - eio(progress)));
        if (progress >= 1) {
          navigateHome();
          return;
        }
      }

      camZRef.current += 0.008;
      if (gl && resources && resources.uRes && resources.uTime && resources.uEnvMix && resources.uWarp && resources.uCamZ) {
        gl.uniform2f(resources.uRes, canvas.width, canvas.height);
        gl.uniform1f(resources.uTime, t);
        gl.uniform1f(resources.uEnvMix, envMixRef.current);
        gl.uniform1f(resources.uWarp, warpRef.current);
        gl.uniform1f(resources.uCamZ, camZRef.current);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      const speed = 1.4 + envMixRef.current * 0.6;
      const sway = Math.sin(t * 0.23) * 0.12;
      const nod = Math.cos(t * 0.17) * 0.07;
      const zz = t * speed;
      const fmt = (value: number, decimals = 2) => value.toFixed(decimals).padStart(7);
      setTextValue('hud-x', sceneNodes.hx, `X  ${fmt(sway, 4)}`);
      setTextValue('hud-y', sceneNodes.hy, `Y  ${fmt(nod, 4)}`);
      setTextValue('hud-z', sceneNodes.hz, `Z  ${fmt(zz, 2)}`);
      setTextValue('hud-depth', sceneNodes.hd, `DEPTH   ${fmt(zz * 3.2, 1)}m`);
      setTextValue('hud-sector', sceneNodes.hs, `SECTOR  ${String(Math.floor(t / 8)).padStart(4, '0')}`);
    };

    const restartRenderer = () => {
      cancelAnimationFrame(raf);
      if (initRenderer()) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(renderScene);
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
      releaseRenderer(gl, resources);
      resources = null;
    };
    const handleContextRestored = () => {
      restartRenderer();
    };

    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    restartRenderer();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (arrivalTimerRef.current !== null) {
        window.clearTimeout(arrivalTimerRef.current);
        arrivalTimerRef.current = null;
      }
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      releaseRenderer(gl, resources);
      resources = null;
      gl = null;
    };
  }, [applyArrivalState, navigateHome, prefersReducedMotion, setStyleValue, setTextValue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.opacity = '1';
  }, []);

  return (
    <main className="void-page" data-explorer-default-not-found="true" data-explorer-not-found-scene="multi-phase">
      <style jsx>{`
        :global(html),
        :global(body) {
          width: 100%;
          height: 100%;
          background: #000;
          overflow: hidden;
          -webkit-user-select: none;
          user-select: none;
        }

        @keyframes breathe {
          0%,
          100% { opacity: 0.88; filter: brightness(1); }
          50% { opacity: 1; filter: brightness(1.12); }
        }

        @keyframes fadein {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .void-page {
          position: relative;
          width: 100%;
          min-height: 100dvh;
          overflow: hidden;
          background: #000;
          isolation: isolate;
        }

        .void-page::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, rgba(48, 28, 86, 0.14), rgba(0, 0, 0, 0.9) 70%);
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
          transition: opacity 1.2s ease;
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        .void-wrap,
        .arrival-wrap {
          position: fixed;
          inset: 0;
          z-index: 10;
        }

        .void-wrap {
          display: grid;
          place-items: center;
          perspective: 1100px;
          perspective-origin: 50% 42%;
          pointer-events: none;
          opacity: 1;
          transition: opacity 0.9s ease, filter 0.9s ease;
        }

        .void-wrap.arrival-ready {
          opacity: 0;
          filter: blur(8px);
          pointer-events: none;
        }

        .void-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transform-style: preserve-3d;
          will-change: transform, opacity, filter;
        }

        .label404 {
          font-family: 'Bebas Neue', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
          font-size: clamp(120px, 25vw, 260px);
          line-height: 0.88;
          letter-spacing: -0.02em;
          color: transparent;
          background: linear-gradient(160deg, rgba(255,255,255,.96) 0%, rgba(180,160,255,.85) 40%, rgba(100,80,200,.5) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          mix-blend-mode: screen;
          animation: breathe 4.2s ease-in-out infinite;
          will-change: transform, opacity, filter;
          transform-style: preserve-3d;
        }

        .tagline {
          margin-top: 28px;
          font-family: 'DM Mono', ui-monospace, monospace;
          font-style: italic;
          font-weight: 300;
          font-size: clamp(11px, 1.6vw, 18px);
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(160,140,255,.75);
          mix-blend-mode: screen;
          animation: fadein 2.4s ease 0.6s both;
          will-change: transform, opacity, filter;
        }

        .backBtn,
        .enterBtn {
          pointer-events: all;
          font-family: 'DM Mono', ui-monospace, monospace;
          font-weight: 300;
          font-size: clamp(10px, 1.2vw, 14px);
          letter-spacing: 0.22em;
          text-transform: uppercase;
          background: transparent;
          border-radius: 2px;
          cursor: pointer;
          transition: color .3s, border-color .3s, background .3s;
        }

        .backBtn {
          margin-top: 52px;
          color: rgba(255,255,255,.35);
          border: 1px solid rgba(255,255,255,.12);
          padding: 12px 32px;
          animation: fadein 2.8s ease 1.2s both;
          will-change: transform, opacity, filter;
        }

        .backBtn:hover:not(:disabled),
        .backBtn:focus-visible:not(:disabled) {
          color: rgba(200,180,255,.95);
          border-color: rgba(180,140,255,.4);
          background: rgba(120,80,255,.08);
          outline: none;
        }

        .backBtn:disabled {
          cursor: default;
        }

        .arrival-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.9s ease;
        }

        .arrival-wrap.show {
          opacity: 1;
        }

        .arrival-wrap.exiting {
          opacity: 0;
        }

        .arrival-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: all;
          opacity: 0;
          transform: translateY(14px) scale(.97);
          transition: opacity .9s ease, transform .9s ease;
        }

        .arrival-panel.visible {
          opacity: 1;
          transform: none;
        }

        .arrival-eyebrow {
          font-family: 'DM Mono', ui-monospace, monospace;
          font-style: italic;
          font-weight: 300;
          font-size: clamp(10px, 1.4vw, 14px);
          letter-spacing: .38em;
          text-transform: uppercase;
          color: rgba(255,180,80,.7);
          mix-blend-mode: screen;
        }

        .arrival-title {
          font-family: 'Bebas Neue', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
          font-size: clamp(52px, 10vw, 108px);
          line-height: .9;
          letter-spacing: .04em;
          color: transparent;
          background: linear-gradient(150deg, rgba(255,210,80,.98) 0%, rgba(255,120,30,.85) 55%, rgba(180,60,10,.6) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          mix-blend-mode: screen;
          margin-top: 12px;
          animation: breathe 3.5s ease-in-out infinite;
        }

        .arrival-sub {
          margin-top: 18px;
          font-family: 'DM Mono', ui-monospace, monospace;
          font-style: italic;
          font-weight: 300;
          font-size: clamp(10px, 1.3vw, 15px);
          letter-spacing: .24em;
          text-transform: uppercase;
          color: rgba(255,160,60,.6);
          mix-blend-mode: screen;
          text-align: center;
        }

        .enterBtn {
          margin-top: 44px;
          color: rgba(255,180,80,.55);
          border: 1px solid rgba(255,160,60,.22);
          padding: 12px 36px;
        }

        .enterBtn:hover,
        .enterBtn:focus-visible {
          color: rgba(255,205,80,.95);
          border-color: rgba(255,160,60,.55);
          background: rgba(200,80,10,.1);
          outline: none;
        }

        .hudLeft,
        .hudRight {
          position: fixed;
          bottom: 24px;
          font-family: 'DM Mono', ui-monospace, monospace;
          font-style: italic;
          font-weight: 300;
          font-size: 10px;
          letter-spacing: .18em;
          line-height: 1.8;
          pointer-events: none;
          z-index: 10;
          transition: color 1.2s ease;
        }

        .hudLeft {
          left: 28px;
          color: rgba(255,255,255,.18);
        }

        .hudRight {
          right: 28px;
          text-align: right;
          color: rgba(160,130,255,.3);
        }

        .amber {
          color: rgba(255,160,60,.3);
        }

        .fallbackNote {
          position: fixed;
          left: 50%;
          bottom: 112px;
          transform: translateX(-50%);
          z-index: 12;
          font-family: 'DM Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: rgba(255,255,255,.72);
          padding: 10px 14px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(9, 10, 18, 0.65);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          text-align: center;
        }

        @media (prefers-reduced-motion: reduce) {
          .label404,
          .tagline,
          .backBtn,
          .arrival-title {
            animation-duration: 0.01ms;
            animation-iteration-count: 1;
          }

          .void-wrap,
          .arrival-wrap,
          .arrival-panel,
          .backBtn,
          .enterBtn,
          .hudLeft,
          .hudRight,
          .void-canvas {
            transition-duration: 0.01ms;
          }
        }

        @media (max-width: 720px) {
          .void-stack,
          .arrival-panel {
            width: min(92vw, 560px);
          }

          .tagline,
          .arrival-sub {
            max-width: 24ch;
            text-align: center;
          }

          .backBtn,
          .enterBtn {
            width: min(340px, 100%);
          }

          .fallbackNote {
            width: min(92vw, 420px);
            bottom: 92px;
          }

          .hudLeft,
          .hudRight {
            bottom: 18px;
            font-size: 9px;
          }

          .hudLeft { left: 18px; }
          .hudRight { right: 18px; }
        }
      `}</style>

      <canvas ref={canvasRef} className="void-canvas" data-webgl-canvas="phase-scene" aria-hidden="true" />

      <div ref={voidWrapRef} className="void-wrap" data-phase-layer="void">
        <div ref={voidStackRef} className="void-stack">
          <h1 ref={label404Ref} className="label404">404</h1>
          <p ref={taglineRef} className="tagline">This page fell through the void</p>
          <button ref={btnSurfaceRef} className="backBtn" type="button" onClick={beginWarp}>
            ← Surface
          </button>
        </div>
      </div>

      <div ref={arrivalWrapRef} className="arrival-wrap" data-phase-layer="arrival">
        <div ref={arrivalPanelRef} className="arrival-panel">
          <div className="arrival-eyebrow">Return Vector Locked</div>
          <div className="arrival-title">SURFACE FOUND</div>
          <div className="arrival-sub">Explorer is ready — reacquiring index</div>
          <button className="enterBtn" type="button" onClick={beginExit}>
            Enter Explorer →
          </button>
        </div>
      </div>

      <div ref={hudLRef} className="hudLeft" aria-hidden="true">
        <div ref={hxRef}>X  —</div>
        <div ref={hyRef}>Y  —</div>
        <div ref={hzRef}>Z  —</div>
      </div>
      <div ref={hudRRef} className="hudRight" aria-hidden="true">
        <div ref={hdRef}>DEPTH   —</div>
        <div ref={hsRef}>SECTOR  —</div>
      </div>

      {webglUnavailable ? (
        <div className="fallbackNote" data-webgl-fallback="true" aria-live="polite">
          WebGL unavailable — route handoff remains available.
        </div>
      ) : null}
    </main>
  );
}
