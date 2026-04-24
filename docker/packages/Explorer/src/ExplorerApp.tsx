'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { createApiClient } from './api';
import type { AssetRef } from './api';
import {
  sortPendingComposeItemsForDisplay,
} from './composeJobs';
import type { ComposeJobEnvelope, PendingComposeItem } from './composeJobs';
import {
  buildMediaIdentityKey,
  collectMediaMeta,
  extractAiTags,
  extractTags,
  filterMedia,
  mergeMediaItemsPreservingIdentity,
  pruneSelection,
  selectionOrderIndexMap,
  sortMedia,
  sortMediaByRecent,
  toggleSelectionWithOrder,
} from './state';
import type { MediaMeta, MediaTypeFilter, SortKey } from './state';
import type { ExplorerView, MediaItem, Project, ToastMessage } from './types';
import {
  copyTextWithFallback,
  formatBytes,
  guessKind,
  inferApiBaseUrl,
  isInteractiveTarget,
  isTopbarOwnedTarget,
  kindBadgeClass,
  toAbsoluteUrl,
} from './utils';
import { AssetPreviewPanel, ProxyFocusedChromeFullParity } from './AssetPreviewPanel';
import { AssetGrid } from './components/AssetGrid';
import { AssetList } from './components/AssetList';
import { LiveSourceCard } from './components/LiveSourceCard';
import { RegisterNodeModal } from './components/RegisterNodeModal';
import { RuntimeDetailsModal } from './components/RuntimeDetailsModal';
import { normalizePreviewAsset } from './previewAdapter';
import { buildThumbJobKey, getThumbCacheKey, isThumbableRelativePath, normalizeThumbUrl } from './thumbnailLoader';
import { usePendingComposeJobs } from './hooks/usePendingComposeJobs';
import { useAssetInteractions } from './hooks/useAssetInteractions';
import { useThumbnailQueue } from './hooks/useThumbnailQueue';
import { useTopbarScrollState } from './hooks/useTopbarScrollState';
import { useSourceControlData } from './hooks/useSourceControlData';
import { useLiveSessions } from './hooks/useLiveSessions';
import { createTopbarMotion } from './ui/motion/topbarMotion';
import { createDrawerMotion } from './ui/motion/drawerMotion';
import { createTopbarSnapBand } from './ui/motion/topbarSnapBand';
import { createToastMotion } from './ui/motion/toastMotion';
import { createModalMotion } from './ui/motion/modalMotion';
import { createExplorerDensityController } from './explorer/density/createExplorerDensityController';
import { createPinchDensityController } from './explorer/density/createPinchDensityController';
import { DEFAULT_COLUMNS_MOBILE, MAX_COLUMNS_MOBILE, MIN_COLUMNS_MOBILE } from './explorer/density/constants';
import {
  computeFocusWorldTransformWithDiagnostics,
  FOCUS_OVERLAY_REVEAL_DELAY_MS,
  FOCUS_WORLD_OPEN_DURATION_MS,
  type FocusWorldGuardDiagnostics,
  type FocusWorldGuardFailureReason,
  type FocusWorldTransform,
} from './explorer/focus/focusWorldMotion';
import { resolveFocusedTapTarget } from './explorer/focus/resolveFocusedTapTarget';
import PinchShaderOverlay from './ui/shaders/pinch/PinchShaderOverlay';
import TapShaderOverlay from './ui/shaders/tap/TapShaderOverlay';
import HoldShaderOverlay from './ui/shaders/hold/HoldShaderOverlay';
import { FocusTransitionOrchestrator } from './render/FocusTransitionOrchestrator';
import { useLibrarySnapshot } from './hooks/useLibrarySnapshot';
import { useExplorerCommands } from './hooks/useExplorerCommands';
import { useExplorerUiState } from './hooks/useExplorerUiState';
import { useVideoOwnershipHandoff } from './hooks/useVideoOwnershipHandoff';
import type { RegisterNodeResponse } from './types/registration';
import type { NodeControlRecord, SourceControlRecord } from './types/sourceControl';
import type { LiveSession } from './types/liveSession';
import type { IngestClaimRecord } from './types/ingestClaim';
import { getDeviceUrl, getRuntimeCapabilityTags, getRuntimeKinds, isSessionNode, isTestPayloadClaim, isTestPayloadNode } from './utils/runtimeLabels';

interface ExplorerAppProps {
  apiBaseUrl?: string;
}

type AssetRenderedEntry = { kind: 'asset'; item: MediaItem };
type PendingRenderedEntry = { kind: 'pending'; pendingItem: PendingComposeItem };
type RenderedMediaEntry = AssetRenderedEntry | PendingRenderedEntry;
type PinchOverlayPoint = { x: number; y: number } | null;
type FocusPresentationState =
  | { mode: 'idle' }
  | { mode: 'world-focus'; key: string; overlayReady: boolean }
  | { mode: 'drawer-fallback'; key: string };
type FocusMeasurementFailureReason =
  | 'missing-stage'
  | 'missing-viewport'
  | 'missing-grid'
  | 'missing-card'
  | 'unsafe-transform';
type StartFocusFailureReason = 'not-grid' | 'density-unsafe' | 'inspector-closed' | FocusMeasurementFailureReason;
type StartFocusMotionResult =
  | { ok: true }
  | { ok: false; reason: StartFocusFailureReason };
type FocusMeasurementResult = {
  transform: FocusWorldTransform | null;
  reason: FocusMeasurementFailureReason | null;
  guardFailureReason: FocusWorldGuardFailureReason | null;
  guardDiagnostics: FocusWorldGuardDiagnostics | null;
  stagePresent: boolean;
  viewportPresent: boolean;
  gridPresent: boolean;
  cardPresent: boolean;
  stageRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
  cardRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
  viewportRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
};
type FocusMeasurementSnapshot = {
  selectionKey: string;
  fallback: boolean;
  reason: FocusMeasurementFailureReason | null;
  guardFailureReason: FocusWorldGuardFailureReason | null;
  guardDiagnostics: FocusWorldGuardDiagnostics | null;
  stagePresent: boolean;
  viewportPresent: boolean;
  gridPresent: boolean;
  cardPresent: boolean;
  stageRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
  cardRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
  viewportRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
  transform: FocusWorldTransform | null;
};
type PreviewDebugEntry = {
  stage: string;
  selectionKey?: string;
  requestedMode?: ExplorerView;
  finalMode?: FocusPresentationState['mode'];
  reason?: string;
};
type CinematicRevealState = {
  worldVisible: boolean;
  headerVisible: boolean;
  chipVisible: boolean;
  shellVisible: boolean;
  navVisible: boolean;
  mediaVisible: boolean;
  topVisible: boolean;
  bottomVisible: boolean;
  actionsVisible: boolean;
  barsVisible: boolean;
  closeVisible: boolean;
  topbarHidden: boolean;
  worldPulseTick: number;
};
type ProxyTravelState = 'idle' | 'open-travel' | 'refocus-travel';
type GridCinematicMode = 'grid-rest' | 'grid-opening' | 'grid-focused' | 'grid-refocusing' | 'grid-closing';

const DEFAULT_VIEW: ExplorerView = 'grid';

const formatListValue = (value: string | string[] | null | undefined) => {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry.trim().length > 0).join(', ');
  }
  return value ?? '';
};

type IntentController = {
  setOpen: (next: boolean) => void;
  scheduleOpen: (delayOverride?: number) => void;
  scheduleClose: (delayOverride?: number) => void;
  setPinned: (next: boolean) => void;
  isPinned: () => boolean;
};

const createIntentController = ({
  onOpen,
  onClose,
  openDelay = 0,
  closeDelay = 240,
}: {
  onOpen?: () => void;
  onClose?: () => void;
  openDelay?: number;
  closeDelay?: number;
}): IntentController => {
  let openTimer: number | null = null;
  let closeTimer: number | null = null;
  let isOpen = false;
  let pinned = false;

  const clearTimers = () => {
    if (openTimer) window.clearTimeout(openTimer);
    if (closeTimer) window.clearTimeout(closeTimer);
    openTimer = null;
    closeTimer = null;
  };

  const setOpen = (next: boolean) => {
    if (isOpen === next) return;
    isOpen = next;
    if (isOpen) onOpen?.();
    else onClose?.();
  };

  const scheduleOpen = (delayOverride?: number) => {
    if (pinned) return;
    clearTimers();
    const delay = delayOverride ?? openDelay;
    openTimer = window.setTimeout(() => {
      setOpen(true);
    }, delay);
  };

  const scheduleClose = (delayOverride?: number) => {
    if (pinned) return;
    clearTimers();
    const delay = delayOverride ?? closeDelay;
    closeTimer = window.setTimeout(() => {
      if (!pinned) setOpen(false);
    }, delay);
  };

  const setPinned = (next: boolean) => {
    pinned = next;
    if (pinned) {
      clearTimers();
      setOpen(true);
    }
  };

  return {
    setOpen,
    scheduleOpen,
    scheduleClose,
    setPinned,
    isPinned: () => pinned,
  };
};

const inferOrientation = (width?: number | null, height?: number | null) => {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return null;
  const ratio = w / h;
  if (ratio > 1.15) return 'landscape';
  if (ratio < 0.87) return 'portrait';
  return 'square';
};

const inferOrientationFromItem = (item: MediaItem) => (
  inferOrientation((item as MediaItem & { width?: number }).width, (item as MediaItem & { height?: number }).height)
);

const buildThumbFallback = (label: string) => {
  const safeLabel = label.replace(/[^a-z0-9 ]/gi, '').slice(0, 12) || 'MEDIA';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#2a2d3a"/>
          <stop offset="100%" stop-color="#1d2030"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="28" fill="url(#bg)"/>
      <rect x="24" y="24" width="592" height="312" rx="22" fill="rgba(255,255,255,0.06)"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#b7bcc8"
        font-family="Inter, system-ui, sans-serif" font-size="48" font-weight="600" letter-spacing="2">
        ${safeLabel.toUpperCase()}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const CONTENT_LOADING_DELAY_MS = 180;
const RETAINED_UI_PREFS_KEY = 'media-sync-explorer-ui-prefs-v1';
const LEGACY_FILTER_PREFS_KEY = 'media-sync-explorer-filters-v1';
const LEGACY_OVERLAY_VIS_PREFS_KEY = 'media-sync-explorer-overlay-enabled-v1';
const ORIENT_CACHE_KEY = 'media-sync-orient-cache-v1';
const HIDDEN_INGEST_CLAIMS_KEY = 'explorer_hidden_ingest_claim_ids';
const clampLayoutColumns = (value: number) => (
  Math.max(MIN_COLUMNS_MOBILE, Math.min(MAX_COLUMNS_MOBILE, Math.round(value)))
);
const VALID_SORT_KEYS = new Set<SortKey>(['newest', 'oldest', 'name-asc', 'name-desc', 'size-desc', 'size-asc']);
const VALID_TYPE_FILTERS = new Set<MediaTypeFilter>(['all', 'video', 'image', 'audio', 'overlay', 'unknown']);
const parseStoredJsonObject = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const buildComposeTimestampName = () => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `compose-${stamp}.mp4`;
};

const defaultComposeProject = (projects: Project[]): Project | null => {
  const preferred = projects.find((entry) => entry?.name === 'P5-SHARED-Exported-Media')
    || projects.find((entry) => entry?.name === 'P5-Exported-Media');
  if (preferred) return preferred;
  return projects[0] || null;
};

const isReadinessFocusReason = (reason: StartFocusFailureReason) => (
  reason === 'missing-stage'
  || reason === 'missing-viewport'
  || reason === 'missing-grid'
  || reason === 'missing-card'
);

const createGridCinematicTimeline = ({
  setState,
  timerRegistryRef,
}: {
  setState: React.Dispatch<React.SetStateAction<CinematicRevealState>>;
  timerRegistryRef: React.MutableRefObject<number[]>;
}) => {
  const clear = () => {
    timerRegistryRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timerRegistryRef.current = [];
  };
  const reset = () => {
    clear();
    setState((prev) => ({
      worldVisible: false,
      headerVisible: false,
      barsVisible: false,
      chipVisible: false,
      shellVisible: false,
      topVisible: false,
      navVisible: false,
      mediaVisible: false,
      bottomVisible: false,
      actionsVisible: false,
      closeVisible: false,
      topbarHidden: false,
      worldPulseTick: prev.worldPulseTick,
    }));
  };
  const schedule = (delay: number, apply: (prev: CinematicRevealState) => CinematicRevealState) => {
    const timerId = window.setTimeout(() => setState(apply), delay);
    timerRegistryRef.current.push(timerId);
  };
  const playOpen = () => {
    reset();
    schedule(0, (prev) => ({ ...prev, worldVisible: true, topbarHidden: true }));
    schedule(22, (prev) => ({ ...prev, headerVisible: true, barsVisible: true }));
    schedule(48, (prev) => ({ ...prev, chipVisible: true }));
    schedule(74, (prev) => ({ ...prev, shellVisible: true }));
    schedule(96, (prev) => ({ ...prev, topVisible: true }));
    schedule(126, (prev) => ({ ...prev, navVisible: true }));
    schedule(162, (prev) => ({ ...prev, mediaVisible: true, bottomVisible: true }));
    schedule(208, (prev) => ({ ...prev, actionsVisible: true }));
    schedule(248, (prev) => ({ ...prev, closeVisible: true }));
  };
  const playRefocus = () => {
    setState((prev) => ({
      ...prev,
      worldVisible: true,
      headerVisible: true,
      barsVisible: true,
      chipVisible: true,
      shellVisible: true,
      topVisible: true,
      navVisible: true,
      mediaVisible: true,
      bottomVisible: true,
      actionsVisible: true,
      closeVisible: true,
      topbarHidden: true,
      worldPulseTick: prev.worldPulseTick + 1,
    }));
  };
  const playClose = () => {
    clear();
    setState((prev) => ({ ...prev, closeVisible: false, actionsVisible: false, navVisible: false, topbarHidden: false }));
    schedule(88, (prev) => ({ ...prev, topVisible: false, bottomVisible: false, mediaVisible: false, barsVisible: false }));
    schedule(170, (prev) => ({ ...prev, chipVisible: false, shellVisible: false, worldVisible: false, headerVisible: false }));
  };
  return { clear, reset, playOpen, playRefocus, playClose };
};

const toRectSnapshot = (rect: DOMRect): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

const readOrientationCache = (): Map<string, string> => {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = window.localStorage.getItem(ORIENT_CACHE_KEY);
    if (!raw) return new Map();
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return new Map();
    return new Map(entries.filter(([key, value]) => Boolean(key && value)));
  } catch {
    return new Map();
  }
};

const writeOrientationCache = (cache: Map<string, string>) => {
  if (typeof window === 'undefined') return;
  try {
    const entries = Array.from(cache.entries()).slice(-1000);
    window.localStorage.setItem(ORIENT_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage errors
  }
};

const TYPE_LABELS: Record<MediaTypeFilter, string> = {
  all: 'All types',
  video: 'Video',
  image: 'Image',
  audio: 'Audio',
  overlay: 'Overlay',
  unknown: 'Unknown',
};
const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  'name-asc': 'Name A→Z',
  'name-desc': 'Name Z→A',
  'size-desc': 'Size big→small',
  'size-asc': 'Size small→big',
};

/**
 * Boot path must be session-singleton.
 * Density/view/layout interactions must never replay startup loading effects.
 */
let hasBootstrappedExplorerSession = false;
let GLOBAL_PROXY_RAF_ID: number | null = null;
let GLOBAL_PROXY_RAF_ACTIVE = false;
type ExplorerRafLaneName =
  | 'raf-lane-proxy-active-card'
  | 'raf-lane-focus-world'
  | 'raf-lane-cinematic-reveal'
  | 'raf-lane-measurement'
  | 'raf-lane-other';
type ExplorerRafLaneDebug = {
  active: boolean;
  inFlight: number;
  scheduled: number;
  completed: number;
  canceled: number;
};
const EXPLORER_RAF_LANES: ExplorerRafLaneName[] = [
  'raf-lane-proxy-active-card',
  'raf-lane-focus-world',
  'raf-lane-cinematic-reveal',
  'raf-lane-measurement',
  'raf-lane-other',
];
const GLOBAL_EXPLORER_RAF_DEBUG: Record<ExplorerRafLaneName, ExplorerRafLaneDebug> = {
  'raf-lane-proxy-active-card': { active: false, inFlight: 0, scheduled: 0, completed: 0, canceled: 0 },
  'raf-lane-focus-world': { active: false, inFlight: 0, scheduled: 0, completed: 0, canceled: 0 },
  'raf-lane-cinematic-reveal': { active: false, inFlight: 0, scheduled: 0, completed: 0, canceled: 0 },
  'raf-lane-measurement': { active: false, inFlight: 0, scheduled: 0, completed: 0, canceled: 0 },
  'raf-lane-other': { active: false, inFlight: 0, scheduled: 0, completed: 0, canceled: 0 },
};
const GLOBAL_EXPLORER_RAF_REQUESTS = new Map<number, ExplorerRafLaneName>();

const publishExplorerRafDebug = () => {
  const lanes = EXPLORER_RAF_LANES.reduce<Record<ExplorerRafLaneName, ExplorerRafLaneDebug>>((acc, lane) => {
    const state = GLOBAL_EXPLORER_RAF_DEBUG[lane];
    acc[lane] = { ...state };
    return acc;
  }, {} as Record<ExplorerRafLaneName, ExplorerRafLaneDebug>);
  (globalThis as typeof globalThis & {
    __explorerRafDebug?: {
      active: boolean;
      rafId: number | null;
      lanes: Record<ExplorerRafLaneName, ExplorerRafLaneDebug>;
    };
  }).__explorerRafDebug = {
    active: GLOBAL_PROXY_RAF_ACTIVE,
    rafId: GLOBAL_PROXY_RAF_ID,
    lanes,
  };
};

const setExplorerRafLaneActive = (lane: ExplorerRafLaneName, active: boolean) => {
  GLOBAL_EXPLORER_RAF_DEBUG[lane].active = active;
  publishExplorerRafDebug();
};

const scheduleExplorerRaf = (lane: ExplorerRafLaneName, callback: FrameRequestCallback) => {
  const laneDebug = GLOBAL_EXPLORER_RAF_DEBUG[lane];
  laneDebug.scheduled += 1;
  laneDebug.inFlight += 1;
  const rafId = window.requestAnimationFrame((timestamp) => {
    const mappedLane = GLOBAL_EXPLORER_RAF_REQUESTS.get(rafId);
    if (!mappedLane) return;
    GLOBAL_EXPLORER_RAF_REQUESTS.delete(rafId);
    const mappedDebug = GLOBAL_EXPLORER_RAF_DEBUG[mappedLane];
    mappedDebug.inFlight = Math.max(0, mappedDebug.inFlight - 1);
    mappedDebug.completed += 1;
    publishExplorerRafDebug();
    callback(timestamp);
  });
  GLOBAL_EXPLORER_RAF_REQUESTS.set(rafId, lane);
  publishExplorerRafDebug();
  return rafId;
};

const cancelExplorerRaf = (rafId: number | null) => {
  if (rafId == null) return;
  const lane = GLOBAL_EXPLORER_RAF_REQUESTS.get(rafId);
  if (lane) {
    const laneDebug = GLOBAL_EXPLORER_RAF_DEBUG[lane];
    laneDebug.inFlight = Math.max(0, laneDebug.inFlight - 1);
    laneDebug.canceled += 1;
    GLOBAL_EXPLORER_RAF_REQUESTS.delete(rafId);
    publishExplorerRafDebug();
  }
  window.cancelAnimationFrame(rafId);
};

function useToastQueue() {
  const [toasts, setToasts] = useState<Array<ToastMessage & { exiting: boolean }>>([]);
  const timeouts = useRef<number[]>([]);
  const lastOperationToastRef = useRef<Map<string, number>>(new Map());

  const beginToastExit = useCallback((id: string) => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)));
  }, []);

  const addToast = useCallback((
    type: ToastMessage['type'],
    title: string,
    message: string,
    operationId?: string,
  ) => {
    if (operationId) {
      const now = Date.now();
      const lastShownAt = lastOperationToastRef.current.get(operationId) ?? 0;
      if (now - lastShownAt < 500) {
        return `${operationId}-deduped`;
      }
      lastOperationToastRef.current.set(operationId, now);
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, title, message, exiting: false }]);
    const timeout = window.setTimeout(() => {
      beginToastExit(id);
    }, 3100);
    timeouts.current.push(timeout);
    return id;
  }, [beginToastExit]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  return { toasts, addToast, removeToast, beginToastExit };
}

