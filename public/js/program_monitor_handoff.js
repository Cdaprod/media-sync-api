/**
 * program_monitor_handoff.js
 * Usage: window.ProgramMonitorHandoff.sendSelectedToProgramMonitor();
 * Example: call from the multi-select bar to hand off selected stream URLs.
 */
const PROGRAM_MONITOR_URL = 'http://192.168.0.25:8789/program-monitor/index.html';
const ACK_TYPE = 'CDAPROD_PROGRAM_MONITOR_ACK';
const IMPORT_TYPE = 'CDAPROD_PROGRAM_MONITOR_IMPORT';

function encodePath(path){
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getVisibleMediaContainer(){
  const grid = document.getElementById('mediaGrid');
  const list = document.getElementById('mediaList');
  const gridVisible = grid && window.getComputedStyle(grid).display !== 'none';
  if (gridVisible) return { container: grid, selector: '.asset.is-selected' };
  return { container: list, selector: '.row.is-selected' };
}

function getSelectedCardsInVisualOrder(){
  const { container, selector } = getVisibleMediaContainer();
  if (!container) return [];
  return Array.from(container.querySelectorAll(selector));
}

function buildStreamUrlFromCard(cardEl){
  if (!cardEl) throw new Error('Missing card element.');
  const direct = cardEl.dataset.streamUrl || cardEl.dataset.url;
  if (direct) return direct;

  const project = cardEl.dataset.project;
  const rel = cardEl.dataset.relative;
  const source = cardEl.dataset.source || 'primary';
  if (project && rel){
    const suffix = source && source !== 'primary' ? `?source=${encodeURIComponent(source)}` : '';
    return `/media/${encodeURIComponent(project)}/${encodePath(rel)}${suffix}`;
  }

  throw new Error('Could not derive stream URL from selected card.');
}

function buildAssetDescriptorFromCard(cardEl){
  if (!cardEl) throw new Error('Missing card element.');
  const sha = String(cardEl.dataset.sha256 || '').trim();
  const relative = String(cardEl.dataset.relative || '').trim();
  const origin = String(cardEl.dataset.origin || '').trim() || 'unknown';
  const creationTime = String(cardEl.dataset.creationTime || '').trim() || null;
  const project = String(cardEl.dataset.project || '').trim() || null;
  const source = String(cardEl.dataset.source || '').trim() || 'primary';
  const streamUrl = toAbsoluteUrl(buildStreamUrlFromCard(cardEl));
  return {
    asset_id: /^[A-Fa-f0-9]{64}$/.test(sha) ? `sha256:${sha.toLowerCase()}` : null,
    sha256: /^[A-Fa-f0-9]{64}$/.test(sha) ? sha.toLowerCase() : null,
    project,
    source,
    relative_path: relative || null,
    stream_url: streamUrl || null,
    fallback_relative_path: relative || null,
    origin,
    creation_time: creationTime,
  };
}

function toAbsoluteUrl(url){
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')){
    return url;
  }
  return new URL(url, window.location.origin).toString();
}

async function openProgramMonitorAndSend(urls, descriptors){
  const win = window.open(PROGRAM_MONITOR_URL, '_blank');
  if (!win){
    throw new Error('Popup blocked. Allow popups for this site.');
  }

  const payload = {
    type: IMPORT_TYPE,
    version: 1,
    nodes: urls.map((u) => ({ lines: [u], durationOverride: 'auto' })),
    selected_assets: {
      asset_ids: (descriptors || []).map((item) => item.asset_id).filter(Boolean),
      sha256: (descriptors || []).map((item) => item.sha256).filter(Boolean),
      fallback_relative_paths: (descriptors || []).map((item) => item.fallback_relative_path).filter(Boolean),
      origins: (descriptors || []).map((item) => item.origin).filter(Boolean),
      creation_times: (descriptors || []).map((item) => item.creation_time).filter(Boolean),
      items: (descriptors || []).map((item) => ({
        asset_id: item.asset_id,
        sha256: item.sha256,
        project: item.project,
        source: item.source,
        relative_path: item.relative_path,
        stream_url: item.stream_url,
        origin: item.origin,
        creation_time: item.creation_time,
      })),
    },
    meta: {
      sentAt: new Date().toISOString(),
      from: window.location.origin,
    },
  };

  const timeoutMs = 6000;
  const intervalMs = 200;
  const start = Date.now();

  const targetOrigin = (() => {
    try{
      return new URL(PROGRAM_MONITOR_URL).origin;
    }catch{
      return '*';
    }
  })();

  return await new Promise((resolve, reject) => {
    let timer = null;
    function onMessage(event){
      if (event?.data?.type === ACK_TYPE){
        if (timer){
          clearInterval(timer);
        }
        window.removeEventListener('message', onMessage);
        resolve(true);
      }
    }

    window.addEventListener('message', onMessage);

    let sendCount = 0;
    timer = setInterval(() => {
      if (Date.now() - start > timeoutMs){
        clearInterval(timer);
        window.removeEventListener('message', onMessage);
        reject(new Error('No ACK from Program Monitor. Is it open and listening?'));
        return;
      }

      if (sendCount > 0){
        return;
      }

      try{
        win.postMessage(payload, targetOrigin);
        sendCount += 1;
      }catch{
        // Ignore transient postMessage errors while waiting for ACK.
      }
    }, intervalMs);
  });
}

export async function sendSelectedToProgramMonitor(){
  const externalUrls = window.MediaExplorer?.getSelectedStreamUrlsInDomOrder?.();
  if (Array.isArray(externalUrls) && externalUrls.length){
    await openProgramMonitorAndSend(externalUrls, []);
    return;
  }

  const selected = getSelectedCardsInVisualOrder();
  if (!selected.length){
    throw new Error('No items selected.');
  }

  const descriptors = selected.map(buildAssetDescriptorFromCard);
  const urls = selected.map(buildStreamUrlFromCard).map(toAbsoluteUrl).filter(Boolean);
  if (!urls.length){
    throw new Error('No stream URLs found for the selection.');
  }

  await openProgramMonitorAndSend(urls, descriptors);
}

window.ProgramMonitorHandoff = {
  sendSelectedToProgramMonitor,
};
