# Device Monitor – Fullscreen Camera Preview

This directory contains the **route‑local** implementation of the fullscreen device monitor for Explorer’s live session capture.

## Purpose

Replaces the basic camera preview UI with an immersive fullscreen monitor that includes:

- Live camera or screen‑share stream (using `useLiveSession` from `src/hooks`)
- App‑shell fullscreen (visual only – never takes ownership of the media stream)
- Real‑time histograms, vectorscope, and audio waveform (both in a side panel and as an optional HUD)
- Monitor overlays: zebra stripes, focus peaking, false color (WebGL shader)
- Device picker (local cameras + remote Explorer camera nodes)
- Camera info modal with session details

## Important contract

This route **does NOT** own the media stream nor the WebRTC publishing logic.  
All of that lives in `page.tsx` via the existing `useLiveSession` hook.

The fullscreen UI receives:

- `videoRef` – the same video element already managed by the session hook
- Raw state strings (`’idle’`, `’previewing’`, `’recording’`, …) – passed as‑is
- Action callbacks (`onStartCamera`, `onStopPreview`, …) that call into the hook

No `useEffect` inside the UI components attempts to start/stop tracks or modify the `MediaStream`.  
The UI is purely a **viewport** and control surface.

## File structure

| File                         | Responsibility                                                                 |
|——————————|———————————————————————————|
| `page.tsx`                   | Route shell – calls `useLiveSession`, holds all WebRTC signalling logic, renders the fullscreen component. |
| `layout.tsx`                 | Next.js layout that imports the global CSS.                                    |
| `FullscreenDevicePreview.tsx`| Main UI component. Receives session state and callbacks. Owns scopes, overlays, fullscreen toggle, idle timers. |
| `DevicePickerSheet.tsx`      | Bottom sheet for selecting local cameras or remote Explorer nodes.             |
| `DeviceCameraInfoModal.tsx`  | Modal displaying camera/session metadata.                                      |
| `DeviceScopesPanel.tsx`      | Right‑side panel with histogram, vectorscope, waveform, and overlay toggles.   |
| `deviceMonitorHooks.ts`      | Route‑local hooks: `useLocalCameras`, `useRemoteCameras`, `useWebGLFx`, telemetry drawing, `useAudioAnalyser`. |
| `deviceMonitorTypes.ts`      | Shared TypeScript interfaces.                                                  |
| `device.css`                 | All styles (scoped to this route, imported by `layout.tsx`).                   |

## Key implementation notes

### State strings (from `useLiveSession`)

The parent `page.tsx` passes the raw `state` string. The UI maps it to booleans:

- `isActive = state === ‘previewing’ || state === ‘recording’`
- `isDeviceRecording = state === ‘recording’`
- `isBusy = state === ‘starting’ || state === ‘requesting-permission’`
- `isError = state === ‘error’`
- `isEnded = state === ‘ended’`
- `isIdle = state === ‘idle’ || state === ‘ended’ || state === ‘error’`

No new state objects are invented.

### Remote node classification

`useRemoteCameras` fetches `/api/nodes` and filters for camera‑capable nodes using:

- `roles` includes `runner` or `capture`
- `capabilities` includes `can_proxy_streams`, `can_record`, `stream`, `record`, `capture`
- `advertised_source_kinds` includes `capture`
- `metadata.session_node === ‘true’` or `metadata.browser_push === ‘true’`

A node is **only** rejected if `enabled === false` (undefined nodes are allowed).

### Audio analyser

Because the `MediaStream` is attached to the `videoRef` and may change without a React state update, `useAudioAnalyser` receives a stream that is polled every 500ms from `videoRef.current.srcObject`. This ensures the audio scope updates when the stream appears or is replaced.

### WebGL FX

The shader is compiled once in `useWebGLFx`. It requires `OES_standard_derivatives`; if unavailable, peaking is disabled but zebra and false color still work. The canvas is stacked above the video (`z-index: 2`).

### Fullscreen

The “⛶” button toggles the **app shell** fullscreen, not the native video fullscreen.  
On browsers that support `Element.requestFullscreen`, it uses the native API; otherwise it falls back to a CSS class that makes `#fullscreen-root` cover the whole viewport.

### CSS scaling

All dimensions use `var(—ui-scale)`. Changing this variable in `device.css` will scale the entire UI (buttons, cards, spacing) proportionally.

## Development notes

- **Do not** add a second `getUserMedia` call. The stream always comes from `useLiveSession`.
- **Do not** add WebRTC logic inside these components. Keep signalling in `page.tsx`.
- **Device‑specific camera selection** is currently a TODO. The “Pick Camera” button calls `onStartCamera()` without passing a device ID. Extending `useLiveSession` to support `startPreview(‘camera’, deviceId)` is the next step.
- **Remote node selection** opens the selected node in a new tab (`/connect/device?node_id=...`). This matches the existing pattern for multi‑device workflows.
- The CSS is **not** imported in `page.tsx` – it is imported once in `layout.tsx` to satisfy Next.js App Router restrictions on global CSS.

## Backward compatibility

This route replaces the old JSX inside `page.tsx` but leaves every hook call, every `useEffect`, and every WebRTC line untouched. Rolling back to the old UI would only require restoring the original `return` statement.