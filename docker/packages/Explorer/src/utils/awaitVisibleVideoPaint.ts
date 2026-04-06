export type VisibleVideoPaintResult = {
  ok: boolean;
  reason: 'painted' | 'timeout';
};

type AwaitVisibleVideoPaintOptions = {
  timeoutMs?: number;
};

export async function awaitVisibleVideoPaint(
  video: HTMLVideoElement,
  opts?: AwaitVisibleVideoPaintOptions,
): Promise<VisibleVideoPaintResult> {
  const timeoutMs = Math.max(60, opts?.timeoutMs ?? 320);
  const start = performance.now();

  const waitRaf = () => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

  const maybeAwaitVideoFrame = async () => {
    if (typeof video.requestVideoFrameCallback !== 'function') return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, Math.min(140, timeoutMs));
      video.requestVideoFrameCallback(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve();
      });
    });
  };

  while ((performance.now() - start) < timeoutMs) {
    if (video.readyState >= 2 && !video.paused) {
      await maybeAwaitVideoFrame();
      await waitRaf();
      const rect = video.getBoundingClientRect();
      const painted = rect.width > 1 && rect.height > 1 && video.readyState >= 2;
      if (painted) {
        return { ok: true, reason: 'painted' };
      }
    }
    await waitRaf();
  }

  return { ok: false, reason: 'timeout' };
}
