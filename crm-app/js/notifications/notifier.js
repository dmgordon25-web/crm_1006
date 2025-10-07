/* eslint-disable no-console */
// Simple, durable notifier with stable queue shape + change events.
const EVT = "notifications:changed";
const KEY = "notifications:queue";

function safeParse(json) {
  try { return JSON.parse(json); } catch(_) { return null; }
}

function readStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = safeParse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch(_) { return []; }
}

function writeStorage(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list || [])); } catch(_) {}
}

function normalizeItem(x) {
  if (!x || typeof x !== "object") return null;
  const id = x.id || x.uuid || x.key || String(Date.now() + Math.random());
  const ts = Number(x.ts || x.time || Date.now());
  const type = String(x.type || "info");
  const title = String(x.title || x.message || "");
  const meta = (x.meta && typeof x.meta === "object") ? x.meta : {};
  return { id, ts, type, title, meta };
}

const Notifier = (function() {
  // In-memory cache; always keep an Array
  let queue = Array.isArray(window.__NOTIF_QUEUE__) ? window.__NOTIF_QUEUE__ : null;
  if (!queue) {
    queue = readStorage();
    window.__NOTIF_QUEUE__ = queue; // keep a single reference
  }

  function emit() {
    writeStorage(queue);
    try { window.dispatchEvent(new CustomEvent(EVT)); } catch(_) {}
  }

  return {
    getCount() { return Array.isArray(queue) ? queue.length : 0; },
    list() { return Array.isArray(queue) ? queue.slice() : []; },
    push(item) {
      const n = normalizeItem(item);
      if (!n) return false;
      queue.push(n);
      emit(); return true;
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
      // FIX: never use reduce on undefined
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i]?.id === id) queue.splice(i, 1);
      if (queue.length !== before) emit();
      return before !== queue.length;
    },
    clear() {
      if (!queue.length) return 0;
      const n = queue.length;
      queue.length = 0;
      emit(); return n;
    },
    onChanged(handler) {
      try { window.addEventListener(EVT, handler); } catch(_) {}
      return () => { try { window.removeEventListener(EVT, handler); } catch(_) {} };
    }
  };
})();

// Expose a stable global and named exports
window.Notifier = window.Notifier || Notifier;
export const getNotificationsCount = () => Notifier.getCount();
export const listNotifications       = () => Notifier.list();
export const pushNotification        = (item) => Notifier.push(item);
export const replaceNotifications    = (list) => Notifier.replace(list);
export const removeNotification      = (id) => Notifier.remove(id);
export const clearNotifications      = () => Notifier.clear();
export const onNotificationsChanged  = (h) => Notifier.onChanged(h);
export default Notifier;
