'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ComposeJobEnvelope, PendingComposeItem } from '../composeJobs';
import { pendingComposeMatchesMediaItem, sortPendingComposeItemsForDisplay } from '../composeJobs';
import { usePendingComposeJobs } from '../hooks/usePendingComposeJobs';
import { useRecordingSessions } from '../hooks/useRecordingSessions';
import { createApiClient } from '../api';
import type { PendingRecordingAsset } from '../liveRecordings';
import { pendingRecordingMatchesMediaItem, sortPendingRecordingAssetsForDisplay } from '../liveRecordings';
import type { MediaItem, Project, ToastMessage } from '../types';
import type { LiveSession } from '../types/liveSession';
import {
  pendingArtifactFromCompose,
  pendingArtifactFromRecording,
  sortPendingArtifactsForDisplay,
  type PendingArtifact,
} from './pendingArtifacts';

type AddToast = (
  type: ToastMessage['type'],
  title: string,
  message: string,
  operationId?: string,
) => string;



type RuntimeAssetRecord = {
  id: string;
  state: string;
  kind: string;
  project?: string | null;
  source?: string | null;
  target_dir?: string | null;
  session_id?: string | null;
  recording_id?: string | null;
  node_id?: string | null;
  asset_url?: string | null;
  error?: string | null;
  created_at?: string | null;
};

function runtimeAssetToPendingRecording(asset: RuntimeAssetRecord): PendingRecordingAsset | null {
  if (asset.kind !== 'recording' && asset.kind !== 'live') return null;
  const statusByState: Record<string, PendingRecordingAsset['status']> = {
    recording: 'recording',
    previewable: 'recording',
    materializing: 'finalizing',
    ready: 'saved',
    failed: 'failed',
  };
  const status = statusByState[asset.state] || null;
  if (!status) return null;
  return {
    recordingId: asset.recording_id || asset.id,
    sessionId: asset.session_id || '',
    nodeId: asset.node_id || 'runtime',
    project: asset.project || 'Runtime',
    source: asset.source || 'primary',
    targetDir: asset.target_dir || 'ingest/live',
    outputName: asset.kind === 'live' ? 'Live Preview' : null,
    createdAt: asset.created_at || new Date().toISOString(),
    startedAt: asset.created_at || new Date().toISOString(),
    status,
    assetUrl: asset.asset_url || null,
    error: asset.error || undefined,
  };
}

type UsePendingArtifactControllerArgs = {
  resolvedApiBase: string;
  activeProject: Project | null;
  projects: Project[];
  media: MediaItem[];
  mediaScope: 'project' | 'all';
  addToast: AddToast;
  refreshLibrarySnapshot: () => Promise<void>;
  fetchComposeJobJson: (url: string) => Promise<unknown>;
  handleComposeCompletion: (refreshScope: unknown) => Promise<void> | void;
};

