export type VideoResumeKey = string;

export type VideoResumeSnapshot = {
  currentTime: number;
  duration: number;
  wasPlaying: boolean;
  updatedAt: number;
};

const playbackResumeStore = new Map<VideoResumeKey, VideoResumeSnapshot>();

export function makeVideoResumeKey(selectionKey: string, streamUrl: string): VideoResumeKey {
  return `${selectionKey}::${streamUrl}`;
}

export function getVideoResumeSnapshot(key: VideoResumeKey): VideoResumeSnapshot | null {
  return playbackResumeStore.get(key) ?? null;
}

export function setVideoResumeSnapshot(key: VideoResumeKey, snapshot: VideoResumeSnapshot): void {
  const existing = playbackResumeStore.get(key);
  if (existing && existing.updatedAt > snapshot.updatedAt) return;
  playbackResumeStore.set(key, snapshot);
}

export function clearVideoResumeSnapshot(key: VideoResumeKey): void {
  playbackResumeStore.delete(key);
}

export function maybeNormalizeResumeTime(currentTime: number, duration: number): number {
  if (!Number.isFinite(currentTime) || currentTime <= 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, currentTime);
  if (currentTime >= Math.max(0, duration - 0.75)) return 0;
  return Math.min(Math.max(0, currentTime), Math.max(0, duration - 0.04));
}
