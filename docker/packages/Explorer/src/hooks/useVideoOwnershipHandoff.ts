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
  playRequested: boolean;
  playPromiseRejected: boolean;
  loadedMetadataSeen: boolean;
  loadedDataSeen: boolean;
  canPlaySeen: boolean;
  playingSeen: boolean;
  promotionBlockedReason: string;
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
  const [promotionBlockedReason, setPromotionBlockedReason] = useState('none');
  const [playbackState, setPlaybackState] = useState<PlaybackState>(EMPTY_PLAYBACK);
  const pendingHandoffRef = useRef<number | null>(null);
  const playRequestedRef = useRef(false);
  const playPromiseRejectedRef = useRef(false);
  const loadedMetadataSeenRef = useRef(false);
  const loadedDataSeenRef = useRef(false);
  const canPlaySeenRef = useRef(false);
  const playingSeenRef = useRef(false);

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
      playRequested: playRequestedRef.current,
      playPromiseRejected: playPromiseRejectedRef.current,
      loadedMetadataSeen: loadedMetadataSeenRef.current,
      loadedDataSeen: loadedDataSeenRef.current,
      canPlaySeen: canPlaySeenRef.current,
      playingSeen: playingSeenRef.current,
      promotionBlockedReason,
    });
  }, [audioOwner, firstFramePresented, mediaBranch, onDebug, promotionBlockedReason, promotionStrategy, selectionKey, streamUrl, videoReady, visualOwner]);

  const resetOwnership = useCallback(() => {
    setVisualOwner('thumbnail');
    setAudioOwner('none');
    setVideoReady(false);
    setFirstFramePresented(false);
    setPromotionStrategy('none');
    setPromotionBlockedReason('none');
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
    let promoted = false;

    setVisualOwner('poster');
    setAudioOwner('none');
    setVideoReady(false);
    setFirstFramePresented(false);
    setPromotionStrategy('none');
    setPromotionBlockedReason('none');

    playRequestedRef.current = false;
    playPromiseRejectedRef.current = false;
    loadedMetadataSeenRef.current = false;
    loadedDataSeenRef.current = false;
    canPlaySeenRef.current = false;
    playingSeenRef.current = false;

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

    const promote = (strategy: FirstFrameReadyStrategy | 'none', reason: string) => {
      if (promoted) return;
      promoted = true;
      setFirstFramePresented(true);
      setVideoReady(true);
      setPromotionStrategy(strategy);
      setPromotionBlockedReason('none');
      setVisualOwner('proxy');
      if (enableFocusedAudio && shouldPlay && playingSeenRef.current) {
        proxyVideoEl.muted = false;
        proxyVideoEl.defaultMuted = false;
        setAudioOwner('proxy');
      }
      onPromoted?.();
      onHandoffConsumed?.();
      syncPlaybackState(reason);
    };

    const tryFallbackPromote = (fallbackReason: string) => {
      if (promoted) return;
      const currentTime = Number.isFinite(proxyVideoEl.currentTime) ? proxyVideoEl.currentTime : 0;
      const immediateReady = proxyVideoEl.readyState >= 2 && (
        currentTime > 0.01
        || !proxyVideoEl.paused
        || loadedDataSeenRef.current
        || canPlaySeenRef.current
        || playingSeenRef.current
      );
      if (!immediateReady) {
        setPromotionBlockedReason(fallbackReason);
        syncPlaybackState(`${fallbackReason}-blocked`);
        return;
      }
      promote('fallback', fallbackReason);
    };

    const requestPlay = () => {
      if (!shouldPlay) return;
      playRequestedRef.current = true;
      proxyVideoEl.play().catch(() => {
        playPromiseRejectedRef.current = true;
        setPromotionBlockedReason('play-rejected');
        syncPlaybackState('play-rejected');
        // Safari may still gate autoplay in edge cases.
      });
    };

    const shouldStartPlayback = shouldPlay;
    if (shouldStartPlayback) {
      proxyVideoEl.load();
      tryApplyHandoffTime();
      requestPlay();
      tryFallbackPromote('immediate-readiness-fallback');
    }
    else if (pendingHandoffRef.current != null && !wasPlayingBeforeHandoff) {
      setPromotionBlockedReason('handoff-paused-before-open');
    }

    const onLoadedMetadata = () => {
      loadedMetadataSeenRef.current = true;
      tryApplyHandoffTime();
      syncPlaybackState('loadedmetadata');
    };
    const onLoadedData = () => {
      loadedDataSeenRef.current = true;
      tryApplyHandoffTime();
      requestPlay();
      tryFallbackPromote('loadeddata-fallback');
      syncPlaybackState('loadeddata');
    };
    const onCanPlay = () => {
      canPlaySeenRef.current = true;
      tryApplyHandoffTime();
      requestPlay();
      tryFallbackPromote('canplay-fallback');
      syncPlaybackState('canplay');
    };
    const onPlay = () => {
      playingSeenRef.current = true;
      tryFallbackPromote('playing-fallback');
      if (promoted && enableFocusedAudio && shouldPlay) {
        proxyVideoEl.muted = false;
        proxyVideoEl.defaultMuted = false;
        setAudioOwner('proxy');
      }
      syncPlaybackState('play');
    };
    const onPause = () => syncPlaybackState('pause');
    const onTimeUpdate = () => syncPlaybackState('timeupdate');
    const onWaiting = () => syncPlaybackState('waiting');
    const onStalled = () => syncPlaybackState('stalled');

    proxyVideoEl.addEventListener('loadedmetadata', onLoadedMetadata);
    proxyVideoEl.addEventListener('loadeddata', onLoadedData);
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
        setPromotionBlockedReason('first-frame-timeout');
        tryFallbackPromote('immediate-readiness-fallback');
        syncPlaybackState('first-frame-timeout');
        return;
      }
      promote(frame.strategy, 'first-frame-presented');
    })();

    return () => {
      alive = false;
      proxyVideoEl.pause();
      proxyVideoEl.muted = true;
      proxyVideoEl.defaultMuted = true;
      proxyVideoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
      proxyVideoEl.removeEventListener('loadeddata', onLoadedData);
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
