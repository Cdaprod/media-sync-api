export type FirstFrameReadyStrategy = 'rvfc' | 'fallback' | 'timeout';

export type FirstFrameReadyResult = {
  ok: boolean;
  strategy: FirstFrameReadyStrategy;
};

type FrameReadyOptions = {
  timeoutMs?: number;
  minReadyState?: number;
};

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_MIN_READY_STATE = 2;

export async function awaitFirstVideoFrame(
  video: HTMLVideoElement,
  opts: FrameReadyOptions = {},
): Promise<FirstFrameReadyResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const minReadyState = opts.minReadyState ?? DEFAULT_MIN_READY_STATE;
  const rvfcVideo = video as VideoWithRVFC;

  if (rvfcVideo.requestVideoFrameCallback) {
    const rvfcResult = await new Promise<FirstFrameReadyResult>((resolve) => {
      let timeoutId = 0;
      let callbackId = 0;
      let settled = false;

      const settle = (result: FirstFrameReadyResult) => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        if (callbackId && rvfcVideo.cancelVideoFrameCallback) {
          rvfcVideo.cancelVideoFrameCallback(callbackId);
        }
        resolve(result);
      };

      timeoutId = window.setTimeout(() => settle({ ok: false, strategy: 'timeout' }), timeoutMs);
      callbackId = rvfcVideo.requestVideoFrameCallback?.(() => {
        settle({ ok: true, strategy: 'rvfc' });
      }) || 0;
      if (!callbackId) {
        settle({ ok: false, strategy: 'timeout' });
      }
    });
    if (rvfcResult.ok) {
      return rvfcResult;
    }
  }

  return new Promise<FirstFrameReadyResult>((resolve) => {
    const startTime = performance.now();
    const startCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

    const checkReady = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const advanced = currentTime > startCurrentTime + 0.01;
      const ready = video.readyState >= minReadyState && (!video.paused || advanced);
      if (ready) {
        requestAnimationFrame(() => {
          resolve({ ok: true, strategy: 'fallback' });
        });
        return;
      }
      if (elapsed >= timeoutMs) {
        resolve({ ok: false, strategy: 'timeout' });
        return;
      }
      requestAnimationFrame(checkReady);
    };

    requestAnimationFrame(checkReady);
  });
}
