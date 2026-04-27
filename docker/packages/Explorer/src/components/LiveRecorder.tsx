'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient, type LiveRecordingState, type LiveRecordingUploadResult } from '../api';

type LiveRecorderProps = {
  stream: MediaStream | null;
  sessionId: string;
  nodeId: string;
  apiBase?: string;
  project: string;
  source?: string;
  targetDir?: string;
  onRecordingSaved?: (result: LiveRecordingUploadResult) => void;
};

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Browser-side WebRTC peer stream recorder using MediaRecorder.
 *
 * Example:
 *   <LiveRecorder stream={peerStream} sessionId="sess-123" nodeId="node-a" project="demo" />
 */
export function LiveRecorder({
  stream,
  sessionId,
  nodeId,
  apiBase = '',
  project,
  source = 'primary',
  targetDir = 'ingest/live',
  onRecordingSaved,
}: LiveRecorderProps) {
  const api = useMemo(() => createApiClient(apiBase), [apiBase]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [state, setState] = useState<LiveRecordingState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveRecordingUploadResult | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      chunksRef.current = [];
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = () => {
    if (!stream) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is unavailable in this browser.');
      setState('failed');
      return;
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      recorderRef.current = recorder;
      chunksRef.current = [];
      setResult(null);
      setError(null);
      setElapsedSeconds(0);
      setState('recording');

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError('Recording failed while capturing media stream.');
        setState('failed');
        stopTimer();
      };

      recorder.onstop = () => {
        stopTimer();
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        if (blob.size <= 0) {
          setError('No recording data was captured.');
          setState('failed');
          return;
        }

        const recordingId = `rec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const filename = `${recordingId}.webm`;
        setState('uploading');
        void api.uploadLiveSessionRecording(sessionId, {
          file: blob,
          project,
          source,
          targetDir,
          recordingId,
          filename,
        })
          .then((uploaded) => {
            setResult(uploaded);
            setState('completed');
            setError(null);
            onRecordingSaved?.(uploaded);
          })
          .catch((uploadError) => {
            setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
            setState('failed');
          });
      };

      recorder.start();
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : 'Unable to start recording');
      setState('failed');
      stopTimer();
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  const busy = state === 'recording' || state === 'uploading';
  const openLink = result?.asset_url
    ? (result.asset_url.startsWith('http') ? result.asset_url : `${apiBase}${result.asset_url}`)
    : null;

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <strong style={{ fontSize: 12 }}>Browser recording</strong>
      <div className="small">node: {nodeId}</div>
      <div className="small">session: {sessionId}</div>
      <div className="small">status: {state}{state === 'recording' ? ` · ${formatElapsed(elapsedSeconds)}` : ''}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button className="btn" type="button" disabled={!stream || busy} onClick={startRecording}>
          Record
        </button>
        <button className="btn" type="button" disabled={state !== 'recording'} onClick={stopRecording}>
          Stop
        </button>
      </div>
      {openLink ? (
        <a className="btn" style={{ marginTop: 8, display: 'inline-block' }} href={openLink} target="_blank" rel="noreferrer">
          Open saved asset
        </a>
      ) : null}
      {error ? <div className="small" style={{ marginTop: 8, color: '#ff9a90' }}>{error}</div> : null}
    </div>
  );
}
