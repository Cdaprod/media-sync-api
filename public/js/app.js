import { state, ui } from './state.js';

// -------------------------
// Config / state
// -------------------------
const API = ''; // same-origin; keep '' for container-served index.html
const el = (id) => document.getElementById(id);

const thumbCache = new Map();
let thumbObserver = null;

// -------------------------
// Utils
// -------------------------
function toast(type, title, message){
  const t = document.createElement('div');
  t.className = `toast ${type || ''}`;
  t.innerHTML = `<div class="t">${escapeHtml(title || 'Info')}</div><div class="m">${escapeHtml(message || '')}</div>`;
  el('toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-4px)'; }, 2600);
  setTimeout(() => t.remove(), 3100);
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#039;");
}

async function copyToClipboard(text){
  if (!text) return false;
  try{
    if (navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch{
    // fall through to legacy copy
  }
  try{
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }catch{
    return false;
  }
}

function formatBytes(bytes){
  const n = Number(bytes || 0);
  if (!isFinite(n) || n <= 0) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1){ v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function toAbsoluteUrl(path){
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return new URL(path, window.location.origin).toString();
}

function guessKind(item){
  // Prefer backend-provided kind/mime if present.
  const k = (item.kind || item.type || '').toLowerCase();
  if (k) return k;
  const p = (item.relative_path || '').toLowerCase();
  if (/\.(mp4|mov|mkv|webm|m4v)$/.test(p)) return 'video';
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(p)) return 'image';
  if (/\.(mp3|wav|m4a|aac|flac)$/.test(p)) return 'audio';
  return 'document';
}

function kindBadgeClass(kind){
  if (kind === 'video') return 'kind-video';
  if (kind === 'image') return 'kind-image';
  if (kind === 'audio') return 'kind-audio';
  return 'kind-doc';
}

function isMobile(){
  return window.matchMedia('(max-width: 860px)').matches;
}

function mediaQuery(opts = {}){
  const params = new URLSearchParams();
  if (opts.source) params.set('source', opts.source);
  const tagFilter = (state.tagFilter || '').trim();
  if (tagFilter){
    params.set(state.tagMode === 'any' ? 'any_tags' : 'tags', tagFilter);
  }
  if (state.noTags) params.set('no_tags', 'true');
  const host = (state.hostFilter || '').trim();
  if (host) params.set('host', host);
  const device = (state.deviceFilter || '').trim();
  if (device) params.set('device', device);
  const app = (state.appFilter || '').trim();
  if (app) params.set('app', app);
  const dateFrom = (state.dateFrom || '').trim();
  if (dateFrom) params.set('date_from', dateFrom);
  const dateTo = (state.dateTo || '').trim();
  if (dateTo) params.set('date_to', dateTo);
  if (state.hasCaptions) params.set('has_captions', 'true');
  const query = params.toString();
  return query ? `?${query}` : '';
}

function updateBridgeMessage(message){
  state.bridgeMessage = message || '';
  const target = el('bridgeStageStatus');
  if (target) target.textContent = state.bridgeMessage;
}

function syncBridgeControls(){
  const agentOk = state.bridgeStatus?.ok ?? true;
  const scanReady = Boolean(state.bridgeTree);
  const hasSelection = state.bridgeSelection.size > 0;
  const stageBtn = el('bridgeStageBtn');
  if (stageBtn) stageBtn.disabled = !agentOk || !state.bridgeCandidate;
  const commitBtn = el('bridgeCommitBtn');
  if (commitBtn) commitBtn.disabled = !agentOk || !scanReady || !hasSelection;
  const statusEl = el('bridgeAgentStatus');
  if (statusEl){
    statusEl.textContent = agentOk ? 'Bridge ready' : 'Bridge unavailable';
    statusEl.classList.toggle('good', agentOk);
    statusEl.classList.toggle('bad', !agentOk);
  }
  const rescanBtn = el('bridgeRescanBtn');
  if (rescanBtn) rescanBtn.disabled = !state.activeLibrary;
  const deriveBtn = el('bridgeDeriveBtn');
  if (deriveBtn) deriveBtn.disabled = !state.activeLibrary;
}

function resetBridgeScan(){
  state.bridgeScanId = null;
  state.bridgeTree = null;
  state.bridgeSelection.clear();
  updateBridgeMessage('');
  renderBridgeScan();
}

function flattenStageTree(tree){
  const output = [];
  function walk(node, depth){
    if (!node || typeof node !== 'object') return;
    output.push({ ...node, depth });
    for (const child of node.children || []){
      walk(child, depth + 1);
    }
  }
  walk(tree, 0);
  return output;
}

function renderBridgeScan(){
  const container = el('bridgeStageTree');
  if (!container) return;
  container.innerHTML = '';
  if (!state.bridgeTree){
    container.innerHTML = `<div class="small">Run a stage scan to preview folders before committing.</div>`;
    syncBridgeControls();
    return;
  }
  const nodes = flattenStageTree(state.bridgeTree);
  for (const node of nodes){
    const path = node.path || '.';
    const title = path === '.' ? 'Root' : path.split('/').pop();
    const depth = node.depth || 0;
    const count = node.descendant_media_count ?? 0;
    const kinds = Array.isArray(node.media_kinds) ? node.media_kinds.join(', ') : '';
    const suggested = node.suggested ? 'suggested' : '';
    const row = document.createElement('label');
    row.className = `stage-item ${suggested}`.trim();
    row.style.marginLeft = `${Math.min(depth, 6) * 12}px`;
    row.innerHTML = `
      <input type="checkbox" ${state.bridgeSelection.has(path) ? 'checked' : ''} />
      <div>
        <div><strong>${escapeHtml(title || path)}</strong> <span class="stage-path">${escapeHtml(path)}</span></div>
        <div class="small">files: ${escapeHtml(count)}${kinds ? ` • ${escapeHtml(kinds)}` : ''}</div>
      </div>
    `;
    row.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) state.bridgeSelection.add(path);
      else state.bridgeSelection.delete(path);
      syncBridgeControls();
    });
    container.appendChild(row);
  }
  syncBridgeControls();
}

