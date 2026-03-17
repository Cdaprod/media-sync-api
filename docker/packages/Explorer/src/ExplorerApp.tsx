'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient } from './api';
import type { AssetRef } from './api';
import {
  buildMasonryColumns,
  collectMediaMeta,
  extractAiTags,
  extractTags,
  filterMedia,
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
  kindBadgeClass,
  toAbsoluteUrl,
} from './utils';
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { normalizePreviewAsset } from './previewAdapter';

interface ExplorerAppProps {
  apiBaseUrl?: string;
}

const DEFAULT_VIEW: ExplorerView = 'grid';
const POINTER_THRESHOLD = 8;
const LONG_PRESS_MOVE_CANCEL_PX = 12;
const LONG_PRESS_MS = 620;

const suppressNativeContextMenu = (event: React.MouseEvent<HTMLElement>) => {
  event.preventDefault();
  event.stopPropagation();
};

const suppressNativeDragGhost = (event: React.DragEvent<HTMLElement>) => {
  event.preventDefault();
};

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

const normalizeThumbUrl = (rawUrl?: string): string | undefined => {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        return `${window.location.origin}${parsed.pathname}${parsed.search}`;
      }
      return parsed.href;
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
};

const queueThumbLoads = async (
  targets: HTMLImageElement[],
  timeoutMs: number,
  onOrientation: (node: HTMLImageElement) => void,
): Promise<void> => {
  if (!targets.length) return;
  const jobs = targets
    .map((target) => ({
      target,
      url: target.dataset.thumbUrl,
      fallback: target.dataset.thumbFallback,
    }))
    .filter((job) => Boolean(job.url));
  if (!jobs.length) return;
  let active = 0;
  let index = 0;
  let settled = false;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, timeoutMs);
    const startNext = () => {
      while (active < THUMB_MAX_WORKERS && index < jobs.length) {
        const job = jobs[index++];
        if (!job.url) continue;
        active += 1;
        const loader = new Image();
        loader.onload = () => {
          job.target.src = job.url as string;
          job.target.dataset.thumbState = 'loaded';
          if (job.target.complete) {
            onOrientation(job.target);
          } else {
            job.target.addEventListener('load', () => onOrientation(job.target), { once: true });
          }
          active -= 1;
          if (index >= jobs.length && active === 0 && !settled) {
            settled = true;
            window.clearTimeout(timer);
            resolve();
          } else {
            startNext();
          }
        };
        loader.onerror = () => {
          if (job.fallback) {
            job.target.src = job.fallback as string;
          }
          job.target.dataset.thumbState = 'error';
          active -= 1;
          if (index >= jobs.length && active === 0 && !settled) {
            settled = true;
            window.clearTimeout(timer);
            resolve();
          } else {
            startNext();
          }
        };
        loader.src = job.url as string;
      }
      if (index >= jobs.length && active === 0 && !settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve();
      }
    };
    startNext();
  });
};

const THUMB_MAX_WORKERS = 3;
const THUMB_LOAD_TIMEOUT_MS = 8000;
const CONTENT_LOADING_DELAY_MS = 180;
const GRID_GAP_FALLBACK = 6;
const GRID_COL_WIDTH_FALLBACK = 180;
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

const getThumbCacheKey = (item: MediaItem) => {
  const project = item.project_name || item.project || '';
  const source = item.project_source || item.source || '';
  const rel = item.relative_path || '';
  const sha = item.sha256 || item.hash || '';
  return [source, project, rel, sha].filter(Boolean).join('|');
};

