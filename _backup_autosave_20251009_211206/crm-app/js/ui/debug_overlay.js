const PILL_OPACITY_IDLE = 0.4;
const PILL_OPACITY_ACTIVE = 1;
const FADE_DELAY_MS = 2000;

let overlayEl = null;
let msEl = null;
let counterEl = null;
let fadeTimer = null;
let isVisible = true;
let hotkeyAttached = false;
let counterListenerAttached = false;

function ensureOverlay(){
  if(overlayEl) return overlayEl;
  if(typeof window === 'undefined') return null;
  const doc = window.document;
  if(!doc || typeof doc.createElement !== 'function') return null;

  const pill = doc.createElement('div');
  pill.setAttribute('data-debug-overlay', 'repaint');
  pill.style.position = 'fixed';
  pill.style.top = '12px';
  pill.style.right = '12px';
  pill.style.zIndex = '2147483647';
  pill.style.display = 'flex';
  pill.style.alignItems = 'center';
  pill.style.gap = '6px';
  pill.style.padding = '4px 10px';
  pill.style.borderRadius = '999px';
  pill.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  pill.style.fontSize = '12px';
  pill.style.fontWeight = '600';
  pill.style.color = '#0b1b13';
  pill.style.backgroundColor = 'rgba(46, 204, 113, 0.9)';
  pill.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
  pill.style.pointerEvents = 'none';
  pill.style.opacity = String(PILL_OPACITY_IDLE);
  pill.style.transition = 'opacity 180ms ease, background-color 120ms ease, color 120ms ease';

  const msSpan = doc.createElement('span');
  msSpan.textContent = '-- ms';

  const counterSpan = doc.createElement('span');
  counterSpan.textContent = '';
  counterSpan.style.fontSize = '10px';
  counterSpan.style.fontWeight = '500';
  counterSpan.style.opacity = '0.7';

  pill.appendChild(msSpan);
  pill.appendChild(counterSpan);

  const append = () => {
    if(doc.body && !doc.body.contains(pill)){
      doc.body.appendChild(pill);
    }
  };
  if(doc.readyState === 'loading'){
    doc.addEventListener('DOMContentLoaded', append, { once: true });
  }else{
    append();
  }

  overlayEl = pill;
  msEl = msSpan;
  counterEl = counterSpan;
  return overlayEl;
}

function updateCounter(){
  if(!counterEl) return;
  const meter = typeof window !== 'undefined' ? window.__METER__ : null;
  const bucket = meter && meter.dataChanged ? meter.dataChanged : null;
  if(bucket && typeof bucket.count === 'number'){
    counterEl.textContent = `Δ${bucket.count}`;
    counterEl.style.display = '';
  }else{
    counterEl.textContent = '';
    counterEl.style.display = 'none';
  }
}

function handleHotkey(ev){
  if(!overlayEl || window.__ENV__?.DEBUG !== true) return;
  if(!ev || ev.type !== 'keydown') return;
  if(!ev.ctrlKey || !ev.shiftKey) return;
  const key = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
  if(key !== 'p') return;
  isVisible = !isVisible;
  overlayEl.style.display = isVisible ? 'flex' : 'none';
}

export function initDebugOverlay(){
  if(window.__ENV__?.DEBUG !== true) return;
  const pill = ensureOverlay();
  if(!pill) return;
  updateCounter();
  if(!hotkeyAttached){
    window.addEventListener('keydown', handleHotkey, { passive: true });
    hotkeyAttached = true;
  }
  if(!counterListenerAttached){
    const target = window.document && typeof window.document.addEventListener === 'function'
      ? window.document
      : window;
    target.addEventListener('app:data:changed', updateCounter);
    counterListenerAttached = true;
  }
}

function applyColor(ms){
  if(!overlayEl) return;
  let bg = 'rgba(46, 204, 113, 0.9)';
  let textColor = '#0b1b13';
  if(ms >= 33){
    bg = 'rgba(231, 76, 60, 0.9)';
    textColor = '#ffffff';
  }else if(ms >= 16){
    bg = 'rgba(241, 196, 15, 0.92)';
    textColor = '#1f1600';
  }
  overlayEl.style.backgroundColor = bg;
  overlayEl.style.color = textColor;
}

export function noteRepaint(ms){
  if(window.__ENV__?.DEBUG !== true) return;
  const pill = ensureOverlay();
  if(!pill || typeof ms !== 'number' || Number.isNaN(ms)) return;
  updateCounter();
  applyColor(ms);
  if(msEl){
    const formatted = ms < 100 ? ms.toFixed(1) : Math.round(ms);
    msEl.textContent = `${formatted}ms`;
  }
  pill.style.opacity = String(PILL_OPACITY_ACTIVE);
  if(isVisible && pill.style.display === 'none'){
    pill.style.display = 'flex';
  }
  if(fadeTimer){
    clearTimeout(fadeTimer);
  }
  fadeTimer = window.setTimeout(() => {
    if(!overlayEl) return;
    overlayEl.style.opacity = String(PILL_OPACITY_IDLE);
  }, FADE_DELAY_MS);
}

export default { initDebugOverlay, noteRepaint };
