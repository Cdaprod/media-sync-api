import type { LibrarySnapshot, MediaResponse, Project, ResolveOpenResponse, Source } from './types';
import type { ComposeJobEnvelope } from './composeJobs';

export interface ResolveRequest {
  project: string;
  new_project_name?: string | null;
  media_rel_paths: string[];
  mode: string;
}

export interface AssetRef {
  relative_path: string;
  project: string;
  source?: string | null;
}

export interface ApiClient {
  listSources: () => Promise<Source[]>;
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
