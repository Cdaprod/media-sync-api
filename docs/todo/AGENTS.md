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
