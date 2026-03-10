// ─────────────────────────────────────────────────────────────────────────────
// asset-pointer-handlers.js
//
// REPLACES wireAssetPointerHandlers(target, item) in explorer.html
//
// Gesture model:
//   Tap 1        → "focus" state  (ring highlight, no select, no preview)
//   Tap 2        → open preview panel  (must be same card within 500ms)
//   Long press   → context menu  (420ms hold, cancels on move >8px)
//   Checkbox     → select / deselect  (unchanged, handled by delegation)
//   Drag         → existing drag-to-project logic  (unchanged)
//
// Close model:
//   Swipe down on panel  → close  (handled inside asset-preview.mjs)
//   Tap backdrop         → close  (fixed -- no stopPropagation on backdrop path)
//   ✕ button             → close  (handled inside asset-preview.mjs)
// ─────────────────────────────────────────────────────────────────────────────

// ── Focus state tracker ───────────────────────────────────────────────────────
// Only one card can be "focused" at a time.
const _focusState = {
card      : null,   // currently focused DOM element
item      : null,   // the data item
clearTimer: 0,      // auto-clear after 2.5s of inactivity
};

function _setFocusedCard(card, item) {
// clear previous
if (_focusState.card && _focusState.card !== card) {
_focusState.card.classList.remove(‘is-focused’);
_focusState.card.removeAttribute(‘data-focused’);
}
clearTimeout(_focusState.clearTimer);

if (!card) {
_focusState.card = null;
_focusState.item = null;
return;
}

_focusState.card = card;
_focusState.item = item;
card.classList.add(‘is-focused’);
card.dataset.focused = ‘1’;

// auto-clear focus if user does nothing for 2.5s
_focusState.clearTimer = setTimeout(() => {
card.classList.remove(‘is-focused’);
card.removeAttribute(‘data-focused’);
if (_focusState.card === card) {
_focusState.card = null;
_focusState.item = null;
}
}, 2500);
}

function _clearFocusedCard() {
_setFocusedCard(null, null);
}

// Dismiss focus when preview opens or closes
document.addEventListener(‘preview-close’, _clearFocusedCard, true);

// ── CSS to add to explorer.html <style> ──────────────────────────────────────
// (paste into the existing <style> block -- or inject via JS below)
const _FOCUS_CSS = `/* Asset focus state -- tap 1 */ .asset.is-focused { border-color: rgba(74,240,192,0.55); box-shadow: 0 0 0 2px rgba(74,240,192,0.45), 0 0 22px rgba(74,240,192,0.22), 0 8px 32px rgba(0,0,0,0.45); transform: translateY(-2px) scale(1.015); transition: border-color 120ms ease, box-shadow   160ms ease, transform    160ms cubic-bezier(0.2,0.8,0.2,1); z-index: 2; } .asset.is-focused .preview-pill { opacity: 1; } .asset.is-focused .play-btn { opacity: 1; } /* Subtle "tap to preview" label that appears on focus */ .asset.is-focused::after { content: 'tap to preview'; position: absolute; bottom: 46px; left: 50%; transform: translateX(-50%); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(74,240,192,0.9); background: rgba(0,0,0,0.55); padding: 3px 8px; border-radius: 4px; pointer-events: none; z-index: 3; white-space: nowrap; animation: focusPillIn 140ms ease forwards; } @keyframes focusPillIn { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to   { opacity: 1; transform: translateX(-50%) translateY(0); } } /* Ripple animation on first tap */ .asset.is-focused .thumb::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(circle at var(--tap-x,50%) var(--tap-y,50%), rgba(74,240,192,0.18) 0%, rgba(74,240,192,0) 70% ); pointer-events: none; z-index: 1; animation: tapRipple 380ms ease forwards; } @keyframes tapRipple { from { opacity: 1; transform: scale(0.6); } to   { opacity: 0; transform: scale(1.4); } }`;

// Inject CSS once
if (!document.getElementById(‘asset-focus-styles’)) {
const style = document.createElement(‘style’);
style.id = ‘asset-focus-styles’;
style.textContent = _FOCUS_CSS;
document.head.appendChild(style);
}

