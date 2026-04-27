# Refinement Roadmap

## Phase 1A: API ownership and contract normalization
- [x] Route naming policy documented.
- [x] Frontend contract normalizers introduced.
- [x] OpenAPI contract tests added.
- [x] Behavior-preserving response model stabilization started.
- [ ] Follow-up: convert more implicit route responses to explicit schemas.
- [ ] Follow-up: decide long-term persistence for runtime live/recording state.

## Phase 2A: Atomic writes and deterministic fingerprints
- [x] Added atomic write helpers.
- [x] Recording upload uses atomic persistence.
- [x] Upload paths use atomic persistence where safe.
- [x] Temp files are excluded from indexing.
- [x] sha256 fingerprints are computed after durable writes.
- [ ] Follow-up: move all compose/export generation to temp-output then atomic rename if any path remains direct-write.
- [ ] Follow-up: persist CAS metadata in index schema.

## Phase 2B: CAS metadata in indexed media
- [x] Added optional sha256/content_address fields.
- [x] Preserved legacy media compatibility.
- [x] Added duplicate-content deterministic hash tests.
- [ ] Follow-up: promote content_address to primary asset identity where safe.
- [ ] Follow-up: add duplicate detection UX in Explorer.

## Phase 3: Event-driven runtime state
- [x] Added SSE event stream
- [x] Added runtime event bus
- [x] Explorer receives real-time hints
- [ ] Replace polling with event-driven updates
- [ ] Add event replay/backfill
