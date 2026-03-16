'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildProjectUploadUrl, createApiClient } from './api';
import {
  buildMediaIdentity,
  collectMediaMeta,
  extractAiTags,
  extractTags,
  filterMedia,
  normalizeExplorerViewState,
  pruneSelection,
  sortMedia,
  sortMediaByRecent,
  toggleSelection,
} from './state';
import type { MediaActionRef, MediaMeta, MediaTypeFilter, SortKey } from './state';
import type { ExplorerView, MediaItem, Project, ToastMessage } from './types';
import {
  buildProgramMonitorDescriptor,
  buildStreamPathFromItem,
  canUseObsIntegration,
  canUseProgramMonitorIntegration,
  copyTextWithFallback,
  decideExplorerBootMode,
  formatBytes,
  guessKind,
  inferApiBaseUrl,
  kindBadgeClass,
  loadExplorerMockAssets,
  pushAssetToObs,
  sendToProgramMonitor,
  toAbsoluteUrl,
} from './utils';

interface ExplorerAppProps {
  apiBaseUrl?: string;
}

const DEFAULT_VIEW: ExplorerView = 'grid';
const POINTER_THRESHOLD = 8;
const LONG_PRESS_MS = 480;
const VIEW_PREFS_KEY = 'explorer-view-v1';




export function buildStableAssetRef(item: MediaItem): MediaActionRef {
  return {
    source: String(item.project_source || item.source || 'primary'),
    project: String(item.project_name || item.project || ''),
    relative_path: String(item.relative_path || ''),
  };
}

const toAssetRef = (item: MediaItem): MediaActionRef => buildStableAssetRef(item);

const assetRefKey = (item: MediaActionRef | null | undefined): string => {
  if (!item) return '';
  if (!item.project || !item.relative_path) return '';
  return `${item.source || 'primary'}::${item.project}::${item.relative_path}`;
};

interface ComposeDialogState {
  assets: MediaActionRef[];
  outputProject: string;
  outputSource: string;
  outputName: string;
}

const isVideoItem = (item: MediaItem): boolean => guessKind(item) === 'video';

const getGridAssetSpan = (kind: string, orient: string): number => {
  if (kind === 'audio') return 34;
  if (orient === 'portrait') return 58;
  if (orient === 'landscape') return 38;
  return 46;
};

const getAssetIndex = (items: MediaItem[]): Map<string, MediaItem> => {
  const map = new Map<string, MediaItem>();
  items.forEach((item) => {
    map.set(assetRefKey(toAssetRef(item)), item);
  });
  return map;
};

export interface PreviewDrawerUiState {
  inspectorOpen: boolean;
  drawerTagPanelOpen: boolean;
}

export type PreviewDrawerEvent = 'open' | 'close' | 'toggle_tag_panel';

export function reducePreviewDrawerState(
  state: PreviewDrawerUiState,
  event: PreviewDrawerEvent,
  context: { hasFocused: boolean },
): PreviewDrawerUiState {
  if (event === 'open') {
    return { inspectorOpen: true, drawerTagPanelOpen: false };
  }
  if (event === 'close') {
    return { inspectorOpen: false, drawerTagPanelOpen: false };
  }
  if (!context.hasFocused) {
    return { ...state, drawerTagPanelOpen: false };
  }
  return { ...state, drawerTagPanelOpen: !state.drawerTagPanelOpen };
}

export function getPreviewDrawerActionState(input: {
  hasFocused: boolean;
  activeProject: boolean;
  isFocusedSelected: boolean;
  hasStreamUrl: boolean;
  canUseObs: boolean;
  canUseProgramMonitor: boolean;
}): {
  canPlay: boolean;
  canCopyStream: boolean;
  canSendObs: boolean;
  canProgramMonitor: boolean;
  canSelectToggle: boolean;
  canDelete: boolean;
} {
  const hasFocused = Boolean(input.hasFocused);
  return {
    canPlay: hasFocused && input.hasStreamUrl,
    canCopyStream: hasFocused && input.hasStreamUrl,
    canSendObs: hasFocused && input.hasStreamUrl && input.canUseObs,
    canProgramMonitor: hasFocused && input.hasStreamUrl && input.canUseProgramMonitor,
    canSelectToggle: hasFocused && input.activeProject,
    canDelete: hasFocused && input.activeProject,
  };
}

export function getPreviewDrawerActionVisibility(kind: string | null | undefined): { showPlay: boolean } {
  const normalized = String(kind || '').toLowerCase();
  return { showPlay: normalized === 'video' || normalized === 'audio' };
}

export const PREVIEW_ACTIONS = Object.freeze({
  play: 'play',
  copy: 'copy',
  tag: 'tag',
  obs: 'obs',
  delete: 'delete',
  compose: 'compose',
});


export function buildSelectionAssetRefs(input: {
  selectedItems: MediaItem[];
  focusedItem: MediaItem | null;
  requested?: Array<MediaActionRef | string>;
  videosOnly?: boolean;
}): MediaActionRef[] {
  const refs = mapOrderedAssetRefs(input.selectedItems, input.focusedItem, input.requested || []);
  if (!input.videosOnly) return refs;
  const videoKeySet = new Set<string>();
  input.selectedItems.forEach((item) => {
    if (isVideoItem(item)) videoKeySet.add(assetRefKey(toAssetRef(item)));
  });
  if (input.focusedItem && isVideoItem(input.focusedItem)) {
    videoKeySet.add(assetRefKey(toAssetRef(input.focusedItem)));
  }
  return refs.filter((ref) => videoKeySet.has(assetRefKey(ref)));
}

export function mapOrderedVideoAssetRefs(
  selectedItems: MediaItem[],
  focusedItem: MediaItem | null,
  requested: Array<MediaActionRef | string> = [],
): MediaActionRef[] {
  return buildSelectionAssetRefs({ selectedItems, focusedItem, requested, videosOnly: true });
}

export function getComposeRefreshScope(activeProject: Project | null): 'project' | 'all' {
  return activeProject ? 'project' : 'all';
}

export function buildComposeArtifactSummary(payload: Record<string, unknown>, fallbackName: string): string {
  const path = String(payload.path || payload.output_path || payload.relative_path || fallbackName);
  const outputProject = String(payload.output_project || payload.project || '').trim();
  const outputSource = String(payload.output_source || payload.source || '').trim();
  if (outputProject && outputSource) return `${path} (${outputProject} @ ${outputSource})`;
  if (outputProject) return `${path} (${outputProject})`;
  return path;
}

