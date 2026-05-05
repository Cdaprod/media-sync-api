// docker/packages/Explorer/app/connect/device/deviceMonitorHooks.ts

import { useEffect, useMemo, useRef, useState, useCallback, RefObject } from 'react';
import { RemoteCameraNode } from './deviceMonitorTypes';
import { createApiClient } from '../../../src/api';
import { shouldPollDeviceControlPlane, shouldPollLiveSurface } from '../../../src/utils/polling';

// ----------------------------------------------------------------------
// Local cameras enumeration
// ----------------------------------------------------------------------
export function useLocalCameras() {
  // TODO(camera-session): CameraSession owns canonical local camera lifecycle.
  // Keep this hook as compatibility inventory until FullscreenDevicePreview migration is complete.
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  const enumerate = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== 'function'
    ) {
      setDevices([]);
      setPermission('prompt');
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = all.filter(d => d.kind === 'videoinput');
      setDevices(videoInputs);
      setPermission(videoInputs.length > 0 ? 'granted' : 'prompt');
    } catch {
      setDevices([]);
      setPermission('denied');
    }
  }, []);

  useEffect(() => {
    enumerate();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      void navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          return enumerate();
        })
        .catch(() => undefined);
    }
    navigator.mediaDevices?.addEventListener('devicechange', enumerate);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', enumerate);
  }, [enumerate]);

  return { devices, permission, refresh: enumerate };
}

// ----------------------------------------------------------------------
// Remote camera nodes (fetch from /api/nodes)
// ----------------------------------------------------------------------
export function useRemoteCameras(options?: { mode?: 'local' | 'remote'; remotePickerOpen?: boolean }) {
  const [nodes, setNodes] = useState<RemoteCameraNode[]>([]);
  const [loading, setLoading] = useState(false);
  const api = useMemo(() => createApiClient(''), []);
  const mode = options?.mode || 'local';
  const remotePickerOpen = !!options?.remotePickerOpen;

  const fetchRemote = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.listNodes();
      const allNodes = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.nodes)
          ? payload.nodes
          : Array.isArray(payload.items)
            ? payload.items
            : [];
      // Only reject when enabled === false (undefined is allowed)
      const cameraNodes = allNodes.filter((n: any) => {
        if (n.enabled === false) return false;
        const roles = n.roles || [];
        const caps = n.capabilities || [];
        const kinds = n.advertised_source_kinds || [];
        const meta = n.metadata || {};
        return (
          roles.includes('runner') || roles.includes('capture') ||
          caps.includes('can_proxy_streams') || caps.includes('can_record') ||
          caps.includes('stream') || caps.includes('record') || caps.includes('capture') ||
          kinds.includes('capture') ||
          meta.session_node === 'true' ||
          meta.browser_push === 'true'
        );
      });
      setNodes(cameraNodes);
    } catch (err) {
      console.warn('Failed to fetch remote camera nodes', err);
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void fetchRemote(); // bootstrap fetch only
  }, [fetchRemote]);

  useEffect(() => {
    const shouldPoll = shouldPollDeviceControlPlane({
      mode,
      visible: shouldPollLiveSurface(),
      remotePickerOpen,
    });
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (!shouldPollLiveSurface()) return;
      void fetchRemote();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [fetchRemote, mode, remotePickerOpen]);

  return { nodes, loading, refresh: fetchRemote };
}

// ----------------------------------------------------------------------
// WebGL FX (zebra/peaking/false color) – uses video ref from parent
// ----------------------------------------------------------------------
export function useWebGLFx(
  videoRef: RefObject<HTMLVideoElement>,
  overlays: { zebra: boolean; peaking: boolean; falseColor: boolean }
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<any>({});

  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, preserveDrawingBuffer: false });
    if (!gl) return;
    glRef.current = gl;

    const ext = gl.getExtension('OES_standard_derivatives');
    if (!ext) console.warn('OES_standard_derivatives not supported – peaking disabled');

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        v_uv.y = 1.0 - v_uv.y;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, `
      #extension GL_OES_standard_derivatives : enable
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_tex;
      uniform float u_zebra;
      uniform float u_peaking;
      uniform float u_falseColor;
      uniform float u_time;

      float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      vec3 peakColor(vec3 c) {
        float lum = luma(c);
        float gx = dFdx(lum);
        float gy = dFdy(lum);
        float edge = length(vec2(gx, gy));
        float peak = smoothstep(0.015, 0.055, edge);
        return mix(c, vec3(1.0, 0.0, 0.55), peak);
      }
      vec3 falseColorMap(float lum) {
        if (lum < 0.1)  return vec3(0.0, 0.0, 0.5);
        if (lum < 0.3)  return vec3(0.0, 0.3, 0.9);
        if (lum < 0.55) return vec3(0.0, 0.7, 0.2);
        if (lum < 0.75) return vec3(1.0, 0.9, 0.0);
        if (lum < 0.9)  return vec3(1.0, 0.4, 0.0);
        return vec3(1.0, 0.0, 0.0);
      }
      void main() {
        vec4 samp = texture2D(u_tex, v_uv);
        vec3 c = samp.rgb;
        float lum = luma(c);
        if (u_zebra > 0.5 && lum > 0.82) {
          float stripe = step(0.5, fract((v_uv.x + v_uv.y) * 34.0 + u_time * 2.0));
          c = mix(c, vec3(1.0, 0.85, 0.0), stripe * 0.9);
        }
        if (u_peaking > 0.5) c = peakColor(c);
        if (u_falseColor > 0.5) c = falseColorMap(lum);
        gl_FragColor = vec4(c, 1.0);
      }
    `);
    gl.compileShader(fs);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('FX shader link failed');
      return;
    }
    programRef.current = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uniformsRef.current = {
      tex: gl.getUniformLocation(prog, 'u_tex'),
      zebra: gl.getUniformLocation(prog, 'u_zebra'),
      peaking: gl.getUniformLocation(prog, 'u_peaking'),
      falseColor: gl.getUniformLocation(prog, 'u_falseColor'),
      time: gl.getUniformLocation(prog, 'u_time'),
    };

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }, []);

  useEffect(() => {
    initGL();
  }, [initGL]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const gl = glRef.current;
    const prog = programRef.current;
    if (!gl || !prog || !canvas || !video) return;

    let startTime = performance.now();
    let frame: number;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const active = overlays.zebra || overlays.peaking || overlays.falseColor;
      canvas.style.display = active ? 'block' : 'none';
      if (!active || video.readyState < 2) return;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch {
        return;
      }
      gl.uniform1i(uniformsRef.current.tex, 0);
      gl.uniform1f(uniformsRef.current.zebra, overlays.zebra ? 1 : 0);
      gl.uniform1f(uniformsRef.current.peaking, overlays.peaking ? 1 : 0);
      gl.uniform1f(uniformsRef.current.falseColor, overlays.falseColor ? 1 : 0);
      gl.uniform1f(uniformsRef.current.time, (performance.now() - startTime) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [overlays, videoRef, initGL]);

  return canvasRef;
}