function updateTopCounts(){
  el('projCount').textContent = `${state.projects.length} total`;
  const activeProject = state.activeProject?.name;
  const activeLibrary = state.activeLibrary?.name;
  const activeBucket = state.activeBucket?.title || state.activeBucket?.bucket_rel_root;
  let label = 'no selection';
  if (activeProject){
    label = activeProject;
  }else if (activeLibrary && activeBucket){
    label = `${activeLibrary} / ${activeBucket}`;
  }else if (activeLibrary){
    label = `${activeLibrary} (buckets)`;
  }
  el('activePath').textContent = label;
  if (activeProject){
    el('contentTitle').textContent = `Media — ${activeProject}`;
  }else if (activeLibrary && activeBucket){
    el('contentTitle').textContent = `Library — ${activeBucket}`;
  }else if (activeLibrary){
    el('contentTitle').textContent = `Library — ${activeLibrary}`;
  }else{
    el('contentTitle').textContent = 'Media';
  }
  el('mediaCount').textContent = `${filteredMedia().length} items`;
}

function filteredMedia(){
  const q = state.q.trim().toLowerCase();
  if (!q) return state.media.slice();
  return state.media.filter(it => (it.relative_path || it.rel_path || '').toLowerCase().includes(q));
}

function groupMedia(items){
  if (state.groupBy === 'none') return [{ label: '', items }];
  const groups = new Map();
  for (const item of items){
    const key = groupKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups.entries()).map(([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}

function groupKey(item){
  if (state.groupBy === 'day'){
    return item.date || 'Unknown day';
  }
  if (state.groupBy === 'device'){
    return item.device_id || 'Unknown device';
  }
  if (state.groupBy === 'session'){
    return item.session_id || 'Unassigned session';
  }
  return '';
}

function assetIdFor(item){
  return item?.asset_id || null;
}

function getTagsForItem(item){
  if (Array.isArray(item?.tags)) return item.tags;
  const key = assetIdFor(item);
  return key && state.tagMap[key] ? state.tagMap[key] : [];
}

function tagPillHtml(tag){
  const meta = state.tagMeta?.[tag];
  const color = meta?.color;
  const style = color ? ` style="background:${escapeHtml(color)}33;border-color:${escapeHtml(color)};"` : '';
  const dataColor = color ? ` data-color="${escapeHtml(color)}"` : '';
  return `<span class="tagpill"${dataColor}${style}>${escapeHtml(tag)}</span>`;
}

function renderTagPills(tags, max = 3){
  if (!tags || !tags.length) return '';
  const visible = tags.slice(0, max);
  const hidden = tags.length - visible.length;
  const pills = visible.map(tagPillHtml).join('');
  const more = hidden > 0 ? `<span class="tagpill">+${hidden}</span>` : '';
  return pills + more;
}

function hydrateTagMapFromMedia(){
  const map = {};
  for (const item of state.media){
    const key = assetIdFor(item);
    if (key && Array.isArray(item.tags)){
      map[key] = item.tags;
    }
  }
  state.tagMap = map;
}

function updateSelectionUI(){
  const count = state.selected.size;
  el('selCount').textContent = String(count);
  const show = count > 0;
  el('selectBar').classList.toggle('show', show);

  // enable/disable action buttons
  el('sendResolveBtn').disabled = !show || !state.activeProject;
  el('tagSelBtn').disabled = !show;
  el('clearSelBtn').disabled = !show;
  el('selResolveBtn').disabled = !show || !state.activeProject;

  // drawer select button label
  if (state.focused){
    const isSel = state.selected.has(state.focused.asset_id);
    el('drawerToggleSelect').textContent = isSel ? '− Deselect' : '＋ Select';
    el('drawerToggleSelect').classList.toggle('primary', !isSel);
  }
}

function updateTagFilterUI(){
  const modeBtn = el('tagModeBtn');
  const noTagsBtn = el('noTagsBtn');
  const toggle = el('filterToggle');
  const panel = el('searchPanel');
  if (modeBtn){
    modeBtn.textContent = state.tagMode === 'any' ? 'Any tags' : 'All tags';
    modeBtn.classList.toggle('active', state.tagMode === 'any');
  }
  if (noTagsBtn){
    noTagsBtn.classList.toggle('active', state.noTags);
  }
  if (toggle && panel){
    toggle.classList.toggle('active', ui.filtersOpen);
    toggle.setAttribute('aria-expanded', ui.filtersOpen ? 'true' : 'false');
    panel.classList.toggle('open', ui.filtersOpen);
  }
}

const sidebarSectionStorageKey = 'mediaSyncExplorer.sidebarSections';

function readSidebarSectionState(){
  if (!window.localStorage) return {};
  try{
    const raw = window.localStorage.getItem(sidebarSectionStorageKey);
    return raw ? JSON.parse(raw) : {};
  }catch{
    return {};
  }
}

function writeSidebarSectionState(state){
  if (!window.localStorage) return;
  try{
    window.localStorage.setItem(sidebarSectionStorageKey, JSON.stringify(state));
  }catch{
    // ignore storage errors
  }
}

function applySidebarSectionState(section, collapsed, body, toggle){
  if (!body || !toggle) return;
  body.classList.toggle('collapsed', collapsed);
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.textContent = collapsed ? '＋' : '−';
}

function initSidebarSections(){
  const saved = readSidebarSectionState();
  const toggles = document.querySelectorAll('[data-section-toggle]');
  toggles.forEach((toggle) => {
    const section = toggle.dataset.sectionToggle;
    const body = document.querySelector(`.section-body[data-section="${section}"]`);
    const collapsed = Boolean(saved[section]);
    applySidebarSectionState(section, collapsed, body, toggle);
    toggle.addEventListener('click', () => {
      const next = !body?.classList.contains('collapsed');
      applySidebarSectionState(section, next, body, toggle);
      saved[section] = next;
      writeSidebarSectionState(saved);
    });
  });
}

function setSidebarOpen(open){
  const sb = el('sidebar');
  if (!sb) return;
  const drawerMode = sb.classList.contains('sidebar-drawer');
  if (!drawerMode){
    sb.style.pointerEvents = 'auto';
    ui.sidebarOpen = false;
    el('sidebarBackdrop')?.classList.remove('show');
    return;
  }
  ui.sidebarOpen = open;
  sb.classList.toggle('is-open', open);
  el('sidebarBackdrop')?.classList.toggle('show', open);
}

function setInspectorOpen(open){
  const d = el('drawer');
  if (!d) return;
  ui.inspectorOpen = open;
  if (open){
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
  }else{
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
  }
  el('drawerBackdrop')?.classList.toggle('show', open);
}

function setActionsOpen(open){
  const actions = el('actionButtons');
  if (!actions) return;
  ui.actionsOpen = open;
  actions.classList.toggle('open', open);
}

function syncSidebarMode(){
  const sb = el('sidebar');
  if (!sb) return;
  const mobile = isMobile();
  sb.classList.toggle('sidebar-drawer', mobile);
  if (!mobile){
    sb.classList.remove('is-open');
    el('sidebarBackdrop')?.classList.remove('show');
    ui.sidebarOpen = false;
    sb.style.transform = '';
    sb.style.pointerEvents = 'auto';
    setActionsOpen(false);
  }else{
    setSidebarOpen(false);
    setActionsOpen(false);
  }
}

function setView(view){
  state.view = view;
  el('viewGrid').classList.toggle('active', view === 'grid');
  el('viewList').classList.toggle('active', view === 'list');
  el('mediaGrid').style.display = (view === 'grid') ? '' : 'none';
  el('mediaList').style.display = (view === 'list') ? '' : 'none';
  renderMedia();
}

function ensureThumbObserver(){
  if (thumbObserver) return thumbObserver;
  thumbObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      thumbObserver.unobserve(entry.target);
      const assetId = entry.target.dataset.assetId;
      const url = entry.target.dataset.url;
      const duration = Number(entry.target.dataset.duration) || 0;
      const itemKind = entry.target.dataset.kind;
      if (itemKind !== 'video') return;
      requestIdle(() => generateThumb(assetId, url, duration, entry.target));
    });
  }, { root: el('mediaScroll'), rootMargin: '200px 0px', threshold: 0.1 });
  return thumbObserver;
}

