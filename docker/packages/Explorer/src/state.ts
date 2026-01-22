import type { MediaItem } from './types';
import { normalizeTagList } from './utils';

export function filterMedia(items: MediaItem[], query: string): MediaItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice();
  return items.filter((it) => (it.relative_path || '').toLowerCase().includes(q));
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