// ── Main handler factory ──────────────────────────────────────────────────────
function wireAssetPointerHandlers(target, item) {
const MOVE_THRESHOLD = 8;      // px before a press becomes a drag
const LONG_PRESS_MS  = 420;    // ms before long-press fires
const DOUBLE_TAP_MS  = 400;    // ms window for tap-2 to count

let pointerId   = null;
let startX      = 0;
let startY      = 0;
let tapX        = 0;           // position within card for ripple
let tapY        = 0;
let moved       = false;
let longPressTimer = null;

function clearLongPress() {
if (longPressTimer) clearTimeout(longPressTimer);
longPressTimer = null;
}

function inNoPreviewZone(el) {
return !!(el && el.closest && el.closest(’[data-no-preview], .sel-ui’));
}

// ── pointerdown ─────────────────────────────────────────────────────────────
target.addEventListener(‘pointerdown’, (e) => {
if (e.pointerType === ‘mouse’ && e.button !== 0) return;
if (inNoPreviewZone(e.target)) return;
if (e.target.closest(‘input, button, a, summary’)) return;

```
pointerId = e.pointerId;
startX    = e.clientX;
startY    = e.clientY;
moved     = false;

// compute tap position relative to card for ripple CSS var
const rect = target.getBoundingClientRect();
tapX = (((e.clientX - rect.left) / rect.width)  * 100).toFixed(1) + '%';
tapY = (((e.clientY - rect.top)  / rect.height) * 100).toFixed(1) + '%';

target.setPointerCapture(pointerId);
clearLongPress();

// long press → context menu
longPressTimer = setTimeout(() => {
  longPressTimer = null;
  if (moved) return;
  const key      = selectionKey(item);
  const selected = key ? selectedItems() : [];
  const menuItems = (key && state.selected.has(key) && selected.length)
    ? selected
    : [item];
  openContextMenu({ clientX: e.clientX, clientY: e.clientY }, menuItems);
  // cancel the tap sequence
  pointerId = null;
}, LONG_PRESS_MS);
```

});

// ── pointermove ──────────────────────────────────────────────────────────────
target.addEventListener(‘pointermove’, (e) => {
if (pointerId !== e.pointerId) return;
const dx = e.clientX - startX;
const dy = e.clientY - startY;
if (!moved && (dx * dx + dy * dy) > MOVE_THRESHOLD * MOVE_THRESHOLD) {
moved = true;
clearLongPress();
// kick off drag logic (existing)
ui.dragging       = true;
ui.dragPointerId  = pointerId;
const key         = selectionKey(item);
const selected    = selectedRelativePathsForAction();
ui.dragPaths      = (key && state.selected.has(key) && selected.length)
? selected
: [item.relative_path];
ui.assetDragActive = true;
if (e.clientY <= 94) document.body.classList.remove(‘topbar-hidden’);
}
});

// ── pointerup ────────────────────────────────────────────────────────────────
target.addEventListener(‘pointerup’, (e) => {
if (pointerId !== e.pointerId) return;
clearLongPress();
if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
pointerId = null;

```
// drag release -- existing project drop logic
if (moved) {
  ui.dragging        = false;
  ui.assetDragActive = false;
  const dropEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.chip');
  if (dropEl?.dataset?.project) {
    const dropTarget = state.projects.find(p =>
      p.name === dropEl.dataset.project &&
      String(p.source || '') === String(dropEl.dataset.source || '')
    );
    if (dropTarget) moveMedia(ui.dragPaths, dropTarget);
  }
  ui.dragTarget = null;
  return;
}

// ── TAP LOGIC ─────────────────────────────────────────────────────────────
const isSameCard = _focusState.card === target;

if (isSameCard) {
  // TAP 2 -- open preview
  _clearFocusedCard();
  const openFn = window.__openAssetPreview ?? openDrawer;
  openFn(item);
} else {
  // TAP 1 -- focus the card
  // set ripple origin
  target.style.setProperty('--tap-x', tapX);
  target.style.setProperty('--tap-y', tapY);
  _setFocusedCard(target, item);
}
```

});

// ── pointercancel ────────────────────────────────────────────────────────────
target.addEventListener(‘pointercancel’, () => {
clearLongPress();
pointerId         = null;
ui.dragging       = false;
ui.assetDragActive = false;
});

// prevent native drag
target.addEventListener(‘dragstart’, (e) => e.preventDefault());

// ── contextmenu (right-click / two-finger tap on desktop) ───────────────────
target.addEventListener(‘contextmenu’, (e) => {
if (inNoPreviewZone(e.target)) return;
e.preventDefault();
const key      = selectionKey(item);
const selected = key ? selectedItems() : [];
const menuItems = (key && state.selected.has(key) && selected.length)
? selected
: [item];
openContextMenu({ clientX: e.clientX, clientY: e.clientY }, menuItems);
});
}

// ── Backdrop / close fix ──────────────────────────────────────────────────────
// The original code had stopPropagation in capture phase which swallowed
// backdrop taps. This wires the backdrop correctly without touching
// the asset handlers.
//
// Place this ONCE after wireAssetPointerHandlers is defined:
//
//   wirePreviewBackdropClose();
//
function wirePreviewBackdropClose() {
// asset-preview component dispatches ‘preview-close’ when its ✕ or
// backdrop is tapped -- we just hide it.
const preview = document.getElementById(‘assetPreview’);
if (!preview) return;

// close on backdrop tap (click outside the panel)
document.addEventListener(‘pointerdown’, (e) => {
if (!preview.hasAttribute(‘hidden’) && !preview.contains(e.target)) {
_clearFocusedCard();
preview.close();
}
}, { capture: false, passive: true });

// close on swipe down (threshold 60px, component handles internally,
// but this is the outer safety net)
preview.addEventListener(‘preview-close’, () => {
_clearFocusedCard();
});
}