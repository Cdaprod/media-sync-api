'use client';

import { useCallback, useRef, useState } from 'react';

import { createApiClient, type LiveRecordingUploadResult } from '../api';
import {
  buildPendingRecordingId,
  buildPendingRecordingOutputName,
  type PendingRecordingAsset,
} from '../liveRecordings';

type RecorderRuntime = {
  mediaRecorder: MediaRecorder;
  chunks: BlobPart[];
};

export interface StartLiveRecordingInput {
  apiBase?: string;
  sessionId: string;
  nodeId: string;
  stream: MediaStream;
  project: string;
  source?: string;
  targetDir?: string;
}

export interface UseLiveRecordingAssetsOptions {
  onSaved?: (result: LiveRecordingUploadResult) => void;
  onError?: (message: string) => void;
}

function chooseMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  if (typeof MediaRecorder === 'undefined') return '';

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }

  return '';
}

export function useLiveRecordingAssets({
  onSaved,
  onError,
}: UseLiveRecordingAssetsOptions = {}) {
  const [recordings, setRecordings] = useState<PendingRecordingAsset[]>([]);
  const runtimesRef = useRef<Map<string, RecorderRuntime>>(new Map());

  const patchRecording = useCallback((
    recordingId: string,
    patch: Partial<PendingRecordingAsset>,
  ) => {
    setRecordings((prev) => prev.map((item) => (
      item.recordingId === recordingId ? { ...item, ...patch } : item
    )));
  }, []);

  const startRecording = useCallback(async (input: StartLiveRecordingInput) => {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is unavailable in this browser.');
    }

    const liveTracks = input.stream.getTracks().filter((track) => track.readyState === 'live');
    if (!liveTracks.length) {
      throw new Error('No live tracks are available to record.');
    }

    const recordingId = buildPendingRecordingId(input.sessionId);
    const outputName = buildPendingRecordingOutputName(input.nodeId, input.sessionId);
    const now = new Date().toISOString();
    const source = input.source || 'primary';
    const targetDir = input.targetDir || 'ingest/live';
    const apiBase = input.apiBase || '';
    const api = createApiClient(apiBase);

    const pending: PendingRecordingAsset = {
      recordingId,
      sessionId: input.sessionId,
      nodeId: input.nodeId,
      project: input.project,
      source,
      targetDir,
      outputName,
      createdAt: now,
      startedAt: now,
      status: 'recording',
      elapsedMs: 0,
      stream: input.stream,
      previewObjectUrl: null,
      assetUrl: null,
      completedPath: null,
    };

    setRecordings((prev) => [pending, ...prev]);

    await api.sendLiveSessionControl(input.sessionId, 'start_recording').catch(() => undefined);

    const chunks: BlobPart[] = [];
    const mimeType = chooseMimeType();
    const mediaRecorder = new MediaRecorder(input.stream, mimeType ? { mimeType } : undefined);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onerror = () => {
      patchRecording(recordingId, {
        status: 'failed',
        error: 'MediaRecorder failed while recording the live stream.',
      });
      onError?.('MediaRecorder failed while recording the live stream.');
    };

    mediaRecorder.onstop = async () => {
      patchRecording(recordingId, { status: 'uploading', stream: input.stream });

      try {
        await api.sendLiveSessionControl(input.sessionId, 'stop_recording').catch(() => undefined);

        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });

        if (!blob.size) {
          throw new Error('No recording data was captured.');
        }

        const previewObjectUrl = URL.createObjectURL(blob);

        patchRecording(recordingId, {
          status: 'uploading',
          previewObjectUrl,
          stream: null,
        });

        const result = await api.uploadLiveSessionRecording(input.sessionId, {
          file: blob,
          project: input.project,
          source,
          targetDir,
          recordingId,
          filename: outputName,
        });

        patchRecording(recordingId, {
          status: 'finalizing',
          assetUrl: result.asset_url || null,
          completedPath: result.target_dir && result.filename
            ? `${result.target_dir}/${result.filename}`
            : null,
        });

        onSaved?.(result);

        window.setTimeout(() => {
          patchRecording(recordingId, { status: 'saved' });
        }, 500);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recording upload failed.';
        patchRecording(recordingId, {
          status: 'failed',
          error: message,
        });
        onError?.(message);
      } finally {
        runtimesRef.current.delete(recordingId);
      }
    };

    runtimesRef.current.set(recordingId, { mediaRecorder, chunks });
    mediaRecorder.start(1000);

    return recordingId;
  }, [onError, onSaved, patchRecording]);

  const stopRecording = useCallback((recordingId: string) => {
    const runtime = runtimesRef.current.get(recordingId);
    if (!runtime) return;

    patchRecording(recordingId, { status: 'stopping' });

    if (runtime.mediaRecorder.state !== 'inactive') {
      runtime.mediaRecorder.stop();
    }
  }, [patchRecording]);

  const dismissRecording = useCallback((recordingId: string) => {
    setRecordings((prev) => {
      const target = prev.find((item) => item.recordingId === recordingId);
      if (target?.previewObjectUrl) {
        URL.revokeObjectURL(target.previewObjectUrl);
      }
      return prev.filter((item) => item.recordingId !== recordingId);
    });
  }, []);

  return {
    recordings,
    startRecording,
    stopRecording,
    dismissRecording,
  };
}
