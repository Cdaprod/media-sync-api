import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { RegisterNodeRequest, RegisterNodeResponse } from '../types/registration';
import type { NodeControlRecord } from '../types/sourceControl';
import { serializeMetadata } from '../utils/serializeMetadata';

interface RegisterNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (node: NodeControlRecord | null, response: RegisterNodeResponse) => void;
  registerNode: (payload: RegisterNodeRequest) => Promise<RegisterNodeResponse>;
  authorityBaseUrl: string;
}

type CameraPermissionState = 'prompt' | 'granted' | 'denied' | null;
type DeviceClass = 'iphone-browser' | 'ipad-browser' | 'ios-browser' | 'android-browser' | 'desktop-browser';

interface BrowserSourceContext {
  deviceClass: DeviceClass;
  likelyPlatform: 'ios' | 'android' | 'desktop' | 'unknown';
  isLikelyMobile: boolean;
  isLikelySafari: boolean;
  hasMediaDevices: boolean;
  hasCameraApi: boolean;
  hasEnumerateDevices: boolean;
  hasScreenCaptureApi: boolean;
}

function detectBrowserSourceContext(): BrowserSourceContext {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const platform = typeof navigator !== 'undefined' ? navigator.platform || '' : '';
  const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  const coarsePointer = typeof window !== 'undefined'
    ? window.matchMedia?.('(pointer: coarse)')?.matches ?? false
    : false;
  const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  const isIPhoneUa = /iPhone|iPod/i.test(ua);
  const isIPhone = isIPhoneUa || (/iPhone/i.test(platform) && maxTouchPoints > 0);
  const isIPadUa = /iPad/i.test(ua);
  const isIPadMacTouch = /MacIntel/i.test(platform) && maxTouchPoints > 1;
  const isIPad = !isIPhone && (isIPadUa || isIPadMacTouch);
  const isAndroid = /Android/i.test(ua);
  const isLikelySafari = /Safari/i.test(ua) && !/Chrome|CriOS|EdgiOS|FxiOS|OPR\//i.test(ua);
  const isLikelyIOS = isIPhone || isIPad || (/AppleWebKit/i.test(ua) && isLikelySafari && maxTouchPoints > 0 && !isAndroid);
  const hasCameraApi = (hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
    || (isLikelyIOS && isLikelySafari);
  const hasEnumerateDevices = (hasMediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function')
    || (isLikelyIOS && isLikelySafari);
  const hasScreenCaptureApi = hasMediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
  const isLikelyMobile = isIPhone || isIPad || isAndroid || (coarsePointer && maxTouchPoints > 0);

  let deviceClass: DeviceClass = 'desktop-browser';
  if (isIPhone) deviceClass = 'iphone-browser';
  else if (isIPad) deviceClass = 'ipad-browser';
  else if (isLikelyIOS) deviceClass = 'ios-browser';
  else if (isAndroid) deviceClass = 'android-browser';

  const likelyPlatform: BrowserSourceContext['likelyPlatform'] = isLikelyIOS
    ? 'ios'
    : isAndroid
      ? 'android'
      : /Windows|Macintosh|Linux/i.test(ua)
        ? 'desktop'
        : 'unknown';

  return {
    deviceClass,
    likelyPlatform,
    isLikelyMobile,
    isLikelySafari,
    hasMediaDevices,
    hasCameraApi,
    hasEnumerateDevices,
    hasScreenCaptureApi,
  };
}

function applyCapturePreset({
  setRoles,
  setCapabilities,
  setSourceName,
  setSourceKind,
  setSourceAuthority,
  setEphemeral,
  setLabel,
}: {
  setRoles: React.Dispatch<React.SetStateAction<string[]>>;
  setCapabilities: React.Dispatch<React.SetStateAction<string[]>>;
  setSourceName: React.Dispatch<React.SetStateAction<string>>;
  setSourceKind: React.Dispatch<React.SetStateAction<string>>;
  setSourceAuthority: React.Dispatch<React.SetStateAction<string>>;
  setEphemeral: React.Dispatch<React.SetStateAction<boolean>>;
  setLabel: React.Dispatch<React.SetStateAction<string>>;
}) {
  setRoles((prev) => {
    const next = new Set(prev);
    next.add('runner');
    next.add('capture');
    return [...next];
  });
  setCapabilities((prev) => (prev.includes('can_proxy_streams') ? prev : [...prev, 'can_proxy_streams']));
  setSourceName((prev) => prev.trim() ? prev : 'camera-primary');
  setSourceKind('capture');
  setSourceAuthority('runner-local');
  setEphemeral(true);
  setLabel((prev) => (prev.trim() === '' || prev === 'Browser Node' ? 'Mobile Capture Node' : prev));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildDefaultNodeId(deviceClass: string): string {
  const stamp = Date.now().toString(36);
  return `${slugify(deviceClass || 'browser')}-${stamp}`;
}

function safeParseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  }
  catch {
    return {};
  }
}

export function RegisterNodeModal({
  isOpen,
  onClose,
  onSuccess,
  registerNode,
  authorityBaseUrl,
}: RegisterNodeModalProps) {
  const router = useRouter();
  const [detectedContext, setDetectedContext] = useState<BrowserSourceContext | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [cameraPermission, setCameraPermission] = useState<CameraPermissionState>(null);

  const [nodeId, setNodeId] = useState('');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [roles, setRoles] = useState<string[]>(['runner']);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [sourceName, setSourceName] = useState('primary');
  const [sourceKind, setSourceKind] = useState('filesystem');
  const [sourceAuthority, setSourceAuthority] = useState('runner-local');
  const [ephemeral, setEphemeral] = useState(true);
  const [metadataText, setMetadataText] = useState('{}');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraApiLabel = useMemo(() => {
    if (!detectedContext) return 'unknown';
    if (detectedContext.hasCameraApi && detectedContext.likelyPlatform === 'ios' && detectedContext.isLikelySafari) {
      return 'likely supported (iOS Safari; requires user interaction)';
    }
    return detectedContext.hasCameraApi ? 'yes' : 'no';
  }, [detectedContext]);

  const enumerateApiLabel = useMemo(() => {
    if (!detectedContext) return 'unknown';
    if (detectedContext.hasEnumerateDevices && detectedContext.likelyPlatform === 'ios' && detectedContext.isLikelySafari) {
      return 'likely supported (iOS Safari; permission-gated)';
    }
    return detectedContext.hasEnumerateDevices ? 'yes' : 'no';
  }, [detectedContext]);

  useEffect(() => {
    if (!isOpen) return;

    const nextContext = detectBrowserSourceContext();
    const nextNodeId = buildDefaultNodeId(nextContext.deviceClass);

    setDetectedContext(nextContext);
    setNodeId(nextNodeId);
    setLabel(nextContext.deviceClass === 'iphone-browser' ? 'iPhone Capture Node' : 'Browser Node');
    setBaseUrl('');
    setShowAdvanced(false);
    setError(null);
    setHasCamera(nextContext.hasCameraApi ? null : false);

    const likelyCapture = nextContext.isLikelyMobile && nextContext.hasCameraApi;
    if (likelyCapture) {
      setRoles(['runner', 'capture']);
      setCapabilities(['can_proxy_streams']);
      setSourceName('camera-primary');
      setSourceKind('capture');
      setSourceAuthority('runner-local');
      setEphemeral(true);
      setMetadataText(JSON.stringify({
        device_class: nextContext.deviceClass,
        likely_platform: nextContext.likelyPlatform,
        likely_mobile: nextContext.isLikelyMobile,
        likely_safari: nextContext.isLikelySafari,
        transport_hint: 'session',
        session_node: 'true',
        browser_push: 'true',
        origin: 'browser',
      }, null, 2));
    }
    else {
      setRoles(['runner']);
      setCapabilities([]);
      setSourceName('primary');
      setSourceKind('filesystem');
      setSourceAuthority('runner-local');
      setEphemeral(true);
      setMetadataText(JSON.stringify({
        device_class: nextContext.deviceClass,
        likely_platform: nextContext.likelyPlatform,
        likely_mobile: nextContext.isLikelyMobile,
        likely_safari: nextContext.isLikelySafari,
        transport_hint: 'session',
        session_node: 'true',
        browser_push: 'true',
        origin: 'browser',
      }, null, 2));
    }

    let cancelled = false;

    async function detectDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          if (!cancelled) setHasCamera(false);
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videoInputs = devices.filter((device) => device.kind === 'videoinput');
        const available = videoInputs.length > 0;
        setHasCamera(available);
        if (available) {
          setSourceKind('capture');
          setSourceName((prev) => prev || 'camera-primary');
          setRoles((prev) => (prev.includes('capture') ? prev : [...prev, 'capture']));
          setCapabilities((prev) => (prev.includes('can_proxy_streams') ? prev : [...prev, 'can_proxy_streams']));
        }
      }
      catch {
        if (!cancelled) setHasCamera(false);
      }
    }

    async function detectPermission() {
      try {
        if (!navigator.permissions?.query) return;
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (cancelled) return;
        setCameraPermission(result.state as CameraPermissionState);
      }
      catch {
        // ignore
      }
    }

    void detectDevices();
    void detectPermission();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const toggleListValue = useCallback((value: string, list: string[], setList: (next: string[]) => void) => {
    if (list.includes(value)) {
      setList(list.filter((item) => item !== value));
      return;
    }
    setList([...list, value]);
  }, []);

  const payload = useMemo<RegisterNodeRequest>(() => {
    const metadata = safeParseMetadata(metadataText);
    const rawMetadata = {
      ...metadata,
      transport_hint: 'session',
      session_node: 'true',
      browser_push: 'true',
      likely_mobile: String(detectedContext?.isLikelyMobile ?? false),
      likely_safari: String(detectedContext?.isLikelySafari ?? false),
      detected_device: detectedContext?.deviceClass || 'desktop-browser',
      detected_platform: detectedContext?.likelyPlatform || 'unknown',
      detected_mobile: String(detectedContext?.isLikelyMobile ?? false),
      detected_safari: String(detectedContext?.isLikelySafari ?? false),
      authority_origin: authorityBaseUrl || '',
    };
    return {
      node_id: nodeId.trim(),
      label: label.trim(),
      base_url: null,
      roles,
      capabilities,
      source_name: sourceName.trim() || null,
      source_kind: sourceKind.trim() || null,
      source_authority: sourceAuthority.trim() || null,
      advertised_source_kinds: sourceKind.trim() ? [sourceKind.trim()] : [],
      ephemeral,
      metadata: serializeMetadata(rawMetadata),
    };
  }, [
    authorityBaseUrl,
    baseUrl,
    capabilities,
    detectedContext,
    ephemeral,
    label,
    metadataText,
    nodeId,
    roles,
    sourceAuthority,
    sourceKind,
    sourceName,
  ]);

  const payloadJson = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const curlCommand = useMemo(() => {
    const escaped = JSON.stringify(payload).replace(/'/g, `'\\''`);
    return `curl -X POST ${authorityBaseUrl}/connect/register \\
  -H "Content-Type: application/json" \\
  -d '${escaped}'`;
  }, [authorityBaseUrl, payload]);

  const fetchExample = useMemo(() => {
    return `await fetch("${authorityBaseUrl}/connect/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${payloadJson}),
});`;
  }, [authorityBaseUrl, payloadJson]);
  const connectLink = useMemo(() => `${authorityBaseUrl}/connect`, [authorityBaseUrl]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    }
    catch {
      // ignore
    }
  }, []);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await registerNode(payload);
      window.localStorage.setItem('explorer_capture_node_id', payload.node_id);
      onSuccess(response.registered_node ?? null, response);
      if (response.device_url) {
        try {
          router.push(response.device_url);
        }
        catch {
          window.location.href = response.device_url;
        }
        return;
      }
      onClose();
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    }
    finally {
      setSubmitting(false);
    }
  }, [onClose, onSuccess, payload, registerNode, router]);

  const handleConfigureAsCamera = useCallback(() => {
    applyCapturePreset({
      setRoles,
      setCapabilities,
      setSourceName,
      setSourceKind,
      setSourceAuthority,
      setEphemeral,
      setLabel,
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className={`confirm-modal ${isOpen ? 'open' : ''}`} onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="confirm-card register-node-card">
        <div className="register-node-header">
          <div>
            <h3 className="confirm-title">Register node / source</h3>
            <p className="confirm-body" style={{ marginBottom: 0 }}>
              Add this browser or connected machine as a source-bearing participant.
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close registration modal">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="register-node-form">
          <div className="register-node-detected card">
            <strong>Detected context</strong>
            <div className="small">Device class: {detectedContext?.deviceClass || 'desktop-browser'}</div>
            <div className="small">Likely platform: {detectedContext?.likelyPlatform || 'unknown'}</div>
            <div className="small">Likely mobile: {detectedContext?.isLikelyMobile ? 'yes' : 'no'}</div>
            <div className="small">Likely Safari: {detectedContext?.isLikelySafari ? 'yes' : 'no'}</div>
            <div className="small">Camera API available: {cameraApiLabel}</div>
            <div className="small">Enumerate devices API: {enumerateApiLabel}</div>
            <div className="small">Screen capture API available: {detectedContext?.hasScreenCaptureApi ? 'yes' : 'no'}</div>
            <div className="small">Camera: {hasCamera == null ? 'checking…' : hasCamera ? 'detected' : 'not detected'}</div>
            <div className="small">Camera permission: {cameraPermission ?? 'unknown'}</div>
            <div className="small">Authority URL: {authorityBaseUrl}</div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={handleConfigureAsCamera}>
                Configure as camera device
              </button>
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? 'Registering…' : 'Register This Device'}
              </button>
            </div>
          </div>

          <div className="register-node-grid">
            <label className="register-field">
              <span className="register-label">Node ID</span>
              <input className="input" type="text" value={nodeId} onChange={(event) => setNodeId(event.target.value)} required />
            </label>

            <label className="register-field">
              <span className="register-label">Label</span>
              <input className="input" type="text" value={label} onChange={(event) => setLabel(event.target.value)} required />
            </label>

            <label className="register-field">
              <span className="register-label">Base URL</span>
              <input
                className="input"
                type="text"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="Leave blank for browser/session nodes"
              />
            </label>
          </div>

          <div className="register-checks">
            <div className="register-check-group">
              <span className="register-label">Roles</span>
              <div className="register-chip-row">
                {['runner', 'capture', 'edge', 'indexer'].map((role) => (
                  <label key={role} className="register-check">
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={() => toggleListValue(role, roles, setRoles)}
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="register-check-group">
              <span className="register-label">Capabilities</span>
              <div className="register-chip-row">
                {['can_proxy_streams', 'can_index', 'can_record'].map((capability) => (
                  <label key={capability} className="register-check">
                    <input
                      type="checkbox"
                      checked={capabilities.includes(capability)}
                      onChange={() => toggleListValue(capability, capabilities, setCapabilities)}
                    />
                    <span>{capability}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="register-advanced-toggle">
            <button type="button" className="btn" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? 'Hide advanced' : 'Show advanced'}
            </button>
          </div>

          {showAdvanced ? (
            <div className="register-advanced">
              <label className="register-field">
                <span className="register-label">Source name</span>
                <input className="input" type="text" value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
              </label>

              <label className="register-field">
                <span className="register-label">Source kind</span>
                <input className="input" type="text" value={sourceKind} onChange={(event) => setSourceKind(event.target.value)} />
              </label>

              <label className="register-field">
                <span className="register-label">Source authority</span>
                <input className="input" type="text" value={sourceAuthority} onChange={(event) => setSourceAuthority(event.target.value)} />
              </label>

              <label className="register-check register-inline-check">
                <input type="checkbox" checked={ephemeral} onChange={(event) => setEphemeral(event.target.checked)} />
                <span>Ephemeral / session-based registration</span>
              </label>

              <label className="register-field">
                <span className="register-label">Metadata JSON</span>
                <textarea
                  className="input register-textarea"
                  rows={5}
                  value={metadataText}
                  onChange={(event) => setMetadataText(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="register-output card">
            <div className="register-output-header">
              <strong>Generated payload</strong>
              <button type="button" className="btn" onClick={() => void handleCopy(payloadJson)}>
                Copy JSON
              </button>
            </div>
            <pre className="register-pre">{payloadJson}</pre>

            <div className="register-output-header" style={{ marginTop: 12 }}>
              <strong>cURL</strong>
              <button type="button" className="btn" onClick={() => void handleCopy(curlCommand)}>
                Copy curl
              </button>
            </div>
            <pre className="register-pre">{curlCommand}</pre>

            <div className="register-output-header" style={{ marginTop: 12 }}>
              <strong>Fetch example</strong>
              <button type="button" className="btn" onClick={() => void handleCopy(fetchExample)}>
                Copy fetch
              </button>
            </div>
            <pre className="register-pre">{fetchExample}</pre>
          </div>

          <div className="card register-connect-link">
            <strong>Register from another device</strong>
            <div className="small">
              Open this URL on another LAN device to view connect discovery details.
            </div>
            <code>{connectLink}</code>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn" onClick={() => void handleCopy(connectLink)}>
                Copy connect URL
              </button>
            </div>
          </div>

          {error ? (
            <div className="register-error">
              {error}
            </div>
          ) : null}

          <div className="confirm-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Registering…' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
