/* eslint-disable no-console */
// Simple, durable notifier with stable queue shape + change events.
const EVT = 'notifications:changed';
const KEY = 'notifications:queue';

const GLOBAL = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

function safeParse(json) {
  try { return JSON.parse(json); } catch (_err) { return null; }
}

function readStorage() {
  try {
    const storage = GLOBAL?.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return [];
    const raw = storage.getItem(KEY);
    const arr = safeParse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_err) {
    return [];
  }
}

function writeStorage(list) {
  try {
    const storage = GLOBAL?.localStorage;
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(KEY, JSON.stringify(list || []));
  } catch (_err) {
    // ignore persistence failures
  }
}

function normalizeItem(x) {
  if (!x || typeof x !== 'object') return null;
  const id = x.id || x.uuid || x.key || String(Date.now() + Math.random());
  const ts = Number(x.ts || x.time || Date.now());
  const type = String(x.type || 'info');
  const title = String(x.title || x.message || '');
  const meta = (x.meta && typeof x.meta === 'object') ? x.meta : {};
  return { id, ts, type, title, meta };
}

const Notifier = (function createNotifier() {
  const scope = GLOBAL || {};
  let queue = Array.isArray(scope.__NOTIF_QUEUE__) ? scope.__NOTIF_QUEUE__ : null;
  if (!queue) {
    queue = readStorage();
    scope.__NOTIF_QUEUE__ = queue;
  }

  function emit() {
    writeStorage(queue);
    try { scope.dispatchEvent?.(new CustomEvent(EVT)); } catch (_err) {}
  }

  return {
    getCount() { return Array.isArray(queue) ? queue.length : 0; },
    list() { return Array.isArray(queue) ? queue.slice() : []; },
    push(item) {
      const n = normalizeItem(item);
      if (!n) return false;
      queue.push(n);
      emit();
      return true;
    },
    replace(list) {
      const next = Array.isArray(list) ? list.map(normalizeItem).filter(Boolean) : [];
      queue.length = 0;
      Array.prototype.push.apply(queue, next);
      emit();
      return queue.length;
    },
    remove(id) {
      if (!id) return false;
      const before = queue.length;
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (queue[i]?.id === id) queue.splice(i, 1);
      }
      if (queue.length !== before) emit();
      return before !== queue.length;
    },
    clear() {
      if (!queue.length) return 0;
      const n = queue.length;
      queue.length = 0;
      emit();
      return n;
    },
    onChanged(handler) {
      if (typeof handler !== 'function') return () => {};
      try { scope.addEventListener?.(EVT, handler); } catch (_err) {}
      return () => { try { scope.removeEventListener?.(EVT, handler); } catch (_err) {}; };
    }
  };
})();

(GLOBAL || {}).Notifier = (GLOBAL || {}).Notifier || Notifier;
export const getNotificationsCount = () => Notifier.getCount();
export const listNotifications       = () => Notifier.list();
export const pushNotification        = (item) => Notifier.push(item);
export const replaceNotifications    = (list) => Notifier.replace(list);
export const removeNotification      = (id) => Notifier.remove(id);
export const clearNotifications      = () => Notifier.clear();
export const onNotificationsChanged  = (h) => Notifier.onChanged(h);
export default Notifier;
