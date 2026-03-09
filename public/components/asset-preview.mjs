// ─────────────────────────────────────────────────────────────────────────────
// asset-preview.mjs — <asset-preview> Web Component  v2.0
//
// EXPLORER INTEGRATION — adapter pattern:
//
//   1. Drop the element once in your HTML:
//        <asset-preview id="preview" hidden></asset-preview>
//
//   2. Configure it once after page load:
//        preview.configure({
//          streamUrlBuilder : (asset) => `/media/${asset.path}?source=primary`,
//          obsSlots         : ['Slot 1','Slot 2','Slot 3'],
//          obsCoverModes    : ['Cover','Fit','Fill'],
//          resolveEnabled   : true,
//        });
//
//   3. On tile click:
//        preview.setAssets(assetList, clickedIndex);   // powers prev/next
//        preview.load(normalizedAsset);
//        preview.open();
//
//   4. Listen for events — Explorer handles all application logic:
//        preview.addEventListener('preview-action', e => {
//          const { action, asset, obsState, streamUrl } = e.detail;
//          // action: 'stream' | 'obs' | 'resolve' | 'tag' | 'compose' | 'delete'
//          // obsState: { cover, slot, exclusive }  (always included)
//          // streamUrl: built via streamUrlBuilder   (for 'stream' action)
//        });
//        preview.addEventListener('preview-close', () => { … });
//        preview.addEventListener('preview-prev',  () => { … });  // optional — handled internally
//        preview.addEventListener('preview-next',  () => { … });  // optional — handled internally
//
// STICKER LAYER API:
//        const id = preview.addSticker('https://…/mic-wave.html', { x:0.05, y:0.65, w:0.9, h:0.18 });
//        preview.removeSticker(id);
//        preview.clearStickers();
//        // Audio data is PostMessage'd to all sticker iframes each frame:
//        // { type:'cda:audioData', bass, mid, treb, rms, beat }
//
// ASSET OBJECT SHAPE (pass to load()):
//   {
//     name     : string            — filename
//     path     : string            — relative path (used in stream URL)
//     kind     : 'video'|'image'|'audio'
//     src      : string|null       — direct media URL (null = placeholder)
//     duration : number|null       — seconds (null for images)
//     quick    : [[k,v], …]        — meta chips shown in bottom strip
//     obs      : { cover, slot, exclusive } | null
//     raw      : any               — original Explorer asset (passed back in events)
//   }
// ─────────────────────────────────────────────────────────────────────────────

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap';

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('${FONTS}');

/*

- ── Responsive sizing strategy ────────────────────────────────────────────
- :host fills whatever the parent gives it — no fixed px here.
- The parent (explorer.html) owns the size via CSS on the element.
- Media inside uses object-fit:contain so any AR works without cropping.
- ─────────────────────────────────────────────────────────────────────────
  */
  :host {
  display: block;
  width: 100%; height: 100%;
  –accent:  #00e5ff;
  –accent2: #ff6b35;
  –purple:  #c084fc;
  –amber:   #fbbf24;
  –text:    #e8eaf0;
  –muted:   rgba(232,234,240,0.5);
  –mono:    'IBM Plex Mono', monospace;
  –sans:    'Syne', sans-serif;
  –surface: rgba(10,11,18,0.82);
  –border:  rgba(255,255,255,0.07);
  }
  :host([hidden]) { display: none !important; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Shell ── */
.panel {
position: relative; width: 100%; height: 100%;
border-radius: 22px; overflow: hidden;
background: #08090e; cursor: pointer;
box-shadow: 0 60px 140px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.06) inset;
}

/* ── Media layer ── */
.media-fill {
position: absolute; inset: 0;
display: flex; align-items: center; justify-content: center;
background: #08090e;
}
.media-fill video,
.media-fill img {
max-width: 100%; max-height: 100%;
width: auto; height: auto;
object-fit: contain; display: block;
}
.media-fill::after {
content: ''; position: absolute; inset: 0;
pointer-events: none;
box-shadow: inset 0 0 60px rgba(0,0,0,.55);
z-index: 1;
}

/* ── Placeholders ── */
.vid-placeholder {
width: 100%; height: 100%;
background: linear-gradient(170deg, #07090f 0%, #0e1320 45%, #060810 100%);
display: flex; align-items: center; justify-content: center;
position: relative; overflow: hidden;
}
.vid-placeholder::before {
content: ''; position: absolute; inset: 0;
background: radial-gradient(ellipse 55% 45% at 50% 55%, rgba(0,229,255,.05) 0%, transparent 70%);
}
.vid-scan {
position: absolute; top: 0; left: 0; right: 0; height: 2px;
background: linear-gradient(to right, transparent, rgba(0,229,255,.3), transparent);
animation: scan 3s linear infinite; opacity: .4;
}
@keyframes scan { 0%{top:0%} 100%{top:100%} }
.vid-label { font-size: 9px; letter-spacing: .25em; color: rgba(255,255,255,.06); position: relative; font-family: var(–mono); }

.img-placeholder {
width: 100%; height: 100%; background: #08090e;
display: flex; align-items: center; justify-content: center;
position: relative; overflow: hidden;
}
.img-placeholder::before {
content: ''; position: absolute; inset: 0;
background-image:
repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(255,255,255,.02) 47px, rgba(255,255,255,.02) 48px),
repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,.02) 47px, rgba(255,255,255,.02) 48px);
}

