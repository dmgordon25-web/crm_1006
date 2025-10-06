let WIRED = false;
let WIRED_BOARD = null;

const STAGES = [
  'New','Application','Pre-Approved','Processing',
  'Underwriting','Approved','CTC','Funded'
];

function normStage(s){
  if(!s) return null;
  s = String(s).trim();
  // loose matches & aliases
  const map = {
    'pre approved':'Pre-Approved', 'preapproved':'Pre-Approved', 'pre-approval':'Pre-Approved',
    'clear to close':'CTC', 'clear-to-close':'CTC', 'ctc':'CTC'
  };
  const k = s.toLowerCase();
  if(map[k]) return map[k];
  // direct match ignoring case
  const hit = STAGES.find(x => x.toLowerCase() === k);
  return hit || null;
}

function boardEl(){ return document.querySelector('[data-kanban], #kanban, .kanban-board'); }

function lanes(){
  const root = boardEl();
  if(!root) return [];
  const items = Array.from(root.querySelectorAll('[data-stage],[data-lane],[data-column]'));
  // If markup lacks attributes, infer from header text and stamp data-stage (JS-only, no HTML edits)
  items.forEach(el => {
    if(!el.dataset.stage){
      const h = el.getAttribute('aria-label') || el.querySelector('h3,h4,header')?.textContent || '';
      const st = normStage(h);
      if(st) el.dataset.stage = st;
    }
  });
  return items.filter(el => normStage(el.dataset.stage));
}

function cards(){
  const root = boardEl();
  if(!root) return [];
  const list = Array.from(root.querySelectorAll('[data-id].kanban-card, [data-id][data-type="contact"], .kanban-card [data-id]'))
    .map(el => el.closest('[data-id]'));
  // make draggable
  list.forEach(el => { try{ el.setAttribute('draggable','true'); }catch(_){ } });
  return list.filter(Boolean);
}

function cardId(el){
  if(!el) return null;
  const id = el.getAttribute('data-id') || el.dataset.id || el.getAttribute('data-contact-id') || el.dataset.contactId;
  return id ? String(id) : null;
}

let pending = new Set();
let flushScheduled = false;

function scheduleFlush(){
  if(flushScheduled) return;
  flushScheduled = true;
  const qmt = (typeof queueMicrotask==='function') ? queueMicrotask : (fn)=>Promise.resolve().then(fn);
  qmt(async () => {
    flushScheduled = false;
    if(pending.size === 0) return;
    // Emit exactly one change for the batch
    try{
      if (typeof window.dispatchAppDataChanged === 'function'){
        window.dispatchAppDataChanged({ scope:'pipeline', ids:[...pending] });
      } else {
        document.dispatchEvent(new CustomEvent('app:data:changed',{ detail:{ scope:'pipeline', ids:[...pending] }}));
      }
    } finally {
      pending.clear();
    }
  });
}

async function persistStage(contactId, newStage){
  const st = normStage(newStage);
  if(!contactId || !st) return false;

  const scope = (typeof window !== 'undefined' && window) ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  let dbm = null;
  try {
    dbm = await import('../db.js');
  } catch(_err) {
    dbm = null;
  }

  const pickFn = (...candidates) => {
    for (const fn of candidates) {
      if (typeof fn === 'function') return fn;
    }
    return null;
  };

  const openDBFn = pickFn(dbm?.openDB, scope?.openDB);
  if(!openDBFn) return false;
  await openDBFn();

  const get = pickFn(
    dbm?.dbGetContact,
    dbm?.getContact,
    dbm?.dbContactById,
    typeof dbm?.dbGet === 'function' ? (id) => dbm.dbGet('contacts', id) : null,
    scope?.dbGetContact,
    scope?.getContact,
    scope?.dbContactById,
    typeof scope?.dbGet === 'function' ? (id) => scope.dbGet('contacts', id) : null
  );

  const put = pickFn(
    dbm?.dbPutContact,
    dbm?.putContact,
    dbm?.saveContact,
    typeof dbm?.dbPut === 'function' ? (row) => dbm.dbPut('contacts', row) : null,
    scope?.dbPutContact,
    scope?.putContact,
    scope?.saveContact,
    typeof scope?.dbPut === 'function' ? (row) => scope.dbPut('contacts', row) : null
  );

  if(!get || !put) return false;

  let row = null;
  try {
    row = await get(contactId);
  } catch(_err) {
    row = null;
  }
  if(!row) return false;
  if(normStage(row.stage) === st) return true;

  row.stage = st;
  row.updatedAt = Date.now();
  try {
    await put(row);
  } catch(_err) {
    return false;
  }
  pending.add(contactId);
  scheduleFlush();
  return true;
}

function installDnD(){
  const root = boardEl(); if(!root) return;
  if (WIRED && WIRED_BOARD && WIRED_BOARD !== root) { WIRED = false; }
  if (WIRED) return; WIRED = true; WIRED_BOARD = root;

  root.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-id]');
    if(!card) return;
    const id = cardId(card); if(!id) return;
    e.dataTransfer?.setData('text/plain', JSON.stringify({ type:'contact', id }));
    // visual cue
    e.dataTransfer?.setDragImage?.(card, 10, 10);
  });

  root.addEventListener('dragover', (e) => {
    const lane = e.target.closest('[data-stage],[data-lane],[data-column]');
    if(!lane) return;
    const st = normStage(lane.dataset.stage); if(!st) return;
    e.preventDefault(); // allow drop
  });

  root.addEventListener('drop', async (e) => {
    const lane = e.target.closest('[data-stage],[data-lane],[data-column]');
    if(!lane) return;
    const st = normStage(lane.dataset.stage); if(!st) return;
    try{
      const raw = e.dataTransfer?.getData('text/plain'); if(!raw) return;
      const payload = JSON.parse(raw || '{}');
      if(payload.type !== 'contact') return;
      const ok = await persistStage(payload.id, st);
      if(ok){
        // Move the card DOM immediately for responsiveness (data repaint will reconcile)
        const card = root.querySelector(`[data-id="${payload.id}"]`);
        if(card && lane) lane.querySelector('[data-list], .lane-list, .kanban-list, .cards')?.appendChild(card);
      }
    }catch(_){ }
  });
}

// Public API (for tests)
export function wireKanbanDnD(){
  // stamp stage attributes if missing, then install handlers
  lanes(); cards();
  installDnD();
}

// Auto-wire after render
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => wireKanbanDnD(), { once:true });
} else {
  wireKanbanDnD();
}

try {
  // Re-wire on our render guard
  if (window.RenderGuard && typeof window.RenderGuard.registerHook === 'function') {
    window.RenderGuard.registerHook(() => wireKanbanDnD());
  }
} catch(_) {}

