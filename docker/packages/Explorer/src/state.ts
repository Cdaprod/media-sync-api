import type { MediaItem } from './types';
import { normalizeTagList } from './utils';

export type MediaTypeFilter = 'all' | 'video' | 'image' | 'audio' | 'overlay' | 'unknown';
export type SortKey =
  | 'newest'
  | 'oldest'
  | 'name-asc'
  | 'name-desc'
  | 'size-desc'
  | 'size-asc';

export interface MediaFilterOptions {
  query: string;
  type: MediaTypeFilter;
  selectedOnly: boolean;
  untaggedOnly: boolean;
  selected: Set<string>;
}

export interface MediaMeta {
  types: Set<MediaTypeFilter>;
  hasTags: boolean;
  hasSize: boolean;
}

export function getMediaType(item: MediaItem): MediaTypeFilter {
  const raw = (item.kind || item.type || '').toLowerCase();
  if (raw.includes('overlay')) return 'overlay';
  if (raw === 'video' || raw === 'image' || raw === 'audio') return raw;
  if (raw) return 'unknown';
  const p = (item.relative_path || '').toLowerCase();
  if (/\.(mp4|mov|mkv|webm|m4v|avi)$/.test(p)) return 'video';
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(p)) return 'image';
  if (/\.(mp3|wav|m4a|aac|flac)$/.test(p)) return 'audio';
  return 'unknown';
}

export function collectMediaMeta(items: MediaItem[]): MediaMeta {
  const types = new Set<MediaTypeFilter>();
  let hasTags = false;
  let hasSize = false;
  for (const item of items) {
    types.add(getMediaType(item));
    if (!hasTags && normalizeTagList(item.tags).length > 0) {
      hasTags = true;
    }
    if (!hasSize && Number.isFinite(Number(item.size))) {
      hasSize = true;
    }
  }
  return { types, hasTags, hasSize };
}

export function filterMedia(
  items: MediaItem[],
  options: MediaFilterOptions,
  meta?: MediaMeta,
): MediaItem[] {
  const q = options.query.trim().toLowerCase();
  const hasTags = meta?.hasTags ?? true;
  return items.filter((it) => {
    if (q && !(it.relative_path || '').toLowerCase().includes(q)) return false;
    if (options.type !== 'all' && getMediaType(it) !== options.type) return false;
    if (options.selectedOnly && !options.selected.has(it.relative_path)) return false;
    if (options.untaggedOnly && hasTags && normalizeTagList(it.tags).length > 0) return false;
    return true;
  });
}

export function toggleSelection(current: Set<string>, relPath: string): Set<string> {
  const next = new Set(current);
  if (next.has(relPath)) next.delete(relPath);
  else next.add(relPath);
  return next;
}

export function pruneSelection(current: Set<string>, existing: Set<string>): Set<string> {
  const next = new Set<string>();
  for (const value of current) {
    if (existing.has(value)) next.add(value);
  }
  return next;
}

export function extractTags(items: MediaItem[]): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    normalizeTagList(item.tags).forEach((tag) => tags.add(tag));
  }
  return Array.from(tags).sort();
}

export function extractAiTags(items: MediaItem[]): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    normalizeTagList(item.ai_tags || item.aiTags).forEach((tag) => tags.add(tag));
  }
  return Array.from(tags).sort();
}

const parseTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
};

const filenameTimestamp = (relativePath?: string | null): number => {
  if (!relativePath) return 0;
  const name = relativePath.split('/').pop() || relativePath;
  const dateTimeMatch = name.match(/(\d{4})-(\d{2})-(\d{2})[T_ -]?(\d{2})-(\d{2})-(\d{2})/);
  if (dateTimeMatch) {
    const [, year, month, day, hour, minute, second] = dateTimeMatch;
    return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  }
  const dateMatch = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return Date.parse(`${year}-${month}-${day}T00:00:00`);
  }
  return 0;
};

const mediaTimestamp = (item: MediaItem): number => Math.max(
  parseTimestamp(item.updated_at),
  parseTimestamp(item.updatedAt),
  parseTimestamp(item.created_at),
  parseTimestamp(item.createdAt),
  parseTimestamp(item.uploaded_at),
  parseTimestamp(item.uploadedAt),
  parseTimestamp(item.indexed_at),
  parseTimestamp(item.indexedAt),
  filenameTimestamp(item.relative_path),
);

export function sortMediaByRecent(items: MediaItem[]): MediaItem[] {
  return items
    .slice()
    .sort((a, b) => {
      const delta = mediaTimestamp(b) - mediaTimestamp(a);
      if (delta !== 0) return delta;
      return (b.relative_path || '').localeCompare(a.relative_path || '');
    });
}

export function sortMedia(items: MediaItem[], sortKey: SortKey, meta?: MediaMeta): MediaItem[] {
  const list = items.slice();
  const nameCompare = (a: MediaItem, b: MediaItem) => (a.relative_path || '').localeCompare(b.relative_path || '');
  const sizeValue = (item: MediaItem) => {
    const value = Number(item.size);
    return Number.isFinite(value) ? value : null;
  };
  const sortNewest = () => list.sort((a, b) => {
    const delta = mediaTimestamp(b) - mediaTimestamp(a);
    if (delta !== 0) return delta;
    return nameCompare(a, b);
  });

  if (sortKey === 'oldest') {
    return list.sort((a, b) => {
      const delta = mediaTimestamp(a) - mediaTimestamp(b);
      if (delta !== 0) return delta;
      return nameCompare(a, b);
    });
  }
  if (sortKey === 'name-asc') {
    return list.sort(nameCompare);
  }
  if (sortKey === 'name-desc') {
    return list.sort((a, b) => nameCompare(b, a));
  }
  if ((sortKey === 'size-desc' || sortKey === 'size-asc') && meta?.hasSize) {
    const direction = sortKey === 'size-desc' ? -1 : 1;
    return list.sort((a, b) => {
      const aSize = sizeValue(a);
      const bSize = sizeValue(b);
      if (aSize == null && bSize == null) return nameCompare(a, b);
      if (aSize == null) return 1;
      if (bSize == null) return -1;
      const delta = (aSize - bSize) * direction;
      if (delta !== 0) return delta;
      return nameCompare(a, b);
    });
  }
  return sortNewest();
}
