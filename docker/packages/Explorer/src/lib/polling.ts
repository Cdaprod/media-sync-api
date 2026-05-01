export function shouldPollLiveSurface(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}
