import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { awaitFirstVideoFrame, type FirstFrameReadyStrategy } from '../utils/awaitFirstVideoFrame';

export type VisualOwner = 'thumbnail' | 'poster' | 'proxy';
export type AudioOwner = 'none' | 'proxy';

type PlaybackState = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
};

export type VideoOwnershipDebug = {
  reason: string;
  selectionKey: string;
  streamUrl: string;
  visualOwner: VisualOwner;
  audioOwner: AudioOwner;
  videoReady: boolean;
  firstFramePresented: boolean;
  promotionStrategy: FirstFrameReadyStrategy | 'none';
  currentTime: number;
  duration: number;
  readyState: number;
  paused: boolean;
  muted: boolean;
  mediaBranch: string;
  handoffTime: number | null;
};

export type UseVideoOwnershipHandoffArgs = {
  selectionKey: string;
  streamUrl: string;
  isFocusedOpen: boolean;
  shouldPlay: boolean;
  enableFocusedAudio: boolean;
  proxyVideoEl: HTMLVideoElement | null;
  mediaBranch: string;
  handoffTime: number | null;
  wasPlayingBeforeHandoff: boolean;
  playToken: number;
  onHandoffConsumed?: () => void;
  onPromoted?: () => void;
  onDebug?: (entry: VideoOwnershipDebug) => void;
};

export type UseVideoOwnershipHandoffResult = {
  visualOwner: VisualOwner;
  audioOwner: AudioOwner;
  videoReady: boolean;
  firstFramePresented: boolean;
  canPromote: boolean;
  playbackState: PlaybackState;
  promotionStrategy: FirstFrameReadyStrategy | 'none';
  resetOwnership: () => void;
};

const EMPTY_PLAYBACK: PlaybackState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};

