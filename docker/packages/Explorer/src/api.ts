import type { MediaResponse, Project, ResolveOpenResponse, Source } from './types';

export interface ResolveRequest {
  project: string;
  new_project_name?: string | null;
  media_rel_paths: string[];
  mode: string;
}

export interface ApiClient {
  listSources: () => Promise<Source[]>;
  listProjects: () => Promise<Project[]>;
  listMedia: (project: string, source?: string) => Promise<MediaResponse>;
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

export function createApiClient(baseUrl: string): ApiClient {
  const buildUrl = buildUrlFactory(baseUrl);

  return {
    buildUrl,
    async listSources(): Promise<Source[]> {
      const response = await fetch(buildUrl('/api/sources'));
      if (!response.ok) {
        throw new Error('Failed to list sources');
      }
      return response.json();
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
  };
}
