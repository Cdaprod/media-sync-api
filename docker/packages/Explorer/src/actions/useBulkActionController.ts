'use client';

import { useCallback } from 'react';
import type { AssetRef } from '../api';
import type { ComposeJobEnvelope } from '../composeJobs';
import type { MediaItem, Project } from '../types';

export function useBulkActionController(args: {
  addToast: (type: 'good'|'warn'|'bad', title: string, message: string, operationId?: string) => string;
  selected: Set<string>;
  selectedOrder: string[];
  selectionItems: MediaItem[];
  selectedVideoItems: MediaItem[];
  projects: Project[];
  composeSubmitting: boolean;
  composeOutputName: string;
  composeOutputProject: string;
  setComposeOutputName: (value: string) => void;
  setComposeOutputProject: (value: string) => void;
  setComposeSubmitting: (value: boolean) => void;
  setComposeModalOpen: (value: boolean) => void;
  pendingDeleteSelectionKeys: string[];
  setPendingDeleteSelectionKeys: (keys: string[]) => void;
  setDeleteModalOpen: (value: boolean) => void;
  deleteSubmitting: boolean;
  performDeleteMediaSelection: (keys: string[]) => Promise<void>;
  resolveSelectionKeysForItems: (items: MediaItem[]) => string[];
  resolveItemsForSelection: (keys: string[]) => MediaItem[];
  toAssetRef: (item: MediaItem) => AssetRef | null;
  composeMediaCommand: (args: { assets: AssetRef[]; outputProject: Project; outputName: string; title: string }) => Promise<unknown>;
  registerAcceptedJob: (input: { envelope: ComposeJobEnvelope }) => void;
  buildComposeTimestampName: () => string;
  defaultComposeProject: (projects: Project[]) => Project | null;
  tagMediaSelection: (items: MediaItem[], add: string[], remove: string[]) => Promise<void>;
}) {
  const a = args;
  const deleteSelected = useCallback((selectionKeys: string[]) => {
    const items = a.resolveItemsForSelection(selectionKeys);
    if (!items.length) return a.addToast('warn', 'Delete', 'Select one or more clips');
    const refs = items.map((item) => a.toAssetRef(item)).filter((item): item is AssetRef => Boolean(item));
    if (!refs.length) return a.addToast('warn', 'Delete', 'Unable to resolve selected media paths');
    a.setPendingDeleteSelectionKeys(a.resolveSelectionKeysForItems(items));
    a.setDeleteModalOpen(true);
  }, [a]);
  const confirmDeleteSelected = useCallback(async () => {
    if (a.deleteSubmitting) return;
    const selectionKeys = a.pendingDeleteSelectionKeys.slice();
    if (!selectionKeys.length) {
      a.setDeleteModalOpen(false);
      return;
    }
    a.setDeleteModalOpen(false);
    a.setPendingDeleteSelectionKeys([]);
    await a.performDeleteMediaSelection(selectionKeys);
  }, [a]);
  const cancelDeleteSelected = useCallback(() => {
    if (a.deleteSubmitting) return;
    a.setDeleteModalOpen(false);
    a.setPendingDeleteSelectionKeys([]);
  }, [a]);
  const composeSelected = useCallback(async () => {
    if (!a.selected.size) return a.addToast('warn', 'Compose', 'Select one or more clips');
    if (!a.selectedVideoItems.length) return a.addToast('warn', 'Compose', 'Select one or more video clips');
    if (!a.projects.length) return a.addToast('warn', 'Compose', 'No projects available for compose output.');
    const preferredProject = a.defaultComposeProject(a.projects);
    a.setComposeOutputName(a.buildComposeTimestampName());
    a.setComposeOutputProject(preferredProject?.name || 'P5-SHARED-Exported-Media');
    a.setComposeSubmitting(false);
    a.setComposeModalOpen(true);
  }, [a]);
  return { deleteSelected, confirmDeleteSelected, cancelDeleteSelected, composeSelected, selectedOrder: a.selectedOrder };
}
