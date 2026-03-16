import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { PreviewAsset } from './previewAdapter';

const fmtTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export function AssetPreviewPanel({
  asset,
  onMediaReady,
  onCopy,
  onDelete,
  onSelect,
  onPrev,
  onNext,
  onClose,
  metadataRows = [],
  detailsOpen = false,
  onDetailsToggle,
  selected = false,
  onSkipBack,
  onSkipForward,
  onObs,
  onTag,
  onResolve,
  onProgramMonitor,
  showResolve = false,
  showProgramMonitor = false,
  obsMode = 'cover',
  obsSlot = '1',
  obsExclusive = false,
  onObsModeChange,
  onObsSlotChange,
  onObsExclusiveChange,
  playOnAssetChangeToken = 0,
}: {
  asset: PreviewAsset | null;
  onMediaReady?: (el: HTMLVideoElement | HTMLAudioElement | null) => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onSelect?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onClose?: () => void;
  metadataRows?: Array<[string, string]>;
  detailsOpen?: boolean;
  onDetailsToggle?: () => void;
  selected?: boolean;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  onObs?: () => void;
  onTag?: () => void;
  onResolve?: () => void;
  onProgramMonitor?: () => void;
  showResolve?: boolean;
  showProgramMonitor?: boolean;
  obsMode?: 'cover' | 'fit' | 'fill';
  obsSlot?: string;
  obsExclusive?: boolean;
  onObsModeChange?: (value: 'cover' | 'fit' | 'fill') => void;
  onObsSlotChange?: (value: string) => void;
  onObsExclusiveChange?: (value: boolean) => void;
  playOnAssetChangeToken?: number;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const playable = asset?.kind === 'video' || asset?.kind === 'audio';

  useEffect(() => {
    setOverlayVisible(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(asset?.duration ?? 0);
  }, [asset?.id, asset?.duration]);

  useEffect(() => {
    onMediaReady?.(mediaRef.current);
  }, [asset?.id, onMediaReady]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    media.volume = volume;

    const onLoadedMetadata = () => {
      if (Number.isFinite(media.duration)) setDuration(media.duration || asset?.duration || 0);
    };
    const onTimeUpdate = () => setCurrentTime(media.currentTime || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setOverlayVisible(true);
    };

    let hideTimer: number | null = null;
    const showOverlay = () => {
      setOverlayVisible(true);
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
    const scheduleHide = () => {
      if (media.paused || detailsOpen) return;
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setOverlayVisible(false), 2400);
    };

    media.addEventListener('loadedmetadata', onLoadedMetadata);
    media.addEventListener('timeupdate', onTimeUpdate);
    media.addEventListener('play', onPlay);
    media.addEventListener('play', scheduleHide);
    media.addEventListener('pause', onPause);
    media.addEventListener('pause', showOverlay);
    media.addEventListener('ended', onEnded);

    return () => {
      media.removeEventListener('loadedmetadata', onLoadedMetadata);
      media.removeEventListener('timeupdate', onTimeUpdate);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('play', scheduleHide);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('pause', showOverlay);
      media.removeEventListener('ended', onEnded);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [asset?.duration, asset?.id, detailsOpen, volume]);

  useEffect(() => {
    if (!detailsOpen) return;
    setOverlayVisible(true);
  }, [detailsOpen]);


  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !asset || asset.kind !== 'video') return;
    const tryStart = () => {
      media.currentTime = 0;
      media.play().catch(() => {
        const onLoadedData = () => {
          if (!Number.isFinite(media.currentTime) || media.currentTime <= 0) {
            try {
              media.currentTime = 0.01;
            } catch {
              // ignore seek failures for codecs that disallow tiny offsets
            }
          }
        };
        media.addEventListener('loadeddata', onLoadedData, { once: true });
      });
    };
    tryStart();
  }, [asset?.id, asset?.kind, playOnAssetChangeToken]);

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
      const energy = media.paused ? 0.45 : 1;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < bars; i += 1) {
        const amp = (Math.sin((i * 0.6) + t) * 0.5 + 0.5) * energy;
        const bh = Math.max(2, amp * h * 0.62);
        const bw = Math.max(2, (w / bars) - 2.5);
        const x = (w / bars) * i + 1;
        const y = (h - bh) / 2;
        ctx.fillStyle = `rgba(176,132,255,${0.12 + amp * 0.54})`;
        ctx.fillRect(x, y, bw, bh);
      }
      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [asset?.id, asset?.kind]);

  const handleTogglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) media.play().catch(() => {});
    else media.pause();
  };


  const handleMediaTapToggle = () => {
    if (!playable) return;
    handleTogglePlay();
  };

  const handleSeek = (value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = value;
    setCurrentTime(value);
  };

  const seekBy = (offset: number) => {
    const media = mediaRef.current;
    if (!media) return;
    const cap = Number.isFinite(media.duration) ? media.duration : duration;
    const next = Math.min(Math.max((media.currentTime || 0) + offset, 0), Math.max(cap, 0));
    media.currentTime = next;
    setCurrentTime(next);
  };

  const mediaNode = useMemo(() => {
    if (!asset) return null;
    if (asset.kind === 'video') {
      return <video ref={(el) => { mediaRef.current = el; }} preload="metadata" playsInline src={asset.src} />;
    }
    if (asset.kind === 'image') {
      return <img src={asset.src} alt={asset.name} />;
    }
    if (asset.kind === 'audio') {
      return <audio ref={(el) => { mediaRef.current = el; }} preload="metadata" src={asset.src} />;
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
      <div className="preview-media" onClick={handleMediaTapToggle}>{mediaNode}</div>
      {asset.kind === 'audio' ? <canvas ref={canvasRef} className="preview-wave" /> : null}
      <div className={`preview-overlay ${overlayVisible ? '' : 'fade'}`}>
        <div className="preview-top">
          <div className="preview-top-row">
            <span className={`preview-kind kind-${asset.kind}`}>{asset.kind.toUpperCase()}</span>
            <div className="preview-nav">
              <button className="preview-icon-btn" type="button" onClick={onPrev} aria-label="Previous">‹</button>
              <button className="preview-icon-btn" type="button" onClick={onNext} aria-label="Next">›</button>
              <button className="preview-icon-btn" type="button" onClick={onClose} aria-label="Close">✕</button>
            </div>
          </div>
          <div className="preview-title">{asset.name}</div>
          <div className="preview-path">{asset.path}</div>
        </div>
        <div className="preview-bottom">
          <div className="preview-chip-row">
            {(asset.quick.length ? asset.quick : [['Duration', 'unknown']]).map(([label, value]) => (
              <span className="preview-chip" key={`${label}:${value}`}>{label}: {value}</span>
            ))}
          </div>
          {playable ? (
            <>
              <div className="preview-time-row">
                <span>{fmtTime(currentTime)}</span>
                <span>{fmtTime(duration)}</span>
              </div>
              <input
                className="preview-scrubber"
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                step={0.05}
                value={Math.min(currentTime, Math.max(duration, 1))}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
              />
            </>
          ) : null}
          <div className="preview-control-row">
            {playable ? <button className="preview-pill" type="button" onClick={onSkipBack || (() => seekBy(-10))}>↺ 10s</button> : null}
            {playable ? <button className="preview-pill primary" type="button" onClick={handleTogglePlay}>{isPlaying ? '❚❚ Pause' : '▶ Play'}</button> : null}
            {playable ? <button className="preview-pill" type="button" onClick={onSkipForward || (() => seekBy(10))}>10s ↻</button> : null}
            {onCopy ? <button className="preview-pill" type="button" onClick={onCopy}>⧉ Copy stream URL</button> : null}
            {onSelect ? <button className="preview-pill" type="button" onClick={onSelect}>{selected ? '− Deselect' : '+ Select'}</button> : null}
            {onDelete ? <button className="preview-pill danger" type="button" onClick={onDelete}>🗑 Delete</button> : null}
            {onTag ? <button className="preview-pill" type="button" onClick={onTag}>🏷 Tag</button> : null}
            {onObs ? <button className="preview-pill" type="button" onClick={onObs}>📺 OBS</button> : null}
            {showResolve && onResolve ? <button className="preview-pill" type="button" onClick={onResolve}>⇢ Resolve</button> : null}
            {showProgramMonitor && onProgramMonitor ? <button className="preview-pill" type="button" onClick={onProgramMonitor}>➕ Program</button> : null}
            {onDetailsToggle ? <button className="preview-pill" type="button" onClick={onDetailsToggle}>{detailsOpen ? 'Hide details' : 'Show details'}</button> : null}
            {playable ? (
              <label className="preview-volume">
                🔊
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
              </label>
            ) : null}
          </div>
          {onObsModeChange || onObsSlotChange || onObsExclusiveChange ? (
            <div className="preview-obs-row">
              <label>
                OBS mode
                <select value={obsMode} onChange={(event) => onObsModeChange?.(event.target.value as 'cover' | 'fit' | 'fill')}>
                  <option value="cover">Cover</option>
                  <option value="fit">Fit</option>
                  <option value="fill">Fill</option>
                </select>
              </label>
              <label>
                Slot
                <select value={obsSlot} onChange={(event) => onObsSlotChange?.(event.target.value)}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
              <label className="preview-obs-check">
                <input type="checkbox" checked={obsExclusive} onChange={(event) => onObsExclusiveChange?.(event.target.checked)} />
                Exclusive
              </label>
            </div>
          ) : null}
          {metadataRows.length ? (
            <div className={`preview-details ${detailsOpen ? 'open' : ''}`}>
              {metadataRows.map(([key, value]) => (
                <React.Fragment key={`${key}:${value}`}>
                  <div className="k">{key}</div>
                  <div className="v">{value}</div>
                </React.Fragment>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
