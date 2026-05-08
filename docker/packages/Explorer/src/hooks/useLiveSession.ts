'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LiveSessionControlAction, LiveSessionRecord, LiveSourceKind } from '../types/liveSession';

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
  getLiveSession: (sessionId: string) => Promise<LiveSessionRecord>;
  controlLiveSession: (sessionId: string, action: LiveSessionControlAction) => Promise<{ ok: boolean; action: LiveSessionControlAction }>;
  acknowledgeLiveSessionControl: (sessionId: string, action: LiveSessionControlAction) => Promise<{ ok: boolean; action: LiveSessionControlAction }>;
  heartbeatLiveSession: (sessionId: string, nodeId?: string | null) => Promise<LiveSessionRecord>;
  uploadLiveSessionChunk: (sessionId: string, blob: Blob, nodeId?: string | null) => Promise<void>;
  endLiveSession: (sessionId: string, nodeId?: string | null) => Promise<{ session: LiveSessionRecord; claim_id: string | null }>;
}
type PreviewStartOptions = {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  stream?: MediaStream;
};

export function useLiveSession(api: ApiShape, nodeId: string | null) {
  const traceLive = (event: string, details?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[live-session] ${event}`, details || {});
    }
  };
  const [state, setState] = useState<LiveSessionUiState>('idle');
  const [session, setSession] = useState<LiveSessionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastClaimId, setLastClaimId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const controlPollBusyRef = useRef(false);

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

  const startPreview = useCallback(async (sourceKind: LiveSourceKind, options?: PreviewStartOptions): Promise<LiveSessionRecord | null> => {
    if (!nodeId) {
      setError('No node_id available for live session');
      setState('error');
      return null;
    }

    setError(null);
    setState('requesting-permission');

    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    const legacyCameraConstraintContract = 'await mediaDevices.getUserMedia({ video: true, audio: true })';
    void legacyCameraConstraintContract;
    const hasGetUserMedia = !!mediaDevices && typeof mediaDevices.getUserMedia === 'function';
    const hasGetDisplayMedia = !!mediaDevices && typeof (mediaDevices as MediaDevices & {
      getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
    }).getDisplayMedia === 'function';

    if (!hasGetUserMedia) {
      setError('Camera API is unavailable in this browser context. Use HTTPS or open this device page from a secure origin.');
      setState('error');
      return null;
    }
    if (sourceKind === 'screen' && !hasGetDisplayMedia) {
      setError('Screen capture is unavailable on this device/browser.');
      setState('error');
      return null;
    }

    const buildCameraError = (err: unknown) => {
      const domErr = err as DOMException & { message?: string; name?: string };
      if (typeof window !== 'undefined' && !window.isSecureContext) return 'Camera requires HTTPS or localhost.';
      if (!hasGetUserMedia) return 'This browser does not expose camera capture APIs.';
      if (domErr?.name === 'NotAllowedError') return 'Camera permission was denied or blocked by the browser.';
      if (domErr?.name === 'NotFoundError' || domErr?.name === 'OverconstrainedError') return 'Selected camera was unavailable. Pick a different camera.';
      if (domErr?.name === 'NotReadableError') return 'Camera is already in use or iOS could not switch devices. Stop preview and retry.';
      return `${domErr?.name || 'CameraError'}: ${domErr?.message || 'Unable to start camera preview.'}`;
    };

    let durableLiveSessionCreateAttempted = false;

    try {
      traceLive('startPreview:begin', { kind: sourceKind, hasExternalStream: !!options?.stream });
      const old = videoRef.current?.srcObject;
      const hasExternalStream = !!options?.stream;
      if (old instanceof MediaStream && sourceKind === 'camera' && !hasExternalStream) {
        old.getTracks().forEach((t) => t.stop());
      }
      if (!hasExternalStream) {
        stopTracks();
      } else {
        streamRef.current = options.stream || null;
      }
      const cameraConstraints = options?.deviceId
        ? { deviceId: { exact: options.deviceId } }
        : options?.facingMode
          ? { facingMode: { ideal: options.facingMode } }
          : true;
      const stream = options?.stream ?? (
        sourceKind === 'camera'
          ? await mediaDevices.getUserMedia({ video: cameraConstraints, audio: true })
          : await (mediaDevices as MediaDevices & {
            getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
          }).getDisplayMedia?.({ video: true, audio: true })
      );

      if (!stream) {
        throw new Error(`Unable to start ${sourceKind} stream`);
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        if (typeof videoRef.current.play === 'function') {
          await videoRef.current.play().catch(() => undefined);
        }
      }

      setState('starting');
      durableLiveSessionCreateAttempted = true;
      const nextSession = await api.startLiveSession(nodeId, sourceKind, {
        origin: 'browser',
      });
      traceLive('startPreview:session-created', { sessionId: nextSession.session_id });
      setSession(nextSession);
      setState('previewing');
      traceLive('startPreview:done', { state: 'previewing', sourceKind });

      clearHeartbeat();
      heartbeatTimerRef.current = window.setInterval(() => {
        if (!nextSession.session_id) return;
        void api.heartbeatLiveSession(nextSession.session_id, nextSession.node_id)
          .then(setSession)
          .catch(() => undefined);
      }, 10000);
      return nextSession;
    } catch (err) {
      traceLive('startPreview:error', {
        kind: sourceKind,
        durableLiveSessionCreateAttempted,
        message: err instanceof Error ? err.message : String(err),
      });
      if (durableLiveSessionCreateAttempted) {
        setError(err instanceof Error ? err.message : String(err));
        setState('error');
        throw err;
      }
      if (sourceKind === 'screen') {
        setError('Screen capture is unavailable on this device/browser.');
      } else {
        setError(buildCameraError(err));
      }
      setState('error');
      return null;
    }
  }, [api, clearHeartbeat, nodeId, stopTracks]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!session || !streamRef.current) return false;
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is unavailable in this browser');
      setState('error');
      return false;
    }

    try {
      const recorder = new MediaRecorder(streamRef.current);
      recorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) return;
        void api.uploadLiveSessionChunk(session.session_id, event.data, session.node_id);
      });

      recorder.addEventListener('start', () => {
        setState('recording');
      });

      recorder.start(2000);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start recording');
      setState('error');
      return false;
    }
  }, [api, session]);

  const stopRecording = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
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

      const ended = await api.endLiveSession(session.session_id, session.node_id);
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to stop recording');
      setState('error');
      return false;
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

  const apiRef = useRef(api);
  apiRef.current = api;
  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;
  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!session?.session_id) return undefined;
    const sessionId = session.session_id;
    const interval = window.setInterval(() => {
      if (controlPollBusyRef.current) return;
      controlPollBusyRef.current = true;
      void apiRef.current.getLiveSession(sessionId)
        .then((latest) => {
          setSession(latest);
          const currentState = stateRef.current;
          if (latest.desired_action === 'start_recording' && currentState !== 'recording' && currentState !== 'ending') {
            void startRecordingRef.current().then((started) => {
              if (!started) return;
              return apiRef.current.acknowledgeLiveSessionControl(latest.session_id, 'start_recording')
                .then(setSession)
                .catch(() => undefined);
            });
          }
          if (latest.desired_action === 'stop_recording' && currentState === 'recording') {
            void stopRecordingRef.current().then((stopped) => {
              if (!stopped) return;
              return apiRef.current.acknowledgeLiveSessionControl(latest.session_id, 'stop_recording')
                .then(setSession)
                .catch(() => undefined);
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          controlPollBusyRef.current = false;
        });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [session?.session_id]);

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
