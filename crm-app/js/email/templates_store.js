const LS_KEY = 'emailtpl:v1';
const SUBSCRIBERS = new Set();
let STATE = { items: [] };
let writeTimer = null;

function sortItems() {
  STATE.items.sort((a, b) => {
    const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : 0;
    const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : 0;
    return bTime - aTime;
  });
  if (STATE.items.length > 200) STATE.items.length = 200;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        STATE = parsed;
      }
    }
  } catch {}
  if (!Array.isArray(STATE.items)) STATE.items = [];
  sortItems();
}

function saveDebounced() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(STATE));
    } catch {}
  }, 200);
}

function emit({ persist = true } = {}) {
  SUBSCRIBERS.forEach((fn) => {
    try {
      fn(STATE);
    } catch {}
  });
  if (persist) saveDebounced();
}

function uid() {
  return `tpl_${Math.random().toString(36).slice(2, 9)}`;
}

export const Templates = {
  list() {
    return STATE.items.slice();
  },
  get(id) {
    return STATE.items.find((item) => item.id === id) || null;
  },
  upsert(payload, { silent = false, skipSort = false } = {}) {
    const { id: incomingId, name, subject, body, fav } = payload || {};
    let id = incomingId;
    const now = Date.now();
    if (!id) id = uid();
    const index = STATE.items.findIndex((item) => item.id === id);
    const stamp = (payload && typeof payload.updatedAt === 'number') ? payload.updatedAt : now;
    const previous = index >= 0 ? STATE.items[index] : null;
    const record = {
      id,
      name: (typeof name === 'string' && name.length) ? name : (previous ? previous.name : 'Untitled'),
      subject: (typeof subject === 'string') ? subject : (previous ? previous.subject : ''),
      body: (typeof body === 'string') ? body : (previous ? previous.body : ''),
      fav: (typeof fav === 'boolean') ? fav : (previous ? !!previous.fav : false),
      updatedAt: stamp,
    };
    let stored;
    if (index >= 0) {
      stored = Object.assign(STATE.items[index], record);
      STATE.items[index] = stored;
    } else {
      stored = record;
      STATE.items.push(stored);
    }
    if (!skipSort) sortItems();
    if (!silent) emit();
    return stored;
  },
  remove(id) {
    const before = STATE.items.length;
    STATE.items = STATE.items.filter((item) => item.id !== id);
    if (STATE.items.length !== before) emit();
  },
  markFav(id, fav = true) {
    const record = this.get(id);
    if (!record) return;
    record.fav = !!fav;
    record.updatedAt = Date.now();
    sortItems();
    emit();
  },
  subscribe(fn) {
    SUBSCRIBERS.add(fn);
    try {
      fn(STATE);
    } catch {}
    return () => SUBSCRIBERS.delete(fn);
  },
  exportJSON() {
    return JSON.stringify(STATE.items, null, 2);
  },
  importJSON(json) {
    try {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) return false;
      arr.forEach((entry) => {
        this.upsert(entry, { silent: true, skipSort: true });
      });
      sortItems();
      emit();
      return true;
    } catch {
      return false;
    }
  },
};

load();
