// ─────────────────────────────────────────────────────────────────────────────
// asset-preview.mjs — <asset-preview> Web Component
//
// Usage in explorer.html:
//   <script type="module" src="./asset-preview.mjs"></script>
//   <asset-preview></asset-preview>
//
// JS API:
//   const el = document.querySelector('asset-preview');
//   el.load(assetObject);   // see AssetPreview.load() for shape
//   el.open();              // show panel
//   el.close();             // hide panel (fires 'preview-close' event)
//
// Events dispatched on the element:
//   'preview-close'         — user closed the panel
//   'preview-action'        — { detail: { action, asset } }  e.g. 'delete','export','obs'
//   'preview-prev'          — user clicked prev arrow
//   'preview-next'          — user clicked next arrow
// ─────────────────────────────────────────────────────────────────────────────

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap';

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('${FONTS}');

  /*
   * ── Responsive sizing strategy ──────────────────────────────────────────────
   * :host is sized by the PARENT in explorer.html (position:fixed, inset, etc.)
   * It never sets its own fixed px dimensions — that's the host's job.
   * The panel fills whatever space the host gives it via width/height: 100%.
   * Media inside always uses object-fit: contain so it scales to fit without
   * cropping, regardless of the asset's native aspect ratio.
   * ────────────────────────────────────────────────────────────────────────────
   */
  :host {
    display: block;
    /* fill the space given by the parent — no fixed size here */
    width: 100%;
    height: 100%;
    --accent: #00e5ff;
    --accent2: #ff6b35;
    --purple: #c084fc;
    --text: #e8eaf0;
    --muted: rgba(232,234,240,0.5);
    --mono: 'IBM Plex Mono', monospace;
    --sans: 'Syne', sans-serif;
  }
  :host([hidden]) { display: none !important; }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Shell fills host exactly ── */
  .panel {
    position: relative;
    width: 100%; height: 100%;
    border-radius: 22px;
    overflow: hidden;
    /* Subtle dark surface — visible in letterbox/pillarbox gaps around media */
    background: #08090e;
    cursor: pointer;
    box-shadow: 0 60px 140px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.06) inset;
  }

  /* ── Media layer — always centered, never cropped ── */
  .media-fill {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    /* This is what shows in the gaps around non-matching-AR media */
    background: #08090e;
  }
  /*
   * object-fit: contain  — scales the media to fit entirely within the box,
   * preserving AR. Letterbox (horizontal gaps) or pillarbox (vertical gaps)
   * show the .media-fill background above. This works for any source AR
   * (square, landscape 16:9, portrait 9:16, ultrawide, etc.) without the
   * user needing to pinch-zoom or the panel needing to resize.
   */
  .media-fill video,
  .media-fill img {
    max-width: 100%; max-height: 100%;
    width: auto; height: auto;
    object-fit: contain;
    display: block;
  }

  /*
   * Placeholders mimic the same centering behavior as real media.
   * They fill the .media-fill container (which is position:absolute inset:0)
   * and center their content, so the panel bg shows around them exactly
   * as it would around a non-matching-AR video or image.
   */
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
  .vid-label { font-size: 9px; letter-spacing: .25em; color: rgba(255,255,255,.06); position: relative; font-family: var(--mono); }

  .img-placeholder {
    width: 100%; height: 100%;
    background: #08090e;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .img-placeholder::before {
    content: ''; position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(255,255,255,.02) 47px, rgba(255,255,255,.02) 48px),
      repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,.02) 47px, rgba(255,255,255,.02) 48px);
  }

  /*
   * Subtle vignette rim around the letterbox/pillarbox area so the
   * panel bg doesn't look like a hard black box — it feathers into
   * the media edge. Applied to .media-fill itself.
   */
  .media-fill::after {
    content: '';
    position: absolute; inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 60px rgba(0,0,0,.55);
    z-index: 1;
  }

  .audio-fill {
    width: 100%; height: 100%;
    background: radial-gradient(ellipse at 50% 60%, #0c0820 0%, #050810 60%, #020408 100%);
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .audio-fill canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .audio-center { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .audio-center span { font-size: 9px; letter-spacing: .25em; color: rgba(192,132,252,.45); font-family: var(--mono); }

  /* ── Center play button ── */
  .center-play {
    position: absolute;
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 68px; height: 68px; border-radius: 50%;
    background: rgba(0,0,0,.45);
    border: 2px solid rgba(255,255,255,.25);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    backdrop-filter: blur(10px);
    transition: transform .2s, background .2s, opacity .3s;
    pointer-events: auto;
    z-index: 5;
  }
  .center-play:hover { transform: translate(-50%,-50%) scale(1.08); background: rgba(0,0,0,.6); }
  .center-play.hidden { opacity: 0; pointer-events: none; }

  /* ── Overlays wrapper ── */
  .overlays {
    position: absolute; inset: 0; z-index: 10;
    pointer-events: none;
    transition: opacity .4s ease;
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
    position: absolute; bottom: 0; left: 0; right: 0; height: 340px;
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
    backdrop-filter: blur(8px); font-family: var(--mono);
  }
  .badge-video  { background: rgba(0,229,255,.12); color: var(--accent);  border: 1px solid rgba(0,229,255,.2); }
  .badge-image  { background: rgba(255,107,53,.12); color: var(--accent2); border: 1px solid rgba(255,107,53,.2); }
  .badge-audio  { background: rgba(192,132,252,.12); color: var(--purple); border: 1px solid rgba(192,132,252,.2); }

  .asset-name {
    font-family: var(--sans); font-size: 16px; font-weight: 800; color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15;
    text-shadow: 0 1px 12px rgba(0,0,0,.8);
  }
  .asset-path { font-size: 9px; color: var(--muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--mono); }

  .hdr-right { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .icon-btn {
    width: 30px; height: 30px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(0,0,0,.38);
    color: rgba(255,255,255,.72);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all .15s;
    backdrop-filter: blur(12px);
  }
  .icon-btn:hover { background: rgba(255,255,255,.16); color: #fff; }
  .icon-btn.close-btn { border-radius: 50%; }

  /* ── Bottom stack ── */
  .bottom-stack {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 0 16px 22px;
    display: flex; flex-direction: column; gap: 10px;
  }

  /* meta strip */
  .meta-strip { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .meta-chip { font-size: 8px; color: rgba(255,255,255,.4); letter-spacing: .06em; display: flex; align-items: center; gap: 4px; font-family: var(--mono); }
  .meta-chip strong { color: rgba(255,255,255,.76); font-weight: 500; }
  .meta-dot { width: 2px; height: 2px; border-radius: 50%; background: rgba(255,255,255,.2); }

  /* OBS row */
  .obs-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .obs-label { font-size: 8px; color: var(--muted); letter-spacing: .12em; font-family: var(--mono); }
  .pill-static {
    font-size: 8px; padding: 4px 10px; border-radius: 100px;
    border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.35); color: rgba(255,255,255,.4);
    font-family: var(--mono);
  }
  .pill-select {
    font-family: var(--mono); font-size: 8px; padding: 4px 10px;
    border-radius: 100px; border: 1px solid rgba(255,255,255,.1);
    background: rgba(0,0,0,.4); color: rgba(255,255,255,.72);
    outline: none; cursor: pointer; -webkit-appearance: none;
    backdrop-filter: blur(8px);
  }
  .toggle-wrap { display: flex; align-items: center; gap: 5px; margin-left: auto; }
  .toggle-label { font-size: 8px; color: var(--muted); letter-spacing: .05em; font-family: var(--mono); }
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
  .toggle.on::after  { background: var(--accent); transform: translateX(13px); box-shadow: 0 0 6px rgba(0,229,255,.5); }
  .toggle.off::after { background: rgba(255,255,255,.35); }

  /* scrubber */
  .scrub-area { display: flex; flex-direction: column; gap: 5px; }
  .time-row { display: flex; justify-content: space-between; font-size: 9px; color: var(--muted); letter-spacing: .05em; font-family: var(--mono); }
  .scrubber {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 3px; border-radius: 2px; outline: none; cursor: pointer;
    transition: height .15s;
  }
  .scrubber:hover { height: 5px; }
  .scrubber::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 10px rgba(0,229,255,.7); cursor: pointer;
    transition: transform .15s;
  }
  .scrubber:hover::-webkit-slider-thumb { transform: scale(1.2); }

  /* controls */
  .ctrl-row { display: flex; align-items: center; gap: 7px; }
  .ctrl-btn {
    width: 34px; height: 34px; border-radius: 9px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(0,0,0,.4); color: rgba(255,255,255,.8);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all .15s; flex-shrink: 0;
    backdrop-filter: blur(10px);
  }
  .ctrl-btn:hover { background: rgba(255,255,255,.16); color: #fff; }
  .ctrl-btn.play-btn {
    width: 42px; height: 42px; border-radius: 50%;
    background: var(--accent); border-color: var(--accent); color: #000;
    box-shadow: 0 0 24px rgba(0,229,255,.5);
  }
  .ctrl-btn.play-btn:hover { transform: scale(1.08); }
  .vol-wrap { display: flex; align-items: center; gap: 6px; flex: 1; }
  .vol-slider {
    -webkit-appearance: none; width: 60px; height: 3px; border-radius: 2px;
    background: rgba(255,255,255,.18); outline: none; cursor: pointer;
  }
  .vol-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,.8); cursor: pointer; }
  .orient-btn {
    font-size: 8px; padding: 4px 10px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.4);
    color: var(--muted); cursor: pointer; letter-spacing: .08em;
    font-family: var(--mono); transition: all .2s; backdrop-filter: blur(10px);
  }
  .orient-btn:hover { color: #fff; border-color: rgba(255,255,255,.22); }

  /* action pills */
  .action-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .a-btn {
    font-family: var(--mono); font-size: 8px; letter-spacing: .07em;
    padding: 5px 11px; border-radius: 100px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(0,0,0,.45); color: rgba(255,255,255,.6);
    cursor: pointer; display: flex; align-items: center; gap: 4px;
    transition: all .15s; white-space: nowrap; backdrop-filter: blur(10px);
  }
  .a-btn:hover { color: #fff; border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.08); }
  .a-btn.primary { color: var(--accent); border-color: rgba(0,229,255,.25); background: rgba(0,229,255,.07); }
  .a-btn.primary:hover { background: rgba(0,229,255,.15); }
  .a-btn.danger { color: #f87171; border-color: rgba(248,113,113,.2); }
  .a-btn.danger:hover { background: rgba(248,113,113,.1); }
`;

// ── HTML template ─────────────────────────────────────────────────────────────
const TEMPLATE = `
  <style>${CSS}</style>
  <div class="panel" part="panel">

    <div class="media-fill" part="media"></div>

    <div class="center-play hidden" part="center-play">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="white">
        <polygon points="7,3 19,11 7,19"/>
      </svg>
    </div>

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
          <div class="icon-btn" data-action="prev" title="Previous">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6,1 2.5,4.5 6,8"/></svg>
          </div>
          <div class="icon-btn" data-action="next" title="Next">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,1 6.5,4.5 3,8"/></svg>
          </div>
          <div class="icon-btn close-btn" data-action="close" title="Close">
            <svg width="9" height="9" viewBox="0 0 9 9" stroke="currentColor" stroke-width="1.5"><line x1="1.5" y1="1.5" x2="7.5" y2="7.5"/><line x1="7.5" y1="1.5" x2="1.5" y2="7.5"/></svg>
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
            <div class="toggle on" part="exclusive-toggle"></div>
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
            <input type="range" class="vol-slider" min="0" max="100" value="80">
          </div>
          <span style="flex:1"></span>
          <button class="orient-btn" part="orient-btn">⤢ ROT</button>
        </div>

        <div class="action-row" part="action-row">
          <button class="a-btn primary" data-action="stream">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5,5.5 L6,2M4.5,2h3v3"/><path d="M3.5,3.5H1.5V8H6.5V6"/></svg>
            Stream URL
          </button>
          <button class="a-btn" data-action="obs">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="1" width="4.5" height="4.5" rx="1"/><path d="M3.5,3.5h5v5h-5z"/></svg>
            OBS
          </button>
          <button class="a-btn" data-action="export">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4.5 1v5.5M2.5 4.5 4.5 7 6.5 4.5"/><path d="M1 8.5h7"/></svg>
            Export
          </button>
          <button class="a-btn" data-action="tag" style="margin-left:auto">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="4.5" cy="4.5" r="3.5"/><line x1="3" y1="3" x2="6" y2="6"/><line x1="6" y1="3" x2="3" y2="6"/></svg>
            Tag
          </button>
          <button class="a-btn danger" data-action="delete">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.3"><polyline points="1,2.5 8,2.5"/><path d="M3.5,1h2M2,2.5l.4,5.5h4.2L7,2.5"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
`;

// ── Component class ───────────────────────────────────────────────────────────
export class AssetPreview extends HTMLElement {

  // Observed attributes drive the element imperatively from explorer.html
  static get observedAttributes() {
    return ['landscape', 'hidden'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = TEMPLATE;

    // internal state
    this._asset       = null;
    this._playing     = false;
    this._progress    = 0;       // 0–1000
    this._raf         = null;
    this._waveRaf     = null;
    this._hideTimer   = null;
    this._moveTimer   = null;
    this._overlayOn   = true;

    this._bindEvents();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Load an asset into the preview.
   * @param {Object} asset
   * @param {string} asset.name       — filename
   * @param {string} asset.path       — relative path
   * @param {'video'|'image'|'audio'} asset.kind
   * @param {string} [asset.src]      — URL for real media (optional)
   * @param {number|null} asset.duration — seconds; null for images
   * @param {Array<[string,string]>} asset.quick — [[label, value], …] chips
   * @param {Object} [asset.obs]      — { cover, slot, exclusive }
   */
  load(asset) {
    this._asset    = asset;
    this._playing  = false;
    this._progress = 0;
    this._stopProgress();
    this._stopWaveform();
    this._renderHeader();
    this._renderMeta();
    this._renderMedia();
    this._renderObs();
    this._updateControls();
    this._updateScrubber();
    this._showOverlay();
  }

  open()  { this.removeAttribute('hidden'); this._showOverlay(); }
  close() { this.setAttribute('hidden', ''); this._dispatch('preview-close'); }

  // ── Attribute changes ───────────────────────────────────────────────────────

  attributeChangedCallback(name) {
    if (name === 'landscape') this._updateOrientation();
  }

  // ── Internal wiring ─────────────────────────────────────────────────────────

  _$ (sel) { return this._shadow.querySelector(sel); }
  _$$ (sel) { return this._shadow.querySelectorAll(sel); }

  _dispatch(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  _bindEvents() {
    const panel = this._$('.panel');

    // Panel tap — toggle overlay (skip if target is interactive)
    panel.addEventListener('click', e => {
      if (e.target.closest('.interactive')) return;
      this._overlayOn ? this._hideOverlay() : this._showOverlay();
    });

    // Mouse move: show overlay, auto-hide while playing
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

    // Center play button
    this._$('.center-play').addEventListener('click', e => { e.stopPropagation(); this._togglePlay(); });

    // Header action buttons (prev, next, close)
    this._shadow.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      if      (action === 'close')  this.close();
      else if (action === 'prev')   this._dispatch('preview-prev');
      else if (action === 'next')   this._dispatch('preview-next');
      else if (action === 'stream') this._copyStream();
      else this._dispatch('preview-action', { action, asset: this._asset });
    });

    // Play button (bottom bar)
    this._$('[part="play-btn"]').addEventListener('click', e => { e.stopPropagation(); this._togglePlay(); });

    // Skip buttons
    this._$('[part="skip-back"]').addEventListener('click', e => { e.stopPropagation(); this._skip(-10); });
    this._$('[part="skip-fwd"]') .addEventListener('click', e => { e.stopPropagation(); this._skip(10);  });

    // Scrubber
    this._$('[part="scrubber"]').addEventListener('input', e => {
      this._progress = parseInt(e.target.value);
      this._updateScrubber();
      this._updateTimeDisplay();
    });
    this._$('[part="scrubber"]').addEventListener('click', e => e.stopPropagation());

    // Orient
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

  // ── Overlay ─────────────────────────────────────────────────────────────────

  _showOverlay() {
    clearTimeout(this._hideTimer);
    const ov = this._$('.overlays');
    ov.classList.replace('hidden', 'visible') || ov.classList.add('visible');
    this._overlayOn = true;
    if (this._playing) this._hideTimer = setTimeout(() => this._hideOverlay(), 3000);
  }

  _hideOverlay() {
    const ov = this._$('.overlays');
    ov.classList.replace('visible', 'hidden') || ov.classList.add('hidden');
    this._overlayOn = false;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  _renderHeader() {
    const a = this._asset;
    const badge = this._$('[part="badge"]');
    const icons = { video: '▶', image: '◼', audio: '♪' };
    badge.className = `kind-badge badge-${a.kind}`;
    badge.textContent = `${icons[a.kind]} ${a.kind.toUpperCase()}`;
    this._$('[part="asset-name"]').textContent = a.name;
    this._$('[part="asset-path"]').textContent = a.path;
  }

  _renderMeta() {
    const strip = this._$('[part="meta-strip"]');
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

  _renderObs() {
    const a = this._asset;
    const obsRow = this._$('[part="obs-row"]');
    obsRow.style.display = a.kind === 'audio' ? 'none' : '';
    if (a.obs) {
      const cs = this._$('[part="obs-cover"]');
      const ss = this._$('[part="obs-slot"]');
      if (cs) cs.value = a.obs.cover || 'Cover';
      if (ss) ss.value = a.obs.slot  || 'Slot 1';
      const tog = this._$('[part="exclusive-toggle"]');
      if (tog) {
        tog.classList.toggle('on',  !!a.obs.exclusive);
        tog.classList.toggle('off', !a.obs.exclusive);
      }
    }
  }

  _renderMedia() {
    const fill = this._$('[part="media"]');
    fill.innerHTML = '';
    const { kind, src } = this._asset;

    if (kind === 'video') {
      if (src) {
        const v = document.createElement('video');
        v.src = src; v.loop = false; v.playsInline = true; v.muted = false;
        fill.appendChild(v);
        this._videoEl = v;
      } else {
        fill.innerHTML = `
          <div class="vid-placeholder">
            <div class="vid-scan"></div>
            <span class="vid-label">VIDEO STREAM</span>
          </div>`;
        this._videoEl = null;
      }

    } else if (kind === 'image') {
      if (src) {
        const img = document.createElement('img');
        img.src = src; img.alt = this._asset.name;
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
      // Reset Web Audio state for this load
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

      if (this._asset.src) {
        const audio = new Audio();
        audio.src = this._asset.src;
        audio.preload = 'metadata';
        // crossOrigin required for Web Audio API to read samples across origins
        audio.crossOrigin = 'anonymous';
        this._audioEl = audio;

        // Keep scrubber in sync with real playhead
        audio.addEventListener('timeupdate', () => {
          if (!this._playing) return;
          const dur = audio.duration || this._asset.duration || 1;
          this._progress = (audio.currentTime / dur) * 1000;
          this._updateScrubber();
          this._updateTimeDisplay();
        });
        audio.addEventListener('ended', () => {
          this._playing = false;
          this._progress = 0;
          this._updatePlayIcons();
          this._updateScrubber();
          this._showOverlay();
        });
      }

      requestAnimationFrame(() => this._startWaveform());
    }
  }

  _updateControls() {
    const a = this._asset;
    const hasScrub = a.kind === 'video' || a.kind === 'audio';
    this._$('[part="scrub-area"]').style.display  = hasScrub ? 'flex'  : 'none';
    this._$('[part="skip-back"]').style.display   = hasScrub ? ''      : 'none';
    this._$('[part="skip-fwd"]') .style.display   = hasScrub ? ''      : 'none';
    this._$('[part="play-btn"]') .style.display   = hasScrub ? ''      : 'none';
    this._$('[part="vol-wrap"]') .style.display   = hasScrub ? 'flex'  : 'none';
    this._$('.center-play').classList.toggle('hidden', !hasScrub);
    if (hasScrub) this._updateTimeDisplay();
  }

  _updateOrientation() {
    // panel resizes via :host([landscape]) CSS — nothing extra needed
  }

  // ── Playback ─────────────────────────────────────────────────────────────────

  _togglePlay() {
    if (!this._asset) return;
    this._playing = !this._playing;
    this._updatePlayIcons();

    if (this._asset.kind === 'audio' && this._audioEl) {
      // ── Real audio playback via <audio> + Web Audio API ──────────────────
      if (this._playing) {
        // First play: set up AudioContext and AnalyserNode.
        // Must happen inside a user-gesture handler (this click qualifies).
        if (!this._audioCtx) {
          this._setupAudioContext();
        }
        // Resume suspended context (browser autoplay policy)
        if (this._audioCtx.state === 'suspended') {
          this._audioCtx.resume();
        }
        this._audioEl.play().catch(() => {
          // Autoplay blocked — flip back
          this._playing = false;
          this._updatePlayIcons();
        });
        this._hideTimer = setTimeout(() => this._hideOverlay(), 2500);
      } else {
        this._audioEl.pause();
        this._showOverlay();
      }
      // Scrubber is driven by 'timeupdate' events, no rAF loop needed for audio

    } else {
      // ── Simulated progress for video placeholders / no-src assets ─────────
      if (this._playing) {
        this._startProgress();
        this._hideTimer = setTimeout(() => this._hideOverlay(), 2500);
      } else {
        this._stopProgress();
        this._showOverlay();
      }
    }
  }

  // Bootstrap Web Audio context + analyser on first user play gesture
  _setupAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !this._audioEl) return;

    this._audioCtx = new AudioCtx();

    // AnalyserNode: FFT size 256 gives 128 frequency bins — enough for
    // a 70-bar waveform without over-sampling on mobile
    const analyser = this._audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78; // smooths frame-to-frame jumps

    const source = this._audioCtx.createMediaElementSource(this._audioEl);
    source.connect(analyser);
    analyser.connect(this._audioCtx.destination); // so we still hear it

    this._analyser = analyser;
  }

  _updatePlayIcons() {
    const pause = '<rect x="3" y="2" width="3" height="10"/><rect x="8" y="2" width="3" height="10"/>';
    const play  = '<polygon points="4,2 12,7 4,12"/>';
    this._$('[part="play-icon"]').innerHTML = this._playing ? pause : play;

    const cp = this._$('.center-play');
    cp.querySelector('svg').innerHTML = this._playing
      ? '<rect x="6" y="4" width="4" height="14"/><rect x="12" y="4" width="4" height="14"/>'
      : '<polygon points="7,3 19,11 7,19"/>';
  }

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

  _skip(sec) {
    if (this._audioEl) {
      // Seek the real audio element; timeupdate will sync the scrubber
      const dur = this._audioEl.duration || this._asset?.duration || 1;
      this._audioEl.currentTime = Math.max(0, Math.min(dur, this._audioEl.currentTime + sec));
    } else {
      const dur = this._asset?.duration || 1;
      this._progress = Math.max(0, Math.min(1000, this._progress + (sec / dur) * 1000));
      this._updateScrubber();
      this._updateTimeDisplay();
    }
  }

  _updateScrubber() {
    const s = this._$('[part="scrubber"]');
    if (!s) return;
    s.value = this._progress;
    const pct = this._progress / 10;
    s.style.background = `linear-gradient(to right, #00e5ff ${pct}%, rgba(255,255,255,.15) ${pct}%)`;
  }

  _updateTimeDisplay() {
    const dur = this._asset?.duration || 0;
    const cur = (this._progress / 1000) * dur;
    this._$('[part="time-current"]').textContent = this._fmtTime(cur, dur);
    this._$('[part="time-total"]')  .textContent = this._fmtTime(dur, dur);
  }

  _fmtTime(s, dur) {
    if (dur < 10) {
      const ms = (s % 1).toFixed(3).slice(2);
      return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${ms}`;
    }
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  // ── Waveform ──────────────────────────────────────────────────────────────────
  //
  // Two rendering modes, seamlessly blended:
  //
  //   IDLE  — smooth sine-based animation, always running when the audio panel
  //            is visible. Looks alive even when nothing is playing.
  //
  //   LIVE  — when this._analyser exists and audio is playing, FFT frequency
  //            data from the AnalyserNode replaces the sine values bar-by-bar.
  //            We lerp between idle and live so the transition is gradual
  //            rather than snapping.
  //
  // The canvas auto-resizes via ResizeObserver so it works at any panel size.

  _startWaveform() {
    const c = this._$('[part="wave-canvas"]');
    if (!c) return;
    const ctx2d = c.getContext('2d');

    // Size canvas to its CSS display size (device-pixel-ratio aware)
    const resize = () => {
      if (!c.isConnected) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width  = rect.width  * dpr;
      c.height = rect.height * dpr;
      ctx2d.scale(dpr, dpr);
      // store CSS size for drawing math
      c._cssW = rect.width;
      c._cssH = rect.height;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    resize();

    const BARS = 70;
    // Reusable Uint8Array — allocated once, reused every frame
    let freqData = null;

    // Lerp factor for idle <-> live crossfade (0 = fully idle, 1 = fully live)
    let liveBlend = 0;
    let t = 0; // idle animation clock

    const draw = () => {
      if (!c.isConnected) { ro.disconnect(); return; }

      const W = c._cssW || c.width;
      const H = c._cssH || c.height;
      ctx2d.clearRect(0, 0, W, H);
      t += 0.016;

      const bw = W / BARS;
      const isLive = !!(this._analyser && this._playing);

      // Blend toward live (1.0) when playing, back to idle (0.0) when paused.
      // Rate: ~0.06 per frame = ~4 frames to meaningfully shift at 60fps
      liveBlend += isLive ? 0.06 : -0.04;
      liveBlend  = Math.max(0, Math.min(1, liveBlend));

      // Pull FFT data when analyser is available
      if (this._analyser) {
        if (!freqData || freqData.length !== this._analyser.frequencyBinCount) {
          freqData = new Uint8Array(this._analyser.frequencyBinCount);
        }
        this._analyser.getByteFrequencyData(freqData);
      }

      for (let i = 0; i < BARS; i++) {
        // ── Idle amplitude (sine) ──────────────────────────────────────────
        const idleAmp =
          (Math.sin(i * 0.26 + t) * 0.5 + 0.5) *
          (Math.sin(i * 0.08 + t * 0.55) * 0.4 + 0.6) *
          0.75;

        // ── Live amplitude (FFT) ───────────────────────────────────────────
        // Map bar index into the frequency array. We use the lower 2/3 of
        // bins (those cover ~0-8kHz at 44.1kHz sr) for musical content.
        let liveAmp = 0;
        if (freqData) {
          const binCount   = freqData.length;
          const usableBins = Math.floor(binCount * 0.67);
          const binIdx     = Math.floor((i / BARS) * usableBins);
          liveAmp = freqData[binIdx] / 255; // normalise 0-255 -> 0-1
          // Emphasise low-mid frequencies for visual punch
          liveAmp = Math.pow(liveAmp, 0.7);
        }

        // ── Crossfade ──────────────────────────────────────────────────────
        const amp = idleAmp * (1 - liveBlend) + liveAmp * liveBlend;

        const bh = amp * H * 0.78;
        const y  = (H - bh) / 2;
        const al = 0.18 + amp * 0.82;

        // Purple when idle, shift toward cyan-purple when live
        const r = Math.round(192 - liveBlend * 120); // 192 -> 72
        const g = Math.round(132 - liveBlend * 90);  // 132 -> 42
        const b = 252;
        ctx2d.fillStyle = `rgba(${r},${g},${b},${al})`;
        ctx2d.beginPath();
        ctx2d.roundRect(i * bw + 2, y, bw - 4, Math.max(2, bh), 2);
        ctx2d.fill();
      }

      this._waveRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  _stopWaveform() {
    cancelAnimationFrame(this._waveRaf);
    this._waveRaf = null;
    // Close the AudioContext to release system audio resources
    if (this._audioCtx) {
      this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
      this._analyser  = null;
    }
    if (this._audioEl) {
      this._audioEl.pause();
      this._audioEl.src = '';
      this._audioEl = null;
    }
  }

  // ── Misc ──────────────────────────────────────────────────────────────────────

  _copyStream() {
    const url = `/media/${this._asset.path}?source=primary`;
    navigator.clipboard?.writeText(url);
    this._dispatch('preview-action', { action: 'stream', url, asset: this._asset });
  }

  disconnectedCallback() {
    this._stopProgress();
    this._stopWaveform();
    clearTimeout(this._hideTimer);
    clearTimeout(this._moveTimer);
  }
}

customElements.define('asset-preview', AssetPreview);