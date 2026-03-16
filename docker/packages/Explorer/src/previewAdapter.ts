import type { MediaItem } from './types';
import { guessKind } from './utils';

export type PreviewObsState = {
  cover: string;
  slot: string;
  exclusive: boolean;
};

export type PreviewAsset = {
  id: string;
  name: string;
  path: string;
  kind: 'video' | 'image' | 'audio' | 'other';
  src: string;
  duration: number | null;
  quick: Array<[string, string]>;
  obs: PreviewObsState;
  raw: MediaItem;
};

export const normalizePreviewAsset = (
  item: MediaItem,
  resolveAssetUrl: (value: string | undefined) => string,
  obsState: Partial<PreviewObsState> = {},
): PreviewAsset => {
  const rawKind = guessKind(item);
  const kind: PreviewAsset['kind'] = rawKind === 'video' || rawKind === 'image' || rawKind === 'audio' ? rawKind : 'other';
  const path = item.relative_path || '';
  const name = path.split('/').pop() || path || 'untitled';
  const srcCandidate = item.stream_url || item.thumb_url || item.thumbnail_url || '';
  const src = resolveAssetUrl(srcCandidate);

  const quick: Array<[string, string]> = [];
  if (typeof item.duration === 'number') quick.push(['Duration', `${item.duration.toFixed(3)}s`]);
  if (item.width && item.height) quick.push(['Resolution', `${item.width}×${item.height}`]);
  if (typeof item.size === 'number') quick.push(['Size', `${Math.round(item.size / (1024 * 1024))} MB`]);

  return {
    id: String(item.sha256 || item.hash || `${item.project_name || ''}:${path}`),
    name,
    path,
    kind,
    src,
    duration: typeof item.duration === 'number' ? item.duration : null,
    quick,
    obs: {
      cover: obsState.cover || 'cover',
      slot: obsState.slot || '1',
      exclusive: Boolean(obsState.exclusive),
    },
    raw: item,
  };
};
