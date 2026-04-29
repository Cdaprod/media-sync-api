'use client';

import { useMemo } from 'react';
import { filterMedia, sortMedia, type MediaMeta, type MediaTypeFilter, type SortKey } from '../state';
import type { MediaItem, Project } from '../types';

export function useExplorerSearchFilterController(args: {
  media: MediaItem[];
  mediaMeta: MediaMeta;
  activeProject: Project | null;
  selected: Set<string>;
  query: string;
  typeFilter: MediaTypeFilter;
  selectedOnly: boolean;
  untaggedOnly: boolean;
  sortKey: SortKey;
  assetSelectionKey: (item: MediaItem, projectOverride?: Project | null) => string;
}) {
  const { media, mediaMeta, activeProject, selected, query, typeFilter, selectedOnly, untaggedOnly, sortKey, assetSelectionKey } = args;
  const filteredMedia = useMemo(() => {
    const filtered = filterMedia(media, { query, type: typeFilter, selectedOnly: false, untaggedOnly, selected }, mediaMeta);
    const selectedFiltered = selectedOnly ? filtered.filter((item) => selected.has(assetSelectionKey(item, activeProject))) : filtered;
    return sortMedia(selectedFiltered, sortKey, mediaMeta);
  }, [media, mediaMeta, activeProject, selected, query, typeFilter, selectedOnly, untaggedOnly, sortKey, assetSelectionKey]);
  return { filteredMedia, query, typeFilter, sortKey, selectedOnly, untaggedOnly };
}
