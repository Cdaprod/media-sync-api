import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { awaitVisibleVideoPaint } from '../utils/awaitVisibleVideoPaint';
import { awaitFirstVideoFrame, type FirstFrameReadyStrategy } from '../utils/awaitFirstVideoFrame';
import {
  getVideoResumeSnapshot,
  makeVideoResumeKey,
  maybeNormalizeResumeTime,
  setVideoResumeSnapshot,
} from '../utils/playbackResumeStore';

export type VisualOwner = 'thumbnail' | 'poster' | 'proxy-preparing' | 'proxy-overlap' | 'proxy';
export type AudioOwner = 'none' | 'proxy';

type PlaybackState = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
};

export type VideoOwnershipDebug = {
  reason: string;
  continuityKey: string;
  playbackIntentKey: string;
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
  thumbnailVideoNodeFound: boolean;
  thumbnailCurrentTime: number;
  thumbnailReadyState: number;
  thumbnailPaused: boolean;
  timeDeltaFromThumbnail: number | null;
  resumeSourceUsed: 'handoff-live' | 'focused-session-warm-reopen' | 'resume-store-cold-reopen' | 'none-start-at-zero';
  hasPoster: boolean;
  posterUrl: string;
  posterShown: boolean;
  runToken: string;
  isConnected: boolean;
  proxyMountedState: string;
  isSameAssetWarmReopen: boolean;
  authoritativeVisualSurface: 'none' | 'poster' | 'proxy';
  authoritativeAudioSurface: 'none' | 'proxy';
};

