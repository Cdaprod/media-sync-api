import { useState } from 'react';

import type { MediaItem } from '../types';

/**
 * UI-state ownership seam for modal/context/detail presentation controls.
 *
 * Keeps ExplorerApp focused on wiring + behavior while preserving existing
 * state names and update semantics.
 */
export function useExplorerUiState() {
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
