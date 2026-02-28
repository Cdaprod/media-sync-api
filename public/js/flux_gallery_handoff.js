/**
 * flux_gallery_handoff.js
 * Usage: window.FluxGalleryHandoff.sendSelectedToFluxGallery();
 *
 * Sends first 5 selected stream URLs to an already-open Flux Gallery (e.g., OBS Browser Source)
 * via BroadcastChannel. Flux Gallery must be listening.
 */

const CHANNEL_NAME = 'CDAPROD_FLUX_GALLERY_CHANNEL';
const IMPORT_TYPE = 'CDAPROD_FLUX_GALLERY_IMPORT';
const ACK_TYPE = 'CDAPROD_FLUX_GALLERY_ACK';
const MAX_PANES = 5;

function encodePath(path){
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function toAbsoluteUrl(url){
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return new URL(url, window.location.origin).toString();
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

async function broadcastImport(urls){
  const bc = new BroadcastChannel(CHANNEL_NAME);

  const payload = {
    type: IMPORT_TYPE,
    version: 1,
    panes: urls.slice(0, MAX_PANES).map((u, idx) => ({
      pane: idx + 1,
      src: toAbsoluteUrl(u),
    })),
    meta: {
      sentAt: new Date().toISOString(),
      from: window.location.origin,
    },
  };

  const timeoutMs = 1200;
  const start = Date.now();

  return await new Promise((resolve) => {
    let acked = false;

    function onMsg(ev){
      if (ev?.data?.type === ACK_TYPE){
        acked = true;
        bc.removeEventListener('message', onMsg);
        bc.close();
        resolve(true);
      }
    }

    bc.addEventListener('message', onMsg);

    // Send once immediately
    bc.postMessage(payload);

    // Also resend a couple times quickly to survive "listener not ready yet"
    const t = setInterval(() => {
      if (acked){
        clearInterval(t);
        return;
      }
      if (Date.now() - start > timeoutMs){
        clearInterval(t);
        bc.removeEventListener('message', onMsg);
        bc.close();
        resolve(false); // no hard fail; Flux may still have received it
        return;
      }
      bc.postMessage(payload);
    }, 200);
  });
}

export async function sendSelectedToFluxGallery(){
  // Prefer your existing API if present
  const externalUrls = window.MediaExplorer?.getSelectedStreamUrlsInDomOrder?.();
  if (Array.isArray(externalUrls) && externalUrls.length){
    await broadcastImport(externalUrls.slice(0, MAX_PANES));
    return;
  }

  const selected = getSelectedCardsInVisualOrder();
  if (!selected.length){
    throw new Error('No items selected.');
  }

  const urls = selected
    .map(buildStreamUrlFromCard)
    .map(toAbsoluteUrl)
    .filter(Boolean)
    .slice(0, MAX_PANES);

  if (!urls.length){
    throw new Error('No stream URLs found for the selection.');
  }

  await broadcastImport(urls);
}

window.FluxGalleryHandoff = { sendSelectedToFluxGallery };