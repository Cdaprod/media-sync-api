'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LiveSessionRecord, LiveSourceKind } from '../types/liveSession';

type LiveSessionUiState =
  | 'idle'
  | 'requesting-permission'
  | 'starting'
  | 'previewing'
  | 'recording'
  | 'ending'
  | 'ended'
  | 'error';

interface ApiShape {
  startLiveSession: (nodeId: string, sourceKind: LiveSourceKind, metadata?: Record<string, unknown>) => Promise<LiveSessionRecord>;
  heartbeatLiveSession: (sessionId: string) => Promise<LiveSessionRecord>;
  uploadLiveSessionChunk: (sessionId: string, blob: Blob) => Promise<void>;
  endLiveSession: (sessionId: string) => Promise<{ session: LiveSessionRecord; claim_id: string | null }>;
}

export function useLiveSession(api: ApiShape, nodeId: string | null) {
  const [state, setState] = useState<LiveSessionUiState>('idle');
  const [session, setSession] = useState<LiveSessionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastClaimId, setLastClaimId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current != null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearHeartbeat();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    stopTracks();
  }, [clearHeartbeat, stopTracks]);

  const startPreview = useCallback(async (sourceKind: LiveSourceKind) => {
    if (!nodeId) {
      setError('No node_id available for live session');
      setState('error');
      return;
    }

    setError(null);
    setState('requesting-permission');

    try {
      const stream =
        sourceKind === 'camera'
          ? await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          : await (navigator.mediaDevices as MediaDevices & {
            getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
          }).getDisplayMedia?.({ video: true, audio: true });

      if (!stream) {
        throw new Error(`Unable to start ${sourceKind} stream`);
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setState('starting');
      const nextSession = await api.startLiveSession(nodeId, sourceKind, {
        origin: 'browser',
      });
      setSession(nextSession);
      setState('previewing');

      clearHeartbeat();
      heartbeatTimerRef.current = window.setInterval(() => {
        if (!nextSession.session_id) return;
        void api.heartbeatLiveSession(nextSession.session_id)
          .then(setSession)
          .catch(() => undefined);
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to start ${sourceKind}`);
      setState('error');
    }
  }, [api, clearHeartbeat, nodeId]);

  const startRecording = useCallback(async () => {
    if (!session || !streamRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is unavailable in this browser');
      setState('error');
      return;
    }

    try {
      const recorder = new MediaRecorder(streamRef.current);
      recorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) return;
        void api.uploadLiveSessionChunk(session.session_id, event.data);
      });

      recorder.addEventListener('start', () => {
        setState('recording');
      });

      recorder.start(2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start recording');
      setState('error');
    }
  }, [api, session]);

  const stopRecording = useCallback(async () => {
    if (!session) return;
    setState('ending');

    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          const recorder = recorderRef.current as MediaRecorder;
          const done = async () => {
            recorder.removeEventListener('stop', done);
            resolve();
          };
          recorder.addEventListener('stop', done);
          recorder.stop();
        });
      }

      const ended = await api.endLiveSession(session.session_id);
      setSession(ended.session);
      setLastClaimId(ended.claim_id);
      if (ended.claim_id) {
        window.localStorage.setItem(
          'explorer_live_claim_event',
          JSON.stringify({
            claim_id: ended.claim_id,
            at: Date.now(),
          }),
        );
      }
      setState('ended');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to stop recording');
      setState('error');
    } finally {
      recorderRef.current = null;
      clearHeartbeat();
      stopTracks();
    }
  }, [api, clearHeartbeat, session, stopTracks]);

  const stopPreview = useCallback(async () => {
    cleanup();
    setSession(null);
    setState('idle');
  }, [cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    state,
    session,
    videoRef,
    startPreview,
    startRecording,
    stopRecording,
    stopPreview,
    cleanup,
    error,
    lastClaimId,
  };
}
