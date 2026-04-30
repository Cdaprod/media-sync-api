import type { LibrarySnapshot, MediaResponse, Project, ResolveOpenResponse } from './types';
import type { ComposeJobEnvelope } from './composeJobs';
import type { NodeControlRecord, SourceControlRecord } from './types/sourceControl';
import type { RegisterNodeRequest, RegisterNodeResponse } from './types/registration';
import type { IngestClaimRecord } from './types/ingestClaim';
import {
  normalizeWebRtcLiveSessions,
  type WebRtcLiveSession,
} from './contracts/live';
import { normalizeLiveSessionList } from './contracts/liveSessions';
import {
  normalizeRecordingSession,
  normalizeRecordingSessions,
  type RecordingSession,
  type RecordingSessionState,
} from './contracts/recordings';
import type {
  LiveSessionControlAction,
  LiveSessionRecord,
  LiveSignalDescription,
  LiveSignalIceCandidate,
  LiveSignalRole,
  LiveSignalState,
  LiveSourceKind,
} from './types/liveSession';

export interface ResolveRequest {
  project: string;
  new_project_name?: string | null;
  media_rel_paths: string[];
  mode: string;
}
export type {
  WebRtcLiveSession,
  RecordingSession,
  RecordingSessionState,
};

export interface AssetRef {
  relative_path: string;
  project: string;
  source?: string | null;
}

export type LiveRecordingState = 'idle' | 'recording' | 'uploading' | 'completed' | 'failed';

export type LiveRecordingUploadResult = {
  recording_id: string;
  session_id: string;
  state: 'completed' | string;
  project: string;
  source: string;
  target_dir: string;
  filename: string;
  output_path: string;
  asset_url: string;
  size_bytes: number;
  content_type: string;
};
export type RecordingSessionRecord = RecordingSession;

