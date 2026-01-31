'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient } from './api';
import {
  collectMediaMeta,
  extractAiTags,
  extractTags,
  filterMedia,
  pruneSelection,
  sortMedia,
  sortMediaByRecent,
  toggleSelection,
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

interface ExplorerAppProps {
  apiBaseUrl?: string;
}

const DEFAULT_VIEW: ExplorerView = 'grid';
const POINTER_THRESHOLD = 8;
const LONG_PRESS_MS = 480;

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

const updateCardOrientation = (mediaEl: HTMLImageElement | HTMLVideoElement) => {
  const width = mediaEl instanceof HTMLImageElement ? mediaEl.naturalWidth : mediaEl.videoWidth;
  const height = mediaEl instanceof HTMLImageElement ? mediaEl.naturalHeight : mediaEl.videoHeight;
  const orient = inferOrientation(width, height);
  if (!orient) return;
  const card = mediaEl.closest('.asset') as HTMLElement | null;
  if (card) card.dataset.orient = orient;
};

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

const THUMB_CACHE_NAME = 'media-sync-thumb-cache-v1';
const THUMB_MAX_WORKERS = 2;
const FILTER_PREFS_KEY = 'media-sync-explorer-filters-v1';

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

const thumbCacheRequest = (key: string) => {
  if (!key || typeof window === 'undefined') return '';
  return `${window.location.origin}/__thumbs/${encodeURIComponent(key)}`;
};

const canUseCacheStorage = () => typeof window !== 'undefined' && 'caches' in window;

async function readThumbFromCache(key: string): Promise<string | null> {
  if (!key) return null;
  if (!canUseCacheStorage()) return null;
  try {
    const cache = await caches.open(THUMB_CACHE_NAME);
    const response = await cache.match(thumbCacheRequest(key));
    if (!response) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    // ignore cache errors
  }
  return null;
}

async function writeThumbToCache(key: string, blob: Blob): Promise<void> {
  if (!key || !blob || !canUseCacheStorage()) return;
  try {
    const cache = await caches.open(THUMB_CACHE_NAME);
    await cache.put(
      thumbCacheRequest(key),
      new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      }),
    );
  } catch {
    // best-effort cache writes
  }
}

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
  }, [dragging, sidebarOpen]);

  useEffect(() => {
    return () => {
      timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  return { toasts, addToast };
}

async function extractVideoFrame(url: string, durationHint?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    const withTimeHint = url.includes('#') ? url : `${url}#t=0.1`;
    video.src = withTimeHint;

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('thumb-timeout'));
    }, 6000);

    let settled = false;
    let targetTime = Math.min(Math.max(durationHint || 0.5, 0.3), 1.5);

    function cleanup() {
      window.clearTimeout(timeout);
      video.src = '';
    }

    function capture() {
      if (settled) return;
      settled = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('thumb-canvas');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          if (!blob) return reject(new Error('thumb-blob'));
          resolve(blob);
        }, 'image/jpeg', 0.82);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    video.addEventListener(
      'loadedmetadata',
      () => {
        targetTime =
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.min(Math.max(video.duration * 0.05, 0.3), 2.0)
            : Math.min(Math.max(durationHint || 0.5, 0.3), 1.5);
        video.currentTime = targetTime;
      },
      { once: true },
    );

    video.addEventListener('seeked', capture, { once: true });
    video.addEventListener(
      'loadeddata',
      () => {
        if (settled) return;
        if (video.readyState >= 2 && (video.currentTime >= targetTime || video.currentTime > 0)) {
          capture();
        }
      },
      { once: true },
    );
    video.addEventListener(
      'timeupdate',
      () => {
        if (settled) return;
        if (video.readyState >= 2 && (video.currentTime >= targetTime || video.currentTime > 0)) {
          capture();
        }
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => {
        cleanup();
        reject(new Error('thumb-error'));
      },
      { once: true },
    );
  });
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
  const [dragActive, setDragActive] = useState(false);
  const [assetDragActive, setAssetDragActive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MediaItem[] } | null>(null);
  const dragPathsRef = useRef<string[]>([]);

  const [resolveProjectMode, setResolveProjectMode] = useState('current');
  const [resolveProjectName, setResolveProjectName] = useState('');
  const [resolveNewName, setResolveNewName] = useState('');
  const [resolveMode, setResolveMode] = useState('import');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaScrollRef = useRef<HTMLDivElement | null>(null);
  const sortSelectRef = useRef<HTMLSelectElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const thumbObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbCacheRef = useRef<Map<string, string>>(new Map());
  const thumbPendingRef = useRef<Set<string>>(new Set());
  const thumbQueueRef = useRef<
    Array<{
      key: string;
      rel: string;
      url: string;
      duration: number;
      target: HTMLElement;
    }>
  >([]);
  const thumbInFlightRef = useRef<Set<string>>(new Set());
  const thumbActiveRef = useRef(0);
  const thumbQueueScheduledRef = useRef(false);
  const processThumbQueueRef = useRef<() => void>(() => {});
  const thumbSweepTimerRef = useRef<number | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());

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
  const itemsByPath = useMemo(() => {
    const map = new Map<string, MediaItem>();
    media.forEach((item) => {
      if (item.relative_path) map.set(item.relative_path, item);
    });
    return map;
  }, [media]);
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
      if (!activeProject) return;
      setSelected((current) => toggleSelection(current, relPath));
    },
    [activeProject, setSelected],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const openDrawer = useCallback((item: MediaItem) => {
    setFocused(item);
    setInspectorOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setInspectorOpen(false);
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

  const deleteMediaPaths = useCallback(
    async (paths: string[]) => {
      const project = activeProject;
      if (!project) {
        addToast('warn', 'Delete', 'Select a project first');
        return;
      }
      if (!paths.length) {
        addToast('warn', 'Delete', 'Select one or more clips');
        return;
      }
      try {
        await api.deleteMedia(project.name, paths, project.source);
        addToast('good', 'Delete', 'Removed media from disk and index');
        setSelected((current) => {
          const next = new Set(current);
          paths.forEach((path) => next.delete(path));
          return next;
        });
        if (focused && paths.includes(focused.relative_path)) {
          setFocused(null);
          setInspectorOpen(false);
        }
        await loadMedia(project);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed';
        addToast('bad', 'Delete', message);
      }
    },
    [activeProject, addToast, api, focused, loadMedia],
  );

  const moveMediaPaths = useCallback(
    async (paths: string[], targetProject: Project) => {
      const project = activeProject;
      if (!project) return;
      try {
        await api.moveMedia(
          project.name,
          paths,
          targetProject.name,
          project.source,
          targetProject.source,
        );
        addToast('good', 'Move', `Moved ${paths.length} item(s) to ${targetProject.name}`);
        setSelected((current) => {
          const next = new Set(current);
          paths.forEach((path) => next.delete(path));
          return next;
        });
        if (focused && paths.includes(focused.relative_path)) {
          setFocused(null);
          setInspectorOpen(false);
        }
        await loadMedia(project);
        await loadProjects();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Move failed';
        addToast('bad', 'Move', message);
      }
    },
    [activeProject, addToast, api, focused, loadMedia, loadProjects],
  );

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

  function scheduleThumbQueue() {
    if (thumbQueueScheduledRef.current) return;
    thumbQueueScheduledRef.current = true;
    const requestIdle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
      .requestIdleCallback;
    const run = () => {
      thumbQueueScheduledRef.current = false;
      processThumbQueueRef.current();
    };
    if (requestIdle) {
      requestIdle(run, { timeout: 1200 });
    } else {
      window.setTimeout(run, 150);
    }
  }

  function isThumbTargetVisible(target: HTMLElement) {
    if (!target?.getBoundingClientRect) return false;
    if (target.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (target.offsetParent === null && style.position !== 'fixed') return false;
    const rootRect = mediaScrollRef.current?.getBoundingClientRect?.() || {
      top: 0,
      bottom: window.innerHeight,
    };
    const rect = target.getBoundingClientRect();
    return rect.bottom >= rootRect.top - 200 && rect.top <= rootRect.bottom + 200;
  }

  function processThumbQueue() {
    while (thumbActiveRef.current < THUMB_MAX_WORKERS && thumbQueueRef.current.length) {
      const job = thumbQueueRef.current.shift();
      if (!job) break;
      if (!job.target?.isConnected) {
        thumbInFlightRef.current.delete(job.key);
        continue;
      }
      if (!isThumbTargetVisible(job.target)) {
        thumbInFlightRef.current.delete(job.key);
        continue;
      }
      thumbActiveRef.current += 1;
      job.target.dataset.state = 'loading';
      extractVideoFrame(job.url, job.duration)
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          thumbCacheRef.current.set(job.key, objectUrl);
          setThumbs((prev) => new Map(prev).set(job.key, objectUrl));
          void writeThumbToCache(job.key, blob);
          job.target.dataset.state = 'loaded';
        })
        .catch(() => {
          const attempts = Number(job.target.dataset.attempts || 0) + 1;
          job.target.dataset.attempts = String(attempts);
          job.target.dataset.state = attempts < 3 ? 'idle' : 'error';
          if (attempts < 3) {
            window.setTimeout(() => {
              ensureThumbObserver().observe(job.target);
              scheduleThumbSweep();
            }, 800);
          }
        })
        .finally(() => {
          thumbActiveRef.current = Math.max(0, thumbActiveRef.current - 1);
          thumbInFlightRef.current.delete(job.key);
          processThumbQueue();
        });
    }
  }

  function enqueueThumbWork(target: HTMLElement) {
    const rel = target.dataset.rel;
    const url = target.dataset.url;
    const duration = Number(target.dataset.duration || 0);
    const key = target.dataset.thumbKey || rel;
    const state = target.dataset.state || 'idle';
    const attempts = Number(target.dataset.attempts || 0);
    if (!rel || !url || !key) return;
    if (state === 'loaded' || state === 'loading' || attempts >= 3) return;
    if (thumbInFlightRef.current.has(key)) return;
    thumbInFlightRef.current.add(key);
    thumbQueueRef.current.push({ key, rel, url, duration, target });
    scheduleThumbQueue();
  }

  function scheduleThumbSweep() {
    if (thumbSweepTimerRef.current) {
      window.clearTimeout(thumbSweepTimerRef.current);
    }
    thumbSweepTimerRef.current = window.setTimeout(() => {
      thumbSweepTimerRef.current = null;
      const root = mediaScrollRef.current;
      if (!root) return;
      const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-kind="video"][data-url]'));
      targets.forEach((target) => {
        if (!isThumbTargetVisible(target)) return;
        enqueueThumbWork(target);
      });
    }, 120);
  }

  function ensureThumbObserver() {
    if (thumbObserverRef.current) return thumbObserverRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const target = entry.target as HTMLElement;
          const rel = target.dataset.rel;
          const url = target.dataset.url;
          const duration = Number(target.dataset.duration || 0);
          const kind = target.dataset.kind;
          const key = target.dataset.thumbKey || rel;
          const state = target.dataset.state || 'idle';
          const attempts = Number(target.dataset.attempts || 0);
          if (!rel || !url || kind !== 'video' || !key) return;
          if (state === 'loaded' || attempts >= 3) return;
          if (thumbCacheRef.current.has(key)) return;
          enqueueThumbWork(target);
        });
      },
      { root: mediaScrollRef.current, rootMargin: '200px 0px', threshold: 0.1 },
    );
    thumbObserverRef.current = observer;
    return observer;
  }

  async function primeThumbFromCache(key: string, node: HTMLElement) {
    if (!key || !node) return;
    if (thumbCacheRef.current.has(key)) {
      node.dataset.state = 'loaded';
      return;
    }
    if (thumbPendingRef.current.has(key)) return;
    thumbPendingRef.current.add(key);
    try {
      const cached = await readThumbFromCache(key);
      if (cached) {
        thumbCacheRef.current.set(key, cached);
        setThumbs((prev) => new Map(prev).set(key, cached));
        node.dataset.state = 'loaded';
        return;
      }
    } finally {
      thumbPendingRef.current.delete(key);
    }
    node.dataset.state = node.dataset.state || 'idle';
    node.dataset.attempts = node.dataset.attempts || '0';
    scheduleThumbSweep();
    ensureThumbObserver().observe(node);
  }

  processThumbQueueRef.current = processThumbQueue;

  const registerThumbTarget = useCallback(
    (node: HTMLDivElement | null, item: MediaItem, kind: string) => {
      if (!node || kind !== 'video' || !item.stream_url) return;
      const resolvedUrl = resolveAssetUrl(item.stream_url);
      if (!resolvedUrl) return;
      const key = getThumbCacheKey(item);
      node.dataset.rel = item.relative_path;
      node.dataset.url = resolvedUrl;
      node.dataset.duration = String(item.duration || '');
      node.dataset.kind = 'video';
      node.dataset.thumbKey = key;
      node.dataset.state = node.dataset.state || 'idle';
      node.dataset.attempts = node.dataset.attempts || '0';
      void primeThumbFromCache(key, node);
    },
    [primeThumbFromCache, resolveAssetUrl],
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
      handler: () => deleteMediaPaths(items.map((entry) => entry.relative_path)),
    });
    return actions;
  }, [deleteMediaPaths, handleCopySelectedUrls, handleCopyStream, openDrawer, resolveAssetUrl]);

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
            ? Array.from(selected).map((path) => itemsByPath.get(path)).filter(Boolean)
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
            if (target) void moveMediaPaths(dragPathsRef.current, target);
          }
          return;
        }
        if (!activeProject) return;
        if (selected.has(item.relative_path)) openDrawer(item);
        else toggleSelected(item.relative_path);
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
          ? Array.from(selected).map((path) => itemsByPath.get(path)).filter(Boolean)
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
    [activeProject, dragging, itemsByPath, moveMediaPaths, openContextMenu, openDrawer, projects, selected, toggleSelected],
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
    await moveMediaPaths(dragPathsRef.current, project);
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
    scheduleThumbSweep();
  }, [filteredMedia, scheduleThumbSweep, view]);

  useEffect(() => {
    const root = mediaScrollRef.current;
    if (!root) return;
    const handleScroll = () => scheduleThumbSweep();
    root.addEventListener('scroll', handleScroll, { passive: true });
    return () => root.removeEventListener('scroll', handleScroll);
  }, [scheduleThumbSweep]);

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
    return () => {
      thumbObserverRef.current?.disconnect();
    };
  }, []);

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
  const contextActions = useMemo(
    () => (contextMenu ? getContextActions(contextMenu.items) : []),
    [contextMenu, getContextActions],
  );
  const uploadCaption = activeProject
    ? `Upload to ${activeProject.name}${activeProject.source ? ` (${activeProject.source})` : ''}`
    : 'Pick a project first.';
  const canSelect = Boolean(activeProject);
  const projectLabel = (item: MediaItem) => {
    if (!item.project_name) return '';
    return item.project_source ? `${item.project_name} (${item.project_source})` : item.project_name;
  };

  return (
    <div className={`app ${topbarHidden ? 'topbar-hidden' : ''}`}>
      <div className="topbar-reveal" ref={topbarRevealRef} aria-hidden="true" />
      <div className="topbar" ref={topbarRef}>
        <div className="topbar-inner">
          <div className="brand" title="LAN-only media-sync-api explorer" ref={brandRef}>
            <div className="logo" aria-hidden="true"></div>
            <div>
              <h1>media-sync-api</h1>
              <div className="sub">Explorer • projects → ingest → index → preview → Resolve</div>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-toggle">
              <button
                className="btn mobile-only"
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
              >
                Projects
              </button>
            </div>
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
      </div>

      <div className="main">
        <aside className={`sidebar ${isMobile ? 'sidebar-drawer' : ''} ${sidebarOpen ? 'is-open' : ''}`}>
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
          className={`content ${dragActive ? 'drag-active' : ''}`}
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
          <div className="section-h">
            <h2>{contentTitle}</h2>
            <div className="meta-line">
              <span>{filteredMedia.length} items</span>
              <span>•</span>
              <span className="kbd">{activePath}</span>
            </div>
          </div>

          <div className="scroll" ref={mediaScrollRef}>
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
                  const orient = inferOrientationFromItem(item) || 'square';
                  const title = item.relative_path?.split('/').pop() || item.relative_path || 'unnamed';
                  const proj = projectLabel(item);
                  const sub = proj ? `${item.relative_path || ''} • ${proj}` : (item.relative_path || '');
                  const size = formatBytes(item.size);
                  const pointerHandlers = buildAssetPointerHandlers(item);
                  const thumbKey = getThumbCacheKey(item);
                  const cachedThumb = thumbs.get(thumbKey) || thumbCacheRef.current.get(thumbKey);
                  const rawThumbUrl = cachedThumb
                    || item.thumb_url
                    || item.thumbnail_url
                    || (kind === 'image' ? item.stream_url : undefined);
                  const fallbackThumb = buildThumbFallback(kind);
                  const thumbUrl = cachedThumb ? cachedThumb : (rawThumbUrl ? resolveAssetUrl(rawThumbUrl) : undefined);
                  const safeThumbUrl = thumbUrl || fallbackThumb;
                  const isSelected = selected.has(item.relative_path);

                  return (
                    <div
                      key={`${item.project_name || activeProject?.name || 'project'}-${item.project_source || 'primary'}-${item.relative_path}`}
                      className={`asset ${isSelected ? 'selected' : ''}`}
                      data-kind={kind}
                      data-orient={orient}
                      {...pointerHandlers}
                    >
                      <div
                        className="thumb"
                        ref={(node) => registerThumbTarget(node, item, kind)}
                      >
                        <img
                          className="asset-thumb"
                          src={safeThumbUrl}
                          alt={title}
                          loading="lazy"
                          onLoad={(event) => updateCardOrientation(event.currentTarget)}
                          onError={(event) => {
                            const target = event.currentTarget;
                            if (target.src !== fallbackThumb) target.src = fallbackThumb;
                          }}
                        />
                        <div className="badges">
                          <span className={`badge ${kindBadgeClass(kind)}`}>{kind}</span>
                          <span className="badge">{size}</span>
                        </div>
                        <div className="selector" title="Select">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            aria-label="Select media"
                            disabled={!canSelect}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleSelected(item.relative_path)}
                          />
                        </div>
                      </div>
                      <div className="body">
                        <div className="title">{title}</div>
                        <div className="sub">{sub}</div>
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
                  const thumbKey = getThumbCacheKey(item);
                  const cachedThumb = thumbs.get(thumbKey) || thumbCacheRef.current.get(thumbKey);
                  const rawThumbUrl = cachedThumb
                    || item.thumb_url
                    || item.thumbnail_url
                    || (kind === 'image' ? item.stream_url : undefined);
                  const fallbackThumb = buildThumbFallback(kind);
                  const thumbUrl = cachedThumb ? cachedThumb : (rawThumbUrl ? resolveAssetUrl(rawThumbUrl) : undefined);
                  const safeThumbUrl = thumbUrl || fallbackThumb;
                  const isSelected = selected.has(item.relative_path);

                  return (
                    <div
                      className="row"
                      key={`row-${item.project_name || activeProject?.name || 'project'}-${item.project_source || 'primary'}-${item.relative_path}`}
                      {...pointerHandlers}
                    >
                      <div
                        className="mini"
                        ref={(node) => registerThumbTarget(node, item, kind)}
                      >
                        <img
                          className="asset-thumb"
                          src={safeThumbUrl}
                          alt={title}
                          loading="lazy"
                          onLoad={(event) => updateCardOrientation(event.currentTarget)}
                          onError={(event) => {
                            const target = event.currentTarget;
                            if (target.src !== fallbackThumb) target.src = fallbackThumb;
                          }}
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
          className="btn bad"
          type="button"
          onClick={() => deleteMediaPaths(Array.from(selected))}
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

          <div className="drawer-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                const mediaElement = document.querySelector('.drawer video, .drawer audio') as
                  | HTMLVideoElement
                  | HTMLAudioElement
                  | null;
                mediaElement?.play?.();
              }}
            >
              ▶ Play
            </button>
            <button className="btn" type="button" onClick={() => focused && handleCopyStream(focused)}>
              ⧉ Copy stream URL
            </button>
            <button
              className={`btn ${focused && selected.has(focused.relative_path) ? '' : 'primary'}`}
              type="button"
              onClick={() => focused && toggleSelected(focused.relative_path)}
              disabled={!activeProject}
            >
              {focused && selected.has(focused.relative_path) ? '− Deselect' : '＋ Select'}
            </button>
            <button
              className="btn bad"
              type="button"
              onClick={() => focused && deleteMediaPaths([focused.relative_path])}
              disabled={!activeProject}
            >
              🗑 Delete
            </button>
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
