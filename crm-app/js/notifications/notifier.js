const LS_KEY = 'notif:v1';
const MAX_ITEMS = 200;
const SUBS = new Set();
let STATE = { items: [], unread: 0 };
let writeTimer = null;
let coalesceTimer = null;
let coalesceBucket = null; // {type:'data-change', n:number, at}

function now(){ return Date.now(); }
function load(){
  try { STATE = JSON.parse(localStorage.getItem(LS_KEY)) || STATE; }
  catch(_) {}
  recount();
}
function saveDebounced(){
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch(_) {}
    writeTimer = null;
  }, 250);
}
function recount(){
  STATE.unread = STATE.items.reduce((a,x)=>a + (x.read?0:1), 0);
}
function notify(){
  recount();
  saveDebounced();
  SUBS.forEach(fn => { try{ fn(STATE); }catch(_){} });
}
function pushRaw(item){
  STATE.items.unshift(item);
  if (STATE.items.length > MAX_ITEMS) STATE.items.length = MAX_ITEMS;
  notify();
}
function coalesceDataChanged(detail){
  const at = now();
  if (!coalesceBucket) {
    coalesceBucket = { type:'data-change', n:1, at, title:'Data updated', read:false, id:`dc:${at}` };
  } else {
    coalesceBucket.n += 1;
    coalesceBucket.at = at;
  }
  clearTimeout(coalesceTimer);
  coalesceTimer = setTimeout(() => {
    const msg = coalesceBucket.n === 1 ? 'Data updated' : `Data updated (${coalesceBucket.n} changes)`;
    pushRaw({ id: coalesceBucket.id, type: 'data-change', title: msg, at: coalesceBucket.at, read:false });
    coalesceBucket = null;
  }, 700); // batch bursts
}

export function markAllRead(){
  const hadItems = STATE.items.length > 0 || STATE.unread > 0 || !!coalesceBucket;
  STATE.items = [];
  STATE.unread = 0;
  coalesceBucket = null;
  clearTimeout(coalesceTimer); coalesceTimer = null;
  notify();
  if(writeTimer){
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try { localStorage.removeItem(LS_KEY); }
  catch(_){ }
}

// Public API
export const Notifier = {
  list(){ return STATE.items.slice(); },
  unread(){ return STATE.unread|0; },
  push({ type='info', title, at=now(), read=false, id }){
    if (!title) return;
    pushRaw({ id: id || `${type}:${at}:${Math.random().toString(36).slice(2,7)}`, type, title, at, read });
  },
  markAllRead(){ markAllRead(); },
  clearAll(){ markAllRead(); },
  subscribe(fn){ SUBS.add(fn); fn(STATE); return () => SUBS.delete(fn); }
};

// Boot
load();

// Listen to likely sources; do not modify those modules.
if(typeof document !== 'undefined'){
  document.addEventListener('app:data:changed', (e) => {
    coalesceDataChanged(e && e.detail);
  });
  document.addEventListener('importer:status', (e) => {
    const d = e && e.detail || {};
    if (d && d.phase) Notifier.push({ type:'import', title:`Import ${d.phase}` });
  });
  document.addEventListener('seed:done', () => {
    Notifier.push({ type:'seed', title:'Seed completed' });
  });
}

// Hook to RenderGuard to repaint badge only once per notification changes
try {
  if (window.RenderGuard && typeof window.RenderGuard.registerHook === 'function') {
    Notifier.subscribe(() => { window.RenderGuard.requestRender && window.RenderGuard.requestRender(); });
  }
} catch(_) {}