export interface ApiClient {
  listSources: () => Promise<SourceControlRecord[]>;
  listNodes: () => Promise<NodeControlRecord[]>;
  heartbeatNode: (node: string | { nodeId: string; token?: string | null }) => Promise<NodeControlRecord>;
  deleteNode: (nodeId: string) => Promise<{ ok: boolean; deleted: boolean; node_id: string }>;
  registerNode: (payload: RegisterNodeRequest) => Promise<RegisterNodeResponse>;
  listIngestClaims: () => Promise<IngestClaimRecord[]>;
  getIngestClaim: (claimId: string) => Promise<IngestClaimRecord>;
  deleteIngestClaim: (claimId: string) => Promise<{ ok: boolean; deleted: boolean; claim_id: string }>;
  startLiveSession: (nodeId: string, sourceKind: LiveSourceKind, metadata?: Record<string, unknown>) => Promise<LiveSessionRecord>;
  getLiveSession: (sessionId: string) => Promise<LiveSessionRecord>;
  controlLiveSession: (sessionId: string, action: LiveSessionControlAction) => Promise<{ ok: boolean; action: LiveSessionControlAction }>;
  acknowledgeLiveSessionControl: (sessionId: string, action: LiveSessionControlAction) => Promise<{ ok: boolean; action: LiveSessionControlAction }>;
  getLiveSignalState: (sessionId: string, viewerId?: string | null) => Promise<LiveSignalState>;
  publishLiveSignalOffer: (sessionId: string, offer: LiveSignalDescription) => Promise<LiveSignalState>;
  publishLiveSignalAnswer: (sessionId: string, viewerId: string, answer: LiveSignalDescription) => Promise<LiveSignalState>;
  publishLiveSignalIce: (sessionId: string, role: LiveSignalRole, viewerId: string, candidate: LiveSignalIceCandidate) => Promise<LiveSignalState>;
  sendLiveSessionControl: (sessionId: string, action: LiveSessionControlAction) => Promise<{ ok: boolean; action: LiveSessionControlAction; session_id: string }>;
  uploadLiveSessionRecording: (sessionId: string, payload: {
    file: Blob;
    project: string;
    source?: string;
    targetDir?: string;
    recordingId?: string;
    filename?: string;
  }) => Promise<LiveRecordingUploadResult>;
  listRecordingSessions: () => Promise<RecordingSessionRecord[]>;
  startRecordingSession: (payload: {
    session_id: string;
    node_id: string;
    project: string;
    source?: string;
    target_dir?: string;
    recording_id?: string;
  }) => Promise<RecordingSessionRecord>;
  completeRecordingSession: (recordingId: string, payload: { asset_url?: string | null; filename?: string | null }) => Promise<RecordingSessionRecord>;
  failRecordingSession: (recordingId: string, payload: { error: string }) => Promise<RecordingSessionRecord>;
  deleteRecordingSession: (recordingId: string) => Promise<{ ok: boolean; recording_id: string; deleted: boolean }>;
  heartbeatLiveSession: (sessionId: string) => Promise<LiveSessionRecord>;
  uploadLiveSessionChunk: (sessionId: string, blob: Blob) => Promise<void>;
  endLiveSession: (sessionId: string) => Promise<{ session: LiveSessionRecord; claim_id: string | null }>;
  listLiveSessions: () => Promise<LiveSessionRecord[]>;
  listWebRtcLiveSessions: () => Promise<WebRtcLiveSession[]>;
  postLiveViewerAnswer: (sessionId: string, viewerId: string, answer: RTCSessionDescriptionInit) => Promise<{ ok: boolean; session_id: string; viewer_id: string }>;
  postLiveViewerIce: (sessionId: string, viewerId: string, candidate: RTCIceCandidateInit) => Promise<{ ok: boolean; session_id: string; viewer_id: string }>;
  listLiveDeviceIce: (sessionId: string) => Promise<RTCIceCandidateInit[]>;
  postLiveViewerState: (sessionId: string, viewerId: string, state: string) => Promise<{ ok: boolean; session_id: string; viewer_id: string }>;
  listRuntimeAssets: () => Promise<Array<Record<string, unknown>>>;
  listProjects: () => Promise<Project[]>;
  listMedia: (project: string, source?: string) => Promise<MediaResponse>;
  listLibrarySnapshot: (params?: { source?: string; scope?: 'all' | 'project'; project?: string }) => Promise<LibrarySnapshot>;
  uploadMedia: (url: string, file: File) => Promise<Record<string, unknown>>;
  sendResolve: (payload: ResolveRequest, source?: string) => Promise<ResolveOpenResponse>;
  deleteMedia: (project: string, relativePaths: string[], source?: string) => Promise<Record<string, unknown>>;
  moveMedia: (
    project: string,
    relativePaths: string[],
    targetProject: string,
    source?: string,
    targetSource?: string,
  ) => Promise<Record<string, unknown>>;
  bulkDeleteMedia: (assets: AssetRef[]) => Promise<Record<string, unknown>>;
  bulkMoveMedia: (assets: AssetRef[], targetProject: string, targetSource?: string | null) => Promise<Record<string, unknown>>;
  bulkTagMedia: (assets: AssetRef[], addTags: string[], removeTags: string[]) => Promise<Record<string, unknown>>;
  bulkComposeMedia: (payload: {
    assets: AssetRef[];
    output_project: string;
    output_name: string;
    output_source?: string | null;
    target_dir?: string;
    mode?: 'auto' | 'copy' | 'encode';
    allow_overwrite?: boolean;
  }) => Promise<ComposeJobEnvelope>;
  buildUrl: (path: string) => string;
}