function requestIdle(fn){
  if (window.requestIdleCallback){
    window.requestIdleCallback(fn, { timeout: 1200 });
  }else{
    setTimeout(fn, 150);
  }
}

function setThumbImage(target, dataUrl){
  if (!target) return;
  target.innerHTML = `<img src="${escapeHtml(dataUrl)}" alt="Video thumbnail" loading="lazy" />`;
}

async function generateThumb(assetId, url, durationHint, target){
  if (!url || !assetId) return;
  if (thumbCache.has(assetId)){
    setThumbImage(target, thumbCache.get(assetId));
    return;
  }
  try{
    const data = await extractVideoFrame(url, durationHint);
    thumbCache.set(assetId, data);
    setThumbImage(target, data);
  }catch{
    if (target){
      target.innerHTML = '<div class="fallback">VIDEO</div>';
    }
  }
}

function extractVideoFrame(url, durationHint){
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = url;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('thumb-timeout'));
    }, 6000);

    function cleanup(){
      clearTimeout(timeout);
      video.src = '';
    }

    function capture(){
      try{
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.82);
        cleanup();
        resolve(data);
      }catch(err){
        cleanup();
        reject(err);
      }
    }

    video.addEventListener('loadedmetadata', () => {
      const targetTime = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(video.duration * 0.5, video.duration - 0.1)
        : (durationHint || 1.0);
      video.currentTime = Math.max(0.5, targetTime);
    }, { once:true });

    video.addEventListener('seeked', capture, { once:true });
    video.addEventListener('error', () => { cleanup(); reject(new Error('thumb-error')); }, { once:true });
  });
}

// -------------------------
// Fetchers
// -------------------------
async function loadSources(){
  try{
    const r = await fetch(`${API}/api/sources`);
    if (!r.ok) throw new Error('Failed to list sources');
    state.sources = await r.json();
    state.libraries = state.sources.filter(s => s.mode === 'library' && s.enabled);
    if (state.activeLibrary && !state.libraries.find(s => s.name === state.activeLibrary.name)){
      state.activeLibrary = null;
      state.activeBucket = null;
      state.buckets = [];
      resetBridgeScan();
    }
    renderSources();
    renderLibraries();
    renderBuckets();
    renderBridgeScan();
    syncBridgeControls();
  }catch(e){
    toast('bad','Sources', e.message);
  }
}

async function loadProjects(){
  try{
    const r = await fetch(`${API}/api/projects`);
    if (!r.ok) throw new Error('Failed to list projects');
    state.projects = await r.json();
    renderProjects();
    updateTopCounts();
  }catch(e){
    toast('bad','Projects', e.message);
  }
}

async function loadBuckets(){
  if (!state.activeLibrary){
    state.buckets = [];
    renderBuckets();
    return;
  }
  try{
    const r = await fetch(`${API}/api/sources/${encodeURIComponent(state.activeLibrary.name)}/buckets`);
    if (!r.ok) throw new Error('Failed to list buckets');
    const payload = await r.json();
    state.buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
    if (payload.instructions){
      updateBridgeMessage(payload.instructions);
    }
    if (state.activeBucket && !state.buckets.find(b => b.bucket_id === state.activeBucket.bucket_id)){
      state.activeBucket = null;
    }
    renderBuckets();
  }catch(e){
    toast('bad','Buckets', e.message);
  }
}

async function discoverBuckets(){
  if (!state.activeLibrary){
    toast('warn','Buckets','Select a library first');
    return;
  }
  try{
    const r = await fetch(`${API}/api/sources/${encodeURIComponent(state.activeLibrary.name)}/discover-buckets`, { method:'POST' });
    if (!r.ok) throw new Error('Bucket discovery failed');
    const payload = await r.json();
    state.buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
    state.activeBucket = null;
    renderBuckets();
    toast('good','Buckets', `Discovered ${payload.count || state.buckets.length} buckets`);
  }catch(e){
    toast('bad','Buckets', e.message);
  }
}

async function loadBridgeStatus(){
  try{
    const res = await fetch(`${API}/api/bridge/status`);
    if (!res.ok) throw new Error('Bridge status unavailable');
    state.bridgeStatus = await res.json();
    syncBridgeControls();
  }catch(e){
    state.bridgeStatus = { ok: false, detail: e.message };
    syncBridgeControls();
  }
}

async function loadBridgeCandidates(){
  try{
    const res = await fetch(`${API}/api/bridge/candidates`);
    if (!res.ok) throw new Error('Bridge candidates unavailable');
    const payload = await res.json();
    state.bridgeCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    renderBridgeCandidates();
  }catch(e){
    updateBridgeMessage(`Failed to load candidates: ${e.message}`);
  }
}