.audio-fill {
width: 100%; height: 100%;
background: radial-gradient(ellipse at 50% 60%, #0c0820 0%, #050810 60%, #020408 100%);
display: flex; align-items: center; justify-content: center;
position: relative; overflow: hidden;
}
.audio-fill canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.audio-center { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.audio-center span { font-size: 9px; letter-spacing: .25em; color: rgba(192,132,252,.45); font-family: var(–mono); }

/* ── Sticker layer — sits above media, below overlays ── */
.sticker-layer {
position: absolute; inset: 0; z-index: 8;
pointer-events: none; /* stickers themselves are pointer-events:none in play mode */
}
.sticker-frame {
position: absolute;
border: none; background: transparent; overflow: hidden;
pointer-events: none;
/* transition lets repositioning animate in edit mode */
transition: outline .15s;
}
.sticker-frame.editable {
pointer-events: auto;
outline: 1px solid rgba(0,229,255,.35);
cursor: move;
}
.sticker-frame.editable:hover { outline-color: rgba(0,229,255,.7); }

/* resize handle — bottom-right corner, edit mode only */
.sticker-handle {
display: none; position: absolute; bottom: -5px; right: -5px;
width: 14px; height: 14px; border-radius: 3px;
background: var(–accent); cursor: se-resize; z-index: 2;
box-shadow: 0 0 8px rgba(0,229,255,.6);
}
.sticker-frame.editable .sticker-handle { display: block; }

/* sticker remove button */
.sticker-remove {
display: none; position: absolute; top: -5px; right: -5px;
width: 14px; height: 14px; border-radius: 50%;
background: #f87171; cursor: pointer; z-index: 2;
font-size: 8px; color: #fff; line-height: 14px; text-align: center;
box-shadow: 0 0 6px rgba(248,113,113,.5);
}
.sticker-frame.editable .sticker-remove { display: block; }

/* ── Center play ── */
.center-play {
position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
width: 68px; height: 68px; border-radius: 50%;
background: rgba(0,0,0,.45); border: 2px solid rgba(255,255,255,.25);
display: flex; align-items: center; justify-content: center;
cursor: pointer; backdrop-filter: blur(10px); z-index: 9;
transition: transform .2s, background .2s, opacity .3s;
pointer-events: auto;
}
.center-play:hover { transform: translate(-50%,-50%) scale(1.08); background: rgba(0,0,0,.6); }
.center-play.hidden { opacity: 0; pointer-events: none; }

/* ── Overlays ── */
.overlays {
position: absolute; inset: 0; z-index: 10;
pointer-events: none; transition: opacity .4s ease;
}
.overlays.visible { opacity: 1; }
.overlays.hidden  { opacity: 0; }
.overlays.visible .interactive { pointer-events: auto; }

.scrim-top {
position: absolute; top: 0; left: 0; right: 0; height: 190px;
background: linear-gradient(to bottom, rgba(0,0,0,.85) 0%, rgba(0,0,0,.3) 65%, transparent 100%);
pointer-events: none;
}
.scrim-bottom {
position: absolute; bottom: 0; left: 0; right: 0; height: 360px;
background: linear-gradient(to top, rgba(0,0,0,.97) 0%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.18) 68%, transparent 100%);
pointer-events: none;
}

/* ── Header ── */
.hdr {
position: absolute; top: 0; left: 0; right: 0;
padding: 18px 18px 0;
display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
}
.hdr-left { flex: 1; min-width: 0; }

.kind-badge {
display: inline-flex; align-items: center; gap: 5px;
font-size: 8px; letter-spacing: .18em; text-transform: uppercase;
padding: 3px 8px; border-radius: 4px; margin-bottom: 5px;
backdrop-filter: blur(8px); font-family: var(–mono);
}
.badge-video  { background: rgba(0,229,255,.12);   color: var(–accent);  border: 1px solid rgba(0,229,255,.2); }
.badge-image  { background: rgba(255,107,53,.12);  color: var(–accent2); border: 1px solid rgba(255,107,53,.2); }
.badge-audio  { background: rgba(192,132,252,.12); color: var(–purple);  border: 1px solid rgba(192,132,252,.2); }

.asset-name {
font-family: var(–sans); font-size: 16px; font-weight: 800; color: #fff;
white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15;
text-shadow: 0 1px 12px rgba(0,0,0,.8);
}
.asset-path {
font-size: 9px; color: var(–muted); margin-top: 3px;
white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(–mono);
}

.hdr-right { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.icon-btn {
width: 30px; height: 30px; border-radius: 8px;
border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.38);
color: rgba(255,255,255,.72);
display: flex; align-items: center; justify-content: center;
cursor: pointer; transition: all .15s; backdrop-filter: blur(12px);
}
.icon-btn:hover { background: rgba(255,255,255,.16); color: #fff; }
.icon-btn.close-btn { border-radius: 50%; }

/* edit mode toggle button */
.icon-btn.edit-active {
background: rgba(0,229,255,.15); color: var(–accent);
border-color: rgba(0,229,255,.35);
}

/* ── Bottom stack ── */
.bottom-stack {
position: absolute; bottom: 0; left: 0; right: 0;
padding: 0 16px 22px;
display: flex; flex-direction: column; gap: 10px;
}

/* meta strip */
.meta-strip { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.meta-chip {
font-size: 8px; color: rgba(255,255,255,.4); letter-spacing: .06em;
display: flex; align-items: center; gap: 4px; font-family: var(–mono);
}
.meta-chip strong { color: rgba(255,255,255,.76); font-weight: 500; }
.meta-dot { width: 2px; height: 2px; border-radius: 50%; background: rgba(255,255,255,.2); }

/* OBS row */
.obs-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.obs-label { font-size: 8px; color: var(–muted); letter-spacing: .12em; font-family: var(–mono); }
.pill-static {
font-size: 8px; padding: 4px 10px; border-radius: 100px;
border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.35); color: rgba(255,255,255,.4);
font-family: var(–mono);
}
.pill-select {
font-family: var(–mono); font-size: 8px; padding: 4px 10px;
border-radius: 100px; border: 1px solid rgba(255,255,255,.1);
background: rgba(0,0,0,.4); color: rgba(255,255,255,.72);
outline: none; cursor: pointer; -webkit-appearance: none;
backdrop-filter: blur(8px);
}
.toggle-wrap { display: flex; align-items: center; gap: 5px; margin-left: auto; }
.toggle-label { font-size: 8px; color: var(–muted); letter-spacing: .05em; font-family: var(–mono); }
.toggle {
width: 28px; height: 15px; border-radius: 100px;
position: relative; cursor: pointer; transition: background .2s;
}
.toggle.on  { background: rgba(0,229,255,.28); }
.toggle.off { background: rgba(255,255,255,.08); }
.toggle::after {
content: ''; position: absolute; top: 2px; left: 2px;
width: 11px; height: 11px; border-radius: 50%;
transition: transform .2s, background .2s;
}
.toggle.on::after  { background: var(–accent); transform: translateX(13px); box-shadow: 0 0 6px rgba(0,229,255,.5); }
.toggle.off::after { background: rgba(255,255,255,.35); }

/* scrubber */
.scrub-area { display: flex; flex-direction: column; gap: 5px; }
.time-row { display: flex; justify-content: space-between; font-size: 9px; color: var(–muted); letter-spacing: .05em; font-family: var(–mono); }
.scrubber {
-webkit-appearance: none; appearance: none;
width: 100%; height: 3px; border-radius: 2px; outline: none; cursor: pointer;
transition: height .15s;
}
.scrubber:hover { height: 5px; }
.scrubber::-webkit-slider-thumb {
-webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
background: var(–accent); box-shadow: 0 0 10px rgba(0,229,255,.7); cursor: pointer;
transition: transform .15s;
}
.scrubber:hover::-webkit-slider-thumb { transform: scale(1.2); }

/* playback controls */
.ctrl-row { display: flex; align-items: center; gap: 7px; }
.ctrl-btn {
width: 34px; height: 34px; border-radius: 9px;
border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.4);
color: rgba(255,255,255,.8);
display: flex; align-items: center; justify-content: center;
cursor: pointer; transition: all .15s; flex-shrink: 0;
backdrop-filter: blur(10px);
}
.ctrl-btn:hover { background: rgba(255,255,255,.16); color: #fff; }
.ctrl-btn.play-btn {
width: 42px; height: 42px; border-radius: 50%;
background: var(–accent); border-color: var(–accent); color: #000;
box-shadow: 0 0 24px rgba(0,229,255,.5);
}
.ctrl-btn.play-btn:hover { transform: scale(1.08); }
.vol-wrap { display: flex; align-items: center; gap: 6px; flex: 1; }
.vol-slider {
-webkit-appearance: none; width: 60px; height: 3px; border-radius: 2px;
background: rgba(255,255,255,.18); outline: none; cursor: pointer;
}
.vol-slider::-webkit-slider-thumb {
-webkit-appearance: none; width: 10px; height: 10px;
border-radius: 50%; background: rgba(255,255,255,.8); cursor: pointer;
}
.orient-btn {
font-size: 8px; padding: 4px 10px; border-radius: 6px;
border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.4);
color: var(–muted); cursor: pointer; letter-spacing: .08em;
font-family: var(–mono); transition: all .2s; backdrop-filter: blur(10px);
}
.orient-btn:hover { color: #fff; border-color: rgba(255,255,255,.22); }

/* action pills */
.action-row { display: flex; gap: 6px; flex-wrap: wrap; }
.a-btn {
font-family: var(–mono); font-size: 8px; letter-spacing: .07em;
padding: 5px 11px; border-radius: 100px;
border: 1px solid rgba(255,255,255,.1);
background: rgba(0,0,0,.45); color: rgba(255,255,255,.6);
cursor: pointer; display: flex; align-items: center; gap: 4px;
transition: all .15s; white-space: nowrap; backdrop-filter: blur(10px);
}
.a-btn:hover { color: #fff; border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.08); }
.a-btn.primary { color: var(–accent); border-color: rgba(0,229,255,.25); background: rgba(0,229,255,.07); }
.a-btn.primary:hover { background: rgba(0,229,255,.15); }
.a-btn.resolve { color: var(–amber); border-color: rgba(251,191,36,.22); background: rgba(251,191,36,.07); }
.a-btn.resolve:hover { background: rgba(251,191,36,.14); }
.a-btn.compose { color: var(–purple); border-color: rgba(192,132,252,.25); background: rgba(192,132,252,.07); }
.a-btn.compose:hover { background: rgba(192,132,252,.15); }
.a-btn.danger { color: #f87171; border-color: rgba(248,113,113,.2); }
.a-btn.danger:hover { background: rgba(248,113,113,.1); }
`;

// ─────────────────────────────────────────────────────────────────────────────
// HTML TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATE = `

  <style>${CSS}</style>

  <div class="panel" part="panel">


<!-- 1. Media fill -->
<div class="media-fill" part="media"></div>

<!-- 2. Sticker iframe layer (above media, below overlays) -->
<div class="sticker-layer" part="sticker-layer"></div>

<!-- 3. Center play button -->
<div class="center-play hidden" part="center-play">
  <svg width="22" height="22" viewBox="0 0 22 22" fill="white">
    <polygon points="7,3 19,11 7,19"/>
  </svg>
</div>

<!-- 4. Overlays (header + bottom controls) -->
<div class="overlays visible" part="overlays">
  <div class="scrim-top"></div>
  <div class="scrim-bottom"></div>

  <!-- Header -->
  <div class="hdr interactive">
    <div class="hdr-left">
      <div class="kind-badge badge-video" part="badge">▶ VIDEO</div>
      <div class="asset-name" part="asset-name">—</div>
      <div class="asset-path" part="asset-path">—</div>
    </div>
    <div class="hdr-right">
      <div class="icon-btn" data-action="edit-mode" part="edit-btn" title="Edit stickers">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M7,1.5 L8.5,3 L3.5,8 L1.5,8.5 L2,6.5 Z"/>
          <line x1="6" y1="2.5" x2="7.5" y2="4"/>
        </svg>
      </div>
      <div class="icon-btn" data-action="prev" title="Previous">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6,1 2.5,4.5 6,8"/></svg>
      </div>
      <div class="icon-btn" data-action="next" title="Next">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,1 6.5,4.5 3,8"/></svg>
      </div>
      <div class="icon-btn close-btn" data-action="close" title="Close">
        <svg width="9" height="9" viewBox="0 0 9 9" stroke="currentColor" stroke-width="1.5">
          <line x1="1.5" y1="1.5" x2="7.5" y2="7.5"/>
          <line x1="7.5" y1="1.5" x2="1.5" y2="7.5"/>
        </svg>
      </div>
    </div>
  </div>

  <!-- Bottom stack -->
  <div class="bottom-stack interactive">
    <div class="meta-strip" part="meta-strip"></div>

    <div class="obs-row" part="obs-row">
      <span class="obs-label">OBS</span>
      <span class="pill-static">Fit</span>
      <select class="pill-select" part="obs-cover">
        <option>Cover</option><option>Fit</option><option>Fill</option>
      </select>
      <span class="pill-static">Slot</span>
      <select class="pill-select" part="obs-slot">
        <option>Slot 1</option><option>Slot 2</option><option>Slot 3</option>
      </select>
      <div class="toggle-wrap">
        <span class="toggle-label">Excl.</span>
        <div class="toggle off" part="exclusive-toggle"></div>
      </div>
    </div>

    <div class="scrub-area" part="scrub-area">
      <div class="time-row">
        <span part="time-current">0:00.000</span>
        <span part="time-total">0:00.000</span>
      </div>
      <input type="range" class="scrubber" part="scrubber" min="0" max="1000" value="0">
    </div>

    <div class="ctrl-row" part="ctrl-row">
      <button class="ctrl-btn" part="skip-back">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M8,3 A5,5 0 1 0 13,8" stroke-linecap="round"/>
          <polyline points="8,1 5,3.5 8,6" fill="currentColor" stroke="none"/>
          <text x="4.5" y="11.5" font-size="4.5" fill="currentColor" font-family="monospace" stroke="none">10</text>
        </svg>
      </button>
      <button class="ctrl-btn play-btn" part="play-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" part="play-icon">
          <polygon points="4,2 12,7 4,12"/>
        </svg>
      </button>
      <button class="ctrl-btn" part="skip-fwd">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M8,3 A5,5 0 1 1 3,8" stroke-linecap="round"/>
          <polyline points="8,1 11,3.5 8,6" fill="currentColor" stroke="none"/>
          <text x="4.5" y="11.5" font-size="4.5" fill="currentColor" font-family="monospace" stroke="none">10</text>
        </svg>
      </button>
      <div class="vol-wrap" part="vol-wrap">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" style="flex-shrink:0">
          <polygon points="1,4 4,4 7,2 7,10 4,8 1,8"/>
          <path d="M8.5,4.5 C9.5,5.2 9.5,6.8 8.5,7.5"/>
        </svg>
        <input type="range" class="vol-slider" part="vol-slider" min="0" max="100" value="80">
      </div>
      <span style="flex:1"></span>
      <button class="orient-btn" part="orient-btn">⤢ ROT</button>
    </div>

    <div class="action-row" part="action-row">
      <button class="a-btn primary" data-action="stream">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.3">
          <path d="M2.5,5.5 L6,2M4.5,2h3v3"/>
          <path d="M3.5,3.5H1.5V8H6.5V6"/>
        </svg>
        Stream
      </button>
      <button class="a-btn" data-action="obs">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="1" y="1" width="4.5" height="4.5" rx="1"/>
          <path d="M3.5,3.5h5v5h-5z"/>
        </svg>
        OBS
      </button>
      <button class="a-btn resolve" data-action="resolve" part="resolve-btn">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M4.5 1 L7.5 4.5 L4.5 8 L1.5 4.5 Z"/>
          <circle cx="4.5" cy="4.5" r="1.2" fill="currentColor" stroke="none"/>
        </svg>
        Resolve
      </button>
      <button class="a-btn compose" data-action="compose" part="compose-btn">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="1" y="2" width="7" height="5" rx="1"/>
          <path d="M3 4h3M3 5.5h2"/>
        </svg>
        Compose
      </button>
      <button class="a-btn" data-action="tag" style="margin-left:auto">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M1.5,1.5 h3.5 l3,3 -3.5,3.5 -3,-3 Z"/>
          <circle cx="4" cy="3" r=".8" fill="currentColor" stroke="none"/>
        </svg>
        Tag
      </button>
      <button class="a-btn danger" data-action="delete">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.3">
          <polyline points="1,2.5 8,2.5"/>
          <path d="M3.5,1h2M2,2.5l.4,5.5h4.2L7,2.5"/>
        </svg>
        Delete
      </button>
    </div>
  </div>
</div>


  </div>
`;

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export class AssetPreview extends HTMLElement {

static get observedAttributes() { return ['landscape', 'hidden']; }

constructor() {
super();
this._shadow = this.attachShadow({ mode: 'open' });
this._shadow.innerHTML = TEMPLATE;


// ── state ──
this._asset      = null;
this._assets     = [];       // full list for prev/next
this._assetIndex = 0;
this._playing    = false;
this._progress   = 0;        // 0–1000
this._editMode   = false;    // sticker edit mode

// ── timers / rAF ──
this._raf        = null;
this._waveRaf    = null;
this._audioRaf   = null;     // audio analysis loop for PostMessage bridge
this._hideTimer  = null;
this._moveTimer  = null;
this._overlayOn  = true;

// ── media elements ──
this._videoEl    = null;
this._audioEl    = null;

// ── Web Audio ──
this._audioCtx   = null;
this._analyser   = null;

// ── stickers ──
this._stickers   = new Map(); // id → { el, iframe, opts }
this._stickerSeq = 0;

// ── config (set by Explorer via configure()) ──
this._cfg = {
  streamUrlBuilder : (a) => `/media/${a.path}?source=primary`,
  obsSlots         : ['Slot 1','Slot 2','Slot 3'],
  obsCoverModes    : ['Cover','Fit','Fill'],
  resolveEnabled   : true,
  composeEnabled   : true,
};

this._bindEvents();


}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────

/**

- Configure from Explorer once on page load.
- All fields optional — defaults are sensible.
  */
  configure(opts = {}) {
  Object.assign(this._cfg, opts);
  this._applyConfig();
  }

/**

- Set the full asset list so the component handles prev/next internally.
- @param {Object[]} list  — array of normalized asset objects
- @param {number}   index — index of the asset about to be loaded
  */
  setAssets(list, index = 0) {
  this._assets     = list || [];
  this._assetIndex = index;
  }

/**

- Load a single asset into the panel.
- Shape: { name, path, kind, src, duration, quick, obs, raw }
  */
  load(asset) {
  this._asset    = asset;
  this._playing  = false;
  this._progress = 0;
  this._stopProgress();
  this._stopWaveform();
  this._teardownVideoAudio();
  this._renderHeader();
  this._renderMeta();
  this._renderObs();
  this._renderMedia();
  this._updateControls();
  this._updateScrubber();
  this._showOverlay();
  }

open()  { this.removeAttribute('hidden'); this._showOverlay(); }
close() {
this._pause();
this.setAttribute('hidden', '');
this._dispatch('preview-close', { asset: this._asset });
}

// ── Sticker API ────────────────────────────────────────────────────────────

/**

- Add an HTML sticker iframe.
- @param {string} url
- @param {{ x, y, w, h, opacity }} opts  — fractions of panel size (0–1)
- @returns {string} sticker id
  */
  addSticker(url, opts = {}) {
  const id = `stk_${++this._stickerSeq}`;
  const defaults = { x: 0.05, y: 0.65, w: 0.9, h: 0.18, opacity: 1 };
  const o = Object.assign({}, defaults, opts);


const wrap = document.createElement('div');
wrap.className = 'sticker-frame' + (this._editMode ? ' editable' : '');
wrap.dataset.stickerId = id;
this._applyStickerLayout(wrap, o);

const iframe = document.createElement('iframe');
iframe.src = url;
iframe.style.cssText = 'width:100%;height:100%;border:none;background:transparent;pointer-events:none;';
iframe.setAttribute('allowtransparency', 'true');
iframe.setAttribute('frameborder', '0');
iframe.loading = 'eager';

// resize handle
const handle = document.createElement('div');
handle.className = 'sticker-handle';
this._bindStickerResize(wrap, handle, o);

// remove button
const rm = document.createElement('div');
rm.className = 'sticker-remove';
rm.textContent = '×';
rm.addEventListener('click', e => { e.stopPropagation(); this.removeSticker(id); });

wrap.appendChild(iframe);
wrap.appendChild(handle);
wrap.appendChild(rm);

// drag in edit mode
this._bindStickerDrag(wrap, o);

this._$('.sticker-layer').appendChild(wrap);
this._stickers.set(id, { el: wrap, iframe, opts: o, url });

return id;


}

removeSticker(id) {
const s = this._stickers.get(id);
if (!s) return;
s.el.remove();
this._stickers.delete(id);
}

clearStickers() {
this.*stickers.forEach((*, id) => this.removeSticker(id));
}

getStickers() {
const out = [];
this._stickers.forEach((s, id) => out.push({ id, url: s.url, opts: { …s.opts } }));
return out;
}

// ─────────────────────────────────────────────────────────────────────────
// ATTRIBUTE CHANGES
// ─────────────────────────────────────────────────────────────────────────

attributeChangedCallback(name) {
if (name === 'landscape') this._updateOrientation();
}

// ─────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────

_$ (s) { return this._shadow.querySelector(s); }
_$$(s) { return this._shadow.querySelectorAll(s); }

_dispatch(name, detail = {}) {
this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
}

*obsState() {
return {
cover     : this.*$('[part=“obs-cover”]')?.value || 'Cover',
slot      : this.*$('[part=“obs-slot”]')?.value  || 'Slot 1',
exclusive : this.*$('[part=“exclusive-toggle”]')?.classList.contains('on') ?? false,
};
}

*applyConfig() {
// Rebuild OBS slot options
const slotSel = this.*$('[part=“obs-slot”]');
if (slotSel && this._cfg.obsSlots?.length) {
slotSel.innerHTML = this.*cfg.obsSlots.map(s => `<option>${s}</option>`).join('');
}
const coverSel = this.*$('[part=“obs-cover”]');
if (coverSel && this._cfg.obsCoverModes?.length) {
coverSel.innerHTML = this.*cfg.obsCoverModes.map(s => `<option>${s}</option>`).join('');
}
// Show/hide Resolve and Compose buttons
const rb = this.*$('[part=“resolve-btn”]');
if (rb) rb.style.display = this.*cfg.resolveEnabled ? '' : 'none';
const cb = this.*$('[part=“compose-btn”]');
if (cb) cb.style.display = this._cfg.composeEnabled ? '' : 'none';
}

// ─────────────────────────────────────────────────────────────────────────
// EVENT BINDING
// ─────────────────────────────────────────────────────────────────────────

*bindEvents() {
const panel = this.*$('.panel');


// Panel tap toggles overlay (skip interactive children)
panel.addEventListener('click', e => {
  if (e.target.closest('.interactive')) return;
  this._overlayOn ? this._hideOverlay() : this._showOverlay();
});

// Mousemove: show overlay, auto-hide while playing
panel.addEventListener('mousemove', () => {
  this._showOverlay();
  clearTimeout(this._moveTimer);
  if (this._playing) this._moveTimer = setTimeout(() => this._hideOverlay(), 2500);
});
panel.addEventListener('mouseleave', () => {
  if (this._playing) {
    clearTimeout(this._moveTimer);
    this._moveTimer = setTimeout(() => this._hideOverlay(), 500);
  }
});

// Center play
this._$('.center-play').addEventListener('click', e => { e.stopPropagation(); this._togglePlay(); });

// All [data-action] buttons (delegated)
this._shadow.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  e.stopPropagation();
  const action = btn.dataset.action;

  switch (action) {
    case 'close':     this.close(); break;
    case 'prev':      this._navPrev(); break;
    case 'next':      this._navNext(); break;
    case 'edit-mode': this._toggleEditMode(); break;
    case 'stream':    this._doStream(); break;
    case 'obs':       this._doObs(); break;
    case 'resolve':   this._doResolve(); break;
    case 'compose':   this._doCompose(); break;
    case 'tag':       this._dispatch('preview-action', { action: 'tag', asset: this._asset, obsState: this._obsState() }); break;
    case 'delete':    this._dispatch('preview-action', { action: 'delete', asset: this._asset, obsState: this._obsState() }); break;
    default:          this._dispatch('preview-action', { action, asset: this._asset, obsState: this._obsState() });
  }
});

// Play button
this._$('[part="play-btn"]').addEventListener('click', e => { e.stopPropagation(); this._togglePlay(); });

// Skip buttons
this._$('[part="skip-back"]').addEventListener('click', e => { e.stopPropagation(); this._skip(-10); });
this._$('[part="skip-fwd"]') .addEventListener('click', e => { e.stopPropagation(); this._skip(10); });

// Scrubber
const scrubber = this._$('[part="scrubber"]');
scrubber.addEventListener('input', e => {
  this._progress = parseInt(e.target.value);
  this._syncMediaToProgress();
  this._updateScrubber();
  this._updateTimeDisplay();
});
scrubber.addEventListener('click', e => e.stopPropagation());

// Volume
const vol = this._$('[part="vol-slider"]');
vol.addEventListener('input', e => {
  const v = parseInt(e.target.value) / 100;
  if (this._videoEl) this._videoEl.volume = v;
  if (this._audioEl) this._audioEl.volume = v;
});
vol.addEventListener('click', e => e.stopPropagation());

// Orientation
this._$('[part="orient-btn"]').addEventListener('click', e => {
  e.stopPropagation();
  this.toggleAttribute('landscape');
});

// Exclusive toggle
this._$('[part="exclusive-toggle"]').addEventListener('click', e => {
  e.stopPropagation();
  const t = e.currentTarget;
  t.classList.toggle('on');
  t.classList.toggle('off');
});


}

// ─────────────────────────────────────────────────────────────────────────
// NAVIGATION — handles list internally, also fires events for Explorer
// ─────────────────────────────────────────────────────────────────────────

_navPrev() {
this._dispatch('preview-prev', { asset: this._asset });
if (this._assets.length < 2) return;
this._assetIndex = (this._assetIndex - 1 + this._assets.length) % this._assets.length;
this.load(this._assets[this._assetIndex]);
}

_navNext() {
this._dispatch('preview-next', { asset: this._asset });
if (this._assets.length < 2) return;
this._assetIndex = (this._assetIndex + 1) % this._assets.length;
this.load(this._assets[this._assetIndex]);
}

// ─────────────────────────────────────────────────────────────────────────
// ACTIONS — emit structured events; Explorer handles business logic
// ─────────────────────────────────────────────────────────────────────────

_doStream() {
const url = this._cfg.streamUrlBuilder(this._asset);
navigator.clipboard?.writeText(url).catch(() => {});
this._dispatch('preview-action', {
action: 'stream',
asset: this._asset,
streamUrl: url,
obsState: this._obsState(),
});
}

_doObs() {
this._dispatch('preview-action', {
action: 'obs',
asset: this._asset,
streamUrl: this._cfg.streamUrlBuilder(this._asset),
obsState: this._obsState(),
});
}

_doResolve() {
this._dispatch('preview-action', {
action: 'resolve',
asset: this._asset,
obsState: this._obsState(),
});
}

_doCompose() {
this._dispatch('preview-action', {
action: 'compose',
asset: this._asset,
stickers: this.getStickers(),
obsState: this._obsState(),
});
}

// ─────────────────────────────────────────────────────────────────────────
// OVERLAY SHOW/HIDE
// ─────────────────────────────────────────────────────────────────────────

_showOverlay() {
clearTimeout(this.*hideTimer);
const ov = this.*$('.overlays');
ov.classList.replace('hidden', 'visible') || ov.classList.add('visible');
this._overlayOn = true;
if (this._playing) this._hideTimer = setTimeout(() => this._hideOverlay(), 3000);
}

*hideOverlay() {
const ov = this.*$('.overlays');
ov.classList.replace('visible', 'hidden') || ov.classList.add('hidden');
this._overlayOn = false;
}

// ─────────────────────────────────────────────────────────────────────────
// EDIT MODE (sticker handles visible)
// ─────────────────────────────────────────────────────────────────────────

_toggleEditMode() {
this._editMode = !this.*editMode;
const btn = this.*$('[part=“edit-btn”]');
btn.classList.toggle('edit-active', this._editMode);
this._stickers.forEach(s => {
s.el.classList.toggle('editable', this._editMode);
});
// In edit mode keep overlays visible always
if (this._editMode) {
clearTimeout(this._hideTimer);
this._showOverlay();
}
}

// ─────────────────────────────────────────────────────────────────────────
// STICKER LAYOUT + DRAG/RESIZE
// ─────────────────────────────────────────────────────────────────────────

*applyStickerLayout(el, o) {
const pw = this.*$('.panel').offsetWidth  || 390;
const ph = this._$('.panel').offsetHeight || 820;
el.style.left    = (o.x * pw) + 'px';
el.style.top     = (o.y * ph) + 'px';
el.style.width   = (o.w * pw) + 'px';
el.style.height  = (o.h * ph) + 'px';
el.style.opacity = o.opacity ?? 1;
}

*bindStickerDrag(wrap, o) {
let dragging = false, ox = 0, oy = 0;
const pw = () => this.*$('.panel').offsetWidth  || 390;
const ph = () => this._$('.panel').offsetHeight || 820;


const onDown = e => {
  if (!this._editMode || e.target.closest('.sticker-handle') || e.target.closest('.sticker-remove')) return;
  dragging = true;
  const r = wrap.getBoundingClientRect();
  const pr = this._$('.panel').getBoundingClientRect();
  ox = (e.touches?.[0] || e).clientX - r.left;
  oy = (e.touches?.[0] || e).clientY - r.top;
  e.preventDefault();
};
const onMove = e => {
  if (!dragging) return;
  const pr = this._$('.panel').getBoundingClientRect();
  const cx = (e.touches?.[0] || e).clientX - pr.left - ox;
  const cy = (e.touches?.[0] || e).clientY - pr.top  - oy;
  o.x = Math.max(0, Math.min(1 - o.w, cx / pw()));
  o.y = Math.max(0, Math.min(1 - o.h, cy / ph()));
  wrap.style.left = (o.x * pw()) + 'px';
  wrap.style.top  = (o.y * ph()) + 'px';
  e.preventDefault();
};
const onUp = () => { dragging = false; };

wrap.addEventListener('mousedown',  onDown);
wrap.addEventListener('touchstart', onDown, { passive: false });
window.addEventListener('mousemove',  onMove);
window.addEventListener('touchmove',  onMove, { passive: false });
window.addEventListener('mouseup',  onUp);
window.addEventListener('touchend', onUp);


}

*bindStickerResize(wrap, handle, o) {
let resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
const pw = () => this.*$('.panel').offsetWidth  || 390;
const ph = () => this._$('.panel').offsetHeight || 820;


handle.addEventListener('mousedown', e => {
  if (!this._editMode) return;
  resizing = true;
  sx = e.clientX; sy = e.clientY;
  sw = o.w * pw(); sh = o.h * ph();
  e.stopPropagation(); e.preventDefault();
});
handle.addEventListener('touchstart', e => {
  if (!this._editMode) return;
  resizing = true;
  sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  sw = o.w * pw(); sh = o.h * ph();
  e.stopPropagation(); e.preventDefault();
}, { passive: false });

const onMove = e => {
  if (!resizing) return;
  const cx = (e.touches?.[0] || e).clientX;
  const cy = (e.touches?.[0] || e).clientY;
  const nw = Math.max(60, sw + (cx - sx));
  const nh = Math.max(30, sh + (cy - sy));
  o.w = Math.min(1 - o.x, nw / pw());
  o.h = Math.min(1 - o.y, nh / ph());
  wrap.style.width  = (o.w * pw()) + 'px';
  wrap.style.height = (o.h * ph()) + 'px';
  e.preventDefault();
};
const onUp = () => { resizing = false; };

window.addEventListener('mousemove',  onMove);
window.addEventListener('touchmove',  onMove, { passive: false });
window.addEventListener('mouseup',  onUp);
window.addEventListener('touchend', onUp);


}

// ─────────────────────────────────────────────────────────────────────────
// RENDER METHODS
// ─────────────────────────────────────────────────────────────────────────

*renderHeader() {
const a = this.*asset;
const badge = this.*$('[part=“badge”]');
const icons = { video: '▶', image: '◼', audio: '♪' };
badge.className = `kind-badge badge-${a.kind}`;
badge.textContent = `${icons[a.kind] || '◼'} ${a.kind.toUpperCase()}`;
this.*$('[part=“asset-name”]').textContent = a.name;
this._$('[part=“asset-path”]').textContent = a.path;
}

*renderMeta() {
const strip = this.*$('[part=“meta-strip”]');
strip.innerHTML = '';
(this._asset.quick || []).forEach(([k, v], i) => {
if (i > 0) {
const dot = document.createElement('div');
dot.className = 'meta-dot';
strip.appendChild(dot);
}
const chip = document.createElement('div');
chip.className = 'meta-chip';
chip.innerHTML = `<span>${k}</span> <strong>${v}</strong>`;
strip.appendChild(chip);
});
}

*renderObs() {
const a = this.*asset;
const obsRow = this.*$('[part=“obs-row”]');
// Show OBS row for video and image; audio has no OBS slot concept
obsRow.style.display = a.kind === 'audio' ? 'none' : '';
if (a.obs) {
const cs = this.*$('[part=“obs-cover”]');
const ss = this.*$('[part=“obs-slot”]');
if (cs && a.obs.cover) cs.value = a.obs.cover;
if (ss && a.obs.slot)  ss.value = a.obs.slot;
const tog = this.*$('[part=“exclusive-toggle”]');
if (tog) {
tog.classList.toggle('on',  !!a.obs.exclusive);
tog.classList.toggle('off', !a.obs.exclusive);
}
}
}

*renderMedia() {
const fill = this.*$('[part=“media”]');
fill.innerHTML = '';
// teardown any previous media
this._videoEl = null;
this._audioEl = null;
this._audioCtx = null;
this._analyser = null;


const { kind, src } = this._asset;

if (kind === 'video') {
  if (src) {
    const v = document.createElement('video');
    v.src = src;
    v.loop = false;
    v.playsInline = true;
    v.preload = 'metadata';
    v.volume = (this._$('[part="vol-slider"]')?.value || 80) / 100;
    v.crossOrigin = 'anonymous'; // needed for Web Audio API
    fill.appendChild(v);
    this._videoEl = v;
    this._bindVideoEvents(v);
  } else {
    fill.innerHTML = `
      <div class="vid-placeholder">
        <div class="vid-scan"></div>
        <span class="vid-label">VIDEO STREAM</span>
      </div>`;
  }

} else if (kind === 'image') {
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = this._asset.name;
    fill.appendChild(img);
  } else {
    fill.innerHTML = `
      <div class="img-placeholder">
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" opacity="0.1">
          <rect x="4" y="4" width="52" height="52" rx="7" stroke="white" stroke-width="2"/>
          <circle cx="19" cy="19" r="7" stroke="white" stroke-width="2"/>
          <polyline points="4,44 18,28 28,38 38,24 56,44" stroke="white" stroke-width="2" fill="none"/>
        </svg>
      </div>`;
  }

} else { // audio
  this._audioEl    = null;
  this._audioCtx   = null;
  this._analyser   = null;

  fill.innerHTML = `
    <div class="audio-fill">
      <canvas part="wave-canvas"></canvas>
      <div class="audio-center">
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" stroke="#c084fc" stroke-width="1.5" opacity="0.6">
          <rect x="2"  y="16" width="7" height="18" rx="2"/>
          <rect x="12" y="8"  width="7" height="34" rx="2"/>
          <rect x="22" y="12" width="7" height="26" rx="2"/>
          <rect x="32" y="4"  width="7" height="42" rx="2"/>
          <rect x="42" y="18" width="6" height="14" rx="2"/>
        </svg>
        <span>AUDIO TRACK</span>
      </div>
    </div>`;

  if (src) {
    const audio = new Audio();
    audio.src = src;
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audio.volume = (this._$('[part="vol-slider"]')?.value || 80) / 100;
    this._audioEl = audio;
    this._bindAudioEvents(audio);
  }

  requestAnimationFrame(() => this._startWaveform());
}


}

*updateControls() {
const a = this.*asset;
const hasScrub = a.kind === 'video' || a.kind === 'audio';
this.*$('[part=“scrub-area”]').style.display = hasScrub ? 'flex'  : 'none';
this.*$('[part=“skip-back”]') .style.display = hasScrub ? ''      : 'none';
this.*$('[part=“skip-fwd”]')  .style.display = hasScrub ? ''      : 'none';
this.*$('[part=“play-btn”]')  .style.display = hasScrub ? ''      : 'none';
this.*$('[part=“vol-wrap”]')  .style.display = hasScrub ? 'flex'  : 'none';
this.*$('.center-play').classList.toggle('hidden', !hasScrub);
if (hasScrub) this._updateTimeDisplay();
}

_updateOrientation() { /* panel resizes via CSS on the host element */ }

// ─────────────────────────────────────────────────────────────────────────
// VIDEO EVENTS — wires native <video> to all controls
// ─────────────────────────────────────────────────────────────────────────

_bindVideoEvents(v) {
v.addEventListener('timeupdate', () => {
if (!this._playing) return;
const dur = v.duration || this._asset.duration || 1;
this._progress = (v.currentTime / dur) * 1000;
this._updateScrubber();
this._updateTimeDisplay();
});
v.addEventListener('ended', () => {
this._playing = false;
this._progress = 0;
this._updatePlayIcons();
this._updateScrubber();
this._showOverlay();
});
v.addEventListener('loadedmetadata', () => {
// Update duration display once metadata is available
if (v.duration && !this._asset.duration) {
this._asset = { …this._asset, duration: v.duration };
}
this._updateTimeDisplay();
});
}

_bindAudioEvents(a) {
a.addEventListener('timeupdate', () => {
if (!this._playing) return;
const dur = a.duration || this._asset.duration || 1;
this._progress = (a.currentTime / dur) * 1000;
this._updateScrubber();
this._updateTimeDisplay();
});
a.addEventListener('ended', () => {
this._playing = false;
this._progress = 0;
this._updatePlayIcons();
this._updateScrubber();
this._showOverlay();
});
}

// ─────────────────────────────────────────────────────────────────────────
// PLAYBACK
// ─────────────────────────────────────────────────────────────────────────

_togglePlay() {
if (!this._asset) return;
this._playing ? this._pause() : this._play();
}

_play() {
this._playing = true;
this._updatePlayIcons();


if (this._videoEl) {
  // Boot Web Audio on first play (requires user gesture)
  if (!this._audioCtx) this._setupAudioContext(this._videoEl);
  if (this._audioCtx?.state === 'suspended') this._audioCtx.resume();
  this._videoEl.play().catch(() => { this._playing = false; this._updatePlayIcons(); });
  this._startAudioBroadcast();
  this._hideTimer = setTimeout(() => this._hideOverlay(), 2500);

} else if (this._audioEl) {
  if (!this._audioCtx) this._setupAudioContext(this._audioEl);
  if (this._audioCtx?.state === 'suspended') this._audioCtx.resume();
  this._audioEl.play().catch(() => { this._playing = false; this._updatePlayIcons(); });
  this._startAudioBroadcast();
  this._hideTimer = setTimeout(() => this._hideOverlay(), 2500);

} else {
  // Placeholder: simulated progress
  this._startProgress();
  this._hideTimer = setTimeout(() => this._hideOverlay(), 2500);
}


}

_pause() {
this._playing = false;
this._updatePlayIcons();
if (this._videoEl) this._videoEl.pause();
if (this._audioEl) this._audioEl.pause();
this._stopProgress();
this._stopAudioBroadcast();
this._showOverlay();
}

// ── Web Audio context (video or audio element as source) ──────────────────
_setupAudioContext(mediaEl) {
const AudioCtx = window.AudioContext || window.webkitAudioContext;
if (!AudioCtx) return;
try {
this._audioCtx = new AudioCtx();
const analyser = this._audioCtx.createAnalyser();
analyser.fftSize = 256;
analyser.smoothingTimeConstant = 0.78;
const source = this._audioCtx.createMediaElementSource(mediaEl);
source.connect(analyser);
analyser.connect(this._audioCtx.destination); // still hear the audio
this._analyser = analyser;
} catch(e) {
// MediaElementSource can only be created once per element — ignore if already set up
}
}

// ── PostMessage audio broadcast to sticker iframes ────────────────────────
_startAudioBroadcast() {
if (this._audioRaf) return;
const freqData = new Uint8Array(128);
// Beat detection state
let beatHistory = new Array(20).fill(0), beatPtr = 0, beat = 0;


const tick = () => {
  if (!this._playing) { this._audioRaf = null; return; }
  this._audioRaf = requestAnimationFrame(tick);

  if (!this._analyser) return;
  this._analyser.getByteFrequencyData(freqData);

  const N = freqData.length;
  const b2 = Math.floor(N * 0.05);
  const m2 = Math.floor(N * 0.3);
  const t2 = Math.floor(N * 0.7);
  let bS=0, mS=0, tS=0, rS=0;
  for (let i=0; i<b2; i++) bS += freqData[i];
  for (let i=b2; i<m2; i++) mS += freqData[i];
  for (let i=m2; i<t2; i++) tS += freqData[i];
  for (let i=0; i<N; i++) { const v=freqData[i]/255; rS+=v*v; }

  const bass = Math.min(1, bS/(b2*255));
  const mid  = Math.min(1, mS/((m2-b2)*255));
  const treb = Math.min(1, tS/((t2-m2)*255));
  const rms  = Math.min(1, Math.sqrt(rS/N));

  beatHistory[beatPtr++ % 20] = bass;
  const avg = beatHistory.reduce((a,b)=>a+b,0)/20;
  if (bass > avg*1.4 && bass > 0.1) beat = 1.0;
  beat = Math.max(0, beat - 0.04);

  const msg = { type: 'cda:audioData', bass, mid, treb, rms, beat };
  this._stickers.forEach(s => {
    try { s.iframe.contentWindow?.postMessage(msg, '*'); } catch(e) {}
  });
};
this._audioRaf = requestAnimationFrame(tick);


}

_stopAudioBroadcast() {
cancelAnimationFrame(this._audioRaf);
this._audioRaf = null;
}

// ─────────────────────────────────────────────────────────────────────────
// SIMULATED PROGRESS (placeholder assets with no real media)
// ─────────────────────────────────────────────────────────────────────────

_startProgress() {
const dur  = this._asset?.duration || 1;
const step = 1000 / (dur * 60);
const tick = () => {
this._progress = Math.min(1000, this._progress + step);
this._updateScrubber();
this._updateTimeDisplay();
if (this._progress >= 1000) {
this._playing = false;
this._updatePlayIcons();
this._progress = 0;
this._updateScrubber();
this._showOverlay();
return;
}
this._raf = requestAnimationFrame(tick);
};
this._raf = requestAnimationFrame(tick);
}

_stopProgress() { cancelAnimationFrame(this._raf); this._raf = null; }

// ─────────────────────────────────────────────────────────────────────────
// SEEK
// ─────────────────────────────────────────────────────────────────────────

_skip(sec) {
if (this._videoEl) {
const dur = this._videoEl.duration || this._asset?.duration || 1;
this._videoEl.currentTime = Math.max(0, Math.min(dur, this._videoEl.currentTime + sec));
} else if (this._audioEl) {
const dur = this._audioEl.duration || this._asset?.duration || 1;
this._audioEl.currentTime = Math.max(0, Math.min(dur, this._audioEl.currentTime + sec));
} else {
const dur = this._asset?.duration || 1;
this._progress = Math.max(0, Math.min(1000, this._progress + (sec/dur)*1000));
this._updateScrubber();
this._updateTimeDisplay();
}
}

_syncMediaToProgress() {
const dur = this._asset?.duration || 0;
const t   = (this._progress / 1000) * dur;
if (this._videoEl) this._videoEl.currentTime = t;
if (this._audioEl) this._audioEl.currentTime = t;
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUBBER + TIME DISPLAY
// ─────────────────────────────────────────────────────────────────────────

*updateScrubber() {
const s = this.*$('[part=“scrubber”]');
if (!s) return;
s.value = this._progress;
const pct = this._progress / 10;
s.style.background = `linear-gradient(to right, #00e5ff ${pct}%, rgba(255,255,255,.15) ${pct}%)`;
}

_updateTimeDisplay() {
const dur = this._asset?.duration || 0;
const cur = (this.*progress / 1000) * dur;
this.*$('[part=“time-current”]').textContent = this.*fmtTime(cur, dur);
this.*$('[part=“time-total”]')  .textContent = this._fmtTime(dur, dur);
}

_fmtTime(s, dur) {
if (!s || isNaN(s)) s = 0;
if (dur < 10) {
const ms = (s % 1).toFixed(3).slice(2);
return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${ms}`;
}
return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

// ─────────────────────────────────────────────────────────────────────────
// PLAY ICONS
// ─────────────────────────────────────────────────────────────────────────

*updatePlayIcons() {
const pause = '<rect x="3" y="2" width="3" height="10"/><rect x="8" y="2" width="3" height="10"/>';
const play  = '<polygon points="4,2 12,7 4,12"/>';
const pi = this.*$('[part=“play-icon”]');
if (pi) pi.innerHTML = this._playing ? pause : play;


const cp = this._$('.center-play');
if (cp) cp.querySelector('svg').innerHTML = this._playing
  ? '<rect x="6" y="4" width="4" height="14"/><rect x="12" y="4" width="4" height="14"/>'
  : '<polygon points="7,3 19,11 7,19"/>';


}

// ─────────────────────────────────────────────────────────────────────────
// WAVEFORM (audio panel only)
// ─────────────────────────────────────────────────────────────────────────

*startWaveform() {
const c = this.*$('[part=“wave-canvas”]');
if (!c) return;
const ctx2d = c.getContext('2d');


const resize = () => {
  if (!c.isConnected) return;
  const dpr  = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width    = rect.width  * dpr;
  c.height   = rect.height * dpr;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  c._cssW = rect.width;
  c._cssH = rect.height;
};
const ro = new ResizeObserver(resize);
ro.observe(c);
resize();

const BARS = 70;
let freqData  = null;
let liveBlend = 0;
let t = 0;

const draw = () => {
  if (!c.isConnected) { ro.disconnect(); return; }
  const W = c._cssW || c.width;
  const H = c._cssH || c.height;
  ctx2d.clearRect(0, 0, W, H);
  t += 0.016;

  const bw     = W / BARS;
  const isLive = !!(this._analyser && this._playing);
  liveBlend   += isLive ? 0.06 : -0.04;
  liveBlend    = Math.max(0, Math.min(1, liveBlend));

  if (this._analyser) {
    if (!freqData || freqData.length !== this._analyser.frequencyBinCount) {
      freqData = new Uint8Array(this._analyser.frequencyBinCount);
    }
    this._analyser.getByteFrequencyData(freqData);
  }

  for (let i = 0; i < BARS; i++) {
    const idleAmp =
      (Math.sin(i * 0.26 + t) * 0.5 + 0.5) *
      (Math.sin(i * 0.08 + t * 0.55) * 0.4 + 0.6) * 0.75;

    let liveAmp = 0;
    if (freqData) {
      const usable = Math.floor(freqData.length * 0.67);
      const bin    = Math.floor((i / BARS) * usable);
      liveAmp      = Math.pow(freqData[bin] / 255, 0.7);
    }

    const amp = idleAmp * (1 - liveBlend) + liveAmp * liveBlend;
    const bh  = amp * H * 0.78;
    const y   = (H - bh) / 2;
    const al  = 0.18 + amp * 0.82;
    const r   = Math.round(192 - liveBlend * 120);
    const g   = Math.round(132 - liveBlend * 90);

    ctx2d.fillStyle = `rgba(${r},${g},252,${al})`;
    ctx2d.beginPath();
    if (ctx2d.roundRect) ctx2d.roundRect(i*bw+2, y, bw-4, Math.max(2, bh), 2);
    else ctx2d.rect(i*bw+2, y, bw-4, Math.max(2, bh));
    ctx2d.fill();
  }

  this._waveRaf = requestAnimationFrame(draw);
};
draw();


}

_stopWaveform() {
cancelAnimationFrame(this._waveRaf);
this._waveRaf = null;
}

_teardownVideoAudio() {
this._stopAudioBroadcast();
this._stopWaveform();
if (this._audioCtx) {
this._audioCtx.close().catch(() => {});
this._audioCtx = null;
this._analyser  = null;
}
if (this._videoEl) { this._videoEl.pause(); this._videoEl.src = ''; this._videoEl = null; }
if (this._audioEl) { this._audioEl.pause(); this._audioEl.src = ''; this._audioEl = null; }
}

// ─────────────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────

disconnectedCallback() {
this._stopProgress();
this._teardownVideoAudio();
clearTimeout(this._hideTimer);
clearTimeout(this._moveTimer);
}
}

customElements.define('asset-preview', AssetPreview);

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER — normalizes Explorer API asset objects into the component shape
// Import this alongside the component, or inline it in explorer.html.
// ─────────────────────────────────────────────────────────────────────────────

/**

- Normalize an Explorer API asset into the shape asset-preview expects.
- 
- @param {Object} apiAsset   — raw API response object
- @param {Object} ctx        — optional Explorer context functions
- @param {Function} [ctx.resolvePreviewSrc]  — (apiAsset) => URL string
- @param {Function} [ctx.buildQuickMeta]     — (apiAsset) => [[k,v], …]
- @param {Function} [ctx.buildObsState]      — (apiAsset) => { cover, slot, exclusive }
- @returns {Object} normalized asset for preview.load()
  */
  export function normalizeAsset(apiAsset, ctx = {}) {
  const kind = (apiAsset.kind ?? apiAsset.type ?? 'image').toLowerCase();

const quick = ctx.buildQuickMeta
? ctx.buildQuickMeta(apiAsset)
: _defaultQuickMeta(apiAsset, kind);

return {
// Identity
id       : apiAsset.id ?? apiAsset.sha256 ?? apiAsset.path,
name     : apiAsset.filename ?? apiAsset.name ?? 'Untitled',
path     : apiAsset.relative_path ?? apiAsset.path ?? '',
kind,
// Media source — Explorer provides a resolved URL or null for placeholder
src      : ctx.resolvePreviewSrc ? ctx.resolvePreviewSrc(apiAsset) : (apiAsset.stream_url ?? apiAsset.src ?? null),
// Duration in seconds — null = unknown / image
duration : apiAsset.duration_seconds ?? apiAsset.duration ?? null,
// Quick-meta chips
quick,
// OBS state — Explorer owns slot config
obs      : ctx.buildObsState ? ctx.buildObsState(apiAsset) : _defaultObsState(apiAsset),
// Original API object — passed back in all preview-action events as event.detail.asset.raw
raw      : apiAsset,
};
}

function _defaultQuickMeta(a, kind) {
const chips = [];
if (kind === 'video') {
if (a.width && a.height)  chips.push(['RES',  `${a.width}×${a.height}`]);
if (a.fps)                chips.push(['FPS',  String(a.fps)]);
if (a.codec)              chips.push(['CODEC', a.codec]);
if (a.file_size_kb)       chips.push(['SIZE', `${a.file_size_kb}KB`]);
} else if (kind === 'image') {
if (a.width && a.height)  chips.push(['RES',  `${a.width}×${a.height}`]);
if (a.format)             chips.push(['FMT',  a.format.toUpperCase()]);
if (a.bit_depth)          chips.push(['DEPTH', `${a.bit_depth}bit`]);
if (a.file_size_kb)       chips.push(['SIZE', `${a.file_size_kb}KB`]);
} else {
if (a.duration_seconds)   chips.push(['DUR',  _fmtDur(a.duration_seconds)]);
if (a.bitrate_kbps)       chips.push(['RATE', `${a.bitrate_kbps}kbps`]);
if (a.channels)           chips.push(['CH',   a.channels === 2 ? 'Stereo' : 'Mono']);
if (a.sample_rate_hz)     chips.push(['SR',   `${(a.sample_rate_hz/1000).toFixed(1)}kHz`]);
}
return chips;
}

function _defaultObsState(a) {
return {
cover     : a.obs_cover  ?? a.cover  ?? 'Cover',
slot      : a.obs_slot   ?? a.slot   ?? 'Slot 1',
exclusive : a.exclusive  ?? false,
};
}

function _fmtDur(s) {
if (!s) return '0:00';
return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}