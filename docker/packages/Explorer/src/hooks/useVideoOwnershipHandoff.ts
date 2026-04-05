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
  sessionKey: string;
  selectionKey: string;
  streamUrl: string;
  videoNodeFound: boolean;
  videoStableId: string;
  cardSelectionKey: string;
  cardVideoReady: string;
  cardFirstFramePresented: string;
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
  currentSrc: string;
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
  const sessionKey = `${selectionKey}::${streamUrl}::${playToken}`;
  const pendingHandoffRef = useRef<number | null>(null);
  const latestSessionKeyRef = useRef('');
  const latestDebugStateRef = useRef<{
    visualOwner: VisualOwner;
    audioOwner: AudioOwner;
    videoReady: boolean;
    firstFramePresented: boolean;
    promotionStrategy: FirstFrameReadyStrategy | 'none';
    promotionBlockedReason: string;
  }>({
    visualOwner: 'thumbnail',
    audioOwner: 'none',
    videoReady: false,
    firstFramePresented: false,
    promotionStrategy: 'none',
    promotionBlockedReason: 'none',
  });
  const playRequestedRef = useRef(false);
  const playPromiseRejectedRef = useRef(false);
  const loadedMetadataSeenRef = useRef(false);
  const loadedDataSeenRef = useRef(false);
  const canPlaySeenRef = useRef(false);
  const playingSeenRef = useRef(false);
  const debugContextRef = useRef({
    sessionKey,
    selectionKey,
    streamUrl,
    mediaBranch,
  });
  const onPromotedRef = useRef(onPromoted);
  const onHandoffConsumedRef = useRef(onHandoffConsumed);
  const onDebugRef = useRef(onDebug);

  useEffect(() => {
    debugContextRef.current = {
      sessionKey,
      selectionKey,
      streamUrl,
      mediaBranch,
    };
  }, [mediaBranch, selectionKey, sessionKey, streamUrl]);
  useEffect(() => {
    onPromotedRef.current = onPromoted;
  }, [onPromoted]);
  useEffect(() => {
    onHandoffConsumedRef.current = onHandoffConsumed;
  }, [onHandoffConsumed]);
  useEffect(() => {
    onDebugRef.current = onDebug;
  }, [onDebug]);

  useEffect(() => {
    pendingHandoffRef.current = handoffTime == null ? null : Math.max(0, handoffTime);
  }, [handoffTime]);
  useEffect(() => {
    latestDebugStateRef.current = {
      visualOwner,
      audioOwner,
      videoReady,
      firstFramePresented,
      promotionStrategy,
      promotionBlockedReason,
    };
  }, [audioOwner, firstFramePresented, promotionBlockedReason, promotionStrategy, videoReady, visualOwner]);

  const publishDebug = useCallback((reason: string, video: HTMLVideoElement | null) => {
    const onDebugHandler = onDebugRef.current;
    if (!onDebugHandler) return;
    const latest = latestDebugStateRef.current;
    const context = debugContextRef.current;
    const cardEl = video?.closest<HTMLElement>('.proxy-render-card[data-selection-key]') ?? null;
    const currentTime = Number.isFinite(video?.currentTime) ? (video?.currentTime || 0) : 0;
    const duration = Number.isFinite(video?.duration) ? (video?.duration || 0) : 0;
    onDebugHandler({
      reason,
      sessionKey: context.sessionKey,
      selectionKey: context.selectionKey,
      streamUrl: context.streamUrl,
      videoNodeFound: Boolean(video),
      videoStableId: video?.dataset.proxyStableVideoId || '',
      cardSelectionKey: cardEl?.dataset.selectionKey || '',
      cardVideoReady: cardEl?.dataset.videoReady || '',
      cardFirstFramePresented: cardEl?.dataset.firstFramePresented || '',
      visualOwner: latest.visualOwner,
      audioOwner: latest.audioOwner,
      videoReady: latest.videoReady,
      firstFramePresented: latest.firstFramePresented,
      promotionStrategy: latest.promotionStrategy,
      currentTime,
      duration,
      readyState: video?.readyState ?? 0,
      paused: video?.paused ?? true,
      muted: video?.muted ?? true,
      currentSrc: video?.currentSrc || video?.src || '',
      mediaBranch: context.mediaBranch,
      handoffTime: pendingHandoffRef.current,
      playRequested: playRequestedRef.current,
      playPromiseRejected: playPromiseRejectedRef.current,
      loadedMetadataSeen: loadedMetadataSeenRef.current,
      loadedDataSeen: loadedDataSeenRef.current,
      canPlaySeen: canPlaySeenRef.current,
      playingSeen: playingSeenRef.current,
      promotionBlockedReason: latest.promotionBlockedReason,
    });
  }, []);

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
      latestSessionKeyRef.current = '';
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

    const isSessionChanged = latestSessionKeyRef.current !== sessionKey;
    latestSessionKeyRef.current = sessionKey;

    let alive = true;
    let sawTimeProgress = false;
    let promoted = false;

    if (isSessionChanged) {
      setVisualOwner('poster');
      setAudioOwner('none');
      setVideoReady(false);
      setFirstFramePresented(false);
      setPromotionStrategy('none');
      setPromotionBlockedReason('none');
    }

    if (isSessionChanged) {
      playRequestedRef.current = false;
      playPromiseRejectedRef.current = false;
      loadedMetadataSeenRef.current = false;
      loadedDataSeenRef.current = false;
      canPlaySeenRef.current = false;
      playingSeenRef.current = false;
    }

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
      const cardEl = proxyVideoEl.closest<HTMLElement>('.proxy-render-card[data-selection-key]');
      if (cardEl) {
        cardEl.dataset.firstFramePresented = 'true';
        cardEl.dataset.videoReady = 'true';
        cardEl.dataset.promotionStrategy = strategy;
        cardEl.dataset.proxySessionId = sessionKey;
      }
      proxyVideoEl.dataset.proxySessionId = sessionKey;
      onPromotedRef.current?.();
      onHandoffConsumedRef.current?.();
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
    const onTimeUpdate = () => {
      tryFallbackPromote('timeupdate-fallback');
      syncPlaybackState('timeupdate');
    };
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
    playToken,
    proxyVideoEl,
    resetOwnership,
    selectionKey,
    sessionKey,
    shouldPlay,
    streamUrl,
    wasPlayingBeforeHandoff,
    publishDebug,
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
