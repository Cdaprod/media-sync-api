export interface Source {
  name: string;
  root: string;
  type: string;
  enabled: boolean;
  accessible: boolean;
  instructions?: string | null;
}

export interface Project {
  name: string;
  source: string;
  source_accessible: boolean;
  index_exists: boolean;
  upload_url?: string;
  instructions?: string | null;
}

export interface MediaItem {
  relative_path: string;
  size?: number;
  stream_url?: string;
  download_url?: string;
  thumb_url?: string;
  thumbnail_url?: string;
  kind?: string;
  type?: string;
  mime?: string;
  content_type?: string;
  sha256?: string;
  hash?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  duration?: number;
  width?: number;
  height?: number;
  tags?: string[] | string;
  ai_tags?: string[] | string;
  aiTags?: string[] | string;
}

export interface MediaResponse {
  project: string;
  source: string;
  media: MediaItem[];
  counts?: Record<string, number>;
  instructions?: string;
}

export interface ResolveOpenResponse {
  ok: boolean;
  job_id?: string;
  instructions?: string;
}

export type ExplorerView = 'grid' | 'list';

export interface ToastMessage {
  id: string;
  type: 'good' | 'warn' | 'bad' | '';
  title: string;
  message: string;
}
