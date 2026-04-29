'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { CameraSessionState, StartCameraOptions, describeCameraError, inferFacingModeFromLabel, normalizeCameraError, sanitizeCameraDevice } from './cameraSession';

export function useCameraSession(options?: { videoRef?: RefObject<HTMLVideoElement> }) {
  const traceCamera = useCallback((event: string, details?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[camera-session] ${event}`, details || {});
    }
  }, []);
  const [camera, setCamera] = useState<CameraSessionState>({
    status: 'idle', devices: [], selectedDeviceId: null, activeDeviceId: null, activeFacingMode: null,
    permission: 'unknown', stream: null, error: null, warning: null,
  });

  const stopCamera = useCallback(() => {
    traceCamera('stopCamera');
    setCamera((prev) => {
      prev.stream?.getTracks().forEach((t) => t.stop());
      if (options?.videoRef?.current) options.videoRef.current.srcObject = null;
      return { ...prev, status: 'idle', stream: null, activeDeviceId: null, activeFacingMode: null };
    });
  }, [options?.videoRef, traceCamera]);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setCamera((prev) => ({ ...prev, status: 'error', error: { type: 'media_devices_unavailable', message: 'Media devices are unavailable.' } }));
      return;
    }
    setCamera((prev) => ({ ...prev, status: 'enumerating' }));
    const all = await navigator.mediaDevices.enumerateDevices();
    const devices = all.filter((d) => d.kind === 'videoinput').map(sanitizeCameraDevice);
    setCamera((prev) => ({ ...prev, status: 'ready', devices, permission: devices.length ? 'granted' : 'prompt', selectedDeviceId: prev.selectedDeviceId && devices.some((d) => d.deviceId===prev.selectedDeviceId) ? prev.selectedDeviceId : null }));
  }, []);

  const selectDevice = useCallback((deviceId: string | null) => setCamera((prev) => ({ ...prev, selectedDeviceId: deviceId })), []);

  const startCamera = useCallback(async (startOptions?: StartCameraOptions) => {
    traceCamera('startCamera:begin', {
      selectedDeviceId: startOptions?.deviceId ?? null,
      facingMode: startOptions?.facingMode ?? null,
      audio: startOptions?.audio ?? true,
    });
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const err = normalizeCameraError(new DOMException('Insecure context', 'SecurityError'), { insecureContext: true });
      setCamera((prev) => ({ ...prev, status: 'error', error: err }));
      return null;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera((prev) => ({ ...prev, status: 'error', error: { type: 'media_devices_unavailable', message: 'This browser does not expose camera capture APIs.' } }));
      return null;
    }
    setCamera((prev) => ({ ...prev, status: 'starting', warning: null, error: null }));
    const audio = startOptions?.audio ?? true;
    const old = options?.videoRef?.current?.srcObject;
    if (old instanceof MediaStream) old.getTracks().forEach((t) => t.stop());
    try {
      traceCamera('startCamera:constraints', {
        hasDeviceId: !!startOptions?.deviceId,
        hasFacingMode: !!startOptions?.facingMode,
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: startOptions?.deviceId ? { deviceId: { exact: startOptions.deviceId } } : startOptions?.facingMode ? { facingMode: { ideal: startOptions.facingMode } } : true,
        audio,
      });
      if (options?.videoRef?.current) {
        options.videoRef.current.srcObject = stream;
          await options.videoRef.current.play().catch(() => undefined);
      }
      await refreshDevices();
      traceCamera('startCamera:success', {
        trackCount: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
      });
      setCamera((prev) => ({ ...prev, status: 'previewing', stream, activeDeviceId: startOptions?.deviceId ?? null, activeFacingMode: startOptions?.facingMode ?? null, permission: 'granted' }));
      return stream;
    } catch (err) {
      const selected = camera.devices.find((d) => d.deviceId === startOptions?.deviceId);
      const inferred = startOptions?.facingMode ?? inferFacingModeFromLabel(selected?.label || '');
      if (startOptions?.deviceId && inferred) {
        try {
          traceCamera('startCamera:fallback', { inferredFacingMode: inferred });
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: inferred } }, audio });
          if (options?.videoRef?.current) {
            options.videoRef.current.srcObject = stream;
            await options.videoRef.current.play().catch(() => undefined);
          }
          setCamera((prev) => ({ ...prev, status: 'previewing', stream, activeFacingMode: inferred, warning: 'Exact camera not available — using closest match', permission: 'granted' }));
          traceCamera('startCamera:success', {
            trackCount: stream.getTracks().length,
            videoTracks: stream.getVideoTracks().length,
            fallback: true,
          });
          return stream;
        } catch (fallbackErr) {
          const normalized = normalizeCameraError(fallbackErr, { insecureContext: typeof window !== 'undefined' && !window.isSecureContext });
          traceCamera('startCamera:error', { name: normalized.name, type: normalized.type, message: normalized.message, fallback: true });
          setCamera((prev) => ({ ...prev, status: 'error', error: normalized }));
          return null;
        }
      }
      const normalized = normalizeCameraError(err, { insecureContext: typeof window !== 'undefined' && !window.isSecureContext });
      traceCamera('startCamera:error', { name: normalized.name, type: normalized.type, message: normalized.message });
      setCamera((prev) => ({ ...prev, status: 'error', error: normalized }));
      return null;
    }
  }, [camera.devices, options?.videoRef, refreshDevices, traceCamera]);

  const clearCameraError = useCallback(() => setCamera((prev) => ({ ...prev, error: null, warning: null })), []);

  useEffect(() => { void refreshDevices(); navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices); return () => { navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices); stopCamera(); }; }, [refreshDevices, stopCamera]);

  return useMemo(() => ({ camera, refreshDevices, selectDevice, startCamera, stopCamera, clearCameraError, describeCameraError }), [camera, refreshDevices, selectDevice, startCamera, stopCamera, clearCameraError]);
}
