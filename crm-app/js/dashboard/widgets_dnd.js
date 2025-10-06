let WIRED = false;
let WIRED_HOST = null;
const LAYOUT_KEY = 'dash:widgets:v1';

function noop() {}
// Persist order only after drop/dragend to avoid mid-drag reflows

function qmt(fn){ return (typeof queueMicrotask==='function') ? queueMicrotask(fn) : Promise.resolve().then(fn); }

function container(){
  return document.querySelector('[data-dashboard-widgets]') ||
         document.getElementById('dashboard-widgets') ||
         document.querySelector('.dashboard-widgets') ||
         document.getElementById('kpi-tiles') ||
         document.querySelector('[data-kpis]');
}

function directChildren(el){
  if (!el) return [];
  // We only reorder first-level tiles; avoid reordering nested elements.
  return Array.from(el.children || []).filter(n => n.nodeType===1);
}

function ensureId(tile){
  if (!tile) return null;
  if (tile.dataset.widget) return tile.dataset.widget;
  const id = tile.getAttribute('id') ||
             tile.getAttribute('data-kpi') ||
             tile.getAttribute('data-tile') ||
             (tile.querySelector('h2,h3,h4,[data-title]')?.textContent || '').trim().toLowerCase().replace(/\s+/g,'-').slice(0,40) ||
             ('w_' + Math.random().toString(36).slice(2,8));
  tile.dataset.widget = id;
  return id;
}

function readLayout(){
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || []; }
  catch { return []; }
}
function writeLayout(order){
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(order)); } catch {}
}

function currentOrder(){
  const host = container(); if (!host) return [];
  return directChildren(host).map(t => ensureId(t));
}

function applyOrder(){
  const host = container(); if (!host) return;
  const saved = readLayout();
  if (!saved || !saved.length) return;
  const map = new Map();
  directChildren(host).forEach(t => map.set(ensureId(t), t));

  // Only reorder for IDs that still exist; keep unknowns at the end in current order
  saved.forEach(id => { const el = map.get(id); if (el) host.appendChild(el); });
}

function persistFromDOM(){
  const order = currentOrder();
  writeLayout(order);
}

function placeholder(){
  const ph = document.createElement('div');
  ph.setAttribute('data-drag-ph', '1');
  ph.style.minHeight = '20px';
  ph.style.opacity = '0.25';
  ph.style.border = '1px dashed currentColor';
  ph.style.margin = '4px';
  return ph;
}

function nearestTile(target){
  const host = container(); if (!host) return null;
  const t = (target && (target.closest('[data-widget]') || target.closest('#dashboard-widgets > *') || target.closest('.dashboard-widgets > *'))) || null;
  return (t && host.contains(t)) ? t : null;
}

function installDnD(){
  const host = container(); if (!host) return;
  // If the dashboard container changed (re-render), rewire
  if (WIRED && WIRED_HOST && WIRED_HOST !== host) {
    try { WIRED_HOST.removeEventListener?.('dragstart', noop); } catch {}
    WIRED = false;
  }

  // Ensure every tile has identifiers and draggable wiring on each pass
  directChildren(host).forEach(tile => {
    ensureId(tile);
    try { tile.setAttribute('draggable','true'); } catch {}
  });

  if (WIRED) return; WIRED = true; WIRED_HOST = host;

  let dragEl = null;
  let ph = null;

  host.addEventListener('dragstart', (e) => {
    const tile = nearestTile(e.target);
    if (!tile) return;
    dragEl = tile;
    e.dataTransfer?.setData('text/plain', ensureId(tile));
    try { e.dataTransfer?.setDragImage?.(tile, 10, 10); } catch {}
    // Create placeholder after the dragged element
    ph = placeholder();
    dragEl.after(ph);
    // Slight visual cue
    dragEl.style.opacity = '0.6';
  });

  host.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    const over = nearestTile(e.target);
    if (!over || over===ph || over===dragEl) { e.preventDefault(); return; }
    e.preventDefault(); // allow drop
    // Place placeholder before or after based on vertical midpoint
    const rect = over.getBoundingClientRect();
    const before = (e.clientY - rect.top) < (rect.height / 2);
    if (before) over.before(ph); else over.after(ph);
  });

  host.addEventListener('drop', (e) => {
    if (!dragEl || !ph) return;
    e.preventDefault();
    ph.replaceWith(dragEl);
  });

  host.addEventListener('dragend', () => {
    if (dragEl) dragEl.style.opacity = '';
    if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
    ph = null;
    // Persist new order and request one repaint
    qmt(() => {
      persistFromDOM();
      try {
        // No data change; just request a render coalesced by RenderGuard
        if (window.RenderGuard && typeof window.RenderGuard.requestRender === 'function') {
          window.RenderGuard.requestRender();
        }
      } catch {}
    });
    dragEl = null;
  });
}

// Public API
export const DashLayout = {
  apply: applyOrder,
  reset(){
    try { localStorage.removeItem(LAYOUT_KEY); } catch {}
    qmt(() => { applyOrder(); });
  }
};

export function wireWidgetsDnD(){
  applyOrder();
  installDnD();
}

// Auto-wire on load + after paints
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => wireWidgetsDnD(), { once:true });
} else {
  wireWidgetsDnD();
}

try {
  if (window.RenderGuard && typeof window.RenderGuard.registerHook === 'function') {
    window.RenderGuard.registerHook(() => wireWidgetsDnD());
  }
} catch {}
// Expose for console ops
window.DashLayout = Object.assign(window.DashLayout || {}, DashLayout);
