'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient } from './api';
import { extractAiTags, extractTags, filterMedia, pruneSelection, toggleSelection } from './state';
import type { ExplorerView, MediaItem, Project, ToastMessage } from './types';
import { formatBytes, guessKind, kindBadgeClass, toAbsoluteUrl } from './utils';

interface ExplorerAppProps {
  apiBaseUrl?: string;
}

const DEFAULT_VIEW: ExplorerView = 'grid';

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

async function extractVideoFrame(url: string, durationHint?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = url;

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('thumb-timeout'));
    }, 6000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.src = '';
    }

    function capture() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('thumb-canvas');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.82);
        cleanup();
        resolve(data);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    video.addEventListener(
      'loadedmetadata',
      () => {
        const targetTime =
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.min(video.duration * 0.5, video.duration - 0.1)
            : durationHint || 1.0;
        video.currentTime = Math.max(0.5, targetTime);
      },
      { once: true },
    );

    video.addEventListener('seeked', capture, { once: true });
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
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { toasts, addToast } = useToastQueue();

  const [projects, setProjects] = useState<Project[]>([]);
  const [sources, setSources] = useState([] as Awaited<ReturnType<typeof api.listSources>>);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [view, setView] = useState<ExplorerView>(DEFAULT_VIEW);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<MediaItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const [resolveProjectMode, setResolveProjectMode] = useState('current');
  const [resolveProjectName, setResolveProjectName] = useState('');
  const [resolveNewName, setResolveNewName] = useState('');
  const [resolveMode, setResolveMode] = useState('import');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaScrollRef = useRef<HTMLDivElement | null>(null);
  const thumbObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbCacheRef = useRef<Map<string, string>>(new Map());
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());

  const filteredMedia = useMemo(() => filterMedia(media, query), [media, query]);
  const tags = useMemo(() => extractTags(media), [media]);
  const aiTags = useMemo(() => extractAiTags(media), [media]);

  const activePath = activeProject?.name || 'no project';
  const contentTitle = activeProject ? `Media — ${activeProject.name}` : 'Media';

  const resolveHint = selected.size
    ? `${selected.size} item(s) queued.`
    : 'Select clips to enable.';

  const updateSidebarMode = useCallback(() => {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    setIsMobile(mobile);
    if (!mobile) {
      setSidebarOpen(false);
    }
  }, []);

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
        setSelected(new Set());
        return;
      }
      try {
        const payload = await api.listMedia(project.name, project.source);
        const items = Array.isArray(payload.media) ? payload.media : [];
        setMedia(items);
        const existing = new Set(items.map((item) => item.relative_path));
        setSelected((current) => pruneSelection(current, existing));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load media';
        addToast('bad', 'Media', message);
      }
    },
    [api, addToast],
  );

  const refreshAll = useCallback(async () => {
    await loadSources();
    await loadProjects();
    await loadMedia(activeProject);
    addToast('good', 'Refresh', 'Reloaded projects + media');
  }, [activeProject, addToast, loadMedia, loadProjects, loadSources]);

  const selectProject = useCallback(
    (project: Project) => {
      setActiveProject(project);
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
      const uploadUrl =
        project.upload_url ||
        `/api/projects/${encodeURIComponent(project.name)}/upload?source=${encodeURIComponent(project.source)}`;
      const payload = await api.uploadMedia(uploadUrl, file);
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
  }, [activeProject, addToast, api, loadMedia]);

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

  const ensureThumbObserver = useCallback(() => {
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
          if (!rel || !url || kind !== 'video') return;
          if (thumbCacheRef.current.has(rel)) return;
          const requestIdle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
            .requestIdleCallback;
          if (requestIdle) {
            requestIdle(async () => {
              try {
                const data = await extractVideoFrame(url, duration);
                thumbCacheRef.current.set(rel, data);
                setThumbs((prev) => new Map(prev).set(rel, data));
              } catch {
                // fallback stays in place
              }
            }, { timeout: 1200 });
          } else {
            window.setTimeout(async () => {
              try {
                const data = await extractVideoFrame(url, duration);
                thumbCacheRef.current.set(rel, data);
                setThumbs((prev) => new Map(prev).set(rel, data));
              } catch {
                // ignore
              }
            }, 150);
          }
        });
      },
      { root: mediaScrollRef.current, rootMargin: '200px 0px', threshold: 0.1 },
    );
    thumbObserverRef.current = observer;
    return observer;
  }, []);

  const registerThumbTarget = useCallback(
    (node: HTMLDivElement | null, item: MediaItem, kind: string) => {
      if (!node || kind !== 'video' || !item.stream_url) return;
      node.dataset.rel = item.relative_path;
      node.dataset.url = item.stream_url;
      node.dataset.duration = String(item.duration || '');
      node.dataset.kind = 'video';
      ensureThumbObserver().observe(node);
    },
    [ensureThumbObserver],
  );

  const handleCopyStream = useCallback(async (item: MediaItem) => {
    if (!item.stream_url) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = toAbsoluteUrl(item.stream_url, origin);
    try {
      await navigator.clipboard.writeText(url);
      addToast('good', 'Copied', 'Stream URL copied to clipboard');
    } catch {
      addToast('warn', 'Clipboard', 'Copy failed (browser permission)');
    }
  }, [addToast]);

  const handlePreviewSelected = useCallback(() => {
    const first = Array.from(selected)[0];
    const item = media.find((entry) => entry.relative_path === first);
    if (item) openDrawer(item);
  }, [media, openDrawer, selected]);

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
    updateSidebarMode();
    const mediaQuery = window.matchMedia('(max-width: 860px)');
    mediaQuery.addEventListener('change', updateSidebarMode);
    return () => {
      mediaQuery.removeEventListener('change', updateSidebarMode);
    };
  }, [updateSidebarMode]);

  useEffect(() => {
    addToast('good', 'Boot', 'Loading sources + projects…');
    void loadSources();
    void loadProjects();
  }, [addToast, loadProjects, loadSources]);

  useEffect(() => {
    void loadMedia(activeProject);
  }, [activeProject, loadMedia]);

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

  const selectedCount = selected.size;
  const uploadCaption = activeProject
    ? `Upload to ${activeProject.name}${activeProject.source ? ` (${activeProject.source})` : ''}`
    : 'Pick a project first.';

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-inner">
          <button
            className="hamburger mobile-only"
            type="button"
            aria-label="Toggle projects"
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            ☰
          </button>
          <div className="brand" title="LAN-only media-sync-api explorer">
            <div className="logo" aria-hidden="true"></div>
            <div>
              <h1>media-sync-api</h1>
              <div className="sub">Explorer • projects → ingest → index → preview → Resolve</div>
            </div>
          </div>

          <div className="toolbar">
            <div className="search" role="search">
              <span className="kbd">⌘K</span>
              <input
                ref={searchInputRef}
                placeholder="Search filename, path… (client-side filter)"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

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
                    onClick={() => selectProject(project)}
                    role="button"
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

        <section className="content">
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
              {!activeProject ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  Select a project to view media.
                </div>
              ) : filteredMedia.length === 0 ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  No indexed files yet. Upload then run <code>/reindex</code>.
                </div>
              ) : (
                filteredMedia.map((item) => {
                  const kind = guessKind(item);
                  const title = item.relative_path?.split('/').pop() || item.relative_path || 'unnamed';
                  const sub = item.relative_path || '';
                  const size = formatBytes(item.size);
                  const cachedThumb = thumbs.get(item.relative_path) || thumbCacheRef.current.get(item.relative_path);
                  const thumbUrl =
                    cachedThumb || item.thumb_url || item.thumbnail_url || (kind === 'image' ? item.stream_url : undefined);
                  const isSelected = selected.has(item.relative_path);

                  return (
                    <div
                      key={item.relative_path}
                      className={`asset ${isSelected ? 'selected' : ''}`}
                      onClick={() => openDrawer(item)}
                    >
                      <div
                        className="thumb"
                        ref={(node) => registerThumbTarget(node, item, kind)}
                      >
                        {thumbUrl ? (
                          <img src={thumbUrl} alt={title} loading="lazy" />
                        ) : (
                          <div className="fallback">{kind === 'video' ? 'VIDEO' : 'No thumbnail'}</div>
                        )}
                        <div className="badges">
                          <span className={`badge ${kindBadgeClass(kind)}`}>{kind}</span>
                          <span className="badge">{size}</span>
                        </div>
                        <div className="selector" title="Select">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            aria-label="Select media"
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
              {!activeProject ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  Select a project to view media.
                </div>
              ) : filteredMedia.length === 0 ? (
                <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  No indexed files yet. Upload then run <code>/reindex</code>.
                </div>
              ) : (
                filteredMedia.map((item) => {
                  const kind = guessKind(item);
                  const title = item.relative_path?.split('/').pop() || item.relative_path || 'unnamed';
                  const sub = item.relative_path || '';
                  const size = formatBytes(item.size);
                  const cachedThumb = thumbs.get(item.relative_path) || thumbCacheRef.current.get(item.relative_path);
                  const thumbUrl =
                    cachedThumb || item.thumb_url || item.thumbnail_url || (kind === 'image' ? item.stream_url : undefined);
                  const isSelected = selected.has(item.relative_path);

                  return (
                    <div className="row" key={`row-${item.relative_path}`}>
                      <div
                        className="mini"
                        ref={(node) => registerThumbTarget(node, item, kind)}
                      >
                        {thumbUrl ? (
                          <img src={thumbUrl} alt={title} loading="lazy" />
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {kind === 'video' ? 'VIDEO' : kind}
                          </span>
                        )}
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
        <button className="btn primary" type="button" onClick={handleResolve}>
          ⇢ Send to Resolve
        </button>
        <button className="btn" type="button" onClick={clearSelection}>
          ✕ Clear
        </button>
      </div>

      <button
        className="mobile-fab mobile-only"
        type="button"
        onClick={() => setSidebarOpen(true)}
      >
        Projects
      </button>

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
                  <video controls preload="metadata" src={focused.stream_url || ''} />
                );
              }
              if (kind === 'image') {
                return <img src={focused.stream_url || focused.thumb_url || focused.thumbnail_url || ''} alt="preview" />;
              }
              if (kind === 'audio') {
                return <audio controls src={focused.stream_url || ''} />;
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
            >
              {focused && selected.has(focused.relative_path) ? '− Deselect' : '＋ Select'}
            </button>
          </div>

          <div className="kv">
            {(() => {
              if (!focused) return null;
              const kind = guessKind(focused);
              const rows: Array<[string, string]> = [
                ['Kind', kind],
                ['Size', formatBytes(focused.size)],
                ['Stream', focused.stream_url || '(none)'],
                ['Source', activeProject?.source || '(primary)'],
                ['Project', activeProject?.name || '(none)'],
                ['Relative', focused.relative_path || '(none)'],
                ['MIME', focused.mime || focused.content_type || ''],
                ['Hash', focused.sha256 || focused.hash || ''],
                ['Created', focused.created_at || focused.createdAt || ''],
                ['Modified', focused.updated_at || focused.updatedAt || ''],
                ['Duration', focused.duration ? `${focused.duration}s` : ''],
                ['Resolution', focused.width && focused.height ? `${focused.width}×${focused.height}` : ''],
                ['Tags', Array.isArray(focused.tags) ? focused.tags.join(', ') : focused.tags || ''],
                ['AI Tags', Array.isArray(focused.ai_tags) ? focused.ai_tags.join(', ') : focused.ai_tags || focused.aiTags || ''],
              ].filter(([, value]) => String(value || '').trim().length > 0);

              return rows.map(([key, value]) => (
                <React.Fragment key={key}>
                  <div className="k">{key}</div>
                  <div className="v">{value}</div>
                </React.Fragment>
              ));
            })()}
          </div>
        </div>
      </aside>

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
