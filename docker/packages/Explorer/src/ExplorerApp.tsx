'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { AssetGrid } from './components/AssetGrid';
import { AssetList } from './components/AssetList';
import { normalizePreviewAsset } from './previewAdapter';
import { buildThumbJobKey, getThumbCacheKey, getThumbLoadState, normalizeThumbUrl } from './thumbnailLoader';
import { usePendingComposeJobs } from './usePendingComposeJobs';
import { useAssetInteractions } from './useAssetInteractions';
import { useThumbnailQueue } from './useThumbnailQueue';
import { useTopbarScrollState } from './useTopbarScrollState';
import { createTopbarMotion } from './ui/motion/topbarMotion';
import { createDrawerMotion } from './ui/motion/drawerMotion';
import { createTopbarSnapBand } from './ui/motion/topbarSnapBand';
import { createToastMotion } from './ui/motion/toastMotion';
import { createModalMotion } from './ui/motion/modalMotion';
import { createExplorerDensityController } from './explorer/density/createExplorerDensityController';
import { createPinchDensityController } from './explorer/density/createPinchDensityController';
import { DEFAULT_COLUMNS_MOBILE, MAX_COLUMNS_MOBILE, MIN_COLUMNS_MOBILE } from './explorer/density/constants';

interface ExplorerAppProps {
  apiBaseUrl?: string;
}

type AssetRenderedEntry = { kind: 'asset'; item: MediaItem };
type PendingRenderedEntry = { kind: 'pending'; pendingItem: PendingComposeItem };
type RenderedMediaEntry = AssetRenderedEntry | PendingRenderedEntry;

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
const FILTER_PREFS_KEY = 'media-sync-explorer-filters-v1';
const ORIENT_CACHE_KEY = 'media-sync-orient-cache-v1';

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

function useToastQueue() {
  const [toasts, setToasts] = useState<Array<ToastMessage & { exiting: boolean }>>([]);
  const timeouts = useRef<number[]>([]);

  const addToast = useCallback((type: ToastMessage['type'], title: string, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, title, message, exiting: false }]);
    const timeout = window.setTimeout(() => {
      setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)));
    }, 3100);
    timeouts.current.push(timeout);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  return { toasts, addToast, removeToast };
}