export function usePendingArtifactController({
  resolvedApiBase,
  activeProject,
  projects,
  media,
  mediaScope,
  addToast,
  refreshLibrarySnapshot,
  fetchComposeJobJson,
  handleComposeCompletion,
}: UsePendingArtifactControllerArgs) {
  const pendingStatusSnapshotRef = useRef<Map<string, PendingComposeItem['status']>>(new Map());
  const [runtimeRecordingAssets, setRuntimeRecordingAssets] = useState<PendingRecordingAsset[]>([]);
  const runtimeApiRef = useRef(createApiClient(''));

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const assets = await runtimeApiRef.current.listRuntimeAssets().catch(() => []);
      if (!mounted) return;
      const mapped = (assets as RuntimeAssetRecord[])
        .map((asset) => runtimeAssetToPendingRecording(asset))
        .filter((asset): asset is PendingRecordingAsset => !!asset);
      setRuntimeRecordingAssets(mapped);
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 2000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const {
    pendingComposeItems,
    registerAcceptedJob,
    removePendingJob,
  } = usePendingComposeJobs({
    pollIntervalMs: 2000,
    fetchJson: fetchComposeJobJson,
    mediaItems: media,
    onCompletedRefreshScope: handleComposeCompletion,
  });

  const {
    recordings: pendingRecordingAssets,
    startRecording: startLiveRecordingAsset,
    stopRecording: stopLiveRecordingAsset,
    dismissRecording: dismissLiveRecordingAsset,
  } = useRecordingSessions({
    apiBase: resolvedApiBase,
    onSaved: () => {
      addToast('good', 'Recording saved', 'Live recording was saved as a media asset.', 'live-recording-saved');
      void refreshLibrarySnapshot();
    },
    onError: (message) => {
      addToast('bad', 'Recording failed', message, 'live-recording-failed');
    },
  });

  useEffect(() => {
    const previous = pendingStatusSnapshotRef.current;
    const next = new Map<string, PendingComposeItem['status']>();
    pendingComposeItems.forEach((item) => {
      next.set(item.jobId, item.status);
      const previousStatus = previous.get(item.jobId);
      if (item.status === 'finalizing' && previousStatus && previousStatus !== 'finalizing') {
        addToast('good', 'Compose', 'Compose completed');
      }
      if (item.status === 'failed' && previousStatus && previousStatus !== 'failed') {
        addToast('bad', 'Compose', 'Compose failed');
      }
    });
    pendingStatusSnapshotRef.current = next;
  }, [addToast, pendingComposeItems]);

  const visiblePendingComposeItems = useMemo(() => {
    const relevant = pendingComposeItems.filter((item) => {
      if (mediaScope === 'all') return true;
      if (!activeProject) return false;
      return item.project === activeProject.name
        && (item.source || 'primary') === (activeProject.source || 'primary');
    });
    return sortPendingComposeItemsForDisplay(relevant);
  }, [activeProject, mediaScope, pendingComposeItems]);

  const visiblePendingRecordingAssets = useMemo(() => (
    sortPendingRecordingAssetsForDisplay([...pendingRecordingAssets, ...runtimeRecordingAssets])
      .filter((recording) => !media.some((item) => pendingRecordingMatchesMediaItem(recording, item)))
      .filter((recording) => {
        if (activeProject?.name && recording.project !== activeProject.name) return mediaScope === 'all';
        return true;
      })
  ), [activeProject?.name, media, mediaScope, pendingRecordingAssets, runtimeRecordingAssets]);

  const pendingArtifacts = useMemo<PendingArtifact[]>(() => {
    const pendingComposeArtifacts = visiblePendingComposeItems
      .filter((pendingItem) => !media.some((item) => pendingComposeMatchesMediaItem(pendingItem, item)))
      .map((pendingItem) => pendingArtifactFromCompose(pendingItem));
    const pendingRecordingArtifacts = visiblePendingRecordingAssets
      .map((recordingItem) => pendingArtifactFromRecording(recordingItem));
    return sortPendingArtifactsForDisplay([
      ...pendingRecordingArtifacts,
      ...pendingComposeArtifacts,
    ]);
  }, [media, visiblePendingComposeItems, visiblePendingRecordingAssets]);

  const pendingComposeEntries = useMemo(() => (
    pendingArtifacts.filter((item): item is Extract<PendingArtifact, { kind: 'pending-compose' }> => item.kind === 'pending-compose')
      .map((entry) => ({ kind: 'pending-compose' as const, pendingItem: entry.pendingItem }))
  ), [pendingArtifacts]);

  const pendingRecordingEntries = useMemo(() => (
    pendingArtifacts.filter((item): item is Extract<PendingArtifact, { kind: 'pending-recording' }> => item.kind === 'pending-recording')
      .map((entry) => ({ kind: 'pending-recording' as const, recordingItem: entry.recordingItem }))
  ), [pendingArtifacts]);

  useEffect(() => {
    if (!pendingComposeItems.length) return;
    pendingComposeItems.forEach((item) => {
      if (item.status === 'queued' || item.status === 'running' || item.status === 'running_long' || item.status === 'reconnecting') {
        return;
      }
      if (item.status === 'failed') return;
      const found = media.some((m) => pendingComposeMatchesMediaItem(item, m));
      if (found) {
        removePendingJob(item.jobId);
      }
    });
  }, [media, pendingComposeItems, removePendingJob]);

  const recordPeerSession = useCallback(async (session: LiveSession, sessionId: string) => {
    const project = activeProject?.name || projects[0]?.name || 'P3-SHARED-iOS-Exports';
    const source = activeProject?.source || 'primary';

    try {
      await startLiveRecordingAsset({
        sessionId,
        nodeId: session.node_id,
        project,
        source,
        targetDir: 'ingest/live',
      });

      addToast(
        'warn',
        'Recording started',
        `Recording ${session.node_id} into ${project}.`,
        `live-recording-started-${session.session_id}`,
      );
    } catch (error) {
      addToast(
        'bad',
        'Recording could not start',
        error instanceof Error ? error.message : 'Unable to start live recording.',
        `live-recording-start-failed-${session.session_id}`,
      );
    }
  }, [activeProject, addToast, projects, startLiveRecordingAsset]);

  return {
    pendingArtifacts,
    pendingComposeItems,
    pendingRecordingAssets,
    pendingComposeEntries,
    pendingRecordingEntries,
    registerAcceptedJob: ({ envelope }: { envelope: ComposeJobEnvelope }) => registerAcceptedJob({ envelope }),
    removePendingJob,
    stopPendingRecording: stopLiveRecordingAsset,
    dismissPendingRecording: dismissLiveRecordingAsset,
    recordPeerSession,
  };
}