function buildUrlFactory(baseUrl: string): (path: string) => string {
  if (!baseUrl) {
    return (path: string) => path;
  }
  return (path: string) => new URL(path, baseUrl).toString();
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export function createApiClient(baseUrl = ''): ApiClient {
  const buildUrl = buildUrlFactory(baseUrl);
  const readNodeBearerToken = (nodeId?: string | null): string | null => {
    if (typeof window === 'undefined') return null;
    const keys = [
      nodeId ? `explorer_capture_node_token:${nodeId}` : null,
      'explorer_capture_node_token',
      'explorer_node_token',
    ].filter(Boolean) as string[];
    for (const key of keys) {
      const value = window.localStorage.getItem(key);
      if (value) return value;
    }
    return null;
  };
  const buildNodeAuthHeaders = (nodeId?: string | null): Record<string, string> => {
    const resolvedNodeId = (nodeId || '').trim();
    const token = readNodeBearerToken(resolvedNodeId || null);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (resolvedNodeId) headers['X-Media-Sync-Node-Id'] = resolvedNodeId;
    return headers;
  };

  return {
    buildUrl,
    async getJson(url: string): Promise<Record<string, unknown>> {
      const response = await fetch(buildUrl(url), { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || payload?.message || `Failed to load JSON: ${response.status}`));
      }
      return payload;
    },
    async listSources(): Promise<SourceControlRecord[]> {
      const response = await fetch(buildUrl('/api/sources'), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to load sources: ${response.status}`);
      }
      return response.json();
    },
    async listNodes(): Promise<NodeControlRecord[]> {
      const response = await fetch(buildUrl('/api/nodes'), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to load nodes: ${response.status}`);
      }
      return response.json();
    },
    async heartbeatNode(node: string | { nodeId: string; token?: string | null }): Promise<NodeControlRecord> {
      const nodeId = typeof node === 'string' ? node : node.nodeId;
      const token = typeof node === 'string' ? null : (node.token ?? null);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers['X-Media-Sync-Node-Id'] = nodeId;
      }
      const response = await fetch(buildUrl(`/api/nodes/${encodeURIComponent(nodeId)}/heartbeat`), {
        method: 'POST',
        headers,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to heartbeat node ${nodeId}: ${response.status}`);
      }

      return response.json();
    },
    async deleteNode(nodeId: string): Promise<{ ok: boolean; deleted: boolean; node_id: string }> {
      const response = await fetch(buildUrl(`/api/nodes/${encodeURIComponent(nodeId)}`), {
        method: 'DELETE',
      });
      const payload = await parseJson<{ ok: boolean; deleted: boolean; node_id: string; detail?: string }>(response);
      if (!response.ok) throw new Error(String(payload?.detail || 'Delete node failed'));
      return payload;
    },
    async listIngestClaims(): Promise<IngestClaimRecord[]> {
      const response = await fetch(buildUrl('/api/ingest/claims'), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to load ingest claims: ${response.status}`);
      }

      return response.json();
    },
    async getIngestClaim(claimId: string): Promise<IngestClaimRecord> {
      const response = await fetch(buildUrl(`/api/ingest/claims/${encodeURIComponent(claimId)}`), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to load ingest claim ${claimId}: ${response.status}`);
      }

      return response.json();
    },
    async deleteIngestClaim(claimId: string): Promise<{ ok: boolean; deleted: boolean; claim_id: string }> {
      const response = await fetch(buildUrl(`/api/ingest/claims/${encodeURIComponent(claimId)}`), {
        method: 'DELETE',
      });
      const payload = await parseJson<{ ok: boolean; deleted: boolean; claim_id: string; detail?: string }>(response);
      if (!response.ok) throw new Error(String(payload?.detail || 'Delete ingest claim failed'));
      return payload;
    },
    async registerNode(payload: RegisterNodeRequest): Promise<RegisterNodeResponse> {
      const response = await fetch(buildUrl('/connect/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Registration failed (${response.status})${detail ? `: ${detail}` : ''}`);
      }

      return response.json();
    },
    async startLiveSession(nodeId: string, sourceKind: LiveSourceKind, metadata: Record<string, unknown> = {}): Promise<LiveSessionRecord> {
      const authHeaders = buildNodeAuthHeaders(nodeId);
      const response = await fetch(buildUrl('/api/live_sessions/start'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...authHeaders,
        },
        cache: 'no-store',
        body: JSON.stringify({ node_id: nodeId, source_kind: sourceKind, metadata }),
      });
      if (!response.ok) {
        throw new Error(`Failed to start live session: ${response.status}`);
      }
      return response.json();
    },
    async getLiveSession(sessionId: string): Promise<LiveSessionRecord> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}`), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to get live session: ${response.status}`);
      }
      return response.json();
    },
    async controlLiveSession(sessionId: string, action: LiveSessionControlAction): Promise<{ ok: boolean; action: LiveSessionControlAction }> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/control`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw new Error(`Failed to control live session: ${response.status}`);
      }
      return response.json();
    },
    async sendLiveSessionControl(sessionId: string, action: LiveSessionControlAction): Promise<{ ok: boolean; action: LiveSessionControlAction; session_id: string }> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/control`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ action }),
      });
      const payload = await parseJson<{ ok: boolean; action: LiveSessionControlAction; session_id: string; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || `Failed to send live session control: ${response.status}`));
      }
      return payload;
    },
    async uploadLiveSessionRecording(sessionId: string, payload: {
      file: Blob;
      project: string;
      source?: string;
      targetDir?: string;
      recordingId?: string;
      filename?: string;
    }): Promise<LiveRecordingUploadResult> {
      const form = new FormData();
      form.append('file', payload.file, payload.filename || 'live-recording.webm');
      form.append('project', payload.project);
      form.append('source', payload.source || 'primary');
      form.append('target_dir', payload.targetDir || 'ingest/live');
      if (payload.recordingId) form.append('recording_id', payload.recordingId);
      if (payload.filename) form.append('filename', payload.filename);
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/recording/upload`), {
        method: 'POST',
        body: form,
      });
      const data = await parseJson<LiveRecordingUploadResult & { detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || `Failed to upload live recording: ${response.status}`));
      }
      return data;
    },
    async listRecordingSessions(): Promise<RecordingSessionRecord[]> {
      const response = await fetch(buildUrl('/api/recordings'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await parseJson<{ recordings?: RecordingSessionRecord[]; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || `Failed to load recording sessions: ${response.status}`));
      }
      return normalizeRecordingSessions(payload);
    },
    async startRecordingSession(payload: {
      session_id: string;
      node_id: string;
      project: string;
      source?: string;
      target_dir?: string;
      recording_id?: string;
    }): Promise<RecordingSessionRecord> {
      const response = await fetch(buildUrl('/api/recordings/start'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const data = await parseJson<{ recording?: RecordingSessionRecord; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || `Failed to start recording session: ${response.status}`));
      }
      const session = normalizeRecordingSession(data);
      if (!session) {
        throw new Error('Failed to parse recording session payload');
      }
      return session;
    },
    async completeRecordingSession(
      recordingId: string,
      payload: { asset_url?: string | null; filename?: string | null },
    ): Promise<RecordingSessionRecord> {
      const response = await fetch(buildUrl(`/api/recordings/${encodeURIComponent(recordingId)}/complete`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const data = await parseJson<{ recording?: RecordingSessionRecord; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || `Failed to complete recording session: ${response.status}`));
      }
      const session = normalizeRecordingSession(data);
      if (!session) {
        throw new Error('Failed to parse recording session payload');
      }
      return session;
    },
    async failRecordingSession(recordingId: string, payload: { error: string }): Promise<RecordingSessionRecord> {
      const response = await fetch(buildUrl(`/api/recordings/${encodeURIComponent(recordingId)}/fail`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const data = await parseJson<{ recording?: RecordingSessionRecord; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || `Failed to fail recording session: ${response.status}`));
      }
      const session = normalizeRecordingSession(data);
      if (!session) {
        throw new Error('Failed to parse recording session payload');
      }
      return session;
    },
    async deleteRecordingSession(recordingId: string): Promise<{ ok: boolean; recording_id: string; deleted: boolean }> {
      const response = await fetch(buildUrl(`/api/recordings/${encodeURIComponent(recordingId)}`), {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const data = await parseJson<{ ok: boolean; recording_id: string; deleted: boolean; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || `Failed to delete recording session: ${response.status}`));
      }
      return data;
    },
    async acknowledgeLiveSessionControl(sessionId: string, action: LiveSessionControlAction): Promise<{ ok: boolean; action: LiveSessionControlAction }> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/control/ack`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw new Error(`Failed to acknowledge live session control: ${response.status}`);
      }
      return response.json();
    },
    async getLiveSignalState(sessionId: string, viewerId: string | null = null): Promise<LiveSignalState> {
      const query = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/signal${query}`), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to get live signal state: ${response.status}`);
      }
      return response.json();
    },
    async publishLiveSignalOffer(sessionId: string, offer: LiveSignalDescription): Promise<LiveSignalState> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/signal/offer`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ offer }),
      });
      if (!response.ok) {
        throw new Error(`Failed to publish signal offer: ${response.status}`);
      }
      return response.json();
    },
    async publishLiveSignalAnswer(sessionId: string, viewerId: string, answer: LiveSignalDescription): Promise<LiveSignalState> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/signal/answer`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ viewer_id: viewerId, answer }),
      });
      if (!response.ok) {
        throw new Error(`Failed to publish signal answer: ${response.status}`);
      }
      return response.json();
    },
    async publishLiveSignalIce(sessionId: string, role: LiveSignalRole, viewerId: string, candidate: LiveSignalIceCandidate): Promise<LiveSignalState> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/signal/ice`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ role, viewer_id: viewerId, candidate }),
      });
      if (!response.ok) {
        throw new Error(`Failed to publish signal ICE: ${response.status}`);
      }
      return response.json();
    },
    async heartbeatLiveSession(sessionId: string): Promise<LiveSessionRecord> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/heartbeat`), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to heartbeat live session: ${response.status}`);
      }
      return response.json();
    },
    async uploadLiveSessionChunk(sessionId: string, blob: Blob): Promise<void> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/chunk`), {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'application/octet-stream',
          Accept: 'application/json',
        },
        body: blob,
      });
      if (!response.ok) {
        throw new Error(`Failed to upload live chunk: ${response.status}`);
      }
    },
    async endLiveSession(sessionId: string): Promise<{ session: LiveSessionRecord; claim_id: string | null }> {
      const response = await fetch(buildUrl(`/api/live_sessions/${encodeURIComponent(sessionId)}/end`), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to end live session: ${response.status}`);
      }
      return response.json();
    },
    async listLiveSessions(): Promise<LiveSessionRecord[]> {
      const response = await fetch(buildUrl('/api/live_sessions'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to load live sessions: ${response.status}`);
      }
      const payload = await parseJson<unknown>(response);
      return normalizeLiveSessionList(payload);
    },
    async listWebRtcLiveSessions(): Promise<WebRtcLiveSession[]> {
      const response = await fetch(buildUrl('/api/live'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to load live WebRTC sessions: ${response.status}`);
      }
      const payload = await parseJson<unknown>(response);
      return normalizeWebRtcLiveSessions(payload);
    },
    async getLiveOffer(sessionId: string): Promise<RTCSessionDescriptionInit | null> {
      const response = await fetch(buildUrl(`/api/live/${encodeURIComponent(sessionId)}/offer`), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return parseJson<RTCSessionDescriptionInit | null>(response);
    },
    async postLiveViewerAnswer(
      sessionId: string,
      viewerId: string,
      answer: RTCSessionDescriptionInit,
    ): Promise<{ ok: boolean; session_id: string; viewer_id: string }> {
      const response = await fetch(buildUrl(`/api/live/${encodeURIComponent(sessionId)}/viewers/${encodeURIComponent(viewerId)}/answer`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ answer }),
      });
      const payload = await parseJson<{ ok: boolean; session_id: string; viewer_id: string; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || `Failed to post viewer answer: ${response.status}`));
      }
      return payload;
    },
    async postLiveViewerIce(
      sessionId: string,
      viewerId: string,
      candidate: RTCIceCandidateInit,
    ): Promise<{ ok: boolean; session_id: string; viewer_id: string }> {
      const response = await fetch(buildUrl(`/api/live/${encodeURIComponent(sessionId)}/viewers/${encodeURIComponent(viewerId)}/ice`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ candidate }),
      });
      const payload = await parseJson<{ ok: boolean; session_id: string; viewer_id: string; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || `Failed to post viewer ICE candidate: ${response.status}`));
      }
      return payload;
    },
    async listLiveDeviceIce(sessionId: string): Promise<RTCIceCandidateInit[]> {
      const response = await fetch(buildUrl(`/api/live/${encodeURIComponent(sessionId)}/ice/device`), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await parseJson<{ candidates?: RTCIceCandidateInit[]; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || `Failed to load device ICE candidates: ${response.status}`));
      }
      return Array.isArray(payload.candidates) ? payload.candidates : [];
    },
    async postLiveViewerState(
      sessionId: string,
      viewerId: string,
      state: string,
    ): Promise<{ ok: boolean; session_id: string; viewer_id: string }> {
      const response = await fetch(buildUrl(`/api/live/${encodeURIComponent(sessionId)}/viewers/${encodeURIComponent(viewerId)}/state`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ state }),
      });
      const payload = await parseJson<{ ok: boolean; session_id: string; viewer_id: string; detail?: string }>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || `Failed to post viewer state: ${response.status}`));
      }
      return payload;
    },
    async listRuntimeAssets(): Promise<Array<Record<string, unknown>>> {
      const response = await fetch(buildUrl('/api/runtime/assets'), { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await parseJson<{ assets?: Array<Record<string, unknown>>; detail?: string }>(response);
      if (!response.ok) throw new Error(String(payload?.detail || `Failed to load runtime assets: ${response.status}`));
      return Array.isArray(payload.assets) ? payload.assets : [];
    },
    async listProjects(): Promise<Project[]> {
      const response = await fetch(buildUrl('/api/projects'));
      if (!response.ok) {
        throw new Error('Failed to list projects');
      }
      return response.json();
    },
    async listMedia(project: string, source?: string): Promise<MediaResponse> {
      const query = source ? `?source=${encodeURIComponent(source)}` : '';
      const response = await fetch(buildUrl(`/api/projects/${encodeURIComponent(project)}/media${query}`));
      if (!response.ok) {
        throw new Error('Failed to load media list');
      }
      return response.json();
    },
    async listLibrarySnapshot(params: { source?: string; scope?: 'all' | 'project'; project?: string } = {}): Promise<LibrarySnapshot> {
      const { source, scope = 'all', project } = params;
      const query = new URLSearchParams();
      query.set('scope', scope);
      if (source) query.set('source', source);
      if (project) query.set('project', project);
      const response = await fetch(buildUrl(`/api/library?${query.toString()}`));
      if (!response.ok) {
        throw new Error('Failed to load library snapshot');
      }
      return response.json();
    },
    async uploadMedia(url: string, file: File): Promise<Record<string, unknown>> {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(buildUrl(url), { method: 'POST', body: form });
      const payload = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(payload?.detail || payload?.message || 'Upload failed'));
      }
      return payload;
    },
    async sendResolve(payload: ResolveRequest, source?: string): Promise<ResolveOpenResponse> {
      const query = source ? `?source=${encodeURIComponent(source)}` : '';
      const response = await fetch(buildUrl(`/api/resolve/open${query}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJson<ResolveOpenResponse & { detail?: string; message?: string }>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Resolve request failed'));
      }
      return data;
    },
    async deleteMedia(project: string, relativePaths: string[], source?: string): Promise<Record<string, unknown>> {
      const query = source ? `?source=${encodeURIComponent(source)}` : '';
      const response = await fetch(buildUrl(`/api/projects/${encodeURIComponent(project)}/media/delete${query}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relative_paths: relativePaths }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Delete failed'));
      }
      return data;
    },
    async moveMedia(
      project: string,
      relativePaths: string[],
      targetProject: string,
      source?: string,
      targetSource?: string,
    ): Promise<Record<string, unknown>> {
      const query = source ? `?source=${encodeURIComponent(source)}` : '';
      const response = await fetch(buildUrl(`/api/projects/${encodeURIComponent(project)}/media/move${query}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relative_paths: relativePaths,
          target_project: targetProject,
          target_source: targetSource || undefined,
        }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Move failed'));
      }
      return data;
    },
    async bulkDeleteMedia(assets: AssetRef[]): Promise<Record<string, unknown>> {
      const response = await fetch(buildUrl('/api/assets/bulk/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Bulk delete failed'));
      }
      return data;
    },
    async bulkMoveMedia(assets: AssetRef[], targetProject: string, targetSource?: string | null): Promise<Record<string, unknown>> {
      const response = await fetch(buildUrl('/api/assets/bulk/move'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets,
          target_project: targetProject,
          target_source: targetSource || undefined,
        }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Bulk move failed'));
      }
      return data;
    },
    async bulkTagMedia(assets: AssetRef[], addTags: string[], removeTags: string[]): Promise<Record<string, unknown>> {
      const response = await fetch(buildUrl('/api/assets/bulk/tags'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets,
          add_tags: addTags,
          remove_tags: removeTags,
        }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Bulk tag update failed'));
      }
      return data;
    },
    async bulkComposeMedia(payload: {
      assets: AssetRef[];
      output_project: string;
      output_name: string;
      output_source?: string | null;
      target_dir?: string;
      mode?: 'auto' | 'copy' | 'encode';
      allow_overwrite?: boolean;
    }): Promise<ComposeJobEnvelope> {
      const response = await fetch(buildUrl('/api/assets/bulk/compose'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJson<ComposeJobEnvelope & Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Bulk compose failed'));
      }
      return data;
    },
  };
}
