import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { PreviewAsset } from './previewAdapter';

export function AssetPreviewPanel({
  asset,
  onMediaReady,
}: {
  asset: PreviewAsset | null;
  onMediaReady?: (el: HTMLVideoElement | HTMLAudioElement | null) => void;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);

  useEffect(() => {
    setOverlayVisible(true);
  }, [asset?.id]);

  useEffect(() => {
    onMediaReady?.(mediaRef.current);
  }, [asset?.id, onMediaReady]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    let timer: number | null = null;
    const showOverlay = () => {
      setOverlayVisible(true);
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const scheduleHide = () => {
      if (media.paused) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setOverlayVisible(false), 1800);
    };
    media.addEventListener('play', scheduleHide);
    media.addEventListener('pause', showOverlay);
    media.addEventListener('ended', showOverlay);

    return () => {
      media.removeEventListener('play', scheduleHide);
      media.removeEventListener('pause', showOverlay);
      media.removeEventListener('ended', showOverlay);
      if (timer) window.clearTimeout(timer);
    };
  }, [asset?.id]);

  useEffect(() => {
    if (asset?.kind !== 'audio') return;
    const canvas = canvasRef.current;
    const media = mediaRef.current;
    if (!canvas || !media) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const nextW = Math.max(1, Math.floor(rect.width * dpr));
      const nextH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      const t = performance.now() / 260;
      const bars = 56;
      const energy = media.paused ? 0.42 : 1;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < bars; i += 1) {
        const amp = (Math.sin((i * 0.6) + t) * 0.5 + 0.5) * energy;
        const bh = Math.max(2, amp * h * 0.6);
        const bw = Math.max(2, (w / bars) - 2.5);
        const x = (w / bars) * i + 1;
        const y = (h - bh) / 2;
        ctx.fillStyle = `rgba(176,132,255,${0.12 + amp * 0.52})`;
        ctx.fillRect(x, y, bw, bh);
      }
      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [asset?.id, asset?.kind]);

  const kindLabel = (asset?.kind || 'other').toUpperCase();
  const mediaNode = useMemo(() => {
    if (!asset) return null;
    if (asset.kind === 'video') {
      return <video ref={(el) => { mediaRef.current = el; }} controls preload="metadata" playsInline src={asset.src} />;
    }
    if (asset.kind === 'image') {
      return <img src={asset.src} alt={asset.name} />;
    }
    if (asset.kind === 'audio') {
      return <audio ref={(el) => { mediaRef.current = el; }} controls preload="metadata" src={asset.src} />;
    }
    mediaRef.current = null;
    return (
      <div className="preview-empty">
        No native preview for this type.<br />
        <span className="kbd">{asset.kind}</span>
      </div>
    );
  }, [asset]);

  if (!asset) return null;

  return (
    <div className="preview-shell" onPointerMove={() => setOverlayVisible(true)} onPointerDown={() => setOverlayVisible(true)}>
      <div className="preview-media">{mediaNode}</div>
      {asset.kind === 'audio' ? <canvas ref={canvasRef} className="preview-wave" /> : null}
      <div className={`preview-overlay ${overlayVisible ? '' : 'fade'}`}>
        <div className="preview-top">
          <span className="preview-kind">{kindLabel}</span>
          <div className="preview-title">{asset.name}</div>
          <div className="preview-path">{asset.path}</div>
        </div>
        <div className="preview-bottom">
          {(asset.quick.length ? asset.quick : [['Duration', 'unknown']]).map(([label, value]) => (
            <span className="preview-chip" key={`${label}:${value}`}>{label}: {value}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
