'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient, type LiveRecordingUploadResult, type RecordingSessionRecord } from '../api';
import type { PendingRecordingAsset } from '../liveRecordings';
import { StreamHub } from '../runtime/StreamHub';

type RecorderRuntime = {
  mediaRecorder: MediaRecorder;
  chunks: BlobPart[];
  startedAtMs: number;
};

export interface UseRecordingSessionsOptions {
  apiBase?: string;
  onSaved?: (result: LiveRecordingUploadResult) => void;
  onError?: (message: string) => void;
}

type StartRecordingInput = {
  sessionId: string;
  nodeId: string;
  project: string;
  source?: string;
  targetDir?: string;
};

export function useRecordingSessions({
  apiBase = '',
  onSaved,
  onError,
}: UseRecordingSessionsOptions = {}) {
  const api = useMemo(() => createApiClient(apiBase), [apiBase]);
  const [sessions, setSessions] = useState<RecordingSessionRecord[]>([]);
  const [elapsedByRecordingId, setElapsedByRecordingId] = useState<Record<string, number>>({});
  const [previewUrlByRecordingId, setPreviewUrlByRecordingId] = useState<Record<string, string>>({});
  const runtimesRef = useRef<Map<string, RecorderRuntime>>(new Map());

  const refresh = useCallback(async () => {
    const next = await api.listRecordingSessions();
    setSessions(next);
    return next;
  }, [api]);

  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;
    const run = async () => {
      try {
        const next = await api.listRecordingSessions();
        if (mounted) setSessions(next);
      } catch (error) {
        if (mounted) onError?.(error instanceof Error ? error.message : 'Unable to load recording sessions.');
      } finally {
        if (!mounted) return;
        timer = window.setTimeout(run, 2000);
      }
    };
    void run();
    return () => {
      mounted = false;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [api, onError]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now();
      const next: Record<string, number> = {};
      runtimesRef.current.forEach((runtime, recordingId) => {
        next[recordingId] = Math.max(0, now - runtime.startedAtMs);
      });
      setElapsedByRecordingId((prev) => (Object.keys(next).length ? { ...prev, ...next } : prev));
    }, 500);
    return () => window.clearInterval(tick);
  }, []);

  const startRecording = useCallback(async ({
    sessionId,
    nodeId,
    project,
    source = 'primary',
    targetDir = 'ingest/live',
  }: StartRecordingInput) => {
    if (typeof MediaRecorder === 'undefined') {
      onError?.('Recording is not supported on this device/browser.');
      return null;
    }

    const created = await api.startRecordingSession({
      session_id: sessionId,
      node_id: nodeId,
      project,
      source,
      target_dir: targetDir,
    });
    setSessions((prev) => [created, ...prev.filter((item) => item.recording_id !== created.recording_id)]);

    const stream = StreamHub.get(sessionId);
    if (!stream) {
      const failed = await api.failRecordingSession(created.recording_id, {
        error: 'Peer stream is unavailable. Reopen peer view and try again.',
      });
      setSessions((prev) => prev.map((item) => (item.recording_id === failed.recording_id ? failed : item)));
      onError?.('Peer stream is unavailable. Reopen peer view and try again.');
      return failed.recording_id;
    }

    const liveTracks = stream.getTracks().filter((track) => track.readyState === 'live');
    if (!liveTracks.length) {
      const failed = await api.failRecordingSession(created.recording_id, {
        error: 'No live tracks are available to record.',
      });
      setSessions((prev) => prev.map((item) => (item.recording_id === failed.recording_id ? failed : item)));
      onError?.('No live tracks are available to record.');
      return failed.recording_id;
    }

    const chunks: BlobPart[] = [];
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MediaRecorder is not supported for this stream.';
      const failed = await api.failRecordingSession(created.recording_id, { error: message });
      setSessions((prev) => prev.map((item) => (item.recording_id === failed.recording_id ? failed : item)));
      onError?.(message);
      return created.recording_id;
    }
    const runtime: RecorderRuntime = {
      mediaRecorder,
      chunks,
      startedAtMs: Date.now(),
    };
    runtimesRef.current.set(created.recording_id, runtime);
    setElapsedByRecordingId((prev) => ({ ...prev, [created.recording_id]: 0 }));

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onerror = async () => {
      const failed = await api.failRecordingSession(created.recording_id, {
        error: 'MediaRecorder failed while recording the live stream.',
      });
      setSessions((prev) => prev.map((item) => (item.recording_id === failed.recording_id ? failed : item)));
      onError?.('MediaRecorder failed while recording the live stream.');
    };

    mediaRecorder.onstop = async () => {
      try {
        const stopping = await api.listRecordingSessions().then((records) => (
          records.find((entry) => entry.recording_id === created.recording_id) || created
        ));
        setSessions((prev) => prev.map((item) => (item.recording_id === stopping.recording_id
          ? { ...item, state: 'uploading' }
          : item)));

        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });
        if (!blob.size) {
          throw new Error('No recording data was captured.');
        }

        const previewObjectUrl = URL.createObjectURL(blob);
        setPreviewUrlByRecordingId((prev) => ({ ...prev, [created.recording_id]: previewObjectUrl }));

        const upload = await api.uploadLiveSessionRecording(sessionId, {
          file: blob,
          project,
          source,
          targetDir,
          recordingId: created.recording_id,
        });

        const completed = await api.completeRecordingSession(created.recording_id, {
          asset_url: upload.asset_url,
          filename: upload.filename,
        });
        setSessions((prev) => prev.map((item) => (item.recording_id === completed.recording_id ? completed : item)));
        onSaved?.(upload);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recording upload failed.';
        const failed = await api.failRecordingSession(created.recording_id, { error: message });
        setSessions((prev) => prev.map((item) => (item.recording_id === failed.recording_id ? failed : item)));
        onError?.(message);
      } finally {
        runtimesRef.current.delete(created.recording_id);
      }
    };

    mediaRecorder.start(1000);
    return created.recording_id;
  }, [api, onError, onSaved]);

  const stopRecording = useCallback(async (recordingId: string) => {
    setSessions((prev) => prev.map((item) => (item.recording_id === recordingId ? { ...item, state: 'stopping' } : item)));
    const runtime = runtimesRef.current.get(recordingId);
    if (runtime && runtime.mediaRecorder.state !== 'inactive') {
      runtime.mediaRecorder.stop();
    }
  }, []);

  const dismissRecording = useCallback(async (recordingId: string) => {
    const previewUrl = previewUrlByRecordingId[recordingId];
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrlByRecordingId((prev) => {
        const next = { ...prev };
        delete next[recordingId];
        return next;
      });
    }
    setElapsedByRecordingId((prev) => {
      const next = { ...prev };
      delete next[recordingId];
      return next;
    });
    await api.deleteRecordingSession(recordingId);
    setSessions((prev) => prev.filter((item) => item.recording_id !== recordingId));
  }, [api, previewUrlByRecordingId]);

  const recordings = useMemo<PendingRecordingAsset[]>(() => sessions.map((session) => ({
    recordingId: session.recording_id,
    sessionId: session.session_id,
    nodeId: session.node_id,
    project: session.project,
    source: session.source || 'primary',
    targetDir: session.target_dir || 'ingest/live',
    outputName: session.filename || null,
    createdAt: session.created_at,
    startedAt: session.created_at,
    status: session.state,
    elapsedMs: elapsedByRecordingId[session.recording_id] || 0,
    stream: null,
    previewObjectUrl: previewUrlByRecordingId[session.recording_id] || null,
    assetUrl: session.asset_url || null,
    completedPath: session.filename && session.target_dir ? `${session.target_dir}/${session.filename}` : null,
    error: session.error || undefined,
  })), [elapsedByRecordingId, previewUrlByRecordingId, sessions]);

  return {
    recordings,
    startRecording,
    stopRecording,
    dismissRecording,
    refreshRecordingSessions: refresh,
  };
}