export function mapOrderedAssetRefs(
  selectedItems: MediaItem[],
  focusedItem: MediaItem | null,
  requested: Array<MediaActionRef | string> = [],
): MediaActionRef[] {
  const refs: MediaActionRef[] = [];
  const seen = new Set<string>();
  const addRef = (ref: MediaActionRef | null | undefined) => {
    const key = assetRefKey(ref);
    if (!key || seen.has(key)) return;
    seen.add(key);
    refs.push({ source: ref?.source || 'primary', project: ref?.project || '', relative_path: ref?.relative_path || '' });
  };

  const selectedRefs = selectedItems.map(toAssetRef).filter((ref) => ref.project && ref.relative_path);
  if (!requested.length) {
    selectedRefs.forEach(addRef);
    return refs;
  }

  const wanted = new Set<string>();
  const legacyPaths = new Set<string>();
  requested.forEach((entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      legacyPaths.add(entry);
      return;
    }
    const key = assetRefKey(entry);
    if (key) wanted.add(key);
  });

  if (legacyPaths.size && focusedItem?.relative_path && legacyPaths.has(focusedItem.relative_path)) {
    wanted.add(assetRefKey(toAssetRef(focusedItem)));
  }
  if (legacyPaths.size) {
    selectedRefs.forEach((ref) => {
      if (legacyPaths.has(ref.relative_path)) wanted.add(assetRefKey(ref));
    });
  }

  if (!wanted.size) return refs;

  selectedRefs.forEach((ref) => {
    if (wanted.has(assetRefKey(ref))) addRef(ref);
  });

  if (focusedItem) {
    const focusedRef = toAssetRef(focusedItem);
    if (wanted.has(assetRefKey(focusedRef))) addRef(focusedRef);
  }

  return refs;
}
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
const FILTER_PREFS_KEY = 'media-sync-explorer-filters-v1';
const ORIENT_CACHE_KEY = 'media-sync-orient-cache-v1';

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
  const [focused, setFocused] = useState<MediaItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [drawerTagPanelOpen, setDrawerTagPanelOpen] = useState(false);
  const [drawerTagInput, setDrawerTagInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [assetDragActive, setAssetDragActive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MediaItem[] } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ requested: Array<MediaActionRef | string>; title: string; message: string } | null>(null);
  const [composeDialog, setComposeDialog] = useState<ComposeDialogState | null>(null);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const dragPathsRef = useRef<string[]>([]);

  const [resolveProjectMode, setResolveProjectMode] = useState('current');
  const [resolveProjectName, setResolveProjectName] = useState('');
  const [resolveNewName, setResolveNewName] = useState('');
  const [resolveMode, setResolveMode] = useState('import');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const drawerTagInputRef = useRef<HTMLInputElement | null>(null);
  const mediaScrollRef = useRef<HTMLDivElement | null>(null);
  const sortSelectRef = useRef<HTMLSelectElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const orientationCacheRef = useRef<Map<string, string>>(new Map());

  const mediaMeta = useMemo<MediaMeta>(() => collectMediaMeta(media), [media]);
  const filteredMedia = useMemo(() => {
    const filtered = filterMedia(
      media,
      {
        query,
        type: typeFilter,
        selectedOnly,
        untaggedOnly,
        selected,
      },
      mediaMeta,
    );
    return sortMedia(filtered, sortKey, mediaMeta);
  }, [media, query, typeFilter, selectedOnly, untaggedOnly, selected, sortKey, mediaMeta]);
  const selectedMediaItems = useMemo(
    () => filteredMedia.filter((item) => selected.has(item.relative_path)),
    [filteredMedia, selected],
  );
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

  useEffect(() => {
    orientationCacheRef.current = readOrientationCache();
  }, []);

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
  }, [cacheOrientation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = mediaScrollRef.current;
    if (!root) return;
    const selector = view === 'grid'
      ? '.grid img.asset-thumb[data-thumb-url]'
      : '.list img.asset-thumb[data-thumb-url]';
    const targets = Array.from(root.querySelectorAll(selector)) as HTMLImageElement[];
    if (!targets.length) {
      setContentLoading(false);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    queueThumbLoads(targets, THUMB_LOAD_TIMEOUT_MS, updateCardOrientation)
      .finally(() => {
        if (!cancelled) {
          setContentLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filteredMedia, updateCardOrientation, view]);

  const applyNormalizedView = useCallback((incomingView: unknown, source: 'url' | 'storage' | 'ui') => {
    const normalized = normalizeExplorerViewState(incomingView, DEFAULT_VIEW);
    setView(normalized.view);
    if (normalized.changed && normalized.message) {
      const title = normalized.reason === 'fx_disabled' ? 'View Mode' : 'View';
      addToast('warn', title, `${normalized.message} (${source})`);
    }
    return normalized.view;
  }, [addToast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    const urlView = params.get('view');
    if (urlView) {
      applyNormalizedView(urlView, 'url');
      return;
    }
    const stored = window.localStorage.getItem(VIEW_PREFS_KEY);
    if (stored) applyNormalizedView(stored, 'storage');
  }, [applyNormalizedView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_PREFS_KEY, view);
  }, [view]);

  const buildUploadUrl = useCallback((project: Project) => buildProjectUploadUrl(project), []);

  const resolveAssetUrl = useCallback(
    (path?: string) => {
      if (!path) return '';
      if (path.startsWith('data:')) return path;
      return api.buildUrl(path);
    },
    [api],
  );

  const updateSidebarMode = useCallback(() => {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    setIsMobile(mobile);
    if (!mobile) {
      setSidebarOpen(false);
    }
  }, []);

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

  const loadMockData = useCallback(async () => {
    try {
      const assets = await loadExplorerMockAssets(fetch);
      const normalized = assets.map((item) => ({
        ...item,
        project_name: item.project_name || item.project || 'MockProject-1',
        project_source: item.project_source || item.source || 'primary',
      }));
      const byProject = new Map<string, Project>();
      for (const item of normalized) {
        const projectName = String(item.project_name || item.project || 'MockProject-1');
        const sourceName = String(item.project_source || item.source || 'primary');
        const key = `${sourceName}|${projectName}`;
        if (!byProject.has(key)) {
          byProject.set(key, {
            name: projectName,
            source: sourceName,
            source_accessible: true,
            index_exists: true,
            upload_url: `/api/projects/${encodeURIComponent(projectName)}/upload${sourceName !== 'primary' ? `?source=${encodeURIComponent(sourceName)}` : ''}`,
          });
        }
      }
      setProjects(Array.from(byProject.values()));
      setSources([{
        name: 'primary',
        root: '/mock',
        type: 'mock',
        enabled: true,
        accessible: true,
      }]);
      setMedia(sortMediaByRecent(normalized));
      setActiveProject(null);
      setMediaScope('all');
      setSelected(new Set());
      setFocused(null);
      setMockMode(true);
      addToast('good', 'Mock Mode', 'Loaded preview mock assets');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load mock assets';
      addToast('bad', 'Mock Mode', message);
    }
  }, [addToast]);


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
      const fallbackToMock = typeof window !== 'undefined' && decideExplorerBootMode({
        location: window.location,
        apiFailed: true,
        hasOpener: Boolean(window.opener),
        embedded: window.top !== window.self,
      }) === 'mock';
      if (fallbackToMock) {
        addToast('warn', 'Projects', `${message}. Falling back to mock preview assets.`);
        await loadMockData();
        return;
      }
      addToast('bad', 'Projects', message);
    }
  }, [api, addToast, loadMockData]);

  const loadMedia = useCallback(
    async (project: Project | null) => {
      if (!project) {
        setMedia([]);
        setMediaScope('project');
        setSelected(new Set());
        return;
      }
      try {
        const payload = await api.listMedia(project.name, project.source);
        const items = Array.isArray(payload.media) ? payload.media : [];
        setMedia(sortMediaByRecent(items));
        setMediaScope('project');
        const existing = new Set(items.map((item) => item.relative_path));
        setSelected((current) => pruneSelection(current, existing));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load media';
        addToast('bad', 'Media', message);
      }
    },
    [api, addToast],
  );

  const loadAllMedia = useCallback(async () => {
    setSelected(new Set());
    setFocused(null);
    setMediaScope('all');
    if (!projects.length) {
      setMedia([]);
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
  }, [addToast, api, projects]);


  const reloadMediaForCurrentScope = useCallback(async () => {
    if (activeProject) {
      await loadMedia(activeProject);
      return;
    }
    await loadAllMedia();
  }, [activeProject, loadAllMedia, loadMedia]);

  const refreshAll = useCallback(async () => {
    await loadSources();
    await loadProjects();
    await reloadMediaForCurrentScope();
    addToast('good', 'Refresh', 'Reloaded projects + media');
  }, [addToast, loadProjects, loadSources, reloadMediaForCurrentScope]);

  const selectProject = useCallback(
    (project: Project) => {
      setActiveProject(project);
      setMediaScope('project');
      setSelected(new Set());
      setFocused(null);
      setResolveProjectMode('current');
      setResolveProjectName(project.name || '');
      setResolveNewName('');
      setUploadStatus('');
      addToast('good', 'Project', `Selected ${project.name}`);
    },
    [addToast],
  );

  const toggleSelected = useCallback(
    (relPath: string) => {
      if (!relPath) return;
      setSelected((current) => toggleSelection(current, relPath));
    },
    [setSelected],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const openDrawer = useCallback((item: MediaItem) => {
    const nextState = reducePreviewDrawerState(
      { inspectorOpen, drawerTagPanelOpen },
      'open',
      { hasFocused: true },
    );
    setFocused(item);
    if (item.relative_path && (activeProject || mediaScope === 'all')) {
      setSelected((current) => {
        if (current.has(item.relative_path)) return current;
        const next = new Set(current);
        next.add(item.relative_path);
        return next;
      });
    }
    setInspectorOpen(nextState.inspectorOpen);
    setDrawerTagPanelOpen(nextState.drawerTagPanelOpen);
    setDrawerTagInput('');
  }, [activeProject, drawerTagPanelOpen, inspectorOpen, mediaScope]);

  const closeDrawer = useCallback(() => {
    const nextState = reducePreviewDrawerState(
      { inspectorOpen, drawerTagPanelOpen },
      'close',
      { hasFocused: Boolean(focused) },
    );
    setInspectorOpen(nextState.inspectorOpen);
    setFocused(null);
    setDrawerTagPanelOpen(nextState.drawerTagPanelOpen);
    setDrawerTagInput('');
  }, [drawerTagPanelOpen, focused, inspectorOpen]);

  useEffect(() => {
    if (!drawerTagPanelOpen) return;
    drawerTagInputRef.current?.focus();
  }, [drawerTagPanelOpen]);

  const openUploadPicker = useCallback(() => {
    const input = uploadInputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker();
      return;
    }
    input.click();
  }, []);

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

  const resolveRequestedAssets = useCallback(
    (requested: Array<MediaActionRef | string> = []) => buildSelectionAssetRefs({ selectedItems: selectedMediaItems, focusedItem: focused, requested }),
    [focused, selectedMediaItems],
  );

  const deleteMediaPaths = useCallback(
    async (requested: Array<MediaActionRef | string>) => {
      const assets = resolveRequestedAssets(requested);
      if (!assets.length) {
        addToast('warn', 'Delete', 'Select one or more clips');
        return;
      }
      try {
        const payload = await api.bulkDeleteAssets(assets);
        addToast('good', 'Delete', `Media removed (${Number(payload?.deleted || 0)})`);
        setSelected(new Set());
        if (focused) {
          const focusedRef = toAssetRef(focused);
          if (assets.some((asset) => assetRefKey(asset) === assetRefKey(focusedRef))) {
            setFocused(null);
            setInspectorOpen(false);
          }
        }
        if (activeProject) {
          await loadMedia(activeProject);
        } else {
          await loadAllMedia();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed';
        addToast('bad', 'Delete', message);
      }
    },
    [activeProject, addToast, api, focused, loadAllMedia, loadMedia, resolveRequestedAssets],
  );

  const moveMediaPaths = useCallback(
    async (requested: Array<MediaActionRef | string>, targetProject: Project) => {
      const assets = resolveRequestedAssets(requested);
      if (!assets.length) {
        addToast('warn', 'Move', 'Select one or more clips');
        return;
      }
      try {
        const payload = await api.bulkMoveAssets(
          assets,
          targetProject.name,
          targetProject.source,
        );
        addToast('good', 'Move', `Moved ${Number(payload?.moved || assets.length)} item(s) to ${targetProject.name}`);
        setSelected(new Set());
        if (focused) {
          const focusedRef = toAssetRef(focused);
          if (assets.some((asset) => assetRefKey(asset) === assetRefKey(focusedRef))) {
            setFocused(null);
            setInspectorOpen(false);
          }
        }
        if (activeProject) {
          await loadMedia(activeProject);
        } else {
          await loadAllMedia();
        }
        await loadProjects();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Move failed';
        addToast('bad', 'Move', message);
      }
    },
    [activeProject, addToast, api, focused, loadAllMedia, loadMedia, loadProjects, resolveRequestedAssets],
  );

  const moveFocusedAsset = useCallback(async () => {
    if (!focused) {
      addToast('warn', 'Move', 'Focus an item first');
      return;
    }
    const focusedRef = toAssetRef(focused);
    const candidates = projects.filter((project) => (
      !(project.name === focusedRef.project && String(project.source || 'primary') === String(focusedRef.source || 'primary'))
    ));
    if (!candidates.length) {
      addToast('warn', 'Move', 'No destination projects available');
      return;
    }
    const selectedLabel = window.prompt(
      `Move to project (name or name@source): ${candidates.map((project) => `${project.name}@${project.source || 'primary'}`).join(', ')}`,
      `${candidates[0].name}@${candidates[0].source || 'primary'}`,
    );
    if (!selectedLabel) return;
    const [targetName, targetSourceRaw] = selectedLabel.split('@');
    const targetNameNormalized = String(targetName || '').trim();
    const targetSourceNormalized = String(targetSourceRaw || '').trim();
    const targetProject = candidates.find((project) => (
      project.name === targetNameNormalized
      && String(project.source || 'primary') === (targetSourceNormalized || String(project.source || 'primary'))
    ));
    if (!targetProject) {
      addToast('warn', 'Move', 'Destination not found');
      return;
    }
    await moveMediaPaths([focusedRef], targetProject);
  }, [addToast, focused, moveMediaPaths, projects]);

  const handleBulkTagEdit = useCallback(async (mode: 'add' | 'remove') => {
    const targetAssets = resolveRequestedAssets(focused ? [toAssetRef(focused)] : []);
    if (!targetAssets.length) {
      addToast('warn', 'Tags', 'Select or focus media first');
      return;
    }
    const input = window.prompt(mode === 'add' ? 'Enter tag(s) to add (comma separated)' : 'Enter tag(s) to remove (comma separated)', '');
    if (!input) return;
    const tags = input.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (!tags.length) {
      addToast('warn', 'Tags', 'Enter at least one tag');
      return;
    }
    try {
      await api.bulkTagAssets(targetAssets, mode === 'add' ? tags : [], mode === 'remove' ? tags : []);
      addToast('good', 'Tags', `${mode === 'add' ? 'Added' : 'Removed'} tags on ${targetAssets.length} item(s)`);
      if (activeProject) await loadMedia(activeProject);
      else await loadAllMedia();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tag update failed';
      addToast('bad', 'Tags', message);
    }
  }, [activeProject, addToast, api, focused, loadAllMedia, loadMedia, resolveRequestedAssets]);


  const handleDrawerTagApply = useCallback(async (mode: 'add' | 'remove') => {
    if (!focused) {
      addToast('warn', 'Tags', 'Select an asset first');
      return;
    }
    const tags = drawerTagInput.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (!tags.length) {
      addToast('warn', 'Tags', `Enter one or more tags to ${mode}`);
      return;
    }
    try {
      await api.bulkTagAssets([toAssetRef(focused)], mode === 'add' ? tags : [], mode === 'remove' ? tags : []);
      setDrawerTagInput('');
      if (activeProject) await loadMedia(activeProject);
      else await loadAllMedia();
      addToast('good', 'Tags', `${mode === 'add' ? 'Added' : 'Removed'} tags`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tag update failed';
      addToast('bad', 'Tags', message);
    }
  }, [activeProject, addToast, api, drawerTagInput, focused, loadAllMedia, loadMedia]);

  const openComposeDialog = useCallback(() => {
    const assets = buildSelectionAssetRefs({ selectedItems: selectedMediaItems, focusedItem: focused, requested: focused ? [toAssetRef(focused)] : [], videosOnly: true });
    if (!assets.length) {
      addToast('warn', 'Compose', 'Select one or more video clips');
      return;
    }
    const outputProject = activeProject?.name || assets[0]?.project || '';
    if (!outputProject) {
      addToast('warn', 'Compose', 'Select an output project first');
      return;
    }
    const outputSource = activeProject?.source || assets[0]?.source || 'primary';
    setComposeDialog({
      assets,
      outputProject,
      outputSource,
      outputName: `compose-${Date.now()}.mp4`,
    });
  }, [activeProject, addToast, focused, selectedMediaItems]);

  const submitComposeDialog = useCallback(async () => {
    if (!composeDialog || composeSubmitting) return;
    const outputProject = composeDialog.outputProject.trim();
    const outputName = composeDialog.outputName.trim();
    if (!outputProject || !outputName) {
      addToast('warn', 'Compose', 'Provide output project and output name');
      return;
    }
    setComposeSubmitting(true);
    try {
      const payload = await api.bulkComposeAssets(composeDialog.assets, outputProject, outputName, {
        outputSource: composeDialog.outputSource,
        targetDir: 'exports',
        mode: 'auto',
        allowOverwrite: false,
      });
      addToast('good', 'Compose', `Created ${buildComposeArtifactSummary(payload, outputName)}`);
      setComposeDialog(null);
      const refreshScope = getComposeRefreshScope(activeProject);
      if (refreshScope === 'project') await loadMedia(activeProject);
      else await loadAllMedia();
      await loadProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Compose failed';
      addToast('bad', 'Compose', message);
    } finally {
      setComposeSubmitting(false);
    }
  }, [activeProject, addToast, api, composeDialog, composeSubmitting, loadAllMedia, loadMedia, loadProjects]);

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
      media_rel_paths: Array.from(selected),
      mode: resolveMode || 'import',
    };

    try {
      const result = await api.sendResolve(payload, project.source);
      addToast('good', 'Resolve', `Sent. Job: ${result.job_id || 'ok'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resolve request failed';
      addToast('bad', 'Resolve', message);
    }
  }, [activeProject, addToast, api, resolveMode, resolveNewName, resolveProjectMode, resolveProjectName, selected]);

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

  const requestDeleteMediaPaths = useCallback((requested: Array<MediaActionRef | string>, title: string, message: string) => {
    const resolved = resolveRequestedAssets(requested);
    if (!resolved.length) {
      addToast('warn', 'Delete', 'Select one or more clips');
      return;
    }
    setDeleteConfirm({ requested: resolved, title, message });
  }, [addToast, resolveRequestedAssets]);

  const confirmDeleteMedia = useCallback(async () => {
    if (!deleteConfirm) return;
    const payload = deleteConfirm.requested;
    setDeleteConfirm(null);
    await deleteMediaPaths(payload);
  }, [deleteConfirm, deleteMediaPaths]);

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


  const getSelectedItems = useCallback((): MediaItem[] => {
    if (!selected.size) return [];
    return filteredMedia.filter((item) => selected.has(item.relative_path));
  }, [filteredMedia, selected]);

  const handleProgramMonitorHandoff = useCallback(async () => {
    if (!canUseProgramMonitorIntegration(typeof window !== 'undefined' ? window : undefined)) {
      addToast('warn', 'Program Monitor', 'Program Monitor handoff is unavailable in this browser context.');
      return;
    }
    const selectedItems = getSelectedItems();
    if (!selectedItems.length) {
      addToast('warn', 'Program Monitor', 'Select one or more clips');
      return;
    }
    const origin = window.location.origin;
    const urls = selectedItems
      .map((item) => toAbsoluteUrl(resolveAssetUrl(buildStreamPathFromItem(item)), origin))
      .filter(Boolean);
    if (!urls.length) {
      addToast('warn', 'Program Monitor', 'No stream URLs found for the selection.');
      return;
    }
    const descriptors = selectedItems.map((item) => buildProgramMonitorDescriptor(item, origin));
    try {
      await sendToProgramMonitor(urls, descriptors);
      addToast('good', 'Program Monitor', `Sent ${urls.length} stream URL(s).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Handoff failed';
      addToast('bad', 'Program Monitor', message);
    }
  }, [addToast, getSelectedItems, resolveAssetUrl]);

  const handleSendFocusedToObs = useCallback(async () => {
    if (!canUseObsIntegration(typeof window !== 'undefined' ? window : undefined)) {
      addToast('warn', 'OBS', 'OBS handoff is unavailable in this browser context.');
      return;
    }
    if (!focused) {
      addToast('warn', 'OBS', 'Open a focused item first');
      return;
    }
    const origin = window.location.origin;
    const assetUrl = toAbsoluteUrl(resolveAssetUrl(buildStreamPathFromItem(focused)), origin);
    if (!assetUrl) {
      addToast('warn', 'OBS', 'No stream URL available for this item.');
      return;
    }
    try {
      await pushAssetToObs({ assetUrl });
      addToast('good', 'OBS', 'Pushed asset to OBS Browser Source.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OBS push failed';
      addToast('bad', 'OBS', message);
    }
  }, [addToast, focused, resolveAssetUrl]);

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
      handler: () => requestDeleteMediaPaths(items.map((entry) => toAssetRef(entry)), 'Delete selected media?', `This will permanently remove ${items.length} item(s).`),
    });
    return actions;
  }, [handleCopySelectedUrls, handleCopyStream, openDrawer, requestDeleteMediaPaths, resolveAssetUrl]);

  const buildAssetPointerHandlers = useCallback(
    (item: MediaItem) => {
      let pointerId: number | null = null;
      let startX = 0;
      let startY = 0;
      let moved = false;
      let timer: number | null = null;
      let pressX = 0;
      let pressY = 0;

      const clearTimer = () => {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };

      const handlePointerDown = (event: React.PointerEvent) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if ((event.target as HTMLElement).closest('input, button, a, summary')) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        pressX = event.clientX;
        pressY = event.clientY;
        moved = false;
        event.currentTarget.setPointerCapture(pointerId);
        clearTimer();
        timer = window.setTimeout(() => {
          const selectedItems = selected.has(item.relative_path)
            ? filteredMedia.filter((entry) => selected.has(entry.relative_path))
            : [item];
          openContextMenu(pressX, pressY, selectedItems);
        }, LONG_PRESS_MS);
      };

      const handlePointerMove = (event: React.PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (!moved && (dx * dx + dy * dy) > POINTER_THRESHOLD * POINTER_THRESHOLD) {
          moved = true;
          clearTimer();
          setDragging(true);
          setAssetDragActive(true);
          dragPathsRef.current = selected.has(item.relative_path)
            ? Array.from(selected)
            : [item.relative_path];
          if (event.clientY <= 56) setTopbarHidden(false);
        }
      };

      const handlePointerUp = (event: React.PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        clearTimer();
        event.currentTarget.releasePointerCapture(pointerId);
        pointerId = null;
        if (moved) {
          setDragging(false);
          setAssetDragActive(false);
          const dropEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.chip') as HTMLElement | null;
          if (dropEl?.dataset?.project) {
            const target = projects.find((proj) => (
              proj.name === dropEl.dataset.project
              && String(proj.source || '') === String(dropEl.dataset.source || '')
            ));
            if (target) void moveMediaPaths(dragPathsRef.current.map((path) => String(path)), target);
          }
          return;
        }
        if (selected.has(item.relative_path)) {
          openDrawer(item);
        } else if (activeProject) {
          toggleSelected(item.relative_path);
        } else {
          openDrawer(item);
        }
      };

      const handlePointerCancel = () => {
        clearTimer();
        pointerId = null;
        setDragging(false);
        setAssetDragActive(false);
      };

      const handleContextMenu = (event: React.MouseEvent) => {
        event.preventDefault();
        if (dragging) return;
        const selectedItems = selected.has(item.relative_path)
          ? filteredMedia.filter((entry) => selected.has(entry.relative_path))
          : [item];
        openContextMenu(event.clientX, event.clientY, selectedItems);
      };

      return {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onContextMenu: handleContextMenu,
      };
    },
    [activeProject, dragging, filteredMedia, moveMediaPaths, openContextMenu, openDrawer, projects, selected, toggleSelected],
  );

  const handlePreviewSelected = useCallback(() => {
    const first = Array.from(selected)[0];
    const item = media.find((entry) => entry.relative_path === first);
    if (item) openDrawer(item);
  }, [media, openDrawer, selected]);

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
    await moveMediaPaths(dragPathsRef.current.map((path) => String(path)), project);
  }, [dragging, moveMediaPaths]);

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
    if (typeof window === 'undefined') return;
    const mode = decideExplorerBootMode({
      location: window.location,
      explicitMockFlag: Boolean((window as Window & { __EXPLORER_MOCK__?: boolean }).__EXPLORER_MOCK__),
      hasOpener: Boolean(window.opener),
      embedded: window.top !== window.self,
    });
    if (mode === 'mock') {
      void loadMockData();
      return;
    }
    addToast('good', 'Boot', 'Loading sources + projects…');
    setMockMode(false);
    void loadSources();
    void loadProjects();
  }, [addToast, loadMockData, loadProjects, loadSources]);

  useEffect(() => {
    if (mockMode) return;
    if (activeProject) {
      void loadMedia(activeProject);
    } else {
      void loadAllMedia();
    }
  }, [activeProject, loadAllMedia, loadMedia, mockMode]);

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
    if (!deleteConfirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeleteConfirm(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteConfirm]);

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

  const selectedRefs = useMemo<MediaActionRef[]>(() => mapOrderedAssetRefs(selectedMediaItems, focused), [selectedMediaItems, focused]);
  const selectedVideoRefs = useMemo<MediaActionRef[]>(() => mapOrderedVideoAssetRefs(selectedMediaItems, focused), [selectedMediaItems, focused]);
  const selectedIdentitySet = useMemo(() => new Set(selectedMediaItems.map((item) => buildMediaIdentity(item))), [selectedMediaItems]);
  const selectedCount = selectedRefs.length || selected.size;
  const selectedVideoCount = selectedVideoRefs.length;
  const contextActions = useMemo(
    () => (contextMenu ? getContextActions(contextMenu.items) : []),
    [contextMenu, getContextActions],
  );
  const uploadCaption = activeProject
    ? `Upload to ${activeProject.name}${activeProject.source ? ` (${activeProject.source})` : ''}`
    : 'Pick a project first.';
  const canSelect = mediaScope === 'all' || Boolean(activeProject);
  const hasFocused = Boolean(focused);
  const focusedHasStreamUrl = Boolean(focused && buildStreamPathFromItem(focused));
  const canObsIntegration = canUseObsIntegration(typeof window !== 'undefined' ? window : undefined);
  const canProgramMonitor = canUseProgramMonitorIntegration(typeof window !== 'undefined' ? window : undefined);
  const drawerActionState = getPreviewDrawerActionState({
    hasFocused,
    activeProject: Boolean(activeProject),
    isFocusedSelected: Boolean(focused && selectedIdentitySet.has(buildMediaIdentity(focused))),
    hasStreamUrl: focusedHasStreamUrl,
    canUseObs: canObsIntegration,
    canUseProgramMonitor: canProgramMonitor,
  });
  const previewKind = focused ? guessKind(focused) : null;
  const drawerActionVisibility = getPreviewDrawerActionVisibility(previewKind);
  const projectLabel = (item: MediaItem) => {
    if (!item.project_name) return '';
    return item.project_source ? `${item.project_name} (${item.project_source})` : item.project_name;
  };

  return (
    <div className={`app ${topbarHidden ? 'topbar-hidden' : ''}`} data-ui-hook="explorer-app-shell">
      <div className="topbar-reveal" ref={topbarRevealRef} aria-hidden="true" />
      <div className="topbar" ref={topbarRef} data-ui-hook="explorer-topbar">
        <div className="topbar-inner">
          <div
            className={`brand ${sidebarOpen ? 'projects-open' : ''}`}
            title="LAN-only media-sync-api explorer"
            ref={brandRef}
            role="button"
            tabIndex={0}
            onClick={() => setSidebarOpen((prev) => !prev)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSidebarOpen((prev) => !prev);
              }
            }}
          >
            <div className="brand-text">
              <h1>
                <button type="button" aria-label="Toggle projects drawer">
                  <span className="brand-title is-primary">Cdaprod&apos;s Explorer</span>
                  <span className="brand-title is-secondary">Cdaprod&apos;s Projects</span>
                </button>
              </h1>
              <div className="sub">media-sync-api</div>
            </div>
          </div>

          <div className="toolbar">
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
                Actions
                <span aria-hidden="true">▾</span>
              </button>
            </div>
            <div className={`actions-panel ${actionsOpen ? 'open' : ''}`} role="region" aria-label="Explorer actions">
              <div className="seg" aria-label="View mode">
                <button
                  className={view === 'grid' ? 'active' : ''}
                  type="button"
                  onClick={() => applyNormalizedView('grid', 'ui')}
                >
                  Grid
                </button>
                <button
                  className={view === 'list' ? 'active' : ''}
                  type="button"
                  onClick={() => applyNormalizedView('list', 'ui')}
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
                <button
                  className="btn"
                  type="button"
                  onClick={openComposeDialog}
                  disabled={!selectedVideoCount}
                >
                  🎞 Compose
                </button>
                <button className="btn" type="button" onClick={clearSelection} disabled={!selectedCount}>
                  ✕ Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="main">
        <aside className={`sidebar sidebar-drawer ${sidebarOpen ? 'is-open' : ''}`}>
          <div className="section-h" data-ui-hook="projects-section-header">
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
                <div className="upload-panel">
                  <input ref={uploadInputRef} type="file" className="visually-hidden" />
                  <button className="btn" type="button" onClick={openUploadPicker} disabled={!activeProject}>
                    Choose file
                  </button>
                  <button className="btn good" type="button" onClick={handleUpload} disabled={!activeProject}>
                    Upload
                  </button>
                  <span className="small upload-name">{uploadInputRef.current?.files?.[0]?.name || 'No file selected'}</span>
                </div>
                <div className="small" style={{ marginTop: '8px' }}>{uploadStatus}</div>
              </div>
            </div>
          </div>
        </aside>

        <section
          ref={mediaScrollRef}
          className={`content ${dragActive ? 'drag-active' : ''} ${contentLoading ? 'is-loading' : ''}`}
          onDragOver={(event) => {
            if (event.dataTransfer?.types.includes('Files')) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDragActive(true);
            }
          }}
          onDragLeave={() => setDragActive(false)}
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
          <div className="section-h">
            <h2>{contentTitle}</h2>
            <div className="meta-line">
              <span>{filteredMedia.length} items</span>
              <span>•</span>
              <span className="kbd">{activePath}</span>
            </div>
          </div>

          <div className="scroll">
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
                filteredMedia.map((item) => {
                  const kind = guessKind(item);
                  const title = item.relative_path?.split('/').pop() || item.relative_path || 'unnamed';
                  const proj = projectLabel(item);
                  const sub = proj ? `${item.relative_path || ''} • ${proj}` : (item.relative_path || '');
                  const size = formatBytes(item.size);
                  const pointerHandlers = buildAssetPointerHandlers(item);
                  const thumbKey = getThumbCacheKey(item);
                  const cachedOrient = getCachedOrientation(thumbKey || item.relative_path || '');
                  const itemOrient = inferOrientationFromItem(item);
                  const orient = itemOrient || cachedOrient || 'square';
                  const orientLocked = Boolean(itemOrient || cachedOrient);
                  const rawThumbUrl = normalizeThumbUrl(item.thumb_url
                    || item.thumbnail_url
                    || (kind === 'image' ? item.stream_url : undefined));
                  const fallbackThumb = buildThumbFallback(kind);
                  const thumbUrl = rawThumbUrl ? resolveAssetUrl(rawThumbUrl) : undefined;
                  const safeThumbUrl = fallbackThumb;
                  const identity = buildMediaIdentity(item);
                  const isSelected = selectedIdentitySet.has(identity);
                  const selectionOrder = selectedMediaItems.findIndex((entry) => buildMediaIdentity(entry) === identity) + 1;

                  return (
                    <div
                      key={`${item.project_name || activeProject?.name || 'project'}-${item.project_source || 'primary'}-${item.relative_path}`}
                      className={`asset ${isSelected ? 'is-selected' : ''}`}
                      data-kind={kind}
                      data-orient={orient}
                      data-orient-locked={orientLocked ? 'true' : 'false'}
                      data-thumb-key={thumbKey}
                      data-relative={item.relative_path || ''}
                      style={{ '--asset-span': String(getGridAssetSpan(kind, orient)) } as React.CSSProperties}
                      {...pointerHandlers}
                    >
                      <div className="thumb">
                        <div className="thumb-body">
                          <img
                            className="asset-thumb"
                            src={safeThumbUrl}
                            alt={title}
                            loading="lazy"
                            data-thumb-url={thumbUrl}
                            data-thumb-fallback={fallbackThumb}
                            data-thumb-state="pending"
                          />
                        </div>
                        <div className="asset-ui">
                          <div className="asset-overlay">
                            <div className="scrim" aria-hidden="true"></div>
                            <div className="asset-ol-tl">
                              <span className={`badge ${kindBadgeClass(kind)}`}>{kind}</span>
                            </div>
                            <div className="asset-ol-tr">
                              <div className="selector" title="Select">
                                <label className="sel-shell">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    aria-label="Select media"
                                    disabled={!canSelect}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={() => toggleSelected(item.relative_path)}
                                  />
                                  <span className="sel-order" aria-hidden="true">{selectionOrder || ''}</span>
                                </label>
                              </div>
                            </div>
                            <div className="asset-ol-bl">
                              <span className="badge">{size}</span>
                            </div>
                            {kind === 'video' || kind === 'audio' ? (
                              <div className="play-btn" aria-hidden="true">
                                <div className="play-btn-inner">▶</div>
                              </div>
                            ) : null}
                            <div className="preview-pill" aria-hidden="true">preview</div>
                            <div className="asset-ol-bottom">
                              <div className="asset-title">{title}</div>
                              <div className="asset-subtitle">{sub}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
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
                  const identity = buildMediaIdentity(item);
                  const isSelected = selectedIdentitySet.has(identity);

                  return (
                    <div
                      className={`row ${isSelected ? 'is-selected' : ''}`}
                      key={`row-${item.project_name || activeProject?.name || 'project'}-${item.project_source || 'primary'}-${item.relative_path}`}
                      {...pointerHandlers}
                    >
                      <div className="mini">
                        <img
                          className="asset-thumb"
                          src={safeThumbUrl}
                          alt={title}
                          loading="lazy"
                          data-thumb-url={thumbUrl}
                          data-thumb-fallback={fallbackThumb}
                        />
                      </div>
                      <div className="info">
                        <div className="t">{title}</div>
                        <div className="s">
                          {sub} • {size} • {kind}
                        </div>
                      </div>
                      <div className="actions">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          title="Select"
                          disabled={!canSelect}
                          onChange={() => toggleSelected(item.relative_path)}
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

      <div className={`selectbar ${selectedCount ? 'show' : ''}`} role="status" aria-live="polite">
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
          onClick={handleProgramMonitorHandoff}
          disabled={!selectedCount}
        >
          ↗ Program Monitor
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => void handleBulkTagEdit('add')}
          disabled={!selectedCount}
        >
          🏷 Add Tag
        </button>
        <button
          className="btn"
          type="button"
          onClick={openComposeDialog}
          disabled={!selectedVideoCount}
        >
          🎞 Compose
        </button>
        <button
          className="btn bad"
          type="button"
          onClick={() => requestDeleteMediaPaths(selectedRefs, 'Delete selected media?', `This will permanently remove ${selectedCount} item(s).`)}
          disabled={!activeProject || !selectedCount}
        >
          🗑 Delete
        </button>
        <button className="btn" type="button" onClick={clearSelection}>
          ✕ Clear
        </button>
      </div>

      <aside className={`drawer ${inspectorOpen ? 'open' : ''}`} aria-hidden={!inspectorOpen}>
        <div className="drawer-h">
          <div className="title">
            <h3>{focused?.relative_path?.split('/').pop() || focused?.relative_path || '—'}</h3>
            <div className="sub">{focused?.relative_path || '—'}</div>
          </div>
          <button className="xbtn" type="button" aria-label="Close inspector" onClick={closeDrawer}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="preview">
            {focused ? (() => {
              const kind = guessKind(focused);
              if (kind === 'video') {
                return (
                  <video controls preload="metadata" src={resolveAssetUrl(focused.stream_url)} />
                );
              }
              if (kind === 'image') {
                const rawUrl = focused.stream_url || focused.thumb_url || focused.thumbnail_url || '';
                return <img src={resolveAssetUrl(rawUrl)} alt="preview" />;
              }
              if (kind === 'audio') {
                return <audio controls src={resolveAssetUrl(focused.stream_url)} />;
              }
              return (
                <div style={{ padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>
                  No native preview for this type.<br />
                  <span className="kbd">{kind}</span>
                </div>
              );
            })() : null}
          </div>

          <div className="drawer-actions" data-preview-actions="1">
            <div className="drawer-actions-group" data-preview-group="primary">
              {drawerActionVisibility.showPlay ? (
                <button
                  className="btn"
                  type="button"
                  data-preview-action="play"
                  onClick={() => {
                    const mediaElement = document.querySelector('.drawer video, .drawer audio') as
                      | HTMLVideoElement
                      | HTMLAudioElement
                      | null;
                    mediaElement?.play?.();
                  }}
                  disabled={!drawerActionState.canPlay}
                >
                  ▶ Play
                </button>
              ) : null}
              <button
                className="btn"
                type="button"
                data-preview-action="copy"
                onClick={() => focused && handleCopyStream(focused)}
                disabled={!drawerActionState.canCopyStream}
              >
                ⧉ Copy stream URL
              </button>
              <button
                className="btn"
                type="button"
                data-preview-action="obs"
                onClick={handleSendFocusedToObs}
                disabled={!drawerActionState.canSendObs}
                title={canObsIntegration ? '' : 'OBS handoff unavailable in this context'}
              >
                📡 Send to OBS
              </button>
            </div>
            <div className="drawer-actions-group" data-preview-group="secondary">
              <button
                className="btn"
                type="button"
                onClick={() => focused && void handleProgramMonitorHandoff()}
                disabled={!drawerActionState.canProgramMonitor}
                title={canProgramMonitor ? '' : 'Program Monitor handoff unavailable in this context'}
              >
                ↗ Program Monitor
              </button>
              <button
                className={`btn ${drawerTagPanelOpen ? 'primary' : ''}`}
                type="button"
                data-preview-action="tag"
                onClick={() => {
                  const nextState = reducePreviewDrawerState(
                    { inspectorOpen, drawerTagPanelOpen },
                    'toggle_tag_panel',
                    { hasFocused: Boolean(focused) },
                  );
                  setDrawerTagPanelOpen(nextState.drawerTagPanelOpen);
                }}
                disabled={!hasFocused}
              >
                🏷 Tag
              </button>
              <button
                className="btn"
                type="button"
                onClick={moveFocusedAsset}
                disabled={!hasFocused}
              >
                ⇄ Move
              </button>
              <button
                className="btn"
                type="button"
                onClick={openComposeDialog}
                disabled={!selectedVideoCount && !(focused && guessKind(focused) === 'video')}
              >
                🎞 Compose
              </button>
              <button
                className={`btn ${focused && selectedIdentitySet.has(buildMediaIdentity(focused)) ? '' : 'primary'}`}
                type="button"
                onClick={() => focused && toggleSelected(focused.relative_path)}
                disabled={!drawerActionState.canSelectToggle}
              >
                {focused && selectedIdentitySet.has(buildMediaIdentity(focused)) ? '− Deselect' : '＋ Select'}
              </button>
              <button
                className="btn bad"
                type="button"
                data-preview-action="delete"
                onClick={() => focused && requestDeleteMediaPaths([toAssetRef(focused)], 'Delete focused media?', 'This action cannot be undone.')}
                disabled={!drawerActionState.canDelete}
              >
                🗑 Delete
              </button>
            </div>
          </div>

          <div className={`drawer-tag-panel ${drawerTagPanelOpen ? 'open' : ''} ${focused ? '' : 'is-hidden'}`}>
            <div className="tag-panel">
              <div className="taglist">
                {focused && extractTags([focused]).length ? extractTags([focused]).map((tag) => (
                  <span className="tag" key={`focused-tag-${tag}`}>{tag}</span>
                )) : <span className="tag">No tags</span>}
              </div>
              <div className="tag-editor">
                <input
                  ref={drawerTagInputRef}
                  type="text"
                  value={drawerTagInput}
                  onChange={(event) => setDrawerTagInput(event.target.value)}
                  placeholder="Add or remove tag…"
                />
                <button className="btn" type="button" onClick={() => void handleDrawerTagApply('add')}>＋ Tag</button>
                <button className="btn" type="button" onClick={() => void handleDrawerTagApply('remove')}>− Remove</button>
              </div>
              <div className="taglist" data-preview-taglist="ai">
                {focused && extractAiTags([focused]).length ? extractAiTags([focused]).map((tag) => (
                  <span className="tag" key={`focused-ai-tag-${tag}`}>{tag}</span>
                )) : <span className="tag">No AI tags</span>}
              </div>
            </div>
          </div>

          <div className="kv">
            {(() => {
              if (!focused) return null;
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
              const filteredRows = rows.filter(
                (row): row is [string, string] => String(row[1] || '').trim().length > 0,
              );

              return filteredRows.map(([key, value]) => (
                <React.Fragment key={key}>
                  <div className="k">{key}</div>
                  <div className="v">{value}</div>
                </React.Fragment>
              ));
            })()}
          </div>
        </div>
      </aside>

      {contextMenu ? (
        <div
          className="context-menu open"
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


      {composeDialog ? (
        <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="compose-title" aria-describedby="compose-message">
          <div className="modal-backdrop" onClick={() => (!composeSubmitting ? setComposeDialog(null) : null)}></div>
          <div className="modal">
            <h3 id="compose-title">Compose selected videos</h3>
            <p id="compose-message">Compose {composeDialog.assets.length} selected video clip(s) into a new artifact.</p>
            <div className="kv" style={{ marginBottom: '10px' }}>
              <div className="k">Output project</div>
              <div className="v">
                <input
                  className="control"
                  value={composeDialog.outputProject}
                  onChange={(event) => setComposeDialog((current) => (current ? { ...current, outputProject: event.target.value } : current))}
                  disabled={composeSubmitting}
                />
              </div>
              <div className="k">Output source</div>
              <div className="v">
                <input
                  className="control"
                  value={composeDialog.outputSource}
                  onChange={(event) => setComposeDialog((current) => (current ? { ...current, outputSource: event.target.value } : current))}
                  disabled={composeSubmitting}
                />
              </div>
              <div className="k">Output name</div>
              <div className="v">
                <input
                  className="control"
                  value={composeDialog.outputName}
                  onChange={(event) => setComposeDialog((current) => (current ? { ...current, outputName: event.target.value } : current))}
                  disabled={composeSubmitting}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => setComposeDialog(null)} disabled={composeSubmitting}>Cancel</button>
              <button className="btn good" type="button" onClick={() => void submitComposeDialog()} disabled={composeSubmitting}>Compose</button>
            </div>
          </div>
        </div>
      ) : null}


      {deleteConfirm ? (
        <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-message">
          <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}></div>
          <div className="modal">
            <h3 id="delete-confirm-title">{deleteConfirm.title}</h3>
            <p id="delete-confirm-message">{deleteConfirm.message}</p>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn bad" type="button" onClick={() => void confirmDeleteMedia()}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}

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
