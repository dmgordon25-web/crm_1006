import { PIPELINE_STAGES, NORMALIZE_STAGE, stageKeyFromLabel } from '/js/pipeline/stages.js';

let WIRED = false;
let WIRED_BOARD = null;

const STAGE_LABEL_SET = new Set(PIPELINE_STAGES);
const KEY_TO_LABEL = new Map();
PIPELINE_STAGES.forEach((label) => {
  KEY_TO_LABEL.set(stageKeyFromLabel(label), label);
});

function normStage(s){
  if(!s) return null;
  const raw = String(s).trim();
  if(!raw) return null;
  const lowered = raw.toLowerCase();
  if(KEY_TO_LABEL.has(lowered)) return KEY_TO_LABEL.get(lowered);
  const slug = lowered.replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'');
  if(KEY_TO_LABEL.has(slug)) return KEY_TO_LABEL.get(slug);
  const normalized = NORMALIZE_STAGE(raw);
  if(STAGE_LABEL_SET.has(normalized)) return normalized;
  return null;
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
      if(st) el.dataset.stage = stageKeyFromLabel(st);
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
  if(!contactId || !newStage) return false;
  const normalizedLabel = NORMALIZE_STAGE(newStage);
  const stageKey = stageKeyFromLabel(normalizedLabel);

  const scope = (typeof window !== 'undefined' && window) ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  let dbm = null;
  try {
    dbm = await import('/js/db.js');
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
  const currentKey = stageKeyFromLabel(row.stage);
  if(currentKey === stageKey && row.stage === stageKey) return true;

  row.stage = stageKey;
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
    const laneKey = stageKeyFromLabel(st);
    try{
      const raw = e.dataTransfer?.getData('text/plain'); if(!raw) return;
      const payload = JSON.parse(raw || '{}');
      if(payload.type !== 'contact') return;
      const ok = await persistStage(payload.id, st);
      if(ok){
        // Move the card DOM immediately for responsiveness (data repaint will reconcile)
        const card = root.querySelector(`[data-id="${payload.id}"]`);
        if(card && lane){
          const list = lane.querySelector('[data-list], .lane-list, .kanban-list, .cards');
          if(list) list.appendChild(card);
          try{ card.dataset.stage = laneKey; }catch(_){ }
        }
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