export function useVideoOwnershipHandoff({
  selectionKey,
  streamUrl,
  isFocusedOpen,
  shouldPlay,
  enableFocusedAudio,
  proxyVideoEl,
  mediaBranch,
  handoffTime,
  wasPlayingBeforeHandoff,
  playToken,
  onHandoffConsumed,
  onPromoted,
  onDebug,
}: UseVideoOwnershipHandoffArgs): UseVideoOwnershipHandoffResult {
  const [visualOwner, setVisualOwner] = useState<VisualOwner>('thumbnail');
  const [audioOwner, setAudioOwner] = useState<AudioOwner>('none');
  const [videoReady, setVideoReady] = useState(false);
  const [firstFramePresented, setFirstFramePresented] = useState(false);
  const [promotionStrategy, setPromotionStrategy] = useState<FirstFrameReadyStrategy | 'none'>('none');
  const [playbackState, setPlaybackState] = useState<PlaybackState>(EMPTY_PLAYBACK);
  const pendingHandoffRef = useRef<number | null>(null);

  useEffect(() => {
    pendingHandoffRef.current = handoffTime == null ? null : Math.max(0, handoffTime);
  }, [handoffTime]);

  const publishDebug = useCallback((reason: string, video: HTMLVideoElement | null) => {
    if (!onDebug) return;
    const currentTime = Number.isFinite(video?.currentTime) ? (video?.currentTime || 0) : 0;
    const duration = Number.isFinite(video?.duration) ? (video?.duration || 0) : 0;
    onDebug({
      reason,
      selectionKey,
      streamUrl,
      visualOwner,
      audioOwner,
      videoReady,
      firstFramePresented,
      promotionStrategy,
      currentTime,
      duration,
      readyState: video?.readyState ?? 0,
      paused: video?.paused ?? true,
      muted: video?.muted ?? true,
      mediaBranch,
      handoffTime: pendingHandoffRef.current,
    });
  }, [audioOwner, firstFramePresented, mediaBranch, onDebug, promotionStrategy, selectionKey, streamUrl, videoReady, visualOwner]);

  const resetOwnership = useCallback(() => {
    setVisualOwner('thumbnail');
    setAudioOwner('none');
    setVideoReady(false);
    setFirstFramePresented(false);
    setPromotionStrategy('none');
    setPlaybackState(EMPTY_PLAYBACK);
  }, []);

  useEffect(() => {
    if (!isFocusedOpen || !selectionKey || !streamUrl) {
      if (proxyVideoEl) {
        proxyVideoEl.pause();
        proxyVideoEl.muted = true;
        proxyVideoEl.defaultMuted = true;
      }
      resetOwnership();
      publishDebug('inactive', proxyVideoEl);
      return;
    }

    if (!proxyVideoEl) {
      setVisualOwner('poster');
      setAudioOwner('none');
      setVideoReady(false);
      setFirstFramePresented(false);
      setPromotionStrategy('none');
      publishDebug('waiting-video-el', null);
      return;
    }

    let alive = true;
    let sawTimeProgress = false;

    setVisualOwner('poster');
    setAudioOwner('none');
    setVideoReady(false);
    setFirstFramePresented(false);
    setPromotionStrategy('none');

    proxyVideoEl.muted = true;
    proxyVideoEl.defaultMuted = true;
    proxyVideoEl.playsInline = true;
    proxyVideoEl.preload = 'auto';

    const syncPlaybackState = (reason: string) => {
      const currentTime = Number.isFinite(proxyVideoEl.currentTime) ? proxyVideoEl.currentTime : 0;
      const duration = Number.isFinite(proxyVideoEl.duration) ? proxyVideoEl.duration : 0;
      const hasProgress = currentTime > 0.04;
      if (hasProgress) sawTimeProgress = true;
      const isPlaying = !proxyVideoEl.paused && proxyVideoEl.readyState >= 2 && (sawTimeProgress || hasProgress);
      setPlaybackState({ isPlaying, currentTime, duration });
      publishDebug(reason, proxyVideoEl);
    };

    const tryApplyHandoffTime = () => {
      const pendingHandoff = pendingHandoffRef.current;
      if (pendingHandoff == null) return;
      if (proxyVideoEl.readyState < 1) return;
      const duration = Number.isFinite(proxyVideoEl.duration) ? proxyVideoEl.duration : 0;
      const target = duration > 0
        ? Math.min(pendingHandoff, Math.max(0, duration - 0.04))
        : pendingHandoff;
      try {
        proxyVideoEl.currentTime = Math.max(0, target);
        pendingHandoffRef.current = null;
      }
      catch {
        // Ignore early seek failure; we'll retry on the next readiness event.
      }
    };

    const requestPlay = () => {
      if (!shouldPlay) return;
      proxyVideoEl.play().catch(() => {
        // Safari may still gate autoplay in edge cases.
      });
    };

    const shouldStartPlayback = shouldPlay && (pendingHandoffRef.current != null ? wasPlayingBeforeHandoff : true);
    if (shouldStartPlayback) {
      tryApplyHandoffTime();
      requestPlay();
    }

    const onLoadedMetadata = () => {
      tryApplyHandoffTime();
      syncPlaybackState('loadedmetadata');
    };
    const onCanPlay = () => {
      tryApplyHandoffTime();
      requestPlay();
      syncPlaybackState('canplay');
    };
    const onPlay = () => syncPlaybackState('play');
    const onPause = () => syncPlaybackState('pause');
    const onTimeUpdate = () => syncPlaybackState('timeupdate');
    const onWaiting = () => syncPlaybackState('waiting');
    const onStalled = () => syncPlaybackState('stalled');

    proxyVideoEl.addEventListener('loadedmetadata', onLoadedMetadata);
    proxyVideoEl.addEventListener('loadeddata', onCanPlay);
    proxyVideoEl.addEventListener('canplay', onCanPlay);
    proxyVideoEl.addEventListener('play', onPlay);
    proxyVideoEl.addEventListener('pause', onPause);
    proxyVideoEl.addEventListener('timeupdate', onTimeUpdate);
    proxyVideoEl.addEventListener('waiting', onWaiting);
    proxyVideoEl.addEventListener('stalled', onStalled);

    syncPlaybackState('mount');

    void (async () => {
      const frame = await awaitFirstVideoFrame(proxyVideoEl);
      if (!alive) return;
      if (!frame.ok) {
        syncPlaybackState('first-frame-timeout');
        return;
      }
      setFirstFramePresented(true);
      setVideoReady(true);
      setPromotionStrategy(frame.strategy);
      setVisualOwner('proxy');
      if (enableFocusedAudio && shouldPlay) {
        proxyVideoEl.muted = false;
        proxyVideoEl.defaultMuted = false;
        setAudioOwner('proxy');
      }
      onPromoted?.();
      onHandoffConsumed?.();
      syncPlaybackState('first-frame-presented');
    })();

    return () => {
      alive = false;
      proxyVideoEl.pause();
      proxyVideoEl.muted = true;
      proxyVideoEl.defaultMuted = true;
      proxyVideoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
      proxyVideoEl.removeEventListener('loadeddata', onCanPlay);
      proxyVideoEl.removeEventListener('canplay', onCanPlay);
      proxyVideoEl.removeEventListener('play', onPlay);
      proxyVideoEl.removeEventListener('pause', onPause);
      proxyVideoEl.removeEventListener('timeupdate', onTimeUpdate);
      proxyVideoEl.removeEventListener('waiting', onWaiting);
      proxyVideoEl.removeEventListener('stalled', onStalled);
    };
  }, [
    enableFocusedAudio,
    isFocusedOpen,
    onHandoffConsumed,
    onPromoted,
    proxyVideoEl,
    publishDebug,
    resetOwnership,
    selectionKey,
    shouldPlay,
    streamUrl,
    wasPlayingBeforeHandoff,
    playToken,
  ]);

  const canPromote = useMemo(() => (
    isFocusedOpen
    && Boolean(selectionKey)
    && Boolean(streamUrl)
    && (videoReady || firstFramePresented)
  ), [firstFramePresented, isFocusedOpen, selectionKey, streamUrl, videoReady]);

  return {
    visualOwner,
    audioOwner,
    videoReady,
    firstFramePresented,
    canPromote,
    playbackState,
    promotionStrategy,
    resetOwnership,
  };
}