function renderBridgeCandidates(){
  const select = el('bridgeCandidate');
  if (!select) return;
  select.innerHTML = '<option value="">Select a junction…</option>';
  for (const candidate of state.bridgeCandidates){
    const option = document.createElement('option');
    option.value = candidate.name;
    option.textContent = candidate.name;
    select.appendChild(option);
  }
  if (state.bridgeCandidate){
    select.value = state.bridgeCandidate;
  }
}

async function runBridgeScan(){
  const junctionName = (el('bridgeCandidate').value || '').trim();
  state.bridgeCandidate = junctionName;
  if (!junctionName){
    updateBridgeMessage('Select a junction first.');
    return;
  }
  updateBridgeMessage('Scanning…');
  try{
    const scanRes = await fetch(`${API}/api/bridge/stage-scan`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ junction_name: junctionName }),
    });
    const scanPayload = await scanRes.json().catch(() => ({}));
    if (!scanRes.ok) throw new Error(scanPayload.detail || 'Stage scan failed');
    state.bridgeScanId = scanPayload.scan_id;
    state.bridgeTree = scanPayload.tree || null;
    state.bridgeSelection.clear();
    const nodes = flattenStageTree(state.bridgeTree || {});
    for (const node of nodes){
      if (node.suggested){
        state.bridgeSelection.add(node.path || '.');
      }
    }
    if (!state.bridgeSelection.size && nodes.length){
      state.bridgeSelection.add(nodes[0].path || '.');
    }
    updateBridgeMessage(`Scan ready (${nodes.length} nodes). Select roots to commit.`);
    renderBridgeScan();
  }catch(e){
    updateBridgeMessage(`Scan failed: ${e.message}`);
    toast('bad', 'Bridge', e.message);
  }
}

async function commitBridge(){
  const junctionName = (el('bridgeCandidate').value || '').trim();
  const selected = Array.from(state.bridgeSelection);
  if (!junctionName){
    toast('warn', 'Bridge', 'Select a junction first');
    return;
  }
  if (!selected.length){
    toast('warn', 'Bridge', 'Select at least one root to commit');
    return;
  }
  updateBridgeMessage('Committing selections…');
  try{
    const res = await fetch(`${API}/api/bridge/commit`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        junction_name: junctionName,
        selected_roots: selected,
        scan_id: state.bridgeScanId,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.detail || 'Commit failed');
    updateBridgeMessage('Bridge committed. Library registered.');
    resetBridgeScan();
    await loadSources();
    await loadBuckets();
    await loadMedia();
    toast('good', 'Bridge', 'Library registered.');
  }catch(e){
    updateBridgeMessage(`Commit failed: ${e.message}`);
    toast('bad', 'Bridge', e.message);
  }
}

async function loadMedia(){
  let url = null;
  if (state.activeProject){
    const name = state.activeProject.name;
    url = `${API}/api/projects/${encodeURIComponent(name)}/media${mediaQuery({ source: state.activeProject.source })}`;
  }else if (state.activeBucket){
    url = `${API}/api/buckets/${encodeURIComponent(state.activeBucket.bucket_id)}/media${mediaQuery()}`;
  }

  if (!url){
    state.media = [];
    state.tagMap = {};
    renderMedia();
    updateTopCounts();
    return;
  }

  try{
    const r = await fetch(url);
    if (!r.ok) throw new Error('Failed to load media list');
    const payload = await r.json();
    state.media = Array.isArray(payload.media) ? payload.media : [];
    if (payload.instructions && state.activeLibrary){
      updateBridgeMessage(payload.instructions);
    }
    // clear selection if selected files disappeared
    const existing = new Set(state.media.map(m => m.asset_id));
    for (const s of Array.from(state.selected)){
      if (!existing.has(s)) state.selected.delete(s);
    }
    hydrateTagMapFromMedia();
    renderMedia();
    updateTopCounts();
    updateSelectionUI();
  }catch(e){
    toast('bad','Media', e.message);
  }
}


// -------------------------
// Renderers
// -------------------------
function renderSources(){
  const root = el('sources');
  root.innerHTML = '';
  if (!state.sources.length){
    root.innerHTML = `<div class="card"><strong>No sources</strong><div class="small">Only the primary mount is available.</div></div>`;
    return;
  }
  for (const s of state.sources){
    const card = document.createElement('div');
    card.className = 'card';
    const reach = s.accessible ? 'reachable' : 'unreachable';
    const enabled = s.enabled ? 'enabled' : 'disabled';
    card.innerHTML =
      `<strong>${escapeHtml(s.name)}</strong>
       <div class="small">${escapeHtml(s.root || '')}</div>
       <div class="tagrow">
         <span class="tag ${s.enabled ? 'good':''}">${escapeHtml(enabled)}</span>
         <span class="tag ${s.accessible ? 'good':'bad'}">${escapeHtml(reach)}</span>
         <span class="tag">${escapeHtml(s.mode || 'project')}</span>
         <span class="tag">${escapeHtml(s.type || 'local')}</span>
       </div>`;
    root.appendChild(card);
  }
}

