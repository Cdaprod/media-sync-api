import type { MediaResponse, Project, ResolveOpenResponse, Source } from './types';

export interface ResolveRequest {
  project: string;
  new_project_name?: string | null;
  media_rel_paths: string[];
  mode: string;
}

export interface BulkComposeAssetRef {
  source: string;
  project: string;
  relative_path: string;
}

export interface BulkComposeOptions {
  outputSource?: string | null;
  targetDir?: string;
  mode?: 'auto' | 'copy' | 'encode';
  allowOverwrite?: boolean;
}


export function buildProjectUploadUrl(project: Project): string {
  const source = String(project.source || '').trim();
  const query = source ? `?source=${encodeURIComponent(source)}` : '';
  return project.upload_url || `/api/projects/${encodeURIComponent(project.name)}/upload${query}`;
}

export function buildUploadFormData(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
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
  bulkDeleteAssets: (assets: Array<{ source: string; project: string; relative_path: string }>) => Promise<Record<string, unknown>>;
  bulkTagAssets: (
    assets: Array<{ source: string; project: string; relative_path: string }>,
    addTags: string[],
    removeTags: string[],
  ) => Promise<Record<string, unknown>>;
  bulkMoveAssets: (
    assets: Array<{ source: string; project: string; relative_path: string }>,
    targetProject: string,
    targetSource?: string,
  ) => Promise<Record<string, unknown>>;
  bulkComposeAssets: (
    assets: BulkComposeAssetRef[],
    outputProject: string,
    outputName: string,
    options?: BulkComposeOptions,
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
      const form = buildUploadFormData(file);
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
    async bulkDeleteAssets(assets): Promise<Record<string, unknown>> {
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
    async bulkTagAssets(assets, addTags, removeTags): Promise<Record<string, unknown>> {
      const response = await fetch(buildUrl('/api/assets/bulk/tags'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets, add_tags: addTags, remove_tags: removeTags }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Bulk tag update failed'));
      }
      return data;
    },
    async bulkMoveAssets(assets, targetProject, targetSource): Promise<Record<string, unknown>> {
      const response = await fetch(buildUrl('/api/assets/bulk/move'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets,
          target_project: targetProject,
          target_source: targetSource || null,
        }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Bulk move failed'));
      }
      return data;
    },
    async bulkComposeAssets(assets: BulkComposeAssetRef[], outputProject, outputName, options): Promise<Record<string, unknown>> {
      const response = await fetch(buildUrl('/api/assets/bulk/compose'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets,
          output_project: outputProject,
          output_source: options?.outputSource || null,
          output_name: outputName,
          target_dir: options?.targetDir || 'exports',
          mode: options?.mode || 'auto',
          allow_overwrite: Boolean(options?.allowOverwrite),
        }),
      });
      const data = await parseJson<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(String(data?.detail || data?.message || 'Bulk compose failed'));
      }
      return data;
    },
  };
}
