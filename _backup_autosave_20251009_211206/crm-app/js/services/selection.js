const selectionIds = new Set();
let selectionType = 'contacts';
const subscribers = new Set();
const microtask = typeof queueMicrotask === 'function'
  ? queueMicrotask
  : (cb) => Promise.resolve().then(cb);
let emitScheduled = false;
let pendingReason = 'selection';
let forceNextEmit = false;
let lastSignature = '';

const metaById = new Map();

function normalizeType(raw) {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'partner' || value === 'partners') return 'partners';
  if (value === 'longshot' || value === 'longshots' || value === 'pipeline') return 'contacts';
  if (value === 'calendar' || value === 'events') return 'calendar';
  if (value === 'tasks' || value === 'task') return 'tasks';
  return 'contacts';
}

function computeSignature() {
  const sorted = Array.from(selectionIds).sort().join('|');
  return `${selectionType}#${sorted}`;
}

function snapshotPayload(reason) {
  const ids = getSelection();
  return {
    ids,
    type: selectionType,
    scope: selectionType,
    count: ids.length,
    reason,
    items: new Map(metaById),
  };
}

function flush(reason) {
  emitScheduled = false;
  const signature = computeSignature();
  if (!forceNextEmit && signature === lastSignature) {
    pendingReason = 'selection';
    return;
  }
  lastSignature = signature;
  const payload = snapshotPayload(reason || pendingReason);
  const detail = {
    source: payload.reason,
    selectionCount: payload.count,
    selectionType,
    ids: payload.ids.slice(),
  };

  try {
    if (typeof window !== 'undefined' && typeof window.dispatchAppDataChanged === 'function') {
      window.dispatchAppDataChanged(detail);
    } else if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
    }
  } catch (err) {
    if (window?.__DEV__) console.warn('[selection] dispatch failed', err);
  }

  subscribers.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      if (window?.__DEV__) console.warn('[selection] subscriber failed', err);
    }
  });

  pendingReason = 'selection';
  forceNextEmit = false;
}

function scheduleEmit(reason, force = false) {
  pendingReason = reason || pendingReason || 'selection';
  if (force) forceNextEmit = true;
  if (emitScheduled) return;
  emitScheduled = true;
  microtask(() => flush(pendingReason));
}

function ensureType(type) {
  if (!type) return;
  const normalized = normalizeType(type);
  if (!selectionIds.size) {
    selectionType = normalized;
    return;
  }
  if (selectionType !== normalized) {
    selectionIds.clear();
    metaById.clear();
    selectionType = normalized;
    lastSignature = '';
  }
}

function addIds(values) {
  let changed = false;
  for (const value of values) {
    if (value == null) continue;
    const id = String(value);
    if (!id) continue;
    if (!selectionIds.has(id)) {
      selectionIds.add(id);
      metaById.set(id, { type: selectionType });
      changed = true;
    }
  }
  return changed;
}

function removeIds(values) {
  let changed = false;
  for (const value of values) {
    if (value == null) continue;
    const id = String(value);
    if (!selectionIds.has(id)) continue;
    selectionIds.delete(id);
    metaById.delete(id);
    changed = true;
  }
  if (!selectionIds.size) {
    selectionType = 'contacts';
  }
  return changed;
}

export function getSelection() {
  return Array.from(selectionIds);
}

export function getSelectionCount() {
  return selectionIds.size;
}

export function getSelectionType() {
  return selectionType;
}

export function isSelected(id) {
  if (id == null) return false;
  return selectionIds.has(String(id));
}

export function select(ids, type, reason = 'select') {
  ensureType(type || selectionType);
  const list = Array.isArray(ids) ? ids : [ids];
  if (addIds(list)) scheduleEmit(reason);
  return selectionIds.size;
}

export function deselect(ids, _type, reason = 'deselect') {
  const list = Array.isArray(ids) ? ids : [ids];
  if (removeIds(list)) scheduleEmit(reason);
  return selectionIds.size;
}

export function toggle(id, type, reason = 'toggle') {
  if (id == null) return selectionIds.size;
  ensureType(type || selectionType);
  const key = String(id);
  if (selectionIds.has(key)) {
    selectionIds.delete(key);
    metaById.delete(key);
    if (!selectionIds.size) selectionType = 'contacts';
  } else {
    selectionIds.add(key);
    metaById.set(key, { type: selectionType });
  }
  scheduleEmit(reason);
  return selectionIds.size;
}

export function clear(reason = 'clear') {
  if (!selectionIds.size && selectionType === 'contacts') return 0;
  selectionIds.clear();
  metaById.clear();
  selectionType = 'contacts';
  lastSignature = '';
  scheduleEmit(reason, true);
  return 0;
}

export function set(ids, type, reason = 'set') {
  const list = Array.isArray(ids)
    ? ids
    : ids && typeof ids.forEach === 'function'
      ? Array.from(ids)
      : ids || ids === 0
        ? [ids]
        : [];
  ensureType(type || selectionType);
  selectionIds.clear();
  metaById.clear();
  addIds(list);
  scheduleEmit(reason, true);
  return selectionIds.size;
}

export function get(scope) {
  const normalized = scope ? normalizeType(scope) : selectionType;
  const ids = normalized === selectionType ? getSelection() : [];
  return new Set(ids);
}

export function snapshot() {
  return snapshotPayload('snapshot');
}

export function restore(payload, reason = 'restore') {
  if (!payload || typeof payload !== 'object') {
    clear(reason);
    return;
  }
  const { ids, type } = payload;
  set(ids || [], type || selectionType, reason);
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function unsubscribe(fn) {
  subscribers.delete(fn);
}

export function emit(reason = 'selection') {
  scheduleEmit(reason, true);
}

export function reemit(reason = 'selection') {
  emit(reason);
}

export const ids = selectionIds;
export const items = metaById;

export function getIds() {
  return getSelection();
}

export function getSelectedIds() {
  return getSelection();
}

export function count(scope) {
  if (!scope) return getSelectionCount();
  return normalizeType(scope) === selectionType ? selectionIds.size : 0;
}

export function size(scope) {
  return count(scope);
}

export function add(id, type, reason = 'add') {
  return select(id, type, reason);
}

export function remove(id, _type, reason = 'remove') {
  return deselect(id, _type, reason);
}

export const del = remove;

export function isAnySelected() {
  return selectionIds.size > 0;
}

if (typeof window !== 'undefined') {
  const api = {
    getSelection,
    getSelectionCount,
    getSelectionType,
    isSelected,
    select,
    deselect,
    toggle,
    clear,
    set,
    get,
    snapshot,
    restore,
    subscribe,
    unsubscribe,
    emit,
    reemit,
    ids: selectionIds,
    items: metaById,
    getIds,
    getSelectedIds,
    count,
    size,
    add,
    remove,
    del,
    isAnySelected,
  };
  window.selectionService = api;
  window.SelectionService = api;
  window.Selection = api;
}

export default {
  getSelection,
  getSelectionCount,
  getSelectionType,
  isSelected,
  select,
  deselect,
  toggle,
  clear,
  set,
  get,
  snapshot,
  restore,
  subscribe,
  unsubscribe,
  emit,
  reemit,
  getIds,
  getSelectedIds,
  count,
  size,
  add,
  remove,
  del,
  isAnySelected,
  ids: selectionIds,
  items: metaById,
};