function renderProjects(){
  const root = el('projects');
  root.innerHTML = '';
  if (!state.projects.length){
    root.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:12px;">No projects yet — create via <code>/api/projects</code>.</div>`;
    return;
  }
  for (const p of state.projects){
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (state.activeProject && state.activeProject.name === p.name) chip.classList.add('active');
    chip.title = p.instructions || 'Browse this project';
    chip.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="name">${escapeHtml(p.name)}</span>`;
    chip.addEventListener('click', () => selectProject(p));
    root.appendChild(chip);
  }
  el('projCount').textContent = `${state.projects.length} total`;
}

function renderLibraries(){
  const root = el('libraries');
  root.innerHTML = '';
  if (!state.libraries.length){
    root.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:12px;">No libraries yet — register a bridge below.</div>`;
    el('libCount').textContent = '0 total';
    return;
  }
  for (const s of state.libraries){
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (state.activeLibrary && state.activeLibrary.name === s.name) chip.classList.add('active');
    chip.title = s.root || 'Browse library';
    chip.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="name">${escapeHtml(s.name)}</span>`;
    chip.addEventListener('click', () => selectLibrary(s));
    root.appendChild(chip);
  }
  el('libCount').textContent = `${state.libraries.length} total`;
}

function renderBuckets(){
  const root = el('buckets');
  root.innerHTML = '';
  el('discoverBucketsBtn').disabled = !state.activeLibrary;
  if (!state.activeLibrary){
    root.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:12px;">Select a library to load buckets.</div>`;
    el('bucketCount').textContent = '—';
    return;
  }
  if (!state.buckets.length){
    const msg = state.bridgeMessage || 'No buckets yet — run discovery or commit staged roots.';
    root.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:12px;">${escapeHtml(msg)}</div>`;
    el('bucketCount').textContent = '0 total';
    return;
  }
  for (const b of state.buckets){
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (state.activeBucket && state.activeBucket.bucket_id === b.bucket_id) chip.classList.add('active');
    chip.title = b.bucket_rel_root || b.title || 'Bucket';
    chip.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="name">${escapeHtml(b.title || b.bucket_rel_root || 'Bucket')}</span>`;
    chip.addEventListener('click', () => selectBucket(b));
    root.appendChild(chip);
  }
  el('bucketCount').textContent = `${state.buckets.length} total`;
}

function renderMedia(){
  const items = filteredMedia();
  const groups = groupMedia(items);

  // GRID
  const g = el('mediaGrid');
  g.innerHTML = '';
  // LIST
  const l = el('mediaList');
  l.innerHTML = '';

  if (!state.activeProject && !state.activeLibrary){
    const empty = `<div style="padding:16px;color:var(--muted);font-size:12px;">
      Select a project or library to view media.
    </div>`;
    g.innerHTML = empty;
    l.innerHTML = empty;
    return;
  }

  if (state.activeLibrary && !state.activeBucket){
    const empty = `<div style="padding:16px;color:var(--muted);font-size:12px;">
      Select a bucket to browse this library.
    </div>`;
    g.innerHTML = empty;
    l.innerHTML = empty;
    return;
  }

  if (!items.length){
    const empty = `<div style="padding:16px;color:var(--muted);font-size:12px;">
      No media found. Upload to a project or pick a different bucket.
    </div>`;
    g.innerHTML = empty;
    l.innerHTML = empty;
    return;
  }

  for (const group of groups){
    if (group.label){
      const header = document.createElement('div');
      header.className = 'group-header';
      header.textContent = group.label;
      g.appendChild(header);

      const listHeader = document.createElement('div');
      listHeader.className = 'group-header';
      listHeader.textContent = group.label;
      l.appendChild(listHeader);
    }
    for (const it of group.items){
      const kind = guessKind(it);
      const relPath = it.relative_path || it.rel_path || '';
      const title = relPath.split('/').pop() || relPath || 'unnamed';
      const sub = relPath || '';
      const size = formatBytes(it.size);
      const tags = getTagsForItem(it);
      const tagsHtml = renderTagPills(tags, 3);

      // If your API can provide a lightweight thumbnail URL (recommended), use it:
      // - it.thumb_url (image/jpg) for videos/images
      // Otherwise we can still show the actual stream_url for images (not always great for big video files).
      const cachedThumb = thumbCache.get(it.asset_id);
      const thumbUrl = cachedThumb || it.thumb_url || it.thumbnail_url || (kind === 'image' ? it.stream_url : null);

      // ---- grid card
      const card = document.createElement('div');
      card.className = 'asset';
      if (state.selected.has(it.asset_id)) card.classList.add('selected');

      card.innerHTML = `
        <div class="thumb" ${(!thumbUrl && kind === 'video') ? `data-asset-id="${escapeHtml(it.asset_id || '')}" data-url="${escapeHtml(it.stream_url || '')}" data-duration="${escapeHtml(it.duration || '')}" data-kind="video"` : ''}>
          ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(title)}" loading="lazy" />`
                     : (kind === 'video' ? `<div class="fallback">VIDEO</div>` : `<div class="fallback">No thumbnail</div>`) }
          <div class="badges">
            <span class="badge ${kindBadgeClass(kind)}">${escapeHtml(kind)}</span>
            <span class="badge">${escapeHtml(size)}</span>
          </div>
          <div class="selector" title="Select">
            <input type="checkbox" ${state.selected.has(it.asset_id) ? 'checked':''} aria-label="Select media" />
          </div>
        </div>
        <div class="body">
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
          ${tagsHtml ? `<div class="tagwrap">${tagsHtml}</div>` : ''}
        </div>
      `;

      // checkbox toggles selection without opening drawer
      card.querySelector('input[type="checkbox"]').addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleSelected(it.asset_id);
      });

      // click card opens inspector
      card.addEventListener('click', () => openDrawer(it));
      g.appendChild(card);

      if (!thumbUrl && kind === 'video'){
        const t = card.querySelector('.thumb');
        ensureThumbObserver().observe(t);
      }

      // ---- list row
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="mini" ${(!thumbUrl && kind === 'video') ? `data-asset-id="${escapeHtml(it.asset_id || '')}" data-url="${escapeHtml(it.stream_url || '')}" data-duration="${escapeHtml(it.duration || '')}" data-kind="video"` : ''}>
          ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(title)}" loading="lazy" />`
                     : (kind === 'video' ? `<span style="font-size:11px;color:var(--muted);">VIDEO</span>` : `<span style="font-size:11px;color:var(--muted);">${escapeHtml(kind)}</span>`) }
        </div>
        <div class="info">
          <div class="t">${escapeHtml(title)}</div>
          <div class="s">${escapeHtml(sub)} • ${escapeHtml(size)} • ${escapeHtml(kind)}</div>
          ${tagsHtml ? `<div class="tagwrap">${tagsHtml}</div>` : ''}
        </div>
        <div class="actions">
          <input type="checkbox" ${state.selected.has(it.asset_id) ? 'checked':''} title="Select" />
          <button class="iconbtn" type="button">Preview</button>
        </div>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleSelected(it.asset_id));
      row.querySelector('button').addEventListener('click', () => openDrawer(it));
      if (!thumbUrl && kind === 'video'){
        const t2 = row.querySelector('.mini');
        ensureThumbObserver().observe(t2);
      }
      l.appendChild(row);
    }
  }
}

