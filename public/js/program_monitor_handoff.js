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

function toAbsoluteUrl(url){
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')){
    return url;
  }
  return new URL(url, window.location.origin).toString();
}

async function openProgramMonitorAndSend(urls){
  const win = window.open(PROGRAM_MONITOR_URL, '_blank', 'noopener,noreferrer');
  if (!win){
    throw new Error('Popup blocked. Allow popups for this site.');
  }

  const payload = {
    type: IMPORT_TYPE,
    version: 1,
    nodes: urls.map((u) => ({ lines: [u], durationOverride: 'auto' })),
    meta: {
      sentAt: new Date().toISOString(),
      from: window.location.origin,
    },
  };

  const timeoutMs = 6000;
  const intervalMs = 200;
  const start = Date.now();

  return await new Promise((resolve, reject) => {
    function onMessage(event){
      if (event?.data?.type === ACK_TYPE){
        window.removeEventListener('message', onMessage);
        resolve(true);
      }
    }

    window.addEventListener('message', onMessage);

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs){
        clearInterval(timer);
        window.removeEventListener('message', onMessage);
        reject(new Error('No ACK from Program Monitor. Is it open and listening?'));
        return;
      }

      try{
        win.postMessage(payload, '*');
      }catch{
        // Ignore transient postMessage errors while waiting for ACK.
      }
    }, intervalMs);
  });
}

export async function sendSelectedToProgramMonitor(){
  const externalUrls = window.MediaExplorer?.getSelectedStreamUrlsInDomOrder?.();
  if (Array.isArray(externalUrls) && externalUrls.length){
    await openProgramMonitorAndSend(externalUrls);
    return;
  }

  const selected = getSelectedCardsInVisualOrder();
  if (!selected.length){
    throw new Error('No items selected.');
  }

  const urls = selected.map(buildStreamUrlFromCard).map(toAbsoluteUrl).filter(Boolean);
  if (!urls.length){
    throw new Error('No stream URLs found for the selection.');
  }

  await openProgramMonitorAndSend(urls);
}

window.ProgramMonitorHandoff = {
  sendSelectedToProgramMonitor,
};