export function ExplorerApp({ apiBaseUrl = '' }: ExplorerAppProps) {
  const initialApiBase = typeof window === 'undefined'
    ? apiBaseUrl
    : inferApiBaseUrl(apiBaseUrl, window.location);
  const [resolvedApiBase, setResolvedApiBase] = useState(initialApiBase);
  const api = useMemo(() => createApiClient(resolvedApiBase), [resolvedApiBase]);
  const { toasts, addToast, removeToast } = useToastQueue();

  const [projects, setProjects] = useState<Project[]>([]);
  const [sources, setSources] = useState([] as Awaited<ReturnType<typeof api.listSources>>);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaScope, setMediaScope] = useState<'project' | 'all'>('project');
  const [view, setView] = useState<ExplorerView>(DEFAULT_VIEW);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [activeAssetKey, setActiveAssetKey] = useState('');
  const [focused, setFocused] = useState<MediaItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [previewDetailsOpen, setPreviewDetailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MediaItem[] } | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [pendingDataLoadOverlay, setPendingDataLoadOverlay] = useState(false);
  const [gridColumnCount, setGridColumnCount] = useState(DEFAULT_COLUMNS_MOBILE);
  const [dynamicOrientations, setDynamicOrientations] = useState<Record<string, string>>({});
  const [gridSurfaceEl, setGridSurfaceEl] = useState<HTMLDivElement | null>(null);
  const contentLoadingTokenRef = useRef(0);
  const contentLoadingTimerRef = useRef<number | null>(null);

  const [resolveProjectMode, setResolveProjectMode] = useState('current');
  const [resolveProjectName, setResolveProjectName] = useState('');
  const [resolveNewName, setResolveNewName] = useState('');
  const [resolveMode, setResolveMode] = useState('import');

  const [previewObsMode, setPreviewObsMode] = useState<'cover' | 'fit' | 'fill'>('cover');
  const [previewObsSlot, setPreviewObsSlot] = useState('1');
  const [previewObsExclusive, setPreviewObsExclusive] = useState(false);
  const [previewAutoPlayToken, setPreviewAutoPlayToken] = useState(0);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [composeModalRendered, setComposeModalRendered] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeOutputName, setComposeOutputName] = useState('');
  const [composeOutputProject, setComposeOutputProject] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalRendered, setDeleteModalRendered] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [pendingDeleteSelectionKeys, setPendingDeleteSelectionKeys] = useState<string[]>([]);
  const [topbarHasOpenDropdown, setTopbarHasOpenDropdown] = useState(false);
  const [topbarFocusWithin, setTopbarFocusWithin] = useState(false);
  const composeNameInputRef = useRef<HTMLInputElement | null>(null);
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingStatusSnapshotRef = useRef<Map<string, PendingComposeItem['status']>>(new Map());

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaContentRef = useRef<HTMLDivElement | null>(null);
  const mediaScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const sortSelectRef = useRef<HTMLSelectElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const topbarPinTimeoutRef = useRef<number | null>(null);
  const orientationCacheRef = useRef<Map<string, string>>(new Map());
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
  const inspectorBackdropRef = useRef<HTMLDivElement | null>(null);
  const composeModalRef = useRef<HTMLDivElement | null>(null);
  const composeCardRef = useRef<HTMLFormElement | null>(null);
  const confirmModalRef = useRef<HTMLDivElement | null>(null);
  const confirmCardRef = useRef<HTMLDivElement | null>(null);
  const toastNodeMapRef = useRef(new Map<string, HTMLDivElement>());
  const toastExitingRef = useRef(new Set<string>());
  const inspectorOpenRef = useRef(false);

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
    setActiveAssetKey('');
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

  const thumbDatasetSignature = useMemo(() => {
    const dataset = filteredMedia.map((item) => {
      const kind = guessKind(item);
      const thumbKey = getThumbCacheKey(item) || assetRenderKey(item, activeProject);
      const rawThumbUrl = normalizeThumbUrl(item.thumb_url
        || item.thumbnail_url
        || (kind === 'image' ? item.stream_url : undefined));
      const thumbUrl = rawThumbUrl ? resolveAssetUrl(rawThumbUrl) : '';
      return buildThumbJobKey(thumbKey, thumbUrl);
    });
    return `${view}:${view === 'grid' ? gridColumnCount : 'list'}:${dataset.join('\n')}`;
  }, [activeProject, assetRenderKey, filteredMedia, gridColumnCount, resolveAssetUrl, view]);

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
    setIsMobile(mobile);
    if (!mobile) {
      setSidebarOpen(false);
    }
  }, []);

  const clampDensityColumns = useCallback((value: number) => (
    Math.max(MIN_COLUMNS_MOBILE, Math.min(MAX_COLUMNS_MOBILE, Math.round(value)))
  ), []);

  useEffect(() => {
    setGridColumnCount((current) => clampDensityColumns(current));
  }, [clampDensityColumns]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(FILTER_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setTypeFilter((parsed.type as MediaTypeFilter) || 'all');
        setSortKey((parsed.sort as SortKey) || 'newest');
        setSelectedOnly(Boolean(parsed.selectedOnly));
        setUntaggedOnly(Boolean(parsed.untaggedOnly));
      }
    } catch {
      // ignore malformed prefs
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      type: typeFilter,
      sort: sortKey,
      selectedOnly,
      untaggedOnly,
    };
    window.localStorage.setItem(FILTER_PREFS_KEY, JSON.stringify(payload));
  }, [typeFilter, sortKey, selectedOnly, untaggedOnly]);

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

  const loadSources = useCallback(async () => {
    try {
      const payload = await api.listSources();
      setSources(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list sources';
      addToast('bad', 'Sources', message);
    }
  }, [api, addToast]);

  const loadProjects = useCallback(async () => {
    try {
      const payload = await api.listProjects();
      setProjects(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list projects';
      addToast('bad', 'Projects', message);
    }
  }, [api, addToast]);

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
    if (!projects.length) {
      setMedia([]);
      setPendingDataLoadOverlay(false);
      return;
    }
    const gathered: MediaItem[] = [];
    for (const project of projects) {
      try {
        const payload = await api.listMedia(project.name, project.source);
        const items = Array.isArray(payload.media) ? payload.media : [];
        items.forEach((item) => {
          gathered.push({
            ...item,
            project_name: project.name,
            project_source: project.source && project.source !== 'primary' ? project.source : null,
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load media';
        addToast('warn', 'Media', `Skipped ${project.name}: ${message}`);
      }
    }
    setMedia(sortMediaByRecent(gathered));
  }, [addToast, api, clearActiveAsset, clearSelectionState, projects]);

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
    const payload = await api.listMedia(refreshedProject.name, refreshedProject.source || undefined);
    const items = Array.isArray(payload.media) ? payload.media : [];
    const hydratedItems = hydrateProjectMediaItems(items, refreshedProject);

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
  }, [activeProject, api, hydrateProjectMediaItems, mediaScope, projects]);

  const fetchComposeJobJson = useCallback(async (url: string) => {
    const response = await fetch(api.buildUrl(url));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.detail || payload?.message || 'Failed to poll compose job'));
    }
    return payload;
  }, [api]);

  const {
    pendingComposeItems,
    registerAcceptedJob,
    removePendingJob,
  } = usePendingComposeJobs({
    pollIntervalMs: 2000,
    fetchJson: fetchComposeJobJson,
    mediaItems: media,
    onCompletedRefreshScope: async (refreshScope) => {
      await refreshMediaForScope(refreshScope);
      addToast('good', 'Compose', 'Compose completed');
    },
  });

  const refreshAll = useCallback(async () => {
    await loadSources();
    await loadProjects();
    if (activeProject) {
      await loadMedia(activeProject);
    } else {
      await loadAllMedia();
    }
    addToast('good', 'Refresh', 'Reloaded projects + media');
  }, [activeProject, addToast, loadAllMedia, loadMedia, loadProjects, loadSources]);

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

  const openDrawer = useCallback((item: MediaItem) => {
    focusAsset(item);
    setFocused(item);
    setPreviewDetailsOpen(false);
    setInspectorOpen(true);
  }, [focusAsset]);

  const closeDrawer = useCallback(() => {
    setInspectorOpen(false);
    setFocused(null);
    setPreviewDetailsOpen(false);
  }, []);

  const focusRelative = useCallback((offset: number) => {
    if (!focused || !filteredMedia.length) return;
    const currentKey = assetSelectionKey(focused, activeProject);
    const currentIndex = filteredMedia.findIndex((item) => assetSelectionKey(item, activeProject) === currentKey);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + offset + filteredMedia.length) % filteredMedia.length;
    const nextItem = filteredMedia[nextIndex] || focused;
    setFocused(nextItem);
    setActiveAssetKey(assetSelectionKey(nextItem, activeProject));
    setPreviewAutoPlayToken((prev) => prev + 1);
  }, [activeProject, assetSelectionKey, filteredMedia, focused]);

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
    try {
      const payload = await api.uploadMedia(buildUploadUrl(project), file);
      const status = typeof payload.status === 'string' ? payload.status : '';
      const msg = status === 'duplicate'
        ? 'Duplicate skipped — already on disk.'
        : 'Upload stored.';
      setUploadStatus(msg);
      addToast(status === 'duplicate' ? 'warn' : 'good', 'Upload', msg);
      await loadMedia(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadStatus(`Upload failed: ${message}`);
      addToast('bad', 'Upload', message);
    }
  }, [activeProject, addToast, api, buildUploadUrl, loadMedia]);

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
    if (!inspectorOpen) {
      setFocused(null);
    }
  }, [activeAssetKey, inspectorOpen, itemsBySelectionKey]);

  const performDeleteMediaSelection = useCallback(
    async (selectionKeys: string[]) => {
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
      setDeleteSubmitting(true);
      try {
        await api.bulkDeleteMedia(refs);
        addToast('good', 'Delete', 'Removed media from disk and index');
        const removedKeys = new Set(resolveSelectionKeysForItems(items));
        setSelected((current) => {
          const next = new Set(current);
          removedKeys.forEach((key) => next.delete(key));
          return next;
        });
        if (focused) {
          const focusedKey = assetSelectionKey(focused, activeProject);
          if (removedKeys.has(focusedKey)) {
            setFocused(null);
            setInspectorOpen(false);
          }
        }
        if (mediaScope === 'all' || !activeProject) await loadAllMedia();
        else await loadMedia(activeProject);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed';
        addToast('bad', 'Delete', message);
      } finally {
        setDeleteSubmitting(false);
      }
    },
    [activeProject, addToast, api, assetSelectionKey, focused, loadAllMedia, loadMedia, mediaScope, resolveItemsForSelection, resolveSelectionKeysForItems, toAssetRef],
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

  const moveMediaSelection = useCallback(
    async (selectionKeys: string[], targetProject: Project) => {
      const refs = resolveItemsForSelection(selectionKeys)
        .map((item) => toAssetRef(item))
        .filter((item): item is AssetRef => Boolean(item));
      if (!refs.length) {
        addToast('warn', 'Move', 'Unable to resolve selected media paths');
        return;
      }
      try {
        await api.bulkMoveMedia(refs, targetProject.name, targetProject.source || null);
        addToast('good', 'Move', `Moved ${refs.length} item(s) to ${targetProject.name}`);
        setSelected((current) => {
          const next = new Set(current);
          selectionKeys.forEach((key) => next.delete(key));
          return next;
        });
        if (focused) {
          const focusedKey = assetSelectionKey(focused, activeProject);
          if (selectionKeys.includes(focusedKey)) {
            setFocused(null);
            setInspectorOpen(false);
          }
        }
        if (mediaScope === 'all' || !activeProject) await loadAllMedia();
        else await loadMedia(activeProject);
        await loadProjects();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Move failed';
        addToast('bad', 'Move', message);
      }
    },
    [activeProject, addToast, api, assetSelectionKey, focused, loadAllMedia, loadMedia, loadProjects, mediaScope, resolveItemsForSelection, toAssetRef],
  );

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
    const refs = selectionItems
      .map((item) => toAssetRef(item))
      .filter((item): item is AssetRef => Boolean(item));
    if (!refs.length) {
      addToast('warn', 'Tags', 'Unable to resolve selected media paths');
      return;
    }
    try {
      await api.bulkTagMedia(refs, addTags, removeTags);
      addToast('good', 'Tags', `Updated tags for ${refs.length} item(s)`);
      if (mediaScope === 'all' || !activeProject) await loadAllMedia();
      else await loadMedia(activeProject);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tag update failed';
      addToast('bad', 'Tags', message);
    }
  }, [activeProject, addToast, api, loadAllMedia, loadMedia, mediaScope, selected, selectionItems, toAssetRef]);

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
    try {
      const response = await api.bulkComposeMedia({
        assets: refs,
        output_project: targetProject.name,
        output_name: outputName,
        output_source: targetProject.source || null,
        target_dir: 'exports',
        mode: 'encode',
        allow_overwrite: false,
      });
      registerAcceptedJob({ envelope: response as ComposeJobEnvelope });
      addToast('good', 'Compose', 'Compose started');
      setComposeModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Compose failed';
      addToast('bad', 'Compose', message);
    } finally {
      setComposeSubmitting(false);
    }
  }, [addToast, api, composeOutputName, composeOutputProject, composeSubmitting, projects, registerAcceptedJob, selectedVideoItems, toAssetRef]);

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

    try {
      const result = await api.sendResolve(payload, project.source);
      addToast('good', 'Resolve', `Sent. Job: ${result.job_id || 'ok'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resolve request failed';
      addToast('bad', 'Resolve', message);
    }
  }, [activeProject, addToast, api, resolveMode, resolveNewName, resolveProjectMode, resolveProjectName, selected, selectionItems]);


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
    const ref = toAssetRef(focused);
    if (!ref) {
      addToast('warn', 'Tag', 'Unable to resolve focused media path');
      return;
    }
    try {
      await api.bulkTagMedia([ref], addTags, removeTags);
      addToast('good', 'Tag', 'Updated tags for focused asset');
      if (mediaScope === 'all' || !activeProject) await loadAllMedia();
      else await loadMedia(activeProject);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tag update failed';
      addToast('bad', 'Tag', message);
    }
  }, [activeProject, addToast, api, focused, loadAllMedia, loadMedia, mediaScope, toAssetRef]);

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
    try {
      const result = await api.sendResolve({
        project: projectValue,
        new_project_name: resolveProjectMode === '__new__' ? resolveNewName.trim() || null : null,
        media_rel_paths: [focused.relative_path].filter((value): value is string => Boolean(value)),
        mode: resolveMode || 'import',
      }, sourceName);
      addToast('good', 'Resolve', `Sent. Job: ${result.job_id || 'ok'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resolve request failed';
      addToast('bad', 'Resolve', message);
    }
  }, [activeProject?.name, activeProject?.source, addToast, api, focused, resolveMode, resolveNewName, resolveProjectMode, resolveProjectName]);

  const handleFocusedProgramMonitor = useCallback(async () => {
    if (!focused) {
      addToast('warn', 'Program Monitor', 'Open a preview first');
      return;
    }
    const streamUrl = resolveAssetUrl(focused.stream_url);
    if (!streamUrl) {
      addToast('warn', 'Program Monitor', 'No stream URL available');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const absoluteStream = toAbsoluteUrl(streamUrl, origin);
    const monitorUrl = new URL('/program-monitor/index.html', origin).toString();
    const payload = {
      type: 'media-sync/program-monitor/import',
      items: [absoluteStream],
      source: 'explorer-overlay',
      sent_at: new Date().toISOString(),
    };
    const target = window.open(monitorUrl, '_blank', 'noopener,noreferrer');
    if (!target) {
      addToast('warn', 'Program Monitor', 'Allow popups to hand off media');
      return;
    }
    const targetOrigin = new URL(monitorUrl).origin;
    window.setTimeout(() => {
      try {
        target.postMessage(payload, targetOrigin);
      } catch {
        addToast('warn', 'Program Monitor', 'Unable to deliver handoff payload');
      }
    }, 220);
    addToast('good', 'Program Monitor', 'Sent focused asset to monitor');
  }, [addToast, focused, resolveAssetUrl]);

  const handleFocusedObs = useCallback(async () => {
    if (!focused) {
      addToast('warn', 'OBS', 'Open a preview first');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const assetUrl = toAbsoluteUrl(resolveAssetUrl(focused.stream_url), origin);
    if (!assetUrl) {
      addToast('warn', 'OBS', 'No stream URL available for this asset');
      return;
    }
    const obsPush = (window as Window & {
      obsPushBrowserMedia?: (opts: {
        assetUrl: string;
        fit?: string;
        slot?: number;
        ensureExclusiveScene?: boolean;
      }) => Promise<void>;
    }).obsPushBrowserMedia;
    if (!obsPush) {
      addToast('warn', 'OBS', 'OBS push helper is unavailable in this surface');
      return;
    }
    const fit = previewObsMode === 'fit' ? 'contain' : (previewObsMode === 'fill' ? 'fill' : 'cover');
    try {
      await obsPush({
        assetUrl,
        fit,
        slot: Number.parseInt(previewObsSlot, 10) || 1,
        ensureExclusiveScene: previewObsExclusive,
      });
      addToast('good', 'OBS', 'Browser source updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OBS push failed';
      addToast('bad', 'OBS', message);
    }
  }, [addToast, focused, previewObsExclusive, previewObsMode, previewObsSlot, resolveAssetUrl]);

  const handleDropUpload = useCallback(
    async (files: FileList) => {
      const project = activeProject;
      if (!project) {
        addToast('warn', 'Upload', 'Select a project first');
        return;
      }
      if (!files.length) return;
      setUploadStatus('Uploading…');
      for (const file of Array.from(files)) {
        try {
          await api.uploadMedia(buildUploadUrl(project), file);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
          addToast('bad', 'Upload', message);
        }
      }
      setUploadStatus('Upload stored.');
      await loadMedia(project);
    },
    [activeProject, addToast, api, buildUploadUrl, loadMedia],
  );

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

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const openContextMenu = useCallback((x: number, y: number, items: MediaItem[]) => {
    if (!items.length) return;
    setContextMenu({ x, y, items });
  }, []);

  const getContextActions = useCallback((items: MediaItem[]) => {
    const count = items.length;
    if (!count) return [];
    const single = count === 1;
    const item = items[0];
    const actions: Array<{ id: string; label: string; handler: () => void }> = [];

    if (single) {
      actions.push({ id: 'preview', label: 'Open preview', handler: () => openDrawer(item) });
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
  }, [deleteMediaSelection, handleCopySelectedUrls, handleCopyStream, openDrawer, resolveAssetUrl, resolveSelectionKeysForItems]);

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
    openDrawer,
    focusAsset,
    projects,
    selected,
    selectedKeysOrdered,
  });

  const handlePreviewSelected = useCallback(() => {
    const first = selectionItems[0];
    const item = first || null;
    if (item) openDrawer(item);
  }, [openDrawer, selectionItems]);

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
    scrollRef: mediaScrollViewportRef,
    topbarMeasuredHeight,
  });
  topbarHiddenRef.current = topbarHidden;
  inspectorOpenRef.current = inspectorOpen;

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
    });
    drawerMotionRef.current = controller;
    if (inspectorOpenRef.current) controller.open();
    else controller.setClosedState();

    const handleResize = () => {
      controller.syncLayoutMode();
      if (inspectorOpenRef.current) controller.open();
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
    if (inspectorOpen) controller.open();
    else controller.close(() => {
      controller.setClosedState();
    });
  }, [inspectorOpen]);

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
    addToast('good', 'Boot', 'Loading sources + projects…');
    void loadSources();
    void loadProjects();
  }, []);

  useEffect(() => {
    if (activeProject) {
      void loadMedia(activeProject);
    } else {
      void loadAllMedia();
    }
  }, [activeProject, loadAllMedia, loadMedia]);

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

    let lastTouchEndAt = 0;
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
    const blockDoubleTap = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEndAt < 320) {
        event.preventDefault();
      }
      lastTouchEndAt = now;
    };

    document.addEventListener('gesturestart', blockGesture, listenerOptions);
    document.addEventListener('gesturechange', blockGesture, listenerOptions);
    document.addEventListener('gestureend', blockGesture, listenerOptions);
    document.addEventListener('touchstart', blockMultiTouch, listenerOptions);
    document.addEventListener('touchend', blockDoubleTap, listenerOptions);

    return () => {
      document.removeEventListener('gesturestart', blockGesture);
      document.removeEventListener('gesturechange', blockGesture);
      document.removeEventListener('gestureend', blockGesture);
      document.removeEventListener('touchstart', blockMultiTouch);
      document.removeEventListener('touchend', blockDoubleTap);
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
    const sliderEl = densitySliderRef.current;
    const scrollerEl = mediaScrollViewportRef.current;
    if (!gridEl || !scrollerEl) return;

    const density = createExplorerDensityController({
      gridEl,
      sliderEl,
      initialColumns: densityControllerRef.current?.getColumns() ?? gridColumnCount ?? DEFAULT_COLUMNS_MOBILE,
      onColumnsCommit: (nextColumns) => {
        setGridColumnCount(nextColumns);
      },
      minColumns: MIN_COLUMNS_MOBILE,
      maxColumns: MAX_COLUMNS_MOBILE,
    });
    densityControllerRef.current = density;

    if (isMobile) {
      const pinch = createPinchDensityController({
        gestureSurfaceEl: scrollerEl,
        visualScaleTargetEl: gridEl,
        density,
      });
      pinch.attach();
      pinchDensityRef.current = pinch;
    }

    const onSliderInput = () => {
      if (!sliderEl) return;
      density.setColumns(Number(sliderEl.value || DEFAULT_COLUMNS_MOBILE), true);
    };
    if (sliderEl) sliderEl.addEventListener('input', onSliderInput);

    return () => {
      if (sliderEl) sliderEl.removeEventListener('input', onSliderInput);
      pinchDensityRef.current?.destroy();
      density.destroy();
      pinchDensityRef.current = null;
      densityControllerRef.current = null;
    };
  }, [gridSurfaceEl, isMobile, view]);

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
    () => (contextMenu ? getContextActions(contextMenu.items) : []),
    [contextMenu, getContextActions],
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
    window.requestAnimationFrame(() => composeNameInputRef.current?.focus());
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
    window.requestAnimationFrame(() => deleteConfirmButtonRef.current?.focus());
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteModalOpen, deleteSubmitting, handleDeleteCancel]);

  const uploadCaption = activeProject
    ? `Upload to ${activeProject.name}${activeProject.source ? ` (${activeProject.source})` : ''}`
    : 'Pick a project first.';
  const canSelect = Boolean(activeProject) || mediaScope === 'all';
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
    const rawThumbUrl = normalizeThumbUrl(item.thumb_url
      || item.thumbnail_url
      || (kind === 'image' ? item.stream_url : undefined));
    const fallbackThumb = buildThumbFallback(kind);
    const thumbUrl = rawThumbUrl ? resolveAssetUrl(rawThumbUrl) : undefined;
    const thumbJobKey = buildThumbJobKey(thumbKey, thumbUrl);
    const safeThumbUrl = thumbUrl && getThumbLoadState(thumbJobKey) !== 'error'
      ? thumbUrl
      : fallbackThumb;
    const selectionKey = renderKey;
    const isSelected = selected.has(selectionKey);
    const isActive = activeAssetKey === selectionKey;
    const selectionOrderIndex = selectedOrderMap.get(selectionKey) ?? 0;

    return {
      fallbackThumb,
      isActive,
      isSelected,
      item,
      kind,
      kindBadgeClassName: kindBadgeClass(kind),
      orient,
      orientLocked,
      pointerHandlers,
      renderKey,
      safeThumbUrl,
      selectionKey,
      selectionOrderLabel: selectionOrderIndex ? String(Math.min(selectionOrderIndex, 99)) : '',
      size,
      sub,
      thumbJobKey,
      thumbKey,
      thumbUrl,
      title,
    };
  }, [
    activeAssetKey,
    activeProject,
    assetRenderKey,
    buildAssetPointerHandlers,
    dynamicOrientations,
    getCachedOrientation,
    projectLabel,
    resolveAssetUrl,
    resolveItemOrientation,
    selected,
    selectedOrderMap,
  ]);

  const toggleSidebarOpen = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="app">
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

            <div className="section-h" style={{ borderTop: '1px solid var(--border)' }}>
              <h2>Sources / Libraries</h2>
              <div className="meta-line">
                <span className="kbd">/api/sources</span>
              </div>
            </div>
            <div className="sources">
              {sources.length === 0 ? (
                <div className="card">
                  <strong>No sources</strong>
                  <div className="small">Only the primary mount is available.</div>
                </div>
              ) : (
                sources.map((source) => (
                  <div className="card" key={source.name}>
                    <strong>{source.name}</strong>
                    <div className="small">{source.root}</div>
                    <div className="tagrow">
                      <span className={`tag ${source.enabled ? 'good' : ''}`}>
                        {source.enabled ? 'enabled' : 'disabled'}
                      </span>
                      <span className={`tag ${source.accessible ? 'good' : 'bad'}`}>
                        {source.accessible ? 'reachable' : 'unreachable'}
                      </span>
                      <span className="tag">{source.type || 'local'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

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
          className={`content custom-ui-surface ${dragActive ? 'drag-active' : ''} ${contentLoading ? 'is-loading' : ''}`}
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
          <div
            ref={mediaScrollViewportRef}
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
                        <input
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
                            onChange={(event) => {
                              const nextColumns = Number(event.target.value || DEFAULT_COLUMNS_MOBILE);
                              densityControllerRef.current?.setColumns(nextColumns, true);
                            }}
                          />
                        </label>
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
                    onOpenDrawer={openDrawer}
                    onToggleSelected={toggleSelected}
                    onDismissPendingJob={removePendingJob}
                  />
                )}
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

      <aside className="drawer" data-inspector-drawer="true" aria-hidden={!inspectorOpen}>
        <div className="drawer-body custom-ui-surface">
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
        </div>
      </aside>

      {contextMenu ? (
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
        className="backdrop inspector-backdrop"
        ref={inspectorBackdropRef}
        data-inspector-backdrop="true"
        aria-hidden={!inspectorOpen}
        onClick={closeDrawer}
      ></div>
    </div>
  );
}