// -------------------------
// Project selection + upload
// -------------------------
function updateUploadUI({ preserveStatus = false } = {}){
  const p = state.activeProject;
  const count = state.uploadQueue.length;
  el('uploadCaption').textContent = p
    ? `Upload to ${p.name}${p.source ? ` (${p.source})` : ''}`
    : 'Pick a project first.';
  el('uploadFile').disabled = !p;
  el('pickUploadBtn').disabled = !p;
  if (!preserveStatus){
    if (!p){
      el('uploadStatus').textContent = 'Select a project before staging uploads.';
    }else if (!count){
      el('uploadStatus').textContent = 'Select files to stage for upload.';
    }else{
      el('uploadStatus').textContent = `Ready to upload ${count} file${count === 1 ? '' : 's'}.`;
    }
  }
  el('uploadBtn').disabled = !p || !count;
}

async function selectProject(p){
  state.activeProject = p;
  state.activeLibrary = null;
  state.activeBucket = null;
  state.buckets = [];
  state.selected.clear();
  state.focused = null;
  resetBridgeScan();
  setSidebarOpen(false);

  // prefill resolve name
  el('resolveProjectMode').value = 'current';
  el('resolveProjectName').value = p.name || '';
  el('resolveNewName').value = '';

  state.uploadQueue = [];
  el('uploadFile').value = '';
  updateUploadUI();

  renderProjects();
  renderLibraries();
  renderBuckets();
  updateTopCounts();
  updateSelectionUI();
  syncBridgeControls();
  toast('good', 'Project', `Selected ${p.name}`);
  await loadMedia();
}

async function selectLibrary(source){
  state.activeLibrary = source;
  state.activeProject = null;
  state.activeBucket = null;
  state.selected.clear();
  state.focused = null;
  resetBridgeScan();
  setSidebarOpen(false);

  state.uploadQueue = [];
  el('uploadFile').value = '';
  updateUploadUI();

  renderProjects();
  renderLibraries();
  updateTopCounts();
  updateSelectionUI();
  syncBridgeControls();
  renderBridgeScan();
  await loadBuckets();
  await loadMedia();
  toast('good', 'Library', `Selected ${source.name}`);
}

async function selectBucket(bucket){
  state.activeBucket = bucket;
  state.selected.clear();
  state.focused = null;
  renderBuckets();
  updateTopCounts();
  updateSelectionUI();
  await loadMedia();
  toast('good', 'Bucket', `Browsing ${bucket.title || bucket.bucket_rel_root}`);
}

async function uploadActive(){
  const p = state.activeProject;
  if (!p){ toast('warn','Upload','Select a project first'); return; }
  const files = state.uploadQueue.length
    ? state.uploadQueue
    : Array.from(el('uploadFile').files || []);
  if (!files.length){ toast('warn','Upload','Pick one or more files first'); return; }
  state.uploadQueue = files;

  el('uploadBtn').disabled = true;
  el('uploadStatus').textContent = `Uploading 1 of ${files.length}…`;

  try{
    const url = p.upload_url || `${API}/api/projects/${encodeURIComponent(p.name)}/upload${mediaQuery({ source: p.source })}`;
    let stored = 0;
    let duplicates = 0;
    for (let i = 0; i < files.length; i += 1){
      const f = files[i];
      el('uploadStatus').textContent = `Uploading ${i + 1} of ${files.length}: ${f.name}`;
      const form = new FormData();
      form.append('file', f);
      const r = await fetch(url, { method:'POST', body: form });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(payload.detail || payload.message || 'Upload failed');
      if (payload.status === 'duplicate') duplicates += 1;
      else stored += 1;
    }
    const parts = [`Uploaded ${stored} file${stored === 1 ? '' : 's'}.`];
    if (duplicates) parts.push(`Duplicates skipped: ${duplicates}.`);
    const msg = parts.join(' ');
    el('uploadStatus').textContent = msg;
    toast(duplicates ? 'warn' : 'good', 'Upload', msg);
    state.uploadQueue = [];
    el('uploadFile').value = '';
    await loadMedia();
  }catch(e){
    el('uploadStatus').textContent = `Upload failed: ${e.message}`;
    toast('bad','Upload', e.message);
  }finally{
    updateUploadUI({ preserveStatus: true });
  }
}

// -------------------------
// Selection + Resolve
// -------------------------
function toggleSelected(assetId){
  if (!assetId) return;
  if (state.selected.has(assetId)) state.selected.delete(assetId);
  else state.selected.add(assetId);

  // update selected CSS quickly without full re-render
  // simplest: re-render; media lists are small enough on LAN.
  renderMedia();
  updateSelectionUI();
}

function clearSelection(){
  state.selected.clear();
  renderMedia();
  updateSelectionUI();
}

async function tagSelectedAssets(){
  if (!state.selected.size){
    toast('warn','Tags','Select one or more items first');
    return;
  }
  const raw = prompt('Add tags (comma separated, prefix "-" to remove):', '');
  if (!raw) return;
  const entries = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!entries.length) return;
  const adds = entries.filter(t => !t.startsWith('-'));
  const removes = entries.filter(t => t.startsWith('-')).map(t => t.slice(1)).filter(Boolean);

  try{
    for (const assetId of state.selected){
      if (adds.length){
        const addRes = await fetch(`${API}/api/assets/tags?asset_id=${encodeURIComponent(assetId)}`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ tags: adds }),
        });
        const payload = await addRes.json().catch(() => ({}));
        if (!addRes.ok) throw new Error(payload.detail || 'Tag add failed');
      }
      if (removes.length){
        const removeRes = await fetch(`${API}/api/assets/tags?asset_id=${encodeURIComponent(assetId)}`, {
          method:'DELETE',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ tags: removes }),
        });
        const payload = await removeRes.json().catch(() => ({}));
        if (!removeRes.ok) throw new Error(payload.detail || 'Tag remove failed');
      }
    }
    await loadMedia();
    toast('good','Tags','Updated selected items');
  }catch(e){
    toast('bad','Tags', e.message);
  }
}

