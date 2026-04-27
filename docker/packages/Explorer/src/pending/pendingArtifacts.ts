import type { PendingComposeItem } from '../composeJobs';
import type { PendingRecordingAsset } from '../liveRecordings';

export type PendingArtifact =
  | { kind: 'pending-recording'; recordingItem: PendingRecordingAsset }
  | { kind: 'pending-compose'; pendingItem: PendingComposeItem };

export function pendingArtifactFromCompose(pendingItem: PendingComposeItem): PendingArtifact {
  return {
    kind: 'pending-compose',
    pendingItem,
  };
}

export function pendingArtifactFromRecording(recordingItem: PendingRecordingAsset): PendingArtifact {
  return {
    kind: 'pending-recording',
    recordingItem,
  };
}

export function sortPendingArtifactsForDisplay(items: PendingArtifact[]): PendingArtifact[] {
  const recordings = items.filter((item): item is Extract<PendingArtifact, { kind: 'pending-recording' }> => item.kind === 'pending-recording');
  const compose = items.filter((item): item is Extract<PendingArtifact, { kind: 'pending-compose' }> => item.kind === 'pending-compose');
  return [...recordings, ...compose];
}
