## 2026-05-08 — Guard startLiveSession fetch opener integrity (new)
- [x] Added static contract coverage that `startLiveSession` keeps the durable create `fetch(...)` opener directly after the diagnostics marker.
- [x] Locked regression checks against orphaned `method`, `headers`, `cache`, or `body` request-option blocks floating after `markConnectDeviceBroadcastDebug(...)`.
- [ ] Next validation item: rebuild the deployed Explorer bundle on the LAN host and verify Safari no longer shows the stale `headers:` syntax overlay.

## 2026-05-08 — Repair live-session method block replacement (new)
- [x] Replaced the full `createApiClient` live-session section from `startLiveSession` through `sendLiveSessionControl` with the corrected contiguous object-method block.
- [x] Restored parsed error payload handling for `getLiveSession`, `controlLiveSession`, and `sendLiveSessionControl` while keeping WebRTC/ICE/rendering logic untouched.
- [ ] Next validation item: rebuild the deployed Explorer bundle on the LAN host and verify the stale `method: 'POST'` orphan syntax overlay is gone.

## 2026-05-08 — Repair Explorer API client contract (new)
- [x] Added `ApiClient.getJson` to match the `createApiClient` returned object contract.
- [x] Replaced `startLiveSession` with a single-try durable create flow that records complete diagnostics, classifies auth/create failures, validates `session_id`, and restores `getLiveSession`/`controlLiveSession` method boundaries.
- [x] Extended Explorer static contracts for `getJson`, durable `/api/live_sessions/start` POST shape, method ordering, and stray response-handling regression guards.
- [ ] Next validation item: verify real Connect Device Start Broadcast reports durable create diagnostics without regressing WebRTC viewer/publisher lanes.

## 2026-05-08 — Reapply clean startLiveSession API repair (new)
- [x] Replaced `startLiveSession` in `src/api.ts` again with the full clean compiling method body, including the outer network `try/catch`, complete diagnostics fields, and `requireNodeAuthHeaders` auth-required path.
- [x] Removed unused node-auth imports from `api.ts` so the API wrapper remains thin and easier to inspect during build failures.
- [ ] Next validation item: use the Explorer build output to confirm `src/api.ts` compiles, then resume Connect Device broadcast runtime testing.

## 2026-05-08 — Verify startLiveSession method boundary (new)
- [x] Locked static contracts that `startLiveSession` ends before `getLiveSession`/`controlLiveSession` and contains no loose control-session response handling.
- [x] Reconfirmed `controlLiveSession` remains a standalone API client method after the durable live-session create wrapper.
- [ ] Next validation item: rebuild the LAN Explorer bundle from the latest commit and continue Connect Device runtime testing once the overlay is gone.

## 2026-05-08 — Restore startLiveSession auth-required diagnostics (new)
- [x] Restored `requireNodeAuthHeaders(nodeId)` in `startLiveSession` so missing device auth is classified as `auth_required` before any durable session POST.
- [x] Kept the clean one-method API wrapper shape while extending diagnostics with explicit auth/create failure classes and no helper/spread fragments.
- [ ] Next validation item: rebuild the LAN Explorer bundle and then verify missing node auth reports `broadcastStartFailureClass: auth_required` without publishing an offer.

## 2026-05-08 — Replace startLiveSession method cleanly (new)
- [x] Replaced the entire `startLiveSession` method with a thin API wrapper: one payload, one diagnostics object, one POST fetch, one durable record return.
- [x] Removed the diagnostics helper/spread approach and locked static contracts against orphan spreads, duplicated diagnostics fragments, and `withLiveSessionCreateDiagnostics` calls.
- [ ] Next validation item: rebuild the LAN Explorer bundle from this commit and verify the old line 282-310 syntax overlay is gone.

## 2026-05-08 — Remove live-session diagnostics spreads from API method (new)
- [x] Removed every diagnostics spread from `startLiveSession` and copied diagnostic fields explicitly into `markConnectDeviceBroadcastDebug` payloads so no orphan spread can be emitted by merge edits.
- [x] Updated static contracts to reject both `...liveSessionCreateDiagnostics` and `...getLiveSessionCreateDiagnosticsPatch()` inside the durable start method.
- [ ] Next validation item: rebuild the LAN Explorer bundle and confirm `src/api.ts` no longer reports an expression-expected syntax error near diagnostics.

## 2026-05-08 — Durable live-session API syntax repair (new)
- [x] Refactored `startLiveSession` diagnostics into an assigned `liveSessionCreateDiagnostics` object so diagnostic key/value pairs cannot appear as naked statements in the function body.
- [x] Added static contract checks for the assigned diagnostics object and spread usage around `/api/live_sessions/start`.
- [ ] Next validation item: rerun the Next.js Explorer build on the LAN host and confirm `src/api.ts` no longer reports a syntax failure around `startLiveSession`.

## 2026-05-07 — Connect Device durable live-session creation gate (new)
- [x] Made `useLiveSession.startPreview` rethrow durable `/api/live_sessions/start` failures after preserving the camera preview, so Connect Device can classify auth/create failures and skip WebRTC offer publication.
- [x] Hardened `handleStartBroadcast` ordering around durable session creation: camera ready, durable create, session id validation, runtime/session publication, Explorer refresh, then peer offer.
- [x] Added runtime guards and static contracts proving `publishPeerOffer`, `setActiveRuntimeSession`, and `publishBrowserRuntimeSession` cannot run without a durable `session_id`, while `/api/live` offers remain diagnostic-only.
- [ ] Next validation item: on a real Connect Device tab, clear node auth and confirm Start Broadcast leaves camera preview alive, peer status idle, stage failed, and `broadcastStartFailureClass: auth_required` with no offer posted.

## 2026-05-07 — Durable-only live cards for WebRTC offers (new)
- [x] Kept `/api/live_sessions` as the only source of LiveSourceCard render authority; `/api/live` WebRTC offer inventory now only annotates matching durable session ids.
- [x] Classified `/api/live` offers with no durable record as diagnostic-only `webRtcOnlyOfferSessions` so they cannot use `/api/live_sessions/{id}/signal` and 404/reload-loop as synthetic cards.
- [x] Added Explorer static contracts to lock durable-id-gated WebRTC signal overlays, diagnostic-only WebRTC-only offer ids, and LiveSourceCard rendering exclusively from `livePanelSessions`.
- [ ] Next validation item: reproduce stale `/api/live` offer without durable `/api/live_sessions` record and confirm Explorer debug lists it under `webRtcOnlyOfferSessionIds` while rendering no watchable LiveSourceCard.

## 2026-05-07 — Connect Device single local camera owner (new)
- [x] Consolidated local camera ownership under `useCameraSession`; it remains the only Connect Device module allowed to call `getUserMedia` and owns stream, permission, device inventory, selected/active device ids, start, stop, and refresh.
- [x] Converted `deviceMonitorHooks.useLocalCameras` into passive enumerate-only compatibility inventory with an explicit no-permission-request contract.
- [x] Updated `FullscreenDevicePreview` to use `cameraState.devices` and `cameraState.permission` as canonical local camera picker/permission inputs, avoiding a second local camera surface.
- [x] Added static contracts covering the single local camera owner model and docs/readme guard against a second monitor-hook `getUserMedia` path.
- [ ] Next validation item: on iPhone Safari, search for `getUserMedia(` should show only `useCameraSession` and non-runtime docs/tests, then confirm camera labels refresh after explicit camera start.

## 2026-05-07 — Connect Device monitor controls + broadcast creation diagnostics (new)
- [x] Restored Connect Device monitor top/bottom controls from active local `MediaStream` ownership instead of live-session state, so camera-ready previews keep Record/Start Broadcast/Fullscreen/Explorer/Switch controls visible even when no session exists.
- [x] Restricted Stop Broadcast visibility to real broadcast sessions and changed stop handling to close publisher/polling/session bookkeeping without stopping the local camera preview.
- [x] Hardened broadcast start so live-session creation failures are classified before peer creation, publish/runtime registration are skipped without `session_id`, Explorer refresh fires only after session/offer success, and `__connectDeviceBroadcastDebug` records create-attempt diagnostics.
- [x] Updated Explorer static contracts for stream-owned monitor controls, stop-broadcast camera preservation, live-session creation failure diagnostics, and session-id-gated publish/runtime registration.
- [ ] Next validation item: on iPhone Safari with missing/bad node auth, confirm `Heartbeat: auth_failed` remains badge-only while the local camera monitor controls stay visible and Start Broadcast reports `live_session_create_failed`/`auth_failed` diagnostics.

## 2026-05-07 — Connect Device publisher sender-bound offer patch (new)
- [x] Refactored Connect Device publisher transceiver setup so live camera/audio `MediaStreamTrack`s are passed directly to `peer.addTransceiver(track, { direction: 'sendonly', streams: [stream] })` before `createOffer()`.
- [x] Updated publisher track reconciliation to match transceivers by `sender.track?.kind` first, fall back to receiver kind only when needed, force `sendonly`, and `replaceTrack(track)` whenever the active sender track id differs.
- [x] Added publisher sender binding diagnostics (`publisherVideoSenderTrackId`, `publisherAudioSenderTrackId`, `publisherVideoSenderReadyState`, `publisherVideoSenderEnabled`, `publisherSenderBoundBeforeOffer`, `offerHasVideoSendonly`, `offerHasAudioSendonly`) to prove RTP senders are bound before offer publication.
- [x] Changed Stop Broadcast to close the WebRTC publisher and stop preview bookkeeping without calling `stopCamera()`, preserving the camera track for live RTP debugging/rebroadcast.
- [ ] Next validation item: on iPhone, confirm publisher `senderTrackIds` includes the live camera video track before offer creation and Explorer moves from `video_receiver_exists_but_no_inbound_rtp` to inbound video bytes/decoded frames.

## 2026-05-07 — Explorer WebRTC viewer composite stream assembly (new)
- [x] Changed `LiveSourceCard` viewer media authority to maintain one actor-owned composite `MediaStream` and reconcile it from `RTCPeerConnection.getReceivers()` plus `ontrack`, instead of trusting `event.streams[0]` as preview source truth.
- [x] Rebound top preview and peer video surfaces from the composite stream across `setRemoteDescription`, `ontrack`, answer confirmation, and RTP stats polling so audio-only partial streams cannot replace the displayed video stream.
- [x] Guarded viewer recvonly transceiver creation by missing media kind and only adds fallback recvonly transceivers when the incoming offer lacks that media section, preventing duplicate video/audio receiver pairs after remote offer application.
- [x] Added diagnostics for composite track counts/ids, receiver track kinds/ids, live/ended video receiver counts, attach reason, `receiver_video_not_in_composite_stream`, and `video_receiver_exists_but_no_inbound_rtp`.
- [ ] Next validation item: on the real iPhone + Explorer flow, confirm `remoteCompositeVideoTrackCount > 0`, `liveVideoTrackCount > 0`, `inboundVideoBytesReceived > 0`, and `inboundVideoFramesDecoded > 0` with no duplicate viewer receiver pairs.

## 2026-05-07 — WebRTC stale live-session pruning + rendered-frame success gate (new)
- [x] Added `LiveSessionService.prune_stale_sessions(...)` to end active preview/recording/waiting/connected sessions whose heartbeat exceeds the live-session TTL and clear their signal state without resurrecting superseded sessions.
- [x] Wired stale-session pruning through durable live-session list/start routes and WebRTC `/api/live` listing so stale durable sessions remove their bridged WebRTC runtime entries.
- [x] Hardened `/api/live/{session_id}/offer` to remove older same-node WebRTC transport shells before publishing the current offer, keeping one visible canonical live surface per device node.
- [x] Added backend coverage for explicit service pruning, durable/WebRTC bridge pruning, stale metadata, and fresh-session preservation.
- [ ] Next validation item: with one Device tab and one Explorer tab, `/api/live` should report one current session for the node after TTL cleanup; then verify Explorer only enables preview success when `decodedFramesRenderable=true` and visible video layout dimensions are nonzero.

## 2026-05-07 — Explorer WebRTC visible video surface patch (new)
- [x] Routed decoded WebRTC `MediaStream` playback through a real visible `<video>` in the top Live preview whenever a remote stream or track exists, keeping chunk-preview `<img>` fallback only for non-WebRTC preview chunks.
- [x] Added one shared viewer video callback ref that applies Safari-safe video attributes before assigning `srcObject`, reuses existing stream attachments, avoids `video.load()`, and keeps tap-to-play retry on the attached stream.
- [x] Added render-surface diagnostics (`topPreviewUsesVideo`, mounted/layout/computed style fields, `decodedFramesRenderable`, and `renderSurfaceFailureReason`) so decoded-frame paint failures can be diagnosed without relying only on `videoWidth`/`videoHeight`.
- [x] Updated Explorer static contracts to lock the visible top-preview video path, no-load invariant, decoded-frame renderability marker, peer video diagnostics, and non-dimension-only renderability classification.
- [ ] Next validation item: on real Safari/iPhone, confirm `__explorerViewerPeerDebug.topPreviewUsesVideo=true`, `peerVideoMounted=true`, non-zero peer video layout dimensions, `decodedFramesRenderable=true`, and `mediaFailureClass=frames_rendering`.

## 2026-05-07 — WebRTC live preview RTP delivery before recording work (new)
- [x] Added explicit publisher sendonly video/audio transceivers before offer creation and replaced tracks through transceiver senders instead of falling back to generic `addTrack(...)`.
- [x] Added explicit Explorer viewer recvonly video/audio transceivers before applying the device offer so answer negotiation has stable receive m-lines.
- [x] Added SDP/transceiver/sender/receiver diagnostics for offer/answer directions, track ids, current directions, and RTP counters in publisher/viewer debug objects.
- [x] Disabled recording controls until live video rendering is proven; recording implementation remains intentionally untouched.
- [ ] Next validation item: confirm Explorer viewer reports inboundVideoBytesReceived > 0, inboundVideoFramesDecoded > 0, and mediaFailureClass=frames_rendering before enabling any device-owned recording command lane work.

## 2026-05-06 — WebRTC ICE candidate ordering and role-correct application (new)
- [x] Added shared ICE helpers for candidate keys, candidate type extraction, safe `addIceCandidate(...)`, and selected candidate-pair stats summarization.
- [x] Explorer viewer now queues device ICE until the remote offer is applied, dedupes by candidate key, flushes after `setRemoteDescription(offer)`, and keeps polling/applying device ICE without failing just because playback has not rendered.
- [x] Connect Device publisher now queues viewer ICE until the remote answer is applied, dedupes by candidate key, flushes after `setRemoteDescription(answer)`, and keeps polling after answer application until connected/failed/stopped.
- [x] Added viewer/publisher ICE debug counters for received/applied/queued/error candidates plus selected candidate pair and local/remote candidate types.
- [ ] Next validation item: inspect `__explorerViewerPeerDebug.deviceIceReceivedCount/deviceIceAppliedCount` and `__connectDevicePublisherPeerDebug.viewerIceReceivedCount/viewerIceAppliedCount`; both applied counts must be greater than zero before investigating TURN/STUN/network policy.

## 2026-05-06 — Safari WebRTC playback boundary and RTP diagnostics (new)
- [x] Added Explorer viewer inbound RTP stats in `window.__explorerViewerPeerDebug` so real Safari runs can distinguish attached tracks with no RTP from RTP with no decoded/rendered frames.
- [x] Added Connect Device publisher outbound RTP stats in `window.__connectDevicePublisherPeerDebug` with publisher media classification for no outbound RTP, flowing RTP, and non-live local camera tracks.
- [x] Made Safari/iOS `AbortError` playback rejection retryable: signaling stays `answer_confirmed`, media stays `track_attached`, ICE stays connected, the remote stream remains attached, and the UI prompts `Tap to play live stream`.
- [x] Stabilized remote `MediaStream` attachment with Safari-safe muted/autoplay/playsinline attributes, stream-id reuse checks before `srcObject` reassignment, no MediaStream `load()`, and `lastSrcObjectAssignedAt` diagnostics.
- [ ] Next validation item: inspect `__explorerViewerPeerDebug` and `__connectDevicePublisherPeerDebug` to classify `track_attached_but_no_rtp`, `rtp_receiving_but_no_frames_decoded`, `frames_decoded_but_video_play_rejected`, `video_play_interrupted_by_srcobject_reset`, or `frames_rendering`.

## 2026-05-06 — WebRTC media-plane boundary hardening after answer confirmation (new)
- [x] Split Explorer viewer peer truth into signaling/media/playback/ICE lanes so answer confirmation no longer collapses later media failures into a generic publisher-failed label.
- [x] Hardened remote track attachment with stream-id/live-track diagnostics, Safari-safe video attributes, exact play rejection name/message telemetry, and a tap-to-play retry path that keeps the stream attached after playback rejection.
- [x] Added media-plane failure markers (`remote_track_not_emitted`, `video_src_object_not_set`, `video_has_no_live_tracks`, `video_ready_state_zero`, `video_playback_failed`, `peer_ice_failed_before_track`, `ice_exchange_failed`) to Explorer viewer diagnostics.
- [x] Hardened Connect Device publisher debug with `peerClosedBy` and answer-applied reuse so an answered publisher peer is not closed/recreated by a republish path unless the user explicitly stops or starts a new session.
- [ ] Validate on real iPhone Safari whether the next failure lands in ICE (`peer_ice_failed_before_track`/`ice_exchange_failed`) or playback (`video_playback_failed` with rejection name/message).

## 2026-05-05 — Canonical live-session authority + peer actor stability patch (new)
- [x] Added centralized `selectPrimaryLiveSessionForNodeSource` / `selectPrimaryLiveSessionsByNodeSource` contracts that reject runtime viewer events, ended/failed/superseded/stale sessions, and preserve older offered sessions over newer no-offer shells.
- [x] Routed Explorer live panel, live merge diagnostics, WebRTC/live hooks, and Live Device Instances through the canonical selector so node_id/source_kind surfaces share the same selected session id.
- [x] Stabilized `LiveSourceCard` viewer actors around `session_id::viewer_id::reconnectGeneration`, sticky offer-seen state, callback refs, and non-regressing answer-confirmed labels/debug.
- [x] Stabilized Connect Device publisher debug/republish behavior around a session-owned publisher actor and reused the current active session for explicit republish instead of silently creating a replacement no-offer shell.
- [x] Hardened backend live-session heartbeat so superseded/ended sessions cannot be resurrected as active candidates.
- [ ] Validate on real iPhone that one node_id/source_kind keeps exactly one primary LIVE card through answer_confirmed -> track_attached -> playing and that Republish does not create a blank no-offer replacement card.

## 2026-05-05 — Stabilize live WebRTC publisher/viewer peer lifecycle (new)
- [x] Hardened Connect Device publisher peer ownership so one session-owned RTCPeerConnection publishes offer, polls `/signal`, applies viewer answers, consumes viewer ICE once, and only marks connected from peer/ICE connection state.
- [x] Added `window.__connectDevicePublisherPeerDebug` with stream, track, offer, answer, ICE, state, polling-loop, active-peer, and failure diagnostics.
- [x] Hardened Explorer viewer peer ownership so answer publication, answer confirmation, device ICE, remote tracks, video metadata/canplay/playing, and concrete failure reasons are tracked separately.
- [x] Added `window.__explorerViewerPeerDebug` and status lanes that keep signaling (`answer_confirmed`) separate from media (`track_attached`/`playing`).
- [x] Backend now supersedes older active sessions for the same `node_id` + `source_kind` when a new live session starts, preserving old sessions as ended diagnostics/history.
- [x] Added static peer-lifecycle contracts plus backend supersession coverage.
- [ ] Next: complete media-plane attach so one active iPhone Capture Node session reaches:
  - device publisher: answer_applied -> connected
  - Explorer viewer: answer_confirmed -> track_attached -> playing
  - primary LIVE panel: one card for node_id/source_kind
  - no black preview when peer state says connected
  - old sessions only visible in diagnostics/history, not primary LIVE cards

## 2026-05-05 — Separate live sessions from viewer runtime events (new)
- [x] Added strict Explorer live-session guards so `viewer_answer`, `viewer_state`, ICE, and other runtime event payloads cannot be accepted as durable `LiveSessionRecord` data.
- [x] Changed the Explorer live panel to render only canonical durable `/api/live_sessions` records, with runtime viewer events stored as per-session diagnostics/activity only.
- [x] Added `window.__explorerLiveMergeDebug` diagnostics for canonical/rendered/runtime-event session ids, rejected event payloads, preferred node/source sessions, and viewer state by session/viewer.
- [x] Updated live-session details to use the canonical durable session payload and show runtime activity separately instead of replacing details with latest viewer events.
- [x] Added static Explorer contracts locking runtime-event rejection, dedupe/preference behavior, diagnostics, and canonical details ownership.
- [ ] Validate real iPhone flow: one current Capture Node live card remains while viewer disconnected/reconnect events appear only in runtime activity diagnostics.

## 2026-05-05 — Explorer live panel rendering and previewability fix (new)
- [x] Restored Explorer live panel rendering from the merged durable `/api/live_sessions` + WebRTC signal-session lanes so active offer sessions render even when durable preview chunks are absent.
- [x] Changed live panel/card previewability indicators to use session/offer/answer/viewer signal availability instead of `latest_chunk_path` or `/preview/latest` success.
- [x] Added `window.__explorerLivePanelDebug` diagnostics for rendered session ids, hidden reason, selected peer session, preview chunk status, and WebRTC preview availability.
- [x] Added Explorer static contracts locking live-panel rendering against `latest_chunk_path: null` and preview-204 regressions.
- [ ] Validate real iPhone flow: Start Live Broadcast creates a rendered Live card with `offer:yes` and Watch Live available before any recording chunk exists.

## 2026-05-05 — Durable live-session registry and device-auth lane fix (new)
- [x] Restored device-lane auth headers for live offer, device ICE, heartbeat, chunk upload, and end-session calls so active sessions are not pruned after unauthorized heartbeats.
- [x] Added live-session owner debug headers (`X-Live-Session-Registry-Id`, service id, service-registry id) across start/read/signal/heartbeat routes for registry identity proof.
- [x] Added backend continuity coverage proving start, read, signal offer/answer/ICE, heartbeat, and post-heartbeat read all use the same live-session registry and do not 404 a new session.
- [x] Added Explorer stale-session drop handling so 404 signal/answer/ICE responses close the peer, clear polling, remove the session locally, and refresh live lanes.
- [ ] Validate real iPhone flow: after `peer:api-live-confirmed`, `/api/live_sessions/{session_id}` and `/signal` remain 200 with matching registry debug headers.

## 2026-05-05 — Device live-session start POST regression fix (new)
- [x] Restored `startLiveSession(...)` to include node bearer headers on `POST /api/live_sessions/start` and added start-method/url/status diagnostics.
- [x] Guarded `getLiveSession('start')` with `invalid_get_live_session_start` diagnostics so the start sentinel cannot be fetched as a durable session id.
- [x] Threaded Connect Device broadcast diagnostics for `cameraStreamResolved`, `startLiveSessionSessionId`, `broadcastStatus`, and live video track counts.
- [x] Added Explorer static contracts preventing GET `/api/live_sessions/start`, `getLiveSession('start')`, and missing device auth on start.
- [ ] Validate real iPhone flow: `/api/live_sessions/start` is POST 200/JSON, Explorer summary returns to 1 live WebRTC session, and Watch Live appears after offer publication.

## 2026-05-05 — Viewer lane + device stream ownership closure (new)
- [x] Locked Explorer Watch Live to GET `/signal`, POST `/signal/answer`, POST viewer `/signal/ice`, and added static contracts preventing GET `/signal/answer` or viewer heartbeat leakage.
- [x] Added `window.__explorerLiveFlowDebug` viewer attach diagnostics for clicked session, offer/answer state, viewer ID, track counts, video playback, and precise failure reasons.
- [x] Made Connect Device broadcast stream resolution idempotent across camera state and `videoRef.current.srcObject`, with live-track validation before publishing offers.
- [x] Replaced `camera_stream_not_ready` throw with controlled broadcast failure state and `window.__connectDeviceBroadcastDebug` stream ownership diagnostics.
- [ ] Validate real iPhone flow: Start Live Broadcast never opens Next.js runtime overlay, and Explorer Watch Live flips answer yes with either `playing` or concrete failureReason.

## 2026-05-05 — Watch Live end-to-end activation hardening (new)
- [x] Changed `openLivePeerViewer` to hydrate the durable `/api/live_sessions/{id}` record immediately and then reload both durable + WebRTC lanes so Watch Live always has an active `LiveSourceCard` mount target.
- [x] Upgraded `LiveSourceCard` viewer peer lifecycle states to explicit lane markers (`waiting_for_offer`, `answering`, `answered`, `connected`, `playing`, `failed`) with inline diagnostics.
- [x] Added immediate signal poll on peer enable and explicit answer-post confirmation marker so answer publishing is not delayed to a later interval tick.
- [x] Stopped `/preview/latest` polling for non-recording/no-chunk sessions to eliminate repeated 404 preview spam while waiting for viewer attach.
- [ ] Validate on iPhone Safari: Watch Live must flip `answer:no -> answer:yes` for the same session and show either `playing` or a concrete `diag:` reason.

## 2026-05-05 — Explorer live viewer answer auth hardening (new)
- [x] Removed node-auth header injection from Explorer viewer answer publication (`publishLiveSignalAnswer`) so browser viewers can post answers without stale/invalid node bearer collisions.
- [x] Limited viewer ICE publish headers to unauthenticated viewer lane (`role: viewer`), keeping node-auth enforcement only for device ICE lane.
- [x] Updated `LiveSourceCard` viewer signaling calls to use the viewer lane signatures (no device node-id auth coupling).
- [ ] Validate on-device that `Watch Live` flips session signal from `answer:no` to `answer:yes` for the same `session_id` without 401s on answer/ICE publish.

## 2026-05-03 — Stabilize Explorer and Connect Device tab ownership
- [x] Changed stable semantic window names to colon-namespaced format: `thatdamtoolbox:explorer` and `thatdamtoolbox:connect-device`.
- [x] Introduced typed `BrowserRuntimeUiMessage` discriminated union replacing untyped `Record<string, unknown>` channel messages.
- [x] Added `open-request` message type so Explorer can announce a device open before the named window is created/focused.
- [x] `registerWindowName` now sets both `window.name` and `sessionStorage` tab role, then posts `tab-active` with windowName + path.
- [x] Explorer re-registers on `focus` to handle tab reuse across navigations.
- [x] Connect Device re-registers on `focus` and responds to `open-request` by publishing `tab-active`.
- [x] `publishBrowserRuntimeTabActive` includes `windowName` and `path` in the message for diagnostics.
- [x] `openDeviceTab` and `openExplorerTab` now post `open-request` before calling `window.open`.
- [x] `subscribeBrowserRuntimeChannel` typed to `BrowserRuntimeUiMessage` instead of `any`.
- [ ] Next: remove token-bearing query strings from named-window navigation once local identity handoff is fully stable.

## 2026-05-02 — Fix Connect Device render after sidebar extraction
- [x] Restored `/connect/device` runtime render by re-adding missing `useCallback` import in `app/connect/device/page.tsx`.
- [x] Verified route static contracts pass with connect-device stack intact.
- [x] Visual verification note carried forward: capture Playwright screenshots for Explorer sidebar / Connect Device / Live Device cards / Live Preview when available.
- [ ] Next: stabilize live device card session visibility against real viewer attach lifecycle.

## 2026-05-02 — Stabilize live device session visibility contracts
- [x] Hardened `buildLiveDeviceInstances` session-state parsing to accept both `has_offer`/`has_answer` booleans and `offer/answer.sdp` payloads.
- [x] Preserved watch-live gating on merged instance visibility using normalized session signal fields.
- [x] Added static contract coverage for mixed live-session signal field compatibility.
- [x] Added visual verification note for future UI/layout patches: capture Playwright screenshots for Explorer sidebar, Connect Device page, Live Device Instance cards, and Live Preview panel when available.
- [ ] Next: wire Watch Live visibility to explicit viewer attach state diagnostics in source-control cards.

## 2026-05-02 — Extract Explorer source-control sidebar panels
- [x] Moved source-control sidebar rendering out of `ExplorerApp.tsx` into `src/source-control/` components.
- [x] Moved live device merge logic into pure `buildLiveDeviceInstances(...)` helper.
- [x] Preserved ExplorerApp ownership of data loading, SSE application, and scheduler paths.
- [x] Kept sidebar behavior/placement unchanged with no new fetch paths.
- [ ] Next: stabilize live device state + WebRTC session visibility.

### Latest Implementation Notes (2026-05-02)
- [x] Completed `/connect/register` persistence event alignment: connect register now emits `node.updated` and `source.updated` after node/source persistence succeeds.
- [x] Hardened runtime-events backend test to assert node/source event payload ownership (`node_id`, `owner_node_id`) instead of only checking history length growth.
- [x] Updated Explorer static contracts to enforce orchestration-only connect-device page (no direct `api.listNodes()` and no direct `registerBrowserRuntime(...)` call).
- [ ] Next pass: add a narrow unit test around `syncBrowserRuntimeNode(...)` error-path marker transitions (`list-nodes` -> `failed`) under fetch exceptions.

### Latest Implementation Notes (2026-05-02)
- [x] Fixed BrowserRuntimeClient sync/register persistence path: sync now checks backend `/api/nodes`, registers missing node via `/connect/register`, then heartbeats.
- [x] Added browser-runtime sync telemetry fields (`lastRegisterStatus`, `lastRegisterNodeId`, `lastSyncPhase`, `lastSyncError`) to `window.__browserRuntimeDebug`.
- [x] Added backend event/persistence test for `/connect/register` ensuring `/api/nodes` + `/api/sources` creation and `node.updated`/`source.updated` event emission.
- [ ] Next pass: add dedicated BrowserRuntimeClient unit tests around register retry/backoff behavior for transient network failures.

### Latest Implementation Notes (2026-05-02)
- [x] Added WebRTC Explorer/device contract tests to lock BrowserRuntimeClient authority, centralized auth/header seams, and live-instance action gating (`Watch Live` only when offer+answer).
- [x] Added backend cohesion tests for live-session/runtime-asset alignment and live session serialization field compatibility (`viewer_count`, recording fields, session/node linkage).
- [ ] Next pass: add focused sidecar unit tests for BrowserRuntimeClient edge-cases (token_preview rejection, node-specific-vs-generic precedence, unavailable network paths) without relying on static source assertions alone.

### Latest Implementation Notes (2026-05-02)
- [x] Introduced BrowserRuntimeClient seam in `browserRuntimeIdentity.ts` (`resolveBrowserRuntimeAuth`, `buildNodeAuthHeaders`, `heartbeatBrowserRuntime`, `registerBrowserRuntime`, `syncBrowserRuntimeNode`) so auth/heartbeat behavior is centralized.
- [x] Connect-device page now orchestrates via BrowserRuntimeClient sync/register calls and no longer reads stored tokens directly or assembles heartbeat auth headers.
- [x] Added browser runtime diagnostics surface (`window.__browserRuntimeDebug`) without exposing bearer token values.
- [ ] Next pass: extract Explorer source-control sidebar panels into dedicated view-model/components after this auth seam stabilizes.

### Latest Implementation Notes (2026-05-02)
- [x] Removed fallback heartbeat token lane from connect-device (`readDeviceBearerToken`) so heartbeat auth now remains strictly node-scoped via `getStoredNodeToken(nodeId)`.
- [x] Added static contract guard to prevent reintroduction of credential-fallback bearer sourcing in connect-device heartbeat path.
- [ ] Next pass: capture one browser verification trace that heartbeat auth uses node-scoped token only across tab refresh + reconnect.

### Latest Implementation Notes (2026-05-01)
- [x] Fixed browser-device heartbeat auth path to prefer node-scoped stored tokens and send explicit `Authorization: Bearer` + `X-Media-Sync-Node-Id` headers for heartbeat requests.
- [x] Added device-side auth diagnostics (`node-sync:auth-debug`) with source/length metadata only (never token value), and mapped heartbeat 401/403 to `auth_failed` status without tearing down camera/local identity.
- [x] Hardened named-tab routing behavior with blocked-popup fallback navigation while preserving dedicated Explorer/Device window names.
- [x] Reorganized sidebar runtime surfaces for mobile inspection: live device instances remain first, canonical/remote/runtime sections are collapsible, and live cards expose auth_failed/status/watch/open actions.
- [ ] Next pass: validate offer/answer/ICE media path after auth/layout cleanup (this pass does not claim WebRTC media flow resolution).

### Latest Implementation Notes (2026-05-01)
- [x] Quieted SSE reconnect noise in `useRuntimeEvents`: `EventSource.CONNECTING` now updates reconnect diagnostics and returns early without warning/throw/event dispatch.
- [x] Restricted `[runtime-events:error]` warnings to hard-closed streams (`EventSource.CLOSED`) with a 10-second throttle to prevent reconnect-loop log spam.
- [x] Expanded Explorer static contracts to lock CONNECTING early-return behavior, CLOSED-gated warning policy, reconnect diagnostics, and no-throw onerror handling.
- [ ] Next pass: add browser-run assertion capture proving CONNECTING churn preserves `eventStreamConnected:true` + `eventStreamReconnecting:true` without repeated console warnings.

### Latest Implementation Notes (2026-05-01)
- [x] Added live-flow milestone diagnostics across Connect Device + Explorer runtime apply path via shared `window.__explorerLiveFlowDebug` markers (`deviceBroadcastRequestedAt`, `deviceCameraReadyAt`, `deviceBroadcastPublishedAt`, `lastLiveSessionUpdatedAt`, `appliedLiveSessionUpdates`).
- [x] Preserved event-driven authority: live session sidebar state still updates directly from `live_session.updated` application path while now exposing explicit milestone timestamps for runtime triage.
- [x] Extended Explorer static contracts to lock live-flow marker wiring in both connect-device broadcast start and Explorer SSE apply lanes.
- [ ] Next pass: add runtime UI assertion that sidebar live instance card renders when `appliedLiveSessionUpdates > 0` and a matching session payload includes `has_offer`.

### Latest Implementation Notes (2026-05-01)
- [x] Classified startup opaque browser noise in Explorer dev diagnostics: `window:error` now suppresses un-attributable cross-context `Script error.` events (`filename:null`, `lineno:0`) so console triage focuses on actionable app/runtime faults.
- [x] Added explicit dev-only SSE lane tagging in `useRuntimeEvents` (`[runtime-events:error]` with `readyState` + normalized event type) while keeping `EventSource.onerror` side-effect-only (no throw/reject lanes).
- [x] Expanded Explorer static contracts to lock opaque-script suppression and SSE error-tag diagnostics, plus the existing null-throw/reject guards.
- [ ] Next pass: remove remaining non-authoritative fallback background fetch lanes so refresh authority is limited to `initial`, `manual`, and `sse-recovery` triggers.

## 2026-05-01 — Keep runtime SSE stream open through proxy buffering
- [x] Ensured SSE emits immediate connected comment and heartbeat comments every 5s with double-newline framing.
- [x] Added flush-friendly `await asyncio.sleep(0)` yield points after event/heartbeat frames.
- [x] Added clean `asyncio.CancelledError` handling in SSE generator to avoid noisy disconnect errors.
- [x] Preserved proxy headers for streaming stability (`no-cache, no-transform`, `keep-alive`, `X-Accel-Buffering: no`).
- [x] Updated frontend EventSource diagnostics so CONNECTING is tracked as reconnecting (not hard disconnected), CLOSED flips `eventStreamConnected=false`.
- [ ] Follow-up: add browser-runtime integration test that asserts stable `eventStreamConnected` under 60s idle soak.

## 2026-05-01 — Remove remaining direct Explorer observability fetch loops
- [x] Made source-control and WebRTC hooks passive by default (`initialLoad: false`, `poll: false`) so they no longer self-bootstrap fetch loops outside scheduler ownership.
- [x] Replaced direct sidebar/manual reload callsites with allowlisted scheduler refresh (`manual`) ownership.
- [x] Added observability lane tracer logs (`[OBSERVABILITY FETCH] lane reason`) inside the scheduler-owned full refresh path for runtime diagnostics.
- [x] Kept full observability fetches scoped to allowlisted reasons (`initial`, `manual`, `sse-recovery`).
- [ ] Follow-up: add explicit browser-level assertion that `/api/sources` + `/api/nodes` + `/api/live` stay quiet during idle SSE steady state.

## 2026-05-01 — Remove shouldPollLiveSurface dependency after SSE transition
- [x] Eliminated remaining runtime references to `shouldPollLiveSurface` across Explorer refresh and recording/pending hooks.
- [x] Replaced legacy helper checks with local visibility guards (`document.visibilityState === 'hidden'`) plus explicit `enabled` gating.
- [x] Fixed runtime crash path (`ReferenceError: shouldPollLiveSurface`) that prevented SSE diagnostics from stabilizing.
- [x] Updated static contracts to assert visibility-guard behavior instead of legacy polling helper usage.
- [ ] Follow-up: remove redundant legacy polling helper modules once no external imports remain.

## 2026-05-01 — Stabilize runtime SSE keepalive and connection diagnostics
- [x] Lowered runtime SSE heartbeat interval to 5s and kept valid comment heartbeat framing (`: heartbeat\\n\\n`) to prevent ~20s connection churn.
- [x] Added SSE response keepalive headers (`no-cache, no-transform`, `keep-alive`, `X-Accel-Buffering: no`) for proxy/mobile stability.
- [x] Expanded `useRuntimeEvents` diagnostics: `onopen`/message/error now publish connection state + timing + readyState/url into `__explorerPollingDebug`.
- [x] Preserved EventSource reconnect behavior while keeping singleton guard from creating duplicate concurrent streams.
- [ ] Follow-up: add runtime test coverage for reconnect semantics under forced transport interruption.

## 2026-05-01 — Remove remaining refresh triggers and idle polling after SSE adoption
- [x] Added explicit refresh-trigger diagnostics (`[REFRESH TRIGGER]` / `[BLOCKED REFRESH]`) in Explorer refresh scheduler.
- [x] Hard-blocked non-authorized refresh reasons so only `initial`, `manual`, and `sse-recovery` can perform full fanout refresh.
- [x] Converted Explorer startup refresh to explicit `initial` scheduler path for consistent instrumentation + gating.
- [x] Kept direct SSE event application as the normal update lane and preserved recovery-only full refresh behavior.
- [ ] Follow-up: add focused runtime e2e network-idle assertion (single `/api/runtime/events`, no idle fanout requests) in browser automation suite.

## 2026-05-01 — Apply SSE events directly to Explorer state
- [x] Replaced normal SSE -> full refresh fanout path with direct Explorer state application for node/source/live session/runtime asset/recording/ingest claim events.
- [x] Added runtime event burst queue (`50ms` flush) to coalesce rapid SSE updates into single state-application lanes.
- [x] Kept full refresh restricted to initial/manual/recovery (`reconnect`, `missed_sequence`, `snapshot_required`) paths only.
- [x] Preserved BroadcastChannel runtime event fanout and expanded debug counters (`refreshCount`, `eventApplyCount`) without reintroducing idle loops.
- [ ] Follow-up: map runtime-asset/recording event payloads into richer typed pending placeholder reducers (less generic record merge).

## 2026-05-01 — Replace Explorer observability polling with runtime event stream
- [x] Added runtime-owned SSE event stream endpoint (`/api/runtime/events`) backed by `RuntimeEventBus` replay + heartbeat support.
- [x] Published node/source/live-session/runtime-asset/recording update events from existing mutation paths.
- [x] Wired Explorer to a single EventSource connection and guarded against duplicate stream opens per tab.
- [x] Converted idle observability polling to fallback-only refresh triggers (initial load + event-triggered refresh).
- [x] Added BroadcastChannel runtime event fanout (`thatdamtoolbox-ui`) from Explorer to satellite tabs.
- [ ] Follow-up: apply events directly into normalized frontend stores instead of triggering refresh fetches.

## 2026-05-01 — Enforce single Explorer and Connect Device tab ownership
- [x] Reused stable named window targets for Explorer and Connect Device tabs (`thatdamtoolbox-explorer`, `thatdamtoolbox-connect-device`) and routed open/focus flows through shared identity helpers.
- [x] Added explicit `window.name` self-registration on Explorer and Connect Device mount to lock tab identity.
- [x] Extended BroadcastChannel coordination on `thatdamtoolbox-ui` with `tab-active` and `request-refresh` messages.
- [x] Connect Device now emits mount/focus activity (`tab-active`) and requests Explorer refresh (`request-refresh`) without adding polling loops.
- [x] Explorer channel listener now handles device refresh requests via `scheduleExplorerObservabilityRefresh(reason, 0)` and records dev debug markers (`lastTabSeen`, `lastTabInteraction`).
- [x] Kept polling ownership centralized in Explorer; no new intervals added in device tab.
- [ ] Follow-up: lock device tab into fully event-driven mode for control-plane updates (remove residual passive poll dependencies).

## 2026-05-01 — Fix FullscreenDevicePreview maximum update depth loop
- [x] Guarded mode/camera-derived controls updates with idempotent `setControlsOpen` callback (`current === next` short-circuit).
- [x] Removed unstable object dependency usage from controls effect and replaced with scalar state markers.
- [x] Preserved Local preview controls auto-hide/open behavior without repeated render-loop state churn.
- [x] Preserved Remote mode controls availability without uncontrolled setState loops.
- [ ] Follow-up: continue device control-plane registration/polling hardening after render-loop stability is verified on-device.

## 2026-05-01 — Stop device control-plane spam and restore registered device observability
- [x] Prevented `/connect/device` Local mode from continuously polling `/api/nodes` by mode-aware polling guard in device monitor hooks.
- [x] Kept remote-node polling for Remote mode or explicit remote picker use, throttled to 10s and visibility-gated.
- [x] Added `/connect/device` bootstrap node sync (`listNodes` + conditional `registerNode` + heartbeat) so local identity is reconciled with backend authority.
- [x] Preserved local camera preview flow independent of continuous node polling.
- [ ] Follow-up: replace remaining control-plane polling with runtime event stream / BroadcastChannel fanout.

## 2026-05-01 — Throttle recording + node observability polling and toast noise
- [x] Stopped `kind=live` runtime assets from mapping into pending recording overlay lane.
- [x] Added recording intent-gated failure toasts so background/polling churn no longer emits global `Recording failed`.
- [x] Added `enabled` gate to `useRecordingSessions` polling and silenced polling/load failures from user-facing recording error toast path.
- [x] Replaced overlapping control-plane refresh triggers with debounced `scheduleControlPlaneRefresh(...)` and raised interval floor to 10s.
- [ ] Follow-up: add dedicated live-preview placeholder lane for `RuntimeAsset.kind=live` separate from recording UX.

## 2026-04-30 — Restore live device instance cards in Explorer sidebar
- [x] Added combined `LiveDeviceInstance` view model in `ExplorerApp`.
- [x] Merged node/source/live/runtime lanes by `node_id` and `session_id` overlays.
- [x] Rendered `LIVE DEVICE INSTANCES` cards without replacing existing Canonical/Remote/Registered runtime sections.
- [x] Preserved persisted library/snapshot assets and existing sidebar ownership lanes.
- [ ] Follow-up: wire Watch Live card action into full viewer attach flow parity path.

## 2026-04-30 — External-stream continuity hardening for live-session bootstrap
- [x] Prevented `useLiveSession.startPreview` from stopping existing camera tracks when an external stream is provided by connect-device flow.
- [x] Added explicit `hasExternalStream` guard so camera-track stop and `stopTracks()` cleanup run only for internally-owned stream acquisition lanes.
- [x] Preserved stream-ref continuity for externally-provided stream reuse to keep local preview alive through broadcast/session bootstrap.
- [ ] Follow-up: add focused browser runtime test that simulates `startLiveSession` failure while asserting external preview stream remains active.

## 2026-04-30 — Connect-device last-mile correctness + control-plane resilience
- [x] Removed remaining connect-device broadcast stream null fallback ambiguity by hard-failing with `camera_stream_not_ready` after enable/reacquire.
- [x] Kept all broadcast continuation lanes scoped to local `stream` binding after `existingStream` capture.
- [x] Heartbeat token resolution now prefers shared browser-runtime identity token lookup (`getStoredNodeToken`) with legacy credential fallback.
- [x] Local monitor overlay now hides live-broadcast CTA in Local mode so camera-preview-first UX is not blocked by remote controls.
- [x] Source-control refresh now uses `Promise.allSettled` and preserves last good nodes/sources data on partial failures.
- [ ] Follow-up: add a focused runtime integration test for connect-device heartbeat token continuity across fresh-tab open + stripped query auth.
- [ ] Follow-up: add an Explorer side-panel failure-banner contract test to ensure partial refresh errors never clear healthy prior rows.

## 2026-04-30 — Split local camera preview from live broadcast startup
- [x] Made local camera preview a first-class state before live broadcast.
- [x] Added explicit `handleEnableCamera` and `bindPreviewStream` flow.
- [x] Start broadcast now reuses existing camera stream and only enables camera when needed.
- [x] Broadcast failure no longer implies camera failure state in overlay copy.
- [ ] Follow-up: add local MediaRecorder recording/download path from camera.stream.

## 2026-04-30 — Register launcher UX and legacy identity pruning
- [x] Register modal now exposes explicit launcher actions (`Open Device Tab`, `Re-register`) when identity already exists.
- [x] Existing-identity register path now opens device tab directly instead of silently no-op closing.
- [x] Added legacy scoped-token pruning helper to reduce stale multi-node storage drift across tabs.
- [ ] Follow-up: add explicit `Refresh registration` control tied to source/node reload callback for immediate side-panel reconciliation.

## 2026-04-30 — Browser runtime identity and tab role model
- [x] Added browser runtime identity helper backed by localStorage.
- [x] Added per-tab role/session state backed by sessionStorage.
- [x] Added BroadcastChannel coordination seam for Explorer/device tabs.
- [x] Kept query token handoff as bootstrap fallback only.
- [x] Stripped bearer token from URL after import.
- [x] Routed protected live/device API calls through owner-node auth headers.
- [x] Reused existing CameraSession stream before acquiring another camera stream.
- [x] Added polling visibility/throttle helpers to reduce node/recording request storms.
- [ ] Follow-up: replace live polling loops with runtime event stream / BroadcastChannel fanout.
- [ ] Follow-up: complete viewer offer/answer/ICE diagnostics if video still fails after auth stabilization.

### Latest Implementation Notes (2026-04-30)
- [x] Stabilize connect-device broadcast stream ownership with reusable CameraSession stream preference (`getUsableCameraStream`) and explicit stream-source tracing.
- [x] Stabilize connect-device node identity resolution ordering (query -> localStorage) with node/token diagnostics to reduce multi-node drift.
- [x] Throttle live polling surfaces with visibility gating helper (`shouldPollLiveSurface`) and slower runtime/live recording poll cadence.
- [ ] Follow-up: move remaining per-card live preview polling to a shared surface poller if on-device traces still show request bursts.

## 2026-04-30 — Duplicate camera acquisition guard in broadcast start
- [x] Added `getUsableCameraStream()` guard so broadcast start reuses existing live camera stream.
- [x] Added explicit stream-source trace marker (`existing-camera-session` vs `new-camera-session`).
- [x] Prevented redundant `videoRef.srcObject` rebinding when stream is unchanged.
- [ ] Follow-up: gate any remaining auto-start camera path with one-shot ref in fullscreen preview flow.

## 2026-04-30 — Cross-tab device token handoff follow-up
- [x] Device-open links now include node-scoped token query handoff when available.
- [x] Connect-device route now persists query token into shared node-auth storage for publisher tab continuity.
- [x] Added static contracts for token query handoff + connect-device token import seam.
- [ ] Follow-up: add automated browser test for explorer-tab open-device handoff ensuring no offer 401 on fresh publisher tab.

## 2026-04-30 — Live control bearer ownership + unhandled offer error containment
- [x] Added shared frontend node-auth helper (`nodeAuth`) with scoped token lookup, header synthesis, and diagnostics.
- [x] Updated register flow to require/persist a real bearer token (never token preview), and fail fast when missing.
- [x] Wired protected live signaling APIs to require bearer headers and fail with `missing_device_bearer_token` before fetch.
- [x] Contained connect-device offer publish failures in UI state to prevent unhandled runtime error overlays.
- [ ] Follow-up: unify all remaining live control endpoints on `nodeAuth` and add runtime-level integration test for owner-node token mismatch.

## 2026-04-30 — Node auth propagation fix for connect-device live start
- [x] Added API-client node auth header synthesis for live session start (`Authorization` + `X-Media-Sync-Node-Id`).
- [x] Persisted issued registration bearer token into connect-device local-storage keys on register success.
- [x] Expanded Explorer static contracts to lock auth header injection + token persistence seams.
- [ ] Follow-up: add runtime integration test that simulates empty-token vs token-present connect-device start outcomes.

## 2026-04-30 — Runtime/API layer alignment follow-up
- [x] Routed remaining live-offer and signal polling fetches through `createApiClient` contract methods.
- [x] Removed direct compose-job JSON fetch from `ExplorerApp` in favor of API client ownership.
- [ ] Follow-up: finish migrating remaining `fetch('/api/...')` usage in connect-device compatibility hooks to explicit service seams.

## 2026-04-30 — Connect device heartbeat ref safety hotfix
- [x] Locked `nodeHeartbeatTimerRef` declaration to stable component scope ref type.
- [x] Centralized heartbeat interval cleanup via `clearNodeHeartbeatTimer()`.
- [x] Added static contracts to prevent dangling heartbeat ref regressions.
- [ ] Follow-up: add browser runtime smoke test for connect-device mount/unmount heartbeat churn.

## 2026-04-30 — Runtime/persisted identity dedupe seam
- [x] Added pending overlay dedupe helper keyed by asset_url/path/fallback recording identity.
- [x] Overlay dedupe now prefers asset-url-backed entries over transient duplicates.
- [x] Added static contracts locking dedupe helper usage in pending merge lane.
- [ ] Follow-up: add explicit persisted-vs-runtime identity regression tests with fixture payloads.

## 2026-04-29 — Runtime overlay safety lock (persisted + runtime merge discipline)
- [x] Locked runtime asset overlay comment/contract in pending artifact controller.
- [x] Runtime asset polling failures now preserve existing UI state (no destructive clear-to-empty fallback).
- [x] Added static contract assertions for overlay semantics and graceful runtime-fetch failure handling.
- [ ] Follow-up: add runtime-vs-persisted dedupe identity helper tests by asset_url/content hash.

## 2026-04-29 — Runtime live preview asset visibility follow-up
- [x] Live WebRTC offer now creates `RuntimeAsset(kind=live, state=previewable)`.
- [x] Explorer runtime-asset placeholder mapping now includes `previewable` live state.
- [x] Added backend test proving live offer creates previewable runtime asset.
- [ ] Follow-up: dedicated live-card rendering polish beyond pending-recording visual reuse.

## 2026-04-29 — Explorer runtime asset merge visibility wiring
- [x] Explorer pending artifact controller now polls `/api/runtime/assets`.
- [x] Runtime recording assets are mapped into pending recording placeholder cards.
- [x] Runtime recording states map to visible statuses (`recording`, `finalizing`, `saved`, `failed`).
- [ ] Follow-up: migrate runtime-asset polling to SSE stream consumption.

## 2026-04-29 — Implement RuntimeAsset representation plane
- [x] Added authority-owned RuntimeAsset registry.
- [x] Added runtime asset API surface.
- [x] Recording start now creates visible runtime asset immediately.
- [x] Recording stop transitions runtime asset to materializing/ready/failed.
- [x] Added backend tests for runtime recording asset transitions.
- [ ] Follow-up: replace polling with SSE push updates if not fully implemented.

## 2026-04-29 — Recording materialization truth gate follow-up
- [x] Stop-recording now fails honestly when no asset materialization exists (`recording_not_materialized`).
- [x] Stop-recording can mark completed only when a real `asset_url` exists on the recording session.
- [x] Added test coverage proving uploaded live recording appears in source library media listing.
- [ ] Follow-up: wire stop-record path to invoke upload/finalization automatically in device UI flow.

## 2026-04-29 — Add remote viewer attach for live sessions
- [x] Backend recording lifecycle endpoints
- [x] Live session → recording linkage
- [x] Viewer attach WebRTC flow implemented
- [x] Multiple viewers supported per live session
- [ ] Follow-up: UI polish + latency optimization

## 2026-04-29 — Live WebRTC recording lifecycle ownership follow-up
- [x] Added /api/live recording lifecycle routes (`record/start`, `record/stop`, session-scoped recording list).
- [x] Enforced idempotent record start for the same active live session.
- [x] Surfaced recording linkage on `/api/live` session list (`recording_count`, `active_recording_id`, `recording_state`, `asset_url`).
- [x] Added backend tests for idempotent start, honest stop transition, and live-list recording linkage.
- [ ] Follow-up: wire full remote viewer attach/track playback handshake in connect device UI beyond stub watch entrypoint.

## 2026-04-29 — Complete connect device deterministic broadcast path
- [x] Made useLiveSession.startPreview return the created live session.
- [x] Replaced reactive WebRTC offer publishing with deterministic Start Broadcast chain.
- [x] Ensured WebRTC offer uses the exact returned live-session session_id.
- [x] Kept Use Selected as local preview-only.
- [x] Added /api/live verification after offer publish.
- [x] Preserved Local vs Remote semantics.
- [ ] Follow-up: wire Remote tab Watch/Answer Live directly into Explorer live preview modal.

## 2026-04-29 — Stabilize connect device lifecycle ownership
- [x] Fixed hook placement and prop wiring in the fullscreen device monitor.
- [x] Made Start Live Broadcast a deterministic camera → live session → WebRTC offer chain.
- [x] Ensured WebRTC offer uses the exact session_id returned by useLiveSession.
- [x] Bounded answer polling and avoided duplicate offer publication.
- [x] Preserved Local vs Remote semantics without moving recording into /connect/device.
- [ ] Follow-up: wire Remote tab Watch/Answer Live directly into Explorer live preview modal.
- [ ] Follow-up: add browser automation for iOS camera switching.

## 2026-04-29 — Harden connect device broadcast lifecycle
- [x] Added typed broadcast lifecycle state model.
- [x] Added live broadcast alignment check after offer publish.
- [x] Ensured WebRTC offer uses the exact live-session session_id.
- [x] Added bounded answer polling and structured debug status.
- [x] Added heartbeat maintenance without bypassing auth.
- [x] Clarified Local vs Remote device semantics.
- [x] Preserved Explorer-owned remote recording path.
- [ ] Follow-up: wire Remote tab Watch/Answer Live directly into Explorer live preview modal.
- [ ] Follow-up: add browser automation for iOS camera switching.

## 2026-04-29 — Make connect device broadcast commit selected camera session
- [x] Added canonical handleStartBroadcast path that commits selected camera into live session creation.
- [x] Added explicit publishPeerOffer(session, stream) startup lane (offer + ICE + answer polling).
- [x] Added active broadcast session state/ref tracking and startup traces for debug=1.
- [x] Added node heartbeat lane while device page stays active.
- [x] Kept picker row select-only and Use Selected local-preview-only (no live session creation).
- [x] Added hydration-safe mounted guard for client-only disabled controls.
- [ ] Follow-up: replace debug chip event dump with compact expandable event console.

## 2026-04-29 — Trace connect device startPreview path
- [x] Added canonical Start Live Broadcast handler.
- [x] Added canonical Use Selected local device handler.
- [x] Added dev-only tracing across CameraSession, useLiveSession, and WebRTC publish effect.
- [x] Hardened startPreview external stream path.
- [x] Added dev-only monitor status strip.
- [ ] Follow-up: remove verbose traces after browser behavior is stable.

## 2026-04-29 — Make connect device monitor controls functional
- [x] Wired Start Live Broadcast to CameraSession + live session start.
- [x] Made local camera picker selection actionable with Use Selected.
- [x] Wired Local/Remote mode into picker behavior.
- [x] Added bottom monitor controls for picker/scopes/navigation.
- [x] Kept CameraSession as canonical camera lifecycle owner.
- [ ] Follow-up: implement real remote camera node handoff.
- [ ] Follow-up: add browser automation coverage for iOS camera switching.

## 2026-04-29 — Add CameraSession layer for connect device monitor
- [x] Added typed CameraSession state and camera error model.
- [x] Added useCameraSession for enumeration, switching, fallback, and stream lifecycle.
- [x] Wired ConnectDevicePage to pass externally-owned camera streams into useLiveSession.
- [x] Preserved WebRTC publishing and runtime live-session behavior.
- [x] Kept compatibility camera hooks in place for later cleanup.
- [ ] Follow-up: fully remove duplicate local camera inventory ownership from FullscreenDevicePreview.
- [ ] Follow-up: add browser-level camera switching tests.

## 2026-04-29 — Fix iOS camera selection and monitor error states
- [x] Wired selected local camera deviceId into startPreview.
- [x] Stopped old tracks before iOS camera switching.
- [x] Added fallback handling for iOS camera constraints.
- [x] Replaced misleading generic HTTPS permission error with cause-aware messages.
- [x] Prevented fatal camera unavailable state when a live video stream exists.
- [ ] Follow-up: add remote camera session selection behavior.
- [ ] Follow-up: add real deviceId switching behavior tests in browser automation.

## 2026-04-29 — Route connect device path to Explorer frontend
- [x] Kept /connect/device as the canonical Explorer device monitor route.
- [x] Updated Caddy routing so /connect/device reaches Next.js.
- [x] Preserved backend /connect/device as direct-backend fallback.
- [x] Kept /connect and /connect/register backend-owned.
- [ ] Follow-up: document backend fallback invocation path.

## 2026-04-29 — Add fullscreen monitor shell for connect device
- [x] Added DeviceMonitorShell for route-level fullscreen monitor chrome.
- [x] Added Local/Remote mode bar and source/session pill.
- [x] Added bottom monitor footer controls.
- [x] Preserved WebRTC publish flow and monitor controls.
- [x] Updated stale monitor copy.
- [ ] Follow-up: implement true deviceId-based camera switching.
- [ ] Follow-up: split device monitor hooks into focused modules.

## 2026-04-27 — Selection and preview controller extraction
- [x] Extracted selection/preview controller.
- [x] Preserved selected asset behavior.
- [x] Preserved preview activation behavior.
- [x] Preserved completed-recording highlight behavior.
- [ ] Follow-up: extract bulk/action menu controller.

## 2026-04-27 — Asset render orchestration extraction
- [x] Extracted rendered entry model.
- [x] Extracted Explorer render controller.
- [x] Preserved AssetGrid and AssetList behavior.
- [x] Preserved pending artifact render lane.
- [ ] Follow-up: extract selection/focus/preview controller.
- [ ] Follow-up: add render ordering behavior tests.

## 2026-04-27 — Pending artifact controller extraction
- [x] Extracted pending artifact controller from ExplorerApp.
- [x] Preserved pending compose behavior.
- [x] Preserved pending recording behavior.
- [x] Kept recording reconciliation behavior intact.
- [ ] Follow-up: split asset grid orchestration.
- [ ] Follow-up: add runtime event-driven pending artifact refresh.

## 2026-04-27 — Explorer runtime extraction
- [x] Runtime controller extracted.
- [x] Live preview state extracted.
- [x] Runtime event reactions extracted.
- [ ] Pending artifact controller extraction.
- [ ] Grid/render orchestration split.

## 2026-04-27 — SSE runtime events
- [x] Runtime event bus added
- [x] SSE endpoint added
- [x] Explorer receives runtime events
- [ ] Replace polling progressively
- [ ] Add event persistence/replay

## 2026-04-27 — CAS metadata in indexed media
- [x] Added optional sha256/content_address fields to indexed media records.
- [x] Preserved legacy media compatibility for entries without sha256.
- [x] Added duplicate-content deterministic hash tests.
- [x] Kept temp/partial files excluded from indexing.
- [ ] Follow-up: promote content_address to primary asset identity where safe.
- [ ] Follow-up: add duplicate detection UX in Explorer.

## 2026-04-27 — Atomic CAS write hardening
- [x] Added storage atomic write helpers.
- [x] Hardened recording upload persistence.
- [x] Hardened direct upload persistence where safe.
- [x] Added deterministic sha256 fingerprint tests.
- [x] Ensured temp files do not leak into index results.
- [ ] Follow-up: complete compose/export atomic-output migration.
- [ ] Follow-up: extend indexed media schema with sha256/content-address fields.

## 2026-04-27 — API ownership and contract normalization
- [x] Documented route naming policy in API surface docs.
- [x] Added frontend contract modules for live, live sessions, recordings, and assets.
- [x] Updated api.ts to use contract normalizers instead of inline payload shape checks.
- [x] Added OpenAPI contract tests for live/recording/media route families.
- [x] Regenerated architecture OpenAPI snapshot.
- [ ] Follow-up: migrate remaining implicit object responses to explicit response models.
- [ ] Follow-up: split ExplorerApp orchestration after contracts stabilize.

## 2026-04-27 — Multi-viewer ICE reliability for live sessions pass (active)
- [x] Extended runtime WebRTC session model to support multi-viewer answers, viewer-scoped ICE lanes, device ICE lane, connection-state map, and updated-at continuity while preserving legacy default-answer compatibility.
- [x] Added viewer-aware signaling routes under `/api/live` for per-viewer answer/ICE/state plus device ICE publish/list and legacy `/answer` compatibility behavior.
- [x] Updated `/connect/device` browser shell to publish device ICE, poll viewer ICE (`viewers/default/ice`), and expose richer connection-state text (`ICE gathering`, `connected`, `disconnected`, etc.) without changing baseline offer flow.
- [x] Extended Explorer API client + live preview answer flow for stable explicit viewer IDs, viewer answer posting, viewer ICE publishing, device ICE polling, candidate dedupe, and viewer-state publication on connect/cleanup.
- [x] Updated runtime chip normalization to surface viewer count and connection-state chips (`connected/checking/disconnected/failed`) in runtime side panel.
- [x] Added/updated backend and frontend static contract tests for multi-viewer answers, ICE exchange routes, viewer state updates, viewer_count serialization, and client wiring markers.
- [ ] Next: add an end-to-end browser automation scenario proving two simultaneous Explorer viewers can answer one live session and both maintain ICE connectivity across one reconnect cycle.

## 2026-04-27 — Completed-recording reconciliation + saved asset feedback pass (active)
- [x] Added Explorer reconciliation lane for completed/saved runtime recording sessions that detects indexed media matches via `pendingRecordingMatchesMediaItem(...)`.
- [x] On successful match, Explorer now auto-selects/highlights the indexed asset (`setSelected`, `setActiveAssetKey`, `setPreviewActivationKey`, `setReinforcedActiveKey`) and emits an explicit `Recording reconciled` toast.
- [x] Reconciliation now dismisses the matched runtime recording session (`dismissLiveRecordingAsset(recordingId)`) to remove duplicate pending-recording card noise once the real media asset is present.
- [x] Updated Explorer static contracts to lock reconciliation markers (`Recording reconciled`, `dismissLiveRecordingAsset`, preview activation write-through).
- [ ] Next: add focused runtime UI test coverage for reconciliation timing where media indexing lands several polling ticks after recording session completion.

## 2026-04-27 — Runtime-backed recording session lifecycle + StreamHub ownership pass (active)
- [x] Added runtime-backed `RecordingSession` model (`app/models/recording_session.py`) and in-memory runtime registry (`app/runtime/recording_sessions.py`) with create/get/list/update/delete semantics.
- [x] Wired runtime recording session ownership (`runtime.recording_sessions`) during runtime assembly and mounted dedicated `/api/recordings` routes for start/list/complete/fail/delete lifecycle transitions.
- [x] Added backend API coverage (`tests/test_recordings_api.py`) validating start/list/complete/fail/delete behavior for recording sessions.
- [x] Added Explorer `StreamHub` (`src/runtime/StreamHub.ts`) keyed by live `session_id` to avoid passing raw `MediaStream` objects through component boundaries.
- [x] Added Explorer runtime-backed recording hook (`useRecordingSessions`) and refactored `ExplorerApp` to use session-owned recording start flow (`onRecordPeerSession`) instead of raw stream callback handoff.
- [x] Updated `LiveSourceCard` peer-track lifecycle to `StreamHub.set(...)` on track receipt and `StreamHub.delete(...)` on teardown, plus record action callback by `session_id`.
- [x] Preserved browser-side `MediaRecorder` ownership and existing upload endpoint (`/api/live_sessions/{session_id}/recording/upload`) while posting recording lifecycle state transitions to `/api/recordings`.
- [x] Updated Explorer static contracts to assert StreamHub presence/usage, recording API client `/api/recordings` references, and session-based recording callback wiring.
- [ ] Next: add reconciliation coverage for runtime recording sessions when Explorer reconnects mid-recording (local recorder runtime unavailable but runtime session still present).

## 2026-04-27 — Durable browser-side WebRTC recording upload pass (active)
- [x] Added `/api/live_sessions/{session_id}/recording/upload` multipart endpoint to persist browser-captured `.webm` recordings into source/project storage roots.
- [x] Added upload validation for live-session existence, non-empty payloads, content type constraints (`video/webm` or `application/octet-stream`), target-dir safety, and `.webm` filename sanitization.
- [x] Implemented defensive source-root resolution across common registry API shapes (`require/get/get_source/resolve`) and root-field variants (`root/root_path/path/base_path`).
- [x] Added Explorer API client methods for browser-recording upload and explicit live-session control dispatch (`sendLiveSessionControl`).
- [x] Added `LiveRecorder` component that records peer `MediaStream` with `MediaRecorder`, tracks elapsed time, uploads on stop, and surfaces saved-asset links.
- [x] Integrated `LiveRecorder` into `LiveSourceCard` peer-view lifecycle with `setPeerStream(...)` track wiring and cleanup.
- [x] Wired Explorer live card rendering to pass recording project/source/target-dir context and refresh library snapshot after recording save.
- [x] Added backend tests for recording upload success and unsafe target-dir rejection plus Explorer static contract checks for recorder wiring.
- [ ] Next: add focused runtime UI smoke coverage for repeated start/stop browser recording cycles against one active peer stream.

## 2026-04-27 — Explorer live-session side panel correlation pass (active)
- [x] Updated `/api/live` list serialization to prefer object payload shape (`{ sessions: [...] }`) with derived `has_offer`, `has_answer`, and `state` fields for operator-facing WebRTC session state.
- [x] Hardened `/connect/device` answer polling to treat 404 as expected waiting state, reduce status noise, back off polling cadence (1s→2s→5s), and pause polling while tab is hidden.
- [x] Added Explorer WebRTC session API typing + client fetch (`listWebRtcLiveSessions`) with compatibility normalization for legacy list payloads.
- [x] Added `useWebRtcLiveSessions` polling hook with visibility-aware polling and node-indexed maps for runtime panel correlation.
- [x] Added `buildRuntimeChips(...)` helper to dedupe/normalize runtime chips and surface status/auth/live capability tones.
- [x] Integrated live-session correlation into `ExplorerApp` runtime sidebar: Open Device enablement now includes session-capable/live nodes and waiting sessions expose Answer Live modal actions via `LivePreview`.
- [x] Added/updated regression tests for `/api/live` session shape/state serialization and Explorer static contracts for live hook + chip helper wiring.
- [ ] Next: add lightweight runtime-panel E2E coverage asserting waiting→connected chip/state transitions under a mocked offer/answer lifecycle.

## 2026-04-27 — Runtime lifecycle + live WebRTC surface pass (active)
- [x] Added runtime lifecycle controller (`RuntimeLifecycleController`) with settings dataclass, idempotent start/stop guards, periodic sweep loop, and sweep result logging.
- [x] Wired lifecycle into runtime startup/shutdown through `AppRuntime` + runtime assembly, including lightweight runtime WebRTC session registry mount (`runtime.live_sessions`).
- [x] Added LAN-first WebRTC signaling API (`/api/live/{session_id}/offer|answer`, list, delete) backed by in-memory runtime session registry.
- [x] Added real `/connect/device` browser camera shell that captures local media, publishes WebRTC offer, and polls for answer via same-origin API paths.
- [x] Updated node heartbeat API to require registered-node bearer auth, enforce `ctx.node_id == path node_id`, and set status to `online` on heartbeat.
- [x] Updated ingest claim pruning path to support lifecycle cutoff datetime + status-aware pruning without introducing duplicate claim stores.
- [x] Added Explorer `LivePreview` component scaffold and static contract check for component presence.
- [x] Added lifecycle and live WebRTC API tests (`test_runtime_lifecycle.py`, `test_live_webrtc_api.py`).
- [ ] Next: evaluate whether legacy `/api/live_sessions` signaling and new `/api/live` signaling should converge under one registry after first LAN validation pass.

## 2026-04-27 — Explorer sidebar delete TDZ hydration fix (active)
- [x] Fixed `ExplorerApp` callback declaration order so `openPayloadDetails` initializes before callbacks that depend on it (`openDeviceForNode`), eliminating hydration-time TDZ `ReferenceError`.
- [x] Preserved runtime/ingest destructive context actions (`Delete node`, `Delete claim`) and guarded device URL menu behavior.
- [x] Added static contract assertions that enforce ordering invariants for `openPayloadDetails`, delete callbacks, and runtime/ingest context-menu render blocks.
- [ ] Next: replace sidebar `window.confirm` prompts with shared confirm modal surface to keep all destructive flows non-blocking and style-consistent.

## 2026-04-27 — Explorer sidebar destructive runtime/claim actions (active)
- [x] Added Explorer API client methods for `DELETE /api/nodes/{node_id}` and `DELETE /api/ingest/claims/{claim_id}` with structured error propagation.
- [x] Added runtime context-menu destructive action (`Delete node`) with confirm → delete → refresh (`reloadSourceControl`) → toast flow.
- [x] Added ingest-claim context-menu destructive action (`Delete claim`) with confirm → delete → refresh (`reloadIngestClaims`) → toast flow.
- [x] Updated runtime context menu ordering to match operator minimum set (`Details`, `Heartbeat now`, `Copy Node ID`, `Copy Node JSON`, `Delete node`) while keeping `Open Device` and `Copy Device URL` guarded by registered `base_url`.
- [x] Hardened runtime open/copy URL behavior to avoid blind device navigation when nodes do not have a registered `base_url`; browser/session nodes now surface details fallback and non-session nodes show explicit warning toast.
- [x] Added Explorer static contract assertions for new API methods, destructive menu actions, and guarded runtime URL helpers/styles.
- [ ] Next: replace `window.confirm` with shared Explorer confirm modal for runtime/ingest destructive context actions to align with non-blocking UI conventions.

## 2026-04-27 — Runtime bearer enforcement for node-owned mutations (active)
- [x] Added runtime-backed device auth dependency (`runtime_device_auth`) that verifies bearer token + node ID against runtime node registry token hashes.
- [x] Enforced bearer scope checks on ingest-claim creation and bound `node_id` to authenticated node identity.
- [x] Added ingest claim cleanup endpoints (`DELETE /api/ingest/claims/{claim_id}`, `POST /api/ingest/claims/prune`) and backing registry/service methods.
- [x] Enforced live-session mutation auth (`start`, `heartbeat`, `chunk`, `end`, `control`, `control/ack`, `signal/offer`) with session ownership checks.
- [x] Preserved operator/browser read paths (`GET` list/detail/signal and viewer answer path) without new bearer requirements.
- [x] Added node cleanup endpoints (`DELETE /api/nodes/{node_id}`, `POST /api/nodes/prune`) plus registry helpers (`get_node`, `delete_node`, `prune_ephemeral_nodes`).
- [x] Added/updated tests for runtime auth dependency + ingest/live/node enforcement behaviors.
- [ ] Next: evaluate optional `stream:proxy` enforcement once dedicated device-owned proxy mutation routes are finalized.

## 2026-04-27 — Follow-up: absolute handoff URLs + HTTPS asset rewrite guard (active)
- [x] Fixed Explorer `absoluteAssetUrl(...)` to always return origin-qualified URLs for relative asset paths used in clipboard/OBS/program-monitor handoff flows.
- [x] Tightened HTTPS asset normalization rewrite guard to only rewrite unsafe API authorities (`http` / `:8787`) and avoid dropping explicit secure custom ports.
- [x] Updated Explorer static regression contracts to lock the new `unsafeApiAuthority` guard and absolute-URL handoff behavior markers.
- [ ] Next: add runtime integration coverage for absolute URL handoff outputs (copy/OBS/program-monitor) under HTTPS + custom-port scenarios.

## 2026-04-27 — Register authority origin + node bearer credential issuance (active)
- [x] Added Explorer authority-origin helper (`resolveAuthorityOrigin` + `buildAuthorityUrl`) for register/connect URL generation.
- [x] Updated `RegisterNodeModal` to resolve HTTPS gateway authority as same-origin and `:3000` dev authority as `:8787`.
- [x] Added node-token helper module (`issue`, `hash`, `preview`, `verify`) and expanded device-auth helper scaffolding without route enforcement.
- [x] Updated `/connect/register` to issue bearer credential once, persist only token hash/preview/auth metadata, and return one-time auth instructions.
- [x] Updated node API/connect serialization so public node payloads omit `token_hash` and raw token while exposing `auth_type`, `token_preview`, and `auth_scopes`.
- [x] Added auth helper test coverage (`test_node_tokens.py`, `test_device_auth.py`) and updated connect/auth scaffolding tests.
- [ ] Next: wire optional verification endpoint to registry lookup once node-registry auth-read path is finalized (without enabling ingest/live enforcement yet).

## 2026-04-27 — Explorer URL policy + auth-layering PR tasks (active)
- [x] Add a centralized Explorer URL policy module for browser-renderable media/API normalization and HTTPS same-origin routing behavior.
- [x] Route Explorer media URL resolution through the shared policy layer (`utils.ts`, `utils/mediaUrls.ts`, `ExplorerApp.tsx`) to remove scattered URL guessing.
- [x] Keep direct Next dev mode functional through explicit rewrites and avoid hardcoded production defaults for `192.168.0.25:8787`.
- [x] Add minimal backend auth scaffolding modules for device auth and platform credential references without forcing auth gates onto existing routes.
- [x] Add minimal regression tests for auth scaffolding behavior and credential-ref shaping.
- [ ] Next: integrate device-auth dependency on selected ingest/live routes only after route-level tests are expanded for the new auth boundary.

## 2026-04-25 — Media byte-range compliance + debug path diagnostics (active)
- [x] Implemented explicit HTTP byte-range handling for `GET /media/{project}/{relative_path}`:
  - `bytes=0-1` returns `206` with `Content-Length: 2`.
  - Open-ended (`bytes=100-`) and suffix (`bytes=-500`) ranges return `206`.
  - Invalid/unsatisfiable ranges return `416` with `Content-Range: bytes */<total>`.
  - Missing `Range` keeps existing `200` full-stream behavior.
  - Added `Accept-Ranges: bytes` to media stream responses.
- [x] Added `GET /debug/resolve-path` for safe media path diagnostics across source roots with traversal rejection and payload keys:
  - `exists`, `is_file`, `size`, `content_type_guess`, `resolved_path`, `source_root`, `safe`.
- [x] Wired `/debug/*` backend ownership continuity through FastAPI router registration (Caddy matcher already includes `/debug/*`).
- [x] Added backend tests for media byte-range success/failure cases and debug resolve-path behavior (media + thumbnails + traversal rejection).
- [ ] Next: run an iOS Safari probe validation against Caddy (`Range: bytes=0-1`) to confirm end-to-end `206` passthrough on physical device.

## 2026-04-25 — LAN authority env passthrough + Caddy route ownership contract fix (active)
- [x] Wired authority/public env passthrough into `docker/docker-compose.yaml` for `media-sync-api` (`MEDIA_SYNC_PUBLIC_ORIGIN`, `MEDIA_SYNC_AUTHORITY_ORIGIN`, `MEDIA_SYNC_AUTHORITY_HOST`).
- [x] Updated `docker/docker-compose.caddy.yaml` env passthrough to include all three authority/public vars while keeping `.env` loading.
- [x] Expanded Caddy route ownership contract in host + docker Caddyfiles: dedicated `@media` matcher, explicit `@backend` matcher including `/connect*` + `/debug/*`, explicit `@next` matcher for `/_next/*`, and Explorer fallback.
- [x] Added manual verification commands:
  - `docker compose -f docker/docker-compose.yaml -f docker/docker-compose.explorer.yaml -f docker/docker-compose.caddy.yaml --profile dev up -d --build --force-recreate`
  - `docker exec media-sync-api env | findstr MEDIA_SYNC_AUTHORITY`
  - `docker exec media-sync-api env | findstr MEDIA_SYNC_PUBLIC`
  - `docker exec media-sync-caddy env | findstr MEDIA_SYNC`
  - `curl.exe -k https://cda-desktop.local/health`
  - `curl.exe -k https://cda-desktop.local/`
  - `curl.exe -k -I https://cda-desktop.local/_next/static/chunks/main-app.js`
- [ ] Next: verify `media-sync-api` container runtime env now consistently exposes lowercase authority/public values and that `/connect/register` URLs stay on `https://cda-desktop.local`.

## 2026-04-25 — Caddy LAN HTTPS media-route stability hardening (active)
- [x] Split Caddy routing into dedicated `@media` matcher (`/media/*`, `/thumbnails/*`) with HTTP/1.1 upstream transport to reduce iPhone Range-request churn and stream cancellations.
- [x] Kept non-media backend routes in `@backend` and preserved Explorer fallback ownership for all other paths (`/_next/*` remains non-backend).
- [x] Removed redundant forwarded-header overrides (`X-Forwarded-*`) from Caddy proxy blocks while retaining `Host` pass-through.
- [x] Updated compose Caddy storage to persistent named volumes (`caddy_data`, `caddy_config`) and kept Caddyfile bind mount read-only.
- [x] Normalized documented authority env examples to lowercase `cda-desktop.local` and added direct curl.exe checks for health/home/media/thumbnails.
- [ ] Next: run a real iPhone Safari playback pass and verify reduced `context canceled` churn under repeated `/media/*.mp4` Range probes.

## 2026-04-24 — Caddy forwarded public-origin header hardening (active)
- [x] Added explicit `header_up` forwarding (`Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`) to both backend and Explorer reverse-proxy blocks in host + docker Caddyfiles.
- [x] Preserved backend route matcher boundaries (`/_next/*` remains Explorer-owned fallback, not API-matched).
- [x] Expanded Caddy README troubleshooting with expected Next static URL shapes and curl/Select-String commands for stale-origin detection.
- [x] Added docker Caddy config regression assertions for forwarded headers and no-`/_next/*` API routing.
- [ ] Next: confirm cookie/session flows remain authority-stable on iPhone Safari after Caddy restart (no host/proto drift in request headers).

## 2026-04-24 — Video thumbnail candidate priority restore for HTTPS authority (active)
- [x] Replaced single-value thumbnail selection with explicit candidate planning in `ExplorerApp` so video cards prefer `thumbnail_url`, then `thumb_url`, then generated `/thumbnails/{project}/{sha}.jpg|webp|png` routes before generic fallback.
- [x] Preserved stream-vs-thumbnail separation in view-model wiring (`streamUrl` playback lane independent from `thumbUrl` poster lane) and added secondary thumbnail fallback URL handoff into card image error flow.
- [x] Added dev-only diagnostics: sampled `/api/library` thumbnail field trace logging on first populated dataset and one-time warnings for video assets missing thumbnail candidates.
- [x] Added single-item context action `Copy Asset Debug JSON` capturing raw thumbnail fields, normalized candidates, stream URL, and fallback reason for on-device triage.
- [ ] Next: validate on iPhone Safari that previously generic VIDEO cards now render extracted thumbs when either `thumbnail_url` or `thumb_url` exists.

## 2026-04-24 — HTTPS authority media URL/render parity follow-up (active)
- [x] Added `src/utils/mediaUrls.ts` with browser-safe `normalizeAssetUrl(...)` plus best-url selectors (`getBestThumbnailUrl`, `getBestStreamUrl`, `getBestDownloadUrl`) and absolute clipboard helper.
- [x] Rewired Explorer media URL usage to prefer normalized best-url selectors for card thumbs, video preview, focused preview metadata/actions, and stream URL copy paths without mutating API payloads.
- [x] Hardened card/list thumbnail `onError` handling to surface failed URL details (`title`/`aria-label`) and emit dev-only warning context for Safari triage.
- [x] Expanded Caddy backend matcher coverage in host + docker configs (`/thumbnails/*`, `/public/*`, `/player.html`, `/favicon/*`, `/static/*`) while keeping Explorer/Next fallback for non-backend routes (no `/_next/*` API proxying).
- [ ] Next: run physical iPhone Safari verification that visible card thumbs/preview video now resolve as same-origin HTTPS `/thumbnails/...` and `/media/...` under `https://cda-desktop.local`.

## 2026-04-24 — Caddy backend asset-route parity for HTTPS thumbnails (active)
- [x] Expanded Caddy backend matcher in both `docker/caddy/Caddyfile` and `docker/caddy/Caddyfile.docker` to proxy backend-owned asset routes (`/api/*`, `/media/*`, `/download/*`, `/thumbnails/*`, `/player.html`, `/public/*`) before Explorer fallback.
- [x] Added regression coverage in `tests/test_caddy_gateway_config.py` to lock required backend-route presence and enforce backend-proxy ordering ahead of Explorer fallback.
- [x] Updated `docker/caddy/README.md` quick-test commands to include HTTPS checks for `/api/library`, `/thumbnails/...`, and `/media/...` through Caddy.
- [ ] Next: run on-device acceptance pass confirming `/thumbnails/<project>/<sha>.jpg` serves an image payload over `https://cda-desktop.local` and cards render without placeholder icons.

## 2026-04-24 — Root .env example for Caddy/authority bootstrap (active)
- [x] Added repo-root `.env.example` with copy-paste baseline values for authority/public origin, Caddy hostname binding, runtime role, and API host/port.
- [x] Updated `docker/caddy/README.md` with an explicit `cp .env.example .env` bootstrap step before compose usage.
- [ ] Next: align top-level README quickstart with the same `.env` bootstrap flow to remove onboarding drift.

## 2026-04-24 — Root compose include for Caddy scaffold (active)
- [x] Added `docker/docker-compose.caddy.yaml` to root `docker-compose.yaml` includes so LAN HTTPS gateway can be composed with core/api + Explorer stacks.
- [x] Kept include-only change narrowly scoped (no backend/frontend runtime logic touched).
- [ ] Next: document one-shot compose startup/teardown commands for combined API + Explorer + Caddy workflow in top-level ops docs.

## 2026-04-24 — Env-parameterized Docker Caddy host binding (active)
- [x] Added `docker/caddy/Caddyfile.docker` with env-driven site labels (`{$MEDIA_SYNC_AUTHORITY_HOST}`) and Docker Desktop upstreams via `host.docker.internal`.
- [x] Refactored `docker/caddy/Caddyfile` to remove hardcoded hostname and mirror env-driven Docker-ready proxy behavior.
- [x] Added `docker/docker-compose.caddy.yaml` with `.env` passthrough (`MEDIA_SYNC_AUTHORITY_HOST`, `MEDIA_SYNC_PUBLIC_ORIGIN`) and host-gateway mapping.
- [x] Updated Caddy README and helper scripts to document hostname-only env usage and run against `Caddyfile.docker` without embedded hostnames.
- [ ] Next: add optional compose profile docs showing combined startup for API + Explorer + Caddy in one command.

## 2026-04-24 — LAN HTTPS Caddy gateway scaffold (active)
- [x] Added `docker/caddy/Caddyfile` host-installed authority gateway scaffold routing API/connect/media/health/docs paths to `127.0.0.1:8787` and Explorer to `127.0.0.1:3000`.
- [x] Added `docker/caddy/README.md` with authority-origin env contract, host service expectations, iPhone CA trust requirement, and curl/browser validation steps.
- [x] Added cross-platform helpers: `run-caddy.sh` (Linux/macOS) and `run-caddy.ps1` (Windows Docker Desktop) with generated `Caddyfile.docker` using `host.docker.internal` upstreams.
- [ ] Next: add optional compose profile to launch Caddy + Explorer + API together for one-command LAN HTTPS startup.

## 2026-04-24 — Authority-origin contract + ingest-claim hide controls (active)
- [x] Added runtime settings for `MEDIA_SYNC_PUBLIC_ORIGIN` and `MEDIA_SYNC_AUTHORITY_ORIGIN` and wired connect manifest/register responses to prefer authority origin, then public origin, then request origin fallback.
- [x] Updated `/connect/register` `device_url` generation to emit configured-origin absolute URLs when origin env vars are set while preserving relative fallback behavior when unset.
- [x] Added backend tests to lock configured-origin behavior for `/connect` manifest and `/connect/register` device URL outputs.
- [x] Extended Explorer ingest-claim UI with local hide state (`explorer_hidden_ingest_claim_ids`), claim/test-claim hide actions in context menu, and reset-hidden control in header metadata.
- [x] Kept hide/dismiss behavior frontend-only (no backend delete/cancel endpoint changes).
- [ ] Next: add optional backend non-destructive dismiss endpoint contract (`POST /api/ingest/claims/{claim_id}/dismiss`) once operator workflow is finalized.

## 2026-04-24 — Ingest-claims header/list DOM split fix (active)
- [x] Moved `.ingest-claims-panel` out of the Ingest Claims `.section-h` block so header contains only title + meta-line.
- [x] Kept claim list rendering/behavior intact while restoring source-like sidebar structural parity (`section-h` sibling followed by list container).
- [x] Tightened ingest-claim CSS alignment (`.ingest-claim-card.card`, `.claim-row`, panel padding) to keep card width/ellipsis behavior consistent with sidebar cards.
- [ ] Next: verify DOM inspector on iPhone Safari confirms `.ingest-claims-panel` is a sibling after `.section-h` and no right-side card bleed remains.

## 2026-04-24 — Ingest-claims sidebar containment follow-up (active)
- [x] Replaced ingest-claims generic wrapper usage with dedicated panel/list classes to keep claim cards width-constrained to sidebar flow.
- [x] Added strict claim-card overflow/shrink-safe text and inline-safe overflow-menu button styling to prevent right-side bleed over grid/tags sections.
- [x] Kept claim context-menu behavior unchanged (menu only opens from card contextmenu/⋯ action; cards remain in normal sidebar DOM flow).
- [ ] Next: capture a post-fix iPhone Safari screenshot proving claim cards no longer overlap Tags/AI Tags/Bridge while sidebar scrolling remains normal.

## 2026-04-24 — Connect-device hook + ingest-claim sidebar regression fixes (active)
- [x] Removed stray module-scope hook calls in `app/connect/device/page.tsx` so all hooks run only inside `ConnectDevicePage` component scope.
- [x] Preserved existing connect-device camera/session behaviors (`Enable Camera`, preview, recording, peer signaling) while fixing invalid-hook-call startup crash.
- [x] Reworked ingest-claim sidebar rendering to be constrained in-flow (max-height scroll container), newest-first, latest 5 cards, and compact card content.
- [x] Added claim test-payload detection (`isTestPayloadClaim`) and surfaced compact `test payload` tag in ingest cards.
- [x] Ensured runtime/sidebar context-menu actions close menu on selection and raised menu stacking above sidebar cards while remaining below modal overlays.
- [ ] Next: capture a fresh iPhone Safari verification screenshot proving ingest claims remain confined and `/connect/device` loads without hook errors.

## 2026-04-24 — Explorer unified sidebar/runtime context menus (active)
- [x] Extended Explorer UI context-menu state to a typed union (`media_asset`, `source`, `runtime`, `live_session`, `ingest_claim`) so sidebar surfaces reuse the existing context-menu authority lane.
- [x] Added runtime sidebar context actions (details, copy identifiers/json, open device, heartbeat now) and wired card right-click + overflow-button entrypoints for sources/runtimes/live sessions.
- [x] Added ingest-claim sidebar polling (`/api/ingest/claims`) with card rendering + context actions and a shared runtime details modal for payload inspection/copy.
- [x] Added runtime label helpers (`runtimeLabels`) and ingest-claim type contract for consistent sidebar tagging and diagnostics affordances.
- [ ] Next: add static contract assertions in Explorer export tests for the new sidebar context-menu branches and ingest-claim API methods.

## 2026-04-24 — WebRTC signaling hardening pass (active)
- [x] Scoped signaling answers by `viewer_id` so concurrent Explorer viewers do not overwrite each other.
- [x] Scoped ICE publication by `role + viewer_id` and surfaced viewer-specific candidate lanes in signaling state reads.
- [x] Added stale signaling-viewer pruning window to prevent indefinite growth from abandoned viewer sessions.
- [x] Blocked signaling reads/writes for ended sessions and confirmed signaling state is cleared when session ends.
- [x] Device capture page now reports WebRTC status (`idle`, `offer-published`, `connected`, `failed`) from peer lifecycle events.
- [x] LiveSourceCard peer viewer now reports connection status and includes an explicit reconnect action.
- [x] Device control polling now acknowledges both `start_recording` and `stop_recording` after local execution.
- [x] Added backend tests for multi-viewer signaling isolation and end-of-session signaling cleanup.
- [ ] Next: add auth/ownership checks so only authorized node/viewer identities can publish signaling payloads per session.

## 2026-04-24 — Live-session WebRTC signaling plane (active)
- [x] Added backend signaling endpoints for live sessions (`/signal/offer`, `/signal/answer`, `/signal/ice`, `/signal`) with runtime-owned per-session offer/answer/ICE state.
- [x] Extended live-session service with idempotent signaling state publication/read helpers and candidate de-duplication.
- [x] Added API regression coverage for offer/answer/ICE round-trip behavior on active live sessions.
- [x] Extended Explorer API/types with signaling contracts and endpoint methods.
- [x] Added device-side peer publish path (`/connect/device`) that emits WebRTC offer/ICE from local camera preview stream once a live camera session is active.
- [x] Added LiveSourceCard peer viewer path that consumes signaling state, answers offer, exchanges ICE, and renders peer stream when opened.
- [x] Added static Explorer contract checks for signaling API presence and peer publish/viewer markers.
- [ ] Next: add explicit signaling role/session auth guardrails and a short-lived prune policy for stale ICE candidates.

## 2026-04-24 — /connect/device capability hardening for iPhone Safari (active)
- [x] Guarded `useLiveSession.startPreview(...)` against missing `mediaDevices/getUserMedia/getDisplayMedia` and replaced raw TypeError leakage with operator-readable capability errors.
- [x] Added connect-device runtime capability diagnostics (`secure context`, `camera API`, `screen capture API`, `iOS likely`) with explicit HTTPS guidance for iOS Safari LAN activation.
- [x] Updated `/connect/device` action availability: camera button disables when `getUserMedia` is unavailable; screen-share action is withheld on iOS/unavailable browsers.
- [x] Clarified Sources/Libraries sidebar copy to distinguish remote source surfaces vs registered runtime nodes without backend behavior changes.
- [x] Expanded Explorer static contracts to lock media-capability guard markers and updated sidebar copy labels.
- [ ] Next: validate physical iPhone Safari over HTTP vs HTTPS and capture expected diagnostic/activation behavior snapshots.

## 2026-04-24 — iOS device-class naming precision pass (active)
- [x] Refined `RegisterNodeModal` browser-context detection to prioritize iPhone identity first and avoid iPhone sessions being mislabeled as `ipad-browser`.
- [x] Tightened iPad classification to explicit `iPad` UA or `MacIntel + touch` heuristic only when iPhone detection is false.
- [x] Added fallback `ios-browser` device class for likely iOS Safari sessions that are neither confidently iPhone nor iPad.
- [x] Preserved existing capture defaults for iOS mobile registrations (`runner + capture`, `source_kind=capture`, `source_name=camera-primary`, session transport metadata, nullable `base_url`).
- [x] Expanded Explorer static contracts to lock the updated iOS device-class detection markers.
- [ ] Next: capture one physical iPhone + iPad register screenshot/log pair confirming `iphone-browser` vs `ipad-browser` labeling while keeping identical capture registration behavior.

## 2026-04-24 — Nullable session-node base_url registration fix (active)
- [x] Updated connect/node request DTOs to accept nullable `base_url` so browser/session registrations are not rejected at request-schema validation.
- [x] Added explicit base-url normalization (`"" -> None`) in `/connect/register` and `/api/nodes` handlers before `NodeRecord` construction.
- [x] Extended `NodeRecord` validation policy: session/browser-marked nodes may omit `base_url`, while non-session daemon nodes still require a non-empty base URL.
- [x] Added regression tests for null/empty session-node registration acceptance and non-session missing-base rejection in both connect-plane and node API surfaces.
- [ ] Next: run physical iPad/iPhone register flow to confirm `base_url: null` submit succeeds and same-tab device redirect occurs end-to-end.

## 2026-04-23 — Register-to-device same-tab redirect hardening pass (active)
- [x] Updated `RegisterNodeModal` success flow to persist `explorer_capture_node_id` and immediately navigate in the same tab when `device_url` is returned (`router.push` with `window.location.href` fallback).
- [x] Removed intermediate in-modal post-register continuation affordance so successful current-device registration no longer requires additional taps.
- [x] Locked browser/session register payload defaults to `base_url: null` and explicit session transport metadata markers (`transport_hint=session`, `session_node=true`, `browser_push=true`) with string-safe metadata serialization.
- [x] Kept camera permission authority on `/connect/device` only (no `getUserMedia` request on modal open or register submit).
- [x] Added static Explorer contract assertions for direct redirect, payload markers, and absence of in-modal camera prompt calls.
- [ ] Next: run iPhone/iPad manual validation to confirm same-tab redirect + Enable Camera permission prompt timing on physical Safari.

## 2026-04-23 — Live session remote control micro-pass (active)
- [x] Added backend control plane endpoint `POST /api/live_sessions/{session_id}/control` to persist desired session action (`start_recording` / `stop_recording`) with control timestamp.
- [x] Added backend session read endpoint `GET /api/live_sessions/{session_id}` and expanded live-session response fields (`desired_action`, `last_control_at`) for device-side command polling.
- [x] Extended live session service/domain/runtime models to carry desired-action control state through heartbeat/chunk/end transitions.
- [x] Added Explorer live card control buttons (Record/Stop) that call new control endpoint and emit operator toasts.
- [x] Added device-side control polling in `useLiveSession` to fetch latest session state every second and execute local recording actions when desired action changes.
- [x] Added backend regression test coverage for control endpoint and per-session control state retrieval.
- [ ] Next: clear/ack desired_action after successful device action execution to avoid redundant command replays across reconnects.

## 2026-04-23 — LiveSourceCard preview polling stabilization pass (active)
- [x] Updated live preview endpoint to return `FileResponse` with explicit no-cache headers for polling-safe latest-frame retrieval (`Cache-Control`, `Pragma`).
- [x] Replaced `LiveSourceCard` preview logic with 1s polling + cache-busting URL tick and flicker-safe image swap (`new Image()` preload before visible `img` src update).
- [x] Added recording overlay marker (`REC {chunk_count}`) to live card preview surface and wired open-device action callback from Explorer sidebar.
- [x] Added `@keyframes pulse` style used by recording-dot overlay animation.
- [x] Extended live-session preview API test to assert no-cache response headers.
- [ ] Next: consider serving lightweight image snapshots from preview endpoint for stronger cross-browser `<img>` compatibility when chunk MIME is video.

## 2026-04-23 — Centralized connect metadata serialization helper (active)
- [x] Added frontend utility `serializeMetadata(...)` to normalize `Record<string, unknown>` into `Record<string, string>` for `/connect/register` transport.
- [x] Refactored `RegisterNodeModal` payload assembly to construct raw metadata once and run full normalization through `serializeMetadata(...)` (removed per-field ad-hoc `String(...)` calls).
- [x] Tightened register request type to `metadata?: Record<string, string>` so call sites remain contract-aligned with backend `Dict[str, str]`.
- [ ] Next: reuse `serializeMetadata(...)` in any future connect-plane metadata producers to keep frontend/backend contract drift-proof.

## 2026-04-23 — Register metadata string-contract hotfix (active)
- [x] Fixed frontend register payload serialization mismatch for backend `metadata: Dict[str, str]` contract by stringifying boolean telemetry fields (`likely_mobile`, `likely_safari`, `detected_mobile`, `detected_safari`) in `RegisterNodeModal` payload construction.
- [x] Normalized related detected/authority metadata fields to explicit string values during payload assembly to keep connect-plane metadata transport-safe and schema-consistent.
- [ ] Next: add a small shared frontend `serializeMetadata(...)` helper to centralize string normalization for future metadata fields and avoid drift.

## 2026-04-23 — Live session closure seam + low-fi preview follow-up (active)
- [x] Attempted requested `.25` manual chain validation (`ssh`, spool/log checks, direct endpoint curls) from container; blocked by network reachability (`port 22 unreachable`) so validation must run on reachable host context.
- [x] Confirmed live ingest path remains integrated via `LiveSessionService.end_session()` using existing `IngestClaimService.submit_claim(...)` contract (no ad-hoc stub payload path).
- [x] Added stale live-session expiry in runtime registry active-list path (drop active sessions older than 60s heartbeat) to prevent orphan accumulation when clients disconnect without `/end`.
- [x] Added low-fi live preview endpoint `GET /api/live_sessions/{id}/preview/latest` returning latest chunk bytes with appropriate media content-type.
- [x] Added Explorer `LiveSourceCard` preview polling (`<video>` src refresh every 2s) against latest-chunk preview endpoint.
- [x] Tightened end-to-asset seam in frontend: `useLiveSession` persists claim event on end, Explorer listens and auto-refreshes media scope after short delay, and device ended state links back into Explorer with claim context.
- [x] Added backend test coverage for preview endpoint and stale-session expiry behavior.
- [ ] Next: on reachable `.25` host, run requested manual iPhone walkthrough with live logs and spool checks, then capture exact failure/success evidence for any remaining chain gaps.

## 2026-04-23 — Live session intake + Explorer device capture bridge (active)
- [x] Added runtime-owned live session domain/service/registry wiring (`LiveSession`, `LiveSessionRegistry`, `LiveSessionService`) with spool chunk persistence and authority ingest-claim handoff on session end.
- [x] Added live session API surface (`/api/live_sessions` start/heartbeat/chunk/end/list) and wired router/runtime health flags so connect/ingest/live readiness are visible from `/health`.
- [x] Extended connect registration response with `device_url` for browser-device continuation flows (`/connect/device?node_id=...`).
- [x] Extended Explorer API/types with live-session contracts and request methods (`startLiveSession`, `heartbeatLiveSession`, `uploadLiveSessionChunk`, `endLiveSession`, `listLiveSessions`).
- [x] Added Explorer live-session UX components/hooks (`useLiveSession`, `useLiveSessions`, `LiveSourceCard`) plus device capture route at `app/connect/device/page.tsx`.
- [x] Integrated sidebar live-session cards and registration continuation into existing Explorer modal flow (persist capture node id, redirect to returned `device_url` when available).
- [x] Added backend regression coverage for live sessions and runtime/health/connect shape updates.
- [ ] Next: add authority-side validation that live-session `node_id/source_name` ownership matches current node/source registry state before claim submission.
- [ ] Next: add Explorer inline toast/status when live chunk upload fails mid-session (show retry hint and degraded-recording indicator).

## 2026-04-23 — iOS Safari capability inference correction (active)
- [x] Updated register-modal camera/enumerate capability inference to include iOS Safari fallback support when APIs are permission/lifecycle-gated.
- [x] Adjusted detected-context copy so iOS Safari reports `likely supported` semantics instead of false-negative `no` for camera/enumerate capability fields.
- [x] Preserved passive detection behavior (no auto `getUserMedia` prompt on modal open) while keeping capture defaults derived from inferred capability + mobile context.
- [ ] Next: add optional interactive `Probe camera now` action (user initiated) to validate runtime stream acquisition and show a post-click capability confirmation state.

## 2026-04-23 — Register modal detection hardening for iPhone/iPad sessions (active)
- [x] Replaced naïve UA-only device classification in `RegisterNodeModal` with multi-signal browser context detection (UA + touch points + coarse pointer + iPadOS-as-Mac heuristic + media API capability probes).
- [x] Added explicit capability diagnostics in detected-context panel (`hasCameraApi`, `hasEnumerateDevices`, `hasScreenCaptureApi`, likely mobile/safari/platform) while keeping detection passive (no `getUserMedia` prompt on open).
- [x] Updated default registration bias to derive from `isLikelyMobile && hasCameraApi`, so likely mobile camera-capable sessions start capture-oriented (`source_kind=capture`, `can_proxy_streams`, runner/capture roles).
- [x] Added `Configure as camera device` action to apply capture defaults on demand without removing manual overrides.
- [ ] Next: tune additional iOS webview heuristics (if available) for embedded-browser UA reduction edge cases and capture one on-device validation snapshot after deployment.

## 2026-04-23 — Register modal authority-base correction + quick action follow-up (active)
- [x] Fixed Explorer register modal authority URL to use API authority base (connect-plane base) instead of frontend origin, preventing `:3000` registration command drift when API runs on `:8787`.
- [x] Added a quick `Register This Device` action in detected-context card for one-click submission while keeping generated JSON/curl/fetch outputs visible.
- [x] Added a `Register from another device` connect-link block with copy action to support LAN onboarding workflows.
- [ ] Next: add an optional post-register toast that includes accepted `node_id` and resolved authority host for operator confirmation.

## 2026-04-23 — Explorer connect-plane register modal wiring (active)
- [x] Added Sources/Libraries operator action pair (`+ Register`, `Refresh`) with Register positioned left of Refresh in the existing sidebar meta line.
- [x] Added typed connect-plane registration request/response contracts for Explorer frontend (`types/registration.ts`).
- [x] Added `RegisterNodeModal` with device/context prefill, editable advanced fields, generated payload/curl/fetch snippets, and direct `/connect/register` submit path.
- [x] Extended Explorer API client with `registerNode(...)` to call `POST /connect/register` and provide status-aware error messages.
- [x] Wired modal success path to refresh runtime source/node control data so sidebar truth updates immediately after registration.
- [ ] Next: add a tiny inline success hint in Sources/Libraries summary when a registration was just accepted (node label + timestamp), then clear on next reload.

## 2026-04-23 — Hidden runtime project filtering follow-up (active)
- [x] Confirmed Explorer sidebar/runtime-aware source wiring is functioning and that observed `0 remote / 0 nodes` is expected when no remote participants are registered.
- [x] Fixed backend project enumeration to exclude hidden dot-prefixed directories (for example `.runtime`) from user-visible project listings.
- [x] Aligned library snapshot project enumeration with the same visibility guard so `/api/library` and `/api/projects` stay in sync.
- [x] Added regression tests for hidden runtime directory exclusion in both projects and library snapshot API surfaces.
- [ ] Next: add a lightweight operator note in README/API docs describing how to register a remote node and what sidebar counts should show before/after registration.

## 2026-04-23 — Runtime-aware source inventory merge (active)
- [x] Updated `/api/sources` to merge canonical authority-local sources from `SourceRegistry` with runtime-memory remote source-bearing participants registered through `/connect/register`.
- [x] Added runtime-aware source response enrichments (`kind`, `authority`, `owner_node_id`, `local_only`, `can_index`, `can_proxy`, `can_record`, `metadata`) for local vs remote source surfaces.
- [x] Added regression coverage proving `/connect/register` remote participants appear in `/api/sources` alongside canonical local sources.
- [ ] Next: extend Explorer API seam and Sources & Nodes modal to consume merged runtime-aware source inventory.
- [ ] Next: validate ingest claims against registered remote source ownership (`node_id` + `source_name`) before later acceptance phases.

## 2026-04-23 — Connect-plane onboarding bridge (active)
- [x] Added `/connect` discovery manifest covering runtime identity, capabilities, source records, and operational endpoints.
- [x] Added `/connect/register` onboarding so remote non-authority runtimes can register as source-bearing participants without mutating canonical `SourceRegistry` shape.
- [x] Kept connect-plane separate from ingest-plane; registration persists node + runtime-memory source-bearing representation only.
- [x] Added `remote_source_records` metadata lane and health exposure for connect readiness + remote source count.
- [x] Added `/connect` API regression tests for text/json/html discovery and registration path behavior.
- [ ] Next: add runtime-aware source inventory endpoint that merges canonical local sources with connect-registered remote source participants.
- [ ] Next: surface connect participants in Explorer sources/nodes views.

## 2026-04-22 — PR #161 close-out pass (runtime composition proof + ingest readiness) (active)
- [x] Added health/runtime ingest readiness markers (`ingest_claims_enabled`, `runtime_services.*`) so operations can verify ingest-plane wiring at runtime.
- [x] Added explicit runtime composition assertion test for `node_registry`, `ingest_registry`, and `ingest_claim_service` on startup.
- [x] Added permanent backend README note that `/api/nodes` is control-plane, `/api/ingest/claims` is ingest-plane, and local observation is not canonical by default.
- [ ] Next: after PR #161 merge, implement runner-side claim submission from a real local adapter/spool path with retries.

## 2026-04-22 — Ingest-claim contract boundary for PR #161 (active)
- [x] Preserved landed runtime/node control-plane foundation and added first-class ingest-claim domain models (`AssetCandidate`, `IngestClaim`, `AcceptanceReport`).
- [x] Added persisted authority ingest ledger (`IngestClaimRegistry`) under `_runtime/ingest_claims/<claim_id>.json`.
- [x] Added authority intake service (`IngestClaimService`) and `/api/ingest/claims` submit/list/get routes.
- [x] Wired ingest registry/service into `AppRuntime` composition so ingest contracts are runtime-owned rather than ad-hoc route state.
- [x] Added ingest API tests covering submit success, list/get, invalid payload rejection, runtime wiring, and deferred (non-canonical) authority decisions.
- [ ] Next: add runner-side local adapter path that emits real ingest claims from observed/staged media.
- [ ] Next: add authority accept/reject transition endpoints + offline expiry policy for stale claims.

## 2026-04-22 — Runner-ready runtime follow-on (active)
- [x] Added typed runtime-facing `SourceRecord` abstraction to distinguish canonical vs runner-local vs ephemeral source intent without breaking existing `SourceRegistry` storage shape.
- [x] Added lightweight async control-plane client for node self-registration and heartbeat against authority `/api/nodes`.
- [x] Added background runner control loop so future runner deployments can self-register + maintain heartbeat without route-level glue.
- [x] Wired runtime start/stop to own upstream client and runner control lifecycle.
- [x] Added runtime-level tests for runner control registration/heartbeat behavior and health payload root assertion coverage.
- [ ] Next: add first explicit runner upload/report path for local ingest observations that should not become canonical until accepted by authority.
- [ ] Next: add authority-side node expiry/offline policy derived from `last_heartbeat_at`.

## 2026-04-22 — Node API validation hardening follow-up (active)
- [x] Addressed review bug: `claim` updates are now re-validated by constructing a new `NodeRecord` from merged payload before persistence, preventing invalid updates from silently poisoning registry rows.
- [x] Addressed review bug: `register` now catches `NodeRecord` validation failures and returns explicit 400 client errors instead of surfacing 500s for malformed payloads.
- [x] Tightened request schemas to use `NodeStatus` literals for register/claim status fields so invalid values fail fast at request validation.
- [x] Added regression coverage for invalid claim status behavior and register validation error mapping.
- [ ] Next: add a small endpoint-level error contract doc section for `/api/nodes` status codes in backend API docs/readme.

## 2026-04-22 — App runtime boundary + node control-plane bootstrap (active)
- [x] Added `app/runtime` composition package (`types`, `create_runtime`, `dependencies`) so FastAPI lifespan owns a single `AppRuntime` instance with async `start/stop` hooks.
- [x] Wired `app/main.py` lifespan to initialize runtime once, run/stop runtime-owned auto reindexer, and expose runtime identity in `/health`.
- [x] Added persisted runtime `NodeRegistry` + `/api/nodes` endpoints (register/list/get/claim/heartbeat) with early health/status/version/source-kind metadata fields.
- [x] Shifted long-lived route dependencies toward runtime-owned services by migrating source routes and library snapshot route to consume runtime registries/services instead of ad-hoc construction.
- [x] Added regression tests for node API behavior and runtime-enriched health payload.
- [ ] Next: extend Explorer API seam (`docker/packages/Explorer/src/api.ts`) with node client methods and add a small read-only node panel in Explorer sidebar.
- [ ] Next: design first typed `SourceRecord` abstraction for filesystem and capture-node sources while preserving current storage contract compatibility.

## 2026-04-18 — Thumbnail lifecycle completion pass (active)
- [x] Confirmed post-throttle regression: fallback-first render + boot queue cap reduced startup storm but left stale placeholders after scroll/remount because queue behavior was effectively one-shot.
- [x] Upgraded `useThumbnailQueue` from boot-only pass to lifecycle queue runner with requeue scheduling on viewport activity (scroll/resize), DOM mutation, and periodic idle passes.
- [x] Kept startup fan-out guardrails (fallback-first render + queue cap) while adding continuation for remaining sync targets (`hasRemaining` + delayed pass) and cached thumb node rehydration via repeated queue sync passes.
- [x] Expanded `__explorerThumbQueueDebug` payload with pass count + remaining sync targets to verify lifecycle progression on-device.
- [x] Updated static contracts to lock lifecycle queue markers (requeue delay, idle interval, mutation observer, viewport listeners, continuation checks).
- [ ] Next verification step: iPhone Safari grid/list run should progressively promote fallback cards while preserving low console-noise startup behavior; capture `__explorerThumbQueueDebug` progression across scroll.

## 2026-04-18 — Residual 2-event promise rejection suppression hardening (active)
- [x] Captured post-fanout residual state: startup console spam reduced to two same-timestamp generic `promise-rejection` events (`message: "Load failed"`, empty URL, non-explorer lane) with `suppressedDefault: true`.
- [x] Strengthened unhandled-rejection suppression path in `ExplorerApp` for the matched signature by using capture-phase listener registration and explicit default + propagation suppression (`preventDefault`, `stopPropagation`, `stopImmediatePropagation`, `returnValue = false`).
- [x] Kept existing debug visibility intact so the residual events remain inspectable in `__explorerNetworkFailureDebug` while browser default logging is further suppressed.
- [x] Updated static contracts to lock capture-phase unhandled-rejection listener wiring and suppression helper markers.
- [ ] Next verification step: reload iPhone Safari and confirm residual red `Load failed` console rows drop from 2→0 while `__explorerNetworkFailureDebug` still records the suppressed events.

## 2026-04-18 — Render-time native thumb-load suppression pass (active)
- [x] Re-audited post-queue behavior and confirmed card render lanes still assigned network thumb URLs directly to `<img src>` (`AssetGrid` / `AssetList`), which can bypass queue throttling and trigger startup browser-native fan-out.
- [x] Updated grid/list render paths to boot from local fallback thumb source while retaining real thumb URL in dataset attributes (`data-thumb-url`) for queue-owned promotion.
- [x] Removed now-stale `safeThumbUrl` derivation in `ExplorerApp` view-model shaping so render-time thumb ownership is unambiguous (fallback at render, queue promotion on sync).
- [x] Expanded Explorer static contracts to lock fallback-at-render image source markers and guard against reintroducing direct `safeThumbUrl` src assignment.
- [ ] Next verification step: on iPhone Safari verify `__explorerThumbQueueDebug.queueTargets` remains bounded and console `Load failed` count no longer scales 1:1 with total thumbable cards at initial paint.

## 2026-04-18 — Startup thumbnail fan-out throttling pass (active)
- [x] Verified remaining Safari `Load failed` flood pattern still matches boot-time thumbnail queue fan-out (counts align with thumbable asset total and trigger at initial load).
- [x] Hardened `useThumbnailQueue` startup scheduling to prioritize near-viewport thumb nodes and cap first-pass queue targets (`THUMB_QUEUE_BOOT_MAX_TARGETS`) instead of queueing every sync candidate immediately.
- [x] Added lightweight runtime queue attribution marker (`window.__explorerThumbQueueDebug`) exposing total/sync/near-viewport/queued counts for on-device evidence capture.
- [x] Updated Explorer static contracts to lock viewport-aware queue target selection markers and queue-target overlay gating.
- [ ] Next verification step: on iPhone Safari capture `__explorerThumbQueueDebug` + `__explorerNetworkFailureDebug` at first load and confirm promise-rejection count drops with near-viewport queueing.

## 2026-04-18 — Proxy/thumb canonical lane hardening follow-up (active)
- [x] Audited render-lane thumb usage after `img` search feedback and found proxy/snapshot seams still capable of trusting raw thumb dataset paths instead of live-rendered thumb sources.
- [x] Added `readRenderableCardThumbUrl(...)` in `SceneSnapshot` so proxy snapshot capture prefers live `currentSrc/src` (then fallback thumb) and no longer promotes raw `data-thumb-url` into proxy render state.
- [x] Hardened `ViewportProxyRenderer` thumb handling with `getRenderableThumbUrl(...)` normalization + HTML attribute escaping for ambient `<img src="...">` construction, and reused normalized thumb URL across active poster/image branches.
- [x] Updated Explorer static contracts to lock the new scene/proxy thumb normalization markers.
- [ ] Next verification step: re-run iPhone Safari repro and inspect whether proxy/ambient thumb lanes remain stable (no stale raw thumbnail path promotion) while promise-rejection suppression stays effective.

## 2026-04-18 — Promise-rejection noise suppression follow-up (active)
- [x] Confirmed remaining Safari console spam lane is generic `promise-rejection` with repeated `message: "Load failed"` and empty URL/stack metadata, while Explorer media lane remains zero.
- [x] Added narrow unhandled-rejection suppression predicate for the exact noisy signature (`Load failed`, no URL, no stack, not Explorer lane) and call `event.preventDefault()` only for that class.
- [x] Retained full attribution visibility by continuing to publish suppressed promise events into `window.__explorerNetworkFailureDebug` with explicit `suppressedDefault` marker.
- [x] Updated Explorer static contracts to lock the new rejection-signature predicate and suppression marker wiring.
- [ ] Next verification step: reproduce on iPhone Safari, confirm console flood is suppressed, and confirm `__explorerNetworkFailureDebug` still records suppressed rejection events for auditability.

## 2026-04-18 — Non-media load-failure attribution pass (active)
- [x] Confirmed on-device evidence that `window.__explorerLoadFailureDebug?.getSnapshot()` can remain zeroed (`totalEvents: 0`) while Safari console still emits repeated generic `Load failed` spam.
- [x] Added lightweight global network/resource attribution surface (`window.__explorerNetworkFailureDebug`) with bounded recent-event buffer, lane totals, and coarse lane classification (`next-static`, `next-hmr`, `script`, `stylesheet`, `font`, `sourcemap`, runtime/promise lanes).
- [x] Wired attribution capture across resource `error`, runtime `error`, and `unhandledrejection` so non-media/dev-tooling failures are visible even when Explorer media lanes remain quiet.
- [x] Updated Explorer static contracts to lock the new network attribution markers.
- [ ] Next verification step: capture Safari Network + `window.__explorerNetworkFailureDebug?.getSnapshot()` concurrently and isolate the dominant failing lane (`/_next/*`, sourcemap, HMR/eventstream, or other).

## 2026-04-17 — Final emitter-identification debug expansion (active)
- [x] Expanded `__explorerLoadFailureDebug` with bounded recent-event ring buffer (`recentEvents`), per-key suppression counts (`suppressedCount`), last dataset/path snapshots, and emitter totals to make the dominant failing resource lane explicit on-device.
- [x] Kept capture bounded/lightweight (max 80 recent rows) and retained existing suppression behavior, now with explicit per-event `suppressed` truth in the debug payload.
- [x] Updated Explorer static contracts to lock the expanded debug snapshot surface markers.
- [ ] Next verification step: run `window.__explorerLoadFailureDebug?.getSnapshot()` on device after reproducing spam and patch only the dominant remaining emitter lane.

## 2026-04-17 — Load-failure regression re-audit + emitter diagnostics hardening (active)
- [x] Re-audited prior load-failure protections in current repo truth: `__explorerLoadFailureDebug` export present, grid/list thumb handlers still stop native propagation, and off-DOM `new Image()` probing remains absent in `thumbnailLoader`.
- [x] Added emitter classification + suppression counters to `__explorerLoadFailureDebug` snapshots (`asset-grid` / `asset-list` / `proxy-render` / `other`) for on-device lane attribution.
- [x] Extended runtime suppression for media resource errors originating from explorer thumb/proxy surfaces at the global capture layer (`window` error capture) to reduce repeated generic Safari `Load failed` spam while preserving debug visibility.
- [x] Updated Explorer static contracts to lock the new load-failure emitter/suppression diagnostics markers.
- [ ] Follow-up: capture one device snapshot from `window.__explorerLoadFailureDebug.getSnapshot()` after full-grid scroll to confirm dominant emitter lane and whether any remaining spam is non-explorer.

## 2026-04-17 — Strict thumbability gate follow-up (active)
- [x] Added a shared frontend thumbability extension gate (`isThumbableRelativePath`) in `thumbnailLoader` to mirror backend thumbnail eligibility (`.mp4/.mov/.avi/.mkv/.jpg/.jpeg/.png/.heic`).
- [x] Updated `ExplorerApp` thumbnail candidate resolution to require thumbable relative-path eligibility before using `thumb_url`/`thumbnail_url`, with image-only stream fallback when not thumbable.
- [x] Kept thumbnail candidate policy centralized (`resolveThumbCandidateUrl`) and reused it in both dataset-signature + rendered card view-model paths.
- [x] Expanded static contracts to lock strict thumbability gate markers in both Explorer app and thumbnail loader.
- [ ] Follow-up: confirm on-device console/network no longer shows repeated non-thumbable thumbnail 400s (`Media type does not support thumbnails`) during all-project browsing.

## 2026-04-17 — Thumbnail request opt-in + restore-wins density hardening (active)
- [x] Added explicit thumb-candidate resolver in `ExplorerApp` so thumbnail requests are opt-in by media kind (`image`/`video`) and no fallback thumbnail URL is constructed for non-thumbable kinds.
- [x] Updated both dataset-signature and asset view-model thumbnail lanes to use the shared resolver, keeping request behavior consistent between queueing and rendered thumb sources.
- [x] Fixed post-restore density override by syncing `lastCommittedColumnsRef` when restored `gridColumnCount` is applied, preventing density controller bootstrap from re-seeding stale default columns.
- [x] Expanded Explorer static contracts to lock thumb opt-in resolver usage and restored-density ref sync markers.
- [ ] Follow-up: capture one device trace confirming no repeated non-thumbable `/thumbnails/...` 400 spam after entering all-project grid with mixed media.

## 2026-04-17 — Retained prefs save-path live-state regression fix (active)
- [x] Reworked retained prefs hydration gate from a passive ref to explicit state (`retainedPrefsHydrated`) so the save effect re-runs after hydration completion and cannot remain silently gated.
- [x] Confirmed save effect dependencies include all retained fields plus hydration state, ensuring density/overlay and other retained UI prefs persist from live hook-owned state changes.
- [x] Extended retained prefs debug payload with live hydration state on successful saves (`hydrated: retainedPrefsHydrated`) to support device-side verification of save attempts.
- [x] Updated Explorer static contracts to lock hydration-state save gating markers and retained-field dependency marker coverage.
- [ ] Follow-up: capture one physical-device interaction trace (`overlay toggle` + `density change`) with `__explorerRetainedPrefsDebug.lastSavedPayload` to archive proof in PR notes.

## 2026-04-17 — Retained prefs boot-order overwrite regression fix (active)
- [x] Fixed retained prefs boot ordering in `ExplorerApp` with an explicit hydration gate (`retainedPrefsHydratedRef`) so save-back cannot write default boot values before restore/migration completes.
- [x] Extended retained prefs debug surface (`window.__explorerRetainedPrefsDebug`) with hydration/save-skip markers to verify boot sequencing (`hydrated`, `saveSkippedUntilHydrated`).
- [x] Re-verified legacy fallback behavior remains gated to unified-payload absence only (legacy keys are read in the `else` branch when unified payload parsing does not produce an object).
- [x] Persisted prefs now survive reload without default overwrite (`gridColumnCount`, `overlayEnabled`, and other retained fields).
- [ ] Follow-up: capture one on-device boot snapshot from `__explorerRetainedPrefsDebug` after reload to archive proof before opening PR #159 scope.

## 2026-04-17 — PR #158 stability/hardening verification pass (active)
- [x] Hardened retained prefs restore safety by using non-throwing JSON object parsing (`parseStoredJsonObject`) so malformed retained payloads no longer block legacy fallback restore paths.
- [x] Added lightweight runtime prefs debug export (`window.__explorerRetainedPrefsDebug`) publishing restore source (`retained` / `legacy` / `none`), malformed retained payload flag, and last-saved payload snapshot.
- [x] Extended Explorer static contracts to lock parser usage, fallback source markers, and retained-prefs debug wiring.
- [x] Re-ran Explorer static contracts and library API tests after hardening changes.
- [x] Merge signal: PR #158 appears ready for merge after this stability pass (no new architecture lane introduced).
- [ ] Follow-up (next PR, not this one): perform on-device sanity capture for retained prefs + topbar behavior using runtime debug exports before starting PR #159 work.

## 2026-04-17 — Explorer retained UI prefs expansion (active)
- [x] Extended retained Explorer UI prefs storage to include `overlayEnabled`, `sortKey`, `typeFilter`, `selectedOnly`, and `untaggedOnly` alongside existing retained layout fields (`view`, `gridColumnCount`).
- [x] Hardened boot restore with field-level validation guards (type/sort enum checks + boolean checks + density clamping) so malformed payloads cannot break startup.
- [x] Added legacy fallback reads for prior filter/overlay preference keys when the new retained payload is absent, preserving existing user prefs during migration.
- [x] Expanded Explorer static contracts to lock retained key usage plus restore/save markers for the newly persisted fields.
- [ ] Intentionally ephemeral (not persisted): `actionsOpen`, `sidebarOpen`, `dragActive`, modal open/rendered state, and context-menu open state.

## 2026-04-17 — Explorer layout preference retention hardening (active)
- [x] Added dedicated layout preference storage key in `ExplorerApp` (`media-sync-explorer-layout-v1`) and restore/write-through wiring for `view` + `gridColumnCount`.
- [x] Added restore-time guards for malformed storage values and explicit mobile density clamping for persisted `gridColumnCount`.
- [x] Expanded Explorer static contracts to lock layout preference key usage and restore/save wiring markers.
- [ ] Follow-up: if future desktop-specific density bounds are introduced, split persisted clamp policy by viewport mode instead of reusing mobile min/max constants globally.

## 2026-04-17 — Hook-layer relocation + topbar scroll-source regression repair (active)
- [x] Relocated behavioral hook modules from `src/` root into `src/hooks/` (`useTopbarScrollState`, `useThumbnailQueue`, `usePendingComposeJobs`, `useAssetInteractions`) and updated all import paths/wiring.
- [x] Repaired topbar hide/reveal regression by wiring `useTopbarScrollState` to the actual scroll surface node (`mediaScrollViewportEl`) instead of relying on a ref object that may be null during initial effect binding.
- [x] Added callback-ref bridge in `ExplorerApp` (`setMediaScrollViewportNode`) to keep imperative ref consumers and hook-driven scroll listener binding synchronized.
- [x] Updated Explorer static/contract assertions to lock hook relocation paths and topbar hook wiring (`scrollEl: mediaScrollViewportEl`, `ref={setMediaScrollViewportNode}`) so stale root-level imports/scroll wiring cannot silently return.
- [ ] Follow-up: if topbar behavior still jitters on specific iOS inertial edge-cases, tune hysteresis/suppression constants only (no ownership-layer changes).

## 2026-04-17 — Aggregate snapshot thumbnail contract regression fix (active)
- [x] Fixed `/api/library` thumbnail contract divergence in `app/services/library_service.py`: `thumb_url` / `thumbnail_url` are now emitted only when `_is_thumbable_media(Path(relative_path))` is true (matching `list_media(...)` behavior).
- [x] Kept thumbnail endpoint behavior unchanged in this pass; primary fix is preventing invalid thumbnail URLs from being emitted for non-thumbable assets.
- [x] Added backend regression coverage in `tests/test_library_api.py` asserting thumbable assets include thumbnail aliases while non-thumbable assets do not.
- [ ] Follow-up: evaluate optional `/thumbnails/...` soft-fallback response for unsupported media types as a separate hardening pass (not required for contract correctness).

## 2026-04-17 — Explorer pending-entry TDZ ordering fix (active)
- [x] Fixed a render-time TDZ hazard in `ExplorerApp`: a `useEffect` dependency array referenced `pendingEntries.length` before `pendingEntries` declaration.
- [x] Kept the patch ordering-only (no behavior redesign) by moving the focus-world measurement effect below pending/rendered entry memo declarations.
- [x] Added static regression ordering guards in Explorer contract tests to ensure `pendingEntries` declaration appears before any `pendingEntries.length` dependency reference.
- [ ] Follow-up: keep declaration-order guards for render-evaluated dependencies when refactoring long `ExplorerApp` hook/effect blocks.

## 2026-04-17 — Deferred preview/focus domain mapping pass (active)
- [x] Mapped the remaining root-owned coupled domain in `ExplorerApp` as a single deferred architecture lane:
  - focus presentation state (`focusPresentationState`, `focusWorldTransform`)
  - cinematic/proxy travel ownership (`gridCinematicMode`, `proxyTravelState`, `cinematicRevealState`)
  - preview ownership/handoff refs (`previewPlaybackHandoffRef`, prewarm refs, authority-selection refs)
  - lifecycle timers/retry frames and coupled diagnostic channels.
- [x] Mapped nearby coupled behavior ownership that should move together (if extracted in future):
  - focus/proxy transition handlers (`runProxyFocusTransition`, close/reset lanes, retarget/recover lanes)
  - preview authority + autoplay rearm effects
  - coupled focus-layer diagnostics/debug exports.
- [x] Marked the deferred coupled domain directly in `ExplorerApp` with section labels so future extraction work can follow an explicit boundary without behavior drift.
- [x] Explicitly retained shell-owned seams:
  - `useLibrarySnapshot` → query/data authority
  - `useExplorerCommands` → command authority
  - `useExplorerUiState` → UI/runtime authority (including `inspectorOpen`).
- [x] Recommendation from this mapping pass: next chapter should be a dedicated preview/focus domain extraction design+implementation pass (Option A) before any live-source/stream platform pivot.
- [ ] Follow-up: draft the concrete extraction contract for a future dedicated preview/focus domain hook/module (proposed shape: state bag + transition orchestration + lifecycle cleanup API), then decide implementation timing vs platform pivot.

## 2026-04-17 — Explorer shell composition cleanup (authority-first sectioning) (active)
- [x] Performed a non-behavioral readability pass in `ExplorerApp` to section the shell by authority/domain (query/data, root-owned coupled state, UI-state seam, command seam, compose integration lane).
- [x] Added explicit in-file section markers to reduce cognitive interleaving and make authority boundaries easier to scan during future refactors.
- [x] Kept focus/cinematic/focus-world/proxy-handoff ownership lanes root-local in this pass (no extraction), preserving existing lifecycle coupling and behavior.
- [x] Confirmed `inspectorOpen` is no longer deferred (already hook-owned in prior pass) and kept deferred scope limited to tightly coupled focus/preview ownership state.
- [ ] Follow-up: if/when a dedicated focus/preview domain seam is designed, treat it as a separate architecture pass instead of incremental boolean extraction.

## 2026-04-17 — Explorer preview-shell seam probe (`inspectorOpen`) (active)
- [x] Evaluated preview-shell-adjacent inline root state for low-risk extraction and moved `inspectorOpen` ownership into `useExplorerUiState`.
- [x] Rewired `ExplorerApp` to consume `inspectorOpen`/`setInspectorOpen` from UI-state authority without changing focus/cinematic/handoff behavior.
- [x] Expanded static contracts to assert hook ownership and prevent reintroduction of inline `inspectorOpen` declaration in `ExplorerApp`.
- [ ] Deferred seam (intentional): keep focus/cinematic/focus-world/proxy-handoff state in root because those lanes remain behaviorally coupled to transition ownership.
- [ ] Follow-up: if additional preview-adjacent booleans are considered, only extract fields that can remain purely UI-state with no ownership/lifecycle coupling.

## 2026-04-17 — Explorer shell reduction (runtime/status + resolve/OBS UI seam) (active)
- [x] Expanded `useExplorerUiState` to own additional low-risk root-local UI/runtime state previously inline in `ExplorerApp` (`isMobile`, `touchPinchCapable`, `uploadStatus`, `contentLoading`, `pendingDataLoadOverlay`).
- [x] Extended the same seam with adjacent non-focus UI surface state (`resolveProjectMode`, `resolveProjectName`, `resolveNewName`, `resolveMode`, `previewObsMode`, `previewObsSlot`, `previewObsExclusive`) and rewired `ExplorerApp` to consume setters/values from the hook.
- [x] Updated Explorer static contracts to lock the expanded `useExplorerUiState` surface and prevent reintroduction of migrated inline `useState(...)` declarations in `ExplorerApp`.
- [ ] Follow-up: continue shell reduction for any remaining low-risk root-local UI-only toggles/status fields that are still inline, while intentionally deferring focus/cinematic/video-ownership/gesture internals.
- [ ] Deferred seam (intentional): keep focus/preview-adjacent ownership state (focus/cinematic/video handoff lanes) local until a dedicated preview-shell seam can be isolated without coupling risk.

## 2026-04-16 — Surface-toggle seam contract hardening (active)
- [x] Added explicit static contract guards asserting `ExplorerApp` no longer declares inline `sidebarOpen`/`actionsOpen`/`dragActive` state after `useExplorerUiState` migration.
- [x] Kept UI-only surface-toggle ownership in `useExplorerUiState` without behavior changes.
- [ ] Follow-up: keep adding negative ownership assertions as new root-local seams are extracted to prevent accidental inline reintroduction.

## 2026-04-16 — Render-order TDZ hardening + surface-toggle seam follow-up (active)
- [x] Fixed `ExplorerApp` render-time TDZ crash by ensuring `usePendingComposeJobs(...)` binding is declared before render-time pending compose consumers (`visiblePendingComposeItems` + related pending compose effects/memos).
- [x] Added static contract guard asserting `usePendingComposeJobs(...)` declaration appears before `visiblePendingComposeItems` memo in `ExplorerApp`.
- [x] Preserved prior surface-toggle seam extraction (`sidebarOpen`, `actionsOpen`, `dragActive`) in `useExplorerUiState` with unchanged behavior.
- [ ] Follow-up: evaluate splitting remaining preview-shell-adjacent UI booleans (`inspectorOpen` and related toggles) into a dedicated seam only if it can be done without entangling focus/cinematic ownership lanes.

## 2026-04-16 — Explorer shell reduction (surface-toggle seam) (active)
- [x] Expanded `useExplorerUiState` to own adjacent UI-only surface toggles (`sidebarOpen`, `actionsOpen`, `dragActive`) alongside existing preference/modal/context state.
- [x] Migrated `ExplorerApp` to consume surface-toggle state through `useExplorerUiState`, removing inline root declarations while preserving behavior/wiring.
- [x] Updated static contracts to assert the expanded UI-state hook surface includes the migrated surface-toggle fields.
- [ ] Follow-up: evaluate whether remaining root-local UI booleans (`inspectorOpen` and closely related preview-surface toggles) should be split into a dedicated preview-shell seam or intentionally kept local.

## 2026-04-16 — Explorer shell reduction (topbar/density/filter preference seam) (active)
- [x] Expanded `useExplorerUiState` to own topbar/density/filter/view preference state (`view`, `query`, `typeFilter`, `sortKey`, `selectedOnly`, `untaggedOnly`, `gridColumnCount`, `overlayEnabled`, `topbarHasOpenDropdown`, `topbarFocusWithin`) with configurable defaults.
- [x] Migrated `ExplorerApp` to consume the expanded UI-state seam via `useExplorerUiState({ defaultView, defaultGridColumns })` while preserving existing behavior/wiring.
- [x] Updated static contracts to assert expanded UI-state seam fields and adjusted topbar/density/compose/delete assertions to follow hook-owned state locations.
- [x] Follow-up completed in later pass: extracted adjacent UI-only project/surface toggles (`sidebarOpen`, `actionsOpen`, `dragActive`) into `useExplorerUiState`.

## 2026-04-16 — Explorer shell reduction (UI state seam start) (active)
- [x] Added `useExplorerUiState` hook under `src/hooks/` to own modal/context/detail state cluster previously declared inline in `ExplorerApp`.
- [x] Migrated `ExplorerApp` to consume `useExplorerUiState` for preview-details, context-menu, compose modal state, delete modal state, and pending-delete-key state while preserving existing behavior.
- [x] Added static contracts to assert `useExplorerUiState` import/wiring from `ExplorerApp` and hook-owned modal/context/detail state fields.
- [x] Follow-up completed in later pass: extracted adjacent topbar/density/filter preference state clusters into `useExplorerUiState`.

## 2026-04-16 — External integration command-lane extraction (active)
- [x] Added `sendToProgramMonitorCommand(...)` and `pushToObsCommand(...)` to `useExplorerCommands` so focused external dispatch side effects execute inside the command boundary.
- [x] Migrated `ExplorerApp` focused Program Monitor handoff lane to command-hook execution, removing root-owned popup/postMessage side-effect flow.
- [x] Migrated `ExplorerApp` focused OBS push lane to command-hook execution, removing root-owned OBS helper resolution and success/error try/catch ownership.
- [x] Expanded Explorer static contracts to assert new integration command verbs and root wiring via command methods.
- [ ] Follow-up: evaluate command-lane extraction for remaining non-mutation utility side effects (clipboard copy lanes) only if they begin to accumulate custom error-policy branching.

## 2026-04-16 — Upload command-lane extraction (active)
- [x] Added `uploadMediaCommand(...)` and `uploadMediaBatchCommand(...)` to `useExplorerCommands` so upload API execution, error toasts, and scoped refresh aftermath are command-owned.
- [x] Migrated `ExplorerApp` single-file upload handler to delegate API execution/outcome handling through `uploadMediaCommand(...)` while keeping local upload-status UI ownership in root.
- [x] Migrated drag/drop upload handler to delegate per-file upload execution through `uploadMediaBatchCommand(...)` and removed root-level upload mutation `api.*` try/catch ownership.
- [x] Expanded Explorer static contracts to assert upload command surface presence and root wiring through command methods.
- [x] Follow-up completed in later pass: focused external side-effect lanes (program-monitor handoff + OBS push) now route through command verbs.

## 2026-04-16 — Compose submit command-lane extraction (active)
- [x] Added `composeMediaCommand(...)` to `useExplorerCommands` so compose request execution + success/error toasts are command-owned instead of root-owned.
- [x] Migrated `ExplorerApp` compose-confirm submit path to call `composeMediaCommand(...)` and only keep modal/pending-job UI wiring in root.
- [x] Expanded Explorer static contracts to assert `composeMediaCommand` wiring in `ExplorerApp` and implementation presence in `useExplorerCommands`.
- [x] Follow-up completed in later pass: upload mutation API lanes (`handleUpload`, drag/drop upload) now route through command-hook verbs.

## 2026-04-16 — Focused resolve command-lane extraction (active)
- [x] Added `resolveMediaCommand(...)` to `useExplorerCommands` so resolve-side effects + outcome toasts no longer require root-owned API try/catch blocks.
- [x] Migrated both bulk `handleResolve` and focused `handleFocusedResolve` flows in `ExplorerApp` to command-hook resolve execution.
- [x] Reduced root-level resolve mutation branching to payload assembly + guard checks, with command lane handling request outcome reporting.
- [x] Expanded Explorer static contracts to assert `resolveMediaCommand` wiring from `ExplorerApp` and command-hook implementation presence.
- [ ] Follow-up: evaluate moving resolve payload-shape assembly helpers into command hook once UI mode inputs are normalized.

## 2026-04-16 — Compose aftermath command-lane extraction (active)
- [x] Reordered command-hook wiring so `usePendingComposeJobs` completion aftermath now calls `useExplorerCommands.handleComposeCompletion`.
- [x] Removed compose completion refresh/toast ownership from root inline callback, routing completion aftermath through command authority.
- [x] Kept compose refresh strategy aligned with command policy (`refreshAfterScopedMutation` inside `useExplorerCommands`).
- [x] Added static contract assertions for compose completion callback wiring through `handleComposeCompletion`.
- [ ] Follow-up: continue extracting any remaining focused mutation aftermath lanes that still bypass command hook ownership.

## 2026-04-16 — Mutation authority continuation pass (active)
- [x] Extended `useExplorerCommands` with shared mutation aftermath utilities (`refreshAfterMutation`, `tagSingleMediaItem`) to centralize scoped-vs-full refresh decisions.
- [x] Migrated upload aftermath lanes (`handleUpload`, drag/drop upload) to command-hook refresh strategy instead of direct root-level `loadMedia(project)` calls.
- [x] Migrated focused single-asset tag mutation to command hook (`tagSingleMediaItem`) so focused tagging follows the same scoped aggregate refresh contract.
- [x] Added static contract assertions for new command-hook usage in upload/focused-tag pathways and exported mutation refresh helper presence.
- [ ] Follow-up: continue extracting remaining focused mutation aftermath handlers (resolve/obs-adjacent tag/move/delete edges) into `useExplorerCommands`.

## 2026-04-16 — Scoped aggregate refresh + command extraction pass (active)
- [x] Hardened `/api/library` source visibility for `scope=all` by including disabled sources in the `sources` envelope while still filtering project/asset expansion to enabled+accessible sources.
- [x] Reused media relative-path validation in aggregate snapshot assembly so malformed/traversal `relative_path` entries are skipped before stream/download/thumbnail URL emission.
- [x] Extended aggregate endpoint to support `scope=project` with required `project` query and optional `source`, keeping the same top-level envelope shape.
- [x] Migrated Explorer scoped refresh lane (`refreshMediaForScope`) to use scoped aggregate snapshots instead of raw per-project list fanout.
- [x] Introduced `useExplorerCommands` and moved high-churn mutation orchestration (bulk move, bulk tag, bulk delete refresh logic) out of `ExplorerApp`.
- [x] Added backend tests for scoped aggregate success, missing-project rejection, disabled source visibility, and invalid-relative-path filtering.
- [x] Added Explorer static contract coverage for command extraction and scoped aggregate refresh usage.
- [ ] Follow-up: migrate remaining single-project mutation aftermath lanes (compose completion + focused action handlers) to `useExplorerCommands`.
- [ ] Follow-up: consider typed backend response models for `/api/library` (`LibrarySnapshot` pydantic schema family).

## 2026-04-16 — Explorer snapshot authority shift completion pass (active)
- [x] Refactored `useLibrarySnapshot` into a stateful authority hook that owns snapshot payload slices (`sources`, `projects`, `assets`, `jobs`, `generatedAt`) plus loading/error lifecycle.
- [x] Preserved single-flight refresh semantics in the authority hook while adding explicit `applySnapshot(...)` and `clearSnapshotError()` helpers.
- [x] Removed `ExplorerApp` boot dependency on `Promise.allSettled([loadSources(), loadProjects()])` and replaced it with one aggregate `refreshLibrarySnapshot({ scope: 'all' })` path.
- [x] Removed standalone `loadSources`/`loadProjects` fetch ownership from `ExplorerApp`; aggregate refresh now hydrates authoritative data via hook state.
- [x] Kept project-scoped delta lanes (`loadMedia(project)`, `refreshMediaForScope`) intact for mutation aftermath while consolidating all-project hydration against hook-owned assets.
- [x] Added static contract coverage for authority hook state surface and single aggregate boot/refresh path assertions in Explorer package tests.
- [ ] Follow-up: evaluate scoped aggregate backend refresh (`/api/library?scope=project`) to replace remaining project-delta re-fetch calls when mutation throughput grows.
- [ ] Follow-up: extract mutation command lane (`useExplorerCommands`) after snapshot authority lane proves stable on-device.

## 2026-04-16 — Aggregate library snapshot lane (active)
- [x] Added backend aggregate snapshot service + API route for Explorer (`GET /api/library?scope=all`) with source/project/asset flattening and generated timestamp payload.
- [x] Registered the new library router in FastAPI app bootstrap so the endpoint is available without touching legacy media/project routes.
- [x] Added backend tests for aggregate payload shape and unsupported-scope rejection behavior.
- [x] Added Explorer API client + types for `LibrarySnapshot` and introduced a single-flight `useLibrarySnapshot` hook.
- [x] Rewired Explorer aggregate load path to consume the snapshot endpoint for source/project/all-media loading and refresh dedupe toast operation key.
- [ ] Follow up by migrating remaining per-project refresh lanes (`refreshMediaForScope`) to snapshot-delta or backend scoped aggregate refresh.
- [ ] Split command mutations into `useExplorerCommands` and isolate UI-only state into `useExplorerUI` once snapshot loading is stabilized on-device.

## 2026-04-13 — Off-DOM thumbnail loader mismatch acknowledgment + verification follow-up (active)
- [x] Explicitly acknowledged prior summary/code mismatch: previous rollout summary claimed off-DOM probe removal while device evidence still showed `const loader = new Image()` in `thumbnailLoader.ensureThumbLoad`.
- [x] Re-verified repository truth that `ensureThumbLoad(...)` no longer creates synthetic image objects and now binds `load`/`error` listeners on the rendered target `<img>` node.
- [x] Re-verified static regression assertion preventing reintroduction of `const loader = new Image();` in package thumbnail loader contracts.
- [ ] Capture fresh on-device startup logs against this exact commit and confirm whether repeated generic `Load failed` rows are eliminated vs reduced.

## 2026-04-13 — Off-DOM thumbnail probe lane root-cause correction (active)
- [x] Identified non-settled thumbnail fetch lane in `thumbnailLoader.ensureThumbLoad` using off-DOM `new Image()` probes as likely source of repeated status-0 hashed `.jpg` startup noise.
- [x] Replaced off-DOM probe loader with in-DOM target-event loading (`target.addEventListener('load'/'error')` + direct `target.src` assignment) so thumbnail truth follows rendered card elements.
- [x] Kept thumbnail cache/inflight semantics while removing off-DOM probe object creation to reduce duplicate/transient image request churn.
- [x] Expanded static contracts to lock absence of `new Image()` in the package thumbnail loader and require in-DOM target load/error listeners.
- [ ] Validate on device startup that status-0 unknown `.jpg` rows and repeated `Load failed` spam are eliminated (or materially reduced) after off-DOM probe removal.

## 2026-04-13 — Startup `Load failed` emitter traceability + spam suppression follow-up (active)
- [x] Added runtime global resource-error capture export (`window.__explorerLoadFailureDebug`) in `ExplorerApp` with deduped key/count/tag/url/class snapshots.
- [x] Hardened grid/list thumbnail onError handlers to stop native error propagation (`stopImmediatePropagation`/`stopPropagation`) before fallback swap, reducing generic repeated tool-level `Load failed` noise from the same failed asset.
- [x] Expanded static contracts to lock load-failure debug export wiring and native propagation stop guards in both thumbnail card components.
- [ ] Capture one startup snapshot from `window.__explorerLoadFailureDebug?.getSnapshot()` on device and confirm whether remaining `Load failed` events originate from non-thumbnail resources.

## 2026-04-13 — List/grid thumbnail URL authority + load-failure fallback hardening (active)
- [x] Unified Explorer thumbnail URL authority to always run through `normalizeThumbUrl(...) -> resolveAssetUrl(...) -> absolutizeMediaUrl(...)` for both dataset signatures and rendered card thumbs.
- [x] Added defensive thumbnail `<img>` error fallback handlers in both `AssetGrid` and `AssetList` to clear retry loops (`onerror = null`) and swap to dataset fallback image.
- [x] Expanded static contracts to lock absolute thumbnail URL generation in `ExplorerApp` and fallback error-handler wiring in grid/list card components.
- [ ] Validate on mobile startup that repeated list-view thumbnail `Load failed` console noise is eliminated and fallback imagery appears deterministically for missing thumbs.

## 2026-04-12 — Page-level viewport contract + debug exposure follow-up (active)
- [x] Tightened App Router viewport contract in `app/layout.tsx` with explicit zoom bounds (`minimumScale:1`, `maximumScale:1`, `userScalable:false`) for deterministic mobile page-scale behavior.
- [x] Upgraded Explorer visual-viewport effect to publish runtime page-level viewport diagnostics (`__explorerViewportDebug`) including viewport meta content, visual viewport metrics, inner/client dimensions, and computed `pageScaleLike`.
- [x] Kept `--explorer-visual-viewport-height` sync as part of the snapshot capture lane and added cleanup for debug export on unmount.
- [x] Expanded static contracts to lock the stricter viewport meta fields and the new page-level viewport debug export fields.
- [ ] Validate on plain iPhone Safari (no inspector overlay) whether remaining zoom is resolved and capture `window.__explorerViewportDebug?.getSnapshot()` evidence if not.

## 2026-04-12 — Editable-lane unscaled iPhone zoom suppression correction (active)
- [x] Removed coarse-pointer transform scaling from `.search-input-wrap` and retained unscaled editable search lane authority.
- [x] Kept mobile-safe editable controls at `font-size: 16px` while increasing search input comfort lane (`min-height: 32px`, `line-height: 1.2`) to avoid tiny rendered focus targets.
- [x] Preserved compact topbar feel by shrinking non-editable chrome only (search shell padding/gap, kbd chip styling, search-toolbar control sizing).
- [x] Updated Explorer static contracts to assert wrapper remains unscaled (`transform:none`) and prevent regression back to wrapper-scale compacting.
- [ ] Validate on physical iPhone Safari (without inspector console focus lane) that Explorer search focus no longer triggers page zoom.

## 2026-04-12 — iPhone-safe compact input zoom suppression follow-up (active)
- [x] Narrowed mobile zoom guard to editable controls only (no blanket `.control` scaling) so non-editable chips/buttons keep compact sizing authority.
- [x] Added search-field wrapper lane (`.search-input-wrap` + `.search-input`) and coarse-pointer compact visual scale contract (`scale(0.86)`) while preserving actual editable font-size at `16px`.
- [x] Added compact shell adjustments for coarse-pointer search chrome (reduced gap/padding/min-height and chip scaling) to keep topbar density close to prior visual weight.
- [x] Added placeholder-opacity compact styling for coarse-pointer editable controls while retaining `16px` technical font-size authority.
- [x] Expanded static contracts to lock wrapper class wiring + compact-scale CSS lane so future refactors do not regress to sub-16 editable font sizing.
- [ ] Validate on physical iPhone Safari that focused search/modal/drawer controls no longer trigger auto-zoom while visual size remains compact and caret interaction remains acceptable.

## 2026-04-12 — Keyboard viewport + list-thumb load-failure hardening (active)
- [x] Added Explorer visual-viewport height sync lane (`window.visualViewport` resize/scroll/orientation + window resize fallback) and CSS variable wiring so app shell sizing follows keyboard-induced visible viewport changes.
- [x] Added coarse-pointer input font-size guard rails (`16px`) for search/control/modal form controls to suppress iOS focus auto-zoom triggers.
- [x] Fixed localhost thumbnail URL normalization to preserve API port (`:8787` etc.) when remapping to current LAN host, preventing list-view thumbnail request failures on split-origin hosts.
- [x] Expanded Explorer static regression contracts for visual-viewport wiring, coarse-pointer input guard rails, and localhost thumb remap port preservation.
- [ ] Device-verify on physical iPhone Safari that keyboard open/close no longer causes perceived page zoom/jump and list-view initial render shows no bulk thumbnail `Loading Failed` entries.

## 2026-04-12 — RAF lane audit + focus-world idle blocking (active)
- [x] Audited `requestAnimationFrame` usage in `ExplorerApp` focus/cinematic ownership paths and replaced direct calls with lane-tagged scheduling/cancel helpers.
- [x] Added per-lane RAF runtime debug breakdown in `window.__explorerRafDebug` (`raf-lane-proxy-active-card`, `raf-lane-focus-world`, `raf-lane-cinematic-reveal`, `raf-lane-measurement`, `raf-lane-other`) with scheduled/completed/canceled/inFlight counters.
- [x] Added idle-state guards + markers for focus-world lanes (`focus-world-stage-idle-raf-blocked`, `focus-world-stage-idle-measure-blocked`) and cleared queued focus/measurement retry RAF frames on reset.
- [x] Hardened transition interruption in `FocusTransitionOrchestrator` to kill active world/chrome tweens and publish continuity marker `proxy-transition-interrupted`.
- [x] Expanded static contract tests for RAF lane debug wiring and orchestrator interruption tween-kill marker contracts.
- [ ] Device-verify RAF stack probe no longer climbs under repeated open/refocus/close churn and capture lane-level `__explorerRafDebug.lanes` evidence during idle/focused transitions.

## 2026-04-11 — Media invariant stale-closure fix (active)
- [x] Fixed `publishMediaInvariantDebug` stale-closure dependency gap by including focused ownership inputs (`view`, `inspectorOpen`, `gridCinematicMode`) alongside `activeAssetKey`.
- [x] Updated static regression contract to lock the widened `useCallback` dependency list for `publishMediaInvariantDebug`.
- [ ] Re-verify on device close/reopen-same-asset flow that `__explorerMediaDebug.focusedProxyPlaybackOwned` tracks real focus ownership transitions without stale lag.

## 2026-04-10 — Preview interruption/cancellation hardening (active)
- [x] Added explicit latest-preview-wins interruption markers in `useVideoOwnershipHandoff` (`preview-session-interrupted`, `preview-session-superseded`, `preview-session-commit-blocked-stale`, `preview-session-latest-commit`).
- [x] Added per-run monotonic version guarding in `useVideoOwnershipHandoff` so stale async paths (first-frame/visible-paint/play rejection) cannot commit after superseding selection.
- [x] Added `ExplorerApp` preview selection interruption markers (`preview-selection-interrupt-previous`, `preview-selection-new-authority`, `preview-selection-play-rearm`) and authority invalidation on selection supersede (clear stale handoff/prewarm refs + rearm play token).
- [x] Added renderer lifecycle markers for rapid-selection node reuse rearm and stale selection handoff (`proxy-video-rearm-latest-selection`, `proxy-video-stale-selection-blocked`).
- [x] Expanded static regression contracts to lock interruption markers across ExplorerApp/handoff hook/renderer.
- [ ] Device-verify rapid multi-asset preview cycling no longer lands in visually-selected-but-never-plays stale session state.

## 2026-04-10 — Retained proxy inert hit-ownership fix (active)
- [x] Narrowed remaining post-close interaction lock to retained proxy hit ownership (`.proxy-render-card.is-ambient` still winning hit-tests after visual close).
- [x] Hardened `FocusTransitionOrchestrator.closeFocusTransition(...)` to transition retained proxy into explicit inert state (`data-proxy-retained-inert="true"`) while preserving mounted continuity.
- [x] Added orchestrator close markers for retained inertness + hit ownership revocation (`orchestrator-close-retained-inert`, `orchestrator-close-hit-ownership-revoked`, `orchestrator-close-ambient-disabled`).
- [x] Added CSS contract to force retained proxy subtree inertness (`pointer-events:none !important` for root/surface/world/layers/cards when retained-inert).
- [x] Extended close debug flow in `ExplorerApp` with hit-ownership verification markers (`focus-close-proxy-hit-owner-still-present`, `focus-close-grid-hit-owner-restored`, `focus-close-retained-proxy-inert`) and focus-layer snapshot fields (`proxyLayerMounted`, `proxyLayerActive`, `retainedProxyInert`, `gridShouldOwnHits`).
- [x] Expanded static regression contracts for retained inert markers, retained-inert dataset wiring, and inert CSS selectors.
- [ ] Device-verify that post-close taps never resolve to `.proxy-render-card.is-ambient` and grid assets remain sole hit owners after repeated close/reopen cycles.

## 2026-04-10 — Focused close activation-reset follow-up (active)
- [x] Isolated post-close stale activation-state lane in `ExplorerApp` where visual close could settle while active/preview emphasis state remained armed.
- [x] Hardened close path to explicitly clear activation/emphasis lanes on close (`activeAssetKey`, `previewActivationKey`, `reinforcedActiveKey`, `holdEmphasisKey`) with dedicated close markers.
- [x] Added close activation-reset markers (`focus-close-cleared-active-asset`, `focus-close-cleared-preview-activation`, `focus-close-cleared-reinforced-active`, `focus-close-cleared-hold-emphasis`, `focus-close-activation-reset-complete`) for runtime triage.
- [x] Cleared pending preview handoff state during close activation reset to avoid stale reopen semantics.
- [x] Extended `__explorerFocusLayerDebug` snapshot with activation-state fields (`activeAssetKey`, `previewActivationKey`, `reinforcedActiveKey`, `holdEmphasisKey`).
- [x] Expanded static regression contracts to lock activation-reset markers and debug field threading.
- [ ] Validate on device that purple active border clears immediately on close and first/second tap preview flow re-arms from clean grid rest state.

## 2026-04-10 — Focused close-state reset hardening (active)
- [x] Audited `ExplorerApp` close/reset ownership paths (`closeDrawer`, `closeGridFocusToRest`, focus reset helpers) and added explicit close markers (`focus-close-start`, `focus-close-complete`, `focus-close-reset-rest`, `focus-close-reset-missed`, `focus-close-scroll-lock-removed`).
- [x] Added defensive close-settle fallback timer so missed close completion cannot leave `grid-closing`/non-idle proxy travel stuck; fallback forces reusable rest state.
- [x] Centralized close rest settlement in `commitCloseStateToRest(...)` to guarantee `gridCinematicMode='grid-rest'`, `proxyTravelState='idle'`, and viewport scroll-lock removal.
- [x] Extended runtime focus-layer debug snapshot with close-state observability fields (`proxyRootActive`, `scrollLockActive`).
- [x] Hardened `FocusTransitionOrchestrator.closeFocusTransition(...)` with explicit close markers (`orchestrator-close-start`, `orchestrator-close-complete`, `orchestrator-close-pointer-reset`, `orchestrator-close-retained`) and pointer-reset telemetry.
- [x] Expanded static regression contracts to lock close markers and rest-reset/scroll-lock removal contracts.
- [ ] Validate on physical iPhone Safari that repeated open/close cycles never leave Explorer in non-reopenable stuck state.

## 2026-04-10 — Focused proxy media authority follow-up (active)
- [x] Tightened `ExplorerApp` runtime media invariant diagnostics with explicit offender flags (`unauthorizedGridThumbPlaying`, `unauthorizedPrewarmPlaying`) and threaded them into `__explorerMediaInvariantViolation`.
- [x] Strengthened grid-thumb authority enforcement markers/behavior (`grid-thumb-paused-authority-enforced`, `grid-thumb-play-blocked-non-authoritative`) including immediate pause/reset on blocked play attempts.
- [x] Suppressed grid thumb preview lane while focused proxy ownership is active by gating `activeVideoPreviewUrl` with focused proxy authority state.
- [x] Converted proxy prewarm lane to non-authoritative metadata prep only (`preload="metadata"`) and added explicit pause/release/blocked markers (`prewarm-video-paused`, `prewarm-video-released`, `prewarm-video-blocked-non-authoritative`).
- [x] Expanded static regression contracts in `docker/packages/Explorer/tests/exports.test.mjs` to lock the new authority markers and invariant fields.
- [ ] Re-verify on physical mobile Safari that focused proxy playback remains the sole active lane after rapid close/reopen and asset retarget churn.

## 2026-04-10 — Explorer TDZ regression fix (active)
- [x] Fixed runtime `ReferenceError: Cannot access uninitialized variable` in `ExplorerApp` by moving `runProxyFocusTransition` below newly introduced media-authority helpers so dependency capture no longer references `pauseNonAuthoritativeGridVideos` before initialization.
- [x] Added static ordering contract in `docker/packages/Explorer/tests/exports.test.mjs` asserting `pauseNonAuthoritativeGridVideos` declaration appears before `runProxyFocusTransition`.
- [ ] Re-verify on mobile Safari that Explorer boots without error overlay before continuing media leak validation loops.

## 2026-04-10 — Explorer media lifecycle hardening (active)
- [x] Added authoritative proxy release lifecycle in `ViewportProxyRenderer` (`pause`/mute, `removeAttribute('src')`, `load()`, remove) with explicit lifecycle markers (`proxy-video-released`, `proxy-video-removed-src`, `proxy-video-load-reset`, `proxy-video-reused`).
- [x] Added grid-thumb authority enforcement in `ExplorerApp` via `pauseNonAuthoritativeGridVideos(...)` so focused proxy transitions/promotion pause/reset non-authoritative thumb videos.
- [x] Added runtime media invariant debug payloads/markers in `ExplorerApp` (`__explorerMediaDebug`, `__explorerMediaInvariantViolation`, `grid-thumb-paused-non-authoritative`) to surface multi-video leaks quickly.
- [x] Hardened `useVideoOwnershipHandoff` cleanup with `releaseProxyVideoResources(...)` so disconnected/no-selection paths release decode resources, not just listeners.
- [x] Expanded static export contracts in `docker/packages/Explorer/tests/exports.test.mjs` to lock proxy release markers, src+load reset lifecycle, and grid authority helpers.
- [ ] Validate on physical mobile Safari that repeated focused preview switching keeps `playingVideos <= 1` after settle and no longer crashes/reloads under churn.

## 2026-04-08 — Focused hit-target contract hardening (active)
- [x] Extracted focused tap hit resolution into `resolveFocusedTapTarget(...)` with explicit contract comment (`asset tap => retarget`, `empty-space => close`, wrappers non-primary).
- [x] Routed `ExplorerApp` focused pointer handling through the resolver to keep classification authority centralized and resistant to incidental refactors.
- [x] Added explicit renderer/style contract comments so wrapper/card pointer ownership intent is visible at fragile seams.
- [x] Expanded static contracts to lock resolver import/usage and helper classification branches (`proxy-card-root`, `proxy-card-child`, `proxy-surface`, `body`).
- [ ] Add one runtime interaction test (focused ambient retarget vs true empty-space close) when an executable UI harness is available in-repo.

## 2026-04-08 — Focused proxy ambient hit-target ownership pass (active)
- [x] Make proxy ambient/active card roots explicit direct hit targets with stable `data-selection-key` + `data-proxy-hit-target` markers in `ViewportProxyRenderer`.
- [x] Move focused proxy pointer ownership off full-screen decorative wrappers and onto cards/interactive preview controls (`pointer-events` contract updates in styles).
- [x] Add focused tap runtime markers for surface/body/card-root/card-child hit attribution and empty-space post-surface/body diagnostics.
- [x] Expand Explorer static contracts to lock renderer hit-target markers, focused tap markers, and proxy-layer pointer-event ownership selectors.
- [ ] Validate on physical iPhone Safari that surrounding ambient-card taps now resolve to `.proxy-render-card[data-selection-key]` and retarget without entering `grid-closing`.

## 2026-04-08 — Focused asset-vs-empty-space tap contract pass (active)
- [x] Re-asserted focused tap contract in `ExplorerApp`: proxy/grid asset hit retargets camera, true empty-space tap closes focus.
- [x] Added focused tap branch markers for direct proxy asset hit, grid fallback hit, empty-space hit, empty-space close, and retarget dispatch (`focused-tap-*`).
- [x] Updated focused proxy handler so close is only triggered after both direct proxy-card and grid fallback asset resolution fail.
- [x] Expanded static assertions to lock focused asset-vs-empty-space branch markers and close-after-resolution-fail contract.
- [ ] Device-verify repeated focused surrounding-asset taps retarget continuously while empty-gap taps close predictably.

## 2026-04-08 — Focused retarget fallback-policy + double-tap suppression pass (active)
- [x] Added focused retarget runtime branch markers in `ExplorerApp` to isolate failure path (`hit-proxy-card`, `hit-grid-fallback`, `resolved-key`, `runProxyFocusTransition-false`, retry lifecycle markers, close/open fallback-block markers).
- [x] Removed forced focused retarget `openPreview(...)` fallback from proxy-origin lane; failed retarget now schedules retry and keeps focused state instead of forcing close/open behavior.
- [x] Blocked proxy-origin close fallback when no retarget candidate resolves in focused mode (`focused-retarget-closeDrawer-blocked`) and kept focused presentation alive for retry triage.
- [x] Added focused proxy-surface JS double-tap suppression lane for touch pointer input with control-safe allow path markers (`focused-doubletap-suppressed`, `focused-doubletap-allowed-control`).
- [x] Hardened orchestrator `retargetTransition` recovery path to recover world/mount/render from current camera (`focus-retarget-recover-world`, `focus-retarget-recover-world-commit`) and only hard-fail as last resort (`focus-retarget-hard-fallback`) without implicit open-from-rest fallback.
- [ ] Device-verify focused retarget now preserves continuity motion (no forced zoom-out/open) and double-tap no longer triggers Safari page zoom on focused proxy surface.

## 2026-04-07 — Mobile tap reliability + double-tap zoom suppression pass (active)
- [x] Extended proxy-layer marker coverage to proxy preview chrome surfaces (`proxy-preview-ui`, focused chrome top/bottom) so composed-path proxy-origin detection is stable across nested proxy children.
- [x] Added mobile tap gesture hardening (`touch-action: manipulation`) on focused proxy root and focused masonry host to reduce Safari double-tap zoom interference during retarget taps.
- [x] Expanded static assertions for proxy chrome layer markers and proxy preview UI marker wiring.
- [ ] Device-verify iOS Safari no longer performs default double-tap page zoom while focused retarget taps remain responsive/reliable.

## 2026-04-07 — Proxy-layer composed-path retarget reliability pass (active)
- [x] Switched focused viewport delegation detection from `target.closest(...)` to full `event.composedPath()` scanning for `dataset.focusProxyLayer === 'true'`.
- [x] Added `data-focus-proxy-layer="true"` on focused proxy root and proxy renderer layers/surfaces/cards/scrim so proxy-origin events are consistently detectable regardless of child origin.
- [x] Kept viewport delegation markers (`focused-retarget-delegated-to-proxy-root`, `viewport-close-blocked-proxy-origin`) and verified they now trigger from composed-path proxy-origin detection.
- [x] Expanded static assertions to lock composed-path detection and proxy-layer dataset markers in Explorer + proxy renderer contracts.
- [ ] Device-verify focused retarget reliability is stable across taps landing on scrim/top/bottom/ambient proxy children.

## 2026-04-07 — Focused retarget event-routing ownership fix (active)
- [x] Patched focused viewport capture handler in `ExplorerApp` to delegate proxy-originated pointer events (`[data-focus-proxy-root="true"]`) to the proxy-root interaction lane.
- [x] Added explicit viewport delegation markers (`focused-retarget-delegated-to-proxy-root`, `viewport-close-blocked-proxy-origin`) so runtime traces can confirm viewport no longer preempts focused retarget.
- [x] Preserved proxy-root pointerdown as authoritative focused retarget path (including fallback hit-testing via `elementFromPoint(...)`) while avoiding viewport close-path preemption for proxy-originated taps.
- [x] Expanded static regression assertions to lock proxy-origin delegation guard and marker strings in `exports.test.mjs`.
- [ ] Device-verify zoomed focused preview tap-on-outside-asset now consistently retargets camera (no premature close/no-op from viewport handler).

## 2026-04-06 — Focused retarget interaction regression fix (active)
- [x] Restored focused-state different-asset tap retarget dispatch in `ExplorerApp` by routing focused grid/overlay taps to `runProxyFocusTransition(..., 'retarget')` when continuity key differs.
- [x] Added focused interaction markers for device/runtime triage (`focused-retarget-tap`, `focused-retarget-blocked-overlay`, `focused-retarget-blocked-same-key`, `focused-retarget-dispatched`).
- [x] Added orchestrator retarget transition API (`retargetTransition`) with explicit transition markers (`focus-retarget-start`, `focus-retarget-commit`, `focus-retarget-cancel`, `focus-retarget-fallback-close-open`) preserving motion from current camera state.
- [x] Added overlay hit-test fallback in focused proxy pointer handler using temporary proxy-root pointer pass-through + `elementFromPoint(...)` to recover underlying grid card retarget picks.
- [x] Re-enabled focused-grid host hit-testing (`.app.grid-focused .masonry-host { pointer-events:auto; }`) so focused retarget taps can resolve to underlying grid cards.
- [x] Expanded static regression assertions for focused-retarget tap path, same-key block path, orchestrator retarget API markers, and overlay interception markers.
- [ ] Device-verify focused preview tap-to-other-asset moves camera continuously from current focused position on iOS Safari and desktop.

## 2026-04-06 — Retained proxy continuity + audio-owner hardening (active)
- [x] Added retained continuity-key guards in `FocusTransitionOrchestrator` so retained close reuse is explicit for same key and blocked/cleared for different-key reopen (`proxy-retained-reuse-same-key`, `proxy-retained-blocked-different-key`, `proxy-retained-cleared-asset-change`).
- [x] Added explicit retained clear path for deselection (`clearRetainedProxyOnDeselect`) with marker `proxy-retained-cleared-deselect` and wired it through `ExplorerApp.clearActiveAsset`.
- [x] Hardened close-path audio authority in render lane by forcing retained active proxy video muted/defaultMuted and stamping `authoritativeAudioSurface=none` on close.
- [x] Added same-asset warm-reopen poster markers (`poster-held-same-asset-reopen`, `poster-release-same-asset-reopen`) plus stuck-poster guard marker (`poster-stuck-guard-fired`) in `useVideoOwnershipHandoff`.
- [x] Added lightweight continuity debug snapshot export (`window.__explorerProxyContinuityDebug`) with continuity key, retained flag, mounted/retained state, posterShown, and authoritative visual/audio surfaces.
- [x] Expanded static regression assertions to lock retained-key guards, retained-clear markers, close-path no-unmount contract, audio-owner close marker, poster-release markers, and continuity debug export wiring.
- [ ] Device-verify hidden retained proxy remains inaudible after close while same-asset warm reopen still reuses retained subtree.

## 2026-04-06 — Render-layer mount retention + poster threading follow-up (active)
- [x] Updated `FocusTransitionOrchestrator` close path to retain mounted proxy renderer subtree on close (hide/reset only) instead of unmounting, preserving same-asset reopen continuity potential in the render layer.
- [x] Threaded poster state from handoff hook result (`hasPoster`, `posterShown`, `posterUrl`) into `ExplorerApp` active proxy card/video datasets.
- [x] Added explicit CSS poster visibility lane keyed by `data-poster-shown="true"` to keep poster authority explicit in the render layer while first-frame handoff completes.
- [x] Expanded static regression assertions for retained-close marker (`proxyRetainedOnClose`), no-close-unmount contract, and poster-threaded dataset wiring.
- [ ] Device-verify close->reopen same asset preserves proxy mount continuity (`proxy-reused-mounted` on reopen) and avoids blank poster-drop on first-open.

## 2026-04-06 — Focused continuity authority hardening (active)
- [x] Added authoritative resume writer versioning (`activeResumeWriterVersionRef` + continuity version map + `writerVersion` snapshot guard) so stale/hidden lanes cannot overwrite newer resume positions.
- [x] Tightened resume precedence so `handoff-live` is restricted to true live thumbnail handoff (`pendingHandoff + live thumbnail frame + wasPlayingBeforeHandoff`), preserving same-asset reopen authority for `focused-session-warm-reopen`.
- [x] Added focused close-path hardening marker `focus-close-cleanup` for close->grid->same-asset reentry traceability.
- [x] Expanded static regression assertions for poster-threaded debug fields and authoritative resume-write/version markers.
- [ ] Device-verify close->grid->same-asset immediate reopen keeps warm resume source attribution and does not regress to stale snapshot positions.

## 2026-04-06 — Canonical play-guard debug marker alignment (active)
- [x] Renamed focused handoff disconnected/sync-throw play guard debug markers to canonical forms (`play-skipped-disconnected`, `play-threw-sync`) in `useVideoOwnershipHandoff`.
- [x] Updated static regression assertions in `exports.test.mjs` to enforce canonical play-guard marker names and prevent legacy request-prefixed drift.
- [ ] Device-verify runtime `__explorerProxyPlaybackDebug.reason` stream includes canonical play-guard markers during disconnected/sync-throw simulation paths.

## 2026-04-06 — First-open poster authority + mounted owner enforcement (active)
- [x] Added first-open poster-hold lane and delayed proxy `videoReady` flip until post-paint overlap completion to avoid blank focused-open before thumbnail preplay.
- [x] Added resume-source precedence markers (`handoff-live`, `focused-session-warm-reopen`, `resume-store-cold-reopen`, `none-start-at-zero`) with explicit same-asset reentry diagnostics.
- [x] Added requestPlay defensive instrumentation (`requestPlay-skipped-disconnected`, `requestPlay-sync-throw`) and renderer mount lifecycle markers (`proxy-mounted`, `proxy-reused-mounted`, `proxy-remounted`, `proxy-detached`).
- [x] Added authoritative audio/visual surface debug outputs and monotonic resume-store write guard.
- [ ] Device-verify first-open focused preview (without thumbnail preplay) shows poster then smooth proxy release with no blank flash.
- [ ] Device-verify repeated same-asset close/open stays mounted-reused (no reload) with resume from warm focused-session lane and proper focused audio ownership.
- [ ] Deferred: true single-surface promotion (same DOM video node moved between grid/focus) remains a future architecture cut.

## 2026-04-06 — Pre-warm preview blank fix + disconnected play guard (active)
- [x] Deferred `setVideoReady(true)` to post-visible-paint promotion completion so poster/scrim do not drop before an actual proxy frame is painted.
- [x] Added disconnected-node guard + synchronous `play()` throw handling in `requestPlay` with debug markers (`play-skipped-disconnected`, `play-threw-sync`).
- [x] Guarded focused audio reconciliation effect against disconnected proxy nodes.
- [x] Updated static regression assertions for new play-guard markers and staged ready marker placement.
- [ ] Device-verify first-open (without thumbnail preplay) no longer shows blank focused video before load completion.
- [ ] Device-verify exiting focused preview then immediately re-entering same asset no longer crashes/reloads page.

## 2026-04-06 — Stale play() rejection race guard (active)
- [x] Added active run-token guard in `useVideoOwnershipHandoff` play-request path so stale `play()` promise rejections cannot mutate newer handoff runs.
- [x] Added continuity-session guard (`latestSessionKeyRef` vs request-time session) for play rejection telemetry writes.
- [x] Ignored expected `AbortError` rejections from `play()` during load/rebind/cleanup churn to prevent false `play-rejected` promotion blocking.
- [x] Updated static contract assertions for run-token guard + session guard + abort ignore markers.
- [ ] Device-verify rapid refocus switching no longer produces false `play-rejected` debug states or silent focused playback.

## 2026-04-06 — Paint-confirmed proxy promotion + focused audio reconciliation (active)
- [x] Added `awaitVisibleVideoPaint(...)` helper and integrated staged promotion ownership (`proxy-preparing` -> `proxy-overlap` -> `proxy`) before thumbnail handoff completion.
- [x] Added warm same-asset reopen precedence (`handoff` -> `focused-session` -> `resume-store`) and debug lane attribution (`resumeSourceUsed`) in `useVideoOwnershipHandoff`.
- [x] Added focused-state audio reconciliation effect with explicit debug markers (`audio-enabled`, `audio-muted`) so zoomed preview audio no longer depends only on play-event timing.
- [x] Updated static contract assertions for new utility/module exports and staged promotion/audio debug markers.
- [ ] Device-verify black/empty flicker is removed during zoom-in handoff on iOS Safari while thumbnail remains stable.
- [ ] Device-verify zoom-out/zoom-in same asset resumes from focused-session time and preserves audible focused playback.

## 2026-04-06 — Per-asset playback memory across multi-preview sessions (active)
- [x] Added in-memory playback resume store utility keyed by asset continuity identity (`selectionKey::streamUrl`) with snapshot fields (`currentTime`, `duration`, `wasPlaying`, `updatedAt`).
- [x] Integrated resume restore lane in `useVideoOwnershipHandoff` so focused-open applies target time from pending handoff first, then stored per-asset resume snapshot.
- [x] Persisted resume snapshots from authoritative playback moments (`timeupdate`, `pause`, focused-close demote, effect cleanup) so returning to previously previewed assets resumes where left off.
- [x] Added resume-time normalization (`maybeNormalizeResumeTime`) to restart near-end previews from beginning and clamp invalid timestamps safely.
- [x] Extended static contract assertions for new resume store module and handoff hook resume integration markers.
- [ ] Device-verify previewing A->B->C->A resumes A at prior position while preserving handoff precedence on immediate same-asset focus-open.
- [ ] Validate near-end behavior: previews ending within ~0.75s of duration restart at 0 on next open.

## 2026-04-06 — Continuity key split + close-state warm retention + drift debug (active)
- [x] Split proxy ownership identity into `continuityKey` (`selectionKey::streamUrl`) and `playbackIntentKey` (`continuityKey::playToken`) so same-asset play-token bumps no longer hard-reset visual continuity lanes.
- [x] Refined non-focused path in `useVideoOwnershipHandoff` to avoid pause/reset teardown when selection/source remain present (`inactive-focused-closed`), keeping proxy decode warmer for rapid reopen while muting audio ownership.
- [x] Extended hook debug payload with thumbnail/proxy drift telemetry fields (`thumbnailVideoNodeFound`, `thumbnailCurrentTime`, `thumbnailReadyState`, `thumbnailPaused`, `timeDeltaFromThumbnail`) and wired `ExplorerApp` to pass active thumbnail video node into handoff hook.
- [x] Updated static regression assertions for continuity-key markers, inactive reason markers, and thumbnail drift debug fields.
- [ ] Device-verify repeated close/reopen on same asset reduces restart pops while preserving muted close semantics.
- [ ] Capture runtime sample with `timeDeltaFromThumbnail <= 0.05` near focused-open promotion on iOS Safari.

## 2026-04-06 — Focused proxy source-binding continuity guard (active)
- [x] Updated `useVideoOwnershipHandoff` focused-open startup to conditionally bind/load proxy media only when stream source changed (`source-bound`) and reuse warm source state otherwise (`source-reused`).
- [x] Removed unconditional `proxyVideoEl.load()` restart from focused-open playback path to reduce decoder resets on same-session reopen/refocus.
- [x] Added static regression assertions for conditional source-binding markers and a negative assertion preventing unconditional focused-open `load()` reintroduction.
- [ ] Device-verify focused reopen/refocus on iOS Safari shows fewer restart pops/freezes when the active asset source is unchanged.
- [ ] Capture runtime debug sample showing `source-reused` immediately before focused-open promotion on same-asset second tap.

## 2026-04-06 — First-tap under-hood prewarm continuity + in-focus side-card refocus routing (active)
- [x] Updated hidden proxy prewarm lane to keep muted loop playback active after first-tap targeting so focused-open has warmed decode/frame continuity.
- [x] Kept prewarm cleanup behavior for inactive/visible transitions while removing immediate pause after successful prewarm `play()` priming.
- [x] Changed focused proxy side-card pointer path to run explicit refocus transition ownership (`focusAsset` + `runProxyFocusTransition(...,'refocus')`) with fallback to `openPreview` only if refocus transition cannot start.
- [x] Added static regression assertions for prewarm loop marker and in-focus refocus routing markers.
- [ ] Device-verify first tap on grid asset primes playback under the hood (reduced blank/stall on second-tap focused-open) on iOS Safari.
- [ ] Device-verify side-card taps while focused animate to neighboring assets (horizontal/vertical refocus travel) without closing to rest.

## 2026-04-05 — ExplorerApp TDZ crash fix for proxy tap toggle (active)
- [x] Root-caused `Cannot access uninitialized variable` crash to proxy-root effect dependency referencing `handleProxyTogglePlay` before callback initialization.
- [x] Replaced active-card tap path with inline proxy video play/pause toggle logic inside the proxy pointer handler to avoid forward-reference TDZ.
- [x] Updated static regression assertions to lock inline active-card toggle markers (`proxy-render-video` query + play branch).
- [ ] Device-verify app boots without runtime error overlay and active proxy tap-to-toggle remains functional on iOS Safari.

## 2026-04-05 — Focused proxy session-key stabilization + direct promotion write-through (active)
- [x] Added explicit ownership `sessionKey` in `useVideoOwnershipHandoff` and restricted bootstrap reset lane to true session changes.
- [x] Moved unstable callback inputs (`onDebug`, `onPromoted`, `onHandoffConsumed`) behind refs so bootstrap effect does not restart from callback identity churn.
- [x] Added direct promotion dataset write-through on active card/video node (`data-first-frame-presented`, `data-video-ready`, `data-promotion-strategy`, `data-proxy-session-id`) at promotion moment.
- [x] Expanded proxy playback diagnostics with node/session/card state (`sessionKey`, `videoStableId`, `cardSelectionKey`, `cardVideoReady`, `cardFirstFramePresented`, `currentSrc`).
- [x] Extended static regression assertions for session-key lifecycle and callback-ref/write-through markers.
- [ ] Device-verify focused-open now reliably transitions `none -> rvfc|fallback` and card dataset flips to ready/presented without reverting in the same session.
- [ ] Capture one iOS runtime sample proving `hookFirstFramePresented:true` and `cardFirstFramePresented:"true"` with matching `sessionKey`.

## 2026-04-05 — Focused proxy tap play/pause + timeupdate promotion recovery (active)
- [x] Added active-card tap playback toggle in proxy root pointer handler (`handleProxyTogglePlay`) for focused cinematic preview media surface.
- [x] Preserved interaction arbitration so preview UI controls/buttons remain interactive and non-media taps keep existing close/refocus behavior.
- [x] Added `timeupdate-fallback` promotion lane in `useVideoOwnershipHandoff` to promote from poster when playback progresses but earlier readiness events were missed.
- [x] Updated static regression assertions for active-card tap toggle and `timeupdate-fallback` marker.
- [ ] Device-verify focused preview now play/pause toggles on direct media tap and timeline advances from `0:00` on iOS Safari.
- [ ] Capture one runtime sample with `firstFramePresented:true` and either `promotionStrategy != "none"` or `reason:"timeupdate-fallback"` during focused open.

## 2026-04-05 — Focused proxy still-frame absolute-stream + early-event capture fix (active)
- [x] Added `absolutizeMediaUrl(...)` in `ExplorerApp` and routed proxy prewarm/grid stream URLs through canonical absolute API URL resolution with `:8787` LAN fallback.
- [x] Fixed focused proxy stream fallback chain to use `proxyAsset?.src` (from `normalizePreviewAsset`) instead of missing `proxyAsset?.streamUrl` field.
- [x] Reordered `useVideoOwnershipHandoff` startup so readiness/playback listeners bind before `load()` + `play()` priming, preventing missed fast events on iOS Safari.
- [x] Updated static regression assertions for absolute stream URL composition markers and focused proxy stream fallback wiring.
- [ ] Device-verify focused proxy no longer renders relative `/media/...` src on split-origin sessions and reaches `firstFramePresented:true` during focused open.
- [ ] Capture one iOS runtime sample (`window.__explorerProxyPlaybackDebug`) showing non-empty absolute `streamUrl`, `mediaBranch:"video"`, and non-`none` promotion strategy.

## 2026-04-05 — Focused proxy visual stall regression hotfix (active)
- [x] Root-caused still-frame focused preview regression to `useVideoOwnershipHandoff` effect churn from debug callback dependency invalidation.
- [x] Introduced `latestDebugStateRef` in handoff hook and moved debug payload reads to ref-backed snapshot state so promotion/playback side-effect effect remains stable.
- [x] Preserved existing diagnostics fields while removing teardown/re-init playback loops caused by internal state transitions.
- [ ] Device-verify focused proxy video now advances frames continuously (no audio-only still-frame state) across open/refocus flows on iOS Safari.
- [ ] Capture one runtime sample (`window.__explorerProxyPlaybackDebug`) showing stable `reason` transitions without repeated `inactive`/mount churn during a single focused-open.

## 2026-04-05 — Focused proxy stream authority + first-frame visual promotion repair (active)
- [x] Added active-selection-derived `proxyAsset`/`proxyStreamUrl` in `ExplorerApp` so focused handoff always receives the resolved active proxy stream source.
- [x] Switched focused handoff hook wiring to `streamUrl: proxyStreamUrl` and mirrored stream URL into playback debug + active card dataset for runtime verification.
- [x] Updated proxy renderer to publish active `data-stream-url` truth on active card/video nodes.
- [x] Expanded proxy CSS promotion gating so poster/scrim hide on either `data-video-ready="true"` or `data-first-frame-presented="true"`.
- [x] Extended static regression assertions for proxy stream-authority wiring and first-frame CSS promotion selectors.
- [ ] Device-verify focused proxy opens with `mediaBranch:"video"`, visible frame progression, and no audio-only hidden-video state on iOS Safari.
- [ ] Capture one `window.__explorerProxyPlaybackDebug` sample showing non-empty `streamUrl` + `firstFramePresented:true` before poster is fully hidden.

## 2026-04-05 — Focused proxy stalled-promotion fallback + diagnostics pass (active)
- [x] Updated `useVideoOwnershipHandoff` focused-open startup to always run muted `load() + play()` priming and removed `wasPlayingBeforeHandoff` as the promotion-start gate.
- [x] Added explicit fallback promotion lanes (`loadeddata-fallback`, `canplay-fallback`, `playing-fallback`, `immediate-readiness-fallback`) so poster ownership cannot stay pinned when RVFC does not resolve.
- [x] Extended handoff debug payload with stall telemetry (`playRequested`, `playPromiseRejected`, `loadedMetadataSeen`, `loadedDataSeen`, `canPlaySeen`, `playingSeen`, `promotionBlockedReason`).
- [x] Added static regression assertions to lock fallback-promotion and stall-diagnostics markers.
- [ ] Device-verify on iOS Safari that focused-open no longer stalls on poster ownership when RVFC fails to resolve.
- [ ] Capture one `window.__explorerProxyPlaybackDebug` sample showing fallback promotion path + diagnostic fields during a previously stalled open.

## 2026-04-05 — ExplorerApp hook wiring runtime crash fix (active)
- [x] Fixed undefined `proxyAsset` symbol in focused handoff hook wiring by using `normalizedPreviewAsset?.streamUrl` as the stream URL authority.
- [x] Restored focused preview render stability by removing `ReferenceError: Can't find variable: proxyAsset` from `ExplorerApp` runtime path.
- [ ] Device-verify focused open/refocus path no longer crashes and still preserves first-frame ownership gating behavior.

## 2026-04-05 — Proxy renderer active-node persistence pass (active)
- [x] Refactored `ViewportProxyRenderer` to use split world layers (`proxy-render-ambient-layer` + `proxy-render-active-layer`) so active media no longer depends on full `world.innerHTML` rewrites.
- [x] Added active-card reconciliation by `selectionKey` to reuse the same active media subtree (especially `.proxy-render-video`) across render passes when selection is unchanged.
- [x] Limited active-card updates to in-place mutations (geometry styles/datasets/chrome markers/media src sync) and recreate media nodes only on selection/branch changes.
- [x] Added renderer persistence diagnostics via `window.__explorerProxyRendererDebug` (`activeSelectionKey`, `activeVideoNodeStableId`, `renderPassCount`, `activeNodeReused`, `activeMediaRecreated`).
- [x] Updated static regression contracts to assert the new persistent-render architecture and diagnostics markers.
- [ ] Device-verify open/refocus with unchanged selection keeps stable `activeVideoNodeStableId` and `activeMediaRecreated:false` after initial mount.
- [ ] Capture one runtime sample showing no `thumbnail -> blank -> video` interval after renderer persistence pass.

## 2026-04-05 — Focused proxy first-frame promotion gate (active)
- [x] Added a dedicated ownership handoff hook (`useVideoOwnershipHandoff`) so focused proxy reveal is gated by first-frame readiness instead of metadata/canplay-only signals.
- [x] Added `awaitFirstVideoFrame(...)` utility with `requestVideoFrameCallback`-first strategy plus fallback (`readyState/currentTime/rAF`) and timeout handling.
- [x] Kept poster/placeholder visual ownership until first frame is presentation-ready (`data-video-ready="true"` only after first-frame confirmation), preventing blank promoted planes.
- [x] Extended proxy playback diagnostics with explicit frame readiness signals (`videoReady`, `firstFramePresented`, `promotionStrategy`, `mediaBranch`, `readyState`, `currentTime`, `duration`).
- [ ] Device-verify on iOS Safari that focused open no longer exhibits `video -> blank -> video` and remains continuous from thumbnail/poster into live proxy.
- [ ] Capture one runtime debug sample (`window.__explorerProxyPlaybackDebug`) showing `firstFramePresented:true` before poster hide and `promotionStrategy:"rvfc"` or fallback path as expected.

## 2026-04-05 — Focused proxy prewarm lane for likely-open assets (active)
- [x] Added a dedicated hidden proxy prewarm surface (`.proxy-prewarm-video`) in `ExplorerApp` to pre-attach likely focused video sources before focus-open settle.
- [x] Introduced explicit likely-open targeting (`reinforcedActiveKey -> previewActivationKey -> activeAssetKey`) with resolved stream URL authority so prewarm and focused owners use the same canonical media source.
- [x] Prewarm lane now performs metadata/data readiness hooks plus muted prime-play attempt (`play().then(pause())`) while hidden to reduce cold first-frame decode on focused open.
- [x] Extended focused playback debug payload with prewarm telemetry (`prewarmSelectionKey`, `prewarmUrl`, `prewarmReadyState`) for runtime validation.
- [ ] Device-verify focused-open cold-start reduction on iOS Safari (less black-frame/blurred poster dwell before live motion).
- [ ] Capture runtime evidence showing prewarm ready state has advanced before focus-open (`prewarmReadyState >= 1/2`) on at least one previously lagging asset.

## 2026-04-05 — Focused proxy audio ownership split (active)
- [x] Kept thumbnail/grid continuity path muted by default (`setProxyMuted(true)` on bootstrap/inactive lanes) so non-focused video surfaces remain silent.
- [x] Promoted focused proxy to audio owner only after readiness/ownership handoff (`onPlaying` after thumbnail pause/yield), then unmuted focused proxy media.
- [x] Hardened close/refocus cleanup to stop and re-mute prior focused proxy owners (`pause()` + mute reset) to prevent overlapping audio across transitions.
- [x] Added focused playback debug `muted` signal to `__explorerProxyPlaybackDebug` for device-side verification of mute/unmute ownership timing.
- [ ] Device-verify iOS Safari behavior: focused proxy opens muted during bootstrap, then plays audible audio after settle/playing ownership (or first explicit play tap if autoplay policy gates unmuted playback).
- [ ] Capture runtime proof showing no thumbnail audio, no dual audio owners, and focused owner mute state transitions (`muted:true -> muted:false`) across open/pause/close/refocus.

## 2026-04-05 — Proxy focused media-source authority + hard poster cutoff (active)
- [x] Root-caused focused proxy static-frame behavior to media source authority drift: proxy card snapshot consumed raw `item.stream_url` while playback/details path used resolved API-base URLs, allowing focused proxy video to bind an invalid relative source in split-origin sessions.
- [x] Added resolved per-item `streamUrl` to Explorer asset view models and switched grid card `data-stream-url` ownership to that resolved URL so `SceneSnapshot -> ViewportProxyRenderer` receives the same valid stream source as focused preview metadata/actions.
- [x] Added explicit proxy media-branch diagnostics (`data-proxy-media-branch`) and exported `mediaBranch` via `__explorerProxyPlaybackDebug` to confirm whether active focused cards are in `video`, `thumb`, or `fallback` source path at runtime.
- [x] Hardened poster-to-video ownership switch CSS after readiness (`pointer-events:none`, negative poster z-order, scrim fully cleared) so once `data-video-ready="true"` the poster no longer contributes to visible output.
- [ ] Device-verify focused-open on iOS Safari now shows advancing video frames (not static poster look), with non-zero duration/currentTime for playable assets.
- [ ] Capture one runtime debug sample (`window.__explorerProxyPlaybackDebug`) confirming `mediaBranch:"video"` and a non-empty `currentSrc` on a previously failing asset.

## 2026-04-05 — Focused proxy playback truth + readiness-gated handoff (active)
- [x] Reworked focused proxy playback truth to require real readiness/progress (`readyState`, `timeupdate` progression) before reporting playing state, preventing false `Pause` UI while media is stalled at zero.
- [x] Added proxy playback diagnostics export (`globalThis.__explorerProxyPlaybackDebug`) with runtime media signals (`paused`, `currentTime`, `duration`, `readyState`, `networkState`, `ended`, `currentSrc`, handoff state).
- [x] Gated handoff seek application behind media readiness (`tryApplyHandoffTime`) and retried on readiness events (`loadedmetadata`, `canplay`) before clearing handoff ownership.
- [x] Deferred thumbnail-owner pause until proxy `playing` event to keep one real playback owner while avoiding early dead-state takeover.
- [ ] Device-verify focused proxy no longer shows false `Pause` with `0:00/0:00`, and confirm timeline advances with real video motion in iOS Safari.
- [ ] Capture runtime debug sample (`window.__explorerProxyPlaybackDebug`) during focused-open for at least one previously failing asset.

## 2026-04-05 — Overlay A badge dedupe + playback handoff continuity (active)
- [x] Removed redundant wrapper badge children from world-grid Overlay A render path (`Cinematic`, `Scene`, bottom-right duplicate kind) while preserving the real overlay lanes (`asset-ol-tl/tr/bl/bottom`) and selection UI.
- [x] Added immediate first-activation thumbnail playback wiring (`playGridThumbForSelectionKey`) so first tap on playable grid assets attempts muted inline autoplay without waiting for second-tap preview open.
- [x] Added explicit thumbnail→focused playback handoff state (`previewPlaybackHandoffRef`) capturing selection key/currentTime/play state before focus-open.
- [x] Hydrated focused proxy video from handoff (`currentTime` + play intent) and paused the source thumbnail once proxy owner takes over to avoid dual-owner drift.
- [ ] Device-verify first-tap thumbnail autoplay and focused-open continuity near same playback position on iOS Safari.
- [ ] Device-verify Overlay A now shows only non-duplicate lanes in world-grid while focused Overlay B ownership behavior remains unchanged.

## 2026-04-05 — Overlay A wrapper-lane visibility fix (active)
- [x] Root-caused world-grid Overlay A invisibility to wrapper-lane suppression: `.asset-cinematic-ui` base style was still `display: none`, preventing visible child-lane recovery.
- [x] Restored wrapper visibility baseline by setting `.asset-cinematic-ui` to `display: block` so mounted Overlay A DOM can render in world-grid when overlays are enabled.
- [x] Added explicit overlay-on wrapper recovery contract for `.asset-cinematic-ui-top` / `.asset-cinematic-ui-bottom` under non-suppressed states (`:not(.overlay-hidden):not(.density-motion-active):not(.density-gesture-active)`).
- [x] Extended static contract assertions to lock wrapper baseline visibility + explicit wrapper recovery selectors.
- [ ] Device-verify On/Off toggle parity: Overlay A visible with `Overlays: On`, hidden with `Overlays: Off`, and replaced by Overlay B in focused mode.

## 2026-04-05 — Overlay A world-grid visibility contract repair (active)
- [x] Identified regression scope as world-grid Overlay A visibility recovery, not focused Overlay B ownership.
- [x] Relaxed `.asset-overlay.is-simplified` suppression so critical Overlay A lanes (kind + ordered select UI) remain recoverable when simplified subtree mode is active.
- [x] Added explicit world-grid visible-state contract for overlay-on mode (`:not(.overlay-hidden):not(.density-motion-active):not(.density-gesture-active)`) to force overlay lane restoration after transient suppressor states.
- [x] Kept focused-preview ownership model intact (Overlay B remains focused-only; Overlay A still hidden under `overlay-hidden` and focus/motion suppressors).
- [ ] Device-verify world-grid Overlay A checkboxes/order badges appear with `Overlays: On`, hide with `Overlays: Off`, and remain replaced by Overlay B while focused.

## 2026-04-05 — Overlay toggle restoration + focused player parity follow-up (active)
- [x] Restored world-grid overlay toggle behavior by enforcing `overlay-hidden` ownership at `.asset-overlay` container level so TopBar `Overlays: On/Off` deterministically hides/shows card overlays again.
- [x] Refactored `ProxyFocusedChromeFullParity` into a player-first dock contract: persistent transport core (time, scrubber, play/pause, ±10s) remains primary, while secondary actions + metadata move into a details-gated section.
- [x] Wired focused proxy parity props to runtime preview truth (`playable` now derived from normalized preview kind, and proxy chrome receives metadata rows) to avoid transport omission when focus item typing varies.
- [x] Hardened focused proxy autoplay retries with post-attach follow-up attempts (`canplay`, `loadeddata`, delayed retry) keyed by `previewAutoPlayToken` for open/refocus parity.
- [ ] Device-verify that `Overlays: Off` hides Overlay A on grid cards and `Overlays: On` restores it in the same session.
- [ ] Device-verify focused proxy opens with visible transport + autoplay, and details toggle now only expands/collapses secondary metadata/actions.

## 2026-04-05 — Proxy focused layout coordinate-space correction (active)
- [x] Fixed focused proxy chrome coordinate mismatch by introducing explicit world-scale handoff (`--proxy-world-scale`) from renderer to CSS so focused UI layout can be computed at visual-size-equivalent dimensions.
- [x] Updated `.proxy-render-ui-slot` to use inverse-scale compensation (`scale(1 / --proxy-world-scale)`) with expanded local layout bounds, decoupling active chrome layout from tiny base card geometry while preserving world camera travel.
- [x] Added focused proxy video autoplay follow-up (`video.play().catch(...)`) after render mount so iOS Safari has an explicit post-attach play attempt in addition to muted/autoplay attributes.
- [x] Extended Explorer static contract assertions to lock the new renderer/CSS markers for world-scale propagation, inverse UI compensation, and play-attempt behavior.
- [ ] Run on-device grid focused-open verification and capture evidence that scrubber + transport remain visible with no oversized/cramped chrome.
- [ ] Verify proxy-focused video playback starts consistently on iOS Safari after focus settle (no manual interaction required in typical autoplay-allowed conditions).

## 2026-04-04 — Proxy active-card layout budget + UI slot follow-up (active)
- [x] Added dedicated active-card UI mount slot (`.proxy-render-ui-slot`) in proxy renderer so focused chrome portals into a stable in-card layer above scrim/video.
- [x] Reduced focused full-surface scrim intensity to avoid washing out proxy video while preserving localized top/bottom readability.
- [x] Switched active proxy video preload hint to `auto` for faster open-settle playback readiness.
- [x] Tightened focused chrome container lane behavior (`display:flex`, `justify-content:space-between`, bounded horizontal overflow lanes) to reduce clipping/crowding in small-base-card layouts.
- [ ] Device-verify transport/scrubber visibility and video readability in focused settle with current side-edge opens/refocus transitions.

## 2026-04-04 — Focused parity visibility follow-up (active)
- [x] Reordered focused proxy bottom lanes so transport controls (time/scrubber/play/skip) render in a dedicated first row ahead of action pills.
- [x] Added focused transport row styling to keep play/skip controls visible instead of being displaced by long action-pill sets.
- [x] Applied one-line ellipsis clamping for focused title/path so metadata no longer grows vertically and occludes central media.
- [x] Kept autoplay enforcement in focused open path while preserving in-card media ownership and portal-mounted chrome.
- [ ] Device-verify that scrubber + play/pause + ±10 controls are visibly present on focused settle and that video is already playing on open.

## 2026-04-04 — Focused HUD scale + autoplay tuning pass (active)
- [x] Reduced focused proxy chrome scale density (smaller controls/text/gaps) while keeping feature parity controls present.
- [x] Tightened top/bottom overlay anchoring and reduced gradient weight so media remains the dominant visual plane.
- [x] Switched focused chip/action rows to single-line horizontal lanes with overflow scrolling to avoid center-frame stack takeover.
- [x] Added focused-open autoplay enforcement for proxy active video (`muted + playsInline + play()` attempt) in proxy playback binding effect.
- [ ] Device-verify focused settle now reads as HUD-sized overlay and video is already playing on open/refocus settle.

## 2026-04-04 — Full-parity proxy chrome + in-card parenting pass (active)
- [x] Replaced focused proxy compact subset with full-parity proxy chrome (`ProxyFocusedChromeFullParity`) including transport lane, scrubber, play/pause, and skip ±10 controls.
- [x] Moved focused proxy chrome ownership into the active proxy card transform tree by mounting chrome via React portal directly into `.proxy-render-card[data-proxy-active="true"]`.
- [x] Removed rect-chasing frame dependence for main focused chrome placement (`proxyPreviewFrame`), reducing sibling-overlay drift/flicker risk during open/refocus motion.
- [x] Added proxy-video transport binding in `ExplorerApp` (playback state listeners + seek/toggle/skip handlers) so focused chrome controls drive proxy media owner directly.
- [x] Extended focused proxy styles for full-card overlay parity (top/bottom lanes + time row + scrubber + primary transport button state) while keeping media visible beneath localized gradients.
- [ ] Device-verify parity/flicker: full-card overlay coverage, visible scrubber/transport, no chrome chase flicker on refocus, and preserved side-context continuity.

## 2026-04-04 — Focused proxy compact-chrome extraction pass (active)
- [x] Stopped reusing the full `AssetPreviewPanel` shell in focused-grid proxy mode; proxy mode now mounts a dedicated compact chrome component only.
- [x] Added `ProxyFocusedChromeCompact` in `AssetPreviewPanel.tsx` to reuse B-family control language without panel-body/media scaffolding.
- [x] Replaced proxy preview mount in `ExplorerApp` to use `ProxyFocusedChromeCompact` so focused controls render in-card over the proxy media surface.
- [x] Reworked proxy chrome styles to transparent in-card lanes (top/bottom localized gradients + pills/buttons) and removed centered panel-shell sizing in `.proxy-preview-ui`.
- [x] Strengthened ambient neighbor readability by increasing non-active proxy card visibility and reducing blur attenuation.
- [ ] Device-verify no detached black panel feeling: focused media is primary, controls are embedded in-card, and ambient side-context is visibly present.

## 2026-04-04 — Proxy focused-media ownership correction pass (active)
- [x] Removed focused-grid detached media owner by reusing `AssetPreviewPanel` chrome with `renderMedia={false}` in proxy-preview mode.
- [x] Kept focused media ownership in proxy renderer active card surface (`ViewportProxyRenderer`) and added active-video poster fallback beneath video playback.
- [x] Hardened proxy snapshot thumb capture to include dataset thumb fallbacks when image `src/currentSrc` is unavailable at transition sample time.
- [x] Suppressed always-on cinematic shell marker overlays in world grid cards to prevent Overlay A pollution from cinematic marker UI.
- [ ] Device-verify: world grid shows only Overlay A, zoom motion carries active media + ambient neighbors, focused card hosts media + compact chrome without detached panel body.

## 2026-04-04 — Proxy preview frame TDZ hotfix (active)
- [x] Identified root cause of boot regression: proxy preview rAF `useEffect` referenced `proxyPreviewVisible` before that `const` was initialized (TDZ in `ExplorerApp`).
- [x] Reordered the proxy preview frame `useEffect` to run after `proxyPreviewVisible` declaration while preserving the same geometry-sync logic.
- [x] Re-ran Explorer static contract suite to confirm startup-path source remains compile/runtime-safe.
- [ ] Device-verify Explorer boots on iOS Safari without `ReferenceError: Cannot access uninitialized variable`.

## 2026-04-04 — Overlay model unification pass (A/B/C) (active)
- [x] Removed legacy focused-grid proxy chrome controls/text (Overlay C) from proxy renderer output; kept only media + scrim atmosphere there.
- [x] Reused list preview/player component family (`AssetPreviewPanel`) as focused grid preview UI (Overlay B-family) mounted in proxy root.
- [x] Added proxy preview container isolation (`.proxy-preview-ui`) so focused preview controls no longer rely on legacy proxy button lane.
- [x] Kept world-card overlay system (Overlay A) untouched in `AssetGrid` and maintained overlay-toggle semantics.
- [x] Prevented proxy root close handler from swallowing focused preview control interactions by ignoring `.proxy-preview-ui` hit targets.
- [ ] Device-verify A/B split: grid browsing shows Overlay A only, focused grid preview shows compact Overlay B-family only, and legacy Overlay C elements no longer appear.

## 2026-04-04 — Focus plane leak containment pass (active)
- [x] Reduced readable tiled background structure in focused mode by limiting proxy ambient neighbors around the active card (active + nearest bounded set).
- [x] Added explicit ambient-card styling (`.proxy-render-card.is-ambient`) to push non-active proxy cards into atmospheric backdrop treatment.
- [x] Increased focused proxy surface isolation (darker radial surface + stronger blur) and removed live masonry competition during focused/opening/refocusing modes.
- [x] Preserved active proxy markers and focused media owner path while reducing world-plane readability behind focused content.
- [x] Updated static contracts for ambient neighbor sampling + ambient proxy class markers.
- [ ] Device-verify that faint grid structure no longer reads as tiled matrix behind focused card.

## 2026-04-04 — Boot regression fix (TDZ) (active)
- [x] Fixed ExplorerApp startup crash (`ReferenceError: Cannot access uninitialized variable`) caused by `openPreview` referencing `closeDrawer` before `closeDrawer` initialization.
- [x] Replaced the fail-closed branch call to later-declared `closeDrawer` with an inline idle-reset path using already-initialized setters + `resetFocusPresentationToIdle`.
- [x] Re-ran Explorer static contract suite to confirm no regressions after the TDZ fix.
- [ ] Device-verify Explorer now boots cleanly on iOS Safari and focus/runtime probes can execute.

## 2026-04-04 — Focus owner collapse + visibility truth pass (active)
- [x] Removed grid-mode proxy-open fallback into world-focus path; proxy-focus failure now exits back to idle instead of showing mixed ownership layers.
- [x] Added runtime owner-mismatch inspector helper `globalThis.__explorerFocusLayerDebug.getSnapshot()` to enumerate visible focus-layer candidates with style/marker truth.
- [x] Kept active proxy card markers as single-source owner hints (`data-proxy-active`, `data-select-key`) for runtime probes.
- [x] Retuned proxy chrome scale model with card-relative clamps and non-blocking chrome containers to reduce page-scale control intrusion.
- [x] Reduced proxy scrim aggression and tightened focused isolation (`.app.grid-focused .masonry-host` dim) to minimize grid visual competition behind focused media.
- [ ] Capture a fresh runtime probe showing non-null `activeKey/activeRect/media` while proxy root is visible during settled focus.

## 2026-04-04 — Depth v4 conformity pass (active)
- [x] Kept proxy camera math as safe-frame authoritative for open/refocus settle, including viewport-offset + scale-correct centering.
- [x] Updated proxy render choreography so focused chrome is hidden during open/refocus travel and only rendered after settle.
- [x] Added reverse-close choreography cue (chrome/scrim out before world return) on proxy close timeline.
- [x] Strengthened focused overlay layering on proxy surface (thumb/media plane under scrim/top/bottom chrome, pointer-safe control lane).
- [x] Added explicit proxy active-card markers (`data-proxy-active`, `data-select-key`) to support runtime focus diagnostics and hit targeting parity.
- [x] Added lightweight idle depth treatment hooks (`perspective` + `preserve-3d`) without adding per-card runtime churn.
- [ ] Device-verify conformity against demo contract for open/refocus/close choreography and focused interaction semantics on side-origin assets.

## 2026-04-04 — Grid proxy final centering fix (active)
- [x] Separate viewport-safe-frame target geometry from source card origin for proxy settle math (`computeCameraStateForTarget` now uses viewport offsets + scale-correct translation).
- [x] Ensure settled open/refocus proxy center resolves to safe-frame center without lateral source bias by using scale-aware x/y solve and world transform-origin at top-left.
- [x] Add lightweight settle telemetry (`globalThis.__explorerProxyCenterDebug`) for viewport center vs target center delta verification.
- [x] Expose explicit proxy root marker (`data-focus-proxy-root`) to make runtime centering probes deterministic.
- [x] Update static Explorer contract assertions for camera centering and proxy debug marker presence.
- [ ] Capture a real side-edge open/refocus runtime sample and verify `delta.x` is near 0 at settled end-state.

## 2026-04-03 — Grid focused-state interaction completion pass (active)
- [x] Introduced explicit grid cinematic mode state machine (`grid-rest/opening/focused/refocusing/closing`) and wired overlay visibility to settled focused mode.
- [x] Added focused-mode pointer arbitration: different asset click -> refocus transition, non-asset click -> close transition to rest.
- [x] Unified close button + outside-close onto the same proxy close travel path (`closeFocusTransition`) with rest-state handoff.
- [x] Updated static contracts for new mode states, close/refocus methods, and focused hit arbitration markers.
- [ ] Device-verify interaction contract: asset->focus open, focused->asset refocus, focused->outside close, and close-button motion-out parity.

## 2026-04-03 — Proxy ownership/continuity correction phase-2 (active)
- [x] Added explicit proxy travel state lane in `ExplorerApp` and made proxy activity the gating source for cinematic/drawer visibility ownership.
- [x] Extended `FocusTransitionOrchestrator` with explicit transition markers and dedicated refocus path to keep grid prev/next in the proxy camera lane.
- [x] Updated snapshot + proxy renderer layering to prioritize active-card continuity and near-viewport scene context during travel.
- [x] Added CSS ownership guards that force cinematic/drawer suppression while proxy travel is active.
- [ ] Device-verify open/refocus handoff timing (proxy owner -> settled cinematic owner) has no visible dual-owner window on mobile Safari.

## 2026-04-03 — Proxy render bridge seam for grid cinematic ownership (active)
- [x] Added `src/render` bridge layer with snapshot, camera, proxy renderer, and GSAP orchestrator modules to isolate transition ownership from live masonry DOM.
- [x] Wired `ExplorerApp` grid open/refocus path to attempt proxy transition first with scroll-lock lifecycle and close cleanup; preserved list drawer semantics.
- [x] Removed duplicated cinematic nav ownership by replacing bottom panel Prev/Next with non-nav actions and keeping dedicated cinematic nav strip.
- [x] Updated Explorer static contract assertions for new render seam and proxy ownership markers.
- [ ] Device-verify proxy bridge transition reads as single moving owner (no duplicate panel leakage) across open, prev/next refocus, and close in mobile Safari.

## 2026-04-03 — Grid cinematic timeline authority + focus diagnostics pass (active)
- [x] Centralized cinematic channel sequencing into `createGridCinematicTimeline` with explicit open/refocus/close ownership lanes.
- [x] Upgraded focus transform guarding to diagnostics-first output (`guardFailureReason`, `guardDiagnostics`) while preserving fallback for pathological transform failures.
- [x] Added cinematic parity surface markers in grid/card layers (`data-grid-cinematic-nav`, `data-card-ui-chip`, `data-card-ui-nav`, depth hook) and updated static contracts.
- [ ] Device-verify world/header/bars/chip/shell/top/nav/bottom/actions/close pacing and validate topbar-hide/world-pulse feel on mobile Safari.

## 2026-04-03 — Focus diagnostics + cinematic parity follow-up (active)
- [x] Landed diagnostics-first focus guard path and wired extended guard telemetry into `__explorerFocusWorldDebug.lastMeasurement`.
- [x] Expanded grid cinematic staged reveal sequencing (`bars -> media -> top -> bottom -> nav -> actions -> close`) and aligned cinematic shell/depth markers across `ExplorerApp`, `AssetGrid`, and Explorer styles.
- [x] Updated Explorer static contracts to lock new diagnostics fields and staged cinematic sequencing markers.
- [ ] On-device parity pass: validate grid cinematic reveal pacing and close choreography against list/drawer fallback ownership on mobile Safari.

## 2026-04-03 — Grid focus measurement-readiness retry fix (active)
- [x] Reconciled runtime evidence (`drawer-fallback` + `missing-target` + null measurement rects) as measurement-readiness timing failure instead of drawer visual ownership failure.
- [x] Split focus measurement failures into explicit reasons (`missing-stage`, `missing-viewport`, `missing-grid`, `missing-card`, `unsafe-transform`) with presence flags for stage/viewport/grid/card.
- [x] Added one deferred grid-focus retry lane for readiness-related failures before fallback demotion, with retry diagnostics markers (`focus-retry-scheduled`, `focus-retry-attempt`).
- [x] Kept scope narrow: no cinematic redesign, no easing retune, no list-view drawer behavior changes.
- [ ] Device-verify first grid tap now enters world-focus on next-frame retry when refs were unavailable on initial tick.

## 2026-04-03 — flushSync lifecycle warning correctness pass (active)
- [x] Identified the only `flushSync(...)` call path in Explorer (`ExplorerApp` density `onColumnsCommit`) as lifecycle-adjacent and warning-prone in Safari.
- [x] Replaced direct `flushSync(setGridColumnCount)` with microtask-coalesced commit scheduling (`scheduleGridColumnCommit`) to avoid sync flushes while preserving latest-target density truth.
- [x] Added runtime marker `__explorerFlushSyncDebug` (strategy, commitCount, lastColumns) to verify old flush path is no longer used during device runs.
- [ ] Device-verify Safari console no longer emits lifecycle `flushSync` warning during density/preview interactions.

## 2026-04-03 — Preview routing diagnostics + boot-toast dismissal parity (active)
- [x] Added runtime preview diagnostics hook (`__explorerPreviewDebug`) in `ExplorerApp` to record open request mode, world-focus attempt outcome, and explicit fallback reasons.
- [x] Updated preview fallback helper to carry reason metadata (`not-grid`, `density-unsafe`, `missing-target`, invalidation cases) into debug snapshots.
- [x] Ensured boot toast follows an explicit completion-driven exit path using `beginToastExit(...)` after startup loaders settle.
- [x] Relaxed focus-world projected-bound margin to reduce false-negative grid preview fallback for viable transforms.
- [ ] Device-verify fallback reason traces and confirm boot toast consistently exits on slower mobile startup runs.

## 2026-04-03 — openDrawer stale-symbol crash fix (new)
- [x] Removed stale `openDrawer` dependency entry from `useAssetInteractions` callback deps.
- [x] Confirmed hook options/destructuring/internal calls already use `openPreview`.
- [x] Re-ran repo-wide stale symbol search patterns for `openDrawer` under Explorer `src`.
- [ ] Runtime smoke check on mobile Safari after rebuild to verify error overlay no longer appears.

## 2026-04-03 — Grid cinematic presentation pass (new)
- [x] Added grid-only cinematic preview surface markup (fixed root + media + scrim + top HUD + bottom panel + actions + letterbox bars + close affordance).
- [x] Kept list preview path in drawer and preserved drawer-fallback semantics while grid world-focus remains the visible owner.
- [x] Introduced staged reveal timers/channels for cinematic open and centralized cleanup/reset in focus teardown helpers.
- [x] Added per-card cinematic shell markers in `AssetGrid` (`data-card-shell`, top/bottom/action UI markers) for handoff/targeting stability.
- [x] Upgraded focus motion helpers toward origin-aware continuity (safe-frame, scale, origin, continuity-adjusted translation, guarded output).
- [x] Extended static contract assertions for cinematic structure markers and new focus helper decomposition.
- [ ] Runtime follow-up: verify on-device sequencing quality (top/bottom/action staging timing), close behavior, and grid↔list preview ownership parity.

## 2026-04-03 — Preview intent routing split (new)
- [x] Replaced interaction-level drawer intent with preview intent (`openPreview`) in `useAssetInteractions`.
- [x] Updated list row contract from `onOpenDrawer` to `onOpenPreview` and rewired `ExplorerApp` list rendering call site.
- [x] Added view-based preview routing in `ExplorerApp` (`grid` → world-focus attempt, `list` → explicit drawer fallback).
- [x] Gated drawer motion effect by presentation mode so `inspectorOpen` alone no longer implies drawer animation during world-focus.
- [x] Updated static contracts for renamed preview intent strings and `openPreview` local-routing checks.
- [ ] Runtime validation: verify grid tap no longer visually enters via drawer while list tap still uses drawer preview.

## 2026-04-02 — Focus world transform landing fix (new)
- [x] Updated focus measurement to neutralize `.focus-world-stage` transform before reading stage/card/viewport rects and restore styles immediately.
- [x] Added stage-aware transform safety guard in `focusWorldMotion` so impossible projected landings return `null` and trigger explicit fallback.
- [x] Added dev diagnostics surface `__explorerFocusWorldDebug.lastMeasurement` with neutralized rect snapshots and fallback decision.
- [x] Expanded static contracts for neutralized measurement path + unsafe-transform fallback path.
- [ ] Validate runtime on top-left asset tap + refocus sequence to confirm no off-screen world push and clean fallback on invalid targets.

## 2026-04-02 — Focus presentation ownership phase-1 (new)
- [x] Introduced explicit focus presentation ownership transitions in `ExplorerApp` using `idle` / `world-focus` / `drawer-fallback` with centralized fallback-or-idle teardown helper.
- [x] Added untransformed-card measurement path for world-focus refocus (`focus-world-stage` temporary identity sampling) to avoid transformed-geometry recenter drift.
- [x] Added drawer-motion suppression hook for world-focus (`getSuppressOpen`) so inspector semantics can stay mounted without sheet/side visual ownership.
- [x] Added world-focus suppression class wiring on drawer and bounded focus-world stage CSS so world transform remains isolated to stage.
- [x] Strengthened static Explorer contracts for explicit presentation-state ownership, suppression path, and focus transform guard helpers.
- [ ] Run on-device validation pass (grid open/refocus/list-switch/close/missing-target) and capture evidence for world-focus ownership parity.

## 2026-04-02 — World-focus validity gating pass (active)
- [x] Tightened `focusWorldActive` gating to require real presentation context (`inspectorOpen`, `view==='grid'`, mode `world-focus`, and key alignment with `activeAssetKey`).
- [x] Added focused presentation invalidation effect to force clean transition when context breaks (inspector closes, key mismatch, non-grid view).
- [x] Invalidation now resets world transform identity before switching to explicit drawer-fallback when possible.
- [ ] Capture runtime notes validating no stale world transform after list/grid switches and direct inspector-close paths.

## 2026-04-02 — Focus starter contract cleanup pass (active)
- [x] Replaced mixed `startFocusMotionForSelectionKey` return contract (boolean/cleanup) with explicit structured result (`StartFocusMotionResult`).
- [x] Updated open/refocus call sites to branch on `focusStart.ok` and keep fallback branch explicit/readable.
- [x] Kept scope narrow: no motion tuning, no redesign, no new runtime harnesses.
- [ ] Add runtime note proving fallback reason transitions (`not-grid`, `density-unsafe`, `missing-target`) are observable in dev diagnostics.

## 2026-04-02 — Focus presentation state ownership pass (active)
- [x] Introduced explicit focused presentation state union in `ExplorerApp` (`idle`, `world-focus`, `drawer-fallback`) to prevent stale/impossible boolean combinations.
- [x] Updated open/refocus paths to choose world-focus vs explicit drawer-fallback based on measurable target safety; fallback now resets transform to identity first.
- [x] Centralized teardown via `resetFocusPresentationToIdle()` so close/unmount paths always clear timers, transform, and presentation mode.
- [x] Added static contract assertions for focus presentation state model markers and fallback transitions.
- [ ] Add runtime/device verification notes for fallback transitions during density motion, list mode, and missing-card measurement cases.

## 2026-04-02 — Focus-world extraction safety pass (active)
- [x] Extracted focus-world safe-frame constants + transform math into `src/explorer/focus/focusWorldMotion.ts` to reduce `ExplorerApp` inline density and improve structural clarity.
- [x] Updated `ExplorerApp` to consume extracted focus helpers and switched recompute effect dependencies to earlier-safe values (`filteredMedia.length`, `pendingEntries.length`) to avoid any declaration-order ambiguity.
- [x] Extended static contracts to assert the new focus module and import wiring.
- [ ] Add runtime verification notes for focus recompute behavior during live density changes while inspector remains open.

## 2026-04-02 — Explorer focus-world follow-up alignment (active)
- [x] Re-scoped focus-world transforms from `.scroll-content` to dedicated `.focus-world-stage` so topbar/chrome stay stable while the grid/list world moves.
- [x] Kept dynamic fit endpoint path centered on real masonry card bounds (`.masonry-card[data-select-key]`) and shared open/refocus math.
- [x] Added static assertions for focus-world contracts (fit helper, start helper, focus constants, and stage marker).
- [ ] Device-check focused motion continuity across density changes and list↔grid toggles with `inspectorOpen` true.

## 2026-04-02 — Explorer focus-world motion integration (active)
- [x] Analyze current Explorer seams (`ExplorerApp`, `AssetGrid`, `AssetPreviewPanel`, interaction hooks, and contracts) before patching motion behavior.
- [x] Added dynamic fit-endpoint focus-world transform (safe-frame + width/height limiting side) to keep grid as world during open/refocus.
- [x] Preserved `AssetPreviewPanel` semantic surface while delaying focused overlay chrome reveal until late in focus motion.
- [x] Updated in-focus tap behavior to refocus in place instead of close-then-reopen.
- [ ] Add or extend static contract assertions for focus-world motion/reveal classes once motion contract strings are finalized.
## 2026-04-02 — Explorer prod public-dir invariant hotfix (new)
- [x] Restored builder-stage invariant for prod image by creating `public/` (`RUN mkdir -p public`) before build so runner `COPY --from=builder .../public` cannot fail when repo omits `public`.
- [x] Kept dev/prod profile split unchanged; fix is scoped to prod build stability only.
- [ ] Validate `docker compose -f docker/docker-compose.explorer.yaml --profile prod up --build` succeeds on host with no `COPY .../public` missing-path failure.

## 2026-04-02 — Explorer Docker mode-switch follow-up (new)
- [x] Restored explicit production container lane (build + runtime) in `docker/Explorer/Dockerfile` while keeping dedicated dev/HMR target.
- [x] Updated compose to expose two profile-driven services (`explorer-dev`, `explorer-prod`) so mode selection is a compose property (`--profile dev|prod`) instead of rewriting files.
- [x] Kept dev bind-mount + named `node_modules` volume + polling watcher flags isolated to dev profile only.
- [x] Kept production API-base environment wiring on the prod profile lane.
- [ ] Validate both profile commands end-to-end on host (`--profile dev` Fast Refresh, `--profile prod` packaged runtime).

## 2026-04-02 — Explorer Next.js hot-reload container lane (new)
- [x] Reworked `docker/docker-compose.explorer.yaml` into a dedicated `explorer-dev` Next.js Fast Refresh service on port `3000`.
- [x] Added bind-mount + isolated named `node_modules` volume to preserve host edits without masking container dependencies.
- [x] Enabled Docker-friendly file watching via `WATCHPACK_POLLING` and `CHOKIDAR_USEPOLLING` environment defaults.
- [x] Converted `docker/Explorer/Dockerfile` to a dev-friendly image (`node:20-bookworm`, `npm install`, `npm run dev`) aligned with the Next package workdir.
- [x] Updated Explorer package scripts to expose dev/start on `0.0.0.0:3000` for container-accessible HMR.
- [x] Added webpack watch polling fallback in `docker/packages/Explorer/next.config.js` for unreliable filesystem event forwarding.
- [ ] Device-verify Fast Refresh from host edits (`app/page.tsx`, `src/ExplorerApp.tsx`) while running `docker compose -f docker/docker-compose.explorer.yaml up --build`.

## 2026-04-01 — Ctrl+wheel pending-target correctness follow-up (new)
- [x] Addressed P2 review finding where multi-threshold Ctrl+wheel bursts could under-react due to rereading committed columns while pinch commits were deferred.
- [x] Added local pending target tracking for active Ctrl+wheel bursts (`ctrlWheelPendingColumns`) so each threshold crossing advances one column from pending intent.
- [x] Added burst/session idle reset (`CTRL_WHEEL_IDLE_RESET_MS`) to clear pending target and accumulator between Ctrl+wheel gesture bursts.
- [x] Kept non-pointer lane boundaries and authority flow unchanged (`preventDefault` only for Ctrl+wheel, density updates still via `setColumnsForPinch`).
- [x] Updated static contract assertions to lock pending-target stepping and idle reset markers.
- [ ] Device-verify high-delta Ctrl+wheel bursts to confirm monotonic multi-step behavior (e.g., `5→4→3→2`) across desktop wheel + trackpad hardware.

## 2026-04-01 — Desktop Ctrl+wheel density input lane correction (new)
- [x] Separated synthetic wheel lane from pointer-session invariant checks by passing `pointerSession` to gesture-contract assertions only when a real pointer session is active (`pointerId != null`).
- [x] Added dedicated desktop Ctrl+wheel density adapter in `ExplorerApp` with a non-passive `wheel` listener on the grid scroll surface.
- [x] Ctrl+wheel now calls `preventDefault()` only for the Ctrl gesture path, accumulates wheel deltas to thresholded steps, and forwards discrete steps into the existing density pinch commit path (`setColumnsForPinch(...)`).
- [x] Plain wheel scrolling path remains untouched (no preventDefault, no density routing without Ctrl).
- [x] Retained runtime diagnostics by adding `globalThis.__explorerCtrlWheelDensityDebug.getSnapshot()` for event/step visibility.
- [x] Updated static contract assertions to lock the new Ctrl+wheel lane and pointer-session invariant narrowing.
- [ ] Device-verify on desktop trackpad + mouse wheel across Chromium/Safari/Firefox that Ctrl+wheel suppresses browser zoom and drives density steps consistently.

## 2026-04-01 — PR #141 close-out baseline handoff (new)
- [x] Final close-out audit completed for PR #141 with scope kept to stabilization baseline only (no cinematic zoom/detail feature work introduced).
- [x] Confirmed stabilized interaction contract posture for merge:
  - pointer session lifecycle formalized via extracted interaction contract/session helpers,
  - pinch lane isolated from single-touch pointer lane,
  - touch-capable cross-orientation pinch attachment is not width-gated,
  - scroll safety preserved in portrait/landscape,
  - rotation/transient reset paths retained to prevent interaction poisoning.
- [x] Retained useful runtime diagnostics (`__explorerGestureDebug`, `__explorerPinchDebug`, `__explorerPinchPerfDebug`, density/layout debug hooks) as intentional regression surfaces; no valuable debug channel removed in close-out.
- [x] Completed in PR #141 (stabilization baseline):
  - interaction contract extraction,
  - pointer session alignment,
  - scroll safety restoration,
  - landscape/desktop-like touch pinch attachment fix,
  - cross-orientation interaction stabilization (tap/hold/pinch/scroll parity).
- [x] Explicitly deferred to next phase (out of PR #141 scope):
  - cinematic zoom/detail motion and any preview-system feature expansion.
- [ ] Next phase stub: open a new PR dedicated to cinematic zoom/detail behavior with independent acceptance criteria and regression guardrails separate from interaction baseline.

## 2026-03-31 — Pinch/density cross-orientation stabilization (phase 2) (new)
- [x] Block 0 baseline reconciliation completed: root cause identified as pinch controller attachment being gated by `isMobile` (viewport width), so landscape tablet/desktop-like widths skipped pinch controller attach entirely.
- [x] Block 1 pinch activation lane fix: `ExplorerApp` now computes a touch-capability gate (`coarse pointer || maxTouchPoints > 1`) and attaches pinch controller on touch-capable surfaces independent of mobile width.
- [x] Block 2 cross-orientation audit instrumentation: added pinch runtime diagnostics hook `globalThis.__explorerPinchDebug.getSnapshot()` (start rejects, move/step counts, cooldown/rearm skips, viewport resets, last reason/ratio/touch count).
- [x] Block 3 desktop-like handling: preserved touch-only pinch semantics (no fake desktop pinch), while enabling touch-capable desktop-like devices to use the same pinch lane; non-touch desktop continues using slider path.
- [x] Block 4 density commit observability: pinch debug now records threshold-crossing step intents (`step_out`/`step_in`) so commit-path reachability can be validated alongside existing `__explorerPinchPerfDebug`.
- [x] Block 5 rotation/transient safety preserved via existing viewport boundary reset lane in pinch controller and interaction hook.
- [x] Updated static contracts for the new touch-capable attach gate and pinch diagnostics.
- [ ] Next: on-device validate landscape + desktop-like touch hardware with `__explorerPinchDebug` + `__explorerPinchPerfDebug` snapshots to confirm activation and commit counts increase during pinch.

## 2026-03-31 — Scroll + landscape interaction ownership stabilization (new)
- [x] Block 0 baseline reconciliation completed from source: identified scroll lock risk in `.content .scroll { touch-action: none; }`, broad touch ownership override (`.asset/.row { touch-action: manipulation; }`), and global iOS double-tap suppression handler.
- [x] Block 1 scroll safety pass: restored scroll surface ownership to `touch-action: pan-y` and removed broad asset/list-row manipulation override so browser panning remains available on interactive card planes.
- [x] Block 2 loop-protection pass in `useAssetInteractions`: added per-frame move-update diagnostics (`trackMoveStateUpdate`) and idempotent state updates for drag flags to reduce render-loop risk under repeated move events.
- [x] Block 3 pointer promotion hardening: drag promotion now short-circuits repeat promotions once mode is already `'drag'`; touch moved-path teardown uses shared `isTouchLikePointer(...)` path.
- [x] Block 4 landscape ownership adjustment: removed iOS document-level double-tap suppression hook that could intercept ordinary tap/scroll progression; retained gesture/multi-touch suppression outside density pinch surface.
- [x] Block 5/6 transient boundary safety: added resize/orientation transient gesture reset in `useAssetInteractions` and emits `viewport_boundary_reset` debug marker for traceability.
- [x] Updated Explorer static contract assertions for the new ownership/diagnostic markers and reran suite.
- [ ] Next: on-device verify updated matrix (portrait+landscape scroll, tap/hold promotion) and capture `__explorerGestureDebug.getSnapshot()` during rotation + pinch attempts.

## 2026-03-31 — Gesture promotion fix pass (post-scroll rollback) (new)
- [x] Identified promotion-path blocker in `useAssetInteractions`: long-press move-cancel threshold was also setting `session.moved`, causing touch interactions to be treated as moved/canceled before tap completion.
- [x] Separated thresholds by intent: long-press cancel still cancels hold, but touch tap-cancel now uses its own larger threshold (`TOUCH_TAP_CANCEL_PX_BASE`) and emits dedicated `pointermove:tap_cancel` debug marker.
- [x] Updated threshold scale policy to avoid over-scaling mouse interactions (`getGestureThresholdScale(pointerType)` returns `1` for mouse, DPR-scaled for touch/pen only).
- [x] Added touch pointerup moved-path guard to avoid routing touch jitter into desktop drag/drop completion path.
- [x] Updated static contracts and re-ran Explorer static contracts/build.
- [ ] Next: on-device verify landscape tap/second-tap/drag promotion improvements and capture updated `__explorerGestureDebug` traces for pinch-arming diagnosis.

## 2026-03-30 — Scroll-safety rollback for touch-action regression (new)
- [x] Rolled back over-constrained touch ownership on main card/thumb surfaces to restore reliable vertical scrolling in both portrait and landscape (`touch-action: pan-y` on interactive card/thumb planes).
- [x] Kept overlay layer non-owning (`pointer-events: none`, `touch-action: none`) to avoid overlay interception.
- [x] Added pinch controller viewport-boundary reset on `resize` / `orientationchange` to clear transient gesture/motion classes and settle scrub state after rotate.
- [x] Preserved pointer-capture and diagnostics work from prior pass.
- [x] Updated static contracts and re-ran Explorer static contracts/build.
- [ ] Next: device-verify landscape→portrait rotation no longer leaves scrolling stuck; then resume pinch-specific debugging separately.

## 2026-03-30 — Pointer-capture + DPR threshold normalization pass (new)
- [x] Added explicit pointer capture lifecycle in `useAssetInteractions` (`setPointerCapture` on pointerdown, release on pointerup) with debug markers for capture success/failure.
- [x] Normalized drag and long-press move-cancel thresholds by DPR (`POINTER_THRESHOLD_BASE`, `LONG_PRESS_MOVE_CANCEL_PX_BASE` scaled at runtime) and updated threshold debug reasons accordingly.
- [x] Updated card interaction touch-action ownership to `none` on card/interactive/thumb surfaces to reduce mid-stream browser arbitration; overlay remains non-owning.
- [x] Expanded static contracts for pointer-capture and DPR-threshold markers.
- [x] Re-ran Explorer static contracts and build.
- [ ] Next: verify landscape trace shows `pointercapture:set` followed by more complete `pointerup` paths and fewer `pointercancel` interruptions.

## 2026-03-30 — Gesture ownership/touch-action hardening pass (new)
- [x] Added app-level pointerdown blocked-reason diagnostics (`no_preview_zone`, `interactive_target`, non-primary mouse, pinch suppression) to confirm whether handlers fire before pointer cancellation.
- [x] Extended gesture debug payload with touched element tag/class and computed `touch-action` for both target and current gesture surface.
- [x] Updated gesture-surface CSS ownership on Explorer cards/thumb plane to explicit `touch-action: pan-y` and added `.asset-overlay { touch-action: none; }` for clearer browser/app gesture responsibility.
- [x] Updated static contracts to lock touch-action and new gesture ownership diagnostics markers.
- [x] Re-ran Explorer static contracts and build.
- [ ] Next: capture landscape traces from `__explorerGestureDebug.getSnapshot()` and verify blocked/cancel reasons drop after touch-action hardening.

## 2026-03-30 — Gesture portability audit instrumentation pass (new)
- [x] Added runtime gesture diagnostics in `useAssetInteractions` via `globalThis.__explorerGestureDebug` with `getSnapshot()`/`clear()` to capture event stream and cancellation reasons.
- [x] Instrumentation now records pointer type, viewport size, orientation, DPR, card geometry, gesture start target zone (overlay/thumb/interactive), mode, and threshold/cancel reasons.
- [x] Added explicit event markers for pointer down/move/up/cancel plus threshold-driven long-press cancellation and drag-start (`LONG_PRESS_MOVE_CANCEL_PX`, `POINTER_THRESHOLD`).
- [x] Kept this pass audit-only: no threshold normalization or behavior rewrites were introduced.
- [x] Updated static contracts to lock debug-hook/event-marker presence.
- [x] Re-ran Explorer static contracts and build.
- [ ] Next: collect portrait vs landscape vs desktop snapshots and map highest-frequency cancel reasons before threshold normalization changes.

## 2026-03-30 — Pointer session vs long-press cancellation split fix (new)
- [x] Fixed `useAssetInteractions` regression where movement-driven long-press cancellation could clear active pointer session and break later pointerup completion.
- [x] Split helpers into `cancelPendingLongPress()` (timer/progress/emphasis reset only) and `resetPointerSession()` (terminal pointer teardown only).
- [x] Updated move-threshold path to preserve session identity (`pointerId`/`itemKey`) while marking `session.moved = true` and canceling only long-press machinery.
- [x] Kept full pointer-session reset on terminal paths (`pointerup`, `pointercancel`, explicit teardown via existing `clearPendingLongPress`).
- [x] Updated static contracts to lock helper split + move-path ordering/session-guard expectations.
- [x] Re-ran Explorer static contract suite and build.
- [ ] Next: run on-device smoke test for tap, second-tap preview, drag/drop completion, long-press, and pinch arbitration.

## 2026-03-29 — Reveal tween restoration + overlay fade continuity pass (new)
- [x] Converted `AssetGrid` scroll reveal from one-stage visibility to a two-stage pipeline (`revealedCards` -> double-rAF `visibleCards`) so cards paint pending state before entering visible tween state.
- [x] Kept fail-safe reveal semantics but routed final visual entry through staged visibility scheduling to avoid snap-in on first paint.
- [x] Preserved overlay DOM during simplification by replacing conditional unmount with a persistent `.asset-overlay` plus `.is-simplified` class for opacity-based fade suppression.
- [x] Updated Explorer static contracts for staged reveal state/refs, overlay simplification class contract, and revised reveal class markers.
- [x] Re-ran Explorer static contracts and production build in this environment.
- [ ] Next: on-device validate scroll reveal interpolation under fast flick + reverse scroll and verify simplification fade behavior under density motion.

## 2026-03-29 — AssetGrid build break hook-scope fix (new)
- [x] Fixed Explorer build failure in `AssetGrid.tsx` where `revealedCardsRef` sync hook was accidentally left below `export const AssetGrid = memo(AssetGridComponent);`.
- [x] Moved `useLayoutEffect(() => { revealedCardsRef.current = revealedCards; }, [revealedCards])` back inside `AssetGridComponent` to restore valid hook scope and lexical access.
- [x] Confirmed `revealedCardsRef` remains intentionally declared and used for scroll-reveal observer freshness without effect dependency churn.
- [x] Re-ran Explorer build and static contracts; both pass.
- [ ] Next: run on-device aggressive scroll verification to ensure reveal behavior remains stable after hook relocation.

## 2026-03-29 — React #185 reveal-loop guard fix (new)
- [x] Root cause identified in `AssetGrid` scroll-reveal effect: synchronous prewarm `flushPending()` in layout effect could repeatedly enqueue immediate state updates during reveal churn.
- [x] Added strict no-op guards for reveal state transitions (`return changed ? next : prev`) so observer/prewarm callbacks do not trigger renders when nothing changed.
- [x] Replaced synchronous prewarm state write with next-frame flush (`requestAnimationFrame`) to break nested layout-effect update chains.
- [x] Decoupled reveal observer effect from `revealedCards` dependency by introducing `revealedCardsRef` mirror, preventing re-subscribe churn on every reveal update.
- [x] Added RAF cleanup and kept fail-safe timer cleanup to preserve idempotent lifecycle behavior.
- [ ] Next: confirm on-device that React #185 no longer appears under aggressive scroll while blank-card fail-safe remains effective.

## 2026-03-29 — Scroll-reveal stale-hidden fail-safe pass (new)
- [x] Fixed blank-window risk from stale scroll-reveal hidden state by adding a bounded fail-safe reveal timer per card (`220ms`) in `AssetGrid`.
- [x] Added viewport prewarm reveal criteria so near-viewport cards are marked visible immediately before observer callbacks (`viewportTop-80` to `viewportBottom+160`).
- [x] Observer reveal path now clears pending fail-safe timers when cards are revealed normally to avoid duplicate work.
- [x] Added unmount cleanup for outstanding reveal fail-safe timers to keep lifecycle idempotent.
- [x] Updated static contracts to lock fail-safe markers and prewarm criteria.
- [ ] Next: on-device verify no persistent blank holes during aggressive flick scroll + reverse scroll in long project lists.

## 2026-03-29 — Fast-scroll render window expansion pass (new)
- [x] Increased masonry render-window buffers in `AssetGrid` (`BASE_RENDER_BUFFER_PX: 1200`, `MOTION_RENDER_BUFFER_PX: 640`) to pre-render more cards and reduce empty-space gaps during fast mobile scroll.
- [x] Relaxed scroll-reveal observer gating (`threshold: 0`, expanded `rootMargin: 240px 0px 360px 0px`) so cards reveal earlier before they enter viewport.
- [x] Reduced scroll-reveal delay step (`12ms`, capped at 6 cards) to lower visible lag while preserving a subtle cascade.
- [x] Updated static contracts for the new fast-scroll reveal/buffer markers.
- [ ] Next: validate on-device with high-velocity flick scroll and tune buffer values against memory pressure on lower-end devices.

## 2026-03-29 — Demo-motion mapping pass (new)
- [x] Refined persistent overlay toggle animation timing to demo profile (`300ms`, `cubic-bezier(0.76, 0, 0.24, 1)`) across all overlay chrome nodes.
- [x] Added explicit density overlay choreography ownership in runtime (`animateDensityFlip`): motion start now applies `density-overlay-out`, and motion end applies `density-overlay-in` with `140ms`/`210ms` timing.
- [x] Added scroll-in reveal lane in `AssetGrid` using `IntersectionObserver` batching (`16ms`) with per-card delay markers (`35ms` step) and `380ms` ease-out transitions.
- [x] Added first-load page entrance lane in `AssetGrid` with `80ms` lead + `28ms` stagger and `320ms` rise/fade keyframe.
- [x] Updated static contracts to lock the new timing markers/classes and runtime ownership strings.
- [ ] Next: on-device tune reveal stagger caps for very large grids while preserving virtualization/windowing guarantees.

## 2026-03-29 — Persistent overlay toggle + gesture layering pass (new)
- [x] Added persistent overlay visibility preference (`OVERLAY_VIS_PREFS_KEY`) in `ExplorerApp` with localStorage hydration/persist (`'1'/'0'`).
- [x] Added an action-menu toggle beside density (`Overlays: On/Off`) that flips only persistent overlay visibility and does not mutate gesture lifecycle classes.
- [x] Applied host class layering (`.overlay-hidden`) so manual toggle has highest precedence; gesture lifecycle classes remain temporary choreography only.
- [x] Added smooth manual toggle fade support by restoring base overlay transition ownership on overlay chrome nodes while keeping density active-state overrides intact.
- [x] Updated static contract assertions to lock storage key/state wiring, toggle UI presence, host class application, and overlay transition markers.
- [ ] Next: run runtime probe to confirm (a) toggle OFF keeps overlays hidden regardless of gesture and (b) toggle ON preserves gesture hide + settle fade-back behavior.

## 2026-03-29 — Pinch release settling handoff fix (new)
- [x] Fixed release lifecycle hole where motion could remain active after pinch release in no-FLIP mode if release occurred before a clean motion-end handoff.
- [x] Added a release fallback handoff timer in `createPinchDensityController` that clears `.density-motion-active` and enters `.density-motion-settling` when gesture is no longer active.
- [x] Kept active-gesture blocking behavior intact (settling still blocked while `.density-gesture-active` is present).
- [x] Updated static contracts to lock release-handoff markers and motion-active clear behavior.
- [ ] Next: rerun overlay probe and confirm `settlingSeen: true` plus final host class without lingering `.density-motion-active`.

## 2026-03-29 — Density class-lifecycle ordering fix (new)
- [x] Moved no-FLIP motion lifecycle activation earlier so `setDensityMotionActive(true)` runs immediately at the no-FLIP gate before card queries, target-picking, or illusion-shell creation.
- [x] Kept CSS/timing/selector behavior unchanged; this pass is ordering-only to hide chrome before density mutation work begins.
- [x] Reconfirmed pinch gesture class path remains synchronous at touch-start (`setGestureActiveClass(true)` directly in `onTouchStart`, no rAF deferral).
- [x] Extended static contracts to lock early motion activation ordering and forbid rAF-delayed gesture-class application in pinch controller.
- [ ] Next: rerun the runtime probe and confirm first sampled active frame already reports `gesture:true` and `motion:true` before visible density remap.

## 2026-03-29 — Density active hidden-state precedence fix (new)
- [x] Tightened active motion/gesture chrome-hide selectors so hidden state wins immediately by forcing overlay chrome `opacity`/`transform` with `!important`.
- [x] Removed active-phase overlay transition ownership (`transition: none !important`) for both `.density-motion-active` and `.density-gesture-active` hosts to avoid first-frame leakage from broader transition rules.
- [x] Preserved settle cascade choreography (`.density-motion-settling:not(.density-gesture-active)`) and existing stagger return timing contracts.
- [x] Updated static style contracts to lock the new active hide precedence markers.
- [ ] Next: rerun on-device recorder to confirm active-phase overlay computed style is immediately hidden (`opacity: 0`, translated) during held gesture + motion.

## 2026-03-29 — No-FLIP motion-active lifecycle parity fix (new)
- [x] Identified root cause for missing live motion class: no-FLIP illusion branch in `animateDensityFlip` did not enter `setDensityMotionActive(true)`, so `.density-motion-active` never appeared during active density changes on that path.
- [x] Updated no-FLIP branch to enter motion-active before illusion settle timing and to record `motionActive: true` in motion debug snapshot during active phase.
- [x] Kept existing settle handoff (`setDensityMotionActive(false)`), gesture-class ownership, illusion architecture, and timing values unchanged.
- [x] Updated static contracts to assert no-FLIP branch enters motion-active and retains explicit active motion debug marker.
- [ ] Next: rerun runtime recorder and confirm `motionSeen/debugMotionSeen` flip true during active density change.

## 2026-03-29 — Motion snapshot record typing widen pass (new)
- [x] Fixed `animateDensityFlip` debug snapshot typing to allow string-valued host fields (`classHostTag`, `classHostClassName`) in `__explorerDensityMotionDebug.getSnapshot()`.
- [x] Updated snapshot array/declaration types from `Record<string, number | boolean>` to `Record<string, string | number | boolean>` with no runtime behavior change.
- [x] Re-ran Explorer build after fix in this environment (build completed successfully; font optimization warning from Google Fonts fetch remains non-fatal).
- [ ] Next: keep debug-snapshot typed aliases centralized if further host/runtime fields are added.

## 2026-03-29 — Motion-debug shape compile fix pass (new)
- [x] Fixed `animateDensityFlip` TypeScript mismatch by extending `updateMotionDebug(...)` input shape to include host-class diagnostics fields required by `motionDebugByGrid`.
- [x] Kept runtime behavior unchanged; this pass aligns helper typing with already-written snapshot payload fields (`classHostTag`, `classHostClassName`, `gestureClassApplied`, `motionClassApplied`, `settlingClassApplied`).
- [x] Re-ran Explorer static contract suite after the typing fix.
- [ ] Next: verify containerized `npm run build` in environment with `next` binary available.

## 2026-03-29 — Density class-host wiring fix pass (new)
- [x] Fixed state-to-DOM wiring by passing explicit class-host resolver (`getClassHostEl: () => mediaContentRef.current`) from `ExplorerApp` into density + pinch controllers.
- [x] Density lifecycle classes (`density-gesture-active`, `density-motion-active`, `density-motion-settling`) are now applied against the same real `.content` host element instead of relying only on nearest-node assumptions.
- [x] Added motion debug snapshot fields for host verification (`classHostTag`, `classHostClassName`, `gestureClassApplied`, `motionClassApplied`, `settlingClassApplied`).
- [x] Preserved CSS fade logic/timing, illusion architecture, bounded layout/render, and density correctness model.
- [x] Updated static contracts to lock host resolver wiring and class-application diagnostics fields; Explorer static suite passing.
- [ ] Next: re-run runtime recorder and confirm `.content` className contains lifecycle classes during held gesture + settle.

## 2026-03-29 — Held-gesture chrome holdback pass (new)
- [x] Added explicit held-gesture state class (`.density-gesture-active`) driven by pinch gesture lifecycle in `createPinchDensityController`.
- [x] Chrome hide rules now include held-gesture class, ensuring selector/type/size/metadata overlays remain hidden for the full duration of touch hold.
- [x] `animateDensityFlip` settling path now blocks settle-class entry while held gesture class is active, preventing premature fade-back during active touches.
- [x] On gesture release, pinch controller clears held-gesture class and only starts settle fade-back when density motion is no longer active.
- [x] Settling fade-back selectors now guard with `:not(.density-gesture-active)` so fade-in cannot start until hold state is cleared.
- [x] Preserved media plane behavior and existing density correctness/illusion architecture/diagnostics.
- [x] Updated static contracts to lock held-gesture gating and settle-start conditions; Explorer static suite passing.
- [ ] Next: verify multi-step held pinch on device to confirm overlays stay hidden between repeated notch commits until finger release.

## 2026-03-29 — Density gesture chrome fade-out/in polish pass (new)
- [x] Kept density motion class orchestration (`.density-motion-active` → `.density-motion-settling`) and preserved layout/illusion correctness path.
- [x] Updated asset-card chrome behavior to fade out on density motion start (active state) instead of instantly snapping hidden.
- [x] Fade-out targets remain non-media chrome only: selector UI (`.asset-ol-tr`), type badge cluster (`.asset-ol-tl`), size badge (`.asset-ol-bl`), and metadata text block (`.asset-ol-bottom`).
- [x] Fade-out timing set to `120ms` (`opacity` + `transform`), while settle fade-back remains delayed/staggered (`140ms + index*12ms`, duration `220ms`).
- [x] Kept thumbnail/video media plane stable throughout (no media-plane opacity choreography introduced).
- [x] Updated static contracts to lock fade-out and fade-back timing markers; Explorer static suite passing.
- [ ] Next: on-device verify whether fade-out should be slightly faster (`100ms`) on low-end devices without changing settle cadence.

## 2026-03-29 — Card-index CSS variable typing build-fix pass (new)
- [x] Fixed TypeScript build break in `AssetGrid.tsx` by extending the inline style type to include custom CSS variable `--card-index`.
- [x] Preserved behavior (same stagger variable value/path) and applied only a type-safe declaration update (`React.CSSProperties & { '--card-index': string }`).
- [x] Re-ran Explorer package build check; current environment reports missing `next` binary, but the `--card-index` type error is resolved in source.
- [ ] Next: keep an eye on future custom CSS variables in inline style objects and type them explicitly when introduced.

## 2026-03-29 — Density settle stagger cascade pass (new)
- [x] Added per-card stagger support for settle chrome return by stamping `--card-index` on positioned masonry cards in `AssetGrid`.
- [x] Updated settle CSS timing to use index-based delay (`calc(140ms + var(--card-index, 0) * 12ms)`) so card chrome no longer fades back synchronously.
- [x] Kept active-motion suppression strict (`opacity: 0`, `translateY(4px)`, `transition: none`) for targeted overlay chrome while preserving thumbnail/media plane stability.
- [x] Added reflow enforcement (`void contentEl.offsetHeight`) before applying `.density-motion-settling` to ensure transitions reliably fire after active-state removal.
- [x] Preserved density correctness, illusion architecture, bounded layout/render, and diagnostics surfaces.
- [x] Updated static contracts to lock stagger variable wiring, reflow marker, and staggered settle transition strings; Explorer static suite passing.
- [ ] Next: run on-device review to tune stagger step (currently `12ms`) only if visual cadence still feels too dense at high card counts.

## 2026-03-28 — Post-density settle chrome fade-back pass (new)
- [x] Added a dedicated post-motion settling state (`.density-motion-settling`) in `animateDensityFlip` so card chrome can return after density motion stops.
- [x] Updated density-motion class orchestration: motion start clears settling state; motion end removes active state, adds settling state, then clears settling state after `360ms`.
- [x] Updated density-motion chrome CSS to keep non-essential card UI hidden during active motion and fade/slide it back in with delayed settle timing.
- [x] Fade-back timing set to delay `140ms` + duration `220ms` (`opacity` + `transform`) for bottom metadata, size badge, top-left kind badge, and top-right selector cluster.
- [x] Preserved media plane stability (thumbnail unchanged) and existing density correctness/illusion diagnostics.
- [x] Updated static contracts to lock settling class path and delayed fade-back CSS markers; Explorer static suite passing.
- [ ] Next: verify on-device feel for settle return timing and adjust only delay/duration constants if needed.

## 2026-03-28 — Pinch repeated-notch rearm pass (new)
- [x] Replaced one-shot pinch step lock (`stepped`) with a baseline-reset notch controller in `createPinchDensityController`.
- [x] Added re-arm hysteresis band (`rearmMin = 0.96`, `rearmMax = 1.04`) so each notch requires returning near neutral before the next step.
- [x] Added notch cooldown (`STEP_COOLDOWN_MS = 80`) to prevent noisy double-fires while preserving repeated one-gesture snapping.
- [x] Updated pinch thresholds to more notchy defaults (`outwardThreshold = 1.1`, `inwardThreshold = 0.9`).
- [x] Preserved existing density truth path (`density.setColumnsForPinch(...)`), overlay callbacks, and settle-on-release behavior.
- [x] Updated static contracts to assert repeated-notch guards and prevent regression to one-shot stepping; Explorer static suite passing.
- [ ] Next: run on-device pinch cadence check to tune thresholds/cooldown only if needed.

## 2026-03-28 — Illusion-layer ultra-small subset pass (new)
- [x] Kept no-FLIP illusion architecture enabled with visible-card-only participation and bounded layout/render authority unchanged.
- [x] Reduced illusion shell cap further from 16 to 8 cards (`ILLUSION_MAX_CARDS = 8`) to treat density motion as a small accent instead of a full visible-window carry.
- [x] Preserved center-of-viewport prioritization path (`rankedVisible` sorted by viewport-center distance before `slice(0, ILLUSION_MAX_CARDS)`), so only the highest-impact visible cards animate.
- [x] Preserved transform-only illusion motion and short settle boundary (`ILLUSION_SETTLE_MS = 36`) before committing real layout truth.
- [x] Updated static contract expectations for the tighter illusion cap and re-ran Explorer static suite.
- [ ] Next: rerun illusion validation probe and compare average frame pacing against prior run (`worstAvgFrameMs: 52.59`) with the new 8-card cap.

## 2026-03-28 — Illusion-layer cost reduction pass (new)
- [x] Reduced illusion shell workload in `animateDensityFlip` by capping shell cards (`ILLUSION_MAX_CARDS = 16`) and prioritizing viewport-center visible cards instead of animating every visible card.
- [x] Shortened illusion bridge timing (`ILLUSION_SETTLE_MS = 36`) to commit real density truth sooner and reduce overlap cost.
- [x] Simplified illusion animation to transform-only motion (`scale` + `y`) with shorter duration and lighter shell styling (removed opacity fade + heavy shadow path).
- [x] Updated static contracts for illusion cap/settle constants and transform-only branch markers; Explorer static suite passing.
- [ ] Next: rerun illusion validation probe and compare max illusion card count + frame pacing against prior (max 37, worst avg ~48ms) baseline.

## 2026-03-28 — Visible-card density illusion layer pass (new)
- [x] Added a minimal visible-card illusion shell in `animateDensityFlip` (no-FLIP isolation path) that captures only viewport-visible rendered cards and animates cheap transform/opacity on temporary absolute shells.
- [x] Moved real density truth commit in the no-FLIP branch to a short settle boundary (`setTimeout(..., 56)`) so illusion shells bridge perceived motion before the real remap lands.
- [x] Added motion debug fields to confirm illusion participation (`illusionLayerEnabled`, `illusionCardCount`, `lastRunUsedIllusion`) while preserving existing diagnostics.
- [x] Updated static contracts for illusion-layer branch markers and diagnostics fields; Explorer static suite passing.
- [ ] Next: run the density follow-up probe and compare frame pacing with illusion path active vs baseline no-illusion direct commit.

## 2026-03-28 — AssetGrid subtree simplification isolation pass (new)
- [x] Added `AssetGrid` isolation toggle (`ENABLE_SIMPLIFIED_CARD_SUBTREE_ISOLATION = true`) that temporarily renders a minimal card subtree during density transitions (thumbnail-only, no overlay chrome, no selector UI, no preview video).
- [x] Preserved card identity, geometry truth, density truth, bounded layout, and bounded rendering while simplifying only subtree complexity for bottleneck isolation.
- [x] Added runtime debug snapshot diagnostics for subtree isolation (`simplifiedCardIsolationEnabled`, `simplifiedCardSubtreeActive`, `lastDensityTransitionUsedSimplified`, `cardSubtreeMode`).
- [x] Updated static contracts to lock simplified subtree branch + diagnostics and re-ran Explorer static suite pass.
- [ ] Next: rerun density follow-up probe and compare frame pacing against no-simplification baseline to confirm whether card subtree complexity is the primary remaining bottleneck.

## 2026-03-28 — Density FLIP isolation branch pass (new)
- [x] Added an explicit density animation isolation toggle in `animateDensityFlip` (`ENABLE_DENSITY_FLIP_ANIMATION = false`) to allow direct commit + cleanup path without GSAP Flip while preserving density correctness.
- [x] Added direct-commit no-FLIP branch instrumentation updates (`flipIsolationEnabled`, `lastRunUsedFlip`) in `__explorerDensityMotionDebug` so runtime probes can confirm whether transitions used Flip or the isolation path.
- [x] Preserved bounded layout/render and gesture semantics; this pass only isolates the animation layer for bottleneck confirmation.
- [x] Updated static contracts for the isolation toggle and no-FLIP branch diagnostics; Explorer static suite passing.
- [ ] Next: rerun the density follow-up probe and compare no-FLIP frame pacing against current Flip path to confirm whether Flip is the primary remaining bottleneck.

## 2026-03-28 — Density regression isolation toggle pass (new)
- [x] Added a conservative isolation toggle in `AssetGrid` (`ENABLE_MOTION_AWARE_BUFFER = false`) so motion-aware buffer switching can be disabled without touching density correctness or windowed layout authority.
- [x] Kept bounded layout/render behavior intact while removing motion-class-driven state churn from the hot path in default isolation mode.
- [x] Added layout debug counters for regression triage (`motionObserverCallbackCount`, `renderWindowUpdateCount`) and explicit toggle visibility (`isolationMotionAwareBufferEnabled`) in `__explorerDensityLayoutDebug.getSnapshot()`.
- [x] Updated static contracts to lock the new isolation toggle + diagnostics fields and re-ran Explorer static suite pass.
- [ ] Next: rerun the density follow-up probe with this isolation default and compare frame metrics against the pre-isolation baseline; if improved, re-enable motion-aware buffer behind a safer non-reactive path.

## 2026-03-28 — Scrub pre-roll regression rollback (new)
- [x] Rolled back scrub FLIP pre-roll (`requestAnimationFrame(startFlip)`) in `animateDensityFlip` after runtime evidence showed severe frame pacing regression while correctness remained intact.
- [x] Restored immediate scrub FLIP start after commit to recover tight first/last FLIP timing and avoid extra pre-animation layout/paint churn.
- [x] Kept the calmer timing profile from the previous pass (pinch `0.14`, scrub `0.16/0.20`, settle `0.22/0.28`) and preserved all bounded layout/render correctness invariants.
- [x] Re-ran Explorer static suite pass.
- [ ] Next: rerun the density follow-up probe and compare worst avg/max frame timing against the pre-regression baseline (~23ms avg class).

## 2026-03-28 — Density motion feel polish pass (new)
- [x] Kept all density correctness + bounded layout/render invariants intact and limited this pass strictly to motion feel tuning in `animateDensityFlip`.
- [x] Added a one-frame scrub pre-roll (`requestAnimationFrame(startFlip)`) so rapid scrub updates start on a cleaner visual boundary without reintroducing queue/replay choreography.
- [x] Retuned density FLIP timing to calmer values while preserving mode-specific semantics: pinch `0.14`, scrub `0.16/0.20`, settle `0.22/0.28`, easing unchanged (`power2.out`).
- [x] Updated static contracts for the split pinch/scrub start branches and revised timing markers; Explorer static suite passing.
- [ ] Next: rerun density follow-up on device and compare worst frame spikes for 5→2/4 transitions against the prior baseline.

## 2026-03-28 — Density motion-buffer observability polish (new)
- [x] Added latched layout debug markers in `AssetGrid` to preserve transition-time truth beyond settle snapshots (`motionBufferEverUsed`, `lastBufferModeUsed`, `lastLayoutScopeUsed`, `lastMotionActiveAtMs`).
- [x] Preserved current bounded layout/render pipeline while making post-settle probes able to confirm whether density-motion buffer mode was ever active during the latest transition.
- [x] Updated Explorer static contracts to lock the new observability fields/refs in the layout debug hook.
- [x] Re-ran Explorer static suite pass.
- [ ] Next: rerun the density follow-up probe and confirm `bufferMode` may settle to idle while `motionBufferEverUsed` + `lastBufferModeUsed` still prove active density-motion participation.

## 2026-03-28 — Density bounded-layout computation pass (new)
- [x] Extended `computeMasonryLayout(...)` with optional inclusion gating (`shouldIncludeItem`) so stage-height truth can remain global while per-card layout object materialization is window-bounded.
- [x] Updated `AssetGrid` to apply the render window at layout-compute time (instead of post-layout filtering), reducing `layoutComputedItemCount` under ordinary density transitions while preserving absolute geometry semantics for rendered cards.
- [x] Expanded layout debug snapshot semantics to report bounded layout scope (`layoutComputationScope: 'windowed' | 'global'`) and compute counts sourced from `computeMasonryLayout` totals/included metrics.
- [x] Updated Explorer static contracts to lock bounded-layout gating + diagnostics and re-ran Explorer static suite pass.
- [ ] Next: rerun the on-device density follow-up probe and verify `layoutCount < logical` on non-trivial targets; if frame pacing remains poor, evaluate a second pass that bounds height-ratio evaluation itself for far-off rows.

## 2026-03-28 — Density render-window cost follow-up (new)
- [x] Added motion-aware bounded rendering policy in `AssetGrid`: idle uses a moderate viewport buffer while active density motion uses a tighter buffer to reduce high-density rendered-card count.
- [x] Added runtime class-observer wiring for `.density-motion-active` so bounded rendering can react to real motion-state transitions without changing density authority or gesture semantics.
- [x] Expanded `__explorerDensityLayoutDebug.getSnapshot()` with explicit layout-scope diagnostics (`layoutComputedItemCount`, `layoutComputationScope`) and render-mode diagnostics (`renderBufferMode`, active `renderBufferPx`).
- [x] Updated Explorer static contracts to lock the motion-aware buffer path and new layout/render diagnostics fields; re-ran Explorer static suite pass.
- [ ] Next: run the density one-shot probe on device again and compare density-5 rendered counts/avg frame time before deciding on further buffer tightening or layout-window computation changes.

## 2026-03-28 — Density motion-active simplification mode pass (new)
- [x] Added dedicated runtime density motion mode (`.density-motion-active`) that enables only during density FLIP and disables on settle/interrupt/no-item/stale-drop paths.
- [x] Added temporary card-surface simplification under density motion mode (mute bottom metadata chrome + soften top chrome visibility) while preserving thumbnail plane and layout truth.
- [x] Expanded density motion instrumentation with active/simplified state and duration tracking in `__explorerDensityMotionDebug.getSnapshot()`.
- [x] Preserved density correctness pipeline and pinch constraints (no gesture-semantic changes, no queue/replay reintroduction, no authority regressions).
- [x] Updated static contracts to lock density-motion-active class toggling + simplification CSS + instrumentation fields; Explorer static suite passing.
- [ ] Next: on-device validate frame-budget improvement during density transitions with motion mode active, then decide whether shell-layer approach is still necessary.

## 2026-03-28 — Density animation scope reduction pass (new)
- [x] Confirmed probe evidence that density FLIP was still paying whole-dataset motion cost (all cards moved/resized), causing harsh mobile motion despite correct density truth.
- [x] Added visible/near-visible FLIP target reduction in `animateDensityFlip` (`maxTargets=72`, viewport buffer `320px`) while preserving global layout commit for all cards.
- [x] Added runtime motion-scope instrumentation hook `globalThis.__explorerDensityMotionDebug.getSnapshot()` exposing total/visible/animated counts and viewport bounds.
- [x] Kept density correctness invariants unchanged (no queue/replay reintroduction, no pre-commit truth advancement regression, pinch immediate path preserved).
- [x] Updated static contracts to lock reduced FLIP target selection + instrumentation + existing correctness behavior; re-ran Explorer static suite pass.
- [ ] Next: on-device verify smoother density transitions while offscreen cards snap silently and visible cards animate cleanly.

## 2026-03-27 — Density motion-quality pass (truth-locked) (new)
- [x] Kept density correctness pipeline unchanged (commit/render synchronization + no pre-commit truth advancement) and limited this pass to FLIP motion profile quality tuning.
- [x] Disabled FLIP scale interpolation for all density modes (`scale:false`) to remove rubbery resize artifacts on positioned masonry cards.
- [x] Retuned density timings to calmer mobile-friendly values: pinch `0.13`, scrub `0.14/0.18`, settle `0.20/0.26` with restrained `power2.out` easing.
- [x] Preserved pinch dedicated immediate-start path and avoided queue/replay or partial-target reintroduction.
- [x] Updated static contracts to lock the new scale/timing/ease profile and revalidated Explorer static suite pass.
- [ ] Next: on-device verify flicker/chop reduction while confirming density truth remains locked under rapid 1↔6 and pinch notch changes.

## 2026-03-27 — Density commit/render ordering stabilization (new)
- [x] Root-caused remaining density desync to commit/render boundary timing: FLIP could start while React had not yet committed updated absolute card geometry for the new `gridColumnCount`.
- [x] Updated Explorer density commit callback path to `flushSync` the `setGridColumnCount(...)` update so committed density state and rendered masonry geometry are synchronized before FLIP continuation.
- [x] Kept density truth authority in `commitLayoutColumns(...)` (no pre-commit column advancement) and retained pinch path constraints (`immediate`, `scale:false`, dedicated pinch route).
- [x] Added runtime layout snapshot instrumentation (`__explorerDensityLayoutDebug.getSnapshot()`) with card geometry samples + flip-active signal for on-device truth verification.
- [x] Updated static contracts to lock flushSync commit behavior and layout debug hook presence; re-ran Explorer static suite with passing results.
- [ ] Next: on-device verify no stale 3-column residue or malformed gaps at density 1/2/4/6 using the new debug snapshot after settle.

## 2026-03-27 — Density layout-truth regression recovery (new)
- [x] Reverted risky density FLIP optimizations that could leave mixed old/new masonry geometry under rapid density changes.
- [x] Removed partial-target pinch FLIP path and restored full-card-set FLIP targets so all `.masonry-card` nodes reconcile each density commit.
- [x] Removed deferred queue/replay lane in `animateDensityFlip` and restored immediate retarget-kill sequencing so winning target commits always execute.
- [x] Kept dedicated pinch path + immediate start + `scale:false` while prioritizing final visible layout truth over motion-lane experimentation.
- [x] Updated static assertions to lock full-target pinch behavior and no queued-replay path.
- [x] Re-ran Explorer static suite (`node --test tests/exports.test.mjs`) with passing results.
- [ ] Next: run runtime device QA (pinch + slider stress) to confirm no stale-card gaps and no “stuck at 3 columns” behavior.

## 2026-03-27 — Density stuck-at-3 regression fix (new)
- [x] Root-caused the “animation flashes but grid remains 3 columns” regression to queued replay ordering in `animateDensityFlip`: queued runs could be re-deferred because `activeByGrid` was cleared *after* replay scheduling.
- [x] Fixed completion/interrupt ordering so active transform ownership is cleared before queued replay starts.
- [x] Added static regression assertions locking replay-after-active-clear ordering for both `onComplete` and `onInterrupt` paths.
- [x] Re-ran Explorer static suite (`node --test tests/exports.test.mjs`) with passing results.
- [ ] Next: runtime pinch + slider QA to confirm visible grid columns always reconcile with committed density/readout across repeated changes.

## 2026-03-27 — Density motion-lane choreography hardening (new)
- [x] Audited active density choreography collisions (in-flight FLIP overlap, pinch target handoff timing, transform cleanup/start ordering) and confirmed retarget-kill overlap was the primary readability conflict.
- [x] Added per-grid deferred-start lane control in `animateDensityFlip` so new density commits queue (`queuedByGrid`) while an active density animation owns card transforms.
- [x] Added queued replay handoff (`replayQueued`) that starts the latest queued density target on the next frame after settle cleanup, keeping a single readable resize/reflow pass.
- [x] Preserved pinch path guarantees: dedicated pinch interaction mode, no settle-mode delay regression, `scale: false`, and existing pinch controller queue/gating behavior.
- [x] Retuned density motion profile to remain responsive but more legible (`pinch 0.12`, scrub `0.12/0.16`, settle `0.18/0.24`; easing unchanged).
- [x] Extended static contracts for deferred/queued lane behavior, explicit timing profile, and settle reconciliation callback payload (`invariantFixups`, `queuedReplay`).
- [x] Re-ran Explorer static suite (`node --test tests/exports.test.mjs`) with passing results.
- [ ] Next: run on-device QA focused on rapid pinch + slider changes to confirm queued replay reads as deliberate and non-colliding on mobile Safari.

## 2026-03-27 — Pinch-density performance guard pass
- [x] Added pinch in-flight gating with single queued next pinch target in `createExplorerDensityController` to avoid re-entrant pinch FLIP churn.
- [x] Added lightweight runtime instrumentation hook `globalThis.__explorerPinchPerfDebug.getStats()` (active state, target count, duration, preview-active flag, dropped/queued counts).
- [x] Reduced pinch FLIP target set to near-viewport cards with a bounded cap while keeping full layout commit truth.
- [x] Added temporary pinch performance mode in `ExplorerApp` + CSS (`.content.pinch-perf-active .asset-thumb-preview`) to hide preview video layers during pinch motion.
- [x] Updated static regression assertions for pinch target reduction, in-flight gating/queueing, instrumentation, and preview suppression contract.
- [x] Re-ran Explorer static suite with all tests passing.
- [ ] Next: on-device validate pinch perf debug counters during repeated notch gestures and confirm no perceptible hitch on video-heavy datasets.

## 2026-03-27 — Pinch motion-quality simplification pass
- [x] Simplified pinch FLIP timing to a fixed fast profile (`duration: 0.09`, `ease: power2.out`) while preserving immediate start and `scale: false`.
- [x] Reduced pinch cleanup overhead by short-circuiting heavy per-card transition-reset loop in `clearTransforms()` for pinch mode.
- [x] Kept dedicated pinch routing (`setColumnsForPinch`) and node-count latch behavior intact.
- [x] Updated static assertions to lock pinch timing/ease and pinch cleanup short-circuit contract.
- [x] Re-ran Explorer static suite with all tests passing.
- [ ] Next: verify on-device perceived smoothness on repeated fast pinch notches across dense media sets (video + image mix).

## 2026-03-27 — Pinch density motion desync + node-flash stabilization
- [x] Added a dedicated pinch density commit path (`setColumnsForPinch`) so pinch threshold steps no longer route through delayed settle choreography.
- [x] Updated density FLIP to support explicit `'pinch'` interaction mode with immediate start and pinch-specific motion tuning.
- [x] Disabled Flip scaling for pinch transitions (`scale: false`) to reduce choppy resize interpolation on mobile masonry cards.
- [x] Added pinch overlay node-count latch in `ExplorerApp` so node display buffers while pinch is active and flushes at release boundary.
- [x] Updated static regression assertions for pinch path routing, pinch Flip mode, and overlay latch timing contracts.
- [x] Re-ran Explorer static suite (`node --test tests/exports.test.mjs`) with passing results.
- [ ] Next: runtime-device QA pass to verify perceived pinch notch timing and bridge node-count stability across repeated 1↔6 transitions.

## 2026-03-26 — Pointer session init-order hotfix (tap/second-tap restore)
- [x] Root-caused missing first-tap/second-tap behavior to pointer session reset ordering in `handlePointerDown`.
- [x] Moved `clearPendingLongPress()` ahead of pointer session assignment so new session values are not immediately nulled.
- [x] Added static regression assertion to lock init-order (`clearPendingLongPress` must precede `session.pointerId = event.pointerId`).
- [x] Re-ran Explorer static suite and confirmed all contracts pass.
- [ ] Next: verify on-device that first tap restores purple border and second tap reliably opens/activates preview video.

## 2026-03-26 — Tap/second-tap regression recovery after hold-progress pass
- [x] Root-caused tap regression to per-render local pointer variables in `useAssetInteractions` being reset by hold-progress-driven rerenders.
- [x] Replaced local pointer-tracking variables with stable `pointerSessionRef` state so `pointerup` can always match the active pointer and cancel long-press correctly.
- [x] Kept pre-threshold hold progress/threshold completion split while preserving pinch suppression and drag handoff behavior.
- [x] Updated static assertions to reflect session-based hold-start coordinate wiring (`session.pressX/session.pressY`).
- [x] Re-ran Explorer static suite to confirm tap/second-tap contract and shader lifecycle assertions all pass.
- [ ] Next: run on-device touch QA focused on rapid tap, double-tap, and long-press transitions under active overlay animation.

## 2026-03-26 — Hold timing + exclusive thumbnail preview ownership
- [x] Added pre-threshold long-press progress updates in `useAssetInteractions` (RAF-driven progress sampled against `LONG_PRESS_MS`) instead of spending the hold effect only at completion.
- [x] Triggered hold completion beat strictly from the actual long-press timeout path and canceled progress RAF on completion/cancel to keep gesture lifecycle deterministic.
- [x] Retuned hold shader to separate pre-hold activity from completion confirmation (`u_active` + `u_confirm`) and lengthened confirmation visibility decay for a clear post-threshold payoff.
- [x] Introduced preview ownership commit path in `ExplorerApp` and cleared preview ownership on first-tap focus transitions so previous video previews stop immediately when activation changes.
- [x] Added preview remount keying in `AssetGrid` and `AssetList` so ownership transitions force old preview `<video>` instances to unmount.
- [x] Updated `exports.test.mjs` assertions for hold timing split and exclusive preview ownership/remount contracts.
- [ ] Next: run device-level touch QA to tune final hold confirmation duration feel (if needed) without increasing bloom/noise.

## 2026-03-26 — Gesture arbitration + pinch overlay polish follow-up
- [x] Added pinch-win gesture exclusivity in `useAssetInteractions` so second-touch escalation cancels pending long-press/context-menu and suppresses single-touch actions until all touches end.
- [x] Reorganized shader directories into categorized structure (`core/`, `pinch/`, `tap/`, `hold/`, `shared/`) and moved pinch overlay modules into `shaders/pinch/`.
- [x] Fixed release artifact path by preserving last valid pinch finger anchors during fade-out (no null-center fallback on release path).
- [x] Added density-aware node count wiring (`gridColumnCount` -> overlay `nodeCount` -> shader `u_nodes`) so bridge internal nodes reflect committed columns.
- [x] Retuned pulse ring behavior for tighter threshold-notch readability and kept overlay visual-only/pointer-events-none layering.
- [ ] Next: capture new runtime trace verifying zero pinch-triggered context-menu opens and no center-flash artifacts on release.

## 2026-03-26 — WebGL pinch-feedback overlay integration (visual-only layer)
- [x] Added fullscreen shader overlay modules (`pinchFeedback.vert`, `pinchFeedback.frag`, `usePinchShaderOverlay`, `PinchShaderOverlay`) with WebGL alpha blending and JS-driven fade/pulse decay.
- [x] Mounted overlay in `ExplorerApp` above grid content and below topbar with `pointer-events: none` so it cannot capture interactions or own state.
- [x] Wired existing pinch controller callbacks to feed live finger points and threshold-step pulses (`+1`/`-1`) into overlay without changing density thresholds/commit logic.
- [x] Added static regression assertions for overlay mount wiring, shader hook lifecycle, pulse safety contract, and canvas overlay presence/unmount cleanup markers.
- [ ] Next: capture device runtime metrics/screens to confirm pulse/readability over real content across portrait/landscape.

## 2026-03-25 — Slider event sequencing fix for backwards-FLIP/double-pass symptom
- [x] Switched density slider live input wiring from `setColumns(..., true)` to `scrubTo(...)` so drag updates use scrub semantics instead of delayed settle semantics.
- [x] Added explicit scrub settle hooks on slider release/focus end (`onPointerUp`, `onKeyUp`, `onBlur`) via `settleScrub()`.
- [x] Updated static assertions to lock slider scrub wiring and settle hook presence.
- [ ] Next: re-check runtime 3→2 interaction for “target flashes first, jumps back, animates again” symptom after scrub/settle event split.

## 2026-03-25 — Scrub retarget churn reduction (ease visibility follow-up)
- [x] Added density scrub frame coalescing in `createExplorerDensityController` so rapid scrub input commits latest target once per frame.
- [x] Added pending-target + RAF lifecycle cleanup (`pendingScrubColumns`, `scrubFrameId`, destroy-time cancel) for idempotent scrub scheduling.
- [x] Updated static regression assertions to lock frame-coalesced scrub behavior and avoid accidental return to per-event scrub commits.
- [ ] Next: rerun runtime trace and compare `retargetKills`/`interrupts` before vs after coalescing to validate reduced mid-animation overpower peaks.

## 2026-03-25 — Density FLIP retarget lifecycle + responsiveness instrumentation pass
- [x] Moved FLIP state capture ahead of active animation kill so retarget commits read current visible geometry before interruption.
- [x] Added interrupt-cleanup suppression gate during intentional retarget kill to avoid flattening transforms between back-to-back density commits.
- [x] Switched scrub-start timing to immediate post-commit Flip start while retaining delayed settle-start path.
- [x] Tightened jump-distance motion tuning to firmer/faster durations/eases for both scrub and settle commits.
- [x] Added runtime debug stats hook (`globalThis.__explorerDensityFlipDebug.getStats()`) to count starts/completes/interrupts/retarget kills/stale-frame drops/no-item commits.
- [x] Updated static assertions for the new retarget and timing contracts.
- [ ] Next: collect before/after on-device metrics for `interrupts / starts` and `staleFrameDrops` under rapid 1↔6 scrubs.

## 2026-03-25 — Masonry transform ownership conflict fix (CSS vs FLIP)
- [x] Reviewed runtime DevTools density instrumentation output showing high `transitioncancel` churn and active baseline `transition: transform ...` on masonry cards.
- [x] Added masonry-specific CSS override to remove baseline transform transition ownership from `.masonry-card.asset` while preserving filter/border-color micro-interactions.
- [x] Disabled masonry-card hover transform offset (`.masonry-card.asset:hover { transform: none; }`) to avoid transform contention with density FLIP.
- [x] Added static regression assertions to lock the masonry transform-ownership CSS contract.
- [ ] Next: run another on-device 1→6→1 density trace and compare `transitioncancel` / `transitionend` ratios after CSS ownership isolation.

## 2026-03-25 — Density live-geometry interrupt continuity pass
- [x] Removed the `AssetGrid` post-render global transform/transition reset effect so render commits no longer cancel active FLIP motion.
- [x] Kept settle cleanup under `animateDensityFlip` as the motion-layer owner of transform lifecycle (`complete`/`interrupt`/no-item paths).
- [x] Added jump-distance-aware animation tuning (`jumpDistance`) so large density jumps are shorter/firmer and small jumps keep richer easing.
- [x] Updated Explorer static regression assertions to lock the no-render-reset contract and jump-distance timing/easing wiring.
- [ ] Next: add a runtime/browser continuity check (rapid 1↔6 scrubs) asserting no horizontal drift and monotonic visible-card continuity across interrupts.

## 2026-03-25 — Final settle invariant pass (geometry truth vs render truth)
- [x] Added forced transform reset + temporary transition suppression in `animateDensityFlip` cleanup (`complete`, `interrupt`, and no-item paths) using live node re-query.
- [x] Added an `AssetGrid` post-layout `useLayoutEffect` settle pass that re-clears transform/transition residue on all `.masonry-card` nodes after render commit.
- [x] Added regression assertions that lock both settle invariants so cleanup cannot regress during refactors.
- [ ] Next: add runtime instrumentation counter for density commits that verifies all cards finish with empty `transform` at settle boundary on device.

## 2026-03-25 — Repeated density-commit settle truth hardening
- [x] Added `clearTransforms()` in density Flip pipeline that re-queries live masonry cards and clears transform props after complete/interrupt/no-item commits.
- [x] Preserved run-id stale-frame gating and existing static contract strings while hardening cleanup behavior.
- [x] Added focused static assertions for stale-transform cleanup and no-item/stale-frame settle behavior.
- [x] Added stage width ownership marker (`width: '100%'`) on `.masonry-columns` render style to reinforce horizontal layout truth after repeated density transitions.
- [ ] Next: add browser/runtime test harness (Playwright or jsdom+layout shim) to validate “single settled masonry truth” after N rapid density changes with no horizontal overflow drift.

## 2026-03-25 — Explorer masonry/density regression contract expansion
- [x] Appended the provided static contract suite into `docker/packages/Explorer/tests/exports.test.mjs` without removing existing tests.
- [x] Kept intent intact while fixing implementation mismatches surfaced by the new assertions (`gutter` naming, masonry geometry markers, slider sync guard, and FLIP sequencing marker hygiene).
- [x] Re-ran `node --test tests/exports.test.mjs` and confirmed full pass.
- [ ] Next: add true unit tests for `computeMasonryLayout(...)` input/output vectors (edge widths, 1-column, high-column, and mixed aspect-ratio sets) instead of source-string contracts only.
- [ ] Next: add DOM/runtime continuity tests for density transitions (no mixed old/new card states mid-commit).

## 2026-03-25 — Double-rAF Flip + offsetWidth measurement follow-up
- [x] Added second-frame `requestAnimationFrame` gate before `Flip.from(...)` to reduce React/paint race conditions during density transitions.
- [x] Kept run-id stale-frame guards on both deferred frames so superseded animation targets are dropped.
- [x] Switched masonry host width read to `offsetWidth` with 0.5px dedupe threshold to reduce subpixel/scrollbar jitter.
- [x] Updated static regression assertions for nested rAF gating contract.
- [ ] Optional: capture a short iPhone Safari trace to confirm reduced snap/no-op transitions after density commits.

## 2026-03-25 — Density Flip race/continuity hardening
- [x] Switched Flip options for positioned cards to `absolute:false`, `prune:false`, `scale:true`, `overwrite:true`.
- [x] Added `requestAnimationFrame` deferral and run-id gating so stale queued animations are dropped when newer commits arrive.
- [x] Updated density controller to advance `currentColumns` prior to animated scheduling to reduce interrupted-commit desync.
- [x] Added/updated static regression assertions for new Flip options and run-id gating contract.
- [ ] Optional: add a runtime perf marker around `Flip.getState` + deferred `Flip.from` to compare scrub latency before/after on iPhone Safari.

## 2026-03-25 — Density reset-to-3 continuity hardening
- [x] Added `lastCommittedColumnsRef` to carry committed density across controller lifecycle rebinds.
- [x] Updated controller initialization to prefer prior committed columns ref before falling back to defaults.
- [x] Synced fallback commit path and controller commit callback to the same committed-columns ref.
- [x] Verified existing Explorer assertions still pass after continuity hardening.
- [ ] Optional: add a focused regression assertion locking `lastCommittedColumnsRef` as part of density controller initial column selection.

## 2026-03-25 — Build break hotfix (typed slider input event)
- [x] Fixed TypeScript compile error in Explorer slider `onInput` handler by switching from `event.target.value` to typed `event.currentTarget.value`.
- [x] Kept slider immediate-commit behavior unchanged while restoring `npm run build` type-check compatibility.
- [ ] Optional: add a tiny focused test assertion for typed `React.FormEvent<HTMLInputElement>` slider handler signature to prevent regression.

## 2026-03-25 — Density slider no-op/stuck-at-3 hotfix
- [x] Added fallback-safe `commitDensityColumns(...)` path so slider commits still update layout when controller ref is not yet attached.
- [x] Switched slider interaction to React `onInput` for immediate mobile commit behavior.
- [x] Corrected Flip item selector scope to match real persistent cards under the bound masonry grid element.
- [x] Updated focused assertions for commit fallback and corrected selector contracts.
- [ ] Optional follow-up: add lightweight in-app debug badge showing `{requested, committed, rendered}` density values during QA sessions.

## 2026-03-25 — Slider restoration + horizontal layout-state repair
- [x] Reverted mobile density UI from stepper back to slider while keeping 1..6 clamp and integer-step commits.
- [x] Kept committed density as single source of truth across readout, slider value, and masonry commit path.
- [x] Added additional masonry host-width remeasure pass on density/entry changes to reduce stale geometry reuse without Grid/List toggles.
- [x] Hardened density Flip interrupt path with explicit transform cleanup before new state capture to prevent stale horizontal offsets.
- [x] Added horizontal overflow guards on scroll + masonry host/stage to prevent sideways scroll caused by out-of-sync positioned cards.
- [x] Updated focused regression assertions for restored slider + overflow/transform cleanup contracts.
- [ ] Optional follow-up: add lightweight runtime debug overlay to print hostWidth/stageHeight/columnWidth during density changes on mobile Safari.

## 2026-03-25 — Density truth + mobile control stabilization pass
- [x] Reverted partial visible-only Flip target optimization to restore single-layout-truth rendering during density transitions.
- [x] Unified mobile density bounds to `1..6` in shared density constants and removed width-derived auto density overrides that could desync displayed vs committed values.
- [x] Switched mobile density UI from scrub slider to discrete stepper buttons (`Larger` / `Denser`) with one-step commits.
- [x] Reworked pinch density to one-step-per-gesture thresholds (outward/inward), with lock-until-gesture-end behavior.
- [x] Ensured pinch and stepper both route through the same density controller `setColumns(..., true)` path.
- [x] Updated regression assertions for new density control and pinch contracts.
- [ ] Optional: tune one-step pinch thresholds with on-device telemetry for Safari-specific touch jitter.

## 2026-03-25 — Density reflow performance scope audit + optimization
- [x] Audited density pipeline to separate pure layout compute work from DOM/Flip animation scope costs.
- [x] Kept full masonry layout correctness (all-item position map) while reducing Flip animation targets to near-viewport cards only.
- [x] Added geometry data markers (`data-layout-top` / `data-layout-bottom`) on cards to support low-cost visibility filtering without per-card live DOM measurement reads.
- [x] Added hard cap for animated cards per density commit and retained stale-animation kill behavior for latest-target responsiveness.
- [x] Updated focused regression assertions to lock visibility-capped Flip targeting and geometry marker contracts.
- [ ] Optional follow-up: instrument runtime timing (`compute layout` vs `Flip state capture` vs `Flip animation`) behind a dev flag for device-level profiling.

## 2026-03-24 — Masonry intrinsic geometry stabilization follow-up
- [x] Switched masonry height-ratio estimation to prefer intrinsic media dimensions (`height / width`) when `MediaItem.width` and `MediaItem.height` are available.
- [x] Kept orientation-based ratio buckets as explicit fallback only for assets missing intrinsic dimensions.
- [x] Refactored `AssetGrid` to build per-entry view models once and reuse them for both layout estimation and render paths.
- [x] Updated focused regression assertions to lock the intrinsic-ratio and updated layout iteration contracts.
- [ ] Add backend/API follow-up task to ensure every indexed media row consistently includes stable `width`/`height` metadata at ingest time.

## 2026-03-24 — PR-review regression lock: density mount timing + topbar hidden offset
- [x] Added focused assertions that density setup binds from `gridSurfaceEl` availability, not mount-only `gridRef.current` assumptions.
- [x] Added focused assertions that hidden topbar refresh path runs when `topbarMeasuredHeight` changes.
- [ ] Optional: add runtime telemetry marker for first density-controller attach on cold boot to confirm device behavior.

## 2026-03-24 — Direct-manipulation density rewrite
- [x] Removed scheduler-style density buffering and switched to immediate scrub commits.
- [x] Added strict safe-column clamping/finite guards for all density commits.
- [x] Updated Flip path to kill stale flips/tweens before capture and animate persistent node targets.
- [x] Refreshed regression assertions for direct-manipulation density contracts.
- [ ] Confirm on-device that blue-void collapse frames are gone during fast slider drags.

## 2026-03-24 — Local interaction network-quiet contract assertions
- [x] Added focused static assertions that density scrub handler does not invoke startup/media loaders.
- [x] Added focused static assertions that context-menu open path does not invoke startup/media loaders.
- [x] Added focused static assertions that preview drawer open path does not invoke startup/media loaders.
- [ ] Perform browser-level devtools check to confirm zero fetches during density/context/preview interactions.

## 2026-03-24 — Density continuity fix for large jumps
- [x] Audited disappear/reappear artifact during large density jumps.
- [x] Removed ordinary density-path `onEnter` fade behavior that misclassified persistent cards as entering.
- [x] Narrowed Flip selector to persistent masonry nodes and stopped opacity cleanup resets.
- [x] Updated focused regression assertions for no-enter-fade density reflow contract.
- [ ] Validate visually on device that 7→2 and 2→7 keep card continuity without field-wide blink.

## 2026-03-24 — RAF-first density scheduler refinement
- [x] Replaced timer-based fast-scrub coalescing with RAF-driven latest-target scheduling.
- [x] Enforced one density commit per frame max and removed timer-window lag path.
- [x] Added frame-level duplicate-target guard to avoid redundant commit churn.
- [x] Updated focused regression assertions to lock RAF-first scheduler contract.
- [ ] Validate finger-tracking feel on device against prior timer-based build and archive short perf notes.

## 2026-03-24 — Density intermediate-step coalescing pass
- [x] Audited density scrub pipeline for intermediate-step replay during fast drags.
- [x] Added fast-scrub/large-jump coalescing so stale intermediate column targets are skipped under rapid input.
- [x] Preserved latest-input-wins and interruptible Flip behavior while keeping slow scrub feel intact.
- [x] Updated focused regression assertions for fast-scrub coalescing markers.
- [ ] Gather device-level perf trace comparing 5→2 drag before/after (layout + scripting cost).

## 2026-03-24 — Toast rerender-churn root-cause fix (post-mitigation)
- [x] Investigated cross-feature Boot-toast replay signal beyond density (context-menu + preview-panel triggers).
- [x] Found root cause in toast ref-callback churn (inline callback ref identity changes causing null→node cycles and repeated toast enter animation).
- [x] Updated toast node tracking to be rerender-stable and idempotent; added stale-id cleanup effect keyed by current toast ids.
- [x] Added focused regression assertions for rerender-stable toast ref behavior and cleanup markers.
- [ ] Optional follow-up: add dev-only mount counter logging hook to detect unexpected subtree remounts early.

## 2026-03-24 — Boot-path isolation from density interactions (regression fix)
- [x] Investigated repeated “Boot Loading sources + projects” toast during density changes as startup-path replay signal.
- [x] Isolated boot/startup effect behind a session-singleton guard so density/view/layout interactions cannot replay boot loading.
- [x] Verified density controls remain local UI/layout interactions and do not intentionally invoke startup loaders.
- [x] Added focused regression assertions for boot-path singleton gating markers.
- [ ] Add runtime instrumentation pass (if needed) to capture mount-count telemetry in development for future lifecycle regressions.

## 2026-03-24 — Density scrub immediacy + inspector truth hardening (follow-up)
- [x] Replace half-step rounding lag with direction-aware scrub threshold conversion so density commits track finger movement at integer boundaries.
- [x] Split scrub vs settle Flip timing and add interrupt cleanup to keep rapid density changes interruptible without stale transforms.
- [x] Harden inspector drawer/backdrop contract with explicit ownership markers and backdrop data-attribute selector.
- [x] Add mode-query change synchronization so side/sheet preview behavior stays correct across portrait, landscape, and desktop-like widths.
- [x] Extend focused Explorer regression assertions for new density threshold and inspector ownership contracts.
- [ ] Capture manual runtime proof (portrait + landscape + desktop-like viewport) confirming panel-over-backdrop visibility and immediate density slider feel.

## 2026-03-24 — Density latency + inspector backdrop truth pass (PR #138 follow-up)
- [x] Reworked density scrub to latest-input-wins frame-coalesced commits for immediate finger-tracking.
- [x] Added in-flight Flip interruption/overwrite so stale transitions cannot lag behind new slider targets.
- [x] Shortened scrub-driven reflow timings to keep layout motion responsive during fast drags.
- [x] Added inspector-specific drawer/backdrop targeting contract (`data-inspector-drawer`, `.inspector-backdrop`) and explicit GSAP x/y closed vectors.
- [x] Preserved masonry-safe authority, modal/toast presence, topbar hidden refresh, and pinch gesture exemptions.
- [x] Expanded contract assertions for latest-input density behavior and inspector backdrop ownership markers.
- [ ] Capture fresh on-device iPhone Safari proof showing immediate slider tracking and visible inspector panel above dimmer in portrait/landscape.

## 2026-03-24 — Masonry-safe density scrub follow-up (PR #138 validation fix)
- [x] Removed density container-scale scrub illusion that caused overlapping/behind-card artifacts in orientation-sensitive masonry.
- [x] Kept masonry layout authoritative with synchronous `--masonry-column-count` commits + immediate Flip sequencing.
- [x] Tuned Flip targets/config for real Explorer card nodes and added transform/opacity cleanup guard.
- [x] Switched slider to fractional scrub input (`step=0.05`) with thresholded discrete column commits for smoother feel without fake scaled layers.
- [x] Kept drawer/backdrop, modal/toast presence, topbar refresh, and density pinch gesture exemptions intact.
- [x] Expanded focused contract assertions for masonry-safe density behavior.
- [ ] Capture on-device proof clip showing no overlap/behind-layer artifacts while scrubbing density on iPhone Safari.

## 2026-03-24 — GSAP architecture repair pass (PR #138 follow-up)
- [x] Rebind density controller lifecycle to delayed grid mount + grid/list view transitions.
- [x] Make density controller synchronously commit `--masonry-column-count` on the live grid before Flip choreography.
- [x] Implement continuous slider scrub feedback with discrete resting-point commits and settle behavior.
- [x] Re-sequence Flip to capture old state → synchronous commit → immediate Flip.from without React-timing RAF dependency.
- [x] Redesign preview drawer motion for explicit side-panel vs bottom-sheet modes and synchronize backdrop interactivity with visible panel lifecycle.
- [x] Implement real modal and toast exit-presence management (rendered vs open/exiting lifecycle).
- [x] Exempt density pinch surface from document-level iOS `gesturestart/gesturechange/gestureend` preventDefault handling.
- [x] Add topbar hidden-offset refresh path tied to measured-height updates while hidden.
- [x] Expand focused Explorer regression assertions for repaired contracts.
- [ ] Capture manual iPhone Safari validation for slider scrub feel + pinch behavior + drawer mode transitions.

## 2026-03-24 — Explorer GSAP motion architecture (new)
- [x] Add shared GSAP module with Flip registration and reusable motion controller contracts.
- [x] Add topbar/drawer/modal/toast/snap-band motion controller implementations under Explorer package motion modules.
- [x] Integrate Explorer topbar, drawer, modal, toast, and snap-band motion wiring without regressing existing selector/topbar ownership semantics.
- [x] Add density slider + pinch input pipeline with GSAP Flip-based masonry reflow animation and subtle post-Flip settle behavior.
- [x] Update Explorer package tests for GSAP motion/density wiring coverage and verify package test/build commands pass.
- [ ] Capture on-device iPhone Safari proof clip for pinch-density + snap-band interaction feel and attach notes to next PR cycle.

## 2026-03-24 — Explorer sidebar backdrop touch-intercept fix
- [x] Split sidebar overlay into `.sidebar-backdrop` and positioned it to start outside the open drawer footprint.
- [x] Updated Explorer markup to use `backdrop sidebar-backdrop` for sidebar-open dimming/close behavior.
- [x] Added focused regression assertions for sidebar-backdrop wiring and left-offset contract.
- [ ] Validate on physical iPhone Safari that the open left project panel is no longer darkened/intercepted and remains fully touch-scrollable while outside taps still close it.

## 2026-03-24 — Explorer sidebar touch + topbar menu pinning fix
- [x] Changed root shell touch-action from `none` to `manipulation` to restore sidebar panel touch/scroll usability.
- [x] Added topbar interaction lock conditions (`actionsOpen`, dropdown open state, focus-within) to `useTopbarScrollState` disable gating.
- [x] Added dropdown `toggle` listener + focus-within state tracking so topbar remains open while menus/controls are in use.
- [x] Updated focused Explorer regressions for root touch-action and new topbar-interaction lock markers.
- [ ] Validate on physical iPhone Safari that sidebar drawer remains touch-scrollable when open and topbar does not collapse while action/dropdown menus are active.

## 2026-03-24 — Explorer touch-action + iOS gesture fallback hardening
- [x] Added root shell `touch-action: none` to keep page-level pan/zoom disabled while app surfaces own interaction.
- [x] Re-enabled vertical scrolling on Explorer scroll hosts (`.content .scroll`, `.sidebar .scroll`, `.drawer-body`, `.preview-details`) with `touch-action: pan-y`.
- [x] Added tappable UI chrome `touch-action: manipulation` coverage for topbar/buttons/controls/assets/context-menu actions.
- [x] Added iOS fallback listeners in `ExplorerApp` to block gesture zoom, multi-touch start, and rapid double-tap zoom with passive:false handlers.
- [ ] Validate on physical iPhone Safari that pinch/double-tap zoom no longer fires while normal vertical scroll/tap interactions remain intact.

## 2026-03-24 — Explorer iPhone Safari viewport-lock hardening
- [x] Updated App Router viewport metadata to include `maximumScale: 1`, `userScalable: false`, and `viewportFit: 'cover'`.
- [x] Added global viewport-lock CSS for `html/body/#__next/.app` (`100vh` + `100dvh`, `overflow: hidden`) so the app shell owns screen scrolling.
- [x] Added safe-area env variable plumbing (`--safe-area-*`) and applied it to body padding.
- [x] Added global text-size adjust stability and minimum `16px` form-control font sizing to reduce iPhone Safari input zoom.
- [ ] Validate on physical iPhone Safari that viewport no longer drifts/zooms and shell scrolling stays locked to Explorer surfaces.

## 2026-03-24 — Explorer topbar/layout decoupling cleanup
- [x] Removed the root `.app` hidden-state class toggle tied to `topbarHidden` so shell layout no longer changes during ordinary hide/reveal.
- [x] Kept topbar-hidden state confined to topbar visual class/debug markers only.
- [x] Reran focused Explorer regression suite after the shell-class decoupling cleanup.
- [ ] Validate on physical iPhone Safari that no shell-level spacing or rebasing appears when topbar hide/reveal toggles repeatedly.

## 2026-03-24 — Explorer collapse decoupling follow-up
- [x] Removed legacy top-of-scroll reopen shortcut (`TOPBAR_REVEAL_AT_TOP_PX`) from `useTopbarScrollState` so reopen is hysteresis/content-edge only.
- [x] Stopped treating `--scroll-content-top-inset` as a live hide/reveal value by fixing it to measured open inset instead of `topbarHidden` toggles.
- [x] Updated inset-compensation effect to react only to measured inset deltas (height/gap changes), not topbar hidden-state transitions.
- [x] Updated focused Explorer regressions for removed raw reopen guard, fixed inset variable wiring, and revised compensation markers.
- [ ] Validate on physical iPhone Safari that collapse no longer drags assets upward during topbar hide and that upward scroll reopen still triggers reliably with hysteresis.

## 2026-03-24 — Explorer unified inset source-of-truth refactor
- [x] Replaced `.scroll-content.topbar-open/.topbar-hidden` class-driven padding with a single inline `--scroll-content-top-inset` variable derived from `topbarHidden`.
- [x] Added `data-topbar-hidden` debug markers to both `.scroll` and `.scroll-content` to validate state synchronization in Safari/Web Inspector.
- [x] Removed temporary `.content .scroll` padding seam (`padding: 0`) while debugging top-edge collapse behavior.
- [x] Updated focused Explorer regression assertions to lock variable-driven inset wiring and removal of legacy topbar-open/topbar-hidden content classes.
- [ ] Validate on physical iPhone Safari that topbar visual state and `--scroll-content-top-inset` stay in lockstep through repeated hide/reveal cycles with no one-frame mismatch.

## 2026-03-24 — Explorer inset transition removal + pre-paint compensation
- [x] Removed `.scroll-content` `padding-top` transition so topbar-open/topbar-hidden inset changes apply immediately without easing drag.
- [x] Removed `.topbar` transform easing from collapse path (kept light opacity-only transition) to avoid moving-edge coupling during scroll-driven hide.
- [x] Switched inset-compensation effect in `ExplorerApp.tsx` to `useLayoutEffect` so compensation scrollTop adjustments land before paint.
- [x] Updated focused Explorer regression assertions for no-padding transition, topbar transition contract, and layout-effect compensation wiring.
- [ ] Validate on physical iPhone Safari that collapse/reveal keeps first-row checkboxes fully tappable at the top edge with no ceiling-pull or transient clipping.

## 2026-03-24 — Explorer content-edge gating follow-up hardening
- [x] Removed the remaining legacy top-of-scroll reveal shortcut from `useTopbarScrollState` and kept reveal decisions in the logical content-edge path.
- [x] Introduced `getOpenInsetPx()` so open inset is computed explicitly and reused to derive `currentInsetPx` + `contentTopPx` for hide/reveal gating.
- [x] Rebased `lastScrollTopRef` inside `suppressAutoToggle()` to prevent compensation-window stale deltas from triggering immediate opposite-state toggles.
- [x] Updated focused Explorer regression assertions for the helper/guard additions and reran package export checks.
- [ ] Validate on physical iPhone Safari that collapse near top no longer pulls first-row assets into the ceiling and that reopen still feels stable without boundary chatter.

## 2026-03-24 — Explorer logical content-top topbar gating
- [x] Refactored `useTopbarScrollState` to compute `contentTopPx = scrollTop - currentInsetPx` using live measured topbar height plus runtime `--topbar-gap` while open.
- [x] Switched collapse behavior to hide only on downward scroll when logical content top reaches the viewport edge (`contentTopPx >= 0`) so assets push the topbar away instead of sliding behind it while open.
- [x] Added reopen hysteresis (`contentTopPx <= -20` while scrolling upward) to reduce hide/reveal chatter near threshold.
- [x] Added temporary topbar auto-toggle suppression around programmatic inset-compensation scroll updates to prevent immediate state bounce from compensation-induced `scrollTop` deltas.
- [x] Updated focused Explorer regression assertions for the new logical-content-top and suppression contract.
- [ ] Validate on physical iPhone Safari that first-row assets remain fully below the open topbar inset and then become fully tappable at the top edge immediately after collapse.

## 2026-03-24 — Explorer topbar hidden-ref TDZ build fix
- [x] Fixed `ExplorerApp.tsx` declaration order by replacing `useRef(topbarHidden)` with declaration-safe hidden/inset refs initialized before `useTopbarScrollState(...)`.
- [x] Seeded first-run hidden/inset baseline inside the inset-compensation effect so scroll adjustment remains transition-only and does not fire on mount.
- [x] Restored package Explorer build/type-check pass for the topbar compensation follow-up branch.
- [ ] Validate on physical iPhone Safari that collapse/reveal still preserves first-row asset position after the first interaction cycle.

## 2026-03-24 — Explorer topbar-collapse scroll compensation
- [x] Added hidden-transition scroll compensation that adjusts `.scroll` `scrollTop` by inset delta when `topbarHidden` flips, keeping first-row assets from jumping above the viewport edge.
- [x] Scoped compensation to hidden-state transitions only, while deriving inset from measured topbar height + `--topbar-gap` so geometry remains device-responsive without measurement-churn jumps.
- [x] Updated focused Explorer tests to assert transition compensation markers and prevent regression to uncorrected inset-collapse jumps.
- [ ] Validate on physical iPhone Safari that collapsed topbar leaves first-row checkbox fully visible/tappable after repeated near-top collapse/reveal cycles.

## 2026-03-24 — Explorer measured topbar height synchronization
- [x] Added `topbarMeasuredHeight` state in `ExplorerApp` and wired a `ResizeObserver` on `topbarRef` so topbar geometry follows real rendered height.
- [x] Exposed `--topbar-measured-height` on `.scroll` with runtime style binding and kept CSS fallback to tokenized `--topbar-height`.
- [x] Switched both hidden transform and open-state `scroll-content` inset to measured-height variable to remove partial-collapse/header-overlap behavior near top-of-scroll.
- [x] Updated focused Explorer tests to assert measured-height state/effect/style wiring and measured-height CSS usage.
- [ ] Validate repeatedly on physical iPhone Safari (open→hidden near top boundary, short stop/start scroll cycles) that no clipping/jump remains and top-row checkboxes remain fully tappable.

## 2026-03-24 — Explorer scroll-content top inset follow-up
- [x] Added a dedicated `.scroll-content` wrapper under `.topbar-anchor` and moved both grid/list render blocks into that wrapper.
- [x] Applied open-state top inset only to `.scroll-content` (`topbar-open`) and collapse-to-zero in hidden state (`topbar-hidden`) so the first media row starts below the visible topbar at load.
- [x] Kept `.scroll` full-height and avoided reintroducing app-level top offsets or `topbar-reveal` seam elements.
- [x] Updated focused Explorer regressions to assert the `scroll-content` wrapper and open/hidden inset CSS contract.
- [ ] Validate on physical iPhone Safari that open-state first row is fully visible/tappable and hidden-state collapse remains smooth during repeated short scroll-stop cycles.

## 2026-03-24 — Explorer in-scroll sticky topbar overlay refactor
- [x] Moved the Explorer topbar into the real `.content .scroll` viewport as the first child inside a zero-height sticky anchor so the media grid and header now share one scroll world.
- [x] Removed the app-level `topbar-reveal` seam element plus the remaining `main` top-padding / topbar-offset layout contract so header hide/show no longer depends on content re-spacing.
- [x] Kept the topbar metadata row (`.section-h`) inside the same overlay block and switched hidden/open behavior to transform-only `.topbar.is-hidden` state so collapsed top-row assets can remain tappable.
- [x] Updated focused Explorer package regressions to lock the new sticky-overlay structure and guard against reintroducing reveal-strip or top-offset layout patterns.
- [ ] Validate on physical iPhone Safari that the first asset row no longer jumps during topbar hide/reveal transitions and that top-row checkboxes remain tappable immediately after collapse.

## 2026-03-23 — Explorer hidden-offset seam + toast stacking polish
- [x] Split the topbar offset into open vs hidden values so `main` keeps only the reveal seam while the topbar is collapsed instead of reserving the full header band.
- [x] Added a `padding-top` transition on `main` so the collapsed/open layout change reads as a smooth seam shift instead of a dead blank slab.
- [x] Raised the toast stack above the fixed header with safe-area-aware placement so boot/status toasts no longer appear behind the topbar metadata strip.
- [x] Expanded focused Explorer package regressions to lock the new offset-token and toast-layering contract.
- [ ] Validate on physical iPhone Safari that hidden-topbar mode shows media directly under the reveal seam and that toasts always paint above the header stack.

## 2026-03-23 — Explorer real scroll-host + topbar stacking cleanup
- [x] Split the Explorer content shell ref from the actual `.content .scroll` viewport and bound `useTopbarScrollState` to the real scrolling node so topbar collapse can trigger from real media scrolling.
- [x] Lowered the topbar-owned `.section-h` band beneath `.topbar-inner`, made that topbar section row non-interactive, and kept dropdown/actions layers above it so the metadata strip no longer wins the stacking fight.
- [x] Stopped always mounting hidden confirm/compose modal DOM and now render those dialogs only while open to avoid phantom overlay geometry on iPhone Safari.
- [x] Expanded focused Explorer package regressions to lock the split scroll-host refs, topbar stacking contract, and conditional modal mounting behavior.
- [ ] Validate on physical iPhone Safari that scrolling the media grid now collapses the topbar reliably, Type/Actions panels render above the metadata row, and no hidden confirm/compose overlay remains discoverable when closed.

## 2026-03-23 — Explorer topbar touch-only close model + stable hidden offset
- [x] Disabled document-level topbar outside-tap dismissal for touch/coarse-pointer environments so mobile portrait now relies on scroll-away behavior instead of tap-away collapse.
- [x] Kept the Explorer content offset stable while the fixed topbar hides, eliminating the upward first-row jump that previously moved checkboxes/assets under the user’s finger.
- [x] Increased mobile hide/reveal tolerance, added temporary topbar pinning on dropdown/action pointer-down, and widened the portrait seam spacing with extra mobile padding ahead of the first grid row.
- [x] Expanded focused Explorer package regressions to lock the touch-only dismiss gate, stable hidden offset, stronger scroll thresholds, and temporary topbar pinning contract.
- [ ] Validate on physical iPhone portrait Safari that first-row asset checkboxes no longer shift after the topbar closes and that ordinary taps outside the topbar do not dismiss it unless scroll-away intent is clear.

## 2026-03-23 — Explorer stale compose recovery cleanup + topbar touch fix
- [x] Added bounded reconciliation for startup-restored pending compose jobs so missing/unconfirmable records self-clear instead of lingering forever as reconnecting placeholders.
- [x] Made restored pending jobs remove themselves immediately when a matching real asset is already present and preserved failed-job persistence with richer serialized status/error/debug fields.
- [x] Raised package Explorer topbar/dropdown/action-panel interactive stacking above normal content and explicitly restored pointer-events on the real header controls to address untouchable Search/Type controls on iPhone Safari.
- [x] Added focused package regression coverage for stale pending-job reconciliation markers plus the topbar layering/pointer-events contract.
- [ ] Validate on physical iPhone Safari that stale compose placeholders no longer reappear after reload and that Search + Type are tappable in normal browsing with/without pending compose cards present.

## 2026-03-23 — Explorer topbar outside-dismiss scope correction
- [x] Replaced the document-level topbar outside-dismiss bailout’s app-wide interactive check with a topbar-owned target contract so unrelated project chips and bulk-action buttons can still collapse the revealed topbar.
- [x] Added explicit topbar ownership markers (`data-topbar-root/control/panel/reveal`) while preserving the generic interactive helper for asset/card routing only.
- [x] Extended focused package regressions to assert the new topbar-owned helper/marker split instead of the earlier over-broad dismiss exemption.
- [ ] Validate on physical iPhone Safari that tapping project chips, bulk-action controls, and first-row asset controls closes or preserves the topbar only when expected.

## 2026-03-23 — Explorer topbar interaction-boundary repair
- [x] Narrowed the hidden-topbar reveal hotspot to a dedicated strip so first-row asset taps no longer get intercepted by the reveal layer.
- [x] Added a shared interactive-target guard for topbar dismiss/asset gesture code so search, type/sort dropdowns, and selector controls no longer collapse the shell during valid interaction.
- [x] Hardened package asset selector controls to consume `pointerdown`/`click` before shell handlers can win and added focused regression coverage for the new interaction-boundary contract.
- [ ] Validate on physical iPhone Safari that search, type/sort controls, and first-row asset checkboxes all work without collapsing/revealing the topbar unexpectedly.

## 2026-03-23 — Explorer compose thumbnail continuity + water seam follow-up
- [x] Canonicalized Explorer asset/thumb identity around the normalized `primary` source so pending compose polling no longer churns keys when media rows alternate between `null` and `primary` source fields.
- [x] Hydrated project-scoped media rows with explicit `project_name` / `project_source` on load + scoped refresh and reused the identity-preserving media merge helper so unchanged assets keep their object identity and loaded thumbnails through compose placeholder updates.
- [x] Pushed the pending compose SVG body/wave fills farther below the viewport, reduced bob amplitude slightly, and softened the crest highlight/body transition to remove the bottom gap and harsh seam without collapsing the two-wave look.
- [x] Added focused package regressions for canonical asset/thumb identity, identity-preserving scoped merges, and the updated SVG overscan/highlight contract.
- [ ] Validate on physical iPhone Safari that primary-source compose updates no longer blink visible real thumbnails back to generic placeholders and that the pending-water crest reads cleanly in queued/running/running_long/finalizing states.

## 2026-03-23 — Pending compose water overscan + thumbnail continuity fix
- [x] Overscanned the pending compose water SVG fills below the viewport and softened the crest transition so bobbing no longer reveals a bottom gap or a harsh dark seam.
- [x] Stopped pending compose polling updates from re-columnizing the real asset masonry by prepending pending cards into existing asset columns instead of rebuilding the whole mixed-entry column set.
- [x] Made real asset cards prefer their actual thumbnail URL immediately and preserved unchanged media object identity during scoped refresh merges so compose start/completion no longer drops visible thumbs back to generic placeholders.
- [x] Added focused package regression coverage for the masonry-prepend helper, immediate thumb-src path, and the overscanned SVG water renderer contract.
- [ ] Validate on iPhone Safari that active water cards never expose the thumb background at the bottom and that starting/completing a compose no longer causes visible asset thumbnails to blink back to generic VIDEO placeholders.

## 2026-03-23 — Pending compose card SVG polish pass
- [x] Switched the SVG water fill colors from embedded-alpha `rgba(...)` values to solid hex colors so wave/body transparency is controlled only by SVG layer opacity.
- [x] Slightly strengthened rear-wave readability and lowered the body surface to keep clearer front/rear separation on dark mobile Safari thumbnails.
- [x] Updated focused package tests to lock the solid-color fill contract and tuned rear-wave opacity.
- [ ] Re-check on a physical iPhone that the rear wave stays readable in bright ambient light and that the extra separation does not overstate the water depth.

## 2026-03-23 — Pending compose card single-SVG wave fix
- [x] Replaced the placeholder card’s layered DOM wave/body treatment with a single in-file SVG renderer so rear/front water layers share one coordinate space and no longer composite into visible bands.
- [x] Added distinct rear/front wave paths plus subtle vertical bob + separate horizontal pan rates for active states, while keeping failed cards visually stalled and preserving existing status/color semantics.
- [x] Updated focused package tests to lock the new SVG water renderer contract and guard against reintroducing the old `pending-compose-water-wrap` / reused `Wave` implementation.
- [ ] Validate on iPhone Safari that the rear wave now remains readable behind the front crest in queued/running/failed cards and that the bob stays subtle rather than progress-like.

## 2026-03-23 — Explorer pending compose recovery across refresh + reconnect
- [x] Persisted accepted pending compose jobs to localStorage with the lightweight recovery fields (`jobId`, `jobUrl`, project/source/target/output identity, created time, mode/input count, and refresh scope).
- [x] Rehydrated pending placeholders on Explorer startup before polling resumes so refreshes do not create a blank gap between submission and eventual asset registration.
- [x] Converted poll transport failures into a frontend-only `reconnecting` state with backoff instead of hard-failing the placeholder, while keeping backend-explicit failures dismissible and persisted until dismissal.
- [x] Kept completed placeholders visible after reload until refreshed media confirms `result.path`, then cleaned up both in-memory and persisted recovery state only on the confirmed swap.
- [x] Added focused Explorer package regression coverage for persisted recovery helpers, reconnect timing, reconnecting UI state, and dismissal/cleanup wiring.
- [ ] Validate on a real browser by starting compose, refreshing mid-run, toggling network offline/online once, and confirming there is never a visual gap between placeholder and final asset.

## 2026-03-22 — Explorer pending compose newest-slot + finalizing handoff
- [x] Moved pending compose placeholders into the flat render list before masonry/list distribution so they behave like virtual newest assets instead of being injected after layout in a visually wrong column.
- [x] Added frontend-only `finalizing` status so completed compose jobs keep their reserved placeholder slot until refreshed media actually includes `result.path`, avoiding blank handoff gaps.
- [x] Added focused Explorer package regression coverage for newest-slot ordering helpers, `FINALIZING` badge support, and completed-placeholder persistence wiring.
- [ ] Validate on physical Safari/iPhone that a just-submitted compose placeholder now lands in the same top-left slot the final newest export occupies, including in All Projects view.

## 2026-03-22 — Backend normalized rotate/pix_fmt canonicalization follow-up
- [x] Reproduced the concrete failing shape from real logs: normalized segment validation still saw `rotate:90` and `video_pix_fmt:yuvj420p` on `segment_0000.mp4`.
- [x] Hardened normalization to clear inherited input display rotation metadata and to stamp limited-range `yuv420p` intent more explicitly in both video and image intermediate generation.
- [x] Expanded probe summaries with `video_color_range` and refined validation so only limited-range `yuvj420p` can pass as effectively canonical, while full-range `yuvj420p` still fails.
- [x] Added focused backend regression coverage for the new normalization flags and the limited-vs-full-range `yuvj420p` acceptance rule.
- [ ] Re-run the real failing clip set and verify the next `compose_normalized_probe` now reports either `yuv420p` or limited-range `yuvj420p` with `rotate:0`; if not, inspect whether ffmpeg is still writing a display matrix despite the input-side override.

## 2026-03-22 — Explorer pending compose placeholder UI
- [x] Added modular pending compose Explorer files (`PendingComposeAssetCard`, `composeJobs`, `usePendingComposeJobs`) instead of inlining another large compose-status state machine inside `ExplorerApp.tsx`.
- [x] Wired package Explorer compose submit to insert a local pending placeholder immediately from the `202 Accepted` envelope, poll `job_url` every 2 seconds, and render the placeholder before matching real assets for the same project/target-dir bucket.
- [x] Kept pending placeholders UI-only (no fake assets), removed them on completion after refresh-scope-targeted media refresh, and preserved failed placeholders with backend error text plus debug-artifact notice when available.
- [x] Added focused Explorer package regression coverage for pending compose module existence, accepted-job registration wiring, long-running status derivation, and pending-card render integration.
- [ ] Validate on physical Safari/iPhone that pending compose cards feel immediate and that completed jobs swap cleanly into real exports without a full-page reload.

## 2026-03-22 — Harness reliability + preserved intermediates debug path
- [x] Added compose-level `debug_keep_intermediates` support so operators can preserve per-job work dirs/intermediates for existing/upload/bulk compose runs without changing the main compose architecture.
- [x] Surfaced preserved debug artifacts back through compose results and documented the stable temp-root location for those artifacts.
- [x] Hardened the repro harness log harvesting path with a second full-log scan fallback when the recent-window scan finds no matching lifecycle lines.
- [ ] Run one real harness invocation with `--debug-keep-intermediates` and confirm the returned `debug_artifacts` paths plus log block are both useful on the host workflow.

## 2026-03-22 — Compose entrypoint/job-envelope alignment
- [x] Unified compose job envelopes across existing/upload/incremental/bulk flows so polling responses now all include `mode_requested`, `input_count`, `input_preview`, and status-specific `instructions`.
- [x] Documented the real compose mode semantics (`encode`, `copy`, `auto`) in `README.md` so caller behavior is explicit instead of inferred from route internals and Explorer defaults.
- [x] Added regression coverage for the aligned job-envelope fields in both project-scoped and bulk compose tests.
- [ ] Audit any remaining UI/operator consumers against the richer job envelope and confirm they use `refresh_scope` plus the new mode/input metadata instead of older assumptions.

## 2026-03-22 — Normalized FPS canonicalization + harness log capture follow-up
- [x] Treated the new real repro failure (`Normalized segment validation failed ... video_avg_frame_rate:25/1`) as an upstream normalization/validation issue rather than continuing to focus only on the final join.
- [x] Expanded normalized/output probe summaries to include both avg and real frame-rate fields, and loosened validation to accept canonical normalized outputs when `video_r_frame_rate` is correct even if `video_avg_frame_rate` is noisy.
- [x] Added explicit `-r 30000/1001` stamping to normalized outputs and widened harness log filtering so job-scoped lifecycle lines are still captured when the logger renders JSON-style `job_id` fields.
- [ ] Re-run the exact repro and capture whether normalization now passes; if playback still freezes after normalization succeeds, compare `compose_normalized_probe` vs final output behavior to decide whether the remaining bug is back in the final join.

## 2026-03-22 — Normalized-segment final join strategy follow-up
- [x] Switched encode-mode final join to prefer concat-demuxer copy over already-normalized intermediates so the default path avoids the final filter-concat stage that still appeared suspect in the real iPhone repro.
- [x] Kept the old filter-concat encode path as a logged fallback (`compose_normalized_concat_fallback`) when normalized concat-copy fails, preserving a reviewable escape hatch instead of deleting tooling.
- [x] Added regression coverage for normalized-join preference plus fallback behavior so future refactors do not silently revert to the heavier final join path.
- [ ] Re-run the exact real repro and confirm logs show `mechanism=concat_demuxer_copy_normalized` with no boundary freeze; if it still fails, inspect whether normalized segment 2 is already broken before join.

## 2026-03-22 — Encode-mode iPhone boundary A/V drift hardening
- [x] Fixed `scripts/compose_repro.py` to send `inputs` so the existing-assets repro harness matches the live `POST /api/projects/{project}/compose` request model.
- [x] Added per-stream normalized/output probe duration summaries plus `av_duration_delta_seconds` validation to catch audio/video drift that can cause second-segment audio to run ahead of video.
- [x] Hardened encode normalization and final concat filtergraph timing with explicit video/audio timebase rebasing and CFR-oriented output flags aimed at the reproduced iPhone HEVC portrait drift case.
- [ ] Re-run the exact repro (`job_id=d9c3e090-56ec-4613-a732-56a1ce813371` source pair / same project inputs) on this branch and compare the saved lifecycle log block plus resulting playback against the previous boundary-freeze artifact.

## 2026-03-22 — Real compose repro harness + evidence capture
- [x] Added `scripts/compose_repro.py` to submit an existing-assets compose request, poll the background `job_id`, and optionally filter `docker compose logs` to only the lifecycle lines for that job.
- [x] Documented a copy-paste repro command in `README.md` so real problematic clip sets can be re-run consistently on this branch.
- [x] Added regression coverage for the helper's payload normalization, status URL generation, and `job_id` log filtering.
- [ ] Run the harness against at least one known-bad portrait iPhone set, one mixed-orientation set, and one known-safe copy-compatible set; save the filtered log blocks for comparison/merge evidence.

## 2026-03-22 — Compose intermediate/output validation guards
- [x] Added normalized-intermediate probe logging so each prepared encode segment now has a recorded canonical summary before concat.
- [x] Added fail-fast validation for normalized segments and final outputs so invalid artifacts are rejected before registration and removed from disk when final output validation fails.
- [x] Added regression coverage for normalized probe logging and registration-blocking output validation failures.
- [ ] Run a real problematic iPhone multi-clip encode on this branch and capture `compose_normalized_probe` plus `compose_output_probe` logs to confirm whether rotation mapping or remaining timestamp issues still need adjustment.

## 2026-03-22 — Compose execution observability + mode-specific correctness
- [x] Split backend compose execution into explicit copy / encode / auto pipelines so each mode is debuggable independently instead of sharing one lightly branched path.
- [x] Added structured compose lifecycle logs for request receipt, per-input probes, strategy confirmation, normalization, concat execution, output validation, and job completion/failure.
- [x] Made encode path canonical by normalizing clips before concat with reset timestamps, stable fps/audio policy, and silent-track injection for inputs that lack audio.
- [x] Added regression tests covering concat command selection, normalization audio fallback, strategy/log visibility, and job/task compatibility with the richer executor signatures.
- [ ] Reproduce one of the real failing iPhone clip cases end-to-end and capture the new lifecycle logs plus output probe summary to confirm the repeated-first-clip / frozen-video symptoms are resolved.

## 2026-03-22 — Compose mode safety hardening
- [x] Confirmed Explorer selected-assets compose flows were still sending `mode: 'auto'` in both `public/explorer.html` and `docker/packages/Explorer/src/ExplorerApp.tsx`.
- [x] Switched Explorer multi-select compose requests to `mode: 'encode'` so human-driven ordered stitch jobs prefer correctness over concat-copy speed.
- [x] Hardened backend `auto`/`copy` compose strategy checks with stricter stream + container signature matching and explicit compose-strategy logging/fallback breadcrumbs.
- [x] Added regression coverage for frontend compose payload policy plus backend conservative auto/copy rejection reasons.
- [ ] Validate against a real problematic multi-clip Explorer selection and confirm logs now show `requested=encode selected=encode` (or conservative `requested=auto selected=encode` for direct API callers) with no chopped output.

## 2026-03-21 — Package Explorer multi-phase 404 scene replacement
- [x] Replaced the previous static 404 tunnel with the new single-route multi-phase shader scene (`idle`, `warp`, `arrival`, `exit`) while keeping root App Router not-found ownership.
- [x] Moved package-level 404 font loading to layout `<head>` links after the Bebas Neue `next/font` path proved brittle during replacement builds.
- [x] Hardened reduced-motion handling, guarded route handoff, named WebGL context loss/restore listeners, and softened phase switching to opacity-based overlap instead of abrupt removal.
- [x] Added regression assertions for the new phase machine, shader uniforms, layout font wiring, and runtime guards.
- [ ] Validate on physical desktop + iPhone browsers that the new purple-to-amber environment fills the viewport correctly and the arrival phase feels smooth before route handoff.

## 2026-03-19 — Package Explorer 404 tunnel framing recenter
- [x] Investigated the not-found composition regression as shader/camera framing drift rather than App Router ownership.
- [x] Re-centered the tunnel by introducing a dedicated shader center uniform and moving drift application ahead of aspect correction.
- [x] Reduced sway/nod amplitudes so portrait mobile keeps the vanishing point visually aligned with the 404 composition.
- [x] Updated regression assertions to lock the center-uniform wiring and reduced motion amplitudes without dropping existing WebGL hardening checks.
- [ ] Validate on physical iPhone Safari that the tunnel focal point now sits behind the 404/tagline/Surface stack across portrait and desktop-sized viewports.

## 2026-03-19 — Package Explorer default App Router not-found hardening
- [x] Installed `docker/packages/Explorer/app/not-found.tsx` as the root App Router 404 surface for unmatched package routes.
- [x] Moved the 404 fonts into package app layout via `next/font/google` so the shader page no longer depends on page-local Google Fonts imports.
- [x] Hardened the WebGL page for production with history fallback routing, reduced-motion throttling, visibility/resize safety, and context loss/restore cleanup plus a WebGL-unavailable message.
- [x] Added package regression assertions for root not-found ownership, font wiring, fallback routing markers, and WebGL safety markers.
- [ ] Validate on physical iPhone Safari that the shader tunnel remains smooth, the Surface CTA returns correctly from direct-entry 404s, and WebGL fallback messaging stays unobtrusive on lower-power devices.
## 2026-03-21 — Backend compose job flow / non-blocking API responsiveness
- [x] Converted project compose submission routes and bulk asset compose to return `202 Accepted` job envelopes instead of waiting for full compose completion inline.
- [x] Added an in-process background compose runner with persisted job snapshots plus `GET /api/projects/{project}/compose/jobs/{job_id}` polling for queued/running/completed/failed status.
- [x] Scoped compose refresh metadata to the affected project + target_dir branch so clients can invalidate only the relevant exports subtree after a job settles.
- [x] Moved existing-asset normalization work into temp-root job dirs outside discoverable project roots and kept incremental upload sessions retryable on background failure.
- [x] Updated backend tests and README/API notes for the compose jobs contract.
- [ ] Decide whether compose jobs need durable restart-resume semantics or a dedicated worker process beyond the current in-process runner/interrupted-job fallback.
- [ ] Add a lightweight compose jobs listing/cancellation API if operators need visibility beyond direct `job_id` polling.

## 2026-03-19 — Package Explorer passive-tile playback + brand toggle follow-up
- [x] Prevented first-tap active/focus intent from mounting hidden preview playback by gating preview asset ownership on `inspectorOpen`.
- [x] Kept second-tap preview, long-press context menu, and checkbox-only selection behavior intact while returning tiles to passive display surfaces.
- [x] Restored the full brand/logo region as the projects panel toggle with click + keyboard activation semantics.
- [x] Added regression assertions for passive tiles, preview gating, brand toggle wiring, and non-blocking topbar reveal behavior.
- [ ] Validate on physical iPhone Safari that tapping the logo opens/closes the project drawer reliably and that first tile taps never leak background audio.

## 2026-03-19 — Package Explorer interaction/stacking/scroll regression restore
- [x] Restored package Explorer tile tap semantics so first body tap only focuses the active tile, second tap opens preview, and checkbox selection remains isolated to selector controls.
- [x] Reintroduced an explicit active asset identity separate from selection order so rerenders/masonry/list switches do not break second-tap preview intent.
- [x] Removed the topbar paint-containment regression and re-established dropdown/actions-panel painting above asset surfaces without z-index spray.
- [x] Restored sidebar pane scroll ownership on mobile by giving the drawer scroll region explicit height/overflow/touch containment and by preventing body/main from stealing those gestures.
- [x] Added regression assertions for active-vs-selected tile markers, topbar clipping guards, and sidebar scroll-ownership markers.
- [ ] Validate on physical iPhone Safari that second-tap preview, topbar menus, and project-panel scrolling all behave correctly together under real touch latency.

## 2026-03-19 — Package Explorer TDZ/type-order hardening
- [x] Fixed the `resolveAssetUrl` before declaration regression in `ExplorerApp.tsx` by moving the callback above `thumbDatasetSignature` and `useThumbnailQueue(...)`.
- [x] Tightened extracted hook type surfaces with explicit result interfaces where helpful to make declaration/usage contracts clearer during future refactors.
- [x] Added regression coverage ensuring `resolveAssetUrl` is declared before `thumbDatasetSignature` so this TDZ class does not silently return.
- [x] Verified package Explorer now passes `npm test` and `npm run build` after the stabilization refactors.
- [ ] Keep watching for additional declaration-order regressions when splitting more `ExplorerApp.tsx` logic into modules/components.

## 2026-03-19 — Package Explorer interactions/topbar/component split
- [x] Extracted package asset pointer/gesture ownership into `src/useAssetInteractions.ts` without changing second-tap preview, long-press menu, or drag/drop selection semantics.
- [x] Added `src/useTopbarScrollState.ts` to coalesce scroll-driven topbar visibility updates behind RAF + delta thresholds instead of raw scroll churn.
- [x] Split package grid/list tile markup into memoized `src/components/AssetGrid.tsx` and `src/components/AssetList.tsx` while preserving stable render keys, thumb job markers, and selection-order UI.
- [x] Reduced `ExplorerApp.tsx` coupling by centralizing per-item render data in `buildAssetViewModel(...)` and keeping topbar/context/modal state out of the inline tile render path.
- [x] Updated package regression assertions to cover the new hooks/components and topbar scroll contract markers.
- [ ] Validate on physical iPhone Safari that topbar hide/reveal no longer flip-flops on tiny scroll deltas and that drag-near-top still reveals the bar predictably.
- [ ] Continue the file-splitting pass by isolating drawer-preview state and/or context-menu rendering if further rerender churn is still visible after this pass.

## 2026-03-18 — Package Explorer thumbnail queue + scroll smoothness pass
- [x] Extracted package thumbnail queue helpers out of `ExplorerApp.tsx` into `src/thumbnailLoader.ts` and `src/useThumbnailQueue.ts` to start reducing file size without changing UX semantics.
- [x] Re-keyed thumbnail work off a stable rendered dataset signature (`view`, `gridColumnCount`, thumb job identity) so selection/context/preview churn does not rescan/reload every visible thumb.
- [x] Added thumb job cache/in-flight dedupe markers (`thumbLoadStateCache`, `thumbLoadedKey`, `thumbJobKey`) so remounted tiles can sync from cache without new overlay/network work.
- [x] Restricted “Preparing thumbnails…” ownership to actual unresolved thumb loads for the current rendered dataset instead of broad rerender churn.
- [x] Centralized package grid/list render identity on the same canonical asset key and added compositor/touch-scroll polish for topbar + content scroll surfaces.
- [x] Updated package regression assertions for the new thumbnail modules, thumb job markers, and topbar compositor style markers.
- [ ] Validate on physical iPhone Safari that repeated scroll-away / scroll-back passes no longer flash the thumbnail overlay or blank/reload already-seen thumbs.
- [ ] Continue the file-splitting pass by extracting asset interaction handlers from `ExplorerApp.tsx` into a dedicated `useAssetInteractions` module without changing gesture semantics.

## 2026-03-18 — Explorer delete confirmation modal parity restore
- [x] Restored package Explorer delete actions to route preview/drawer/context-menu/bulk deletes through a dedicated app-owned confirm modal before delete requests fire.
- [x] Preserved cancel-path state safety (no delete request, no selection corruption, no drawer corruption) while keeping confirm-path toast + refresh semantics intact.
- [x] Removed static Explorer delete fallback to native `window.confirm` so delete now aborts safely if the custom modal is unavailable.
- [x] Hardened delete modal layering/touch behavior for iPhone Safari (`z-index`, `pointer-events`, `touch-action`) in static/package explorers.
- [x] Added regression assertions for preview/bulk confirm routing, confirm/cancel markers, and no-`window.confirm` usage in delete flows.
- [ ] Validate on physical iPhone Safari that delete confirm stays tappable above all overlays and that cancel/confirm behave correctly from preview, drawer, context menu, and bulk selection entrypoints.

## 2026-03-17 — Package compose repeat-submit lock (iPhone Safari)
- [x] Added `composeSubmitting` in package Explorer compose modal flow and hard-guarded `handleComposeConfirm` against re-entry.
- [x] Disabled compose modal controls while submit is active and added busy UI state (`Composing...`, `aria-busy`).
- [x] Prevented in-flight modal dismissal via Escape/backdrop to avoid accidental duplicate submits from rapid tap retries.
- [x] Added regression assertions for submit-lock, busy-label, disable-state, and finally-reset markers.
- [ ] Validate on physical iPhone Safari that rapid repeated taps on Compose now produce exactly one output artifact per compose action.

## 2026-03-17 — Bulk compose API transport-failure regression fix
- [x] Replaced stale bulk-compose imports from removed compose helpers with calls into the refactored compose service staged-path flow.
- [x] Added `ComposeService.compose_staged_paths(...)` so bulk asset compose can reuse planner/preprocessor/executor/registrar without route-level ffmpeg wiring.
- [x] Added explicit bulk-compose guard for unsupported `allow_overwrite=true` requests to return deterministic JSON errors.
- [x] Added/updated media API tests for bulk compose staged-path delegation and overwrite guard behavior.
- [ ] Validate from physical iPhone Safari that `/api/assets/bulk/compose` now returns HTTP JSON responses (no status-0 `Load failed`) for both success and failure cases.

## 2026-03-17 — Package compose static-flow parity follow-up
- [x] Aligned package compose empty-selection/no-video warning copy with static explorer compose flow.
- [x] Removed package compose modal auto-close on no-video validation so warning states keep dialog context.
- [x] Added regression assertion guarding against reintroducing no-video modal-close behavior in confirm path.
- [ ] Validate on iPhone Safari that warning-to-correction flow remains smooth when users adjust selection while compose modal is open.

## 2026-03-17 — Package compose modal submit regression restore
- [x] Traced compose modal submit path and reconnected it to the existing compose action/toast flow via form submit wiring.
- [x] Ensured both Enter and Compose button trigger `handleComposeConfirm` instead of visual-only button press behavior.
- [x] Restored compose success behavior to close modal + show success toast and kept modal open for validation/API errors.
- [x] Updated package compose default project preference to `P5-SHARED-Exported-Media` with `P5-Exported-Media` fallback.
- [x] Added/updated package regression assertions for preferred project marker, form-submit wiring, and compose success/payload markers.
- [ ] Validate on physical iPhone Safari that compose submit now consistently dispatches request + success toast under real network/API latency.

## 2026-03-17 — Compose mixed-media (video+image) preprocessing enablement
- [x] Expanded compose supported input policy to include `image` alongside `video` while keeping audio rejected.
- [x] Added image normalization helper to convert still assets into temporary fixed-duration MP4 segments for concat pipeline compatibility.
- [x] Updated compose preprocessor canvas selection to use the first visual input (video/image) and keep prepared segment order aligned to request order.
- [x] Added compose regression tests for mixed-media ordering and audio-rejection guardrail behavior.
- [ ] Add endpoint-level compose tests that exercise real ffprobe/ffmpeg mixed-media staging when CI/runtime media tooling is available.

## 2026-03-17 — Package Explorer project-pill toggle + sidebar scroll follow-up
- [x] Patched `docker/packages/Explorer/src/ExplorerApp.tsx` project-chip clicks to toggle off when the selected chip is tapped again (restore all-projects scope).
- [x] Kept project selection state resets aligned with static explorer behavior (clear selection/focus + reset resolve/upload project-bound fields).
- [x] Added package sidebar scroll hardening for mobile (`-webkit-overflow-scrolling`, `overscroll-behavior`, `touch-action`) to address stuck projects panel scroll behavior.
- [x] Added package regression tests for project-chip toggle deselect and sidebar scroll CSS contract markers.
- [ ] Validate on physical iPhone Safari that package projects panel scrolling remains responsive while drawer is open and long lists are present.

## 2026-03-17 — Static Explorer project-pill toggle behavior
- [x] Implemented project pill toggle in `public/explorer.html` so clicking the active pill clears selection and returns to all-projects media view.
- [x] Reset project-scoped UI state on deselect (upload caption/button + resolve target fields) and refreshed related counts/renderers through existing codepaths.
- [x] Added/updated static regression coverage for project-pill toggle + no-regression on normal single-click project selection behavior.
- [ ] Capture physical iPhone Safari verification clip for selected-pill deselect flow and attach to next PR notes.

## 2026-03-17 — Static + package compose modal parity (active)
- [x] Upgraded package Explorer compose flow from native prompts to an app-owned compose modal that matches Explorer UI surface styling.
- [x] Added package compose defaults for timestamped output naming and project dropdown selection (default `P5-Exported-Media`, fallback first project).
- [x] Added package keyboard-safe modal behavior (`Escape` cancel, `Enter` submit except on select control) and focus-on-open input handling.
- [x] Added parity marker `data-compose-project-picker="1"` to static + package project selectors for regression-lock consistency.
- [x] Expanded static/package regression coverage to assert modal compose markers, no `window.prompt` in compose path, and compose style selectors.
- [ ] Validate on physical iPhone Safari that package compose modal/dropdown interaction is comfortable with on-screen keyboard and project switching.

## 2026-03-17 — Static Explorer compose modal UX convergence (active)
- [x] Replaced compose filename/project native prompt flow with a single Explorer-owned compose modal (in-app dialog, no browser prompt wizard).
- [x] Added timestamp-based default output naming (`compose-YYYYMMDDHHMMSS.mp4`) so confirm-without-typing uses sane defaults.
- [x] Switched output project capture to a project dropdown seeded from loaded project state with preferred default `P5-Exported-Media` and first-project fallback.
- [x] Kept bulk compose API wiring unchanged (`/api/assets/bulk/compose`) while passing modal-selected/default output settings.
- [x] Added regression checks to assert compose modal markers/default path and absence of `window.prompt` in compose action flow.
- [ ] Validate on physical iPhone Safari that keyboard-safe modal positioning and dropdown interaction feel native to Explorer UX.

## 2026-03-17 — Package Explorer context-menu trigger + style stability pass (active)
- [x] Tightened long-press activation to touch/pen hold only, with stronger delay and explicit move-cancel threshold so ordinary taps do not open the custom menu.
- [x] Added shared pending long-press cleanup for scroll/drag/pointer-leave/context-capture paths to prevent hair-trigger menu opens during grid interaction.
- [x] Kept right-click/contextmenu ownership for desktop while preserving second-tap preview and selection interactions.
- [x] Normalized `.context-menu` typography/layout with explicit font stack, size, line-height, width, text-size-adjust, and hover/focus states for consistent rendering.
- [x] Expanded package regression coverage for long-press gating/cancel behavior and explicit menu style markers.
- [ ] Validate on physical iPhone Safari that short taps never open the menu, long-press always does, and menu typography stays stable across repeated opens.

## 2026-03-17 — Package Explorer anti-selection surface polish (active)
- [x] Scoped a reusable `.custom-ui-surface` anti-native-selection contract across package content, context menu, drawer body, and selection bar.
- [x] Preserved real control usability by explicitly restoring text/select behavior for `input`, `textarea`, `select`, and editable targets inside custom surfaces.
- [x] Hardened preview media anti-ghost behavior by disabling image drag in preview media rendering and surface styles.
- [x] Expanded package regression tests for anti-selection markers plus control-usability guardrails.
- [ ] Validate on physical iPhone Safari that long-press/tap interactions on tiles, badges, and preview labels show no native highlight/callout artifacts while search and dropdown controls remain usable.

## 2026-03-17 — Package Explorer custom interaction surface polish (active)
- [x] Hardened package tile/list interaction surfaces to suppress browser-native context menu fallback and drag ghosting by centralizing preventDefault/stopPropagation handlers on media thumbs.
- [x] Scoped anti-native callout/highlight/user-select protections to asset interaction surfaces (`.asset`, `.row`, overlays, labels) so custom gestures own tile UX without globally disabling accessibility.
- [x] Marked interactive tile surfaces with explicit classes and non-draggable thumbs to reduce iOS long-press callouts and selection artifacts while preserving second-tap preview + selection flows.
- [x] Expanded package regression assertions to lock context suppression helpers, drag suppression wiring, and anti-highlight style markers.
- [ ] Validate on physical iPhone Safari that long-press on tile/thumb surfaces consistently opens custom context menu without native iOS callout/highlight artifacts.

## 2026-03-16 — Package masonry aspect-ratio + context-menu regression fix (active)
- [x] Restored aspect-aware tile presentation in package masonry by feeding runtime orientation updates back into render/layout estimation.
- [x] Kept row-major JS masonry ordering while avoiding square-card fallback and preserving staggered packing.
- [x] Added stronger package context-menu suppression (capture-level + thumb-level) so native browser menu no longer steals asset interactions.
- [x] Expanded package regression assertions for orientation/masonry wiring and context suppression hooks.
- [ ] Validate on physical iPhone Safari that portrait/landscape ratios remain correct and native share/context menus are no longer shown over asset long-press/right-click zones.

## 2026-03-16 — Explorer package masonry row-major ordering fix (active)
- [x] Replaced package CSS multi-column masonry flow with JS-driven masonry column buckets so visual ordering no longer fills top-to-bottom per column.
- [x] Added deterministic `buildMasonryColumns` helper in package state to keep filtered/source list order canonical while assigning tiles by shortest column.
- [x] Updated package grid rendering and styles to use explicit `.masonry-columns` / `.masonry-column` containers and removed `column-fill`-based layout behavior.
- [x] Added regression coverage for masonry helper/wiring and ordering expectations in package Node tests.
- [ ] Validate on physical iPhone Safari that package Explorer now reads left-to-right row progression while preserving masonry stagger and stable interactions.

## 2026-03-16 — Explorer package thumbnail overlay ownership parity fix (active)
- [x] Separated package thumbnail overlay ownership from interaction state by adding delayed loading helpers and a `pendingDataLoadOverlay` gate.
- [x] Scoped loading overlay activation to true dataset fetch paths (`loadMedia` / `loadAllMedia`) so tile taps, selection toggles, context menu open, and drawer open/close remain UI-only updates.
- [x] Preserved thumbnail queue behavior while ensuring interaction-driven rerenders do not force `.content.is-loading` transitions.
- [x] Added package regression assertions covering interaction-path non-ownership and explicit data-load overlay ownership in `docker/packages/Explorer/tests/exports.test.mjs`.
- [ ] Validate on physical iPhone Safari that package explorer interactions no longer flash “Preparing thumbnails…” while data refresh still surfaces loading UI.

## 2026-03-16 — Static Explorer thumbnail overlay ownership + interaction stability (active)
- [x] Split content loading into explicit data-load ownership (`beginContentLoading`/`endContentLoading`) with delayed overlay gating so fast interaction renders do not flash boot/thumbnails overlay.
- [x] Updated `renderMedia` to accept `showLoadingOverlay` + `loadingReason`, defaulting interaction-only renders to no overlay while keeping data-load callers explicit.
- [x] Scoped overlay-enabled calls to true dataset reload paths (project media load, all-media load, mock-mode activation), avoiding selection/context/preview/view toggle interactions.
- [x] Added regression assertions to lock thumbnail overlay ownership away from pointer interaction handlers and toward explicit data loading paths.
- [ ] Validate on physical iPhone Safari that selecting assets, opening context menus, and opening/closing preview no longer triggers the “Preparing thumbnails…” overlay.

# TODO — FX Mode Stabilization Checklist

## 2026-03-16 — Explorer package topbar left-control parity + mobile squish fix (active)
- [x] Removed package-only mobile "Projects" button and made the left brand/title control the single projects-toggle surface (matching static intent).
- [x] Added package brand primary/secondary title swap states tied to sidebar open state for clearer topbar parity with static Explorer.
- [x] Tuned mobile portrait topbar sizing/truncation (`brand` max widths, subline hide, search flex caps, compact controls) to stop control-row squishing.
- [x] Updated package regression assertions for topbar toggle-marker presence and removal of legacy Projects button text.
- [ ] Validate on physical iPhone Safari portrait that topbar controls remain single-row readable while preserving quick project-toggle access.

## 2026-03-16 — Explorer package parity follow-up: second-tap open + topbar/layout alignment (active)
- [x] Added second-tap tile-open gating in package Explorer so first tile tap no longer opens preview accidentally.
- [x] Fixed selected order badge color parity by restoring package `--asset-accent` token usage for selector numbering.
- [x] Reworked package topbar/content framing toward static parity (two-row topbar with media meta subrow and reduced grid boxing padding).
- [x] Updated package regression assertions for second-tap open flow and topbar/layout parity markers.
- [ ] Validate on physical iPhone Safari that second tap/long-press interactions match static Explorer and that topbar/grid spacing remains comfortable in portrait.

## 2026-03-16 — Explorer package asset interaction/context parity slice (active)
- [x] Ported static tile pointer semantics so package tile taps open/close preview predictably and selection is limited to explicit selector targets.
- [x] Added no-preview hit-zone guards for selector chrome to prevent accidental preview/context behavior when toggling selection.
- [x] Added ordered selection state in package explorer and surfaced numbered selection badges matching static ordering semantics.
- [x] Updated package styles for static-like selected glow + custom selector shell visuals.
- [x] Updated package context-menu wiring to suppress browser defaults on tile surfaces and open custom menu with ordered selection context.
- [x] Expanded package tests for selection-order helpers and static-parity interaction/style/context assertions.
- [ ] Validate on physical iPhone Safari that second-tap preview/open behavior and long-press context menu feel identical to `public/explorer.html`.

## 2026-03-16 — Drawer regression hotfix: tap-toggle + close cleanup + mobile edge fallback (active)
- [x] Restored media-surface tap/click toggle behavior for preview playback while guarding overlay control taps from accidental background toggles.
- [x] Added drawer preview cleanup hooks so close/unmount/asset-switch always pause/reset active media and stop preview listeners/loops.
- [x] Preserved prev/next autoplay while keeping manual play/pause controls functional after navigation.
- [x] Added mobile-safe atmospheric edge fallback tuning so preview falloff remains visible on iPhone Safari without heavy effects.
- [x] Updated package/static regression assertions for tap-toggle hooks, cleanup helpers, and edge fallback markers.
- [ ] Validate on physical iPhone Safari that close always silences media immediately and edge falloff remains visible under low-brightness conditions.

## 2026-03-16 — Drawer media-stage sizing + atmospheric edge pass (active)
- [x] Expanded package drawer width and tightened drawer-body spacing so the preview stage can use more of the drawer footprint.
- [x] Removed package preview shell/media hard `70vh` caps and moved to flex-growth sizing so media can fill available drawer space.
- [x] Added a subtle non-interactive atmospheric edge layer on `.preview-shell::after` to reduce boxed-card feel without shrinking media real estate.
- [x] Preserved overlay/media/wave z-index + pointer-event behavior so controls remain tappable above media.
- [x] Added package regression assertions for widened drawer sizing, atmospheric edge selector presence, and removed height-cap guardrail.
- [ ] Validate on physical iPhone Safari that larger media stage + edge treatment remain responsive across video, image, and audio preview kinds.

## 2026-03-16 — Wrapperless preview + nav playback polish (active)
- [x] Removed remaining drawer inner preview-header shell so overlay preview is the direct drawer surface in static/package explorers.
- [x] Removed center default-play bubble to prevent paused-state control obstruction.
- [x] Added prev/next autoplay-or-first-frame fallback to reduce black-screen asset transitions.
- [x] Updated preview regression assertions for removed center-play marker and wrapperless drawer preview contract.
- [ ] Validate on physical iPhone Safari that prev/next no longer lands on black frames for common clip formats.

## 2026-03-16 — Overlay hit-layer + wrapper removal pass (active)
- [x] Fixed overlay hit testing in static/package preview by promoting overlay to interactive pointer layer.
- [x] Disabled pointer hit interception when overlay fades so hidden controls do not block media taps.
- [x] Removed legacy inner `.preview` wrapper framing so the immersive preview shell is now the direct drawer preview surface.
- [x] Increased top-nav tap target sizes for iPhone Safari comfort.
- [x] Re-ran package build/typecheck and preview regression suites after DOM/CSS simplification.
- [ ] Verify on physical iPhone Safari that overlay controls are now consistently tappable during playback.

## 2026-03-16 — Package build/type regression fix (active)
- [x] Fixed package `next build` type failure in focused resolve flow by aligning source argument to `string | undefined`.
- [x] Narrowed focused resolve `media_rel_paths` to strict `string[]` with an explicit type predicate.
- [x] Verified `npm run build` completes for `docker/packages/Explorer` after the fix.
- [x] Re-ran package + static regression suites to catch additional type/runtime drift.
- [ ] Keep watching for additional strict-mode type issues as preview convergence continues.

## 2026-03-16 — Package overlay action + OBS parity pass (active)
- [x] Added package preview overlay semantic action callbacks for OBS, tag, resolve, and program-monitor handoff while keeping ExplorerApp as logic owner.
- [x] Added in-overlay OBS settings controls (mode cover/fit/fill, slot, exclusive) and wired values through package preview state/action flow.
- [x] Kept drawer-contained preview contract with no reintroduced legacy lower control rows.
- [x] Added package regression assertions for overlay callback wiring and OBS control presence/state mapping.
- [x] Added mobile comfort tweaks for overlay control target sizing and details height constraints in package styles.
- [ ] Validate on physical iPhone Safari for overlay reveal/hide comfort and accidental-tap resilience after the new package overlay action rows.
- [ ] Intake `asset-preview.mjs` branch delta once `me/explorer-shaders-and-compose-api-upgrades` refs are available locally (currently unavailable in this workspace).

## 2026-03-16 — Drawer preview ownership transfer takeover (active)
- [x] Mapped old drawer controls to overlay replacements and migrated behavior ownership to overlay actions.
- [x] Removed duplicated legacy drawer button row / metadata table from both static and package explorers after behavior transfer.
- [x] Wired overlay prev/next to explorer ordering state (package `filteredMedia`, static `filteredMedia()`) so adjacent navigation loads real previous/next assets.
- [x] Moved preview metadata/details into overlay detail panels so media occupies most of the drawer preview height.
- [x] Added overlay skip ±10s controls and kept scrub/time/volume/play/pause behavior fully functional in overlay transport.
- [ ] Follow up by porting OBS/tag/resolve/program-monitor overlay buttons into the Next.js package preview surface for full static/package action parity.
- [ ] Validate on iPhone Safari that overlay details reveal/hide interaction remains comfortable during playback + scroll.


## 2026-03-16 — Drawer inner preview renderer convergence (active)
- [x] Implemented phase-2 preview convergence in static drawer: top overlay/nav controls, center play affordance, integrated bottom-stack playback controls (time/scrub/volume), and in-preview action pills wired to existing drawer actions.
- [x] Implemented phase-2 preview convergence in package drawer: `AssetPreviewPanel` now includes center-play, top nav controls, integrated playback controls, and in-preview action pill row while keeping Explorer business logic callbacks in `ExplorerApp`.
- [x] Added next-slice regression assertions for richer preview control classes/markers in static and package tests.
- [ ] Follow up by folding OBS fit/slot/exclusive controls into the package in-preview bottom stack with the same adapter/event contract used for drawer actions.
- [x] Fixed package runtime ordering bug by moving `normalizedPreviewAsset` memo below `resolveAssetUrl` callback declaration in `ExplorerApp` to avoid temporal-dead-zone render crashes.
- [x] Added package regression assertion to enforce callback-before-memo declaration ordering for the preview adapter wiring.
- [x] Upgraded static Explorer drawer preview (`public/explorer.html`) to a media-first inner renderer with overlay header/meta chips, playback fade behavior, and audio waveform canvas while preserving existing drawer shell/actions/metadata sections.
- [x] Added preview normalization helpers in package Explorer (`docker/packages/Explorer/src/previewAdapter.ts`) to keep preview data contract explicit (id/name/path/kind/src/duration/quick/obs/raw).
- [x] Added `AssetPreviewPanel` component in package Explorer (`docker/packages/Explorer/src/AssetPreviewPanel.tsx`) and integrated it into `ExplorerApp` drawer without changing right-side drawer semantics.
- [x] Updated package/static styles to support immersive preview shell classes (`preview-shell`, `preview-overlay`, `preview-wave`) while retaining existing inspector details and action rows.
- [x] Added regression assertions in `tests/test_public_explorer_program_monitor.py` and `docker/packages/Explorer/tests/exports.test.mjs` for preview adapter wiring and drawer contract preservation.
- [ ] Follow up by pulling the full `asset-preview.mjs` branch delta once branch refs are available locally so sticker-layer/edit-mode controls can be adapted into the same drawer contract.
- [ ] Follow up with richer OBS settings parity in package drawer (cover/fit/fill + slot/exclusive controls) mapped through the normalized preview action contract.


## 2026-03-16 — API CORS support for Explorer split-origin UI (active)
- [x] Added FastAPI CORS middleware in `app/main.py` so `/api/*` routes can be called from the Explorer UI on `:8790` while the API runs on `:8787`.
- [x] Added LAN defaults for Explorer origins (`192.168.0.25:8790`, `localhost:8790`, `127.0.0.1:8790`) and merged them with `MEDIA_SYNC_CORS_ORIGINS` when configured.
- [x] Preserved wildcard config support (`MEDIA_SYNC_CORS_ORIGINS=*`) with credential-safe behavior (no `allow-credentials` on wildcard).
- [x] Added regression tests in `tests/test_cors.py` for default Explorer-origin CORS headers and wildcard preflight behavior.
- [x] Updated `README.md` troubleshooting with cross-origin Explorer CORS guidance.
- [ ] Validate on physical iPhone Safari that Explorer package on `:8790` can fetch `/api/sources` from `:8787` without `TypeError: Load failed`.

## 2026-03-16 — Explorer API base fallback for split-origin deploys (active)
- [x] Confirmed package Explorer boot failures were caused by same-origin API resolution when served from non-API ports (for example `:8790`), while static explorer on `:8787` remained healthy.
- [x] Updated package API-base inference to auto-target `http://<current-host>:8787` when no explicit base URL is configured and the browser origin is not already `:8787`.
- [x] Updated package regression assertions to lock in the non-`8787` fallback guard.
- [x] Documented the split-origin fallback behavior in `docker/packages/Explorer/README.md` so container/standalone usage is copy-paste clear.
- [ ] Validate on physical iPhone Safari that the Next.js Explorer running from the Explorer container now lists sources/projects/media without manual `NEXT_PUBLIC_MEDIA_SYNC_API_BASE` overrides.

## 2026-03-16 — Explorer selection identity + compose guardrails (active)
- [x] Reworked Explorer package selection bookkeeping to use composite keys (`source::project::relative_path`) so all-project selections keep source/project identity for bulk delete/move/tag/compose actions.
- [x] Updated context menu, drag-move, drawer actions, and selected-only filtering to resolve selected assets by identity keys rather than path-only lookup maps.
- [x] Added compose guardrails to only submit video assets to `/api/assets/bulk/compose`, with a user warning when no video clips are selected.
- [x] Extended package regression assertions in `docker/packages/Explorer/tests/exports.test.mjs` for identity-key selection flow markers and compose video-only checks.
- [ ] Follow up by adding runtime unit/integration coverage for duplicate `relative_path` collisions across different projects/sources to enforce identity-safe selection behavior.

## 2026-03-16 — Thumbnail URL alias parity (active)
- [x] Added `thumbnail_url` alias alongside `thumb_url` in `GET /api/projects/{project}/media` responses for thumbable media entries.
- [x] Added API regression assertions in `tests/test_media_api.py` to keep `thumbnail_url` and `thumb_url` synchronized.
- [ ] Follow up by switching package thumbnail rendering to prefer `thumbnail_url` first once branch intake for advanced preview modules lands.

## 2026-03-16 — Explorer bulk action parity completion (active)
- [x] Added package API client support for bulk explorer actions (`/api/assets/bulk/delete|move|tags|compose`) with normalized error handling.
- [x] Updated Next.js Explorer selection/drawer flows to resolve stable asset refs and execute bulk delete/move/tag/compose operations through the shared bulk APIs.
- [x] Expanded selection-bar controls with tag + compose actions and removed project-scope-only guardrails for delete/select in all-project media mode.
- [x] Added package regression assertions for bulk API endpoint wiring and action handlers in `docker/packages/Explorer/tests/exports.test.mjs`.
- [ ] Follow up with richer non-prompt tag/compose UI panels matching the advanced static preview design language once branch delta intake lands.


## 2026-03-15 — Public → Explorer parity implementation plan (active)
- [x] Audited current `/public` explorer assets (`public/explorer.html`, `public/index.html`, `public/js/*`) against `/docker/packages/Explorer` structure to define copy boundaries for HTML/CSS/JS parity.
- [x] Drafted a phased migration sequence that keeps the Next.js Explorer shippable between commits: baseline capture, shared primitive extraction, component parity passes, and final regression sweep.
- [x] Defined idempotent task stubs grouped by dependency order so CSS/token work lands before behavior ports and avoids cross-stub collisions.
- [ ] Capture a DOM/API parity matrix (static explorer vs Next.js Explorer) covering topbar, drawers, action menus, media cards, inspector, and upload/OBS/program-monitor flows.
- [ ] Port static style tokens/layout primitives into `docker/packages/Explorer/src/styles.css` with one-way mapping notes from `public/explorer.html` CSS blocks.
- [ ] Port remaining static interaction helpers into typed Explorer modules (`api/state/components`) while preserving existing endpoint contracts.
- [ ] Add/extend package tests for copied behaviors (sorting/filtering/copy/upload/tag/move/delete/program-monitor/OBS guardrails) and keep static regression assertions passing.
- [ ] Run final visual parity QA (desktop + iPhone Safari) and document any intentional deltas before closing the parity epic.


## 2026-03-15 — Delete identity collision guard (active)
- [x] Reworked explorer delete resolver matching to use stable asset identity keys (`asset_uuid`/`asset_id` fallback, then `source+project+relative_path`) instead of `relative_path` alone.
- [x] Updated delete entrypoints (context menu, selected-bar, drawer) to pass asset objects where possible so all-project deletes cannot cross-match by path collisions.
- [x] Preserved legacy string-path support with focused/active-project narrowing while preventing broad path-only expansion in all-project scope.
- [x] Added regression assertions in `tests/test_public_explorer_program_monitor.py` to block reintroduction of `wanted.has(ref.relative_path)` logic.
- [ ] Add runtime test coverage that simulates same-relative-path assets across two projects and verifies only the intended asset ref is submitted.

## 2026-03-15 — Explorer custom delete modal styling pass (active)
- [x] Replaced native `window.confirm` delete prompt with a non-blocking in-app modal that matches Explorer theme and preserves async flow.
- [x] Added modal accessibility hooks (`role="dialog"`, `aria-modal`, labelled/described content) and close affordances (Cancel, backdrop tap, Escape key).
- [x] Kept delete scope reconciliation fix intact (`reloadMediaForCurrentScope`) while switching delete flow to await modal confirmation.
- [x] Updated regression assertions in `tests/test_public_explorer_program_monitor.py` for modal wiring + async confirmation branch.
- [ ] Validate iPhone Safari tap ergonomics/spacing for the custom modal against inspector drawer context.

## 2026-03-15 — Explorer delete confirm + post-delete scope reconciliation (active)
- [x] Added an explicit delete confirmation prompt before bulk/inspector delete requests are sent.
- [x] Fixed delete target resolution to honor drawer-focused assets as well as selected assets so single-item drawer deletes always resolve API refs.
- [x] Added scope-aware post-delete reload (`project` vs `all projects`) to prevent the fake-empty/no-project state after successful deletes.
- [x] Added regression assertions in `tests/test_public_explorer_program_monitor.py` for confirm + reload hooks.
- [ ] Validate on iPhone Safari that deleting from drawer keeps current source/project scope hydrated without manual refresh.

## 2026-03-08 — FX bootstrap ready-timeout escape hatch (active)
- [x] Addressed bootstrap stall risk where `bootstrap_ready` previously required `bootstrapReady === bootstrapTotal`, allowing one never-ready visible tile to block steady-state entry.
- [x] Added bounded timeout gate (`tilefxBootstrapReadyMs`, default 1200ms) so FX bootstrap advances to commit/steady even when a subset of visible tiles never become ready.
- [x] Preserved existing full-ready fast path and batch-commit behavior for ready tiles; timeout path only prevents indefinite entering-phase lock.
- [x] Added debug counters/telemetry for timeout occurrences (`bootstrapReadyTimedOut`, elapsed/pending fields) and regression assertions in tests.
- [ ] Validate on iPhone that one permanently-failed visible thumbnail no longer blocks FX takeover for neighboring visible cards.

## 2026-03-08 — Editor preview mock fallback without query flag (active)
- [x] Reproduced the remaining gap: top-level local editor preview can fail API boot without `?mock=1`, but previous preview heuristic only treated embedded/opener contexts as preview fallback eligible.
- [x] Broadened `isLikelyPreviewEnvironment()` to treat localhost/loopback/local test hosts as preview contexts for API-failure fallback routing.
- [x] Kept deployed behavior safe: fallback still occurs only after API boot failure and only for local-preview host heuristics, not arbitrary remote `http/https` hosts.
- [x] Added regression assertion in `tests/test_public_explorer_program_monitor.py` for localhost-based preview detection.
- [ ] Validate from text-editor preview “no localStorage.json” path that explorer auto-renders mock assets without needing manual `?mock=1`.

## 2026-03-08 — Explorer mock boot bypass for preview/webview (active)
- [x] Identified root cause: explorer boot still executed API-first `refreshExplorerData()` before mock activation, so preview hosts surfaced sources/projects failure toasts and never entered mock render flow.
- [x] Moved mock decision to early boot gate: explicit mock/file/webview protocol now routes directly into mock state hydration before API source/project fetch calls.
- [x] Added preview fallback routing for local embedded/webview contexts (`window.opener` / iframe on local host) to bypass API boot failures and hydrate mock data.
- [x] Kept deployed safety: non-preview real `http/https` boot path still uses API and does not silently fall back unless preview heuristics match.
- [x] Added regression assertions in `tests/test_public_explorer_program_monitor.py` for early mock boot short-circuit and preview detection helpers.
- [ ] Validate on iOS editor preview that boot failure cards no longer appear and mock assets render immediately.

## 2026-03-08 — Proof snapshot stale-capture reconciliation (active)
- [x] Accepted runtime confirmation that core FX pipeline is live (feed/upload/cache/swap no longer primary blocker).
- [x] Narrowed remaining contradiction to proof export timing: stale non-settled captures could be exported while runtime was already settled in FX.
- [x] Added a minimal `exportTileFxProofSummary()` refresh guard to recapture proof when current runtime is FX+enabled+raf-running but captured proof shows non-running/zero-visible state.
- [x] Kept scope strictly to truth-surface timing; no pipeline/lifecycle/UI architecture changes.
- [ ] Re-check on device that contradictory `view:"fx"` + `enabled:false` proof objects no longer appear once runtime is settled.

## 2026-03-08 — Feed-stage promotion/pipeline reactivation (active)
- [x] Traced the zero-upload idle state to a render-stage feed gate: `_render(...)` used non-null-safe `this.textureCache.has/get` access before cache bootstrap was guaranteed, allowing loop failure and starving feed/upload progression.
- [x] Made render feed checks null-safe (`this.textureCache?.has?.(key)`, `this.textureCache?.get?.(key, now)`) so fed tiles continue to queue/upload even if cache bootstrap is one tick behind.
- [x] Kept scope narrow to collect→feed→upload pipeline continuity; no lifecycle/logging/card-UI rewrites in this pass.
- [x] Added regression assertions for null-safe texture-cache access in render pipeline.
- [ ] Re-check on device/runtime probe that counters move off zero (`uploadsQueued/uploadsAttempted/texturesPending/cache/swapOps`) and tiles progress pending→upload→cache→swap.

## 2026-03-08 — Visible thumb-body ownership policy finalization (active)
- [x] Isolated remaining mixed visual state to thumb-body paint policy: visible/near-visible cards could still present DOM thumb body whenever `data-tex` briefly remained non-`1`/non-`pending`.
- [x] Enforced FX-window painter policy in CSS: any card flagged `data-fx-near-visible="1"` and not `data-tex="1"` now uses placeholder suppression for `.thumb-body`/thumb image painters.
- [x] Preserved DOM ownership for `.asset-ui` metadata, badges, selectors, and affordances; no overlay/UI architecture rewrites were introduced.
- [x] Added a regression assertion in tests for the near-visible non-textured placeholder selector.
- [ ] Re-check on physical iPhone that visible FX window no longer shows normal DOM thumb bodies behind FX/placeholder cards during short scroll-stop cycles.

## 2026-03-08 — Pending→texture stall in visible window (active)
- [x] Traced stall gate to renderer callback ordering: `tile.onTextureReady(...)` only ran after `rectValid` + `visible` draw culls, so some cards remained `data-tex="pending"` when texture became available but draw eligibility lagged.
- [x] Moved texture readiness callback invocation to run immediately after cache lookup for every fed tile (before visible-only culls), while preserving draw culls and swap eligibility rules.
- [x] Kept scope tight to readiness pipeline sequencing (no lifecycle/logging/DOM architecture changes).
- [x] Added regression test asserting `onTextureReady(Boolean(entry?.texture))` executes before `if (!rectValid) return;` and `if (!visible) return;`.
- [ ] Re-check on physical iPhone scroll-stop run that previously stalled placeholder cards now resolve from `pending` to `1` in the visible/near-visible FX window.

## 2026-03-08 — Non-FX disable logging policy cleanup (active)
- [x] Confirmed `sync:setView:non-fx` is a legitimate lifecycle transition path from `setView(...)` and startup bootstrap.
- [x] Changed `TileFXRenderer.disable(...)` so legal non-FX disables no longer emit warning/error stack spam; illegal disable-in-FX remains error-level.
- [x] Kept lifecycle behavior scoped: no ownership pipeline or watchdog architecture changes in this patch.
- [x] Reduced startup duplicate non-FX disable calls by avoiding redundant `setView('grid')` when already in grid mode after initial data refresh.
- [x] Updated tests to assert legal-disable logging uses debug-level path and legacy warn path is absent.
- [ ] Re-check on physical iPhone that grid/list transitions no longer show `[tilefx] DISABLE sync:setView:non-fx` warning stack noise.

## 2026-03-08 — Near-visible tracking before visible cull (active)
- [x] Moved near-visible set membership so edge tiles are tracked before the visible-only render-candidate cull.
- [x] Kept `visibleTileEls` restricted to actually visible tiles.
- [x] Preserved non-visible render candidate early return behavior.
- [x] Added a regression test that asserts near-visible registration occurs before `if (!visible) return;`.
- [ ] Re-run physical iPhone short scroll-stop cycle to confirm edge tiles remain under near-visible swap-hold hysteresis after leaving viewport.

## 2026-03-07 — Full visible-window FX coherence (active)
- [x] Identified remaining mixed-window cause: visible cards could stay plain grid-style before first collect pass because placeholder ownership was applied incrementally from collector timing.
- [x] Added immediate visible-window pending stamp on FX entry (`markVisibleFxWindowPending('setView:fx')`) so currently visible cards become `pending` or `1`, not `0`.
- [x] Removed `window.__tilefx_enabled` dependency from visible pending assignment in collector so FX-view visible cards do not wait for enable-flag timing to enter placeholder state.
- [x] Verified early FX window now starts fully coherent in-container (`visibleCount:20`, `pending:20`, `zero:0` immediately after entry).
- [ ] Re-check same behavior on physical iPhone Safari and confirm no lower-window plain-grid patch remains.

## 2026-03-07 — Visible FX placeholder ownership policy (active)
- [x] Identified visible DOM-thumb fallback path: cards were defaulting to `data-tex="0"` for non-ready states in `collectTileFxTiles()` / `onTextureReady(...)`, allowing full DOM thumb body paint in FX view.
- [x] Enforced visible/near-visible FX fallback policy: non-ready cards now stay in `data-tex="pending"` (FX placeholder) instead of full DOM thumb body.
- [x] Added explicit FX placeholder visual treatment for `data-tex="pending"` and hid `.thumb-body` paint nodes for that state.
- [x] Added warm re-entry retention: cards in overscan keep placeholder ownership (`pending`) and only drop to `0` when fully culled out of overscan.
- [ ] Re-check on physical iPhone Safari that this removes the “normal asset behind FX asset” appearance after settle + short scroll-stop.

## 2026-03-07 — Verdict/domSwap truth reconciliation (active)
- [x] Treated `health: dual_owner` under otherwise healthy visible FX ownership as a verdict-layer mismatch, not a pipeline failure.
- [x] Updated health verdict logic to prefer current visible ownership truth (`visibleSwapped/visibleDomOnly/visibleMissingTextures`) and avoid stale dual-owner verdicts after settle.
- [x] Tightened visible painter leak detection to count actual thumbnail paint contributors only (hidden/non-painting wrappers no longer counted).
- [x] Cleared stale leak counters when no swapped tiles are present so old leak state does not poison health verdicts.
- [ ] Re-check on physical iPhone Safari that HUD health now aligns with `window.logVisibleTileOwnership(12)` and `window.exportTileFxProofSummary?.()` after scroll-stop.

## 2026-03-07 — Physical iPhone parity handoff (active)
- [x] Confirmed parity run should use existing tools only (`window.logVisibleTileOwnership(12)`, `window.exportTileFxProofSummary?.()`).
- [x] Kept container-side work closed (no new HUD/proof/toast/watchdog systems added in this handoff step).
- [ ] Run on physical iPhone Safari in FX view after settle:
  - `window.logVisibleTileOwnership(12)`
  - `window.exportTileFxProofSummary?.()`
- [ ] Run short scroll-stop cycle on iPhone (down/stop, up/stop), then repeat the same two commands.
- [ ] Capture one concrete remaining issue (if any) and patch only that single issue next.

## 2026-03-07 — Post-proof stabilization focus (active)
- [x] Keep renderer behavior stable for seeded single-card and multi-visible viewport checks without adding new instrumentation surfaces.
- [x] Remove clearly redundant compensating code from now-stable upload/pending paths (no behavior widening).
- [ ] Validate parity on physical iPhone Safari with existing truth tools only (`window.logVisibleTileOwnership(12)` + compact proof-summary line).
- [ ] Resolve one final concrete on-device visual issue if parity still diverges after settle.

- [ ] Consolidate legacy repeated proof-capture TODOs into this single parity section as older items are completed.

## 2026-03-07 — Multi-visible FX stability pass (active)
- [x] Validated a multi-visible viewport where multiple rows reach `hasTexture:true`, `wasDrawnThisPass:true`, and `owner:"FX"` after settle.
- [x] Tightened FX entry coherence by requiring full bootstrap-visible readiness before `bootstrap_commit` (removed partial 90% fallback commit behavior).
- [x] Ran short scroll-stop cycle checks (down/stop, up/stop) and confirmed no persistent visible `dual_owner` rows after settle.
- [x] Kept single-card drain/texture maturity intact while stabilizing multi-visible behavior.
- [ ] Re-run the same multi-visible + scroll-stop checks on physical iPhone Safari for parity evidence.

## 2026-03-07 — Drain-stage truth + in-flight settlement (active)
- [x] Focused only on the next failing stage (`drain`) for seeded key `ingest/originals/img0.jpg` after resolve/queue were already proven.
- [x] Added deterministic pending settlement when FX drain is unavailable (`WEBGL_UNAVAILABLE` / renderer failed) so keys do not hang forever in pending/in-flight.
- [x] Added per-key drain trace truth (`drainEvaluated`, `drainAttempted`, `failureReason`) and surfaced it through existing visible ownership rows + upload live-state path.
- [x] Re-ran seeded 1-card runtime check and confirmed progression to texture/draw/owner (`inTextureCache:true`, `wasDrawnThisPass:true`, `owner:"FX"`).
- [ ] Re-check the same seeded drain path on physical iPhone Safari and collect one console sample for parity.

## 2026-03-07 — Queue truth reflection for seeded key (active)
- [x] Verified seeded key live state directly (`inPendingUploads`, `inUploadInFlight`, `inTextureCache`) instead of inferring queue from breadcrumbs only.
- [x] Fixed null texture-cache guard in `_queueTileImageUpload(...)` so queue insertion is possible before cache init.
- [x] Reflected queued truth in visible ownership rows (`queued` from `_pendingUploads.has(key)`).
- [x] Confirmed seeded key now reports `queued:true` and `inPendingUploads:true` in runtime trace.
- [ ] Continue from next stage (`drain`) on WebGL-capable runtime to validate texture/draw/owner progression.

## 2026-03-07 — Queue-stage fix for single visible seeded tile (active)
- [x] Bound diagnostics to the real visible DOM card and runtime key (`ingest/originals/img0.jpg`) instead of null placeholders.
- [x] Fixed queue-stage path so visible texture-missing tiles are queued from `updateTiles(...)` collector flow.
- [x] Triggered upload drain from collector updates after queueing to reduce render-loop-only dependency for visible pending work.
- [ ] Re-validate on non-headless/runtime-WebGL-capable target that queue now flips true and progresses to texture/draw/owner stages.
- [ ] If queue is true but ownership remains DOM, continue with next failing stage (`drain` → `texture` → `draw` → `owner`) using the same seeded key.

## 2026-03-07 — Single visible card FX maturity (active)
- [x] Identified single-card stall stage after lifecycle fix: visible image prep could wait on DOM image readiness and never reach URL preload in time for seeded 1-card runs.
- [x] Made single-card `img` prep deterministic: use DOM image immediately when ready, otherwise preload by URL first and only then fall back to DOM image prep.
- [x] Kept visible-first upload drain priority for pending keys so the one visible tile is serviced before non-visible warm work.
- [ ] Validate seeded 1-card run reaches `hasTexture:true`, `wasDrawnThisPass:true`, `owner:"FX"` in `window.logVisibleTileOwnership(12)`.
- [ ] Validate proof summary line shows `visibleReady>0`, `visibleSwapped>0`, and `visibleMissingTextures` falling after settle.

## 2026-03-07 — Multi-card/device follow-up (deferred)
- [ ] After single-card maturity is stable, run multi-card + iPhone parity checks.

## 2026-03-07 — Visible ownership truth-path repair (new)
- [x] Treated FX-active empty ownership rows with visible DOM cards as an ownership-truth bug in `window.logVisibleTileOwnership(limit)`.
- [x] Updated ownership logging to include visible DOM card count and explicit truth-bug flag in returned summary (`visibleDomCards`, `ownershipTruthBug`).
- [x] Updated `TileFXRenderer.getVisibleOwnershipRows(limit)` to source rows from current visible DOM card set first via `_collectVisibleDomOwnershipRows(...)`.
- [x] Added per-frame draw-truth carryover (`_lastDrawByTileEl`) so ownership rows can report current `wasDrawnThisPass`/`rectValid`/`hasTexture` truth.
- [x] Expanded ownership row payload to include `fed`, `rectValid`, and `swapState` for compact visible truth inspection.
- [ ] Validate on physical iPhone: run `window.__explorer_view`, `window.logVisibleTileOwnership(12)`, `window.exportTileFxProofSummary?.()` and confirm non-empty visible rows when cards are onscreen.
- [ ] Capture one iPhone sample output for `window.logVisibleTileOwnership(12)` showing non-empty rows matching onscreen cards.

## 2026-03-07 — Steady-state visible ownership discipline (new)
- [x] Added steady visible-lock ownership rule in `syncVisibleTileOwnership(...)` to keep visible draw-valid tiles FX-owned (`steady:visible-lock`).
- [x] Added next-pass steady mismatch correction for visible tiles that are FX-swapped but lose draw-truth (`steady:draw-truth-lost`).
- [x] Preserved visible-first sync ordering (visible ownership decisions before untracked cleanup pass).
- [x] Tightened near-visible release to stronger hold windows in `_restoreUntrackedSwaps(...)` while keeping visible release blocked.
- [x] Reduced steady feed/promotion churn in `collectTileFxTiles()` (conservative overscan/maxFed/maxPromoted for steady mode, especially coarse-pointer/mobile).
- [ ] Validate on physical iPhone Safari: enter FX → settle → scroll one screen → stop, then confirm no visible DOM↔FX flip-flop after settle.
- [ ] Capture one short `window.logVisibleTileOwnership(12)` sample after the scroll-stop check and attach in PR notes.

## 2026-03-07 — Strict visible-batch FX entry completion (new)
- [x] Replaced single bootstrap stage with explicit TileFX entry phases: `bootstrap_collect`, `bootstrap_ready`, `bootstrap_commit`, `steady`.
- [x] Tightened bootstrap-ready threshold to require 100% of captured visible bootstrap tiles to be draw-ready before commit.
- [x] Added bootstrap visible-set stabilization so visible tiles remain DOM-owned until batch commit (no per-tile stagger during entry).
- [x] Added grouped batch commit path (`bootstrap:batch-commit`) for visible tiles so ownership switch occurs coherently.
- [x] Blocked offscreen promotions while entry phase is non-steady in `collectTileFxTiles()` (`maxPromoted = 0`, visible-only feed behavior).
- [x] Prevented bootstrap-visible swap cleanup release by protecting bootstrap-set tiles in `_restoreUntrackedSwaps(...)` until steady.
- [ ] Validate on physical iPhone Safari that entering FX no longer presents mixed visible DOM/FX ownership after settle.
- [ ] Capture one iPhone console sample (`window.logVisibleTileOwnership(12)`) showing coherent ownership after bootstrap commit.

## 2026-03-06 — Physical-proof verdict pass + lifecycle lock completion (new)
- [x] Added `window.logTileFxProofSummary(reason)` to capture + export + log proof summaries without mutating TileFX lifecycle/swap state.
- [x] Extended proof export with explicit verdict fields (`proofPass`, `health`) and lifecycle artifact state (`deadOverlayHidden`, `deadOverlayReason`).
- [x] Tightened visible-set health diagnostics with `visibleReadyButNotSwapped`, `visibleSwappedButNoTexture`, and visible-only rect mismatch aggregates (`rectMismatchVisibleCount`, `rectMismatchMaxPx`, `rectMismatchAvgPx`).
- [x] Expanded lockstep rows to include per-axis rect deltas (`fxVsDomX/Y`, `overlayVsDomX/Y`) while keeping mismatch thresholding visible-only.
- [x] Kept hard disable guard + telemetry (`illegalDisableBlocked`, `lastIllegalDisable`) and confirmed no new non-view lifecycle mutators were introduced.
- [ ] Run physical iPhone Safari proof capture with aggressive scroll/chrome collapse and attach exported `proofPass: true` snapshots.

## 2026-03-06 — Lifecycle invariant guard + proof summary export (new)
- [x] Added hard TileFX disable guard in renderer (`disable(reason, {allowInFxView})`) that blocks illegal disable attempts while `window.__explorer_view === 'fx'` and logs stack traces.
- [x] Added proof export helper `window.exportTileFxProofSummary()` with compact JSON-safe lifecycle/visible-set/cache/viewport fields for physical iPhone capture workflows.
- [x] Added `computeTileFxHealthVerdict()` and surfaced health state in compact + expanded HUD rows.
- [x] Added debug `Capture Proof` button in `fxdebug=1&tilefxProof=1` mode to run `captureTileFxProof(...)` and export summary in one action.
- [x] Added defensive dead-overlay handling: first liveness failure in FX view hides the TileFX canvas to avoid stale glow overlays while renderer is down.
- [x] Added renderer telemetry for blocked illegal disables (`illegalDisableBlocked`, `lastIllegalDisable`) for root-cause tracing.
- [ ] Run physical iPhone Safari validation and attach exported proof summary payloads for aggressive scroll/chrome-collapse sessions.

## 2026-03-06 — Final stabilization proof + visible-set pass (new)
- [x] Added proof capture mode (`?tilefxProof=1`) with `window.captureTileFxProof(reason)` writing `window.__tilefx_proof` (liveness counters, viewport metrics, top visible tile rows/rects).
- [x] Added hard FX liveness assertions without auto-recovery; first failure is stored in `window.__tilefx_dbg.firstLivenessFailure` and logged once.
- [x] Added lockstep rect probe (`computeTileFxRectLockstep`) capturing >2px mismatches into `window.__tilefx_dbg.rectMismatchRows` with HUD `rectMismatch` reporting.
- [x] Completed single-owner swap diagnostics with per-card `visiblePainterLeakCount`, debug leak rows, and one-time leak warnings (toasts only when `tilefxPainterToast=1`).
- [x] Tightened swap release churn rules with idle gating (`_swapReleaseIdleMs`) and debug counters (`swapReleaseBlocked` / `swapReleaseAllowed`).
- [x] Made fed-set behavior deterministic (visible-first, bounded overscan promotion while scrolling, `visiblePromotedThisPass` telemetry).
- [x] Added visible-only health fields (`visibleReady`, `visibleUploading`, `visibleDomOnly`, `visibleSwapped`) to prioritize runtime truth for on-screen tiles.
- [x] Added compact-by-default HUD mode (non-`fxdebug`) to reduce visual obstruction while keeping expanded diagnostics available in debug sessions.
- [x] Gated swap-sanity visual outlines behind `fxdebug` so production FX mode avoids temporary debug overlays.
- [ ] Capture physical iPhone Safari proof logs/screens using `?tilefxProof=1` and attach `window.__tilefx_proof` snapshots from aggressive scroll runs.

## 2026-03-06 — Runtime ownership reset (new)
- [x] Removed TileFX watchdog auto-recovery + recovery toast paths (`heartbeat` + `visualViewport`) so viewport churn no longer re-arms FX runtime.
- [x] Locked TileFX lifecycle to `setView(...)` transitions only (`fx` enables/starts, non-FX disables/stops/clears/restores swaps/hides canvas).
- [x] Added `restoreAllDomSwaps(...)` support and wired non-FX exit + guarded destroy path to restore DOM thumbnail surfaces deterministically.
- [x] Added explicit layer-contract diagnostics (`logTileFxLayerContract`) and normalized z-index tokens so HUD/probe/toasts stay above TileFX canvas.
- [x] Updated HUD alert semantics to focus on lifecycle invariants instead of stale fail-state carryover from prior mode.
- [ ] Capture iPhone proof run showing no repeated `FX runtime recovered` toasts and no watchdog recovery spam during rapid scroll + Safari chrome collapse/expand.
- [ ] Capture iPhone proof run confirming FX tiles and DOM metadata move in lockstep with no dual-owner thumbnail flicker.
- [ ] Evaluate whether to drop temporary `fx-swap-sanity` class pulse once no-swap-flicker proof is validated on device.

## Prior checklist (retained)
- [x] Enforce authoritative per-tile FX swap states (`DOM_VISIBLE` / `FX_SWAPPED` / `RESTORING`) in `TileFXRenderer` using WeakMap state, with transition reasons logged in FX debug mode.
- [x] Keep swapped painter suppression inline-style based across `thumbPaintEls` (opacity/visibility/background restore), with dataset values treated as reflected state only.
- [x] Add swap restore hysteresis for tiles leaving the active fed set (frame/time delay + minimum hold) and skip transient unswaps while scrolling to prevent scroll-away disappearance.
- [x] Keep viewport event handlers collect/resize-only and avoid watchdog lifecycle intervention while FX view is active.
- [x] Add debug rect mismatch detector (`>2px`) with one-time logging and extended layout diagnostics (`tileFxCanvasTransformChain`) for transformed/filter/backdrop ancestor chains.
- [x] Enforce FX-safe compositor CSS (`fx-safemode`) and pseudo-painter kill rules for swapped tiles to avoid residual underlayer paints.
- [x] Bound fed/pending pressure in FX mode (adaptive overscan + pending cap telemetry) to reduce upload churn and gradual-takeover flicker.
- [ ] Capture iPhone proof run showing HUD `mode: fx | enabled: 1 | raf: 1` remains stable during aggressive scroll + Safari chrome collapse/expand.
- [ ] Capture iPhone proof run with `?fxdebug=1&fxprobe=1&tilefxDebugRects=1` and verify debug outlines stay locked to card borders while assets no longer vanish after offscreen travel.
- [ ] Evaluate whether desktop default cap should stay `640` or be tuned to `768` after quality/perf profiling.
- [ ] Run optional `?tilefxAtlas=1` bind-churn experiment once painter-leak checks are clean on iPhone.
## 2026-03-06 — Lifecycle invariant lock pass (new)
- [x] Made `syncTileFxLifecycleToView(view, reason, opts)` the only lifecycle mutator path used by `setView(...)` and `destroyTileFX(...)`.
- [x] Added post-sync `assertTileFxViewLifecycle(reason)` with immediate correction attempts for FX/non-FX mismatches.
- [x] Added containment fallback `containTileFxInvariantFailure(...)` to force DOM-owned safety state (hide canvas + restore swaps + dead-overlay markers) when lifecycle cannot be corrected.
- [x] Removed collect/heartbeat liveness checks that were acting as runtime lifecycle mutators/noise surfaces.
- [x] Kept visualViewport handlers resize/collect-only and documented the contract inline.
- [x] Tightened illegal-disable guard logging in shader runtime to one stack log per illegal-disable streak while preserving telemetry increments.
- [ ] Capture physical iPhone Safari proof showing `mode: fx | enabled: 1 | raf: 1` through chrome collapse/expand + aggressive scroll.
- [ ] Capture physical iPhone Safari proof showing no `LIFECYCLE_INVARIANT` in steady FX mode and no recovery-toast waterfall.

## 2026-03-06 — Visible ownership + scroll stability pass (new)
- [x] Added draw-truth ownership sync helper (`syncVisibleTileOwnership(...)`) so visible thumbnail swaps require texture + rect-valid + drawn-this-pass truth.
- [x] Added compact ownership probe `window.logVisibleTileOwnership(limit)` for on-device visible tile ownership inspection without expanding proof payload surfaces.
- [x] Blocked visible swap release in renderer cleanup paths and added counters (`visibleSwapReleaseBlocked`, `offscreenSwapReleaseAllowed`).
- [x] Updated `_restoreUntrackedSwaps(...)` to receive visible tile set and never release currently visible swapped tiles.
- [x] Reduced mobile/coarse-pointer fed-set churn (smaller scrolling overscan/maxFed/promotions) and added `fedVisibleRatio` telemetry.
- [x] Added HUD lifecycle stability field (`lifecycleStable`) derived from view/enabled/raf/dead-overlay state.
- [x] Kept collect/scroll/viewport paths lifecycle-neutral (no new lifecycle mutations, watchdogs, or recovery loops).
- [ ] Capture physical iPhone Safari run after aggressive scroll-stop and paste one `window.logVisibleTileOwnership()` console sample in PR notes.
- [ ] Validate on iPhone that visible thumbnails no longer flip DOM↔FX ownership at viewport edges during scroll.

## 2026-03-06 — Renderer behavior finish pass (new)
- [x] Enforced draw-truth-only swap eligibility (`visible + texture + drawn this pass + valid rect`) so cache/READY alone can no longer claim ownership.
- [x] Blocked swap release for active/fed tiles in ownership sync path.
- [x] Restricted untracked swap release to non-visible and non-near-visible tiles only.
- [x] Re-prioritized overscan promotions by viewport distance and reduced scroll-time feed caps to reduce gradual page takeover.
- [x] Kept lifecycle/proof/hud feature surface unchanged (behavior-only pass).
- [ ] Validate on physical iPhone Safari that visible tiles no longer alternate DOM/FX at viewport edges after aggressive scroll-stop.
- [ ] Capture and attach one `window.logVisibleTileOwnership(12)` output after aggressive scroll-stop.

## 2026-03-06 — Lifecycle bootstrap deadlock fix (new)
- [x] Fixed `assertTileFxViewLifecycle(...)` to accept scheduled RAF (`tileFX.raf > 0`) during startup before first-frame debug flags update.
- [x] Removed false containment trigger that could hide canvas + restore swaps before first render tick.
- [x] Kept behavior surface stable (no new diagnostics/proof/hud/watchdog additions).
- [ ] Re-run physical iPhone Safari check to confirm FX startup no longer falls into immediate `LIFECYCLE_INVARIANT` on entry.

## 2026-03-06 — Thumb painter leak + ownership snapshot fix (new)
- [x] Added `.thumb` + optional `.thumb .scrim` to `thumbPaintEls` so swap suppression includes wrapper paint surfaces, not only `<img>`.
- [x] Updated leak detector to ignore hidden painter nodes and avoid false positives caused by hidden elements retaining CSS background values.
- [x] Expanded DOM swap background snapshot/restore for thumb paint nodes (`backgroundImage/background/backgroundColor`) to prevent residual wrapper paint during FX ownership.
- [x] Updated visible ownership snapshot fallback so `window.logVisibleTileOwnership(limit)` reports fed rows even before first ownership cache update.
- [ ] Validate on iPhone that swapped painter leak logs no longer report `DIV.thumb` offenders for visible swapped tiles.
- [ ] Capture and attach non-empty `window.logVisibleTileOwnership(12)` output from physical iPhone FX session after scroll-stop.

## 2026-03-06 — Metadata-safe thumb/body split (new)
- [x] Split asset tile visual stack into `.thumb-body` (thumbnail paint) and `.asset-ui` (metadata/controls) to prevent metadata loss during FX swap suppression.
- [x] Moved `.asset-overlay` + selector/badges/title/subtitle and preview/play affordances into `.asset-ui` DOM layer.
- [x] Updated `thumbPaintEls` collection to track `.thumb-body` painters instead of suppressing `.thumb` container ownership.
- [x] Updated leak candidate scanning to inspect `.thumb-body` painters with the new DOM structure.
- [ ] Validate on iPhone Safari that metadata remains visible while `data-tex="1"` tiles are FX-owned.
- [ ] Capture one pasted `.asset` outerHTML sample from iPhone session after the split for handoff proof.

## 2026-03-06 — FX lifecycle runtime-truth alignment (new)
- [x] Aligned lifecycle/health verdict checks with live renderer truth (`tileFX.enabled`, scheduled RAF) to avoid false lifecycle-invariant output during startup transitions.
- [x] Updated compact/expanded HUD runtime labels to report effective renderer status rather than debug-field lag alone.
- [x] Kept lifecycle authority architecture unchanged and avoided new diagnostics/recovery additions.
- [ ] Verify on physical iPhone that HUD now remains `mode: fx | enabled: 1 | raf: 1` during steady FX runtime after startup.
