const SCOPES = new Map();
const SUBSCRIBERS = new Set();
const MUTATION_EVENT = 'app:data:changed';
const EVENT_DETAIL = { scope: 'selection' };

function normalizeScope(scope) {
  return typeof scope === 'string' && scope.trim() ? scope.trim() : 'default';
}

function cloneIds(set) {
  return new Set(Array.from(set));
}

function ensureScope(scope) {
  const key = normalizeScope(scope);
  if (!SCOPES.has(key)) {
    SCOPES.set(key, new Set());
  }
  return SCOPES.get(key);
}

function notify(scope) {
  const snapshot = { scope: normalizeScope(scope), ids: cloneIds(ensureScope(scope)) };
  SUBSCRIBERS.forEach((fn) => {
    try {
      fn({ scope: snapshot.scope, ids: cloneIds(snapshot.ids), count: snapshot.ids.size });
    } catch (err) {
      console.warn('[SelectionStore] subscriber failed', err);
    }
  });
  try {
    const detail = { ...EVENT_DETAIL, selectionScope: snapshot.scope, ids: Array.from(snapshot.ids) };
    if (typeof window !== 'undefined' && typeof window.dispatchAppDataChanged === 'function') {
      window.dispatchAppDataChanged(detail);
      return;
    }
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent(MUTATION_EVENT, { detail }));
      return;
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent(MUTATION_EVENT, { detail }));
    }
  } catch (err) {
    console.warn('[SelectionStore] dispatch failed', err);
  }
}

function setsAreEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export const SelectionStore = {
  get(scope) {
    return cloneIds(ensureScope(scope));
  },
  count(scope) {
    return ensureScope(scope).size;
  },
  isSelected(id, scope) {
    if (id == null) return false;
    return ensureScope(scope).has(String(id));
  },
  set(ids, scope) {
    const key = normalizeScope(scope);
    const next = Array.isArray(ids) || ids instanceof Set ? new Set(Array.from(ids).map(String)) : new Set();
    const target = ensureScope(key);
    if (setsAreEqual(target, next)) return;
    SCOPES.set(key, next);
    notify(key);
  },
  toggle(id, scope) {
    if (id == null) return;
    const key = normalizeScope(scope);
    const target = ensureScope(key);
    const strId = String(id);
    const next = new Set(target);
    if (next.has(strId)) {
      next.delete(strId);
    } else {
      next.add(strId);
    }
    if (setsAreEqual(target, next)) return;
    SCOPES.set(key, next);
    notify(key);
  },
  clear(scope) {
    const key = normalizeScope(scope);
    const next = new Set();
    SCOPES.set(key, next);
    notify(key);
  },
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    SUBSCRIBERS.add(fn);
    return () => {
      SUBSCRIBERS.delete(fn);
    };
  }
};

if (typeof window !== 'undefined') {
  if (!window.SelectionStore) {
    window.SelectionStore = SelectionStore;
  }
}