async function sendToResolve(){
  const p = state.activeProject;
  if (!p){ toast('warn','Resolve','Select a project first'); return; }
  if (!state.selected.size){ toast('warn','Resolve','Select one or more clips'); return; }

  const projectMode = el('resolveProjectMode').value;
  let projectValue = p.name;

  if (projectMode === '__new__') projectValue = '__new__';
  else if (projectMode === '__select__') projectValue = '__select__';
  else {
    const v = (el('resolveProjectName').value || '').trim();
    if (v) projectValue = v;
  }

  const body = {
    project: projectValue,
    new_project_name: projectMode === '__new__'
      ? ((el('resolveNewName').value || '').trim() || null)
      : null,
    media_rel_paths: state.media
      .filter(m => state.selected.has(m.asset_id))
      .map(m => m.relative_path),
    mode: el('resolveMode').value || 'import',
  };

  try{
    const r = await fetch(`${API}/api/resolve/open${mediaQuery({ source: p.source })}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(payload.detail || payload.message || 'Resolve request failed');
    toast('good','Resolve', `Sent. Job: ${payload.job_id || 'ok'}`);
  }catch(e){
    toast('bad','Resolve', e.message);
  }
}

// -------------------------
// Drawer / inspector
// -------------------------
function openDrawer(item){
  state.focused = item;

  const kind = guessKind(item);
  const relPath = item.relative_path || item.rel_path || '';
  const title = relPath.split('/').pop() || relPath || 'unnamed';
  el('drawerTitle').textContent = title;
  el('drawerSub').textContent = relPath || '';

  // preview
  const preview = el('drawerPreview');
  preview.innerHTML = '';
  if (kind === 'video'){
    const v = document.createElement('video');
    v.controls = true;
    v.src = item.stream_url || '';
    v.preload = 'metadata';
    v.playsInline = true;
    v.muted = true;
    const poster = item.thumb_url || item.thumbnail_url || '';
    if (poster) v.setAttribute('poster', poster);
    v.addEventListener('loadedmetadata', () => {
      if (!v.duration || Number.isNaN(v.duration)) return;
      const target = Math.min(0.1, v.duration / 2);
      try{
        v.currentTime = target;
      }catch{
        // ignore seek failures; poster will still render if provided
      }
    });
    v.addEventListener('seeked', () => {
      v.pause();
    });
    preview.appendChild(v);
  }else if (kind === 'image'){
    const img = document.createElement('img');
    img.src = item.stream_url || item.thumb_url || item.thumbnail_url || '';
    img.alt = title;
    preview.appendChild(img);
  }else if (kind === 'audio'){
    const a = document.createElement('audio');
    a.controls = true;
    a.src = item.stream_url || '';
    preview.appendChild(a);
  }else{
    const box = document.createElement('div');
    box.style.padding = '14px';
    box.style.color = 'var(--muted)';
    box.style.fontSize = '12px';
    box.innerHTML = `No native preview for this type.<br><span class="kbd">${escapeHtml(kind)}</span>`;
    preview.appendChild(box);
  }

  // metadata table (show what you have; hides gracefully if missing)
  const kv = el('drawerKV');
  const rows = [
    ['Kind', kind],
    ['Size', formatBytes(item.size)],
    ['Stream', item.stream_url || '(none)'],
    ['Source', state.activeProject?.source || state.activeLibrary?.name || '(primary)'],
    ['Project', state.activeProject?.name || '(none)'],
    ['Relative', relPath || '(none)'],
    // Optional fields if your API provides them:
    ['MIME', item.mime || item.content_type || ''],
    ['Hash', item.sha256 || item.hash || ''],
    ['Created', item.created_at || item.createdAt || ''],
    ['Modified', item.updated_at || item.updatedAt || ''],
    ['Duration', item.duration ? `${item.duration}s` : ''],
    ['Resolution', (item.width && item.height) ? `${item.width}×${item.height}` : ''],
  ].filter(([_, v]) => String(v || '').trim().length > 0);

  kv.innerHTML = rows.map(([k,v]) => `
    <div class="k">${escapeHtml(k)}</div>
    <div class="v">${escapeHtml(v)}</div>
  `).join('');

  // actions
  el('drawerPlay').onclick = () => {
    const media = preview.querySelector('video, audio');
    if (media) media.play?.();
  };

  el('drawerCopy').onclick = async () => {
    const u = toAbsoluteUrl(item.stream_url);
    const ok = await copyToClipboard(u);
    if (ok){
      toast('good','Copied', 'Stream URL copied to clipboard');
      return;
    }
    const fallback = prompt('Copy stream URL:', u);
    if (fallback !== null){
      toast('warn','Clipboard', 'Use the prompt to copy the URL.');
    }
  };

  el('drawerTag').onclick = async () => {
    const raw = prompt('Add tags (comma separated, prefix "-" to remove):', '');
    if (!raw) return;
    const entries = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!entries.length) return;
    const adds = entries.filter(t => !t.startsWith('-'));
    const removes = entries.filter(t => t.startsWith('-')).map(t => t.slice(1)).filter(Boolean);

    const assetId = item.asset_id;
    if (!assetId){ toast('warn','Tags','No asset_id available'); return; }
    const base = `${API}/api/assets/tags?asset_id=${encodeURIComponent(assetId)}`;

    try{
      if (adds.length){
        const addRes = await fetch(base, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ tags: adds }),
        });
        const payload = await addRes.json().catch(() => ({}));
        if (!addRes.ok) throw new Error(payload.detail || 'Tag add failed');
      }
      if (removes.length){
        const removeRes = await fetch(base, {
          method:'DELETE',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ tags: removes }),
        });
        const payload = await removeRes.json().catch(() => ({}));
        if (!removeRes.ok) throw new Error(payload.detail || 'Tag remove failed');
      }
      await loadMedia();
      toast('good','Tags','Updated tags');
    }catch(e){
      toast('bad','Tags', e.message);
    }
  };

  el('drawerToggleSelect').onclick = () => {
    toggleSelected(item.asset_id);
  };

  // open
  setInspectorOpen(true);
  updateSelectionUI();
}

function closeDrawer(){
  setInspectorOpen(false);
}

// -------------------------
// Events / bindings
// -------------------------
el('refreshBtn').addEventListener('click', async () => {
  await loadSources();
  await loadProjects();
  await loadBuckets();
  await loadMedia();
  toast('good','Refresh','Reloaded projects + media');
});

el('sidebarToggle').addEventListener('click', () => setSidebarOpen(!ui.sidebarOpen));
el('sidebarBackdrop').addEventListener('click', () => setSidebarOpen(false));
el('drawerBackdrop').addEventListener('click', closeDrawer);

el('viewGrid').addEventListener('click', () => setView('grid'));
el('viewList').addEventListener('click', () => setView('list'));
el('actionsToggle').addEventListener('click', () => setActionsOpen(!ui.actionsOpen));

el('q').addEventListener('input', (e) => {
  state.q = e.target.value || '';
  renderMedia();
  updateTopCounts();
});

el('filterToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  ui.filtersOpen = !ui.filtersOpen;
  updateTagFilterUI();
});

document.addEventListener('click', (e) => {
  const panel = el('searchPanel');
  const toggle = el('filterToggle');
  if (!panel || !toggle) return;
  if (panel.contains(e.target) || toggle.contains(e.target)) return;
  if (ui.filtersOpen){
    ui.filtersOpen = false;
    updateTagFilterUI();
  }
});

let tagFilterTimer = null;
function scheduleMediaReload(){
  if (tagFilterTimer) window.clearTimeout(tagFilterTimer);
  tagFilterTimer = window.setTimeout(async () => {
    await loadMedia();
  }, 250);
}

el('tagFilter').addEventListener('input', (e) => {
  state.tagFilter = e.target.value || '';
  scheduleMediaReload();
});

el('hostFilter').addEventListener('input', (e) => {
  state.hostFilter = e.target.value || '';
  scheduleMediaReload();
});

el('deviceFilter').addEventListener('input', (e) => {
  state.deviceFilter = e.target.value || '';
  scheduleMediaReload();
});

el('appFilter').addEventListener('input', (e) => {
  state.appFilter = e.target.value || '';
  scheduleMediaReload();
});

el('dateFrom').addEventListener('change', (e) => {
  state.dateFrom = e.target.value || '';
  scheduleMediaReload();
});

el('dateTo').addEventListener('change', (e) => {
  state.dateTo = e.target.value || '';
  scheduleMediaReload();
});

el('hasCaptions').addEventListener('change', (e) => {
  state.hasCaptions = Boolean(e.target.checked);
  scheduleMediaReload();
});

el('groupBy').addEventListener('change', (e) => {
  state.groupBy = e.target.value || 'none';
  renderMedia();
  updateTopCounts();
});

el('tagModeBtn').addEventListener('click', async () => {
  state.tagMode = state.tagMode === 'any' ? 'all' : 'any';
  updateTagFilterUI();
  await loadMedia();
});

el('noTagsBtn').addEventListener('click', async () => {
  state.noTags = !state.noTags;
  updateTagFilterUI();
  await loadMedia();
});

// Upload
el('uploadBtn').addEventListener('click', uploadActive);
el('uploadFile').addEventListener('change', (event) => {
  state.uploadQueue = Array.from(event.target.files || []);
  updateUploadUI();
});
el('pickUploadBtn').addEventListener('click', () => {
  if (!state.activeProject){
    toast('warn','Upload','Select a project first');
    return;
  }
  el('uploadFile').click();
});

// Bridge + Buckets
el('bridgeStageBtn').addEventListener('click', runBridgeScan);
el('bridgeCommitBtn').addEventListener('click', commitBridge);
el('bridgeCandidate').addEventListener('change', (event) => {
  state.bridgeCandidate = event.target.value || '';
  updateBridgeMessage('');
  resetBridgeScan();
  syncBridgeControls();
});
el('bridgeRefreshBtn').addEventListener('click', async () => {
  await loadBridgeStatus();
  await loadBridgeCandidates();
});
el('bridgeRescanBtn').addEventListener('click', async () => {
  await discoverBuckets();
});
el('bridgeDeriveBtn').addEventListener('click', async () => {
  if (!state.activeLibrary){
    toast('warn', 'Bridge', 'Select a library first');
    return;
  }
  try{
    const res = await fetch(`${API}/api/sources/${encodeURIComponent(state.activeLibrary.name)}/derive`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ kinds: ['thumb'], limit: 50 }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.detail || 'Derive failed');
    toast('good', 'Bridge', `Derived ${payload.processed || 0} assets.`);
  }catch(e){
    toast('bad', 'Bridge', e.message);
  }
});
el('discoverBucketsBtn').addEventListener('click', discoverBuckets);

// Resolve
el('sendResolveBtn').addEventListener('click', sendToResolve);
el('selResolveBtn').addEventListener('click', sendToResolve);
el('tagSelBtn').addEventListener('click', tagSelectedAssets);

// Clear selection
el('clearSelBtn').addEventListener('click', clearSelection);
el('selClearBtn').addEventListener('click', clearSelection);

// Preview (first selected)
el('selPlayBtn').addEventListener('click', () => {
  const first = Array.from(state.selected)[0];
  const item = state.media.find(m => m.asset_id === first);
  if (item) openDrawer(item);
});

// Drawer close
el('drawerClose').addEventListener('click', closeDrawer);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape'){
    if (ui.filtersOpen){
      ui.filtersOpen = false;
      updateTagFilterUI();
      e.preventDefault();
      return;
    }
    if (ui.inspectorOpen){
      closeDrawer();
      e.preventDefault();
      return;
    }
    if (ui.sidebarOpen){
      setSidebarOpen(false);
      e.preventDefault();
      return;
    }
  }
  // cheap "cmd+k" focus
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    el('q').focus();
  }
});

// Resolve hint updates
function syncResolveHint(){
  const c = state.selected.size;
  el('resolveHint').textContent = c
    ? `${c} item(s) queued.`
    : 'Select clips to enable.';
}
const _origUpdateSelectionUI = updateSelectionUI;
updateSelectionUI = function(){
  _origUpdateSelectionUI();
  syncResolveHint();
};

// Boot
document.addEventListener('DOMContentLoaded', async () => {
  initSidebarSections();
  syncSidebarMode();
  window.matchMedia('(max-width: 860px)').addEventListener('change', () => {
    syncSidebarMode();
  });

  toast('good','Boot','Loading sources + projects…');
  await loadBridgeStatus();
  await loadBridgeCandidates();
  await loadSources();
  await loadProjects();
  await loadBuckets();
  setView('grid');
  el('groupBy').value = state.groupBy || 'none';
  el('hasCaptions').checked = Boolean(state.hasCaptions);
  updateTagFilterUI();
  updateTopCounts();
  updateSelectionUI();
  renderBridgeScan();
  syncBridgeControls();
});
