# Developer Questions/Inquires between Tasks

## /docker/packages/Explorer/src/components/..

[../LiveSourceCard.tsx, ../LiveRecorder.tsx, ../live/LivePreview.tsx]

- [ ] What to do with these files shows two recording paths currently overlapping

LivePreview.tsx = polished viewer/player for /api/live
LiveSourceCard.tsx = side-panel operator control for /api/live_sessions
LiveRecorder.tsx = old/local recorder widget that should probably be phased down
useRecordingSessions + StreamHub = newer recording lifecycle path

```md
Yes — and what you pasted shows two recording paths currently overlapping.

The cleaner truth:

LivePreview.tsx = polished viewer/player for /api/live
LiveSourceCard.tsx = side-panel operator control for /api/live_sessions
LiveRecorder.tsx = old/local recorder widget that should probably be phased down
useRecordingSessions + StreamHub = newer recording lifecycle path

The important issue in your pasted code:

onRecordPeerSession(session.session_id)

That means LiveSourceCard is not passing the stream to the recorder anymore. It is relying on:

StreamHub.set(session.session_id, stream);

So the intended newer flow is likely:

LiveSourceCard receives WebRTC stream
→ stores stream in StreamHub by session_id
→ onRecordPeerSession(session_id)
→ useRecordingSessions looks up stream from StreamHub
→ creates /api/recordings lifecycle record
→ MediaRecorder records
→ uploads to /api/live_sessions/{id}/recording/upload
→ completes /api/recordings/{recording_id}/complete
→ pending recording card reconciles into asset grid

That means do not polish LiveRecorder.tsx as the main path yet. It looks like an older standalone widget. It records and uploads directly, but it does not participate in /api/recordings lifecycle state or provisional asset grid reconciliation.

What I’d tell Codex:

Audit whether LiveRecorder.tsx is still mounted anywhere.
If it is unused:
- keep it for now but mark it legacy/local-widget.
- do not expand it.
- prefer useRecordingSessions + StreamHub for the production recording path.
If it is mounted:
- refactor it to become a thin visual/control wrapper around useRecordingSessions instead of owning MediaRecorder directly.

Your polish target is:

1. Polish LivePreview.tsx as the actual player.
2. Polish PendingRecordingAssetCard as the asset-grid recording visual.
3. Keep LiveSourceCard as the side-panel launcher/control.
4. Consolidate or retire LiveRecorder.tsx after confirming usage.

The immediate code smell:

LiveRecorder directly records `stream`.
LiveSourceCard records by `session_id` through StreamHub.

Pick one source of truth. For this repo’s current direction, choose:

session_id + StreamHub + /api/recordings

Not direct stream props everywhere.
``` 

- [ ] Newly implemented app router page component is connect/device page

device-side capture/monitor surface. Integrate it as the /connect/device style browser device page.

- [ ] currently does local preview + local download recording. Change it so it can also become a registered remote live source.
- [ ] Add config near the top 
- [ ] Add WebRTC publish logic
- [ ] Add answer polling
- [ ] Add heartbeat loop
- [ ] Cleanup on stop