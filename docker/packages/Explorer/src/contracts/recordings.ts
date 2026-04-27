export type RecordingSessionState =
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'completed'
  | 'failed'
  | string;

export type RecordingSession = {
  recording_id: string;
  session_id: string;
  node_id: string;
  state: RecordingSessionState;
  created_at?: string;
  updated_at?: string;
  project: string;
  source?: string;
  target_dir?: string;
  filename?: string | null;
  asset_url?: string | null;
  error?: string | null;
};

export type RecordingSessionListResponse = {
  recordings?: RecordingSession[];
};

export function normalizeRecordingSessions(payload: unknown): RecordingSession[] {
  if (Array.isArray(payload)) return payload.filter(Boolean) as RecordingSession[];

  if (payload && typeof payload === 'object') {
    const obj = payload as RecordingSessionListResponse;
    if (Array.isArray(obj.recordings)) return obj.recordings.filter(Boolean);
  }

  return [];
}

export function normalizeRecordingSession(payload: unknown): RecordingSession | null {
  if (!payload || typeof payload !== 'object') return null;

  const obj = payload as { recording?: RecordingSession };
  if (obj.recording) return obj.recording;

  if ('recording_id' in (payload as Record<string, unknown>)) {
    return payload as RecordingSession;
  }

  return null;
}