export function ExplorerApp({ apiBaseUrl = '' }: ExplorerAppProps) {
  // ---------------------------------------------------------------------------
  // Query/data authority: API client + aggregate snapshot ownership.
  // ---------------------------------------------------------------------------
  const initialApiBase = typeof window === 'undefined'
    ? apiBaseUrl
    : inferApiBaseUrl(apiBaseUrl, window.location);
  const [resolvedApiBase, setResolvedApiBase] = useState(initialApiBase);
  const api = useMemo(() => createApiClient(resolvedApiBase), [resolvedApiBase]);
  const {
    sessions: liveSessions,
  } = useLiveSessions({
    listLiveSessions: api.listLiveSessions,
  });
  const {
    snapshot: sourceControlSnapshot,
    sources: runtimeSources,
    nodes: runtimeNodes,
    canonicalSources,
    remoteSources,
    healthyNodes,
    loading: sourceControlLoading,
    error: sourceControlError,
    reload: reloadSourceControl,
  } = useSourceControlData({
    listSources: api.listSources,
    listNodes: api.listNodes,
  });
  const {
    sources,
    projects,
    assets: libraryAssets,
    error: libraryError,
    refreshLibrarySnapshot,
    clearSnapshotError,
  } = useLibrarySnapshot(api);
  const { toasts, addToast, removeToast, beginToastExit } = useToastQueue();


  // ---------------------------------------------------------------------------
  // Local composition shell state that intentionally remains root-owned.
  // (selection identity, focused media identity, focus/cinematic ownership lanes)
  // ---------------------------------------------------------------------------
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaScope, setMediaScope] = useState<'project' | 'all'>('project');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [activeAssetKey, setActiveAssetKey] = useState('');
  const [previewActivationKey, setPreviewActivationKey] = useState('');
  const [previewPlaybackToken, setPreviewPlaybackToken] = useState(0);
  const [focused, setFocused] = useState<MediaItem | null>(null);
  const [dynamicOrientations, setDynamicOrientations] = useState<Record<string, string>>({});
  const [gridSurfaceEl, setGridSurfaceEl] = useState<HTMLDivElement | null>(null);
  const contentLoadingTokenRef = useRef(0);
  const contentLoadingTimerRef = useRef<number | null>(null);
  const [previewAutoPlayToken, setPreviewAutoPlayToken] = useState(0);
  const [activeProxyCardEl, setActiveProxyCardEl] = useState<HTMLElement | null>(null);
  const [activeProxyUiSlotEl, setActiveProxyUiSlotEl] = useState<HTMLElement | null>(null);
  const [proxyPlaybackPlaying, setProxyPlaybackPlaying] = useState(false);
  const [proxyPlaybackCurrentTime, setProxyPlaybackCurrentTime] = useState(0);
  const [proxyPlaybackDuration, setProxyPlaybackDuration] = useState(0);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [isRegisterNodeModalOpen, setIsRegisterNodeModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<{
    title: string;
    subtitle?: string;
    payload: unknown;
  } | null>(null);
  const [ingestClaims, setIngestClaims] = useState<IngestClaimRecord[]>([]);
  const [hiddenIngestClaimIds, setHiddenIngestClaimIds] = useState<Set<string>>(new Set());
  const liveClaimRefreshRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // UI/runtime authority seam.
  // ---------------------------------------------------------------------------
  const {
    view,
    setView,
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    sortKey,
    setSortKey,
    selectedOnly,
    setSelectedOnly,
    untaggedOnly,
    setUntaggedOnly,
    gridColumnCount,
    setGridColumnCount,
    overlayEnabled,
    setOverlayEnabled,
    topbarHasOpenDropdown,
    setTopbarHasOpenDropdown,
    topbarFocusWithin,
    setTopbarFocusWithin,
    sidebarOpen,
    setSidebarOpen,
    actionsOpen,
    setActionsOpen,
    dragActive,
    setDragActive,
    isMobile,
    setIsMobile,
    touchPinchCapable,
    setTouchPinchCapable,
    uploadStatus,
    setUploadStatus,
    contentLoading,
    setContentLoading,
    pendingDataLoadOverlay,
    setPendingDataLoadOverlay,
    resolveProjectMode,
    setResolveProjectMode,
    resolveProjectName,
    setResolveProjectName,
    resolveNewName,
    setResolveNewName,
    resolveMode,
    setResolveMode,
    previewObsMode,
    setPreviewObsMode,
    previewObsSlot,
    setPreviewObsSlot,
    previewObsExclusive,
    setPreviewObsExclusive,
    inspectorOpen,
    setInspectorOpen,
    previewDetailsOpen,
    setPreviewDetailsOpen,
    contextMenu,
    setContextMenu,
    composeModalOpen,
    setComposeModalOpen,
    composeModalRendered,
    setComposeModalRendered,
    composeSubmitting,
    setComposeSubmitting,
    composeOutputName,
    setComposeOutputName,
    composeOutputProject,
    setComposeOutputProject,
    deleteModalOpen,
    setDeleteModalOpen,
    deleteModalRendered,
    setDeleteModalRendered,
    pendingDeleteSelectionKeys,
    setPendingDeleteSelectionKeys,
  } = useExplorerUiState({
    defaultView: DEFAULT_VIEW,
    defaultGridColumns: DEFAULT_COLUMNS_MOBILE,
  });


  const reloadIngestClaims = useCallback(async () => {
    try {
      const claims = await api.listIngestClaims();
      setIngestClaims(Array.isArray(claims) ? claims : []);
    } catch {
      // Keep sidebar non-fatal.
    }
  }, [api]);

  useEffect(() => {
    void reloadIngestClaims();
    const interval = window.setInterval(() => void reloadIngestClaims(), 5000);
    return () => window.clearInterval(interval);
  }, [reloadIngestClaims]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(HIDDEN_INGEST_CLAIMS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
      if (!normalized.length) return;
      setHiddenIngestClaimIds(new Set(normalized));
    } catch {
      // ignore parse failures and continue with empty hidden set.
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Runtime refs + controllers.
  // ---------------------------------------------------------------------------
  const composeNameInputRef = useRef<HTMLInputElement | null>(null);
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingStatusSnapshotRef = useRef<Map<string, PendingComposeItem['status']>>(new Map());

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaContentRef = useRef<HTMLDivElement | null>(null);
  const mediaScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const [mediaScrollViewportEl, setMediaScrollViewportEl] = useState<HTMLDivElement | null>(null);
  const sortSelectRef = useRef<HTMLSelectElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const topbarPinTimeoutRef = useRef<number | null>(null);
  const orientationCacheRef = useRef<Map<string, string>>(new Map());
  const [retainedPrefsHydrated, setRetainedPrefsHydrated] = useState(false);
  const lastCommittedColumnsRef = useRef(DEFAULT_COLUMNS_MOBILE);
  const selectedOrderRef = useRef<string[]>([]);
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const topbarIntentRef = useRef<IntentController | null>(null);
  const [topbarMeasuredHeight, setTopbarMeasuredHeight] = useState(0);
  const topbarInsetPrevRef = useRef(0);
  const topbarHiddenRef = useRef(false);
  const topbarMotionRef = useRef<ReturnType<typeof createTopbarMotion> | null>(null);
  const snapBandRef = useRef<ReturnType<typeof createTopbarSnapBand> | null>(null);
  const drawerMotionRef = useRef<ReturnType<typeof createDrawerMotion> | null>(null);
  const toastMotionRef = useRef<ReturnType<typeof createToastMotion> | null>(null);
  const composeModalMotionRef = useRef<ReturnType<typeof createModalMotion> | null>(null);
  const confirmModalMotionRef = useRef<ReturnType<typeof createModalMotion> | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const densitySliderRef = useRef<HTMLInputElement | null>(null);
  const densityControllerRef = useRef<ReturnType<typeof createExplorerDensityController> | null>(null);
  const pinchDensityRef = useRef<ReturnType<typeof createPinchDensityController> | null>(null);
  const pinchPulseTriggerRef = useRef<((dir: number) => void) | null>(null);
  const [pinchOverlayActive, setPinchOverlayActive] = useState(false);
  const [pinchFingerA, setPinchFingerA] = useState<PinchOverlayPoint>(null);
  const [pinchFingerB, setPinchFingerB] = useState<PinchOverlayPoint>(null);
  const [pinchDisplayNodeCount, setPinchDisplayNodeCount] = useState(DEFAULT_COLUMNS_MOBILE);
  const pinchOverlayGestureActiveRef = useRef(false);
  const pinchOverlayPendingNodeCountRef = useRef<number | null>(null);
  const [pinchPerfActive, setPinchPerfActive] = useState(false);
  const pinchPerfTimeoutRef = useRef<number | null>(null);
  const [tapOverlayPoint, setTapOverlayPoint] = useState<PinchOverlayPoint>(null);
  const [tapOverlayTrigger, setTapOverlayTrigger] = useState(0);
  const [holdOverlayPoint, setHoldOverlayPoint] = useState<PinchOverlayPoint>(null);
  const [holdOverlayActive, setHoldOverlayActive] = useState(false);
  const [holdOverlayProgress, setHoldOverlayProgress] = useState(0);
  const [holdOverlayCompleteBeat, setHoldOverlayCompleteBeat] = useState(0);
  const [holdEmphasisKey, setHoldEmphasisKey] = useState('');
  const [reinforcedActiveKey, setReinforcedActiveKey] = useState('');

  // ---------------------------------------------------------------------------
  // Deferred preview/focus coupled domain (intentionally root-owned for now).
  // This cluster combines focus presentation state, cinematic travel ownership,
  // proxy/handoff refs, and lifecycle timing channels. Keep co-located until a
  // dedicated domain extraction plan is approved.
  // ---------------------------------------------------------------------------
  const [focusPresentationState, setFocusPresentationState] = useState<FocusPresentationState>({ mode: 'idle' });
  const [focusWorldTransform, setFocusWorldTransform] = useState<FocusWorldTransform>({ scale: 1, x: 0, y: 0, originX: 50, originY: 50 });
  const [proxyTravelState, setProxyTravelState] = useState<ProxyTravelState>('idle');
  const [gridCinematicMode, setGridCinematicMode] = useState<GridCinematicMode>('grid-rest');
  const [cinematicRevealState, setCinematicRevealState] = useState<CinematicRevealState>({
    worldVisible: false,
    headerVisible: false,
    chipVisible: false,
    shellVisible: false,
    navVisible: false,
    mediaVisible: false,
    topVisible: false,
    bottomVisible: false,
    actionsVisible: false,
    barsVisible: false,
    closeVisible: false,
    topbarHidden: false,
    worldPulseTick: 0,
  });
  const focusWorldStageRef = useRef<HTMLDivElement | null>(null);
  const focusPresentationStateRef = useRef<FocusPresentationState>({ mode: 'idle' });
  const inspectorBackdropRef = useRef<HTMLDivElement | null>(null);
  const focusOverlayRevealTimerRef = useRef<number | null>(null);
  const cinematicRevealTimersRef = useRef<number[]>([]);
  const composeModalRef = useRef<HTMLDivElement | null>(null);
  const composeCardRef = useRef<HTMLFormElement | null>(null);
  const confirmModalRef = useRef<HTMLDivElement | null>(null);
  const confirmCardRef = useRef<HTMLDivElement | null>(null);
  const toastNodeMapRef = useRef(new Map<string, HTMLDivElement>());
  const toastExitingRef = useRef(new Set<string>());
  const inspectorOpenRef = useRef(false);
  const gridCinematicModeRef = useRef<GridCinematicMode>('grid-rest');
  const proxyTravelStateRef = useRef<ProxyTravelState>('idle');
  const focusStartRetryFrameRef = useRef<number | null>(null);
  const pendingGridColumnCommitRef = useRef<number | null>(null);
  const gridColumnCommitScheduledRef = useRef(false);
  const previewDebugLogRef = useRef<PreviewDebugEntry[]>([]);
  const focusProxyRootRef = useRef<HTMLDivElement | null>(null);
  const focusOrchestratorRef = useRef<FocusTransitionOrchestrator | null>(null);
  const previewPlaybackHandoffRef = useRef<{
    selectionKey: string;
    currentTime: number;
    wasPlaying: boolean;
    muted: boolean;
    src: string;
  } | null>(null);
  const proxyPrewarmVideoRef = useRef<HTMLVideoElement | null>(null);
  const proxyPrewarmSelectionKeyRef = useRef('');
  const proxyPrewarmUrlRef = useRef('');
  const proxyPrewarmReadyStateRef = useRef(0);
  const previewAuthoritySelectionRef = useRef('');
  const focusedDoubleTapStateRef = useRef({ lastTapAt: 0 });
  const focusWorldIdleMarkerRef = useRef(false);
  const focusWorldMotionFrameRef = useRef<number | null>(null);
  const closeMeasurementFrameRef = useRef<number | null>(null);
  const focusedRetargetRetryFrameRef = useRef<number | null>(null);
  const closeSettleTimeoutRef = useRef<number | null>(null);

  const setMediaScrollViewportNode = useCallback((node: HTMLDivElement | null) => {
    mediaScrollViewportRef.current = node;
    setMediaScrollViewportEl(node);
  }, []);

  // Coupled-domain diagnostics + ownership effects (kept adjacent by design).
  const recordPreviewDebug = useCallback((entry: PreviewDebugEntry) => {
    const debugEntry = { ...entry };
    previewDebugLogRef.current = [...previewDebugLogRef.current.slice(-31), debugEntry];
    (globalThis as typeof globalThis & {
      __explorerPreviewDebug?: {
        last: PreviewDebugEntry;
        events: PreviewDebugEntry[];
      };
    }).__explorerPreviewDebug = {
      last: debugEntry,
      events: previewDebugLogRef.current,
    };
  }, []);

  useEffect(() => {
    const getSnapshot = () => {
      const allCandidates = Array.from(document.querySelectorAll<HTMLElement>(
        '.focus-proxy-root,.proxy-render-card,.focus-world-stage,.grid-cinematic-root,.drawer',
      ));
      const withStyle = allCandidates.map((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          node: el.className,
          opacity: style.opacity,
          display: style.display,
          visibility: style.visibility,
          pointerEvents: style.pointerEvents,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          proxyActive: el.dataset.proxyActive || null,
          focusWorld: el.dataset.focusWorld || null,
          cinematicRoot: el.dataset.gridCinematicRoot || null,
        };
      });
      return {
        focusPresentationMode: focusPresentationStateRef.current.mode,
        gridCinematicMode,
        proxyTravelState,
        inspectorOpen: inspectorOpenRef.current,
        activeAssetKey,
        previewActivationKey,
        reinforcedActiveKey,
        holdEmphasisKey,
        proxyLayerMounted: Boolean(document.querySelector('.focus-proxy-root [data-focus-proxy-layer="true"]')),
        proxyLayerActive: Boolean(document.querySelector('.focus-proxy-root.is-active')),
        retainedProxyInert: Boolean(document.querySelector('.focus-proxy-root')?.dataset.proxyRetainedInert === 'true'),
        gridShouldOwnHits: gridCinematicMode === 'grid-rest' && proxyTravelState === 'idle' && !inspectorOpenRef.current,
        proxyRootActive: Boolean(document.querySelector('.focus-proxy-root.is-active')),
        scrollLockActive: Boolean(document.querySelector('.scroll')?.classList.contains('focus-proxy-scroll-lock')),
        candidates: withStyle,
      };
    };
    (globalThis as typeof globalThis & {
      __explorerFocusLayerDebug?: {
        getSnapshot: () => ReturnType<typeof getSnapshot>;
      };
    }).__explorerFocusLayerDebug = { getSnapshot };
    return () => {
      delete (globalThis as typeof globalThis & {
        __explorerFocusLayerDebug?: {
          getSnapshot: () => ReturnType<typeof getSnapshot>;
        };
      }).__explorerFocusLayerDebug;
    };
  }, [activeAssetKey, gridCinematicMode, holdEmphasisKey, previewActivationKey, proxyTravelState, reinforcedActiveKey]);

  useEffect(() => {
    gridCinematicModeRef.current = gridCinematicMode;
  }, [gridCinematicMode]);

  useEffect(() => {
    proxyTravelStateRef.current = proxyTravelState;
  }, [proxyTravelState]);

  useEffect(() => {
    if (inspectorOpen) return;
    previewAuthoritySelectionRef.current = '';
  }, [inspectorOpen]);

  useEffect(() => {
    if (view !== 'grid') return;
    if (!inspectorOpen) return;
    if (!activeAssetKey) return;
    const previousSelection = previewAuthoritySelectionRef.current;
    if (previousSelection && previousSelection !== activeAssetKey) {
      recordPreviewDebug({
        stage: 'preview-selection-interrupt-previous',
        selectionKey: previousSelection,
        requestedMode: view,
        reason: `superseded-by:${activeAssetKey}`,
      });
      previewPlaybackHandoffRef.current = null;
      proxyPrewarmSelectionKeyRef.current = '';
      proxyPrewarmUrlRef.current = '';
      proxyPrewarmReadyStateRef.current = 0;
    }
    if (previousSelection !== activeAssetKey) {
      previewAuthoritySelectionRef.current = activeAssetKey;
      setPreviewAutoPlayToken((prev) => prev + 1);
      recordPreviewDebug({ stage: 'preview-selection-new-authority', selectionKey: activeAssetKey, requestedMode: view });
      recordPreviewDebug({ stage: 'preview-selection-play-rearm', selectionKey: activeAssetKey, requestedMode: view });
    }
  }, [activeAssetKey, inspectorOpen, recordPreviewDebug, view]);

  const scheduleGridColumnCommit = useCallback((nextColumns: number) => {
    pendingGridColumnCommitRef.current = nextColumns;
    if (gridColumnCommitScheduledRef.current) return;
    gridColumnCommitScheduledRef.current = true;
    queueMicrotask(() => {
      gridColumnCommitScheduledRef.current = false;
      const pendingColumns = pendingGridColumnCommitRef.current;
      pendingGridColumnCommitRef.current = null;
      if (typeof pendingColumns !== 'number' || !Number.isFinite(pendingColumns)) return;
      setGridColumnCount((prev) => (prev === pendingColumns ? prev : pendingColumns));
      const existing = (globalThis as typeof globalThis & {
        __explorerFlushSyncDebug?: { strategy: string; commitCount: number; lastColumns: number };
      }).__explorerFlushSyncDebug;
      (globalThis as typeof globalThis & {
        __explorerFlushSyncDebug?: { strategy: string; commitCount: number; lastColumns: number };
      }).__explorerFlushSyncDebug = {
        strategy: 'microtask-grid-column-commit',
        commitCount: (existing?.commitCount ?? 0) + 1,
        lastColumns: pendingColumns,
      };
    });
  }, []);

  const gridCinematicTimelineRef = useRef<ReturnType<typeof createGridCinematicTimeline> | null>(null);
  if (!gridCinematicTimelineRef.current) {
    gridCinematicTimelineRef.current = createGridCinematicTimeline({
      setState: setCinematicRevealState,
      timerRegistryRef: cinematicRevealTimersRef,
    });
  }
  const clearCinematicRevealTimers = useCallback(() => {
    gridCinematicTimelineRef.current?.clear();
  }, []);
  const resetCinematicRevealState = useCallback(() => {
    gridCinematicTimelineRef.current?.reset();
  }, []);
  const stageCinematicReveal = useCallback((mode: 'open' | 'refocus' = 'open') => {
    if (mode === 'refocus') {
      gridCinematicTimelineRef.current?.playRefocus();
      return;
    }
    gridCinematicTimelineRef.current?.playOpen();
  }, []);

  const clearFocusOverlayRevealTimer = useCallback(() => {
    if (!focusOverlayRevealTimerRef.current) return;
    window.clearTimeout(focusOverlayRevealTimerRef.current);
    focusOverlayRevealTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!focusProxyRootRef.current) return;
    focusOrchestratorRef.current = new FocusTransitionOrchestrator(focusProxyRootRef.current);
    return () => {
      focusOrchestratorRef.current = null;
    };
  }, []);

  const clearFocusStartRetryFrame = useCallback(() => {
    if (!focusStartRetryFrameRef.current) return;
    cancelExplorerRaf(focusStartRetryFrameRef.current);
    focusStartRetryFrameRef.current = null;
  }, []);

  const clearFocusWorldMotionFrame = useCallback(() => {
    if (!focusWorldMotionFrameRef.current) return;
    cancelExplorerRaf(focusWorldMotionFrameRef.current);
    focusWorldMotionFrameRef.current = null;
  }, []);

  const clearCloseMeasurementFrame = useCallback(() => {
    if (!closeMeasurementFrameRef.current) return;
    cancelExplorerRaf(closeMeasurementFrameRef.current);
    closeMeasurementFrameRef.current = null;
  }, []);

  const clearFocusedRetargetRetryFrame = useCallback(() => {
    if (!focusedRetargetRetryFrameRef.current) return;
    cancelExplorerRaf(focusedRetargetRetryFrameRef.current);
    focusedRetargetRetryFrameRef.current = null;
  }, []);

  const clearCloseSettleTimeout = useCallback(() => {
    if (!closeSettleTimeoutRef.current) return;
    window.clearTimeout(closeSettleTimeoutRef.current);
    closeSettleTimeoutRef.current = null;
  }, []);

  const removeFocusProxyScrollLock = useCallback(() => {
    const viewportEl = mediaScrollViewportRef.current;
    if (!viewportEl) return;
    if (viewportEl.classList.contains('focus-proxy-scroll-lock')) {
      viewportEl.classList.remove('focus-proxy-scroll-lock');
      recordPreviewDebug({ stage: 'focus-close-scroll-lock-removed', requestedMode: view });
    }
  }, [recordPreviewDebug, view]);

  const commitCloseStateToRest = useCallback((reason: 'complete' | 'missed') => {
    setGridCinematicMode('grid-rest');
    setProxyTravelState('idle');
    removeFocusProxyScrollLock();
    recordPreviewDebug({
      stage: reason === 'complete' ? 'focus-close-reset-rest' : 'focus-close-reset-missed',
      requestedMode: view,
      finalMode: 'idle',
      reason: reason === 'complete' ? 'close-complete' : 'close-settle-timeout',
    });
    const proxyRoot = focusProxyRootRef.current;
    clearCloseMeasurementFrame();
    closeMeasurementFrameRef.current = scheduleExplorerRaf('raf-lane-measurement', () => {
      closeMeasurementFrameRef.current = null;
      if (!inspectorOpenRef.current && focusPresentationStateRef.current.mode === 'idle') {
        recordPreviewDebug({ stage: 'focus-world-stage-idle-measure-blocked', requestedMode: view, finalMode: 'idle' });
        return;
      }
      if (!proxyRoot) return;
      const retainedInert = proxyRoot.dataset.proxyRetainedInert === 'true';
      const pointerEvents = window.getComputedStyle(proxyRoot).pointerEvents;
      const proxyCard = document.elementFromPoint(window.innerWidth * 0.5, window.innerHeight * 0.5)
        ?.closest('.proxy-render-card');
      if (retainedInert) {
        recordPreviewDebug({ stage: 'focus-close-retained-proxy-inert', requestedMode: view, finalMode: 'idle' });
      }
      if (pointerEvents !== 'none' || proxyCard) {
        recordPreviewDebug({
          stage: 'focus-close-proxy-hit-owner-still-present',
          requestedMode: view,
          finalMode: 'idle',
          reason: proxyCard ? 'proxy-card-hit-target' : `pointer-events-${pointerEvents}`,
        });
        return;
      }
      recordPreviewDebug({ stage: 'focus-close-grid-hit-owner-restored', requestedMode: view, finalMode: 'idle' });
    });
  }, [clearCloseMeasurementFrame, removeFocusProxyScrollLock, recordPreviewDebug, view]);

  const resetFocusPresentationToIdle = useCallback(() => {
    clearFocusStartRetryFrame();
    clearFocusWorldMotionFrame();
    clearCloseMeasurementFrame();
    clearFocusedRetargetRetryFrame();
    clearFocusOverlayRevealTimer();
    setFocusPresentationState({ mode: 'idle' });
    setFocusWorldTransform({ scale: 1, x: 0, y: 0, originX: 50, originY: 50 });
    resetCinematicRevealState();
  }, [
    clearCloseMeasurementFrame,
    clearFocusOverlayRevealTimer,
    clearFocusStartRetryFrame,
    clearFocusWorldMotionFrame,
    clearFocusedRetargetRetryFrame,
    resetCinematicRevealState,
  ]);

  const moveFocusPresentationToFallbackOrIdle = useCallback((candidateKey?: string | null, reason = 'unspecified') => {
    clearFocusStartRetryFrame();
    clearFocusOverlayRevealTimer();
    setFocusWorldTransform({ scale: 1, x: 0, y: 0, originX: 50, originY: 50 });
    resetCinematicRevealState();
    if (candidateKey) {
      setFocusPresentationState({ mode: 'drawer-fallback', key: candidateKey });
      recordPreviewDebug({ stage: 'fallback', selectionKey: candidateKey, finalMode: 'drawer-fallback', reason });
      return;
    }
    setFocusPresentationState({ mode: 'idle' });
    recordPreviewDebug({ stage: 'fallback', finalMode: 'idle', reason });
  }, [clearFocusOverlayRevealTimer, clearFocusStartRetryFrame, recordPreviewDebug, resetCinematicRevealState]);

  const computeFromUntransformedFocusWorldStage = useCallback((measure: () => FocusMeasurementResult): FocusMeasurementResult => {
    const stageEl = focusWorldStageRef.current;
    if (!stageEl || stageEl.dataset.focusWorld !== 'true') return measure();
    const prevTransition = stageEl.style.transition;
    const prevTransform = stageEl.style.transform;
    stageEl.style.transition = 'none';
    stageEl.style.transform = 'none';
    stageEl.style.willChange = 'auto';
    void stageEl.offsetWidth;
    try {
      return measure();
    } finally {
      stageEl.style.transition = prevTransition;
      stageEl.style.transform = prevTransform;
      stageEl.style.removeProperty('will-change');
    }
  }, []);

  const computeFocusWorldTransform = useCallback((selectionKey: string, options?: { continueFromCurrent?: boolean }) => {
    const scrollViewport = mediaScrollViewportRef.current;
    const gridEl = gridRef.current;
    const stageEl = focusWorldStageRef.current;
    const stagePresent = Boolean(stageEl);
    const viewportPresent = Boolean(scrollViewport);
    const gridPresent = Boolean(gridEl);
    if (!stagePresent || !viewportPresent || !gridPresent) {
      const reason: FocusMeasurementFailureReason = !stagePresent
        ? 'missing-stage'
        : !viewportPresent
          ? 'missing-viewport'
          : 'missing-grid';
      const snapshot: FocusMeasurementSnapshot = {
        selectionKey,
        fallback: true,
        reason,
        guardFailureReason: null,
        guardDiagnostics: null,
        stagePresent,
        viewportPresent,
        gridPresent,
        cardPresent: false,
        stageRect: null,
        cardRect: null,
        viewportRect: null,
        transform: null,
      };
      (globalThis as typeof globalThis & { __explorerFocusWorldDebug?: { lastMeasurement: FocusMeasurementSnapshot } }).__explorerFocusWorldDebug = {
        lastMeasurement: snapshot,
      };
      return {
        transform: null,
        reason,
        guardFailureReason: null,
        guardDiagnostics: null,
        stagePresent,
        viewportPresent,
        gridPresent,
        cardPresent: false,
        stageRect: null,
        cardRect: null,
        viewportRect: null,
      };
    }
    const measurement = computeFromUntransformedFocusWorldStage((): FocusMeasurementResult => {
      const card = gridEl.querySelector<HTMLElement>(`.masonry-card[data-select-key="${CSS.escape(selectionKey)}"]`);
      if (!card) {
        return {
          transform: null,
          reason: 'missing-card',
          guardFailureReason: null,
          guardDiagnostics: null,
          stagePresent,
          viewportPresent,
          gridPresent,
          cardPresent: false,
          stageRect: null,
          cardRect: null,
          viewportRect: null,
        };
      }
      const stageRect = stageEl.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const viewportRect = scrollViewport.getBoundingClientRect();
      const diagnostics = computeFocusWorldTransformWithDiagnostics({
        cardRect,
        stageRect,
        viewportRect,
        mobileLayout: window.matchMedia('(max-width: 860px)').matches,
        currentTransform: options?.continueFromCurrent ? focusWorldTransform : null,
      });
      return {
        transform: diagnostics.transform,
        reason: diagnostics.transform ? null : 'unsafe-transform',
        guardFailureReason: diagnostics.guardFailureReason,
        guardDiagnostics: diagnostics.guardDiagnostics,
        stagePresent,
        viewportPresent,
        gridPresent,
        cardPresent: true,
        stageRect: toRectSnapshot(stageRect),
        cardRect: toRectSnapshot(cardRect),
        viewportRect: toRectSnapshot(viewportRect),
      };
    });
    const snapshot: FocusMeasurementSnapshot = {
      selectionKey,
      fallback: !measurement.transform,
      reason: measurement.reason,
      guardFailureReason: measurement.guardFailureReason,
      guardDiagnostics: measurement.guardDiagnostics,
      stagePresent: measurement.stagePresent,
      viewportPresent: measurement.viewportPresent,
      gridPresent: measurement.gridPresent,
      cardPresent: measurement.cardPresent,
      stageRect: measurement.stageRect,
      cardRect: measurement.cardRect,
      viewportRect: measurement.viewportRect,
      transform: measurement.transform,
    };
    (globalThis as typeof globalThis & { __explorerFocusWorldDebug?: { lastMeasurement: FocusMeasurementSnapshot } }).__explorerFocusWorldDebug = {
      lastMeasurement: snapshot,
    };
    return measurement;
  }, [computeFromUntransformedFocusWorldStage, focusWorldTransform]);

  const startFocusMotionForSelectionKey = useCallback((selectionKey: string): StartFocusMotionResult => {
    const host = mediaContentRef.current;
    const densityMotionUnsafe = host?.classList.contains('density-motion-active')
      || host?.classList.contains('density-gesture-active');
    if (!inspectorOpenRef.current) return { ok: false, reason: 'inspector-closed' };
    if (view !== 'grid') return { ok: false, reason: 'not-grid' };
    if (densityMotionUnsafe) return { ok: false, reason: 'density-unsafe' };
    const initial = computeFocusWorldTransform(selectionKey, { continueFromCurrent: true });
    if (!initial.transform) return { ok: false, reason: initial.reason ?? 'unsafe-transform' };
    clearFocusOverlayRevealTimer();
    setFocusWorldTransform(initial.transform);
    const isRefocus = focusPresentationStateRef.current.mode === 'world-focus'
      && focusPresentationStateRef.current.key === selectionKey;
    setFocusPresentationState({ mode: 'world-focus', key: selectionKey, overlayReady: false });
    stageCinematicReveal(isRefocus ? 'refocus' : 'open');
    clearFocusWorldMotionFrame();
    focusWorldMotionFrameRef.current = scheduleExplorerRaf('raf-lane-focus-world', () => {
      focusWorldMotionFrameRef.current = null;
      if (focusPresentationStateRef.current.mode !== 'world-focus') {
        recordPreviewDebug({ stage: 'focus-world-stage-idle-raf-blocked', selectionKey, requestedMode: view, finalMode: 'idle' });
        return;
      }
      const next = computeFocusWorldTransform(selectionKey, { continueFromCurrent: true });
      if (!next.transform) return;
      setFocusWorldTransform(next.transform);
    });
    focusOverlayRevealTimerRef.current = window.setTimeout(() => {
      setFocusPresentationState((prev) => (
        prev.mode === 'world-focus' && prev.key === selectionKey
          ? { ...prev, overlayReady: true }
          : prev
      ));
      focusOverlayRevealTimerRef.current = null;
    }, FOCUS_OVERLAY_REVEAL_DELAY_MS);
    recordPreviewDebug({ stage: 'focus-start', selectionKey, finalMode: 'world-focus' });
    return { ok: true };
  }, [
    clearFocusOverlayRevealTimer,
    clearFocusWorldMotionFrame,
    computeFocusWorldTransform,
    recordPreviewDebug,
    stageCinematicReveal,
    view,
  ]);

  useEffect(() => {
    if (pinchOverlayGestureActiveRef.current) {
      pinchOverlayPendingNodeCountRef.current = gridColumnCount;
      return;
    }
    const rafId = scheduleExplorerRaf('raf-lane-cinematic-reveal', () => {
      setPinchDisplayNodeCount(gridColumnCount);
    });
    return () => cancelExplorerRaf(rafId);
  }, [gridColumnCount]);

  const resolveItemOrientation = useCallback((item: MediaItem, thumbKey = '') => {
    const itemOrient = inferOrientationFromItem(item);
    if (itemOrient) return itemOrient;
    const key = thumbKey || getThumbCacheKey(item) || item.relative_path || '';
    const dynamicOrient = dynamicOrientations[key];
    if (dynamicOrient) return dynamicOrient;
    const cachedOrient = orientationCacheRef.current.get(key);
    if (cachedOrient) return cachedOrient;
    const kind = guessKind(item);
    if (kind === 'video') return 'landscape';
    return 'square';
  }, [dynamicOrientations]);

  const assetSelectionKey = useCallback((item: MediaItem, projectOverride?: Project | null) => (
    buildMediaIdentityKey(item, projectOverride)
  ), []);
  const assetRenderKey = assetSelectionKey;

  const mediaMeta = useMemo<MediaMeta>(() => collectMediaMeta(media), [media]);
  const filteredMedia = useMemo(() => {
    const filtered = filterMedia(
      media,
      {
        query,
        type: typeFilter,
        selectedOnly: false,
        untaggedOnly,
        selected,
      },
      mediaMeta,
    );
    const selectedFiltered = selectedOnly
      ? filtered.filter((item) => selected.has(assetSelectionKey(item, activeProject)))
      : filtered;
    return sortMedia(selectedFiltered, sortKey, mediaMeta);
  }, [activeProject, assetSelectionKey, media, query, typeFilter, selectedOnly, untaggedOnly, selected, sortKey, mediaMeta]);
  const itemsBySelectionKey = useMemo(() => {
    const map = new Map<string, MediaItem>();
    media.forEach((item) => {
      if (item.relative_path) map.set(assetSelectionKey(item, activeProject), item);
    });
    return map;
  }, [activeProject, media]);
  const tags = useMemo(() => extractTags(media), [media]);
  const aiTags = useMemo(() => extractAiTags(media), [media]);
  const typeLabel = TYPE_LABELS[typeFilter] ?? TYPE_LABELS.all;
  const sortLabel = SORT_LABELS[sortKey] ?? SORT_LABELS.newest;

  const activePath = activeProject?.name || (mediaScope === 'all' ? 'all projects' : 'no project');
  const contentTitle = activeProject
    ? `Media — ${activeProject.name}`
    : (mediaScope === 'all' ? 'Media — All Projects' : 'Media');

  const resolveHint = selected.size
    ? `${selected.size} item(s) queued.`
    : 'Select clips to enable.';

  const clearSelectionState = useCallback(() => {
    setSelected(new Set());
    setSelectedOrder([]);
  }, []);

  const clearActiveAsset = useCallback(() => {
    focusOrchestratorRef.current?.clearRetainedProxyOnDeselect();
    setActiveAssetKey('');
    setPreviewActivationKey('');
    setPreviewPlaybackToken((prev) => prev + 1);
    setReinforcedActiveKey('');
    setHoldEmphasisKey('');
    previewPlaybackHandoffRef.current = null;
    setFocused(null);
    setPreviewDetailsOpen(false);
  }, []);

  const inNoPreviewZone = useCallback((target: EventTarget | null) => {
    const node = target instanceof HTMLElement ? target : null;
    return Boolean(node?.closest?.('[data-no-preview], .sel-ui')) || isInteractiveTarget(target);
  }, []);

  useEffect(() => {
    orientationCacheRef.current = readOrientationCache();
  }, []);

  useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  const getCachedOrientation = useCallback((key: string) => {
    return orientationCacheRef.current.get(key) ?? null;
  }, []);

  const cacheOrientation = useCallback((key: string, orient: string) => {
    if (!key || !orient) return;
    if (orientationCacheRef.current.get(key) === orient) return;
    orientationCacheRef.current.set(key, orient);
    writeOrientationCache(orientationCacheRef.current);
  }, []);

  const updateCardOrientation = useCallback((
    mediaEl: HTMLImageElement | HTMLVideoElement,
  ) => {
    const card = mediaEl.closest('.asset') as HTMLElement | null;
    if (!card || card.dataset.orientLocked === 'true') return;
    const width = mediaEl instanceof HTMLImageElement ? mediaEl.naturalWidth : mediaEl.videoWidth;
    const height = mediaEl instanceof HTMLImageElement ? mediaEl.naturalHeight : mediaEl.videoHeight;
    const orient = inferOrientation(width, height);
    if (!orient) return;
    card.dataset.orient = orient;
    const cacheKey = card.dataset.thumbKey || card.dataset.relative || '';
    cacheOrientation(cacheKey, orient);
    if (cacheKey) {
      setDynamicOrientations((current) => {
        if (current[cacheKey] === orient) return current;
        return { ...current, [cacheKey]: orient };
      });
    }
  }, [cacheOrientation]);

  const beginContentLoading = useCallback(() => {
    contentLoadingTokenRef.current += 1;
    const token = contentLoadingTokenRef.current;
    if (contentLoadingTimerRef.current) {
      window.clearTimeout(contentLoadingTimerRef.current);
    }
    contentLoadingTimerRef.current = window.setTimeout(() => {
      if (token !== contentLoadingTokenRef.current) return;
      setContentLoading(true);
    }, CONTENT_LOADING_DELAY_MS);
    return token;
  }, []);

  const endContentLoading = useCallback((token: number) => {
    if (token && token !== contentLoadingTokenRef.current) return;
    if (contentLoadingTimerRef.current) {
      window.clearTimeout(contentLoadingTimerRef.current);
      contentLoadingTimerRef.current = null;
    }
    setContentLoading(false);
  }, []);

  const clearPendingDataLoadOverlay = useCallback(() => {
    setPendingDataLoadOverlay(false);
  }, []);

  const resolveAssetUrl = useCallback(
    (path?: string) => {
      if (!path) return '';
      if (path.startsWith('data:')) return path;
      return api.buildUrl(path);
    },
    [api],
  );
  const absolutizeMediaUrl = useCallback((path?: string) => {
    if (!path) return '';
    if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    if (typeof window === 'undefined') return path;
    const fallbackBase = `${window.location.protocol}//${window.location.hostname}:8787`;
    const base = resolvedApiBase || fallbackBase;
    try {
      return new URL(path, base).toString();
    } catch {
      return path;
    }
  }, [resolvedApiBase]);
  const resolveThumbCandidateUrl = useCallback((item: MediaItem, kind: ReturnType<typeof guessKind>) => {
    if (!isThumbableRelativePath(item.relative_path)) {
      return kind === 'image' ? normalizeThumbUrl(item.stream_url || '') : undefined;
    }
    if (kind === 'image') {
      return normalizeThumbUrl(item.thumb_url || item.thumbnail_url || item.stream_url || '');
    }
    if (kind === 'video') {
      return normalizeThumbUrl(item.thumb_url || item.thumbnail_url || '');
    }
    return undefined;
  }, []);
  const proxyPrewarmSelectionKey = useMemo(() => (
    reinforcedActiveKey || previewActivationKey || activeAssetKey || ''
  ), [activeAssetKey, previewActivationKey, reinforcedActiveKey]);
  const proxyPrewarmUrl = useMemo(() => {
    if (!proxyPrewarmSelectionKey) return '';
    const targetItem = itemsBySelectionKey.get(proxyPrewarmSelectionKey);
    if (!targetItem) return '';
    if (guessKind(targetItem) !== 'video') return '';
    return absolutizeMediaUrl(resolveAssetUrl(normalizeThumbUrl(targetItem.stream_url || targetItem.download_url || '')) || '');
  }, [absolutizeMediaUrl, itemsBySelectionKey, proxyPrewarmSelectionKey, resolveAssetUrl]);

  const thumbDatasetSignature = useMemo(() => {
    const dataset = filteredMedia.map((item) => {
      const kind = guessKind(item);
      const thumbKey = getThumbCacheKey(item) || assetRenderKey(item, activeProject);
      const rawThumbUrl = resolveThumbCandidateUrl(item, kind);
      const thumbUrl = rawThumbUrl ? absolutizeMediaUrl(resolveAssetUrl(rawThumbUrl) || '') : '';
      return buildThumbJobKey(thumbKey, thumbUrl);
    });
    return `${view}:${view === 'grid' ? gridColumnCount : 'list'}:${dataset.join('\n')}`;
  }, [absolutizeMediaUrl, activeProject, assetRenderKey, filteredMedia, gridColumnCount, resolveAssetUrl, resolveThumbCandidateUrl, view]);

  useThumbnailQueue({
    beginContentLoading,
    clearPendingDataLoadOverlay,
    endContentLoading,
    pendingDataLoadOverlay,
    rootRef: mediaContentRef,
    thumbDatasetSignature,
    updateCardOrientation,
    view,
  });

  useEffect(() => {
    return () => {
      endContentLoading(contentLoadingTokenRef.current);
    };
  }, [endContentLoading]);

  const buildUploadUrl = useCallback((project: Project) => {
    const query = project.source ? `?source=${encodeURIComponent(project.source)}` : '';
    return project.upload_url || `/api/projects/${encodeURIComponent(project.name)}/upload${query}`;
  }, []);

  const hydrateProjectMediaItems = useCallback((items: MediaItem[], project: { name: string; source?: string | null }): MediaItem[] => (
    items.map((item) => ({
      ...item,
      project_name: project.name,
      project_source: project.source && project.source !== 'primary' ? project.source : null,
    }))
  ), []);

  const normalizedPreviewAsset = useMemo(() => {
    if (!inspectorOpen || !focused) return null;
    return normalizePreviewAsset(focused, resolveAssetUrl);
  }, [focused, inspectorOpen, resolveAssetUrl]);

  const previewMetadataRows = useMemo<Array<[string, string]>>(() => {
    if (!inspectorOpen || !focused) return [];
    const kind = guessKind(focused);
    const projectName = activeProject?.name || focused.project_name || '(none)';
    const projectSource = activeProject?.source || focused.project_source || '(primary)';
    const rows = [
      ['Kind', kind],
      ['Size', formatBytes(focused.size)],
      ['Stream', resolveAssetUrl(focused.stream_url) || '(none)'],
      ['Source', projectSource],
      ['Project', projectName],
      ['Relative', focused.relative_path || '(none)'],
      ['MIME', focused.mime || focused.content_type || ''],
      ['Hash', focused.sha256 || focused.hash || ''],
      ['Created', focused.created_at || focused.createdAt || ''],
      ['Modified', focused.updated_at || focused.updatedAt || ''],
      ['Duration', focused.duration ? `${focused.duration}s` : ''],
      ['Resolution', focused.width && focused.height ? `${focused.width}×${focused.height}` : ''],
      ['Tags', formatListValue(focused.tags)],
      ['AI Tags', formatListValue(focused.ai_tags ?? focused.aiTags)],
    ] satisfies Array<[string, string]>;
    return rows.filter((row): row is [string, string] => String(row[1] || '').trim().length > 0);
  }, [activeProject?.name, activeProject?.source, focused, inspectorOpen, resolveAssetUrl]);

  const updateSidebarMode = useCallback(() => {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const hasMultiTouch = (window.navigator.maxTouchPoints || 0) > 1;
    setIsMobile(mobile);
    setTouchPinchCapable(coarsePointer || hasMultiTouch);
    if (!mobile) {
      setSidebarOpen(false);
    }
  }, []);

  const clampDensityColumns = useCallback((value: number) => (
    Math.max(MIN_COLUMNS_MOBILE, Math.min(MAX_COLUMNS_MOBILE, Math.round(value)))
  ), []);

  const commitDensityColumns = useCallback((nextColumns: number, animated = true) => {
    const density = densityControllerRef.current;
    if (density) {
      density.setColumns(nextColumns, animated);
      return;
    }
    const safeColumns = clampDensityColumns(nextColumns);
    lastCommittedColumnsRef.current = safeColumns;
    setGridColumnCount(safeColumns);
    if (gridSurfaceEl) {
      gridSurfaceEl.style.setProperty('--masonry-column-count', String(safeColumns));
      gridSurfaceEl.dataset.columns = String(safeColumns);
    }
  }, [clampDensityColumns, gridSurfaceEl]);

  const scrubDensityColumns = useCallback((nextColumns: number) => {
    const density = densityControllerRef.current;
    if (density) {
      density.scrubTo(nextColumns);
      return;
    }
    commitDensityColumns(nextColumns, true);
  }, [commitDensityColumns]);

  const settleDensityScrub = useCallback(() => {
    const density = densityControllerRef.current;
    density?.settleScrub();
  }, []);

  useEffect(() => {
    setGridColumnCount((current) => clampDensityColumns(current));
  }, [clampDensityColumns]);

  useEffect(() => {
    lastCommittedColumnsRef.current = gridColumnCount;
  }, [gridColumnCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRetainedPrefsHydrated(false);
    const retainedRaw = window.localStorage.getItem(RETAINED_UI_PREFS_KEY);
    const retainedParsed = parseStoredJsonObject(retainedRaw);
    let restoreSource: 'retained' | 'legacy' | 'none' = 'none';
    if (retainedParsed) {
      const storedView = retainedParsed.view;
      if (storedView === 'grid' || storedView === 'list') {
        setView(storedView);
      }
      if (typeof retainedParsed.gridColumnCount === 'number' && Number.isFinite(retainedParsed.gridColumnCount)) {
        const restoredColumns = clampLayoutColumns(retainedParsed.gridColumnCount);
        lastCommittedColumnsRef.current = restoredColumns;
        setGridColumnCount(restoredColumns);
      }
      if (VALID_SORT_KEYS.has(retainedParsed.sortKey as SortKey)) {
        setSortKey(retainedParsed.sortKey as SortKey);
      }
      if (VALID_TYPE_FILTERS.has(retainedParsed.typeFilter as MediaTypeFilter)) {
        setTypeFilter(retainedParsed.typeFilter as MediaTypeFilter);
      }
      if (typeof retainedParsed.selectedOnly === 'boolean') {
        setSelectedOnly(retainedParsed.selectedOnly);
      }
      if (typeof retainedParsed.untaggedOnly === 'boolean') {
        setUntaggedOnly(retainedParsed.untaggedOnly);
      }
      if (typeof retainedParsed.overlayEnabled === 'boolean') {
        setOverlayEnabled(retainedParsed.overlayEnabled);
      }
      restoreSource = 'retained';
    } else {
      const legacyFilterParsed = parseStoredJsonObject(window.localStorage.getItem(LEGACY_FILTER_PREFS_KEY));
      if (legacyFilterParsed) {
        if (VALID_TYPE_FILTERS.has(legacyFilterParsed.type as MediaTypeFilter)) {
          setTypeFilter(legacyFilterParsed.type as MediaTypeFilter);
        }
        if (VALID_SORT_KEYS.has(legacyFilterParsed.sort as SortKey)) {
          setSortKey(legacyFilterParsed.sort as SortKey);
        }
        if (typeof legacyFilterParsed.selectedOnly === 'boolean') {
          setSelectedOnly(legacyFilterParsed.selectedOnly);
        }
        if (typeof legacyFilterParsed.untaggedOnly === 'boolean') {
          setUntaggedOnly(legacyFilterParsed.untaggedOnly);
        }
        restoreSource = 'legacy';
      }
      const legacyOverlayRaw = window.localStorage.getItem(LEGACY_OVERLAY_VIS_PREFS_KEY);
      if (legacyOverlayRaw != null) {
        setOverlayEnabled(legacyOverlayRaw !== '0');
        restoreSource = 'legacy';
      }
    }
    (window as typeof window & {
      __explorerRetainedPrefsDebug?: {
        key: string;
        legacyFilterKey: string;
        legacyOverlayKey: string;
        malformedRetainedPayload: boolean;
        restoreSource: 'retained' | 'legacy' | 'none';
        hydrated: boolean;
      };
    }).__explorerRetainedPrefsDebug = {
      key: RETAINED_UI_PREFS_KEY,
      legacyFilterKey: LEGACY_FILTER_PREFS_KEY,
      legacyOverlayKey: LEGACY_OVERLAY_VIS_PREFS_KEY,
      malformedRetainedPayload: Boolean(retainedRaw) && !retainedParsed,
      restoreSource,
      hydrated: true,
    };
    setRetainedPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!retainedPrefsHydrated) {
      (window as typeof window & {
        __explorerRetainedPrefsDebug?: Record<string, unknown>;
      }).__explorerRetainedPrefsDebug = {
        ...(window as typeof window & {
          __explorerRetainedPrefsDebug?: Record<string, unknown>;
        }).__explorerRetainedPrefsDebug,
        saveSkippedUntilHydrated: true,
      };
      return;
    }
    try {
      const retainedPayload = {
        view,
        gridColumnCount: clampLayoutColumns(gridColumnCount),
        sortKey,
        typeFilter,
        selectedOnly,
        untaggedOnly,
        overlayEnabled,
      };
      window.localStorage.setItem(RETAINED_UI_PREFS_KEY, JSON.stringify(retainedPayload));
      (window as typeof window & {
        __explorerRetainedPrefsDebug?: {
          lastSavedPayload?: typeof retainedPayload;
          lastSavedAt?: string;
          saveSkippedUntilHydrated?: boolean;
        };
      }).__explorerRetainedPrefsDebug = {
        ...(window as typeof window & {
          __explorerRetainedPrefsDebug?: Record<string, unknown>;
        }).__explorerRetainedPrefsDebug,
        lastSavedPayload: retainedPayload,
        lastSavedAt: new Date().toISOString(),
        saveSkippedUntilHydrated: false,
        hydrated: retainedPrefsHydrated,
      };
    } catch {
      // ignore storage errors
    }
  }, [gridColumnCount, overlayEnabled, retainedPrefsHydrated, selectedOnly, sortKey, typeFilter, untaggedOnly, view]);

  useEffect(() => {
    if (typeFilter === 'overlay' && !mediaMeta.types.has('overlay')) {
      setTypeFilter('all');
    }
    if (!mediaMeta.hasTags && untaggedOnly) {
      setUntaggedOnly(false);
    }
    if (!mediaMeta.hasSize && (sortKey === 'size-desc' || sortKey === 'size-asc')) {
      setSortKey('newest');
    }
  }, [mediaMeta, typeFilter, untaggedOnly, sortKey]);

  const loadMedia = useCallback(
    async (project: Project | null) => {
      if (!project) {
        setPendingDataLoadOverlay(false);
        setMedia([]);
        setMediaScope('project');
        clearSelectionState();
        clearActiveAsset();
        return;
      }
      try {
        setPendingDataLoadOverlay(true);
        const payload = await api.listMedia(project.name, project.source);
        const items = Array.isArray(payload.media) ? payload.media : [];
        const hydratedItems = hydrateProjectMediaItems(items, project);
        setMedia(sortMediaByRecent(hydratedItems));
        setMediaScope('project');
        const existing = new Set(hydratedItems.map((item) => assetSelectionKey(item, project)));
        setSelected((current) => {
          const next = pruneSelection(current, existing);
          setSelectedOrder((order) => order.filter((value) => next.has(value)));
          return next;
        });
      } catch (err) {
        setPendingDataLoadOverlay(false);
        const message = err instanceof Error ? err.message : 'Failed to load media';
        addToast('bad', 'Media', message);
      }
    },
    [api, addToast, assetSelectionKey, clearActiveAsset, clearSelectionState, hydrateProjectMediaItems],
  );

  const loadAllMedia = useCallback(async () => {
    clearSelectionState();
    clearActiveAsset();
    setMediaScope('all');
    setPendingDataLoadOverlay(true);
    try {
      const snapshot = await refreshLibrarySnapshot({ scope: 'all' });
      setMedia(sortMediaByRecent(Array.isArray(snapshot.assets) ? snapshot.assets : []));
    } catch {
      // error toast is emitted by libraryError effect.
    } finally {
      setPendingDataLoadOverlay(false);
    }
  }, [clearActiveAsset, clearSelectionState, refreshLibrarySnapshot]);

  useEffect(() => {
    const handleClaimEvent = () => {
      try {
        const raw = window.localStorage.getItem('explorer_live_claim_event');
        if (!raw) return;
        const parsed = JSON.parse(raw) as { claim_id?: string; at?: number };
        const claimId = String(parsed?.claim_id || '').trim();
        const at = Number(parsed?.at || 0);
        if (!claimId || !Number.isFinite(at) || Date.now() - at > 120000) return;
        if (liveClaimRefreshRef.current === claimId) return;
        liveClaimRefreshRef.current = claimId;
        window.setTimeout(() => {
          if (activeProject && mediaScope === 'project') {
            void loadMedia(activeProject);
          } else {
            void loadAllMedia();
          }
          addToast('good', 'Live capture', `New claim submitted: ${claimId}`);
        }, 1200);
      } catch {
        // ignore malformed storage value
      }
    };
    handleClaimEvent();
    const timer = window.setInterval(handleClaimEvent, 2500);
    return () => window.clearInterval(timer);
  }, [activeProject, addToast, loadAllMedia, loadMedia, mediaScope]);

  const refreshMediaForScope = useCallback(async (
    refreshScope: {
      project?: string;
      source?: string;
      paths?: string[];
    } | null | undefined,
  ) => {
    const projectName = String(refreshScope?.project || '').trim();
    if (!projectName) return;
    const sourceName = String(refreshScope?.source || '').trim();
    const refreshedProject = projects.find((entry) => (
      entry.name === projectName
      && (entry.source || 'primary') === (sourceName || 'primary')
    )) || {
      name: projectName,
      source: sourceName || null,
    };
    const scopedSnapshot = await refreshLibrarySnapshot({
      scope: 'project',
      project: refreshedProject.name,
      source: refreshedProject.source || undefined,
    });
    const snapshotAssets = Array.isArray(scopedSnapshot.assets) ? scopedSnapshot.assets : [];
    const hydratedItems = hydrateProjectMediaItems(snapshotAssets, refreshedProject);

    if (mediaScope === 'all' || !activeProject) {
      setMedia((current) => {
        const retained = current.filter((item) => {
          const itemProject = String(item.project_name || item.project || '').trim();
          const itemSource = String(item.project_source || item.source || '').trim() || 'primary';
          return itemProject !== refreshedProject.name || itemSource !== (refreshedProject.source || 'primary');
        });
        const mergedItems = mergeMediaItemsPreservingIdentity(current, hydratedItems);
        return sortMediaByRecent([...retained, ...mergedItems]);
      });
      return;
    }

    if (
      activeProject.name === refreshedProject.name
      && (activeProject.source || 'primary') === (refreshedProject.source || 'primary')
    ) {
      setMedia((current) => sortMediaByRecent(mergeMediaItemsPreservingIdentity(current, hydratedItems)));
    }
  }, [activeProject, hydrateProjectMediaItems, mediaScope, projects, refreshLibrarySnapshot]);

  const fetchComposeJobJson = useCallback(async (url: string) => {
    const response = await fetch(api.buildUrl(url));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.detail || payload?.message || 'Failed to poll compose job'));
    }
    return payload;
  }, [api]);

  const refreshAll = useCallback(async () => {
    const snapshot = await refreshLibrarySnapshot({ scope: 'all' });
    if (activeProject) {
      const filtered = snapshot.assets.filter((item) => (
        item.project_name === activeProject.name
        && (item.project_source || item.source || 'primary') === (activeProject.source || 'primary')
      ));
      setMedia(sortMediaByRecent(hydrateProjectMediaItems(filtered, activeProject)));
      setMediaScope('project');
    } else {
      setMedia(sortMediaByRecent(Array.isArray(snapshot.assets) ? snapshot.assets : []));
      setMediaScope('all');
    }
    addToast('good', 'Refresh', 'Reloaded projects + media', 'explorer-refresh');
  }, [activeProject, addToast, hydrateProjectMediaItems, refreshLibrarySnapshot]);

  const selectProject = useCallback(
    (project: Project) => {
      const alreadySelected = Boolean(activeProject)
        && activeProject?.name === project.name
        && (activeProject?.source || 'primary') === (project.source || 'primary');

      if (alreadySelected) {
        setActiveProject(null);
        setMediaScope('all');
        clearSelectionState();
        clearActiveAsset();
        setResolveProjectMode('current');
        setResolveProjectName('');
        setResolveNewName('');
        setUploadStatus('');
        addToast('good', 'Project', 'Showing all projects');
        return;
      }

      setActiveProject(project);
      setMediaScope('project');
      clearSelectionState();
      clearActiveAsset();
      setResolveProjectMode('current');
      setResolveProjectName(project.name || '');
      setResolveNewName('');
      setUploadStatus('');
      addToast('good', 'Project', `Selected ${project.name}`);
    },
    [activeProject, addToast, clearActiveAsset, clearSelectionState],
  );

  const toggleSelected = useCallback(
    (item: MediaItem) => {
      const key = assetSelectionKey(item, activeProject);
      if (!key) return;
      setSelected((current) => {
        const { selected: nextSelected, order } = toggleSelectionWithOrder(current, selectedOrderRef.current, key);
        selectedOrderRef.current = order;
        setSelectedOrder(order);
        return nextSelected;
      });
    },
    [activeProject, assetSelectionKey],
  );

  const clearSelection = useCallback(() => {
    clearSelectionState();
  }, [clearSelectionState]);

  const focusAsset = useCallback((item: MediaItem, itemKey?: string) => {
    const nextKey = itemKey || assetSelectionKey(item, activeProject);
    if (!nextKey) return;
    setActiveAssetKey(nextKey);
  }, [activeProject, assetSelectionKey]);

  const attemptGridFocusWithRetry = useCallback((selectionKey: string, requestedMode: ExplorerView) => {
    const initialStart = startFocusMotionForSelectionKey(selectionKey);
    recordPreviewDebug({
      stage: 'openPreview-focus-attempt',
      selectionKey,
      requestedMode,
      finalMode: initialStart.ok ? 'world-focus' : 'drawer-fallback',
      reason: initialStart.ok ? undefined : initialStart.reason,
    });
    if (initialStart.ok) return;
    if (!isReadinessFocusReason(initialStart.reason)) {
      moveFocusPresentationToFallbackOrIdle(selectionKey, initialStart.reason);
      return;
    }
    clearFocusStartRetryFrame();
    recordPreviewDebug({
      stage: 'focus-retry-scheduled',
      selectionKey,
      requestedMode,
      reason: initialStart.reason,
    });
    focusStartRetryFrameRef.current = scheduleExplorerRaf('raf-lane-focus-world', () => {
      focusStartRetryFrameRef.current = null;
      const retryStart = startFocusMotionForSelectionKey(selectionKey);
      recordPreviewDebug({
        stage: 'focus-retry-attempt',
        selectionKey,
        requestedMode,
        finalMode: retryStart.ok ? 'world-focus' : 'drawer-fallback',
        reason: retryStart.ok ? undefined : retryStart.reason,
      });
      if (!retryStart.ok) {
        moveFocusPresentationToFallbackOrIdle(selectionKey, retryStart.reason);
      }
    });
  }, [clearFocusStartRetryFrame, moveFocusPresentationToFallbackOrIdle, recordPreviewDebug, startFocusMotionForSelectionKey]);

  const getGridThumbVideoBySelectionKey = useCallback((selectionKey: string) => {
    if (!selectionKey || !gridRef.current) return null;
    const nodes = Array.from(gridRef.current.querySelectorAll<HTMLVideoElement>('.masonry-card[data-select-key] .asset-thumb-preview'));
    return nodes.find((node) => node.closest<HTMLElement>('.masonry-card[data-select-key]')?.dataset.selectKey === selectionKey) || null;
  }, []);

  const publishMediaInvariantDebug = useCallback((reason: string) => {
    if (typeof document === 'undefined') return;
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    const proxyVideos = Array.from(document.querySelectorAll<HTMLVideoElement>('.proxy-render-video'));
    const gridThumbVideos = Array.from(document.querySelectorAll<HTMLVideoElement>('.masonry-card[data-select-key] .asset-thumb-preview'));
    const prewarmVideos = Array.from(document.querySelectorAll<HTMLVideoElement>('.proxy-prewarm-video'));
    const playingVideos = videos.filter((video) => !video.paused && !video.ended);
    const focusedProxyPlaybackOwned = view === 'grid' && inspectorOpen && gridCinematicMode === 'grid-focused';
    const unauthorizedGridThumbPlaying = focusedProxyPlaybackOwned
      && gridThumbVideos.some((video) => !video.paused && !video.ended);
    const unauthorizedPrewarmPlaying = focusedProxyPlaybackOwned
      && prewarmVideos.some((video) => !video.paused && !video.ended);
    const violationClass = unauthorizedGridThumbPlaying
      ? 'unauthorizedGridThumbPlaying'
      : (unauthorizedPrewarmPlaying ? 'unauthorizedPrewarmPlaying' : '');
    const payload = {
      reason,
      totalVideos: videos.length,
      proxyVideos: proxyVideos.length,
      playingVideos: playingVideos.length,
      activeSelectionKey: activeAssetKey,
      focusedProxyPlaybackOwned,
      unauthorizedGridThumbPlaying,
      unauthorizedPrewarmPlaying,
      violationClass,
    };
    (globalThis as typeof globalThis & {
      __explorerMediaDebug?: typeof payload;
      __explorerMediaInvariantViolation?: typeof payload;
    }).__explorerMediaDebug = payload;
    if (playingVideos.length > 2 || unauthorizedGridThumbPlaying || unauthorizedPrewarmPlaying) {
      (globalThis as typeof globalThis & {
        __explorerMediaInvariantViolation?: typeof payload;
      }).__explorerMediaInvariantViolation = {
        ...payload,
        reason: 'media-invariant-violation',
      };
    }
  }, [activeAssetKey, gridCinematicMode, inspectorOpen, view]);

  const pauseNonAuthoritativeGridVideos = useCallback((authoritativeSelectionKey: string) => {
    const gridRoot = gridRef.current;
    if (!gridRoot) return;
    const thumbVideos = Array.from(gridRoot.querySelectorAll<HTMLVideoElement>('.masonry-card[data-select-key] .asset-thumb-preview'));
    thumbVideos.forEach((videoEl) => {
      const selectionKey = videoEl.closest<HTMLElement>('.masonry-card[data-select-key]')?.dataset.selectKey || '';
      if (selectionKey && selectionKey === authoritativeSelectionKey) return;
      if (!videoEl.paused || videoEl.currentTime !== 0) {
        videoEl.pause();
        videoEl.currentTime = 0;
        (globalThis as typeof globalThis & {
          __explorerMediaDebugMarker?: { marker: string; selectionKey: string };
        }).__explorerMediaDebugMarker = {
          marker: 'grid-thumb-paused-authority-enforced',
          selectionKey,
        };
      }
    });
    publishMediaInvariantDebug('grid-videos-paused');
  }, [publishMediaInvariantDebug]);

  const playGridThumbForSelectionKey = useCallback((selectionKey: string) => {
    const thumbVideo = getGridThumbVideoBySelectionKey(selectionKey);
    if (!thumbVideo) return;
    const focusedProxyPlaybackOwned = view === 'grid' && inspectorOpen && gridCinematicMode === 'grid-focused';
    if (focusedProxyPlaybackOwned) {
      thumbVideo.pause();
      thumbVideo.currentTime = 0;
      (globalThis as typeof globalThis & {
        __explorerMediaDebugMarker?: { marker: string; selectionKey: string };
      }).__explorerMediaDebugMarker = {
        marker: 'grid-thumb-play-blocked-non-authoritative',
        selectionKey,
      };
      publishMediaInvariantDebug('grid-thumb-play-blocked');
      return;
    }
    thumbVideo.muted = true;
    thumbVideo.playsInline = true;
    thumbVideo.loop = true;
    pauseNonAuthoritativeGridVideos(selectionKey);
    thumbVideo.play().catch(() => {});
    publishMediaInvariantDebug('grid-thumb-play-requested');
  }, [getGridThumbVideoBySelectionKey, gridCinematicMode, inspectorOpen, pauseNonAuthoritativeGridVideos, publishMediaInvariantDebug, view]);

  const pauseGridThumbForSelectionKey = useCallback((selectionKey: string) => {
    const thumbVideo = getGridThumbVideoBySelectionKey(selectionKey);
    if (!thumbVideo) return;
    thumbVideo.pause();
    publishMediaInvariantDebug('grid-thumb-paused-selection');
  }, [getGridThumbVideoBySelectionKey, publishMediaInvariantDebug]);

  const runProxyFocusTransition = useCallback((
    selectionKey: string,
    mode: 'open' | 'refocus' | 'retarget',
    onComplete?: () => void,
  ) => {
    if (view !== 'grid') return false;
    const gridRoot = gridRef.current;
    const viewportEl = mediaScrollViewportRef.current;
    const orchestrator = focusOrchestratorRef.current;
    if (!gridRoot || !viewportEl || !orchestrator) return false;
    orchestrator.interruptActiveTransition();
    const setTravelState = () => setProxyTravelState(mode === 'open' ? 'open-travel' : 'refocus-travel');
    const clearTravelState = () => setProxyTravelState('idle');
    const handleEvent = (event: string) => {
      recordPreviewDebug({ stage: event, selectionKey, requestedMode: view });
    };
    const continuityItem = itemsBySelectionKey.get(selectionKey) ?? null;
    const continuityAsset = continuityItem ? normalizePreviewAsset(continuityItem, resolveAssetUrl) : null;
    const continuityStreamUrl = absolutizeMediaUrl(continuityAsset?.src || '');
    const continuityKey = continuityStreamUrl ? `${selectionKey}::${continuityStreamUrl}` : selectionKey;
    const transitionArgs = {
      gridRoot,
      viewportEl,
      selectionKey,
      continuityKey,
      onStart: () => {
        setTravelState();
        setGridCinematicMode(mode === 'open' ? 'grid-opening' : 'grid-refocusing');
        viewportEl.classList.add('focus-proxy-scroll-lock');
        pauseNonAuthoritativeGridVideos(selectionKey);
      },
      onComplete: () => {
        clearTravelState();
        setGridCinematicMode('grid-focused');
        viewportEl.classList.remove('focus-proxy-scroll-lock');
        onComplete?.();
      },
      onEvent: handleEvent,
    };
    const opened = mode === 'open'
      ? orchestrator.openFocusTransition(transitionArgs)
      : (mode === 'retarget'
        ? orchestrator.retargetTransition(transitionArgs)
        : orchestrator.refocusTransition(transitionArgs));
    if (!opened) {
      if (mode === 'retarget') {
        handleEvent('focused-retarget-runProxyFocusTransition-false');
        return false;
      }
      clearTravelState();
      setGridCinematicMode('grid-rest');
      viewportEl.classList.remove('focus-proxy-scroll-lock');
      handleEvent('proxy-failed');
    }
    return opened;
  }, [absolutizeMediaUrl, itemsBySelectionKey, normalizePreviewAsset, pauseNonAuthoritativeGridVideos, recordPreviewDebug, resolveAssetUrl, view]);

  const openPreview = useCallback((item: MediaItem) => {
    const nextKey = assetSelectionKey(item, activeProject);
    if (!nextKey) return;
    const thumbVideo = getGridThumbVideoBySelectionKey(nextKey);
    if (thumbVideo) {
      previewPlaybackHandoffRef.current = {
        selectionKey: nextKey,
        currentTime: Number.isFinite(thumbVideo.currentTime) ? Math.max(0, thumbVideo.currentTime) : 0,
        wasPlaying: !thumbVideo.paused,
        muted: thumbVideo.muted,
        src: thumbVideo.currentSrc || thumbVideo.src || '',
      };
    } else {
      previewPlaybackHandoffRef.current = null;
    }
    recordPreviewDebug({ stage: 'openPreview-request', selectionKey: nextKey, requestedMode: view });
    focusAsset(item, nextKey);
    setFocused(item);
    setPreviewDetailsOpen(false);
    setInspectorOpen(true);
    inspectorOpenRef.current = true;
    if (view === 'list') {
      moveFocusPresentationToFallbackOrIdle(nextKey, 'not-grid');
      return;
    }
    const isGridRefocus = gridCinematicMode === 'grid-focused' && activeAssetKey && activeAssetKey !== nextKey;
    const proxyOpened = runProxyFocusTransition(nextKey, isGridRefocus ? 'refocus' : 'open');
    if (!proxyOpened) {
      recordPreviewDebug({ stage: 'proxy-open-failed-no-fallback', selectionKey: nextKey, requestedMode: view, finalMode: 'idle' });
      setGridCinematicMode('grid-rest');
      setProxyTravelState('idle');
      setInspectorOpen(false);
      inspectorOpenRef.current = false;
      setFocused(null);
      setPreviewDetailsOpen(false);
      resetFocusPresentationToIdle();
    }
  }, [activeAssetKey, activeProject, assetSelectionKey, focusAsset, getGridThumbVideoBySelectionKey, gridCinematicMode, moveFocusPresentationToFallbackOrIdle, recordPreviewDebug, resetFocusPresentationToIdle, runProxyFocusTransition, view]);

  const closeGridFocusToRest = useCallback(() => {
    clearCloseSettleTimeout();
    recordPreviewDebug({ stage: 'focus-close-start', requestedMode: view });
    focusOrchestratorRef.current?.interruptActiveTransition();
    gridCinematicTimelineRef.current?.playClose();
    setGridCinematicMode('grid-closing');
    focusOrchestratorRef.current?.closeFocusTransition({
      onEvent: (event) => {
        recordPreviewDebug({ stage: event, requestedMode: view });
      },
      onComplete: () => {
        clearCloseSettleTimeout();
        recordPreviewDebug({ stage: 'focus-close-complete', requestedMode: view });
        commitCloseStateToRest('complete');
      },
    });
    removeFocusProxyScrollLock();
    setProxyTravelState('idle');
    closeSettleTimeoutRef.current = window.setTimeout(() => {
      closeSettleTimeoutRef.current = null;
      if (gridCinematicModeRef.current !== 'grid-rest' || proxyTravelStateRef.current !== 'idle') {
        commitCloseStateToRest('missed');
      }
    }, 560);
  }, [
    clearCloseSettleTimeout,
    commitCloseStateToRest,
    recordPreviewDebug,
    removeFocusProxyScrollLock,
    view,
  ]);

  const closeDrawer = useCallback(() => {
    if (view === 'grid') {
      closeGridFocusToRest();
    }
    if (activeAssetKey) {
      setActiveAssetKey('');
      recordPreviewDebug({ stage: 'focus-close-cleared-active-asset', selectionKey: activeAssetKey, requestedMode: view });
    }
    if (previewActivationKey) {
      setPreviewActivationKey('');
      setPreviewPlaybackToken((prev) => prev + 1);
      recordPreviewDebug({ stage: 'focus-close-cleared-preview-activation', selectionKey: previewActivationKey, requestedMode: view });
    }
    if (reinforcedActiveKey) {
      setReinforcedActiveKey('');
      recordPreviewDebug({ stage: 'focus-close-cleared-reinforced-active', selectionKey: reinforcedActiveKey, requestedMode: view });
    }
    if (holdEmphasisKey) {
      setHoldEmphasisKey('');
      recordPreviewDebug({ stage: 'focus-close-cleared-hold-emphasis', selectionKey: holdEmphasisKey, requestedMode: view });
    }
    previewPlaybackHandoffRef.current = null;
    setInspectorOpen(false);
    inspectorOpenRef.current = false;
    setFocused(null);
    setPreviewDetailsOpen(false);
    recordPreviewDebug({ stage: 'focus-close-activation-reset-complete', requestedMode: view, finalMode: 'idle' });
    window.setTimeout(() => {
      resetFocusPresentationToIdle();
    }, 96);
  }, [
    activeAssetKey,
    closeGridFocusToRest,
    holdEmphasisKey,
    previewActivationKey,
    recordPreviewDebug,
    reinforcedActiveKey,
    resetFocusPresentationToIdle,
    view,
  ]);

  useEffect(() => () => {
    clearCloseSettleTimeout();
  }, [clearCloseSettleTimeout]);

  const commitPreviewActivationKey = useCallback((nextKey: string) => {
    setPreviewActivationKey((prev) => {
      if (prev !== nextKey) {
        setPreviewPlaybackToken((token) => token + 1);
      }
      return nextKey;
    });
  }, []);

  const focusRelative = useCallback((offset: number) => {
    if (!focused || !filteredMedia.length) return;
    const currentKey = assetSelectionKey(focused, activeProject);
    const currentIndex = filteredMedia.findIndex((item) => assetSelectionKey(item, activeProject) === currentKey);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + offset + filteredMedia.length) % filteredMedia.length;
    const nextItem = filteredMedia[nextIndex] || focused;
    const nextKey = assetSelectionKey(nextItem, activeProject);
    if (!nextKey) return;
    setFocused(nextItem);
    setActiveAssetKey(nextKey);
    commitPreviewActivationKey(nextKey);
    const proxyOpened = runProxyFocusTransition(nextKey, 'retarget');
    if (!proxyOpened) return;
    setPreviewAutoPlayToken((prev) => prev + 1);
  }, [activeProject, assetSelectionKey, commitPreviewActivationKey, filteredMedia, focused, runProxyFocusTransition]);

  const scheduleFocusedRetargetRetry = useCallback((
    nextItem: MediaItem,
    nextKey: string,
  ) => {
    recordPreviewDebug({ stage: 'focused-retarget-retry-scheduled', selectionKey: nextKey, requestedMode: view });
    recordPreviewDebug({ stage: 'focused-retarget-kept-focused', selectionKey: nextKey, requestedMode: view });
    clearFocusedRetargetRetryFrame();
    focusedRetargetRetryFrameRef.current = scheduleExplorerRaf('raf-lane-focus-world', () => {
      focusedRetargetRetryFrameRef.current = null;
      recordPreviewDebug({ stage: 'focused-retarget-retry-attempt', selectionKey: nextKey, requestedMode: view });
      setFocused(nextItem);
      setActiveAssetKey(nextKey);
      commitPreviewActivationKey(nextKey);
      const retryOpened = runProxyFocusTransition(nextKey, 'retarget');
      if (retryOpened) {
        recordPreviewDebug({ stage: 'focused-retarget-dispatched', selectionKey: nextKey, requestedMode: view });
        return;
      }
      recordPreviewDebug({ stage: 'focused-retarget-retry-failed', selectionKey: nextKey, requestedMode: view });
      recordPreviewDebug({ stage: 'focused-retarget-kept-focused', selectionKey: nextKey, requestedMode: view });
    });
  }, [clearFocusedRetargetRetryFrame, commitPreviewActivationKey, recordPreviewDebug, runProxyFocusTransition, view]);

  useEffect(() => {
    if (view !== 'grid') return;
    if (!inspectorOpen) return;
    if (gridCinematicMode !== 'grid-focused') return;
    const viewportEl = mediaScrollViewportRef.current;
    if (!viewportEl) return;
    const handlePointerDown = (event: PointerEvent) => {
      const isProxyOrigin = event.composedPath().some((node) => (
        node instanceof HTMLElement
        && node.dataset.focusProxyLayer === 'true'
      ));
      if (isProxyOrigin) {
        recordPreviewDebug({ stage: 'focused-retarget-delegated-to-proxy-root', selectionKey: activeAssetKey, requestedMode: view });
        recordPreviewDebug({ stage: 'viewport-close-blocked-proxy-origin', selectionKey: activeAssetKey, requestedMode: view });
        return;
      }
      const targetEl = event.target as HTMLElement | null;
      if (!targetEl) return;
      const cardEl = targetEl.closest<HTMLElement>('.masonry-card[data-select-key]');
      if (!cardEl) {
        closeDrawer();
        return;
      }
      const nextKey = cardEl.dataset.selectKey || '';
      recordPreviewDebug({ stage: 'focused-retarget-tap', selectionKey: nextKey || activeAssetKey, requestedMode: view });
      if (!nextKey) return;
      if (nextKey === activeAssetKey) {
        recordPreviewDebug({ stage: 'focused-retarget-blocked-same-key', selectionKey: nextKey, requestedMode: view });
        return;
      }
      const nextItem = filteredMedia.find((item) => assetSelectionKey(item, activeProject) === nextKey);
      if (!nextItem) return;
      event.preventDefault();
      event.stopPropagation();
      recordPreviewDebug({ stage: 'focused-retarget-resolved-key', selectionKey: nextKey, requestedMode: view });
      setFocused(nextItem);
      setActiveAssetKey(nextKey);
      commitPreviewActivationKey(nextKey);
      const proxyOpened = runProxyFocusTransition(nextKey, 'retarget');
      if (!proxyOpened) {
        scheduleFocusedRetargetRetry(nextItem, nextKey);
        return;
      }
      recordPreviewDebug({ stage: 'focused-retarget-dispatched', selectionKey: nextKey, requestedMode: view });
    };
    viewportEl.addEventListener('pointerdown', handlePointerDown, true);
    return () => viewportEl.removeEventListener('pointerdown', handlePointerDown, true);
  }, [activeAssetKey, activeProject, assetSelectionKey, closeDrawer, commitPreviewActivationKey, filteredMedia, gridCinematicMode, inspectorOpen, runProxyFocusTransition, scheduleFocusedRetargetRetry, view]);

  useEffect(() => {
    if (view !== 'grid') return;
    if (!inspectorOpen) return;
    if (gridCinematicMode === 'grid-rest') return;
    const proxyRoot = focusProxyRootRef.current;
    if (!proxyRoot) return;
    const handleProxyPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (event.pointerType === 'touch') {
        const now = Date.now();
        const withinDoubleTapWindow = (now - focusedDoubleTapStateRef.current.lastTapAt) <= 320;
        const isControlTarget = Boolean(
          target.closest('input, textarea, select, button, a, [contenteditable=\"true\"], [data-interactive=\"true\"]'),
        );
        if (withinDoubleTapWindow && !isControlTarget) {
          event.preventDefault();
          recordPreviewDebug({ stage: 'focused-doubletap-suppressed', selectionKey: activeAssetKey, requestedMode: view });
        }
        if (withinDoubleTapWindow && isControlTarget) {
          recordPreviewDebug({ stage: 'focused-doubletap-allowed-control', selectionKey: activeAssetKey, requestedMode: view });
        }
        focusedDoubleTapStateRef.current.lastTapAt = now;
      }
      if (target.closest('.proxy-preview-ui')) return;
      const action = target.closest<HTMLElement>('[data-proxy-action]')?.dataset.proxyAction;
      if (action === 'close') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (action === 'prev') {
        event.preventDefault();
        focusRelative(-1);
        return;
      }
      if (action === 'next') {
        event.preventDefault();
        focusRelative(1);
        return;
      }
      recordPreviewDebug({ stage: 'focused-retarget-tap', selectionKey: activeAssetKey, requestedMode: view });
      const tapTarget = resolveFocusedTapTarget(target);
      if (tapTarget.kind === 'proxy-surface') {
        recordPreviewDebug({ stage: 'focused-tap-hit-proxy-surface', selectionKey: activeAssetKey, requestedMode: view });
      }
      if (tapTarget.kind === 'body') {
        recordPreviewDebug({ stage: 'focused-tap-hit-body', selectionKey: activeAssetKey, requestedMode: view });
      }
      const cardEl = tapTarget.proxyCardEl;
      if (tapTarget.kind === 'proxy-card-root') {
        recordPreviewDebug({ stage: 'focused-tap-hit-proxy-card-root', selectionKey: tapTarget.selectionKey, requestedMode: view });
      }
      if (tapTarget.kind === 'proxy-card-child') {
        recordPreviewDebug({ stage: 'focused-tap-hit-proxy-card-child', selectionKey: tapTarget.selectionKey, requestedMode: view });
      }
      const resolveUnderlyingGridKey = () => {
        const previousPointerEvents = proxyRoot.style.pointerEvents;
        proxyRoot.style.pointerEvents = 'none';
        const underlying = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        proxyRoot.style.pointerEvents = previousPointerEvents;
        const gridCard = underlying?.closest<HTMLElement>('.masonry-card[data-select-key]') ?? null;
        return gridCard?.dataset.selectKey || '';
      };
      if (!cardEl) {
        const gridKey = resolveUnderlyingGridKey();
        if (!gridKey) {
          if (tapTarget.kind === 'proxy-surface') {
            recordPreviewDebug({ stage: 'focused-tap-empty-after-proxy-surface', selectionKey: activeAssetKey, requestedMode: view });
          }
          if (tapTarget.kind === 'body') {
            recordPreviewDebug({ stage: 'focused-tap-empty-after-body', selectionKey: activeAssetKey, requestedMode: view });
          }
          recordPreviewDebug({ stage: 'focused-tap-hit-empty-space', selectionKey: activeAssetKey, requestedMode: view });
          recordPreviewDebug({ stage: 'focused-retarget-ambient-card-miss', selectionKey: activeAssetKey, requestedMode: view });
          recordPreviewDebug({ stage: 'focused-retarget-blocked-overlay', selectionKey: activeAssetKey, requestedMode: view });
          if (gridCinematicMode === 'grid-focused') {
            event.preventDefault();
            recordPreviewDebug({ stage: 'focused-tap-close-empty-space', selectionKey: activeAssetKey, requestedMode: view });
            closeDrawer();
          }
          return;
        }
        recordPreviewDebug({ stage: 'focused-tap-hit-grid-asset', selectionKey: gridKey, requestedMode: view });
        recordPreviewDebug({ stage: 'focused-retarget-hit-grid-fallback', selectionKey: gridKey, requestedMode: view });
        if (gridKey === activeAssetKey) {
          recordPreviewDebug({ stage: 'focused-retarget-blocked-same-key', selectionKey: gridKey, requestedMode: view });
          return;
        }
        const targetItem = filteredMedia.find((item) => assetSelectionKey(item, activeProject) === gridKey);
        if (!targetItem) return;
        event.preventDefault();
        recordPreviewDebug({ stage: 'focused-retarget-resolved-key', selectionKey: gridKey, requestedMode: view });
        focusAsset(targetItem, gridKey);
        setFocused(targetItem);
        setPreviewDetailsOpen(false);
        setInspectorOpen(true);
        inspectorOpenRef.current = true;
        const proxyOpened = runProxyFocusTransition(gridKey, 'retarget');
        if (!proxyOpened) {
          recordPreviewDebug({ stage: 'focused-retarget-openPreview-fallback-blocked', selectionKey: gridKey, requestedMode: view });
          scheduleFocusedRetargetRetry(targetItem, gridKey);
          return;
        }
        recordPreviewDebug({ stage: 'focused-tap-retarget-dispatched', selectionKey: gridKey, requestedMode: view });
        recordPreviewDebug({ stage: 'focused-retarget-dispatched', selectionKey: gridKey, requestedMode: view });
        return;
      }
      recordPreviewDebug({ stage: 'focused-tap-hit-proxy-asset', selectionKey: cardEl.dataset.selectionKey || '', requestedMode: view });
      if (cardEl.classList.contains('is-ambient')) {
        recordPreviewDebug({ stage: 'focused-retarget-ambient-card-hit', selectionKey: cardEl.dataset.selectionKey || '', requestedMode: view });
      }
      else {
        recordPreviewDebug({ stage: 'focused-retarget-hit-proxy-card', selectionKey: cardEl.dataset.selectionKey || '', requestedMode: view });
      }
      const nextKey = cardEl.dataset.selectionKey || '';
      if (!nextKey) return;
      if (nextKey === activeAssetKey) {
        recordPreviewDebug({ stage: 'focused-retarget-blocked-same-key', selectionKey: nextKey, requestedMode: view });
        if (isInteractiveTarget(target)) return;
        event.preventDefault();
        const proxyVideo = cardEl.querySelector<HTMLVideoElement>('.proxy-render-video');
        if (!proxyVideo) return;
        if (proxyVideo.paused) {
          proxyVideo.muted = false;
          proxyVideo.defaultMuted = false;
          proxyVideo.play().catch(() => {});
        }
        else proxyVideo.pause();
        return;
      }
      const nextItem = filteredMedia.find((item) => assetSelectionKey(item, activeProject) === nextKey);
      if (!nextItem) return;
      event.preventDefault();
      recordPreviewDebug({ stage: 'focused-retarget-resolved-key', selectionKey: nextKey, requestedMode: view });
      focusAsset(nextItem, nextKey);
      setFocused(nextItem);
      setPreviewDetailsOpen(false);
      setInspectorOpen(true);
      inspectorOpenRef.current = true;
      const proxyOpened = runProxyFocusTransition(nextKey, 'retarget');
      if (!proxyOpened) {
        recordPreviewDebug({ stage: 'focused-retarget-openPreview-fallback-blocked', selectionKey: nextKey, requestedMode: view });
        scheduleFocusedRetargetRetry(nextItem, nextKey);
        return;
      }
      recordPreviewDebug({ stage: 'focused-tap-retarget-dispatched', selectionKey: nextKey, requestedMode: view });
      recordPreviewDebug({ stage: 'focused-retarget-dispatched', selectionKey: nextKey, requestedMode: view });
    };
    proxyRoot.addEventListener('pointerdown', handleProxyPointerDown, true);
    return () => proxyRoot.removeEventListener('pointerdown', handleProxyPointerDown, true);
  }, [activeAssetKey, activeProject, assetSelectionKey, closeDrawer, filteredMedia, focusAsset, focusRelative, gridCinematicMode, inspectorOpen, runProxyFocusTransition, scheduleFocusedRetargetRetry, view]);

  useEffect(() => () => {
    resetFocusPresentationToIdle();
  }, [resetFocusPresentationToIdle]);

  useEffect(() => {
    if (focusPresentationState.mode === 'idle') return;
    if (!inspectorOpen) {
      resetFocusPresentationToIdle();
      return;
    }
    if (focusPresentationState.mode !== 'world-focus') return;
    const keyMismatch = !activeAssetKey || focusPresentationState.key !== activeAssetKey;
    if (view === 'grid' && !keyMismatch) return;
    const fallbackKey = activeAssetKey || focusPresentationState.key;
    moveFocusPresentationToFallbackOrIdle(fallbackKey, keyMismatch ? 'key-mismatch' : 'presentation-invalidated');
  }, [activeAssetKey, focusPresentationState, inspectorOpen, moveFocusPresentationToFallbackOrIdle, resetFocusPresentationToIdle, view]);

  const toAssetRef = useCallback((item: MediaItem): AssetRef | null => {
    const relativePath = String(item.relative_path || '').trim();
    if (!relativePath) return null;
    const projectName = String(item.project_name || item.project || activeProject?.name || '').trim();
    if (!projectName) return null;
    const sourceName = String(item.project_source || item.source || activeProject?.source || '').trim();
    return {
      relative_path: relativePath,
      project: projectName,
      source: sourceName || null,
    };
  }, [activeProject]);

  const resolveItemsForSelection = useCallback((selectionKeys: string[]): MediaItem[] => {
    const resolved = selectionKeys
      .map((key) => itemsBySelectionKey.get(key))
      .filter((item): item is MediaItem => Boolean(item));
    if (resolved.length) return resolved;
    return selectionKeys.map((key) => {
      const [sourceName, projectName, ...rest] = key.split('::');
      return {
        relative_path: rest.join('::'),
        project_name: projectName || activeProject?.name,
        project_source: sourceName || activeProject?.source || null,
      };
    });
  }, [activeProject, itemsBySelectionKey]);

  const resolveSelectionKeysForItems = useCallback((items: MediaItem[]): string[] => {
    return items
      .map((item) => assetSelectionKey(item, activeProject))
      .filter(Boolean);
  }, [activeProject, assetSelectionKey]);

  const selectedKeysOrdered = useMemo(() => {
    const ordered = selectedOrder.filter((value) => selected.has(value));
    const extras = Array.from(selected).filter((value) => !ordered.includes(value));
    return [...ordered, ...extras];
  }, [selected, selectedOrder]);

  const selectionItems = useMemo(
    () => resolveItemsForSelection(selectedKeysOrdered),
    [resolveItemsForSelection, selectedKeysOrdered],
  );
  const selectedVideoItems = useMemo(
    () => selectionItems.filter((item) => guessKind(item) === 'video'),
    [selectionItems],
  );

  useEffect(() => {
    if (!activeAssetKey) return;
    if (itemsBySelectionKey.has(activeAssetKey)) return;
    setActiveAssetKey('');
    commitPreviewActivationKey('');
    if (!inspectorOpen) {
      setFocused(null);
    }
  }, [activeAssetKey, commitPreviewActivationKey, inspectorOpen, itemsBySelectionKey]);

  // ---------------------------------------------------------------------------
  // Command/action authority seam.
  // ---------------------------------------------------------------------------
  const {
    handleComposeCompletion,
    composeMediaCommand,
    uploadMediaCommand,
    uploadMediaBatchCommand,
    sendToProgramMonitorCommand,
    pushToObsCommand,
    resolveMediaCommand,
    performDeleteMediaSelection,
    moveMediaSelection,
    tagMediaSelection,
    tagSingleMediaItem,
  } = useExplorerCommands({
    api,
    addToast,
    activeProject,
    mediaScope,
    focused,
    assetSelectionKey,
    loadAllMedia,
    loadMedia,
    refreshLibrarySnapshot,
    refreshMediaForScope,
    resolveItemsForSelection,
    resolveSelectionKeysForItems,
    toAssetRef,
    setSelected,
    setFocused,
    setInspectorOpen,
    setDeleteSubmitting,
  });

  // ---------------------------------------------------------------------------
  // Pending compose integration lane.
  // ---------------------------------------------------------------------------
  const {
    pendingComposeItems,
    registerAcceptedJob,
    removePendingJob,
  } = usePendingComposeJobs({
    pollIntervalMs: 2000,
    fetchJson: fetchComposeJobJson,
    mediaItems: media,
    onCompletedRefreshScope: handleComposeCompletion,
  });

  useEffect(() => {
    const previous = pendingStatusSnapshotRef.current;
    const next = new Map<string, PendingComposeItem['status']>();
    pendingComposeItems.forEach((item) => {
      next.set(item.jobId, item.status);
      const previousStatus = previous.get(item.jobId);
      if (item.status === 'finalizing' && previousStatus && previousStatus !== 'finalizing') {
        addToast('good', 'Compose', 'Compose completed');
      }
      if (item.status === 'failed' && previousStatus && previousStatus !== 'failed') {
        addToast('bad', 'Compose', 'Compose failed');
      }
    });
    pendingStatusSnapshotRef.current = next;
  }, [addToast, pendingComposeItems]);

  const visiblePendingComposeItems = useMemo(() => {
    const relevant = pendingComposeItems.filter((item) => {
      if (mediaScope === 'all') return true;
      if (!activeProject) return false;
      return item.project === activeProject.name
        && (item.source || 'primary') === (activeProject.source || 'primary');
    });
    return sortPendingComposeItemsForDisplay(relevant);
  }, [activeProject, mediaScope, pendingComposeItems]);

  const pendingEntries = useMemo<PendingRenderedEntry[]>(() => visiblePendingComposeItems.map((pendingItem) => ({
    kind: 'pending' as const,
    pendingItem,
  })), [visiblePendingComposeItems]);

  const assetEntries = useMemo<AssetRenderedEntry[]>(() => filteredMedia.map((item) => ({
      kind: 'asset' as const,
      item,
    })), [filteredMedia]);

  const renderedMediaEntries = useMemo<RenderedMediaEntry[]>(() => ([
    ...pendingEntries,
    ...assetEntries,
  ]), [assetEntries, pendingEntries]);

  useEffect(() => {
    if (!inspectorOpen || !activeAssetKey) return;
    if (focusPresentationState.mode !== 'world-focus' || focusPresentationState.key !== activeAssetKey) return;
    const rafId = scheduleExplorerRaf('raf-lane-measurement', () => {
      if (focusPresentationStateRef.current.mode !== 'world-focus') {
        recordPreviewDebug({ stage: 'focus-world-stage-idle-measure-blocked', selectionKey: activeAssetKey, requestedMode: view, finalMode: 'idle' });
        return;
      }
      const next = computeFocusWorldTransform(activeAssetKey, { continueFromCurrent: true });
      if (!next.transform) {
        moveFocusPresentationToFallbackOrIdle(activeAssetKey, next.reason ?? 'unsafe-transform');
        return;
      }
      setFocusWorldTransform(next.transform);
    });
    return () => cancelExplorerRaf(rafId);
  }, [activeAssetKey, computeFocusWorldTransform, focusPresentationState, gridColumnCount, inspectorOpen, filteredMedia.length, moveFocusPresentationToFallbackOrIdle, pendingEntries.length, recordPreviewDebug, view]);

  useEffect(() => {
    if (!pendingComposeItems.length) return;
    pendingComposeItems.forEach((item) => {
      if (item.status !== 'finalizing') return;
      if (!item.completedPath) return;
      const visible = media.some((mediaItem) => {
        const relativePath = String(mediaItem.relative_path || '').trim();
        if (relativePath !== item.completedPath) return false;
        const mediaProject = String(mediaItem.project_name || mediaItem.project || activeProject?.name || '').trim();
        const mediaSource = String(mediaItem.project_source || mediaItem.source || activeProject?.source || '').trim() || 'primary';
        return mediaProject === item.project && mediaSource === (item.source || 'primary');
      });
      if (visible) {
        removePendingJob(item.jobId);
      }
    });
  }, [activeProject, media, pendingComposeItems, removePendingJob]);

  const handleUpload = useCallback(async () => {
    const project = activeProject;
    if (!project) {
      addToast('warn', 'Upload', 'Select a project first');
      return;
    }
    const file = uploadInputRef.current?.files?.[0];
    if (!file) {
      addToast('warn', 'Upload', 'Pick a file first');
      return;
    }

    setUploadStatus('Uploading…');
    const result = await uploadMediaCommand({
      project,
      uploadUrl: buildUploadUrl(project),
      file,
      title: 'Upload',
    });
    if (result.ok) setUploadStatus(result.message);
    else setUploadStatus(`Upload failed: ${result.message}`);
  }, [activeProject, addToast, buildUploadUrl, uploadMediaCommand]);

  const handleDropUpload = useCallback(
    async (files: FileList) => {
      const project = activeProject;
      if (!project) {
        addToast('warn', 'Upload', 'Select a project first');
        return;
      }
      if (!files.length) return;
      setUploadStatus('Uploading…');
      await uploadMediaBatchCommand({
        project,
        uploadUrl: buildUploadUrl(project),
        files: Array.from(files),
        title: 'Upload',
      });
      setUploadStatus('Upload stored.');
    },
    [activeProject, addToast, buildUploadUrl, uploadMediaBatchCommand],
  );

  const deleteMediaSelection = useCallback((selectionKeys: string[]) => {
    const items = resolveItemsForSelection(selectionKeys);
    if (!items.length) {
      addToast('warn', 'Delete', 'Select one or more clips');
      return;
    }
    const refs = items
      .map((item) => toAssetRef(item))
      .filter((item): item is AssetRef => Boolean(item));
    if (!refs.length) {
      addToast('warn', 'Delete', 'Unable to resolve selected media paths');
      return;
    }
    setPendingDeleteSelectionKeys(resolveSelectionKeysForItems(items));
    setDeleteModalOpen(true);
  }, [addToast, resolveItemsForSelection, resolveSelectionKeysForItems, toAssetRef]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteSubmitting) return;
    const selectionKeys = pendingDeleteSelectionKeys.slice();
    if (!selectionKeys.length) {
      setDeleteModalOpen(false);
      return;
    }
    setDeleteModalOpen(false);
    setPendingDeleteSelectionKeys([]);
    await performDeleteMediaSelection(selectionKeys);
  }, [deleteSubmitting, pendingDeleteSelectionKeys, performDeleteMediaSelection]);

  const handleDeleteCancel = useCallback(() => {
    if (deleteSubmitting) return;
    setDeleteModalOpen(false);
    setPendingDeleteSelectionKeys([]);
  }, [deleteSubmitting]);

  const handleBulkTag = useCallback(async () => {
    if (!selected.size) {
      addToast('warn', 'Tags', 'Select one or more clips first');
      return;
    }
    const addInput = window.prompt('Tags to add (comma separated):', '');
    if (addInput == null) return;
    const removeInput = window.prompt('Tags to remove (comma separated):', '');
    if (removeInput == null) return;
    const addTags = addInput.split(',').map((tag) => tag.trim()).filter(Boolean);
    const removeTags = removeInput.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!addTags.length && !removeTags.length) {
      addToast('warn', 'Tags', 'Nothing to add or remove');
      return;
    }
    await tagMediaSelection(selectionItems, addTags, removeTags);
  }, [addToast, selected, selectionItems, tagMediaSelection]);

  const handleComposeSelected = useCallback(async () => {
    if (!selected.size) {
      addToast('warn', 'Compose', 'Select one or more clips');
      return;
    }
    if (!selectedVideoItems.length) {
      addToast('warn', 'Compose', 'Select one or more video clips');
      return;
    }
    if (!projects.length) {
      addToast('warn', 'Compose', 'No projects available for compose output.');
      return;
    }
    const preferredProject = defaultComposeProject(projects);
    setComposeOutputName(buildComposeTimestampName());
    setComposeOutputProject(preferredProject?.name || 'P5-SHARED-Exported-Media');
    setComposeSubmitting(false);
    setComposeModalOpen(true);
  }, [addToast, projects, selected, selectedVideoItems]);

  const handleComposeConfirm = useCallback(async () => {
    if (composeSubmitting) {
      return;
    }
    if (!selectedVideoItems.length) {
      addToast('warn', 'Compose', 'Select one or more video clips');
      return;
    }
    const outputName = composeOutputName.trim() || buildComposeTimestampName();
    const targetProjectName = composeOutputProject.trim() || defaultComposeProject(projects)?.name || '';
    if (!targetProjectName) {
      addToast('warn', 'Compose', 'Choose an output project.');
      return;
    }
    const targetProject = projects.find((entry) => entry.name === targetProjectName) || null;
    if (!targetProject) {
      addToast('warn', 'Compose', 'Selected output project is unavailable.');
      return;
    }
    const refs = selectedVideoItems
      .map((item) => toAssetRef(item))
      .filter((item): item is AssetRef => Boolean(item));
    if (!refs.length) {
      addToast('warn', 'Compose', 'Unable to resolve selected media paths');
      return;
    }
    setComposeSubmitting(true);
    const response = await composeMediaCommand({
      assets: refs,
      outputProject: targetProject,
      outputName,
      title: 'Compose',
    });
    if (response) {
      registerAcceptedJob({ envelope: response as ComposeJobEnvelope });
      setComposeModalOpen(false);
    }
    setComposeSubmitting(false);
  }, [addToast, composeMediaCommand, composeOutputName, composeOutputProject, composeSubmitting, projects, registerAcceptedJob, selectedVideoItems, toAssetRef]);

  const handleResolve = useCallback(async () => {
    const project = activeProject;
    if (!project) {
      addToast('warn', 'Resolve', 'Select a project first');
      return;
    }
    if (!selected.size) {
      addToast('warn', 'Resolve', 'Select one or more clips');
      return;
    }

    let projectValue = project.name;
    if (resolveProjectMode === '__new__') {
      projectValue = '__new__';
    } else if (resolveProjectMode === '__select__') {
      projectValue = '__select__';
    } else if (resolveProjectName.trim()) {
      projectValue = resolveProjectName.trim();
    }

    const payload = {
      project: projectValue,
      new_project_name: resolveProjectMode === '__new__' ? resolveNewName.trim() || null : null,
      media_rel_paths: selectionItems.map((item) => item.relative_path).filter(Boolean),
      mode: resolveMode || 'import',
    };

    await resolveMediaCommand({
      project: payload.project,
      newProjectName: payload.new_project_name,
      mode: payload.mode,
      mediaRelativePaths: payload.media_rel_paths,
      source: project.source || undefined,
      title: 'Resolve',
    });
  }, [activeProject, addToast, resolveMediaCommand, resolveMode, resolveNewName, resolveProjectMode, resolveProjectName, selected, selectionItems]);


  const handleFocusedTag = useCallback(async () => {
    if (!focused) {
      addToast('warn', 'Tag', 'Open a preview first');
      return;
    }
    const addInput = window.prompt('Tags to add (comma separated):', '');
    if (addInput == null) return;
    const removeInput = window.prompt('Tags to remove (comma separated):', '');
    if (removeInput == null) return;
    const addTags = addInput.split(',').map((tag) => tag.trim()).filter(Boolean);
    const removeTags = removeInput.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!addTags.length && !removeTags.length) {
      addToast('warn', 'Tag', 'Nothing to add or remove');
      return;
    }
    await tagSingleMediaItem(focused, addTags, removeTags, 'Tag');
  }, [addToast, focused, tagSingleMediaItem]);

  const handleFocusedResolve = useCallback(async () => {
    if (!focused) {
      addToast('warn', 'Resolve', 'Open a preview first');
      return;
    }
    const projectName = activeProject?.name || focused.project_name;
    if (!projectName) {
      addToast('warn', 'Resolve', 'Select a project first');
      return;
    }
    const sourceName = activeProject?.source || focused.project_source || undefined;
    let projectValue = projectName;
    if (resolveProjectMode === '__new__') projectValue = '__new__';
    else if (resolveProjectMode === '__select__') projectValue = '__select__';
    else if (resolveProjectName.trim()) projectValue = resolveProjectName.trim();
    await resolveMediaCommand({
      project: projectValue,
      newProjectName: resolveProjectMode === '__new__' ? resolveNewName.trim() || null : null,
      mediaRelativePaths: [focused.relative_path].filter((value): value is string => Boolean(value)),
      mode: resolveMode || 'import',
      source: sourceName,
      title: 'Resolve',
    });
  }, [activeProject?.name, activeProject?.source, addToast, focused, resolveMediaCommand, resolveMode, resolveNewName, resolveProjectMode, resolveProjectName]);

  const handleFocusedProgramMonitor = useCallback(async () => {
    if (!focused) {
      addToast('warn', 'Program Monitor', 'Open a preview first');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const absoluteStream = toAbsoluteUrl(resolveAssetUrl(focused.stream_url), origin);
    const monitorUrl = new URL('/program-monitor/index.html', origin).toString();
    await sendToProgramMonitorCommand({
      streamUrl: absoluteStream,
      monitorUrl,
      source: 'explorer-overlay',
      title: 'Program Monitor',
    });
  }, [addToast, focused, resolveAssetUrl, sendToProgramMonitorCommand]);

  const handleFocusedObs = useCallback(async () => {
    if (!focused) {
      addToast('warn', 'OBS', 'Open a preview first');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const assetUrl = toAbsoluteUrl(resolveAssetUrl(focused.stream_url), origin);
    const fit = previewObsMode === 'fit' ? 'contain' : (previewObsMode === 'fill' ? 'fill' : 'cover');
    await pushToObsCommand({
      assetUrl,
      fit,
      slot: Number.parseInt(previewObsSlot, 10) || 1,
      ensureExclusiveScene: previewObsExclusive,
      title: 'OBS',
    });
  }, [addToast, focused, previewObsExclusive, previewObsMode, previewObsSlot, pushToObsCommand, resolveAssetUrl]);

  const handleCopyStream = useCallback(async (item: MediaItem) => {
    if (!item.stream_url) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = toAbsoluteUrl(resolveAssetUrl(item.stream_url), origin);
    const ok = await copyTextWithFallback(url);
    if (ok) {
      addToast('good', 'Copied', 'Stream URL copied to clipboard');
    } else {
      addToast('warn', 'Clipboard', 'Copy failed — please copy manually.');
    }
  }, [addToast, resolveAssetUrl]);

  const handleCopySelectedUrls = useCallback(async (items: MediaItem[]) => {
    if (!items.length) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const urls = items
      .map((item) => toAbsoluteUrl(resolveAssetUrl(item.stream_url), origin))
      .filter(Boolean);
    if (!urls.length) return;
    const ok = await copyTextWithFallback(urls.join('\n'));
    if (ok) {
      addToast('good', 'Copied', `Copied ${urls.length} stream URL(s).`);
    } else {
      addToast('warn', 'Clipboard', 'Copy failed — please copy manually.');
    }
  }, [addToast, resolveAssetUrl]);

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      addToast('good', 'Copied', 'Copied');
    } catch {
      addToast('warn', 'Clipboard', 'Copy unavailable');
    }
  }, [addToast]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const openContextMenu = useCallback((x: number, y: number, items: MediaItem[]) => {
    if (!items.length) return;
    setContextMenu({ kind: 'media_asset', x, y, items });
  }, []);

  const getMenuPoint = (event: React.MouseEvent) => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    return {
      x: event.clientX || rect.right,
      y: event.clientY || rect.top,
    };
  };

  const openSourceContextMenu = useCallback((event: React.MouseEvent, source: SourceControlRecord) => {
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = getMenuPoint(event);
    setContextMenu({ kind: 'source', x, y, source });
  }, [setContextMenu]);

  const openRuntimeContextMenu = useCallback((event: React.MouseEvent, node: NodeControlRecord) => {
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = getMenuPoint(event);
    setContextMenu({ kind: 'runtime', x, y, node });
  }, [setContextMenu]);

  const openLiveSessionContextMenu = useCallback((event: React.MouseEvent, session: LiveSession) => {
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = getMenuPoint(event);
    setContextMenu({ kind: 'live_session', x, y, session });
  }, [setContextMenu]);

  const openIngestClaimContextMenu = useCallback((event: React.MouseEvent, claim: IngestClaimRecord) => {
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = getMenuPoint(event);
    setContextMenu({ kind: 'ingest_claim', x, y, claim });
  }, [setContextMenu]);

  const openDevice = useCallback((nodeId: string) => {
    window.location.href = getDeviceUrl(nodeId);
  }, []);

  const heartbeatNodeNow = useCallback(async (nodeId: string) => {
    try {
      await api.heartbeatNode(nodeId);
      addToast('good', 'Runtime', 'Heartbeat sent');
      await reloadSourceControl();
    } catch (error) {
      addToast('bad', 'Runtime', error instanceof Error ? error.message : 'Heartbeat failed');
    }
  }, [api, addToast, reloadSourceControl]);

  const openPayloadDetails = useCallback((title: string, subtitle: string | undefined, payload: unknown) => {
    setDetailsModal({ title, subtitle, payload });
    setContextMenu(null);
  }, [setContextMenu]);

  const runContextAction = useCallback((action: () => void | Promise<void>) => {
    setContextMenu(null);
    void action();
  }, [setContextMenu]);


  const persistHiddenIngestClaimIds = useCallback((next: Set<string>) => {
    setHiddenIngestClaimIds(new Set(next));
    if (typeof window === 'undefined') return;
    if (!next.size) {
      window.localStorage.removeItem(HIDDEN_INGEST_CLAIMS_KEY);
      return;
    }
    window.localStorage.setItem(HIDDEN_INGEST_CLAIMS_KEY, JSON.stringify(Array.from(next)));
  }, []);

  const hideIngestClaim = useCallback((claimId: string) => {
    const next = new Set(hiddenIngestClaimIds);
    next.add(claimId);
    persistHiddenIngestClaimIds(next);
  }, [hiddenIngestClaimIds, persistHiddenIngestClaimIds]);

  const hideAllTestPayloadClaims = useCallback(() => {
    const next = new Set(hiddenIngestClaimIds);
    for (const claim of ingestClaims) {
      if (!isTestPayloadClaim(claim)) continue;
      next.add(claim.claim_id);
    }
    persistHiddenIngestClaimIds(next);
  }, [hiddenIngestClaimIds, ingestClaims, persistHiddenIngestClaimIds]);

  const resetHiddenIngestClaims = useCallback(() => {
    persistHiddenIngestClaimIds(new Set());
  }, [persistHiddenIngestClaimIds]);

  const getContextActions = useCallback((items: MediaItem[]) => {
    const count = items.length;
    if (!count) return [];
    const single = count === 1;
    const item = items[0];
    const actions: Array<{ id: string; label: string; handler: () => void }> = [];

    if (single) {
      actions.push({ id: 'preview', label: 'Open preview', handler: () => openPreview(item) });
      actions.push({ id: 'copy-stream', label: 'Copy stream URL', handler: () => void handleCopyStream(item) });
      actions.push({
        id: 'download',
        label: 'Download',
        handler: () => {
          const url = resolveAssetUrl(item.download_url || item.stream_url);
          if (url) window.open(url, '_blank');
        },
      });
    } else {
      actions.push({
        id: 'copy-streams',
        label: 'Copy stream URLs',
        handler: () => void handleCopySelectedUrls(items),
      });
    }

    actions.push({
      id: 'move',
      label: 'Move to project…',
      handler: () => {
        setActionsOpen(true);
      },
    });
    actions.push({
      id: 'delete',
      label: `Delete ${count} item${count > 1 ? 's' : ''}`,
      handler: () => deleteMediaSelection(resolveSelectionKeysForItems(items)),
    });
    return actions;
  }, [deleteMediaSelection, handleCopySelectedUrls, handleCopyStream, openPreview, resolveAssetUrl, resolveSelectionKeysForItems]);

  const {
    assetDragActive,
    buildAssetPointerHandlers,
    clearPendingLongPress,
    dragPathsRef,
    dragging,
    stopAssetDrag,
  } = useAssetInteractions({
    activeProject,
    assetSelectionKey,
    closeDrawer,
    inNoPreviewZone,
    inspectorOpen,
    itemsBySelectionKey,
    moveMediaSelection,
    onRevealTopbar: () => topbarIntentRef.current?.setOpen(true),
    openContextMenu,
    openPreview,
    focusAsset,
    projects,
    selected,
    selectedKeysOrdered,
    onTapFeedback: (point) => {
      setTapOverlayPoint(point);
      setTapOverlayTrigger((prev) => prev + 1);
    },
    onHoldFeedback: (point, active, progress, completed) => {
      if (point) setHoldOverlayPoint(point);
      setHoldOverlayActive(active);
      setHoldOverlayProgress(progress);
      if (completed) {
        setHoldOverlayCompleteBeat((prev) => prev + 1);
      }
    },
    onTapStage: (stage, itemKey) => {
      if (stage === 'second') {
        setActiveAssetKey(itemKey);
        commitPreviewActivationKey(itemKey);
        setReinforcedActiveKey(itemKey);
        return;
      }
      setActiveAssetKey(itemKey);
      commitPreviewActivationKey(itemKey);
      playGridThumbForSelectionKey(itemKey);
      setReinforcedActiveKey('');
    },
    onHoldEmphasis: (itemKey, active) => {
      if (!active || !itemKey) {
        setHoldEmphasisKey('');
        return;
      }
      setHoldEmphasisKey(itemKey);
      commitPreviewActivationKey(itemKey);
    },
    gridCinematicInteractionOwned: view === 'grid' && inspectorOpen && gridCinematicMode !== 'grid-rest',
  });

  useEffect(() => {
    if (!reinforcedActiveKey) return;
    const timeoutId = window.setTimeout(() => {
      setReinforcedActiveKey((prev) => (prev === reinforcedActiveKey ? '' : prev));
    }, 680);
    return () => window.clearTimeout(timeoutId);
  }, [reinforcedActiveKey]);

  const handlePreviewSelected = useCallback(() => {
    const first = selectionItems[0];
    const item = first || null;
    if (item) openPreview(item);
  }, [openPreview, selectionItems]);

  const pinTopbarTemporarily = useCallback((ms = 900) => {
    if (topbarPinTimeoutRef.current) {
      window.clearTimeout(topbarPinTimeoutRef.current);
    }
    topbarIntentRef.current?.setPinned(true);
    topbarPinTimeoutRef.current = window.setTimeout(() => {
      topbarIntentRef.current?.setPinned(false);
      topbarPinTimeoutRef.current = null;
    }, ms);
  }, []);

  const bindGridSurface = useCallback((node: HTMLDivElement | null) => {
    gridRef.current = node;
    setGridSurfaceEl(node);
  }, []);

  const handleTypeSelect = useCallback(
    (value: MediaTypeFilter) => (event: React.MouseEvent<HTMLButtonElement>) => {
      setTypeFilter(value);
      const details = event.currentTarget.closest('details');
      if (details) {
        details.removeAttribute('open');
      }
    },
    [],
  );

  const handleSortSelect = useCallback(
    (value: SortKey) => (event: React.MouseEvent<HTMLButtonElement>) => {
      const select = sortSelectRef.current;
      if (select) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        setSortKey(value);
      }
      const details = event.currentTarget.closest('details');
      if (details) {
        details.removeAttribute('open');
      }
    },
    [],
  );

  const handleProjectDrop = useCallback(async (project: Project) => {
    if (!dragging) return;
    stopAssetDrag();
    if (!dragPathsRef.current.length) return;
    await moveMediaSelection(dragPathsRef.current, project);
  }, [dragPathsRef, dragging, moveMediaSelection, stopAssetDrag]);

  const pickUpload = useCallback(() => {
    const input = uploadInputRef.current;
    if (!input) return;
    if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
      (input as HTMLInputElement & { showPicker: () => void }).showPicker();
    } else {
      input.click();
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setResolvedApiBase(inferApiBaseUrl(apiBaseUrl, window.location));
  }, [apiBaseUrl]);

  useEffect(() => {
    updateSidebarMode();
    const mediaQuery = window.matchMedia('(max-width: 860px)');
    mediaQuery.addEventListener('change', updateSidebarMode);
    return () => {
      mediaQuery.removeEventListener('change', updateSidebarMode);
    };
  }, [updateSidebarMode]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.actions-panel') || target.closest('.actions-toggle')) return;
      setActionsOpen(false);
    };
    if (!actionsOpen) return;
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [actionsOpen]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleOutside = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const padding = 12;
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - padding;
    const maxY = window.innerHeight - rect.height - padding;
    const left = Math.max(padding, Math.min(contextMenu.x, maxX));
    const top = Math.max(padding, Math.min(contextMenu.y, maxY));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [contextMenu]);

  const {
    revealTopbar,
    setTopbarHidden,
    suppressAutoToggle,
    topbarHidden,
  } = useTopbarScrollState({
    disabled: sidebarOpen
      || composeModalOpen
      || deleteModalOpen
      || actionsOpen
      || topbarHasOpenDropdown
      || topbarFocusWithin,
    scrollEl: mediaScrollViewportEl,
    topbarMeasuredHeight,
  });
  topbarHiddenRef.current = topbarHidden;
  inspectorOpenRef.current = inspectorOpen;
  focusPresentationStateRef.current = focusPresentationState;

  useEffect(() => {
    const topbarEl = topbarRef.current;
    if (!topbarEl) return;
    const motion = createTopbarMotion(topbarEl);
    topbarMotionRef.current = motion;
    if (topbarHiddenRef.current) motion.hide();
    else motion.show();
    return () => {
      motion.destroy();
      topbarMotionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const motion = topbarMotionRef.current;
    if (!motion) return;
    if (topbarHidden) motion.hide();
    else motion.show();
  }, [topbarHidden]);

  useEffect(() => {
    if (!topbarHidden) return;
    topbarMotionRef.current?.refresh();
  }, [topbarHidden, topbarMeasuredHeight]);

  useEffect(() => {
    const scroller = mediaScrollViewportRef.current;
    if (!scroller) return;
    const snapBand = createTopbarSnapBand({
      scroller,
      getTopbarOpen: () => !topbarHiddenRef.current,
      getTopbarClearance: () => topbarRef.current?.offsetHeight ?? topbarMeasuredHeight,
      thresholdPx: 10,
      minVelocityPxPerFrame: 1.25,
    });
    snapBandRef.current = snapBand;

    const onScroll = () => snapBand.notifyScroll();
    const onPointerDown = () => snapBand.notifyPointerDown();
    const onPointerUp = () => snapBand.notifyPointerUp();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      snapBand.destroy();
      snapBandRef.current = null;
    };
  }, [topbarMeasuredHeight]);

  useEffect(() => {
    const drawerEl = document.querySelector<HTMLElement>('[data-inspector-drawer="true"]');
    const backdropEl = inspectorBackdropRef.current;
    if (!drawerEl || !backdropEl) return;
    const modeQuery = window.matchMedia('(max-width: 860px)');
    const controller = createDrawerMotion(drawerEl, backdropEl, {
      getMode: () => (modeQuery.matches ? 'sheet' : 'side'),
      getSuppressOpen: () => focusPresentationStateRef.current.mode === 'world-focus',
    });
    drawerMotionRef.current = controller;
    const shouldOpenDrawer = inspectorOpenRef.current && focusPresentationStateRef.current.mode !== 'world-focus';
    if (shouldOpenDrawer) controller.open();
    else controller.setClosedState();

    const handleResize = () => {
      controller.syncLayoutMode();
      const shouldOpenDrawer = inspectorOpenRef.current && focusPresentationStateRef.current.mode !== 'world-focus';
      if (shouldOpenDrawer) controller.open();
      else controller.setClosedState();
    };
    const handleModeChange = () => handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    modeQuery.addEventListener('change', handleModeChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      modeQuery.removeEventListener('change', handleModeChange);
      controller.destroy();
      drawerMotionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = drawerMotionRef.current;
    if (!controller) return;
    const shouldOpenDrawer = inspectorOpen && focusPresentationState.mode !== 'world-focus';
    if (shouldOpenDrawer) controller.open();
    else controller.close(() => {
      controller.setClosedState();
    });
  }, [focusPresentationState.mode, inspectorOpen]);

  useEffect(() => {
    const toastMotion = createToastMotion();
    toastMotionRef.current = toastMotion;
    return () => {
      toastMotion.destroy();
      toastMotionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const liveIds = new Set(toasts.map((toast) => toast.id));
    for (const key of Array.from(toastNodeMapRef.current.keys())) {
      if (!liveIds.has(key)) toastNodeMapRef.current.delete(key);
    }
    for (const key of Array.from(toastExitingRef.current.keys())) {
      if (!liveIds.has(key)) toastExitingRef.current.delete(key);
    }
  }, [toasts]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => {
      if (event.clientY <= 56) revealTopbar();
    };
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [dragging, revealTopbar]);

  useEffect(() => {
    if (hasBootstrappedExplorerSession) return;
    hasBootstrappedExplorerSession = true;
    const bootToastId = addToast('good', 'Boot', 'Loading sources + projects…');
    void refreshLibrarySnapshot({ scope: 'all' }).finally(() => {
      beginToastExit(bootToastId);
    });
  }, [addToast, beginToastExit, refreshLibrarySnapshot]);

  useEffect(() => {
    if (activeProject) {
      void loadMedia(activeProject);
    } else {
      setMediaScope('all');
      setMedia(sortMediaByRecent(libraryAssets));
    }
  }, [activeProject, libraryAssets, loadMedia]);

  useEffect(() => {
    if (!libraryError) return;
    addToast('bad', 'Library', libraryError);
    clearSnapshotError();
  }, [addToast, clearSnapshotError, libraryError]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (inspectorOpen) {
          closeDrawer();
          event.preventDefault();
          return;
        }
        if (sidebarOpen) {
          setSidebarOpen(false);
          event.preventDefault();
        }
        if (contextMenu) {
          setContextMenu(null);
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeDrawer, inspectorOpen, sidebarOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua)
      || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (!isIOS || !isCoarsePointer) return;

    const listenerOptions: AddEventListenerOptions = { passive: false };
    const inDensityPinchSurface = (target: EventTarget | null) => (
      (target as HTMLElement | null)?.closest?.('[data-density-pinch-surface="true"]')
    );
    const blockGesture = (event: Event) => {
      if (inDensityPinchSurface(event.target)) return;
      event.preventDefault();
    };
    const blockMultiTouch = (event: TouchEvent) => {
      if (inDensityPinchSurface(event.target)) return;
      if (event.touches.length > 1) event.preventDefault();
    };
    document.addEventListener('gesturestart', blockGesture, listenerOptions);
    document.addEventListener('gesturechange', blockGesture, listenerOptions);
    document.addEventListener('gestureend', blockGesture, listenerOptions);
    document.addEventListener('touchstart', blockMultiTouch, listenerOptions);

    return () => {
      document.removeEventListener('gesturestart', blockGesture);
      document.removeEventListener('gesturechange', blockGesture);
      document.removeEventListener('gestureend', blockGesture);
      document.removeEventListener('touchstart', blockMultiTouch);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const readViewportMeta = () => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta?.getAttribute('content') || '';
    };

    const captureViewportSnapshot = () => {
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualWidth = viewport?.width ?? window.innerWidth;
      const nextHeight = `${Math.max(0, Math.round(visualHeight))}px`;
      root.style.setProperty('--explorer-visual-viewport-height', nextHeight);
      const clientWidth = document.documentElement.clientWidth || 1;
      const scaleLike = Number((window.innerWidth / clientWidth).toFixed(3));
      const snapshot = {
        viewportMeta: readViewportMeta(),
        visualViewportHeight: Number((viewport?.height ?? 0).toFixed(2)),
        visualViewportWidth: Number((viewport?.width ?? 0).toFixed(2)),
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        clientHeight: document.documentElement.clientHeight,
        clientWidth,
        pageScaleLike: Number.isFinite(scaleLike) ? scaleLike : 1,
        cssViewportHeightVar: nextHeight,
      };
      (window as typeof window & {
        __explorerViewportDebug?: { getSnapshot: () => typeof snapshot; lastSnapshot: typeof snapshot };
      }).__explorerViewportDebug = {
        getSnapshot: () => snapshot,
        lastSnapshot: snapshot,
      };
    };

    captureViewportSnapshot();
    window.addEventListener('resize', captureViewportSnapshot);
    window.addEventListener('orientationchange', captureViewportSnapshot);
    viewport?.addEventListener('resize', captureViewportSnapshot);
    viewport?.addEventListener('scroll', captureViewportSnapshot);

    return () => {
      window.removeEventListener('resize', captureViewportSnapshot);
      window.removeEventListener('orientationchange', captureViewportSnapshot);
      viewport?.removeEventListener('resize', captureViewportSnapshot);
      viewport?.removeEventListener('scroll', captureViewportSnapshot);
      root.style.removeProperty('--explorer-visual-viewport-height');
      delete (window as typeof window & { __explorerViewportDebug?: unknown }).__explorerViewportDebug;
    };
  }, []);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    type LoadFailureEmitter = 'asset-grid' | 'asset-list' | 'proxy-render' | 'other';
    type LoadFailureEvent = {
      at: number;
      key: string;
      tag: string;
      url: string;
      className: string;
      emitter: LoadFailureEmitter;
      suppressed: boolean;
      dataset: Record<string, string>;
      targetPath: string;
    };
    type NetworkFailureLane =
      | 'explorer-media'
      | 'next-static'
      | 'next-hmr'
      | 'sourcemap'
      | 'script'
      | 'stylesheet'
      | 'font'
      | 'runtime-error'
      | 'promise-rejection'
      | 'other';
    type NetworkFailureEvent = {
      at: number;
      lane: NetworkFailureLane;
      tag: string;
      url: string;
      message: string;
      source: 'resource-error' | 'runtime-error' | 'promise-rejection';
      inExplorerApp: boolean;
      maybeNextAsset: boolean;
      maybeHotReload: boolean;
      suppressedDefault: boolean;
    };

    const loadFailures = new Map<string, {
      key: string;
      tag: string;
      url: string;
      className: string;
      count: number;
      firstAt: number;
      lastAt: number;
      emitter: LoadFailureEmitter;
      suppressedCount: number;
      lastDataset: Record<string, string>;
      lastTargetPath: string;
    }>();
    const recentEvents: LoadFailureEvent[] = [];
    const MAX_RECENT_EVENTS = 80;
    const networkRecentEvents: NetworkFailureEvent[] = [];
    const MAX_NETWORK_RECENT_EVENTS = 120;
    const networkLaneTotals: Record<NetworkFailureLane, number> = {
      'explorer-media': 0,
      'next-static': 0,
      'next-hmr': 0,
      sourcemap: 0,
      script: 0,
      stylesheet: 0,
      font: 0,
      'runtime-error': 0,
      'promise-rejection': 0,
      other: 0,
    };
    let suppressedMediaErrorCount = 0;

    const classifyEmitter = (target: HTMLElement): LoadFailureEmitter => {
      if (target.closest('.masonry-card.asset')) return 'asset-grid';
      if (target.closest('.list-row.asset')) return 'asset-list';
      if (target.closest('.proxy-render-card,.focus-proxy-root')) return 'proxy-render';
      return 'other';
    };

    const shouldSuppressMediaError = (target: HTMLElement) => {
      if (!target.closest('.app')) return false;
      if (target.closest('.masonry-card.asset .thumb,.list-row.asset .thumb')) return true;
      if (target.closest('.proxy-render-card,.focus-proxy-root')) return true;
      return false;
    };
    const getSourceUrlFromTarget = (target: HTMLElement) => {
      const imgTarget = target as HTMLImageElement;
      return (
        imgTarget.currentSrc
        || target.getAttribute('src')
        || target.getAttribute('href')
        || target.getAttribute('poster')
        || ''
      ).trim();
    };
    const getTargetPath = (target: HTMLElement) => (
      target.closest('[data-select-key]')?.getAttribute('data-select-key')
      || target.closest('.masonry-card.asset,.list-row.asset')?.getAttribute('data-relative')
      || target.getAttribute('data-relative')
      || target.getAttribute('data-thumb-key')
      || ''
    );
    const getTargetDatasetSnapshot = (target: HTMLElement): Record<string, string> => {
      const keep = new Set([
        'thumbUrl',
        'thumbFallback',
        'thumbJobKey',
        'thumbState',
        'thumbLoadedKey',
        'streamUrl',
        'relative',
        'selectKey',
      ]);
      const snapshot: Record<string, string> = {};
      const entries = Object.entries(target.dataset || {});
      entries.forEach(([key, value]) => {
        if (!keep.has(key)) return;
        if (!value) return;
        snapshot[key] = value;
      });
      return snapshot;
    };
    const pushRecentEvent = (entry: LoadFailureEvent) => {
      recentEvents.push(entry);
      if (recentEvents.length > MAX_RECENT_EVENTS) {
        recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS);
      }
    };
    const classifyNetworkLane = ({
      url,
      tag,
      rel,
      inExplorerApp,
      message,
      source,
    }: {
      url: string;
      tag: string;
      rel?: string;
      inExplorerApp: boolean;
      message: string;
      source: 'resource-error' | 'runtime-error' | 'promise-rejection';
    }): NetworkFailureLane => {
      const normalizedUrl = url.toLowerCase();
      const normalizedTag = tag.toUpperCase();
      const normalizedRel = String(rel || '').toLowerCase();
      const normalizedMessage = message.toLowerCase();
      if (
        normalizedUrl.includes('/_next/webpack-hmr')
        || normalizedUrl.includes('hot-update')
        || normalizedMessage.includes('hot-update')
        || normalizedMessage.includes('fast refresh')
        || normalizedMessage.includes('webpack-hmr')
      ) return 'next-hmr';
      if (normalizedUrl.includes('/_next/')) return 'next-static';
      if (normalizedUrl.endsWith('.map') || normalizedMessage.includes('source map')) return 'sourcemap';
      if (
        normalizedUrl.endsWith('.woff')
        || normalizedUrl.endsWith('.woff2')
        || normalizedUrl.endsWith('.ttf')
        || normalizedUrl.endsWith('.otf')
      ) return 'font';
      if (normalizedTag === 'SCRIPT') return 'script';
      if (normalizedTag === 'LINK' || normalizedUrl.endsWith('.css') || normalizedRel === 'stylesheet') return 'stylesheet';
      if (source === 'runtime-error') return 'runtime-error';
      if (source === 'promise-rejection') return 'promise-rejection';
      if (
        inExplorerApp
        && (normalizedTag === 'IMG' || normalizedTag === 'VIDEO' || normalizedTag === 'SOURCE')
      ) return 'explorer-media';
      return 'other';
    };
    const pushNetworkRecentEvent = (event: NetworkFailureEvent) => {
      networkRecentEvents.push(event);
      if (networkRecentEvents.length > MAX_NETWORK_RECENT_EVENTS) {
        networkRecentEvents.splice(0, networkRecentEvents.length - MAX_NETWORK_RECENT_EVENTS);
      }
      networkLaneTotals[event.lane] += 1;
    };
    const shouldSuppressGenericLoadFailedRejection = ({
      lane,
      message,
      url,
      inExplorerApp,
      reasonStack,
    }: {
      lane: NetworkFailureLane;
      message: string;
      url: string;
      inExplorerApp: boolean;
      reasonStack: string;
    }) => {
      if (lane !== 'promise-rejection') return false;
      if (inExplorerApp) return false;
      if (message !== 'Load failed') return false;
      if (url.trim().length > 0) return false;
      if (reasonStack.trim().length > 0) return false;
      return true;
    };
    const suppressUnhandledRejectionDefault = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      (event as PromiseRejectionEvent & { returnValue?: boolean }).returnValue = false;
    };

    const toSnapshotRows = () => Array.from(loadFailures.values())
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, 80)
      .map((entry) => ({ ...entry }));

    const publishSnapshot = () => {
      const snapshot = {
        totalUnique: loadFailures.size,
        totalEvents: Array.from(loadFailures.values()).reduce((acc, entry) => acc + entry.count, 0),
        suppressedMediaErrorCount,
        emitterTotals: Array.from(loadFailures.values()).reduce<Record<LoadFailureEmitter, number>>((acc, entry) => {
          acc[entry.emitter] += entry.count;
          return acc;
        }, { 'asset-grid': 0, 'asset-list': 0, 'proxy-render': 0, other: 0 }),
        rows: toSnapshotRows(),
        recentEvents: recentEvents.map((event) => ({ ...event })),
      };
      const networkSnapshot = {
        totalEvents: networkRecentEvents.length,
        laneTotals: { ...networkLaneTotals },
        recentEvents: networkRecentEvents.map((event) => ({ ...event })),
      };
      (window as typeof window & {
        __explorerLoadFailureDebug?: { getSnapshot: () => typeof snapshot; lastSnapshot: typeof snapshot };
        __explorerNetworkFailureDebug?: {
          getSnapshot: () => typeof networkSnapshot;
          lastSnapshot: typeof networkSnapshot;
        };
      }).__explorerLoadFailureDebug = {
        getSnapshot: () => snapshot,
        lastSnapshot: snapshot,
      };
      (window as typeof window & {
        __explorerNetworkFailureDebug?: {
          getSnapshot: () => typeof networkSnapshot;
          lastSnapshot: typeof networkSnapshot;
        };
      }).__explorerNetworkFailureDebug = {
        getSnapshot: () => networkSnapshot,
        lastSnapshot: networkSnapshot,
      };
    };

    const onResourceError = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName || 'UNKNOWN';
      const sourceUrl = getSourceUrlFromTarget(target);
      const className = String(target.className || '');
      const emitter = classifyEmitter(target);
      const dataset = getTargetDatasetSnapshot(target);
      const targetPath = getTargetPath(target);
      const key = `${tag}:${sourceUrl || '(none)'}`;
      const now = Date.now();
      const inExplorerApp = Boolean(target.closest('.app'));
      const isMediaTarget = tag === 'IMG' || tag === 'VIDEO' || tag === 'SOURCE';
      const suppressed = isMediaTarget && shouldSuppressMediaError(target);
      const lane = classifyNetworkLane({
        url: sourceUrl,
        tag,
        rel: target.getAttribute('rel') || '',
        inExplorerApp,
        message: '',
        source: 'resource-error',
      });
      pushNetworkRecentEvent({
        at: now,
        lane,
        tag,
        url: sourceUrl,
        message: '',
        source: 'resource-error',
        inExplorerApp,
        maybeNextAsset: sourceUrl.includes('/_next/'),
        maybeHotReload: sourceUrl.includes('hot-update') || sourceUrl.includes('webpack-hmr'),
        suppressedDefault: false,
      });
      const prior = loadFailures.get(key);
      if (prior) {
        prior.count += 1;
        prior.lastAt = now;
        prior.lastDataset = dataset;
        prior.lastTargetPath = targetPath;
        if (suppressed) prior.suppressedCount += 1;
      } else {
        loadFailures.set(key, {
          key,
          tag,
          url: sourceUrl,
          className,
          emitter,
          count: 1,
          firstAt: now,
          lastAt: now,
          suppressedCount: suppressed ? 1 : 0,
          lastDataset: dataset,
          lastTargetPath: targetPath,
        });
      }
      pushRecentEvent({
        at: now,
        key,
        tag,
        url: sourceUrl,
        className,
        emitter,
        suppressed,
        dataset,
        targetPath,
      });
      if (suppressed) {
        suppressedMediaErrorCount += 1;
        event.stopImmediatePropagation?.();
        event.stopPropagation();
      }
      publishSnapshot();
    };
    const onRuntimeError = (event: ErrorEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== window && target instanceof HTMLElement) return;
      const now = Date.now();
      const url = String(event.filename || '');
      const message = String(event.message || '');
      const lane = classifyNetworkLane({
        url,
        tag: 'RUNTIME',
        inExplorerApp: false,
        message,
        source: 'runtime-error',
      });
      pushNetworkRecentEvent({
        at: now,
        lane,
        tag: 'RUNTIME',
        url,
        message,
        source: 'runtime-error',
        inExplorerApp: false,
        maybeNextAsset: url.includes('/_next/'),
        maybeHotReload: url.includes('hot-update') || message.toLowerCase().includes('fast refresh'),
        suppressedDefault: false,
      });
      publishSnapshot();
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = String(
        (typeof reason === 'string' && reason)
        || (reason && typeof reason === 'object' && 'message' in reason && String((reason as { message?: unknown }).message))
        || ''
      );
      const reasonUrl = String(
        (reason && typeof reason === 'object' && 'url' in reason && String((reason as { url?: unknown }).url))
        || ''
      );
      const reasonStack = String(
        (reason && typeof reason === 'object' && 'stack' in reason && String((reason as { stack?: unknown }).stack))
        || ''
      );
      const now = Date.now();
      const lane = classifyNetworkLane({
        url: reasonUrl,
        tag: 'PROMISE',
        inExplorerApp: false,
        message,
        source: 'promise-rejection',
      });
      const shouldSuppressDefault = shouldSuppressGenericLoadFailedRejection({
        lane,
        message,
        url: reasonUrl,
        inExplorerApp: false,
        reasonStack,
      });
      pushNetworkRecentEvent({
        at: now,
        lane,
        tag: 'PROMISE',
        url: reasonUrl,
        message,
        source: 'promise-rejection',
        inExplorerApp: false,
        maybeNextAsset: reasonUrl.includes('/_next/') || message.includes('/_next/'),
        maybeHotReload: reasonUrl.includes('hot-update') || message.toLowerCase().includes('fast refresh'),
        suppressedDefault: shouldSuppressDefault,
      });
      if (shouldSuppressDefault) {
        suppressUnhandledRejectionDefault(event);
      }
      publishSnapshot();
    };

    window.addEventListener('error', onResourceError, true);
    window.addEventListener('error', onRuntimeError);
    window.addEventListener('unhandledrejection', onUnhandledRejection, true);
    publishSnapshot();

    return () => {
      window.removeEventListener('error', onResourceError, true);
      window.removeEventListener('error', onRuntimeError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection, true);
      delete (window as typeof window & { __explorerLoadFailureDebug?: unknown }).__explorerLoadFailureDebug;
      delete (window as typeof window & { __explorerNetworkFailureDebug?: unknown }).__explorerNetworkFailureDebug;
    };
  }, []);

  useEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar) return;

    const updateTopbarMeasuredHeight = () => {
      const rect = topbar.getBoundingClientRect();
      setTopbarMeasuredHeight((prev) => {
        const next = Math.max(0, Math.ceil(rect.height));
        return prev === next ? prev : next;
      });
    };

    updateTopbarMeasuredHeight();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateTopbarMeasuredHeight());
    observer.observe(topbar);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const scrollEl = mediaScrollViewportRef.current;
    if (!scrollEl) return;
    const styles = window.getComputedStyle(scrollEl);
    const topbarGap = Number.parseFloat(styles.getPropertyValue('--topbar-gap')) || 0;
    const nextInset = Math.max(0, topbarMeasuredHeight + topbarGap);

    if (!topbarInsetPrevRef.current) {
      topbarInsetPrevRef.current = nextInset;
      return;
    }

    const delta = nextInset - topbarInsetPrevRef.current;
    if (Math.abs(delta) > 0.5) {
      suppressAutoToggle();
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);
    }

    topbarInsetPrevRef.current = nextInset;
  }, [suppressAutoToggle, topbarMeasuredHeight]);

  useEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar) return;
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isTouchPrimary = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    const intent = createIntentController({
      onOpen: () => revealTopbar(),
      onClose: () => setTopbarHidden(true),
      closeDelay: 600,
    });
    topbarIntentRef.current = intent;

    const hasOpenMenus = () => {
      const actionsPanel = topbar.querySelector('.actions-panel');
      const hasDropdown = Boolean(topbar.querySelector('details.dropdown[open]'));
      return Boolean(actionsPanel?.classList.contains('open')) || hasDropdown;
    };
    const shouldKeepOpen = () => dragging || sidebarOpen || hasOpenMenus()
      || topbar.contains(document.activeElement);

    const handleEnter = () => intent.scheduleOpen(0);
    const handleLeave = () => {
      if (supportsHover && !shouldKeepOpen()) intent.scheduleClose(600);
    };

    const updateDropdownState = () => {
      setTopbarHasOpenDropdown(Boolean(topbar.querySelector('details.dropdown[open]')));
    };
    const handleFocusIn = () => {
      setTopbarFocusWithin(true);
      intent.setPinned(true);
    };
    const handleFocusOut = () => {
      const stillFocusedWithin = topbar.contains(document.activeElement);
      setTopbarFocusWithin(stillFocusedWithin);
      intent.setPinned(false);
      if (supportsHover && !shouldKeepOpen()) intent.scheduleClose(600);
    };
    const handleDropdownToggle = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.matches('details.dropdown')) return;
      updateDropdownState();
    };

    updateDropdownState();

    topbar.addEventListener('pointerenter', handleEnter);
    topbar.addEventListener('pointerleave', handleLeave);
    topbar.addEventListener('focusin', handleFocusIn);
    topbar.addEventListener('focusout', handleFocusOut);
    topbar.addEventListener('toggle', handleDropdownToggle, true);
    const handleOutside = (event: PointerEvent) => {
      if (isTouchPrimary) return;
      if (isTopbarOwnedTarget(event.target)) return;
      if (intent.isPinned()) return;
      if (topbar.contains(event.target as Node)) return;
      if (!shouldKeepOpen()) intent.scheduleClose(120);
    };
    if (!isTouchPrimary) {
      document.addEventListener('pointerdown', handleOutside);
    }

    intent.setOpen(true);

    return () => {
      if (topbarPinTimeoutRef.current) {
        window.clearTimeout(topbarPinTimeoutRef.current);
        topbarPinTimeoutRef.current = null;
      }
      topbar.removeEventListener('pointerenter', handleEnter);
      topbar.removeEventListener('pointerleave', handleLeave);
      topbar.removeEventListener('focusin', handleFocusIn);
      topbar.removeEventListener('focusout', handleFocusOut);
      topbar.removeEventListener('toggle', handleDropdownToggle, true);
      if (!isTouchPrimary) {
        document.removeEventListener('pointerdown', handleOutside);
      }
    };
  }, [dragging, revealTopbar, setTopbarHidden, sidebarOpen]);

  useEffect(() => {
    if (view !== 'grid') {
      pinchDensityRef.current?.destroy();
      pinchDensityRef.current = null;
      densityControllerRef.current?.destroy();
      densityControllerRef.current = null;
      return;
    }

    const gridEl = gridSurfaceEl;
    const scrollerEl = mediaScrollViewportRef.current;
    if (!gridEl || !scrollerEl) return;

    const density = createExplorerDensityController({
      gridEl,
      getClassHostEl: () => mediaContentRef.current,
      sliderEl: densitySliderRef.current,
      initialColumns: densityControllerRef.current?.getColumns()
        ?? lastCommittedColumnsRef.current
        ?? gridColumnCount
        ?? DEFAULT_COLUMNS_MOBILE,
      onColumnsCommit: (nextColumns) => {
        lastCommittedColumnsRef.current = nextColumns;
        scheduleGridColumnCommit(nextColumns);
      },
      minColumns: MIN_COLUMNS_MOBILE,
      maxColumns: MAX_COLUMNS_MOBILE,
    });
    densityControllerRef.current = density;

    if (touchPinchCapable) {
      const pinch = createPinchDensityController({
        gestureSurfaceEl: scrollerEl,
        visualScaleTargetEl: gridEl,
        getClassHostEl: () => mediaContentRef.current,
        density,
        onPinchFrame: (a, b, active) => {
          pinchOverlayGestureActiveRef.current = active;
          setPinchFingerA(a);
          setPinchFingerB(b);
          setPinchOverlayActive(active);
        },
        onPinchStep: (dir) => {
          pinchPulseTriggerRef.current?.(dir);
          if (pinchPerfTimeoutRef.current) {
            window.clearTimeout(pinchPerfTimeoutRef.current);
            pinchPerfTimeoutRef.current = null;
          }
          setPinchPerfActive(true);
        },
        onPinchRelease: () => {
          pinchOverlayGestureActiveRef.current = false;
          const pendingCount = pinchOverlayPendingNodeCountRef.current;
          pinchOverlayPendingNodeCountRef.current = null;
          const nextNodeCount = pendingCount ?? density.getColumns();
          scheduleExplorerRaf('raf-lane-cinematic-reveal', () => {
            setPinchDisplayNodeCount(nextNodeCount);
          });
          if (pinchPerfTimeoutRef.current) {
            window.clearTimeout(pinchPerfTimeoutRef.current);
          }
          pinchPerfTimeoutRef.current = window.setTimeout(() => {
            setPinchPerfActive(false);
            pinchPerfTimeoutRef.current = null;
          }, 150);
          setPinchOverlayActive(false);
        },
      });
      pinch.attach();
      pinchDensityRef.current = pinch;
    }

    return () => {
      pinchDensityRef.current?.destroy();
      density.destroy();
      pinchDensityRef.current = null;
      densityControllerRef.current = null;
      pinchOverlayGestureActiveRef.current = false;
      pinchOverlayPendingNodeCountRef.current = null;
      if (pinchPerfTimeoutRef.current) {
        window.clearTimeout(pinchPerfTimeoutRef.current);
        pinchPerfTimeoutRef.current = null;
      }
      setPinchPerfActive(false);
      setPinchOverlayActive(false);
    };
  }, [gridSurfaceEl, scheduleGridColumnCommit, touchPinchCapable, view]);

  useEffect(() => {
    if (view !== 'grid') return;
    const scrollerEl = mediaScrollViewportRef.current;
    if (!scrollerEl) return;
    let wheelDeltaAccumulator = 0;
    let ctrlWheelPendingColumns: number | null = null;
    let ctrlWheelIdleTimer = 0;
    const WHEEL_STEP_THRESHOLD = 48;
    const CTRL_WHEEL_IDLE_RESET_MS = 140;
    const wheelDebug = {
      attached: true,
      ctrlWheelEvents: 0,
      preventedDefault: 0,
      densityStepOut: 0,
      densityStepIn: 0,
      lastDeltaY: 0,
      pendingColumns: 0,
      pendingResets: 0,
    };
    const clearCtrlWheelIdleTimer = () => {
      if (!ctrlWheelIdleTimer) return;
      window.clearTimeout(ctrlWheelIdleTimer);
      ctrlWheelIdleTimer = 0;
    };
    const resetCtrlWheelSession = () => {
      ctrlWheelPendingColumns = null;
      wheelDeltaAccumulator = 0;
      wheelDebug.pendingColumns = 0;
      wheelDebug.pendingResets += 1;
      clearCtrlWheelIdleTimer();
    };
    const exposeWheelDebug = () => {
      (globalThis as typeof globalThis & {
        __explorerCtrlWheelDensityDebug?: { getSnapshot: () => typeof wheelDebug };
      }).__explorerCtrlWheelDensityDebug = {
        getSnapshot: () => ({ ...wheelDebug }),
      };
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      wheelDebug.ctrlWheelEvents += 1;
      wheelDebug.lastDeltaY = event.deltaY;
      event.preventDefault();
      wheelDebug.preventedDefault += 1;
      if (ctrlWheelPendingColumns == null) {
        ctrlWheelPendingColumns = densityControllerRef.current?.getColumns() ?? gridColumnCount;
      }
      wheelDeltaAccumulator += event.deltaY;
      while (Math.abs(wheelDeltaAccumulator) >= WHEEL_STEP_THRESHOLD) {
        const nextStep = wheelDeltaAccumulator > 0 ? WHEEL_STEP_THRESHOLD : -WHEEL_STEP_THRESHOLD;
        wheelDeltaAccumulator -= nextStep;
        if (!Number.isFinite(nextStep) || nextStep === 0) continue;
        const deltaColumns = nextStep < 0 ? -1 : 1;
        const seededColumns = ctrlWheelPendingColumns ?? densityControllerRef.current?.getColumns() ?? gridColumnCount;
        const nextColumns = clampDensityColumns(seededColumns + deltaColumns);
        ctrlWheelPendingColumns = nextColumns;
        wheelDebug.pendingColumns = nextColumns;
        densityControllerRef.current?.setColumnsForPinch(nextColumns);
        if (nextStep < 0) {
          wheelDebug.densityStepOut += 1;
        } else {
          wheelDebug.densityStepIn += 1;
        }
      }
      clearCtrlWheelIdleTimer();
      ctrlWheelIdleTimer = window.setTimeout(() => {
        resetCtrlWheelSession();
        exposeWheelDebug();
      }, CTRL_WHEEL_IDLE_RESET_MS);
      exposeWheelDebug();
    };

    exposeWheelDebug();
    scrollerEl.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      resetCtrlWheelSession();
      wheelDebug.attached = false;
      exposeWheelDebug();
      scrollerEl.removeEventListener('wheel', onWheel);
      delete (globalThis as typeof globalThis & { __explorerCtrlWheelDensityDebug?: unknown }).__explorerCtrlWheelDensityDebug;
    };
  }, [clampDensityColumns, gridColumnCount, view]);

  useEffect(() => {
    if (composeModalOpen) setComposeModalRendered(true);
  }, [composeModalOpen]);

  useEffect(() => {
    if (deleteModalOpen) setDeleteModalRendered(true);
  }, [deleteModalOpen]);

  useEffect(() => {
    if (!composeModalRendered) return;
    const modalEl = composeModalRef.current;
    const cardEl = composeCardRef.current;
    if (!modalEl || !cardEl) return;
    const motion = createModalMotion(modalEl, cardEl);
    composeModalMotionRef.current = motion;
    if (composeModalOpen) motion.open();
    return () => {
      motion.destroy();
      composeModalMotionRef.current = null;
    };
  }, [composeModalRendered]);

  useEffect(() => {
    if (!deleteModalRendered) return;
    const modalEl = confirmModalRef.current;
    const cardEl = confirmCardRef.current;
    if (!modalEl || !cardEl) return;
    const motion = createModalMotion(modalEl, cardEl);
    confirmModalMotionRef.current = motion;
    if (deleteModalOpen) motion.open();
    return () => {
      motion.destroy();
      confirmModalMotionRef.current = null;
    };
  }, [deleteModalRendered]);

  useEffect(() => {
    const motion = composeModalMotionRef.current;
    if (!motion) return;
    if (composeModalOpen) {
      motion.open();
      return;
    }
    motion.close(() => setComposeModalRendered(false));
  }, [composeModalOpen, composeModalRendered]);

  useEffect(() => {
    const motion = confirmModalMotionRef.current;
    if (!motion) return;
    if (deleteModalOpen) {
      motion.open();
      return;
    }
    motion.close(() => setDeleteModalRendered(false));
  }, [deleteModalOpen, deleteModalRendered]);

  useEffect(() => {
    const brand = brandRef.current;
    if (!brand) return;
    const intent = createIntentController({
      onOpen: () => {
        if (assetDragActive) setSidebarOpen(true);
      },
      onClose: () => {
        if (assetDragActive) setSidebarOpen(false);
      },
      openDelay: 320,
      closeDelay: 260,
    });
    const handleEnter = () => {
      if (assetDragActive) intent.scheduleOpen(320);
    };
    const handleLeave = () => {
      if (assetDragActive) intent.scheduleClose(260);
    };
    brand.addEventListener('pointerenter', handleEnter);
    brand.addEventListener('pointerleave', handleLeave);
    return () => {
      brand.removeEventListener('pointerenter', handleEnter);
      brand.removeEventListener('pointerleave', handleLeave);
    };
  }, [assetDragActive, setSidebarOpen]);

  useEffect(() => {
    const root = topbarRef.current;
    if (!root) return;
    const dropdowns = Array.from(root.querySelectorAll('details.dropdown'));
    if (!dropdowns.length) return;

    const cleanups: Array<() => void> = [];

    dropdowns.forEach((dropdown) => {
      const intent = createIntentController({
        onOpen: () => dropdown.setAttribute('open', ''),
        onClose: () => dropdown.removeAttribute('open'),
        openDelay: 80,
        closeDelay: 200,
      });
      const enter = () => intent.scheduleOpen();
      const leave = () => intent.scheduleClose();
      dropdown.addEventListener('pointerenter', enter);
      dropdown.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        dropdown.removeEventListener('pointerenter', enter);
        dropdown.removeEventListener('pointerleave', leave);
      });
    });

    const handleOutside = (event: PointerEvent) => {
      dropdowns.forEach((dropdown) => {
        if (!dropdown.hasAttribute('open')) return;
        if (dropdown.contains(event.target as Node)) return;
        dropdown.removeAttribute('open');
      });
    };
    document.addEventListener('pointerdown', handleOutside);
    cleanups.push(() => document.removeEventListener('pointerdown', handleOutside));

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const selectedCount = selected.size;
  const selectedOrderMap = useMemo(() => selectionOrderIndexMap(selected, selectedOrder), [selected, selectedOrder]);
  const contextActions = useMemo(
    () => (contextMenu?.kind === 'media_asset' ? getContextActions(contextMenu.items) : []),
    [contextMenu, getContextActions],
  );


  const sortedIngestClaims = useMemo(() => {
    return [...ingestClaims].sort((a, b) => {
      const left = Date.parse(a.updated_at || a.created_at || '') || 0;
      const right = Date.parse(b.updated_at || b.created_at || '') || 0;
      return right - left;
    });
  }, [ingestClaims]);

  const visibleIngestClaims = useMemo(() => {
    return sortedIngestClaims.filter((claim) => !hiddenIngestClaimIds.has(claim.claim_id));
  }, [hiddenIngestClaimIds, sortedIngestClaims]);

  const latestIngestClaims = useMemo(() => visibleIngestClaims.slice(0, 5), [visibleIngestClaims]);
  const hiddenIngestClaimsCount = useMemo(
    () => ingestClaims.filter((claim) => hiddenIngestClaimIds.has(claim.claim_id)).length,
    [hiddenIngestClaimIds, ingestClaims],
  );

  useEffect(() => {
    const body = document.body;
    if (composeModalOpen || deleteModalOpen) body.classList.add('confirm-open');
    else body.classList.remove('confirm-open');
    return () => body.classList.remove('confirm-open');
  }, [composeModalOpen, deleteModalOpen]);

  useEffect(() => {
    if (!composeModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (composeSubmitting) return;
        event.preventDefault();
        setComposeModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    scheduleExplorerRaf('raf-lane-other', () => composeNameInputRef.current?.focus());
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composeModalOpen, composeSubmitting]);

  useEffect(() => {
    if (!deleteModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (deleteSubmitting) return;
        event.preventDefault();
        handleDeleteCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    scheduleExplorerRaf('raf-lane-other', () => deleteConfirmButtonRef.current?.focus());
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteModalOpen, deleteSubmitting, handleDeleteCancel]);

  const uploadCaption = activeProject
    ? `Upload to ${activeProject.name}${activeProject.source ? ` (${activeProject.source})` : ''}`
    : 'Pick a project first.';
  const canSelect = Boolean(activeProject) || mediaScope === 'all';
  const suppressGridThumbPreviewLane = (
    view === 'grid'
    && inspectorOpen
    && gridCinematicMode === 'grid-focused'
    && proxyTravelState === 'idle'
  );
  const projectLabel = useCallback((item: MediaItem) => {
    if (!item.project_name) return '';
    return item.project_source ? `${item.project_name} (${item.project_source})` : item.project_name;
  }, []);

  const buildAssetViewModel = useCallback((item: MediaItem) => {
    const kind = guessKind(item);
    const title = item.relative_path?.split('/').pop() || item.relative_path || 'unnamed';
    const proj = projectLabel(item);
    const sub = proj ? `${item.relative_path || ''} • ${proj}` : (item.relative_path || '');
    const size = formatBytes(item.size);
    const pointerHandlers = buildAssetPointerHandlers(item);
    const renderKey = assetRenderKey(item, activeProject);
    const thumbKey = getThumbCacheKey(item) || renderKey;
    const orientationKey = thumbKey || item.relative_path || '';
    const itemOrient = inferOrientationFromItem(item);
    const dynamicOrient = dynamicOrientations[orientationKey];
    const cachedOrient = getCachedOrientation(orientationKey);
    const orient = resolveItemOrientation(item, orientationKey);
    const orientLocked = Boolean(itemOrient || dynamicOrient || cachedOrient);
    const rawThumbUrl = resolveThumbCandidateUrl(item, kind);
    const fallbackThumb = buildThumbFallback(kind);
    const thumbUrl = rawThumbUrl ? absolutizeMediaUrl(resolveAssetUrl(rawThumbUrl) || '') : undefined;
    const streamUrl = absolutizeMediaUrl(resolveAssetUrl(normalizeThumbUrl(item.stream_url || item.download_url || '')) || '');
    const thumbJobKey = buildThumbJobKey(thumbKey, thumbUrl);
    const selectionKey = renderKey;
    const isSelected = selected.has(selectionKey);
    const isActive = activeAssetKey === selectionKey;
    const isActivated = previewActivationKey === selectionKey;
    const isSecondTapReinforced = reinforcedActiveKey === selectionKey;
    const isHoldEmphasis = holdEmphasisKey === selectionKey;
    const selectionOrderIndex = selectedOrderMap.get(selectionKey) ?? 0;
    const activeVideoPreviewUrl = (
      isActivated && kind === 'video' && !suppressGridThumbPreviewLane
        ? streamUrl
        : undefined
    );
    const previewPlaybackKey = isActivated ? `${selectionKey}:${previewPlaybackToken}` : '';

    return {
      activeVideoPreviewUrl,
      fallbackThumb,
      isActive,
      isSecondTapReinforced,
      isHoldEmphasis,
      isSelected,
      item,
      kind,
      kindBadgeClassName: kindBadgeClass(kind),
      orient,
      orientLocked,
      pointerHandlers,
      previewPlaybackKey,
      renderKey,
      selectionKey,
      selectionOrderLabel: selectionOrderIndex ? String(Math.min(selectionOrderIndex, 99)) : '',
      size,
      streamUrl,
      sub,
      thumbJobKey,
      thumbKey,
      thumbUrl,
      title,
    };
  }, [
    activeAssetKey,
    activeProject,
    absolutizeMediaUrl,
    assetRenderKey,
    buildAssetPointerHandlers,
    dynamicOrientations,
    getCachedOrientation,
    holdEmphasisKey,
    projectLabel,
    suppressGridThumbPreviewLane,
    previewActivationKey,
    previewPlaybackToken,
    reinforcedActiveKey,
    resolveAssetUrl,
    resolveThumbCandidateUrl,
    resolveItemOrientation,
    selected,
    selectedOrderMap,
  ]);

  const toggleSidebarOpen = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const focusWorldActive = (
    inspectorOpen
    && view === 'grid'
    && focusPresentationState.mode === 'world-focus'
    && Boolean(activeAssetKey)
    && focusPresentationState.key === activeAssetKey
  );
  const focusOverlayReady = (
    focusPresentationState.mode === 'world-focus'
      ? (focusPresentationState.overlayReady && gridCinematicMode === 'grid-focused')
      : focusPresentationState.mode === 'drawer-fallback'
  );
  const proxyTravelActive = proxyTravelState !== 'idle';
  const gridCinematicActive = !proxyTravelActive && focusWorldActive && view === 'grid' && gridCinematicMode === 'grid-rest';
  const drawerVisibleOwner = !proxyTravelActive && inspectorOpen && (view === 'list' || focusPresentationState.mode === 'drawer-fallback');
  const proxyPreviewVisible = !proxyTravelActive && view === 'grid' && inspectorOpen && gridCinematicMode === 'grid-focused';
  const focusedProxyPlaybackOwned = proxyPreviewVisible;
  useEffect(() => {
    const stage = focusWorldStageRef.current;
    if (!stage) return;
    stage.dataset.focusWorldInteractive = focusWorldActive ? 'true' : 'false';
    if (focusWorldActive) {
      focusWorldIdleMarkerRef.current = false;
      return;
    }
    if (focusWorldIdleMarkerRef.current) return;
    focusWorldIdleMarkerRef.current = true;
    recordPreviewDebug({ stage: 'focus-world-stage-idle-inert', requestedMode: view, finalMode: 'idle' });
    recordPreviewDebug({ stage: 'focus-world-stage-idle-measure-blocked', requestedMode: view, finalMode: 'idle' });
    recordPreviewDebug({ stage: 'focus-world-stage-idle-raf-blocked', requestedMode: view, finalMode: 'idle' });
  }, [focusWorldActive, recordPreviewDebug, view]);
  useEffect(() => {
    proxyPrewarmSelectionKeyRef.current = proxyPrewarmSelectionKey;
    proxyPrewarmUrlRef.current = proxyPrewarmUrl;
    const prewarmVideo = proxyPrewarmVideoRef.current;
    if (!prewarmVideo) {
      proxyPrewarmReadyStateRef.current = 0;
      return;
    }

    const publishPrewarmMarker = (marker: string) => {
      (globalThis as typeof globalThis & {
        __explorerMediaDebugMarker?: { marker: string; selectionKey: string; prewarmUrl?: string };
      }).__explorerMediaDebugMarker = {
        marker,
        selectionKey: proxyPrewarmSelectionKey || '',
        prewarmUrl: proxyPrewarmUrl || '',
      };
    };
    const clearPrewarm = (reason?: 'blocked' | 'released') => {
      const shouldEmitPaused = !prewarmVideo.paused || prewarmVideo.currentTime !== 0;
      prewarmVideo.pause();
      prewarmVideo.currentTime = 0;
      if (shouldEmitPaused) publishPrewarmMarker('prewarm-video-paused');
      prewarmVideo.removeAttribute('src');
      prewarmVideo.load();
      if (reason === 'blocked') publishPrewarmMarker('prewarm-video-blocked-non-authoritative');
      if (reason === 'released' || reason === 'blocked') publishPrewarmMarker('prewarm-video-released');
      proxyPrewarmReadyStateRef.current = 0;
    };
    if (!proxyPrewarmUrl) {
      clearPrewarm('released');
      return;
    }
    if (focusedProxyPlaybackOwned) {
      clearPrewarm('blocked');
      return;
    }

    prewarmVideo.muted = true;
    prewarmVideo.defaultMuted = true;
    prewarmVideo.playsInline = true;
    prewarmVideo.loop = true;
    prewarmVideo.preload = 'metadata';
    if (prewarmVideo.src !== proxyPrewarmUrl) {
      prewarmVideo.src = proxyPrewarmUrl;
    }
    prewarmVideo.load();
    proxyPrewarmReadyStateRef.current = prewarmVideo.readyState;

    const onLoadedMetadata = () => {
      proxyPrewarmReadyStateRef.current = prewarmVideo.readyState;
    };
    prewarmVideo.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      prewarmVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [focusedProxyPlaybackOwned, proxyPrewarmSelectionKey, proxyPrewarmUrl]);
  useEffect(() => {
    if (!proxyPreviewVisible) {
      if (GLOBAL_PROXY_RAF_ID !== null) {
        cancelExplorerRaf(GLOBAL_PROXY_RAF_ID);
        GLOBAL_PROXY_RAF_ID = null;
      }
      GLOBAL_PROXY_RAF_ACTIVE = false;
      setExplorerRafLaneActive('raf-lane-proxy-active-card', false);
      publishExplorerRafDebug();
      setActiveProxyCardEl(null);
      setActiveProxyUiSlotEl(null);
      setProxyPlaybackPlaying(false);
      setProxyPlaybackCurrentTime(0);
      setProxyPlaybackDuration(0);
      return;
    }
    const root = focusProxyRootRef.current;
    if (!root) return;
    if (GLOBAL_PROXY_RAF_ID !== null) {
      cancelExplorerRaf(GLOBAL_PROXY_RAF_ID);
      GLOBAL_PROXY_RAF_ID = null;
    }
    GLOBAL_PROXY_RAF_ACTIVE = false;
    const syncActiveCard = () => {
      const activeCard = root.querySelector<HTMLElement>('.proxy-render-card[data-proxy-active="true"]');
      setActiveProxyCardEl((prev) => (prev === activeCard ? prev : activeCard));
      const uiSlot = activeCard?.querySelector<HTMLElement>('.proxy-render-ui-slot[data-proxy-ui-slot="true"]') || null;
      setActiveProxyUiSlotEl((prev) => (prev === uiSlot ? prev : uiSlot));
    };
    const tick = () => {
      if (!GLOBAL_PROXY_RAF_ACTIVE) return;
      syncActiveCard();
      GLOBAL_PROXY_RAF_ID = scheduleExplorerRaf('raf-lane-proxy-active-card', tick);
      publishExplorerRafDebug();
    };
    GLOBAL_PROXY_RAF_ACTIVE = true;
    setExplorerRafLaneActive('raf-lane-proxy-active-card', true);
    GLOBAL_PROXY_RAF_ID = scheduleExplorerRaf('raf-lane-proxy-active-card', tick);
    publishExplorerRafDebug();
    return () => {
      GLOBAL_PROXY_RAF_ACTIVE = false;
      if (GLOBAL_PROXY_RAF_ID !== null) {
        cancelExplorerRaf(GLOBAL_PROXY_RAF_ID);
        GLOBAL_PROXY_RAF_ID = null;
      }
      setExplorerRafLaneActive('raf-lane-proxy-active-card', false);
      publishExplorerRafDebug();
    };
  }, [proxyPreviewVisible]);
  const activeProxyVideoEl = activeProxyCardEl?.querySelector<HTMLVideoElement>('.proxy-render-video') ?? null;
  const activeProxySelectionKey = activeProxyCardEl?.dataset.selectionKey || '';
  const activeProxyMediaBranch = activeProxyCardEl?.dataset.proxyMediaBranch || '';
  const proxyAsset = useMemo(() => {
    if (activeProxySelectionKey) {
      const proxyItem = itemsBySelectionKey.get(activeProxySelectionKey);
      if (proxyItem) return normalizePreviewAsset(proxyItem, resolveAssetUrl);
    }
    return normalizedPreviewAsset;
  }, [activeProxySelectionKey, itemsBySelectionKey, normalizedPreviewAsset, resolveAssetUrl]);
  const proxyStreamUrl = useMemo(() => {
    const datasetStream = activeProxyCardEl?.dataset.streamUrl || activeProxyVideoEl?.dataset.streamUrl || '';
    const elementSrc = activeProxyVideoEl?.currentSrc || activeProxyVideoEl?.src || '';
    return absolutizeMediaUrl(datasetStream || elementSrc || proxyAsset?.src || '');
  }, [absolutizeMediaUrl, activeProxyCardEl, activeProxyVideoEl, proxyAsset]);
  const proxyPlaybackSessionKey = useMemo(() => (
    `${activeProxySelectionKey}::${proxyStreamUrl}::${previewAutoPlayToken}`
  ), [activeProxySelectionKey, previewAutoPlayToken, proxyStreamUrl]);
  const handoff = previewPlaybackHandoffRef.current;
  const hasMatchingHandoff = Boolean(handoff && handoff.selectionKey === activeProxySelectionKey);
  const handoffTime = hasMatchingHandoff && handoff ? Math.max(0, handoff.currentTime) : null;
  const activeThumbnailVideoEl = activeProxySelectionKey
    ? getGridThumbVideoBySelectionKey(activeProxySelectionKey)
    : null;
  const {
    videoReady: proxyVideoReady,
    firstFramePresented: proxyFirstFramePresented,
    playbackState: proxyPlaybackState,
    promotionStrategy: proxyPromotionStrategy,
    hasPoster: proxyHasPoster,
    posterShown: proxyPosterShown,
    posterUrl: proxyPosterUrl,
    authoritativeVisualSurface,
    authoritativeAudioSurface,
  } = useVideoOwnershipHandoff({
    selectionKey: activeProxySelectionKey,
    streamUrl: proxyStreamUrl,
    isFocusedOpen: proxyPreviewVisible,
    shouldPlay: proxyPreviewVisible,
    enableFocusedAudio: true,
    proxyVideoEl: activeProxyVideoEl,
    thumbnailVideoEl: activeThumbnailVideoEl,
    mediaBranch: activeProxyMediaBranch,
    handoffTime,
    wasPlayingBeforeHandoff: hasMatchingHandoff ? Boolean(handoff?.wasPlaying) : true,
    playToken: previewAutoPlayToken,
    onHandoffConsumed: () => {
      if (hasMatchingHandoff) {
        previewPlaybackHandoffRef.current = null;
      }
    },
    onPromoted: () => {
      if (activeProxySelectionKey) {
        pauseGridThumbForSelectionKey(activeProxySelectionKey);
        pauseNonAuthoritativeGridVideos(activeProxySelectionKey);
        publishMediaInvariantDebug('proxy-promoted-authority');
      }
    },
    onDebug: (entry) => {
      (globalThis as typeof globalThis & {
        __explorerProxyPlaybackDebug?: Record<string, unknown>;
      }).__explorerProxyPlaybackDebug = {
        ...entry,
        streamUrl: proxyStreamUrl,
        sessionKey: entry.sessionKey || proxyPlaybackSessionKey,
        videoStableId: activeProxyVideoEl?.dataset.proxyStableVideoId || '',
        cardSelectionKey: activeProxyCardEl?.dataset.selectionKey || '',
        cardVideoReady: activeProxyCardEl?.dataset.videoReady || '',
        cardFirstFramePresented: activeProxyCardEl?.dataset.firstFramePresented || '',
        cardPromotionStrategy: activeProxyCardEl?.dataset.promotionStrategy || '',
        cardSessionId: activeProxyCardEl?.dataset.proxySessionId || '',
        prewarmSelectionKey: proxyPrewarmSelectionKeyRef.current || '',
        prewarmUrl: proxyPrewarmUrlRef.current || '',
        prewarmReadyState: proxyPrewarmReadyStateRef.current || 0,
      };
    },
  });
  useEffect(() => {
    if (!activeProxyCardEl) return;
    activeProxyCardEl.dataset.videoReady = (proxyVideoReady || proxyFirstFramePresented) ? 'true' : 'false';
    activeProxyCardEl.dataset.firstFramePresented = proxyFirstFramePresented ? 'true' : 'false';
    activeProxyCardEl.dataset.promotionStrategy = proxyPromotionStrategy;
    activeProxyCardEl.dataset.streamUrl = proxyStreamUrl;
    activeProxyCardEl.dataset.proxySessionId = proxyPlaybackSessionKey;
    activeProxyCardEl.dataset.posterShown = proxyPosterShown ? 'true' : 'false';
    activeProxyCardEl.dataset.posterUrl = proxyPosterUrl;
    activeProxyCardEl.dataset.hasPoster = proxyHasPoster ? 'true' : 'false';
    activeProxyCardEl.dataset.authoritativeVisualSurface = authoritativeVisualSurface;
    activeProxyCardEl.dataset.authoritativeAudioSurface = authoritativeAudioSurface;
    if (activeProxyVideoEl) {
      activeProxyVideoEl.dataset.proxySessionId = proxyPlaybackSessionKey;
      activeProxyVideoEl.dataset.posterShown = proxyPosterShown ? 'true' : 'false';
      activeProxyVideoEl.dataset.posterUrl = proxyPosterUrl;
      activeProxyVideoEl.dataset.hasPoster = proxyHasPoster ? 'true' : 'false';
      activeProxyVideoEl.dataset.authoritativeVisualSurface = authoritativeVisualSurface;
      activeProxyVideoEl.dataset.authoritativeAudioSurface = authoritativeAudioSurface;
    }
  }, [
    activeProxyCardEl,
    activeProxyVideoEl,
    authoritativeAudioSurface,
    authoritativeVisualSurface,
    proxyFirstFramePresented,
    proxyHasPoster,
    proxyPlaybackSessionKey,
    proxyPosterShown,
    proxyPosterUrl,
    proxyPromotionStrategy,
    proxyStreamUrl,
    proxyVideoReady,
  ]);
  useEffect(() => {
    const root = focusProxyRootRef.current;
    if (!root) return;
    root.dataset.authoritativeVisualSurface = authoritativeVisualSurface;
    root.dataset.authoritativeAudioSurface = authoritativeAudioSurface;
  }, [authoritativeAudioSurface, authoritativeVisualSurface]);
  useEffect(() => {
    const root = focusProxyRootRef.current;
    if (!root) return;
    const continuityKey = activeProxySelectionKey && proxyStreamUrl
      ? `${activeProxySelectionKey}::${proxyStreamUrl}`
      : '';
    (globalThis as typeof globalThis & {
      __explorerProxyContinuityDebug?: Record<string, unknown>;
    }).__explorerProxyContinuityDebug = {
      continuityKey,
      retainedOnClose: root.dataset.proxyRetainedOnClose === 'true',
      mountedState: activeProxyVideoEl?.dataset.proxyMountedState || 'proxy-detached',
      retainedState: root.dataset.proxyRetainedOnClose === 'true' ? 'retained' : 'active',
      posterShown: proxyPosterShown,
      authoritativeVisualSurface,
      authoritativeAudioSurface,
    };
  }, [
    activeProxySelectionKey,
    activeProxyVideoEl,
    authoritativeAudioSurface,
    authoritativeVisualSurface,
    proxyPosterShown,
    proxyStreamUrl,
  ]);
  useEffect(() => {
    setProxyPlaybackPlaying(proxyPlaybackState.isPlaying);
    setProxyPlaybackCurrentTime(proxyPlaybackState.currentTime);
    setProxyPlaybackDuration(proxyPlaybackState.duration);
  }, [proxyPlaybackState.currentTime, proxyPlaybackState.duration, proxyPlaybackState.isPlaying]);

  useEffect(() => {
    publishMediaInvariantDebug('proxy-playback-state-sync');
  }, [proxyPlaybackState.isPlaying, proxyPlaybackState.currentTime, publishMediaInvariantDebug]);
  const cinematicStageReady = (
    cinematicRevealState.mediaVisible
    && cinematicRevealState.topVisible
    && cinematicRevealState.bottomVisible
    && cinematicRevealState.actionsVisible
  );
  const handleProxySeek = useCallback((value: number) => {
    const proxyVideo = activeProxyCardEl?.querySelector<HTMLVideoElement>('.proxy-render-video') ?? null;
    if (!proxyVideo) return;
    if (!Number.isFinite(value)) return;
    proxyVideo.currentTime = Math.max(0, value);
    setProxyPlaybackCurrentTime(Math.max(0, value));
  }, [activeProxyCardEl]);
  const handleProxyTogglePlay = useCallback(() => {
    const proxyVideo = activeProxyCardEl?.querySelector<HTMLVideoElement>('.proxy-render-video') ?? null;
    if (!proxyVideo) return;
    if (proxyVideo.paused) {
      proxyVideo.muted = false;
      proxyVideo.defaultMuted = false;
      proxyVideo.play().catch(() => {});
    }
    else proxyVideo.pause();
  }, [activeProxyCardEl]);
  const handleProxySkipBack = useCallback(() => {
    const proxyVideo = activeProxyCardEl?.querySelector<HTMLVideoElement>('.proxy-render-video') ?? null;
    if (!proxyVideo) return;
    const next = Math.max(0, (proxyVideo.currentTime || 0) - 10);
    proxyVideo.currentTime = next;
    setProxyPlaybackCurrentTime(next);
  }, [activeProxyCardEl]);
  const handleProxySkipForward = useCallback(() => {
    const proxyVideo = activeProxyCardEl?.querySelector<HTMLVideoElement>('.proxy-render-video') ?? null;
    if (!proxyVideo) return;
    const cap = Number.isFinite(proxyVideo.duration) ? proxyVideo.duration : Math.max(proxyPlaybackDuration, 0);
    const next = Math.min((proxyVideo.currentTime || 0) + 10, Math.max(cap, 0));
    proxyVideo.currentTime = next;
    setProxyPlaybackCurrentTime(next);
  }, [activeProxyCardEl, proxyPlaybackDuration]);
  const proxyPreviewPortalTarget = activeProxyUiSlotEl ?? activeProxyCardEl;
  const authorityBaseUrl = useMemo(() => {
    const connectUrl = api.buildUrl('/connect');
    return connectUrl.replace(/\/connect\/?$/, '');
  }, [api]);

  return (
    <div className={`app ${proxyTravelActive ? 'proxy-travel-active' : ''} ${gridCinematicMode}`}>
      <div className="main">
        <aside className={`sidebar sidebar-drawer ${sidebarOpen ? 'is-open' : ''}`}>
          <div className="section-h">
            <h2>Projects</h2>
            <div className="meta-line">
              <span>{projects.length} total</span>
              <span className="kbd">Click</span>
            </div>
          </div>
          <div className="scroll">
            <div className="chips">
              {projects.length === 0 ? (
                <div style={{ padding: '12px', color: 'var(--muted)', fontSize: '12px' }}>
                  No projects yet — create via <code>/api/projects</code>.
                </div>
              ) : (
                projects.map((project) => (
                  <div
                    key={`${project.source}-${project.name}`}
                    className={`chip ${activeProject?.name === project.name ? 'active' : ''}`}
                    title={project.instructions || 'Browse this project'}
                    data-project={project.name}
                    data-source={project.source || ''}
                    onClick={() => selectProject(project)}
                    role="button"
                    onPointerUp={() => void handleProjectDrop(project)}
                  >
                    <span className="dot" aria-hidden="true"></span>
                    <span className="name">{project.name}</span>
                  </div>
                ))
              )}
            </div>

            {liveSessions.length > 0 ? (
              <>
                <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
                  <h2>Live</h2>
                  <div className="meta-line">
                    <span className="kbd">/api/live_sessions</span>
                  </div>
                </div>
                <div className="sources">
                    {liveSessions.map((session) => (
                      <div key={session.session_id} onContextMenu={(event) => openLiveSessionContextMenu(event, session)}>
                        <LiveSourceCard
                          session={session}
                          apiBase={resolvedApiBase}
                          onStartRecording={(entry) => {
                            void api.controlLiveSession(entry.session_id, 'start_recording')
                              .then(() => addToast('good', 'Live control', `Start requested for ${entry.node_id}`))
                              .catch((err) => addToast('bad', 'Live control', err instanceof Error ? err.message : 'Control failed'));
                          }}
                          onStopRecording={(entry) => {
                            void api.controlLiveSession(entry.session_id, 'stop_recording')
                              .then(() => addToast('good', 'Live control', `Stop requested for ${entry.node_id}`))
                              .catch((err) => addToast('bad', 'Live control', err instanceof Error ? err.message : 'Control failed'));
                          }}
                          onOpen={(entry) => {
                            window.location.href = `/connect/device?node_id=${encodeURIComponent(entry.node_id)}`;
                          }}
                        />
                        <button
                          className="btn"
                          type="button"
                          onClick={(event) => openLiveSessionContextMenu(event, session)}
                          style={{ marginTop: 8 }}
                        >
                          ⋯
                        </button>
                      </div>
                    ))}
                  </div>
              </>
            ) : null}

            <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
              <h2>Sources / Libraries</h2>
              <div className="meta-line">
                <span className="kbd">/api/sources + /api/nodes</span>
                <div style={{ flex: 1 }} />
                <button type="button" className="btn" onClick={() => setIsRegisterNodeModalOpen(true)}>
                  + Register
                </button>
                <button type="button" className="btn" onClick={() => void reloadSourceControl()}>
                  Refresh
                </button>
              </div>
            </div>
            <div className="sources">
              {sourceControlLoading ? (
                <div className="card">
                  <strong>Loading sources…</strong>
                  <div className="small">Fetching canonical and remote source-bearing participants.</div>
                </div>
              ) : sourceControlError ? (
                <div className="card">
                  <strong>Source control unavailable</strong>
                  <div className="small">{sourceControlError}</div>
                </div>
              ) : runtimeSources.length === 0 ? (
                <div className="card">
                  <strong>No sources</strong>
                  <div className="small">No canonical or remote source-bearing participants are currently visible.</div>
                </div>
              ) : (
                <>
                  <div className="card">
                    <strong>Summary</strong>
                    <div className="small">
                      {canonicalSources.length} canonical · {remoteSources.length} remote · {runtimeNodes.length} nodes
                    </div>
                    <div className="small">
                      {healthyNodes.length} healthy · {sourceControlSnapshot.sources.length} total sources
                    </div>
                  </div>

                  {canonicalSources.length > 0 ? (
                    <div className="card">
                      <strong>Canonical sources</strong>
                      <div className="small">Authority-local sources visible through the canonical source registry.</div>
                      <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                        {canonicalSources.map((source: SourceControlRecord, index: number) => {
                          const authority = source.authority || 'canonical';
                          return (
                            <div className="card" key={`canonical-${source.name}-${index}`} onContextMenu={(event) => openSourceContextMenu(event, source)}>
                              <strong>{source.name}</strong>
                              <div className="small">{source.root || 'No root path'}</div>
                              <div className="tagrow">
                                <span className={`tag ${source.enabled ? 'good' : ''}`}>
                                  {source.enabled ? 'enabled' : 'disabled'}
                                </span>
                                <span className={`tag ${source.accessible ? 'good' : 'bad'}`}>
                                  {source.accessible ? 'reachable' : 'unreachable'}
                                </span>
                                <span className="tag">{source.kind || source.type || 'filesystem'}</span>
                                <span className="tag">{authority}</span>
                              </div>
                              <button
                                className="btn"
                                type="button"
                                onClick={(event) => openSourceContextMenu(event, source)}
                                style={{ marginTop: 8 }}
                              >
                                ⋯
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {remoteSources.length > 0 ? (
                    <div className="card">
                      <strong>Remote source surfaces</strong>
                      <div className="small">
                        Source surfaces published through connect/control-plane registration and merged into source inventory.
                      </div>
                      <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                        {remoteSources.map((source: SourceControlRecord, index: number) => {
                          const owner = runtimeNodes.find((node) => node.node_id === source.owner_node_id);
                          const authority = source.authority || 'canonical';
                          return (
                            <div className="card" key={`remote-${source.owner_node_id || 'unknown'}-${source.name}-${index}`} onContextMenu={(event) => openSourceContextMenu(event, source)}>
                              <strong>{source.name}</strong>
                              <div className="small">owner: {source.owner_node_id || 'unknown'}</div>
                              {owner?.label ? (
                                <div className="small">{owner.label}</div>
                              ) : null}
                              {owner?.base_url ? (
                                <div className="small">{owner.base_url}</div>
                              ) : null}
                              <div className="tagrow">
                                <span className={`tag ${source.enabled ? 'good' : ''}`}>
                                  {source.enabled ? 'enabled' : 'disabled'}
                                </span>
                                <span className={`tag ${source.accessible ? 'good' : 'bad'}`}>
                                  {source.accessible ? 'reachable' : 'unreachable'}
                                </span>
                                <span className="tag">{source.kind || source.type || 'remote'}</span>
                                <span className="tag">{authority}</span>
                                {source.local_only ? <span className="tag">local-only</span> : null}
                                {source.can_index ? <span className="tag">index</span> : null}
                                {source.can_proxy ? <span className="tag">proxy</span> : null}
                                {source.can_record ? <span className="tag">record</span> : null}
                              </div>
                              <button
                                className="btn"
                                type="button"
                                onClick={(event) => openSourceContextMenu(event, source)}
                                style={{ marginTop: 8 }}
                              >
                                ⋯
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {runtimeNodes.length > 0 ? (
                    <div className="card">
                      <strong>Registered runtimes</strong>
                      <div className="small">Control-plane view of registered runtime nodes.</div>
                      <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                        {runtimeNodes.map((node: NodeControlRecord) => (
                          <div className="card" key={node.node_id} onContextMenu={(event) => openRuntimeContextMenu(event, node)}>
                            <strong>{node.label}</strong>
                            <div className="small">{node.node_id}</div>
                            <div className="small">{node.base_url}</div>
                            <div className="tagrow">
                              <span className={`tag ${node.status === 'healthy' ? 'good' : ''}`}>{node.status}</span>
                              {getRuntimeKinds(node).map((kind) => (
                                <span className="tag" key={`${node.node_id}-kind-${kind}`}>{kind}</span>
                              ))}
                              {getRuntimeCapabilityTags(node).map((tag) => (
                                <span className="tag" key={`${node.node_id}-cap-${tag}`}>{tag}</span>
                              ))}
                              {isSessionNode(node) ? <span className="tag">session-node</span> : null}
                              {isTestPayloadNode(node) ? <span className="tag bad">test payload</span> : null}
                            </div>

                            {node.last_heartbeat_at ? (
                              <div className="small">heartbeat: {node.last_heartbeat_at}</div>
                            ) : null}

                            {isTestPayloadNode(node) ? (
                              <div className="small">
                                This node appears modified by Swagger example data. Re-register from Explorer.
                              </div>
                            ) : null}

                            <button
                              className="btn"
                              type="button"
                              onClick={(event) => openRuntimeContextMenu(event, node)}
                              style={{ marginTop: 8 }}
                            >
                              ⋯
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {ingestClaims.length > 0 ? (
              <>
                <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
                  <h2>Ingest Claims</h2>
                  <div className="meta-line">
                    <span className="kbd">/api/ingest/claims</span>
                    <span className="small">Showing latest {latestIngestClaims.length} of {ingestClaims.length} claims · {hiddenIngestClaimsCount} hidden</span>
                  </div>
                  {hiddenIngestClaimsCount > 0 ? (
                    <div className="meta-line">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => resetHiddenIngestClaims()}
                      >
                        Show hidden / Reset hidden claims
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="ingest-claims-panel">
                  <div className="ingest-claims-list">
                    {latestIngestClaims.map((claim) => (
                      <div
                        className="ingest-claim-card card"
                        key={claim.claim_id}
                        onContextMenu={(event) => openIngestClaimContextMenu(event, claim)}
                      >
                        <strong className="claim-row" title={claim.claim_id}>{claim.claim_id}</strong>
                        <div className="small claim-row">{claim.node_id}</div>
                        <div className="small claim-row">{claim.source_name}</div>
                        <div className="tagrow">
                          <span className="tag">{claim.status}</span>
                          {claim.materialization_mode ? <span className="tag">{claim.materialization_mode}</span> : null}
                          {isTestPayloadClaim(claim) ? <span className="tag bad">test payload</span> : null}
                        </div>
                        <button
                          className="btn"
                          type="button"
                          onClick={(event) => openIngestClaimContextMenu(event, claim)}
                        >
                          ⋯
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
              <h2>Tags</h2>
              <div className="meta-line">
                <span className="kbd">client-side</span>
              </div>
            </div>
            <div className="taglist">
              {tags.length === 0 ? (
                <span className="tag">No tags</span>
              ) : (
                tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)
              )}
            </div>

            <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
              <h2>AI Tags</h2>
              <div className="meta-line">
                <span className="kbd">client-side</span>
              </div>
            </div>
            <div className="taglist">
              {aiTags.length === 0 ? (
                <span className="tag">No AI tags</span>
              ) : (
                aiTags.map((tag) => <span className="tag" key={tag}>{tag}</span>)
              )}
            </div>

            <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
              <h2>Bridge</h2>
              <div className="meta-line">
                <span className="kbd">server-side</span>
              </div>
            </div>
            <div style={{ padding: '12px' }}>
              <div className="card">
                <strong>Junction picker</strong>
                <div className="small">
                  Bridge routing is handled on the host. Use the server-side junction picker to stage and commit.
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button className="btn" type="button" disabled>
                    Open junction picker
                  </button>
                </div>
              </div>
            </div>

            <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
              <h2>Resolve</h2>
              <div className="meta-line">
                <span className="kbd">/api/resolve/open</span>
              </div>
            </div>
            <div style={{ padding: '12px' }}>
              <div className="card">
                <strong>Mode</strong>
                <div className="small">Queue selected clips, then dispatch.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginTop: '10px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Project mode</label>
                  <select
                    value={resolveProjectMode}
                    onChange={(event) => setResolveProjectMode(event.target.value)}
                    style={{
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="current">Use current project</option>
                    <option value="__select__">Let host choose</option>
                    <option value="__new__">Create new project</option>
                  </select>

                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Project name</label>
                  <input
                    value={resolveProjectName}
                    onChange={(event) => setResolveProjectName(event.target.value)}
                    placeholder="P1-Public-Accountability"
                    style={{
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                    }}
                  />

                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>New project name (if creating)</label>
                  <input
                    value={resolveNewName}
                    onChange={(event) => setResolveNewName(event.target.value)}
                    placeholder="P3-Editorial"
                    style={{
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                    }}
                  />

                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Action</label>
                  <select
                    value={resolveMode}
                    onChange={(event) => setResolveMode(event.target.value)}
                    style={{
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="import">Import into media pool</option>
                    <option value="reveal_in_explorer">Reveal in Explorer/Finder</option>
                  </select>

                  <div className="small">{resolveHint}</div>
                </div>
              </div>
            </div>

            <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
              <h2>Upload</h2>
              <div className="meta-line">
                <span className="kbd">/api/projects/*/upload</span>
              </div>
            </div>
            <div style={{ padding: '12px' }}>
              <div className="card">
                <strong>Upload to active project</strong>
                <div className="small">{uploadCaption}</div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                  <input ref={uploadInputRef} type="file" style={{ maxWidth: '100%', color: 'var(--muted)' }} />
                  <button className="btn good" type="button" onClick={handleUpload} disabled={!activeProject}>
                    Upload
                  </button>
                </div>
                <div className="small" style={{ marginTop: '8px' }}>{uploadStatus}</div>
              </div>
            </div>
          </div>
        </aside>

        <section
          ref={mediaContentRef}
          className={`content custom-ui-surface ${dragActive ? 'drag-active' : ''} ${contentLoading ? 'is-loading' : ''} ${pinchPerfActive ? 'pinch-perf-active' : ''} ${overlayEnabled ? '' : 'overlay-hidden'} ${focusWorldActive ? 'focus-world-active' : ''}`}
          onContextMenuCapture={(event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.closest('.asset, .row')) return;
            clearPendingLongPress();
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerLeave={clearPendingLongPress}
          onDragOver={(event) => {
            if (event.dataTransfer?.types.includes('Files')) {
              clearPendingLongPress();
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDragActive(true);
            }
          }}
          onDragLeave={() => {
            clearPendingLongPress();
            setDragActive(false);
          }}
          onDrop={(event) => {
            if (event.dataTransfer?.files?.length) {
              event.preventDefault();
              setDragActive(false);
              void handleDropUpload(event.dataTransfer.files);
            }
          }}
        >
          <div className="content-loading" aria-hidden="true">
            <div className="spinner"></div>
            <div>Preparing thumbnails…</div>
          </div>
          <PinchShaderOverlay
            active={pinchOverlayActive}
            fingerA={pinchFingerA}
            fingerB={pinchFingerB}
            nodeCount={pinchDisplayNodeCount}
            onPulse={(trigger) => {
              pinchPulseTriggerRef.current = trigger;
            }}
          />
          <TapShaderOverlay tapPoint={tapOverlayPoint} tapTrigger={tapOverlayTrigger} />
          <HoldShaderOverlay
            holdPoint={holdOverlayPoint}
            active={holdOverlayActive}
            progress={holdOverlayProgress}
            completionBeat={holdOverlayCompleteBeat}
          />
          <div
            ref={setMediaScrollViewportNode}
            className="scroll"
            onScroll={clearPendingLongPress}
            data-topbar-hidden={topbarHidden ? 'true' : 'false'}
            data-density-pinch-surface="true"
            style={{ '--topbar-measured-height': `${topbarMeasuredHeight}px` } as React.CSSProperties}
          >
            <div className="topbar-anchor" aria-hidden="true">
              <div className="topbar" ref={topbarRef} data-topbar-root="true">
                <div className="topbar-inner">
                  <div
                    className={`brand ${sidebarOpen ? 'projects-open' : ''}`}
                    title="LAN-only media-sync-api explorer"
                    ref={brandRef}
                    role="button"
                    tabIndex={0}
                    aria-label="Toggle projects panel"
                    onClick={toggleSidebarOpen}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      toggleSidebarOpen();
                    }}
                  >
                    <div className="logo" aria-hidden="true"></div>
                    <div className="brand-text">
                      <h1>
                        <span className="brand-title is-primary">Cdaprod's Explorer</span>
                        <span className="brand-title is-secondary">Cdaprod's Projects</span>
                      </h1>
                      <div className="sub">media-sync-api</div>
                    </div>
                  </div>

                  <div className="toolbar">
                    <div className="toolbar-toggle" aria-hidden="true"></div>
                    <div className="topbar-controls">
                      <div className="search" role="search" data-interactive="true" data-topbar-control="true">
                        <span className="kbd">⌘K</span>
                        <div className="search-input-wrap" data-topbar-control="true">
                          <input
                            className="search-input"
                            data-interactive="true"
                            data-topbar-control="true"
                            ref={searchInputRef}
                            placeholder="Search filename, path… (client-side filter)"
                            autoComplete="off"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onFocus={() => topbarIntentRef.current?.setPinned(true)}
                            onBlur={() => {
                              topbarIntentRef.current?.setPinned(false);
                              topbarIntentRef.current?.scheduleClose(360);
                            }}
                          />
                        </div>
                        <div className="search-toolbar" aria-label="Search filters" data-interactive="true" data-topbar-control="true">
                          <details className="dropdown" data-interactive="true" data-topbar-control="true">
                            <summary className="control" aria-label="Filter by media type" data-interactive="true" data-topbar-control="true" onPointerDown={() => pinTopbarTemporarily(900)}>
                              Type: <span>{typeLabel}</span>
                            </summary>
                            <div className="dropdown-menu" role="listbox" aria-label="Media type filters">
                              <button type="button" data-interactive="true" data-topbar-control="true" className={typeFilter === 'all' ? 'is-active' : ''} onClick={handleTypeSelect('all')}>
                                All types
                              </button>
                              <button type="button" data-interactive="true" data-topbar-control="true" className={typeFilter === 'video' ? 'is-active' : ''} onClick={handleTypeSelect('video')}>
                                Video
                              </button>
                              <button type="button" data-interactive="true" data-topbar-control="true" className={typeFilter === 'image' ? 'is-active' : ''} onClick={handleTypeSelect('image')}>
                                Image
                              </button>
                              <button type="button" data-interactive="true" data-topbar-control="true" className={typeFilter === 'audio' ? 'is-active' : ''} onClick={handleTypeSelect('audio')}>
                                Audio
                              </button>
                              {mediaMeta.types.has('overlay') ? (
                                <button type="button" data-interactive="true" data-topbar-control="true" className={typeFilter === 'overlay' ? 'is-active' : ''} onClick={handleTypeSelect('overlay')}>
                                  Overlay
                                </button>
                              ) : null}
                              <button type="button" data-interactive="true" data-topbar-control="true" className={typeFilter === 'unknown' ? 'is-active' : ''} onClick={handleTypeSelect('unknown')}>
                                Unknown
                              </button>
                            </div>
                          </details>
                        </div>
                      </div>
                      <button
                        className="btn actions-toggle"
                        type="button"
                        data-interactive="true"
                        data-topbar-control="true"
                        aria-expanded={actionsOpen}
                        onPointerDown={() => pinTopbarTemporarily(900)}
                        onClick={() => setActionsOpen((prev) => !prev)}
                      >
                        Actions ▾
                      </button>
                    </div>
                    <div className={`actions-panel ${actionsOpen ? 'open' : ''}`} role="region" aria-label="Explorer actions" data-interactive="true" data-topbar-panel="true">
                      <div className="seg" aria-label="View mode">
                        <button className={view === 'grid' ? 'active' : ''} type="button" data-interactive="true" data-topbar-control="true" onClick={() => setView('grid')}>
                          Grid
                        </button>
                        <button className={view === 'list' ? 'active' : ''} type="button" data-interactive="true" data-topbar-control="true" onClick={() => setView('list')}>
                          List
                        </button>
                      </div>

                      <div className="action-controls" aria-label="Sort and quick filters">
                        <label className="density-control" data-interactive="true" data-topbar-control="true">
                          <span>Density: {gridColumnCount}</span>
                          <input
                            ref={densitySliderRef}
                            id="asset-density-slider"
                            type="range"
                            min={MIN_COLUMNS_MOBILE}
                            max={MAX_COLUMNS_MOBILE}
                            step={1}
                            value={gridColumnCount}
                            data-interactive="true"
                            data-topbar-control="true"
                            onInput={(event: React.FormEvent<HTMLInputElement>) => {
                              const nextColumns = Number(event.currentTarget.value || DEFAULT_COLUMNS_MOBILE);
                              scrubDensityColumns(nextColumns);
                            }}
                            onPointerUp={settleDensityScrub}
                            onBlur={settleDensityScrub}
                            onKeyUp={settleDensityScrub}
                          />
                        </label>
                        <button
                          className={`btn toggle-btn ${overlayEnabled ? 'is-on' : ''}`}
                          type="button"
                          data-interactive="true"
                          data-topbar-control="true"
                          onClick={() => setOverlayEnabled((prev) => !prev)}
                        >
                          Overlays: {overlayEnabled ? 'On' : 'Off'}
                        </button>
                        <select
                          ref={sortSelectRef}
                          className="control visually-hidden"
                          aria-label="Sort media"
                          data-interactive="true"
                          data-topbar-control="true"
                          value={sortKey}
                          onChange={(event) => setSortKey(event.target.value as SortKey)}
                        >
                          <option value="newest">Sort: Newest</option>
                          <option value="oldest">Sort: Oldest</option>
                          <option value="name-asc">Sort: Name A→Z</option>
                          <option value="name-desc">Sort: Name Z→A</option>
                          <option value="size-desc" disabled={!mediaMeta.hasSize}>Sort: Size big→small</option>
                          <option value="size-asc" disabled={!mediaMeta.hasSize}>Sort: Size small→big</option>
                        </select>
                        <details className="dropdown" data-interactive="true" data-topbar-control="true">
                          <summary className="control" aria-label="Sort media" data-interactive="true" data-topbar-control="true" onPointerDown={() => pinTopbarTemporarily(900)}>
                            Sort: <span>{sortLabel}</span>
                          </summary>
                          <div className="dropdown-menu" role="listbox" aria-label="Sort media">
                            <button type="button" data-interactive="true" data-topbar-control="true" className={sortKey === 'newest' ? 'is-active' : ''} onClick={handleSortSelect('newest')}>Sort: Newest</button>
                            <button type="button" data-interactive="true" data-topbar-control="true" className={sortKey === 'oldest' ? 'is-active' : ''} onClick={handleSortSelect('oldest')}>Sort: Oldest</button>
                            <button type="button" data-interactive="true" data-topbar-control="true" className={sortKey === 'name-asc' ? 'is-active' : ''} onClick={handleSortSelect('name-asc')}>Sort: Name A→Z</button>
                            <button type="button" data-interactive="true" data-topbar-control="true" className={sortKey === 'name-desc' ? 'is-active' : ''} onClick={handleSortSelect('name-desc')}>Sort: Name Z→A</button>
                            <button type="button" data-interactive="true" data-topbar-control="true" className={sortKey === 'size-desc' ? 'is-active' : ''} onClick={handleSortSelect('size-desc')} disabled={!mediaMeta.hasSize}>Sort: Size big→small</button>
                            <button type="button" data-interactive="true" data-topbar-control="true" className={sortKey === 'size-asc' ? 'is-active' : ''} onClick={handleSortSelect('size-asc')} disabled={!mediaMeta.hasSize}>Sort: Size small→big</button>
                          </div>
                        </details>
                        <div className="pillbar">
                          <button className={`btn toggle-btn ${selectedOnly ? 'is-on' : ''}`} type="button" data-interactive="true" data-topbar-control="true" onClick={() => setSelectedOnly((prev) => !prev)}>
                            Selected only
                          </button>
                          <button className={`btn toggle-btn ${untaggedOnly ? 'is-on' : ''}`} type="button" data-interactive="true" data-topbar-control="true" onClick={() => setUntaggedOnly((prev) => !prev)} disabled={!mediaMeta.hasTags} title={mediaMeta.hasTags ? '' : 'No tagged items yet'}>
                            Untagged only
                          </button>
                        </div>
                      </div>

                      <div className="pillbar">
                        <button className="btn" type="button" data-interactive="true" data-topbar-control="true" onClick={refreshAll}>↻ Refresh</button>
                        <button className="btn good" type="button" data-interactive="true" data-topbar-control="true" onClick={pickUpload}>＋ Upload</button>
                        <button className="btn primary" type="button" data-interactive="true" data-topbar-control="true" onClick={handleResolve} disabled={!selectedCount || !activeProject}>⇢ Send to Resolve</button>
                        <button className="btn" type="button" data-interactive="true" data-topbar-control="true" onClick={clearSelection} disabled={!selectedCount}>✕ Clear</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="section-h">
                  <h2>{contentTitle}</h2>
                  <div className="meta-line">
                    <span>{filteredMedia.length} items</span>
                    <span>•</span>
                    <span className="kbd">{activePath}</span>
                  </div>
                </div>
              </div>
            </div>
            <div
              className="scroll-content"
              data-topbar-hidden={topbarHidden ? 'true' : 'false'}
              style={
                {
                  '--scroll-content-top-inset': 'calc(var(--topbar-measured-height) + var(--topbar-gap))',
                } as React.CSSProperties
              }
            >
              <div
                className="focus-world-stage"
                ref={focusWorldStageRef}
                data-focus-world={focusWorldActive ? 'true' : 'false'}
                style={{
                  '--focus-world-scale': String(focusWorldTransform.scale),
                  '--focus-world-translate-x': `${focusWorldTransform.x}px`,
                  '--focus-world-translate-y': `${focusWorldTransform.y}px`,
                  '--focus-world-origin-x': `${focusWorldTransform.originX}%`,
                  '--focus-world-origin-y': `${focusWorldTransform.originY}%`,
                  '--focus-world-duration': `${FOCUS_WORLD_OPEN_DURATION_MS}ms`,
                } as React.CSSProperties}
              >
                <div className="grid" style={{ display: view === 'grid' ? '' : 'none' }}>
                  {!activeProject && mediaScope !== 'all' ? (
                    <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                      Select a project to view media.
                    </div>
                  ) : renderedMediaEntries.length === 0 ? (
                    <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                      {mediaScope === 'all'
                        ? 'No indexed files yet across all projects.'
                        : <>No indexed files yet. Upload then run <code>/reindex</code>.</>}
                    </div>
                  ) : (
                    <AssetGrid
                      buildAssetViewModel={buildAssetViewModel}
                      canSelect={canSelect}
                      gridColumnCount={gridColumnCount}
                      gridRef={bindGridSurface}
                      entries={renderedMediaEntries}
                      onToggleSelected={toggleSelected}
                      onDismissPendingJob={removePendingJob}
                    />
                  )}
                </div>

                <div className="list" style={{ display: view === 'list' ? '' : 'none' }}>
                  {!activeProject && mediaScope !== 'all' ? (
                    <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                      Select a project to view media.
                    </div>
                  ) : renderedMediaEntries.length === 0 ? (
                    <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                      {mediaScope === 'all'
                        ? 'No indexed files yet across all projects.'
                        : <>No indexed files yet. Upload then run <code>/reindex</code>.</>}
                    </div>
                  ) : (
                    <AssetList
                      buildAssetViewModel={buildAssetViewModel}
                      canSelect={canSelect}
                      items={renderedMediaEntries}
                      onOpenPreview={openPreview}
                      onToggleSelected={toggleSelected}
                      onDismissPendingJob={removePendingJob}
                    />
                  )}
                </div>
              </div>
              <div
                className={`grid-cinematic-root ${gridCinematicActive ? 'is-active' : ''} ${cinematicStageReady ? 'is-stage-ready' : ''} ${cinematicRevealState.worldVisible ? 'is-world-visible' : ''} ${cinematicRevealState.topbarHidden ? 'is-topbar-hidden' : ''}`}
                aria-hidden={!gridCinematicActive}
                data-grid-cinematic-root="true"
                data-world-pulse={String(cinematicRevealState.worldPulseTick)}
              >
                <div className={`grid-cinematic-header ${cinematicRevealState.headerVisible ? 'is-visible' : ''}`} data-grid-cinematic-header="true">
                  <span className={`grid-cinematic-chip ${cinematicRevealState.chipVisible ? 'is-visible' : ''}`} data-grid-cinematic-chip="true">Grid cinematic</span>
                </div>
                <div className={`grid-cinematic-bars ${cinematicRevealState.barsVisible ? 'is-visible' : ''}`} data-grid-cinematic-bars="true">
                  <div className="grid-cinematic-bar top"></div>
                  <div className="grid-cinematic-bar bottom"></div>
                </div>
                <div className={`grid-cinematic-media ${cinematicRevealState.mediaVisible ? 'is-visible' : ''} ${cinematicRevealState.shellVisible ? 'is-shell-visible' : ''}`} data-grid-cinematic-media="true">
                  {normalizedPreviewAsset?.kind === 'video' ? (
                    <video
                      key={normalizedPreviewAsset.id}
                      src={normalizedPreviewAsset.src}
                      className="grid-cinematic-media-el"
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={normalizedPreviewAsset?.src || ''}
                      alt={normalizedPreviewAsset?.name || 'Preview'}
                      className="grid-cinematic-media-el"
                    />
                  )}
                </div>
                <div className="grid-cinematic-scrim" data-grid-cinematic-scrim="true"></div>
                <div className={`grid-cinematic-top ${cinematicRevealState.topVisible ? 'is-visible' : ''}`} data-grid-cinematic-top="true">
                  <div className="title">{normalizedPreviewAsset?.name || ''}</div>
                  <button className="btn" type="button" onClick={closeDrawer}>Close</button>
                </div>
                <div className={`grid-cinematic-nav ${cinematicRevealState.navVisible ? 'is-visible' : ''}`} data-grid-cinematic-nav="true">
                  <button className="btn" type="button" onClick={() => focusRelative(-1)}>Prev</button>
                  <button className="btn" type="button" onClick={() => focusRelative(1)}>Next</button>
                </div>
                <div className={`grid-cinematic-bottom ${cinematicRevealState.bottomVisible ? 'is-visible' : ''}`} data-grid-cinematic-bottom="true">
                  <div className="meta">{normalizedPreviewAsset?.path || ''}</div>
                  <div className={`actions ${cinematicRevealState.actionsVisible ? 'is-visible' : ''}`} data-grid-cinematic-actions="true">
                    <button className="btn" type="button" onClick={() => { if (focused) void handleCopyStream(focused); }}>Copy URL</button>
                    <button className="btn" type="button" onClick={() => { if (focused) toggleSelected(focused); }}>
                      {focused && selected.has(assetSelectionKey(focused, activeProject)) ? 'Deselect' : 'Select'}
                    </button>
                  </div>
                </div>
                <button className={`grid-cinematic-close ${cinematicRevealState.closeVisible ? 'is-visible' : ''}`} type="button" onClick={closeDrawer} aria-label="Close cinematic preview">✕</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={`selectbar custom-ui-surface ${selectedCount ? 'show' : ''}`} role="status" aria-live="polite">
        <div className="count">
          <span>{selectedCount}</span> selected
        </div>
        <div className="sep"></div>
        <button className="btn" type="button" onClick={handlePreviewSelected}>
          ▶ Preview
        </button>
        <button
          className="btn primary"
          type="button"
          onClick={handleResolve}
          disabled={!activeProject || !selectedCount}
        >
          ⇢ Send to Resolve
        </button>
        <button
          className="btn"
          type="button"
          onClick={handleBulkTag}
          disabled={!selectedCount}
        >
          🏷 Tag
        </button>
        <button
          className="btn"
          type="button"
          onClick={handleComposeSelected}
          disabled={!selectedCount}
        >
          🎬 Compose
        </button>
        <button
          className="btn bad"
          type="button"
          onClick={() => deleteMediaSelection(selectedKeysOrdered)}
          disabled={!selectedCount}
        >
          🗑 Delete
        </button>
        <button className="btn" type="button" onClick={clearSelection}>
          ✕ Clear
        </button>
      </div>

      <div
        ref={focusProxyRootRef}
        className={`focus-proxy-root ${gridCinematicMode !== 'grid-rest' ? 'is-active' : ''}`}
        data-focus-proxy-root="true"
        data-focus-proxy-layer="true"
        aria-hidden="true"
      >
        {proxyPreviewVisible && proxyPreviewPortalTarget ? createPortal(
          <div className="proxy-preview-ui" data-focus-proxy-layer="true" onPointerDown={(event) => event.stopPropagation()}>
            <ProxyFocusedChromeFullParity
              asset={normalizedPreviewAsset}
              playable={Boolean(normalizedPreviewAsset && (normalizedPreviewAsset.kind === 'video' || normalizedPreviewAsset.kind === 'audio'))}
              isPlaying={proxyPlaybackPlaying}
              currentTime={proxyPlaybackCurrentTime}
              duration={proxyPlaybackDuration}
              onSeek={handleProxySeek}
              onTogglePlay={handleProxyTogglePlay}
              onSkipBack={handleProxySkipBack}
              onSkipForward={handleProxySkipForward}
              onPrev={() => focusRelative(-1)}
              onNext={() => focusRelative(1)}
              onClose={closeDrawer}
              onCopy={() => { if (focused) void handleCopyStream(focused); }}
              onSelect={() => { if (focused) toggleSelected(focused); }}
              onDelete={() => { if (focused) void deleteMediaSelection([assetSelectionKey(focused, activeProject)]); }}
              onTag={() => { void handleFocusedTag(); }}
              onObs={() => { void handleFocusedObs(); }}
              onResolve={() => { void handleFocusedResolve(); }}
              onProgramMonitor={() => { void handleFocusedProgramMonitor(); }}
              showResolve={Boolean(activeProject || focused?.project_name)}
              showProgramMonitor
              metadataRows={previewMetadataRows}
              detailsOpen={previewDetailsOpen}
              onDetailsToggle={() => setPreviewDetailsOpen((prev) => !prev)}
              selected={Boolean(focused && selected.has(assetSelectionKey(focused, activeProject)))}
            />
          </div>,
          proxyPreviewPortalTarget,
        ) : null}
      </div>
      <video
        ref={proxyPrewarmVideoRef}
        className="proxy-prewarm-video"
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />

      <aside
        className={`drawer ${focusOverlayReady ? 'focus-overlay-ready' : ''} ${focusPresentationState.mode === 'world-focus' ? 'world-focus-suppressed' : ''}`}
        data-inspector-drawer="true"
        aria-hidden={!drawerVisibleOwner}
      >
        <div className="drawer-body custom-ui-surface">
          {drawerVisibleOwner ? (
            <AssetPreviewPanel
              asset={normalizedPreviewAsset}
              onPrev={() => focusRelative(-1)}
              onNext={() => focusRelative(1)}
              onClose={closeDrawer}
              onCopy={() => { if (focused) void handleCopyStream(focused); }}
              onSelect={() => { if (focused) toggleSelected(focused); }}
              onDelete={() => { if (focused) void deleteMediaSelection([assetSelectionKey(focused, activeProject)]); }}
              onTag={() => { void handleFocusedTag(); }}
              onObs={() => { void handleFocusedObs(); }}
              onResolve={() => { void handleFocusedResolve(); }}
              onProgramMonitor={() => { void handleFocusedProgramMonitor(); }}
              showResolve={Boolean(activeProject || focused?.project_name)}
              showProgramMonitor
              obsMode={previewObsMode}
              obsSlot={previewObsSlot}
              obsExclusive={previewObsExclusive}
              onObsModeChange={setPreviewObsMode}
              onObsSlotChange={setPreviewObsSlot}
              onObsExclusiveChange={setPreviewObsExclusive}
              metadataRows={previewMetadataRows}
              detailsOpen={previewDetailsOpen}
              onDetailsToggle={() => setPreviewDetailsOpen((prev) => !prev)}
              selected={Boolean(focused && selected.has(assetSelectionKey(focused, activeProject)))}
              playOnAssetChangeToken={previewAutoPlayToken}
            />
          ) : null}
        </div>
      </aside>

      {contextMenu?.kind === 'media_asset' ? (
        <div
          className="context-menu open custom-ui-surface"
          ref={contextMenuRef}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                closeContextMenu();
                action.handler();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {contextMenu?.kind === 'source' ? (
        <div
          ref={contextMenuRef}
          className="context-menu open custom-ui-surface"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" onClick={() => runContextAction(() => undefined)}>
            Open in Explorer
          </button>
          <button
            type="button"
            onClick={() => runContextAction(() => openPayloadDetails('Source details', contextMenu.source.name, contextMenu.source))}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => runContextAction(() => copyText(JSON.stringify(contextMenu.source, null, 2)))}
          >
            Copy Source JSON
          </button>
          {contextMenu.source.owner_node_id ? (
            <button
              type="button"
              onClick={() => runContextAction(() => copyText(contextMenu.source.owner_node_id ?? ''))}
            >
              Copy Owner Node ID
            </button>
          ) : null}
          {contextMenu.source.owner_node_id ? (
            <button
              type="button"
              onClick={() => runContextAction(() => openDevice(contextMenu.source.owner_node_id ?? ''))}
            >
              Open Device
            </button>
          ) : null}
        </div>
      ) : null}

      {contextMenu?.kind === 'runtime' ? (
        <div
          ref={contextMenuRef}
          className="context-menu open custom-ui-surface"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" onClick={() => runContextAction(() => openDevice(contextMenu.node.node_id))}>
            Open Device
          </button>
          <button type="button" onClick={() => runContextAction(() => heartbeatNodeNow(contextMenu.node.node_id))}>
            Heartbeat now
          </button>
          <button
            type="button"
            onClick={() => runContextAction(() => openPayloadDetails('Runtime details', contextMenu.node.node_id, contextMenu.node))}
          >
            Details
          </button>
          <button type="button" onClick={() => runContextAction(() => copyText(contextMenu.node.node_id))}>
            Copy Node ID
          </button>
          <button type="button" onClick={() => runContextAction(() => copyText(getDeviceUrl(contextMenu.node.node_id)))}>
            Copy Device URL
          </button>
          <button type="button" onClick={() => runContextAction(() => copyText(JSON.stringify(contextMenu.node, null, 2)))}>
            Copy Node JSON
          </button>
        </div>
      ) : null}

      {contextMenu?.kind === 'live_session' ? (
        <div
          ref={contextMenuRef}
          className="context-menu open custom-ui-surface"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" onClick={() => runContextAction(() => openPayloadDetails('Live session details', contextMenu.session.session_id, contextMenu.session))}>
            Details
          </button>
          <button type="button" onClick={() => runContextAction(() => copyText(contextMenu.session.session_id))}>
            Copy Session ID
          </button>
          <button type="button" onClick={() => runContextAction(() => copyText(JSON.stringify(contextMenu.session, null, 2)))}>
            Copy Session JSON
          </button>
        </div>
      ) : null}

      {contextMenu?.kind === 'ingest_claim' ? (
        <div
          ref={contextMenuRef}
          className="context-menu open custom-ui-surface"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => runContextAction(() => hideIngestClaim(contextMenu.claim.claim_id))}
          >
            Hide claim from sidebar
          </button>
          <button
            type="button"
            onClick={() => runContextAction(() => hideAllTestPayloadClaims())}
          >
            Hide all test payload claims
          </button>
          <button
            type="button"
            onClick={() => runContextAction(() => openPayloadDetails('Ingest claim details', `${contextMenu.claim.claim_id}${isTestPayloadClaim(contextMenu.claim) ? ' · test payload' : ''}`, contextMenu.claim))}
          >
            Details
          </button>
          <button type="button" onClick={() => runContextAction(() => copyText(contextMenu.claim.claim_id))}>
            Copy Claim ID
          </button>
          <button type="button" onClick={() => runContextAction(() => copyText(JSON.stringify(contextMenu.claim, null, 2)))}>
            Copy Claim JSON
          </button>
        </div>
      ) : null}

      <RuntimeDetailsModal
        isOpen={detailsModal !== null}
        title={detailsModal?.title ?? ''}
        subtitle={detailsModal?.subtitle}
        payload={detailsModal?.payload}
        onClose={() => setDetailsModal(null)}
      />

      {deleteModalRendered ? (
        <div
          ref={confirmModalRef}
          className="confirm-modal open"
          role="dialog"
          aria-modal="true"
          aria-busy={deleteSubmitting}
          aria-labelledby="confirmDeleteTitle"
          aria-describedby="confirmDeleteBody"
          onClick={() => {
            if (deleteSubmitting) return;
            handleDeleteCancel();
          }}
        >
          <div ref={confirmCardRef} className="confirm-card custom-ui-surface" onClick={(event) => event.stopPropagation()}>
            <h3 id="confirmDeleteTitle" className="confirm-title">{pendingDeleteSelectionKeys.length === 1 ? 'Delete this asset?' : `Delete ${Math.max(1, pendingDeleteSelectionKeys.length)} assets?`}</h3>
            <p id="confirmDeleteBody" className="confirm-body">This removes the media file from disk and updates the project index.</p>
            <div className="confirm-actions">
              <button className="btn" type="button" disabled={deleteSubmitting} onClick={handleDeleteCancel}>Cancel</button>
              <button
                ref={deleteConfirmButtonRef}
                className="btn bad"
                type="button"
                disabled={deleteSubmitting}
                onClick={() => { void handleDeleteConfirm(); }}
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {composeModalRendered ? (
        <div
          ref={composeModalRef}
          className="compose-modal open"
          role="dialog"
          aria-modal="true"
          aria-busy={composeSubmitting}
          aria-labelledby="composeModalTitle"
          onClick={() => {
            if (composeSubmitting) return;
            setComposeModalOpen(false);
          }}
        >
          <form
            ref={composeCardRef}
            className="compose-card custom-ui-surface"
            aria-busy={composeSubmitting}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void handleComposeConfirm();
            }}
          >
            <h3 id="composeModalTitle" className="compose-title">Compose video output</h3>
            <p className="compose-body">Choose the output filename and destination project.</p>
            <div className="compose-fields">
              <label className="compose-field">
                <span>Output file name (mp4)</span>
                <input
                  ref={composeNameInputRef}
                  value={composeOutputName}
                  onChange={(event) => setComposeOutputName(event.target.value)}
                  placeholder="compose-YYYYMMDDHHMMSS.mp4"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={composeSubmitting}
                />
              </label>
              <label className="compose-field">
                <span>Output project</span>
                <select
                  value={composeOutputProject}
                  onChange={(event) => setComposeOutputProject(event.target.value)}
                  data-compose-project-picker="1"
                  disabled={composeSubmitting}
                >
                  {projects.map((project) => (
                    <option key={`${project.source || 'primary'}::${project.name}`} value={project.name}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="compose-actions">
              <button className="btn" type="button" disabled={composeSubmitting} onClick={() => setComposeModalOpen(false)}>Cancel</button>
              <button className="btn good" type="submit" disabled={composeSubmitting}>{composeSubmitting ? 'Composing...' : 'Compose'}</button>
            </div>
          </form>
        </div>
      ) : null}

      <RegisterNodeModal
        isOpen={isRegisterNodeModalOpen}
        onClose={() => setIsRegisterNodeModalOpen(false)}
        onSuccess={(_node, _response: RegisterNodeResponse) => {
          void reloadSourceControl();
        }}
        registerNode={api.registerNode}
        authorityBaseUrl={authorityBaseUrl}
      />

      <div className="toasts">
        {toasts.map((toast) => (
          <div
            className={`toast ${toast.type}`}
            key={toast.id}
            ref={(node) => {
              if (!node) return;
              const knownNode = toastNodeMapRef.current.get(toast.id);
              if (!knownNode) {
                toastNodeMapRef.current.set(toast.id, node);
                toastMotionRef.current?.enter(node);
              } else if (knownNode !== node) {
                toastNodeMapRef.current.set(toast.id, node);
              }
              if (toast.exiting && !toastExitingRef.current.has(toast.id)) {
                toastExitingRef.current.add(toast.id);
                toastMotionRef.current?.exit(node, () => removeToast(toast.id));
              }
            }}
          >
            <div className="t">{toast.title}</div>
            <div className="m">{toast.message}</div>
          </div>
        ))}
      </div>
      <div
        className={`backdrop sidebar-backdrop ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      ></div>
      <div
        className={`backdrop inspector-backdrop ${focusOverlayReady ? 'focus-overlay-ready' : ''}`}
        ref={inspectorBackdropRef}
        data-inspector-backdrop="true"
        aria-hidden={!inspectorOpen}
        onClick={closeDrawer}
      ></div>
    </div>
  );
}