export type UseVideoOwnershipHandoffArgs = {
  selectionKey: string;
  streamUrl: string;
  isFocusedOpen: boolean;
  shouldPlay: boolean;
  enableFocusedAudio: boolean;
  proxyVideoEl: HTMLVideoElement | null;
  thumbnailVideoEl?: HTMLVideoElement | null;
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
  authoritativeVisualSurface: 'none' | 'poster' | 'proxy';
  authoritativeAudioSurface: 'none' | 'proxy';
  videoReady: boolean;
  firstFramePresented: boolean;
  canPromote: boolean;
  playbackState: PlaybackState;
  promotionStrategy: FirstFrameReadyStrategy | 'none';
  hasPoster: boolean;
  posterShown: boolean;
  posterUrl: string;
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
  thumbnailVideoEl = null,
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
  const continuityKey = makeVideoResumeKey(selectionKey, streamUrl);
  const playbackIntentKey = `${continuityKey}::${playToken}`;
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
  const activeRunTokenRef = useRef<symbol | null>(null);
  const resumeSourceRef = useRef<'handoff-live' | 'focused-session-warm-reopen' | 'resume-store-cold-reopen' | 'none-start-at-zero'>('none-start-at-zero');
  const runTokenLabelRef = useRef('run:idle');
  const activeResumeWriterVersionRef = useRef(0);
  const resumeWriterVersionByContinuityRef = useRef(new Map<string, number>());
  const authoritativeVisualSurfaceRef = useRef<'none' | 'poster' | 'proxy'>('none');
  const authoritativeAudioSurfaceRef = useRef<'none' | 'proxy'>('none');
  const lastFocusedSessionRef = useRef<{
    continuityKey: string;
    currentTime: number;
    duration: number;
    wasPlaying: boolean;
    updatedAt: number;
  } | null>(null);
  const debugContextRef = useRef({
    continuityKey,
    playbackIntentKey,
    sessionKey: continuityKey,
    selectionKey,
    streamUrl,
    mediaBranch,
  });
  const onPromotedRef = useRef(onPromoted);
  const onHandoffConsumedRef = useRef(onHandoffConsumed);
  const onDebugRef = useRef(onDebug);

  useEffect(() => {
    debugContextRef.current = {
      continuityKey,
      playbackIntentKey,
      sessionKey: continuityKey,
      selectionKey,
      streamUrl,
      mediaBranch,
    };
  }, [continuityKey, mediaBranch, playbackIntentKey, selectionKey, streamUrl]);
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
    const posterEl = cardEl?.querySelector<HTMLImageElement>('.proxy-render-poster') ?? null;
    const currentTime = Number.isFinite(video?.currentTime) ? (video?.currentTime || 0) : 0;
    const duration = Number.isFinite(video?.duration) ? (video?.duration || 0) : 0;
    const thumbnailCurrentTime = Number.isFinite(thumbnailVideoEl?.currentTime) ? (thumbnailVideoEl?.currentTime || 0) : 0;
    const thumbnailVideoNodeFound = Boolean(thumbnailVideoEl);
    const timeDeltaFromThumbnail = thumbnailVideoNodeFound
      ? Math.abs(currentTime - thumbnailCurrentTime)
      : null;
    onDebugHandler({
      reason,
      continuityKey: context.continuityKey,
      playbackIntentKey: context.playbackIntentKey,
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
      thumbnailVideoNodeFound,
      thumbnailCurrentTime,
      thumbnailReadyState: thumbnailVideoEl?.readyState ?? 0,
      thumbnailPaused: thumbnailVideoEl?.paused ?? true,
      timeDeltaFromThumbnail,
      resumeSourceUsed: resumeSourceRef.current,
      hasPoster: Boolean(posterEl?.src),
      posterUrl: posterEl?.src || '',
      posterShown: latest.visualOwner === 'poster' || !latest.firstFramePresented,
      runToken: runTokenLabelRef.current,
      isConnected: Boolean(video?.isConnected),
      proxyMountedState: video?.dataset.proxyMountedState || '',
      isSameAssetWarmReopen: resumeSourceRef.current === 'focused-session-warm-reopen',
      authoritativeVisualSurface: authoritativeVisualSurfaceRef.current,
      authoritativeAudioSurface: authoritativeAudioSurfaceRef.current,
    });
  }, [thumbnailVideoEl]);

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
    const persistResumeSnapshot = (video: HTMLVideoElement, wasPlaying: boolean) => {
      const isAuthoritativeWriter = (
        video.isConnected
        && latestSessionKeyRef.current === continuityKey
        && activeResumeWriterVersionRef.current > 0
        && (authoritativeVisualSurfaceRef.current === 'proxy' || isFocusedOpen)
      );
      if (!isAuthoritativeWriter) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const normalizedTime = maybeNormalizeResumeTime(currentTime, duration);
      setVideoResumeSnapshot(continuityKey, {
        currentTime: normalizedTime,
        duration,
        wasPlaying,
        updatedAt: Date.now(),
        writerVersion: activeResumeWriterVersionRef.current,
      });
      if (isFocusedOpen) {
        lastFocusedSessionRef.current = {
          continuityKey,
          currentTime: normalizedTime,
          duration,
          wasPlaying,
          updatedAt: Date.now(),
        };
      }
    };

    if (!selectionKey || !streamUrl) {
      latestSessionKeyRef.current = '';
      activeResumeWriterVersionRef.current = 0;
      authoritativeVisualSurfaceRef.current = 'none';
      authoritativeAudioSurfaceRef.current = 'none';
      if (proxyVideoEl) {
        proxyVideoEl.pause();
        proxyVideoEl.muted = true;
        proxyVideoEl.defaultMuted = true;
      }
      resetOwnership();
      publishDebug('inactive-no-selection', proxyVideoEl);
      return;
    }

    if (!isFocusedOpen) {
      if (proxyVideoEl) {
        persistResumeSnapshot(proxyVideoEl, !proxyVideoEl.paused);
        proxyVideoEl.muted = true;
        proxyVideoEl.defaultMuted = true;
      }
      setAudioOwner('none');
      authoritativeAudioSurfaceRef.current = 'none';
      setVisualOwner('thumbnail');
      authoritativeVisualSurfaceRef.current = 'poster';
      publishDebug('inactive-focused-closed', proxyVideoEl);
      publishDebug('proxy-state-after-close', proxyVideoEl);
      publishDebug('focus-close-cleanup', proxyVideoEl);
      return;
    }

    if (!proxyVideoEl) {
      setVisualOwner('poster');
      authoritativeVisualSurfaceRef.current = 'poster';
      setAudioOwner('none');
      authoritativeAudioSurfaceRef.current = 'none';
      setVideoReady(false);
      setFirstFramePresented(false);
      setPromotionStrategy('none');
      publishDebug('waiting-video-el', null);
      return;
    }

    const isSessionChanged = latestSessionKeyRef.current !== continuityKey;
    latestSessionKeyRef.current = continuityKey;
    if (isSessionChanged) {
      const nextWriterVersion = (resumeWriterVersionByContinuityRef.current.get(continuityKey) ?? 0) + 1;
      resumeWriterVersionByContinuityRef.current.set(continuityKey, nextWriterVersion);
      activeResumeWriterVersionRef.current = nextWriterVersion;
    }
    else {
      activeResumeWriterVersionRef.current = resumeWriterVersionByContinuityRef.current.get(continuityKey) ?? 1;
    }

    let alive = true;
    const runToken = Symbol('video-ownership-run');
    runTokenLabelRef.current = `${String(selectionKey)}::${String(playToken)}::${Date.now()}`;
    activeRunTokenRef.current = runToken;
    let sawTimeProgress = false;
    let promoted = false;
    const resumeSnapshot = getVideoResumeSnapshot(continuityKey);

    if (isSessionChanged) {
      setVisualOwner('poster');
      authoritativeVisualSurfaceRef.current = 'poster';
      setAudioOwner('none');
      authoritativeAudioSurfaceRef.current = 'none';
      setVideoReady(false);
      setFirstFramePresented(false);
      setPromotionStrategy('none');
      setPromotionBlockedReason('none');
      resumeSourceRef.current = 'none-start-at-zero';
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

    const tryApplyResumeTargetTime = () => {
      if (proxyVideoEl.readyState < 1) return;
      const pendingHandoff = pendingHandoffRef.current;
      const hasLiveThumbnailFrame = Boolean(
        thumbnailVideoEl
        && thumbnailVideoEl.isConnected
        && thumbnailVideoEl.readyState >= 2
        && thumbnailVideoEl.currentTime > 0.01,
      );
      const focusedSessionSnapshot = (
        lastFocusedSessionRef.current
        && lastFocusedSessionRef.current.continuityKey === continuityKey
      )
        ? lastFocusedSessionRef.current
        : null;
      const resumeTime = resumeSnapshot?.currentTime ?? null;
      const canUseLiveHandoff = pendingHandoff != null && hasLiveThumbnailFrame && wasPlayingBeforeHandoff;
      const rawTarget = canUseLiveHandoff
        ? pendingHandoff
        : (focusedSessionSnapshot?.currentTime ?? resumeTime);
      if (rawTarget == null) {
        resumeSourceRef.current = 'none-start-at-zero';
        return;
      }
      resumeSourceRef.current = canUseLiveHandoff
        ? 'handoff-live'
        : (focusedSessionSnapshot ? 'focused-session-warm-reopen' : 'resume-store-cold-reopen');
      if (resumeSourceRef.current === 'focused-session-warm-reopen') {
        publishDebug('same-asset-grid-reentry', proxyVideoEl);
      }
      const duration = Number.isFinite(proxyVideoEl.duration) ? proxyVideoEl.duration : 0;
      const target = duration > 0
        ? maybeNormalizeResumeTime(rawTarget, duration)
        : Math.max(0, rawTarget);
      try {
        proxyVideoEl.currentTime = Math.max(0, target);
        if (pendingHandoff != null) {
          pendingHandoffRef.current = null;
        }
      }
      catch {
        // Ignore early seek failure; we'll retry on the next readiness event.
      }
    };

    const promote = (strategy: FirstFrameReadyStrategy | 'none', reason: string) => {
      if (promoted) return;
      promoted = true;
      setPromotionStrategy(strategy);
      setPromotionBlockedReason('none');
      const hasLiveThumbnailFrame = Boolean(
        thumbnailVideoEl
        && thumbnailVideoEl.isConnected
        && thumbnailVideoEl.readyState >= 2
        && thumbnailVideoEl.currentTime > 0.01,
      );
      if (!hasLiveThumbnailFrame) {
        authoritativeVisualSurfaceRef.current = 'poster';
        setVisualOwner('poster');
        publishDebug('first-open-poster-hold', proxyVideoEl);
        publishDebug('first-open-no-live-thumbnail', proxyVideoEl);
        if (resumeSourceRef.current === 'focused-session-warm-reopen') {
          publishDebug('poster-held-same-asset-reopen', proxyVideoEl);
        }
      }
      else {
        setVisualOwner('proxy-preparing');
      }

      void (async () => {
        const visiblePaint = await awaitVisibleVideoPaint(proxyVideoEl, { timeoutMs: 420 });
        if (!alive) return;
        if (!visiblePaint.ok) {
          setPromotionBlockedReason('visible-paint-timeout');
          syncPlaybackState('visible-paint-timeout');
          return;
        }
        setVisualOwner('proxy-overlap');
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (!alive) return;
        setVideoReady(true);
        setFirstFramePresented(true);
        setVisualOwner('proxy');
        authoritativeVisualSurfaceRef.current = 'proxy';
        publishDebug('poster-release-after-paint', proxyVideoEl);
        if (resumeSourceRef.current === 'focused-session-warm-reopen') {
          publishDebug('poster-release-same-asset-reopen', proxyVideoEl);
        }
        const cardEl = proxyVideoEl.closest<HTMLElement>('.proxy-render-card[data-selection-key]');
        if (cardEl) {
          cardEl.dataset.firstFramePresented = 'true';
          cardEl.dataset.videoReady = 'true';
          cardEl.dataset.promotionStrategy = strategy;
          cardEl.dataset.proxySessionId = continuityKey;
        }
        proxyVideoEl.dataset.proxySessionId = continuityKey;
        onPromotedRef.current?.();
        onHandoffConsumedRef.current?.();
        syncPlaybackState(reason);
      })();
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
      if (!proxyVideoEl.isConnected) {
        publishDebug('play-skipped-disconnected', proxyVideoEl);
        return;
      }
      playRequestedRef.current = true;
      const currentSession = continuityKey;
      let playPromise: Promise<void>;
      try {
        playPromise = proxyVideoEl.play();
      }
      catch {
        publishDebug('play-threw-sync', proxyVideoEl);
        return;
      }
      playPromise.catch((error: unknown) => {
        const err = error as { name?: string } | null | undefined;
        if (!alive || activeRunTokenRef.current !== runToken) return;
        if (latestSessionKeyRef.current !== currentSession) return;
        if (err?.name === 'AbortError') return;
        playPromiseRejectedRef.current = true;
        setPromotionBlockedReason('play-rejected');
        syncPlaybackState('play-rejected');
        // Safari may still gate autoplay in edge cases.
      });
    };

    const onLoadedMetadata = () => {
      loadedMetadataSeenRef.current = true;
      tryApplyResumeTargetTime();
      syncPlaybackState('loadedmetadata');
    };
    const onLoadedData = () => {
      loadedDataSeenRef.current = true;
      tryApplyResumeTargetTime();
      requestPlay();
      tryFallbackPromote('loadeddata-fallback');
      syncPlaybackState('loadeddata');
    };
    const onCanPlay = () => {
      canPlaySeenRef.current = true;
      tryApplyResumeTargetTime();
      requestPlay();
      tryFallbackPromote('canplay-fallback');
      syncPlaybackState('canplay');
    };
    const onPlay = () => {
      playingSeenRef.current = true;
      tryFallbackPromote('playing-fallback');
      syncPlaybackState('play');
    };
    const onPause = () => {
      persistResumeSnapshot(proxyVideoEl, false);
      syncPlaybackState('pause');
    };
    const onTimeUpdate = () => {
      persistResumeSnapshot(proxyVideoEl, !proxyVideoEl.paused);
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

    const isSameStream = (value: string) => {
      if (!value || !streamUrl) return false;
      try {
        return new URL(value, window.location.href).href === new URL(streamUrl, window.location.href).href;
      }
      catch {
        return value === streamUrl;
      }
    };
    const sourceAlreadyBound = isSameStream(proxyVideoEl.currentSrc) || isSameStream(proxyVideoEl.src);
    if (!sourceAlreadyBound) {
      proxyVideoEl.src = streamUrl;
      proxyVideoEl.load();
      syncPlaybackState('source-bound');
    }
    else {
      publishDebug('source-reused', proxyVideoEl);
    }

    const shouldStartPlayback = shouldPlay;
    if (shouldStartPlayback) {
      tryApplyResumeTargetTime();
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
      if (activeRunTokenRef.current === runToken) {
        activeRunTokenRef.current = null;
      }
      persistResumeSnapshot(proxyVideoEl, !proxyVideoEl.paused);
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
    continuityKey,
    shouldPlay,
    streamUrl,
    wasPlayingBeforeHandoff,
    publishDebug,
  ]);

  useEffect(() => {
    if (!proxyVideoEl) return;
    if (!proxyVideoEl.isConnected) {
      authoritativeAudioSurfaceRef.current = 'none';
      publishDebug('audio-owner-denied-detached', proxyVideoEl);
      return;
    }
    const shouldEnableAudio = (
      isFocusedOpen
      && enableFocusedAudio
      && shouldPlay
      && (visualOwner === 'proxy' || visualOwner === 'proxy-overlap')
    );
    if (shouldEnableAudio) {
      proxyVideoEl.muted = false;
      proxyVideoEl.defaultMuted = false;
      if (audioOwner !== 'proxy') {
        setAudioOwner('proxy');
      }
      authoritativeAudioSurfaceRef.current = 'proxy';
      publishDebug('audio-owner-granted', proxyVideoEl);
    }
    else {
      proxyVideoEl.muted = true;
      proxyVideoEl.defaultMuted = true;
      if (audioOwner !== 'none') {
        setAudioOwner('none');
      }
      authoritativeAudioSurfaceRef.current = 'none';
      if (!isFocusedOpen) {
        publishDebug('audio-owner-revoked-close', proxyVideoEl);
      }
      else {
        publishDebug('audio-owner-denied-hidden', proxyVideoEl);
      }
    }
  }, [audioOwner, enableFocusedAudio, isFocusedOpen, proxyVideoEl, publishDebug, shouldPlay, visualOwner]);

  const canPromote = useMemo(() => (
    isFocusedOpen
    && Boolean(selectionKey)
    && Boolean(streamUrl)
    && (videoReady || firstFramePresented)
  ), [firstFramePresented, isFocusedOpen, selectionKey, streamUrl, videoReady]);
  const posterState = useMemo(() => {
    const cardEl = proxyVideoEl?.closest<HTMLElement>('.proxy-render-card[data-selection-key]') ?? null;
    const posterEl = cardEl?.querySelector<HTMLImageElement>('.proxy-render-poster') ?? null;
    const posterUrl = posterEl?.src || '';
    return {
      hasPoster: Boolean(posterUrl),
      posterUrl,
      posterShown: visualOwner === 'poster' || !firstFramePresented,
    };
  }, [firstFramePresented, proxyVideoEl, visualOwner]);

  useEffect(() => {
    if (!proxyVideoEl || !isFocusedOpen) return;
    if (visualOwner !== 'poster' || !firstFramePresented) return;
    setVisualOwner('proxy');
    authoritativeVisualSurfaceRef.current = 'proxy';
    publishDebug('poster-stuck-guard-fired', proxyVideoEl);
  }, [firstFramePresented, isFocusedOpen, proxyVideoEl, publishDebug, visualOwner]);

  return {
    visualOwner,
    audioOwner,
    authoritativeVisualSurface: authoritativeVisualSurfaceRef.current,
    authoritativeAudioSurface: authoritativeAudioSurfaceRef.current,
    videoReady,
    firstFramePresented,
    canPromote,
    playbackState,
    promotionStrategy,
    hasPoster: posterState.hasPoster,
    posterShown: posterState.posterShown,
    posterUrl: posterState.posterUrl,
    resetOwnership,
  };
}
