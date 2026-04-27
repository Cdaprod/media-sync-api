'use client';

import { useMemo } from 'react';

import type { MediaItem } from '../types';
import {
  buildAssetRenderedEntries,
  buildRenderedMediaEntries,
  type PendingArtifactRenderedEntry,
  type PendingComposeRenderedEntry,
  type PendingRecordingRenderedEntry,
} from './renderedEntries';

type UseExplorerRenderControllerArgs = {
  filteredMedia: MediaItem[];
  pendingComposeEntries: PendingComposeRenderedEntry[];
  pendingRecordingEntries: PendingRecordingRenderedEntry[];
};

export function useExplorerRenderController({
  filteredMedia,
  pendingComposeEntries,
  pendingRecordingEntries,
}: UseExplorerRenderControllerArgs) {
  const assetEntries = useMemo(
    () => buildAssetRenderedEntries(filteredMedia),
    [filteredMedia],
  );

  const pendingEntries = useMemo<PendingArtifactRenderedEntry[]>(
    () => [
      ...pendingRecordingEntries,
      ...pendingComposeEntries,
    ],
    [pendingComposeEntries, pendingRecordingEntries],
  );

  const renderedEntries = useMemo(
    () => buildRenderedMediaEntries({
      assetEntries,
      pendingEntries,
    }),
    [assetEntries, pendingEntries],
  );

  return {
    renderedEntries,
    assetEntries,
    pendingEntries,
  };
}
