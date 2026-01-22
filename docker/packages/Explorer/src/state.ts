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

const mediaTimestamp = (item: MediaItem): number => Math.max(
  parseTimestamp(item.updated_at),
  parseTimestamp(item.updatedAt),
  parseTimestamp(item.created_at),
  parseTimestamp(item.createdAt),
);

export function sortMediaByRecent(items: MediaItem[]): MediaItem[] {
  return items.slice().sort((a, b) => mediaTimestamp(b) - mediaTimestamp(a));
}
