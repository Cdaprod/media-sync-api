export function shouldPollLiveSurface(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function shouldPollDeviceControlPlane({
  mode,
  visible,
  remotePickerOpen = false,
}: {
  mode: 'local' | 'remote';
  visible: boolean;
  remotePickerOpen?: boolean;
}): boolean {
  if (!visible) return false;
  if (mode === 'local' && !remotePickerOpen) return false;
  return true;
}
