import type { PendingComposeItem } from '../composeJobs';
import type { PendingRecordingAsset } from '../liveRecordings';
import type { MediaItem } from '../types';

export type AssetRenderedEntry = { kind: 'asset'; item: MediaItem };
export type PendingComposeRenderedEntry = { kind: 'pending-compose'; pendingItem: PendingComposeItem };
export type PendingRecordingRenderedEntry = { kind: 'pending-recording'; recordingItem: PendingRecordingAsset };
export type PendingArtifactRenderedEntry = PendingComposeRenderedEntry | PendingRecordingRenderedEntry;
export type RenderedMediaEntry = AssetRenderedEntry | PendingArtifactRenderedEntry;

// pending-artifact marker: pending entries stay ahead of asset entries.
export function buildAssetRenderedEntries(media: MediaItem[]): AssetRenderedEntry[] {
  return media.map((item) => ({ kind: 'asset', item }));
}

export function buildRenderedMediaEntries(args: {
  assetEntries: AssetRenderedEntry[];
  pendingEntries: PendingArtifactRenderedEntry[];
}): RenderedMediaEntry[] {
  const { assetEntries, pendingEntries } = args;
  return [
    ...pendingEntries,
    ...assetEntries,
  ];
}
