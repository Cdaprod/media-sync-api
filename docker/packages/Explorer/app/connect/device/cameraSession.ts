export type CameraErrorType =
  | 'insecure_context'
  | 'media_devices_unavailable'
  | 'permission_denied'
  | 'not_found'
  | 'overconstrained'
  | 'not_readable'
  | 'unknown';

export type CameraSessionError = {
  type: CameraErrorType;
  name?: string;
  message: string;
  constraint?: string;
};

export type CameraSessionStatus =
  | 'idle'
  | 'enumerating'
  | 'ready'
  | 'starting'
  | 'previewing'
  | 'stopping'
  | 'error';

export type CameraDevice = {
  deviceId: string;
  label: string;
  kind: 'videoinput';
  groupId?: string;
  facingModeHint?: 'user' | 'environment';
};

export type StartCameraOptions = {
  deviceId?: string | null;
  facingMode?: 'user' | 'environment';
  audio?: boolean;
};

export type CameraSessionState = {
  status: CameraSessionStatus;
  devices: CameraDevice[];
  selectedDeviceId: string | null;
  activeDeviceId: string | null;
  activeFacingMode: 'user' | 'environment' | null;
  permission: 'unknown' | 'prompt' | 'granted' | 'denied';
  stream: MediaStream | null;
  error: CameraSessionError | null;
  warning: string | null;
};

export function inferFacingModeFromLabel(label: string): 'user' | 'environment' | undefined {
  const normalized = label.toLowerCase();
  if (normalized.includes('front')) return 'user';
  if (normalized.includes('back')) return 'environment';
  return undefined;
}

export function sanitizeCameraDevice(device: MediaDeviceInfo, index: number): CameraDevice {
  return {
    deviceId: device.deviceId || `camera-${index}`,
    label: device.label || `Camera ${index + 1}`,
    kind: 'videoinput',
    groupId: device.groupId || undefined,
    facingModeHint: inferFacingModeFromLabel(device.label || ''),
  };
}

export function normalizeCameraError(error: unknown, context?: { insecureContext?: boolean }): CameraSessionError {
  const domError = error as DOMException & { constraint?: string };
  if (context?.insecureContext) return { type: 'insecure_context', name: domError?.name, message: 'Camera requires HTTPS or localhost.' };
  if (domError?.name === 'NotAllowedError') return { type: 'permission_denied', name: domError.name, message: 'Camera permission was denied or blocked by the browser.' };
  if (domError?.name === 'NotFoundError') return { type: 'not_found', name: domError.name, message: 'Selected camera was unavailable. Pick a different camera.' };
  if (domError?.name === 'OverconstrainedError') return { type: 'overconstrained', name: domError.name, message: 'Selected camera was unavailable. Pick a different camera.', constraint: domError.constraint };
  if (domError?.name === 'NotReadableError') return { type: 'not_readable', name: domError.name, message: 'Camera is already in use or iOS could not switch devices. Stop preview and retry.' };
  return { type: 'unknown', name: domError?.name, message: domError?.message || 'Unknown camera failure.' };
}

export function describeCameraError(error: CameraSessionError | null): string | null {
  if (!error) return null;
  return error.message;
}