function useToastQueue() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timeouts = useRef<number[]>([]);

  const addToast = useCallback((type: ToastMessage['type'], title: string, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    const timeout = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3100);
    timeouts.current.push(timeout);
  }, []);

  useEffect(() => {
    return () => {
      timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  return { toasts, addToast };
}

export function ExplorerApp({ apiBaseUrl = '' }: ExplorerAppProps) {
  const initialApiBase = typeof window === 'undefined'
    ? apiBaseUrl
    : inferApiBaseUrl(apiBaseUrl, window.location);
  const [resolvedApiBase, setResolvedApiBase] = useState(initialApiBase);
  const api = useMemo(() => createApiClient(resolvedApiBase), [resolvedApiBase]);
  const { toasts, addToast } = useToastQueue();

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
  const [focused, setFocused] = useState<MediaItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [previewDetailsOpen, setPreviewDetailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [assetDragActive, setAssetDragActive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MediaItem[] } | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [pendingDataLoadOverlay, setPendingDataLoadOverlay] = useState(false);
  const [gridColumnCount, setGridColumnCount] = useState(1);
  const [dynamicOrientations, setDynamicOrientations] = useState<Record<string, string>>({});
  const dragPathsRef = useRef<string[]>([]);
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
  const [composeOutputName, setComposeOutputName] = useState('');
  const [composeOutputProject, setComposeOutputProject] = useState('');
  const composeNameInputRef = useRef<HTMLInputElement | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaScrollRef = useRef<HTMLDivElement | null>(null);
  const sortSelectRef = useRef<HTMLSelectElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const orientationCacheRef = useRef<Map<string, string>>(new Map());
  const selectedOrderRef = useRef<string[]>([]);
  const lastTileTapRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPointerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const clearPendingLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = null;
    longPressPointerRef.current = null;
    longPressFiredRef.current = false;
  }, []);

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

  const estimateTileHeight = useCallback((item: MediaItem) => {
    const orient = resolveItemOrientation(item);
    const kind = guessKind(item);
    if (kind === 'audio') return 1;
    if (orient === 'portrait') return 1.34;
    if (orient === 'landscape') return 0.84;
    if (orient === 'square') return 1;
    return kind === 'video' ? 1.05 : 1;
  }, [resolveItemOrientation]);

  const assetSelectionKey = useCallback((item: MediaItem, projectOverride?: Project | null) => {
    const relativePath = String(item.relative_path || '').trim();
    if (!relativePath) return '';
    const projectName = String(item.project_name || item.project || projectOverride?.name || '').trim();
    const sourceName = String(item.project_source || item.source || projectOverride?.source || '').trim();
    return `${sourceName}::${projectName}::${relativePath}`;
  }, []);

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
  const masonryColumns = useMemo(
    () => buildMasonryColumns(filteredMedia, gridColumnCount, (item) => estimateTileHeight(item)),
    [estimateTileHeight, filteredMedia, gridColumnCount],
  );
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

  const inNoPreviewZone = useCallback((target: EventTarget | null) => {
    const node = target instanceof HTMLElement ? target : null;
    return Boolean(node?.closest?.('[data-no-preview], .sel-ui'));
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = mediaScrollRef.current;
    if (!root) return;
    const selector = view === 'grid'
      ? '.grid img.asset-thumb[data-thumb-url]'
      : '.list img.asset-thumb[data-thumb-url]';
    const targets = Array.from(root.querySelectorAll(selector)) as HTMLImageElement[];
    const shouldShowOverlay = pendingDataLoadOverlay;
    const loadingToken = shouldShowOverlay ? beginContentLoading() : 0;
    if (!targets.length) {
      endContentLoading(loadingToken);
      if (shouldShowOverlay) setPendingDataLoadOverlay(false);
      return;
    }
    let cancelled = false;
    queueThumbLoads(targets, THUMB_LOAD_TIMEOUT_MS, updateCardOrientation)
      .finally(() => {
        if (!cancelled) {
          endContentLoading(loadingToken);
          if (shouldShowOverlay) setPendingDataLoadOverlay(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [beginContentLoading, endContentLoading, filteredMedia, pendingDataLoadOverlay, updateCardOrientation, view]);

  useEffect(() => {
    return () => {
      endContentLoading(contentLoadingTokenRef.current);
    };
  }, [endContentLoading]);

  const buildUploadUrl = useCallback((project: Project) => {
    const query = project.source ? `?source=${encodeURIComponent(project.source)}` : '';
    return project.upload_url || `/api/projects/${encodeURIComponent(project.name)}/upload${query}`;
  }, []);

  const resolveAssetUrl = useCallback(
    (path?: string) => {
      if (!path) return '';
      if (path.startsWith('data:')) return path;
      return api.buildUrl(path);
    },
    [api],
  );

  const normalizedPreviewAsset = useMemo(() => {
    if (!focused) return null;
    return normalizePreviewAsset(focused, resolveAssetUrl);
  }, [focused, resolveAssetUrl]);

  const previewMetadataRows = useMemo<Array<[string, string]>>(() => {
    if (!focused) return [];
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
  }, [activeProject?.name, activeProject?.source, focused, resolveAssetUrl]);

  const updateSidebarMode = useCallback(() => {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    setIsMobile(mobile);
    if (!mobile) {
      setSidebarOpen(false);
    }
  }, []);

  const updateGridColumnCount = useCallback(() => {
    if (typeof window === 'undefined') return;
    const hostWidth = mediaScrollRef.current?.clientWidth || window.innerWidth || 0;
    const rootStyles = window.getComputedStyle(document.documentElement);
    const gridGap = parseFloat(rootStyles.getPropertyValue('--grid-gap')) || GRID_GAP_FALLBACK;
    const gridColWidth = parseFloat(rootStyles.getPropertyValue('--grid-col-width')) || GRID_COL_WIDTH_FALLBACK;
    const count = Math.max(1, Math.floor((hostWidth + gridGap) / (gridColWidth + gridGap)));
    setGridColumnCount(count);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    updateGridColumnCount();
    const host = mediaScrollRef.current;
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateGridColumnCount())
      : null;
    if (host && observer) observer.observe(host);
    window.addEventListener('resize', updateGridColumnCount, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateGridColumnCount);
    };
  }, [updateGridColumnCount]);

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
        return;
      }
      try {
        setPendingDataLoadOverlay(true);
        const payload = await api.listMedia(project.name, project.source);
        const items = Array.isArray(payload.media) ? payload.media : [];
        setMedia(sortMediaByRecent(items));
        setMediaScope('project');
        const existing = new Set(items.map((item) => assetSelectionKey(item, project)));
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
    [api, addToast, assetSelectionKey, clearSelectionState],
  );

  const loadAllMedia = useCallback(async () => {
    clearSelectionState();
    setFocused(null);
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
            project_source: project.source || null,
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load media';
        addToast('warn', 'Media', `Skipped ${project.name}: ${message}`);
      }
    }
    setMedia(sortMediaByRecent(gathered));
  }, [addToast, api, clearSelectionState, projects]);

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

  const selectProject = useCallback(
    (project: Project) => {
      const alreadySelected = Boolean(activeProject)
        && activeProject?.name === project.name
        && (activeProject?.source || 'primary') === (project.source || 'primary');

      if (alreadySelected) {
        setActiveProject(null);
        setMediaScope('all');
        clearSelectionState();
        setFocused(null);
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
      setFocused(null);
      setResolveProjectMode('current');
      setResolveProjectName(project.name || '');
      setResolveNewName('');
      setUploadStatus('');
      addToast('good', 'Project', `Selected ${project.name}`);
    },
    [activeProject, addToast, clearSelectionState],
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

  const openDrawer = useCallback((item: MediaItem) => {
    setFocused(item);
    setPreviewDetailsOpen(false);
    setInspectorOpen(true);
  }, []);

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
    setFocused(filteredMedia[nextIndex] || focused);
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

  const deleteMediaSelection = useCallback(
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
      }
    },
    [activeProject, addToast, api, assetSelectionKey, focused, loadAllMedia, loadMedia, mediaScope, resolveItemsForSelection, resolveSelectionKeysForItems, toAssetRef],
  );

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
      addToast('warn', 'Compose', 'Select one or more clips first');
      return;
    }
    if (!selectedVideoItems.length) {
      addToast('warn', 'Compose', 'Compose supports video clips only');
      return;
    }
    if (!projects.length) {
      addToast('warn', 'Compose', 'No projects available for compose output.');
      return;
    }
    const preferredProject = defaultComposeProject(projects);
    setComposeOutputName(buildComposeTimestampName());
    setComposeOutputProject(preferredProject?.name || 'P5-SHARED-Exported-Media');
    setComposeModalOpen(true);
  }, [addToast, projects, selected, selectedVideoItems]);

  const handleComposeConfirm = useCallback(async () => {
    if (!selectedVideoItems.length) {
      addToast('warn', 'Compose', 'Compose supports video clips only');
      setComposeModalOpen(false);
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
    try {
      const response = await api.bulkComposeMedia({
        assets: refs,
        output_project: targetProject.name,
        output_name: outputName,
        output_source: targetProject.source || null,
        target_dir: 'exports',
        mode: 'auto',
        allow_overwrite: false,
      });
      const composedPath = typeof response.path === 'string' && response.path.trim()
        ? response.path
        : outputName;
      addToast('good', 'Compose', `Created ${composedPath}`);
      setComposeModalOpen(false);
      await loadProjects();
      if (mediaScope === 'all' || !activeProject) await loadAllMedia();
      else await loadMedia(activeProject);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Compose failed';
      addToast('bad', 'Compose', message);
    }
  }, [activeProject, addToast, api, composeOutputName, composeOutputProject, loadAllMedia, loadMedia, loadProjects, mediaScope, projects, selectedVideoItems, toAssetRef]);

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

  const buildAssetPointerHandlers = useCallback(
    (item: MediaItem) => {
      let pointerId: number | null = null;
      let startX = 0;
      let startY = 0;
      let moved = false;
      let pressX = 0;
      let pressY = 0;
      const itemKey = assetSelectionKey(item, activeProject);

      const resolveContextItems = () => (selected.has(itemKey)
        ? selectedKeysOrdered
          .map((path) => itemsBySelectionKey.get(path))
          .filter((entry): entry is MediaItem => Boolean(entry))
        : [item]);

      const handlePointerDown = (event: React.PointerEvent) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (inNoPreviewZone(event.target)) return;
        if ((event.target as HTMLElement).closest('input, button, a, summary')) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        pressX = event.clientX;
        pressY = event.clientY;
        moved = false;
        clearPendingLongPress();
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          longPressPointerRef.current = pointerId;
          longPressTimerRef.current = window.setTimeout(() => {
            if (longPressPointerRef.current !== pointerId || moved || dragging || assetDragActive) return;
            longPressFiredRef.current = true;
            openContextMenu(pressX, pressY, resolveContextItems());
          }, LONG_PRESS_MS);
        }
      };

      const handlePointerMove = (event: React.PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        if (inNoPreviewZone(event.target)) {
          clearPendingLongPress();
          return;
        }
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const movedFar = (dx * dx + dy * dy) > LONG_PRESS_MOVE_CANCEL_PX * LONG_PRESS_MOVE_CANCEL_PX;
        if (movedFar) {
          moved = true;
          clearPendingLongPress();
        }
        if (!moved) return;
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          return;
        }
        if ((dx * dx + dy * dy) > POINTER_THRESHOLD * POINTER_THRESHOLD) {
          setDragging(true);
          setAssetDragActive(true);
          dragPathsRef.current = selected.has(itemKey)
            ? selectedKeysOrdered
            : [itemKey];
          if (event.clientY <= 56) setTopbarHidden(false);
        }
      };

      const handlePointerUp = (event: React.PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        const longPressFired = longPressFiredRef.current;
        clearPendingLongPress();
        pointerId = null;
        if (longPressFired) {
          return;
        }
        if (moved) {
          setDragging(false);
          setAssetDragActive(false);
          const dropEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.chip') as HTMLElement | null;
          if (dropEl?.dataset?.project) {
            const target = projects.find((proj) => (
              proj.name === dropEl.dataset.project
              && String(proj.source || '') === String(dropEl.dataset.source || '')
            ));
            if (target) void moveMediaSelection(dragPathsRef.current, target);
          }
          return;
        }
        const now = Date.now();
        if (inspectorOpen) {
          closeDrawer();
          lastTileTapRef.current = { key: '', at: 0 };
          return;
        }
        const prevTap = lastTileTapRef.current;
        const isSecondTap = prevTap.key === itemKey && (now - prevTap.at) <= 900;
        if (isSecondTap) {
          openDrawer(item);
          lastTileTapRef.current = { key: '', at: 0 };
          return;
        }
        lastTileTapRef.current = { key: itemKey, at: now };
      };

      const handlePointerCancel = () => {
        clearPendingLongPress();
        pointerId = null;
        setDragging(false);
        setAssetDragActive(false);
      };

      const handleContextMenu = (event: React.MouseEvent) => {
        if (inNoPreviewZone(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (dragging) return;
        openContextMenu(event.clientX, event.clientY, resolveContextItems());
      };

      return {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onContextMenu: handleContextMenu,
      };
    },
    [
      activeProject,
      assetDragActive,
      assetSelectionKey,
      clearPendingLongPress,
      closeDrawer,
      dragging,
      inNoPreviewZone,
      inspectorOpen,
      itemsBySelectionKey,
      moveMediaSelection,
      openContextMenu,
      openDrawer,
      projects,
      selected,
      selectedKeysOrdered,
    ],
  );

  const handlePreviewSelected = useCallback(() => {
    const first = selectionItems[0];
    const item = first || null;
    if (item) openDrawer(item);
  }, [openDrawer, selectionItems]);

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
    setDragging(false);
    setAssetDragActive(false);
    if (!dragPathsRef.current.length) return;
    await moveMediaSelection(dragPathsRef.current, project);
  }, [dragging, moveMediaSelection]);

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

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => {
      if (event.clientY <= 56) setTopbarHidden(false);
    };
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [dragging]);

  useEffect(() => {
    addToast('good', 'Boot', 'Loading sources + projects…');
    void loadSources();
    void loadProjects();
  }, [addToast, loadProjects, loadSources]);

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

  const [topbarHidden, setTopbarHidden] = useState(false);
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const topbarRevealRef = useRef<HTMLDivElement | null>(null);
  const topbarIntentRef = useRef<IntentController | null>(null);

  useEffect(() => {
    const topbar = topbarRef.current;
    const reveal = topbarRevealRef.current;
    if (!topbar || !reveal) return;
    const supportsHover = window.matchMedia('(hover: hover)').matches;

    const intent = createIntentController({
      onOpen: () => setTopbarHidden(false),
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

    topbar.addEventListener('pointerenter', handleEnter);
    topbar.addEventListener('pointerleave', handleLeave);
    topbar.addEventListener('focusin', () => intent.setPinned(true));
    topbar.addEventListener('focusout', () => {
      intent.setPinned(false);
      if (supportsHover && !shouldKeepOpen()) intent.scheduleClose(600);
    });
    reveal.addEventListener('pointerenter', handleEnter);
    reveal.addEventListener('pointerleave', handleLeave);
    reveal.addEventListener('pointerdown', handleEnter);
    reveal.addEventListener('pointermove', () => {
      if (dragging) intent.scheduleOpen(0);
    });

    const handleOutside = (event: PointerEvent) => {
      if (intent.isPinned()) return;
      if (topbar.contains(event.target as Node) || reveal.contains(event.target as Node)) return;
      if (!shouldKeepOpen()) intent.scheduleClose(120);
    };
    document.addEventListener('pointerdown', handleOutside);

    intent.setOpen(true);

    return () => {
      topbar.removeEventListener('pointerenter', handleEnter);
      topbar.removeEventListener('pointerleave', handleLeave);
      reveal.removeEventListener('pointerenter', handleEnter);
      reveal.removeEventListener('pointerleave', handleLeave);
      reveal.removeEventListener('pointerdown', handleEnter);
      document.removeEventListener('pointerdown', handleOutside);
    };
  }, []);

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
    if (!composeModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setComposeModalOpen(false);
        return;
      }
      if (event.key === 'Enter') {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
        event.preventDefault();
        void handleComposeConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.requestAnimationFrame(() => composeNameInputRef.current?.focus());
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composeModalOpen, handleComposeConfirm]);

  const uploadCaption = activeProject
    ? `Upload to ${activeProject.name}${activeProject.source ? ` (${activeProject.source})` : ''}`
    : 'Pick a project first.';
  const canSelect = Boolean(activeProject) || mediaScope === 'all';
  const projectLabel = (item: MediaItem) => {
    if (!item.project_name) return '';
    return item.project_source ? `${item.project_name} (${item.project_source})` : item.project_name;
  };

  return (
    <div className={`app ${topbarHidden ? 'topbar-hidden' : ''}`}>
      <div className="topbar-reveal" ref={topbarRevealRef} aria-hidden="true" />
      <div className="topbar" ref={topbarRef}>
        <div className="topbar-inner">
          <div
            className={`brand ${sidebarOpen ? 'projects-open' : ''}`}
            title="LAN-only media-sync-api explorer"
            ref={brandRef}
          >
            <div className="logo" aria-hidden="true"></div>
            <div className="brand-text">
              <h1>
                <button type="button" aria-label="Toggle projects panel" onClick={() => setSidebarOpen((prev) => !prev)}>
                  <span className="brand-title is-primary">Cdaprod's Explorer</span>
                  <span className="brand-title is-secondary">Cdaprod's Projects</span>
                </button>
              </h1>
              <div className="sub">media-sync-api</div>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-toggle" aria-hidden="true"></div>
            <div className="topbar-controls">
              <div className="search" role="search">
                <span className="kbd">⌘K</span>
                <input
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
                <div className="search-toolbar" aria-label="Search filters">
                  <details className="dropdown">
                    <summary className="control" aria-label="Filter by media type">
                      Type: <span>{typeLabel}</span>
                    </summary>
                    <div className="dropdown-menu" role="listbox" aria-label="Media type filters">
                      <button
                        type="button"
                        className={typeFilter === 'all' ? 'is-active' : ''}
                        onClick={handleTypeSelect('all')}
                      >
                        All types
                      </button>
                      <button
                        type="button"
                        className={typeFilter === 'video' ? 'is-active' : ''}
                        onClick={handleTypeSelect('video')}
                      >
                        Video
                      </button>
                      <button
                        type="button"
                        className={typeFilter === 'image' ? 'is-active' : ''}
                        onClick={handleTypeSelect('image')}
                      >
                        Image
                      </button>
                      <button
                        type="button"
                        className={typeFilter === 'audio' ? 'is-active' : ''}
                        onClick={handleTypeSelect('audio')}
                      >
                        Audio
                      </button>
                      {mediaMeta.types.has('overlay') ? (
                        <button
                          type="button"
                          className={typeFilter === 'overlay' ? 'is-active' : ''}
                          onClick={handleTypeSelect('overlay')}
                        >
                          Overlay
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={typeFilter === 'unknown' ? 'is-active' : ''}
                        onClick={handleTypeSelect('unknown')}
                      >
                        Unknown
                      </button>
                    </div>
                  </details>
                </div>
              </div>
              <button
                className="btn actions-toggle"
                type="button"
                aria-expanded={actionsOpen}
                onClick={() => setActionsOpen((prev) => !prev)}
              >
                Actions ▾
              </button>
            </div>
            <div className={`actions-panel ${actionsOpen ? 'open' : ''}`} role="region" aria-label="Explorer actions">
              <div className="seg" aria-label="View mode">
                <button
                  className={view === 'grid' ? 'active' : ''}
                  type="button"
                  onClick={() => setView('grid')}
                >
                  Grid
                </button>
                <button
                  className={view === 'list' ? 'active' : ''}
                  type="button"
                  onClick={() => setView('list')}
                >
                  List
                </button>
              </div>

              <div className="action-controls" aria-label="Sort and quick filters">
                <select
                  ref={sortSelectRef}
                  className="control visually-hidden"
                  aria-label="Sort media"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                >
                  <option value="newest">Sort: Newest</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="name-asc">Sort: Name A→Z</option>
                  <option value="name-desc">Sort: Name Z→A</option>
                  <option value="size-desc" disabled={!mediaMeta.hasSize}>
                    Sort: Size big→small
                  </option>
                  <option value="size-asc" disabled={!mediaMeta.hasSize}>
                    Sort: Size small→big
                  </option>
                </select>
                <details className="dropdown">
                  <summary className="control" aria-label="Sort media">
                    Sort: <span>{sortLabel}</span>
                  </summary>
                  <div className="dropdown-menu" role="listbox" aria-label="Sort media">
                    <button
                      type="button"
                      className={sortKey === 'newest' ? 'is-active' : ''}
                      onClick={handleSortSelect('newest')}
                    >
                      Sort: Newest
                    </button>
                    <button
                      type="button"
                      className={sortKey === 'oldest' ? 'is-active' : ''}
                      onClick={handleSortSelect('oldest')}
                    >
                      Sort: Oldest
                    </button>
                    <button
                      type="button"
                      className={sortKey === 'name-asc' ? 'is-active' : ''}
                      onClick={handleSortSelect('name-asc')}
                    >
                      Sort: Name A→Z
                    </button>
                    <button
                      type="button"
                      className={sortKey === 'name-desc' ? 'is-active' : ''}
                      onClick={handleSortSelect('name-desc')}
                    >
                      Sort: Name Z→A
                    </button>
                    <button
                      type="button"
                      className={sortKey === 'size-desc' ? 'is-active' : ''}
                      onClick={handleSortSelect('size-desc')}
                      disabled={!mediaMeta.hasSize}
                    >
                      Sort: Size big→small
                    </button>
                    <button
                      type="button"
                      className={sortKey === 'size-asc' ? 'is-active' : ''}
                      onClick={handleSortSelect('size-asc')}
                      disabled={!mediaMeta.hasSize}
                    >
                      Sort: Size small→big
                    </button>
                  </div>
                </details>
                <div className="pillbar">
                  <button
                    className={`btn toggle-btn ${selectedOnly ? 'is-on' : ''}`}
                    type="button"
                    onClick={() => setSelectedOnly((prev) => !prev)}
                  >
                    Selected only
                  </button>
                  <button
                    className={`btn toggle-btn ${untaggedOnly ? 'is-on' : ''}`}
                    type="button"
                    onClick={() => setUntaggedOnly((prev) => !prev)}
                    disabled={!mediaMeta.hasTags}
                    title={mediaMeta.hasTags ? '' : 'No tagged items yet'}
                  >
                    Untagged only
                  </button>
                </div>
              </div>

              <div className="pillbar">
                <button className="btn" type="button" onClick={refreshAll}>
                  ↻ Refresh
                </button>
                <button className="btn good" type="button" onClick={pickUpload}>
                  ＋ Upload
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={handleResolve}
                  disabled={!selectedCount || !activeProject}
                >
                  ⇢ Send to Resolve
                </button>
                <button className="btn" type="button" onClick={clearSelection} disabled={!selectedCount}>
                  ✕ Clear
                </button>
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
          ref={mediaScrollRef}
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
          <div className="scroll" onScroll={clearPendingLongPress}>
            <div className="grid" style={{ display: view === 'grid' ? '' : 'none' }}>
              {!activeProject && mediaScope !== 'all' ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  Select a project to view media.
                </div>
              ) : filteredMedia.length === 0 ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  {mediaScope === 'all'
                    ? 'No indexed files yet across all projects.'
                    : <>No indexed files yet. Upload then run <code>/reindex</code>.</>}
                </div>
              ) : (
                <div className="masonry-columns" style={{ '--masonry-column-count': String(gridColumnCount) } as React.CSSProperties}>
                  {masonryColumns.map((column, columnIndex) => (
                    <div className="masonry-column" key={`masonry-column-${columnIndex}`}>
                      {column.map((item) => {
                  const kind = guessKind(item);
                  const title = item.relative_path?.split('/').pop() || item.relative_path || 'unnamed';
                  const proj = projectLabel(item);
                  const sub = proj ? `${item.relative_path || ''} • ${proj}` : (item.relative_path || '');
                  const size = formatBytes(item.size);
                  const pointerHandlers = buildAssetPointerHandlers(item);
                  const thumbKey = getThumbCacheKey(item);
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
                  const safeThumbUrl = fallbackThumb;
                  const selectionKey = assetSelectionKey(item, activeProject);
                  const isSelected = selected.has(selectionKey);

                  return (
                    <div
                      key={`${item.project_name || activeProject?.name || 'project'}-${item.project_source || 'primary'}-${item.relative_path}`}
                      className={`asset asset-interactive-surface ${isSelected ? 'is-selected' : ''}`}
                      data-kind={kind}
                      data-orient={orient}
                      data-orient-locked={orientLocked ? 'true' : 'false'}
                      data-thumb-key={thumbKey}
                      data-relative={item.relative_path || ''}
                      data-select-key={selectionKey}
                      {...pointerHandlers}
                    >
                      <div className="thumb">
                        <img
                          className="asset-thumb"
                          src={safeThumbUrl}
                          alt={title}
                          loading="lazy"
                          draggable={false}
                          onDragStart={suppressNativeDragGhost}
                          onContextMenu={suppressNativeContextMenu}
                          data-thumb-url={thumbUrl}
                          data-thumb-fallback={fallbackThumb}
                        />
                        <div className="asset-overlay">
                          <div className="asset-ol-tl">
                            <span className={`badge ${kindBadgeClass(kind)} tile-ui-text`}>{kind}</span>
                          </div>
                          <div className="asset-ol-tr">
                            <div
                              className="selector sel-ui"
                              title="Select"
                              data-no-preview="1"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!canSelect) return;
                                const target = event.target as HTMLElement;
                                if (!target.closest('.sel-shell, .sel-order, input[type="checkbox"]')) return;
                                toggleSelected(item);
                              }}
                            >
                              <span className="sel-shell" data-no-preview="1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  aria-label="Select media"
                                  disabled={!canSelect}
                                  data-no-preview="1"
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => toggleSelected(item)}
                                />
                                <span className="sel-order" data-no-preview="1" aria-hidden="true">
                                  {selectedOrderMap.get(selectionKey) ? String(Math.min(selectedOrderMap.get(selectionKey) ?? 0, 99)) : ''}
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="asset-ol-bl">
                            <span className="badge tile-ui-text">{size}</span>
                          </div>
                          <div className="asset-ol-bottom">
                            <div className="asset-title tile-ui-text">{title}</div>
                            <div className="asset-subtitle tile-ui-text">{sub}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="list" style={{ display: view === 'list' ? '' : 'none' }}>
              {!activeProject && mediaScope !== 'all' ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  Select a project to view media.
                </div>
              ) : filteredMedia.length === 0 ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  {mediaScope === 'all'
                    ? 'No indexed files yet across all projects.'
                    : <>No indexed files yet. Upload then run <code>/reindex</code>.</>}
                </div>
              ) : (
                filteredMedia.map((item) => {
                  const kind = guessKind(item);
                  const title = item.relative_path?.split('/').pop() || item.relative_path || 'unnamed';
                  const proj = projectLabel(item);
                  const sub = proj ? `${item.relative_path || ''} • ${proj}` : (item.relative_path || '');
                  const size = formatBytes(item.size);
                  const pointerHandlers = buildAssetPointerHandlers(item);
                  const rawThumbUrl = normalizeThumbUrl(item.thumb_url
                    || item.thumbnail_url
                    || (kind === 'image' ? item.stream_url : undefined));
                  const fallbackThumb = buildThumbFallback(kind);
                  const thumbUrl = rawThumbUrl ? resolveAssetUrl(rawThumbUrl) : undefined;
                  const safeThumbUrl = fallbackThumb;
                  const selectionKey = assetSelectionKey(item, activeProject);
                  const isSelected = selected.has(selectionKey);

                  return (
                    <div
                      className={`row asset-interactive-surface ${isSelected ? 'is-selected' : ''}`}
                      key={`row-${item.project_name || activeProject?.name || 'project'}-${item.project_source || 'primary'}-${item.relative_path}`}
                      data-select-key={selectionKey}
                      {...pointerHandlers}
                    >
                      <div className="mini">
                        <img
                          className="asset-thumb"
                          src={safeThumbUrl}
                          alt={title}
                          loading="lazy"
                          draggable={false}
                          onDragStart={suppressNativeDragGhost}
                          onContextMenu={suppressNativeContextMenu}
                          data-thumb-url={thumbUrl}
                          data-thumb-fallback={fallbackThumb}
                        />
                      </div>
                      <div className="info">
                        <div className="t tile-ui-text">{title}</div>
                        <div className="s tile-ui-text">
                          {sub} • {size} • {kind}
                        </div>
                      </div>
                      <div className="actions">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          title="Select"
                          disabled={!canSelect}
                          onChange={() => toggleSelected(item)}
                        />
                        <button className="iconbtn" type="button" onClick={() => openDrawer(item)}>
                          Preview
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
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

      <aside className={`drawer ${inspectorOpen ? 'open' : ''}`} aria-hidden={!inspectorOpen}>
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

      <div
        className={`compose-modal ${composeModalOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!composeModalOpen}
        aria-labelledby="composeModalTitle"
        onClick={() => setComposeModalOpen(false)}
      >
        <form
          className="compose-card custom-ui-surface"
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
              />
            </label>
            <label className="compose-field">
              <span>Output project</span>
              <select
                value={composeOutputProject}
                onChange={(event) => setComposeOutputProject(event.target.value)}
                data-compose-project-picker="1"
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
            <button className="btn" type="button" onClick={() => setComposeModalOpen(false)}>Cancel</button>
            <button className="btn good" type="submit">Compose</button>
          </div>
        </form>
      </div>

      <div className="toasts">
        {toasts.map((toast) => (
          <div className={`toast ${toast.type}`} key={toast.id}>
            <div className="t">{toast.title}</div>
            <div className="m">{toast.message}</div>
          </div>
        ))}
      </div>
      <div
        className={`backdrop ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      ></div>
      <div
        className={`backdrop ${inspectorOpen ? 'show' : ''}`}
        style={{ zIndex: 70 }}
        onClick={closeDrawer}
      ></div>
    </div>
  );
}