// ----------------------------------------------------------------------
// Telemetry: histogram, vectorscope, waveform (uses video ref)
// ----------------------------------------------------------------------
export function useHistogram(
  videoRef: RefObject<HTMLVideoElement>,
  canvasRef: RefObject<HTMLCanvasElement>
) {
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = 256;
    offscreen.height = 144;
    const octx = offscreen.getContext('2d')!;

    let frame: number;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (video.readyState < 2) return;
      try {
        octx.drawImage(video, 0, 0, 256, 144);
        const data = octx.getImageData(0, 0, 256, 144).data;
        const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
        for (let i = 0; i < data.length; i += 4) {
          r[data[i]]++;
          g[data[i+1]]++;
          b[data[i+2]]++;
        }
        const max = Math.max(Math.max(...r), Math.max(...g), Math.max(...b)) || 1;
        const ctx = canvas.getContext('2d')!;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        [[r,'rgba(239,68,68,0.55)'],[g,'rgba(34,197,94,0.55)'],[b,'rgba(59,130,246,0.55)']].forEach(([ch, color]) => {
          ctx.beginPath();
          ctx.moveTo(0, H);
          for (let x = 0; x < 256; x++) {
            const h = (ch[x] / max) * H;
            ctx.lineTo((x / 255) * W, H - h);
          }
          ctx.lineTo(W, H);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        });
      } catch {}
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [videoRef, canvasRef]);
}

export function useVectorscope(
  videoRef: RefObject<HTMLVideoElement>,
  canvasRef: RefObject<HTMLCanvasElement>
) {
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = 64;
    offscreen.height = 36;
    const octx = offscreen.getContext('2d')!;
    let frame: number;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (video.readyState < 2) return;
      try {
        octx.drawImage(video, 0, 0, 64, 36);
        const data = octx.getImageData(0, 0, 64, 36).data;
        const ctx = canvas.getContext('2d')!;
        const S = canvas.width;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(S/2, S/2, S*0.45, 0, Math.PI*2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(S/2, 0); ctx.lineTo(S/2, S);
        ctx.moveTo(0, S/2); ctx.lineTo(S, S/2);
        ctx.stroke();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          const cb = -0.169*r -0.331*g +0.500*b;
          const cr =  0.500*r -0.419*g -0.081*b;
          const x = (cb/128) * S * 0.45 + S/2;
          const y = (-cr/128) * S * 0.45 + S/2;
          ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      } catch {}
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [videoRef, canvasRef]);
}

export function useWaveform(
  canvasRef: RefObject<HTMLCanvasElement>,
  analyser: AnalyserNode | null
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d')!;
    const dataArray = new Float32Array(analyser.fftSize);
    let frame: number;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(dataArray);
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = W / dataArray.length;
      for (let i = 0; i < dataArray.length; i++) {
        const x = i * step;
        const y = ((dataArray[i] + 1) / 2) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser, canvasRef]);
}

// ----------------------------------------------------------------------
// Audio analyser from MediaStream (polling-driven)
// ----------------------------------------------------------------------
export function useAudioAnalyser(stream: MediaStream | null) {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [peakLevel, setPeakLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) {
      if (ctxRef.current) ctxRef.current.close();
      setAnalyser(null);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const an = audioCtx.createAnalyser();
    an.fftSize = 512;
    an.smoothingTimeConstant = 0.6;
    source.connect(an);
    setAnalyser(an);
    audioCtx.resume();

    const data = new Float32Array(an.fftSize);
    let peak = 0, decay = 0;
    const interval = setInterval(() => {
      if (!an) return;
      an.getFloatTimeDomainData(data);
      let rms = 0;
      for (let i = 0; i < data.length; i++) rms += data[i] * data[i];
      rms = Math.sqrt(rms / data.length);
      const db = 20 * Math.log10(rms + 1e-10);
      let pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
      if (pct > peak) { peak = pct; decay = 0; } else { decay++; if (decay > 30) peak = Math.max(0, peak - 0.5); }
      setPeakLevel(peak);
    }, 80);

    return () => {
      clearInterval(interval);
      source.disconnect();
      audioCtx.close();
      setAnalyser(null);
    };
  }, [stream]);

  return { analyser, peakLevel };
}
