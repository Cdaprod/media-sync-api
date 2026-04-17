import { useState } from 'react';

import type { MediaTypeFilter, SortKey } from '../state';
import type { ExplorerView, MediaItem } from '../types';

interface UseExplorerUiStateOptions {
  defaultView?: ExplorerView;
  defaultGridColumns?: number;
}

/**
 * UI-state ownership seam for modal/context/detail presentation controls.
 *
 * Keeps ExplorerApp focused on wiring + behavior while preserving existing
 * state names and update semantics.
 */
export function useExplorerUiState(options: UseExplorerUiStateOptions = {}) {
  const {
    defaultView = 'grid',
    defaultGridColumns = 3,
  } = options;

  const [view, setView] = useState<ExplorerView>(defaultView);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [gridColumnCount, setGridColumnCount] = useState(defaultGridColumns);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [topbarHasOpenDropdown, setTopbarHasOpenDropdown] = useState(false);
  const [topbarFocusWithin, setTopbarFocusWithin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [touchPinchCapable, setTouchPinchCapable] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [pendingDataLoadOverlay, setPendingDataLoadOverlay] = useState(false);
  const [resolveProjectMode, setResolveProjectMode] = useState('current');
  const [resolveProjectName, setResolveProjectName] = useState('');
  const [resolveNewName, setResolveNewName] = useState('');
  const [resolveMode, setResolveMode] = useState('import');
  const [previewObsMode, setPreviewObsMode] = useState<'cover' | 'fit' | 'fill'>('cover');
  const [previewObsSlot, setPreviewObsSlot] = useState('1');
  const [previewObsExclusive, setPreviewObsExclusive] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [previewDetailsOpen, setPreviewDetailsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MediaItem[] } | null>(null);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [composeModalRendered, setComposeModalRendered] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeOutputName, setComposeOutputName] = useState('');
  const [composeOutputProject, setComposeOutputProject] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalRendered, setDeleteModalRendered] = useState(false);
  const [pendingDeleteSelectionKeys, setPendingDeleteSelectionKeys] = useState<string[]>([]);

  return {
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
  };
}
