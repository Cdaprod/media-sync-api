import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ApiClient, AssetRef } from '../api';
import type { MediaItem, Project, ToastMessage } from '../types';

type AddToast = (
  type: ToastMessage['type'],
  title: string,
  message: string,
  operationId?: string,
) => string;

interface RefreshScope {
  project?: string;
  source?: string;
  paths?: string[];
}

interface UseExplorerCommandsArgs {
  api: ApiClient;
  addToast: AddToast;
  activeProject: Project | null;
  mediaScope: 'project' | 'all';
  focused: MediaItem | null;
  assetSelectionKey: (item: MediaItem, project: Project | null) => string;
  loadAllMedia: () => Promise<void>;
  loadMedia: (project: Project | null) => Promise<void>;
  refreshLibrarySnapshot: (options?: { source?: string; scope?: 'all' | 'project'; project?: string }) => Promise<unknown>;
  refreshMediaForScope: (scope: RefreshScope | null | undefined) => Promise<void>;
  resolveItemsForSelection: (selectionKeys: string[]) => MediaItem[];
  resolveSelectionKeysForItems: (items: MediaItem[]) => string[];
  toAssetRef: (item: MediaItem) => AssetRef | null;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setFocused: Dispatch<SetStateAction<MediaItem | null>>;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  setDeleteSubmitting: Dispatch<SetStateAction<boolean>>;
}

/**
 * Mutation command orchestration for Explorer media actions.
 *
 * Example:
 *   const { moveMediaSelection } = useExplorerCommands({ ...deps });
 *   await moveMediaSelection(keys, project);
 */
export function useExplorerCommands(args: UseExplorerCommandsArgs) {
  const {
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
  } = args;

  const refreshAfterScopedMutation = useCallback(async (scope: RefreshScope | null) => {
    const projectName = String(scope?.project || '').trim();
    const sourceName = String(scope?.source || '').trim();
    if (projectName) {
      await refreshLibrarySnapshot({ scope: 'project', project: projectName, source: sourceName || undefined });
      await refreshMediaForScope(scope);
      return;
    }
    if (mediaScope === 'all' || !activeProject) await loadAllMedia();
    else await loadMedia(activeProject);
    await refreshLibrarySnapshot({ scope: 'all' });
  }, [activeProject, loadAllMedia, loadMedia, mediaScope, refreshLibrarySnapshot, refreshMediaForScope]);

  const performDeleteMediaSelection = useCallback(async (selectionKeys: string[]) => {
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
      const first = refs[0];
      await refreshAfterScopedMutation(first ? { project: first.project, source: first.source || undefined } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      addToast('bad', 'Delete', message);
    } finally {
      setDeleteSubmitting(false);
    }
  }, [
    activeProject,
    addToast,
    api,
    assetSelectionKey,
    focused,
    refreshAfterScopedMutation,
    resolveItemsForSelection,
    resolveSelectionKeysForItems,
    setDeleteSubmitting,
    setFocused,
    setInspectorOpen,
    setSelected,
    toAssetRef,
  ]);

  const moveMediaSelection = useCallback(async (selectionKeys: string[], targetProject: Project) => {
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
      await refreshAfterScopedMutation({
        project: activeProject?.name,
        source: activeProject?.source || undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Move failed';
      addToast('bad', 'Move', message);
    }
  }, [
    activeProject,
    addToast,
    api,
    assetSelectionKey,
    focused,
    refreshAfterScopedMutation,
    resolveItemsForSelection,
    setFocused,
    setInspectorOpen,
    setSelected,
    toAssetRef,
  ]);

  const tagMediaSelection = useCallback(async (
    items: MediaItem[],
    addTags: string[],
    removeTags: string[],
  ) => {
    const refs = items
      .map((item) => toAssetRef(item))
      .filter((item): item is AssetRef => Boolean(item));
    if (!refs.length) {
      addToast('warn', 'Tags', 'Unable to resolve selected media paths');
      return;
    }
    try {
      await api.bulkTagMedia(refs, addTags, removeTags);
      addToast('good', 'Tags', `Updated tags for ${refs.length} item(s)`);
      const first = refs[0];
      await refreshAfterScopedMutation(first ? { project: first.project, source: first.source || undefined } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tag update failed';
      addToast('bad', 'Tags', message);
    }
  }, [addToast, api, refreshAfterScopedMutation, toAssetRef]);

  return {
    performDeleteMediaSelection,
    moveMediaSelection,
    tagMediaSelection,
  };
}
