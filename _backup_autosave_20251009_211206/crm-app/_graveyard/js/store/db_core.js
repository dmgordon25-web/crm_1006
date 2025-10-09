export const DB_NAME = 'crm';
export const DB_VERSION = 3; // set to the HIGHEST version used anywhere today

let _dbPromise = null;

export function getDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      const ensure = (name, opts) => {
        if (!db.objectStoreNames.contains(name)) {
          return db.createObjectStore(name, opts);
        }
        try {
          return tx ? tx.objectStore(name) : null;
        } catch (_err) {
          return null;
        }
      };
      const stores = [
        { name: 'contacts', opts: { keyPath: 'id' } },
        { name: 'partners', opts: { keyPath: 'id' } },
        { name: 'tasks', opts: { keyPath: 'id' } },
        { name: 'documents', opts: { keyPath: 'id' } },
        { name: 'commissions', opts: { keyPath: 'id' } },
        { name: 'notifications', opts: { keyPath: 'id' } },
        { name: 'closings', opts: { keyPath: 'id' } },
        { name: 'settings', opts: { keyPath: 'id' } },
        { name: 'templates', opts: { keyPath: 'id' } },
        { name: 'meta', opts: { keyPath: 'id' } },
        { name: 'docs', opts: { keyPath: 'id' } },
        { name: 'deals', opts: { keyPath: 'id' } },
        { name: 'events', opts: { keyPath: 'id' } },
        { name: 'savedViews', opts: { keyPath: 'id' } }
      ];
      stores.forEach((def) => ensure(def.name, def.opts));
      const relStore = ensure('relationships', { keyPath: 'id' });
      if (relStore) {
        try { if (!relStore.indexNames.contains('by_fromId')) relStore.createIndex('by_fromId', 'fromId', { unique: false }); } catch (_err) {}
        try { if (!relStore.indexNames.contains('by_toId')) relStore.createIndex('by_toId', 'toId', { unique: false }); } catch (_err) {}
        try { if (!relStore.indexNames.contains('by_edgeKey')) relStore.createIndex('by_edgeKey', 'edgeKey', { unique: true }); } catch (_err) {}
      }
      // TODO: add any missing indices if absent (wrap in try/catch for idempotency).
    };
    req.onsuccess = () => {
      const db = req.result;
      const reset = () => { _dbPromise = null; };
      try {
        const previous = typeof db.onclose === 'function' ? db.onclose : null;
        db.onclose = function(event){
          reset();
          if(previous){
            try { previous.call(this, event); }
            catch (_err) {}
          }
        };
      } catch (_err) {}
      try {
        const originalClose = typeof db.close === 'function' ? db.close.bind(db) : null;
        if(originalClose){
          db.close = function(){
            reset();
            return originalClose();
          };
        }
      } catch (_err) {}
      try {
        db.onversionchange = () => {
          try { db.close(); }
          catch (_closeErr){}
        };
      } catch (_err) {}
      resolve(db);
    };
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

// Helper that tolerates a lower-version open attempted elsewhere.
export async function useDB(fn) {
  try {
    const db = await getDB();
    return await fn(db);
  } catch (e) {
    if (String(e?.name).toLowerCase() === 'versionerror') {
      const db = await getDB();
      return await fn(db);
    }
    throw e;
  }
}

const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
const coreExports = { DB_NAME, DB_VERSION, getDB, useDB };
if (globalScope && !globalScope.__DB_CORE__) {
  globalScope.__DB_CORE__ = coreExports;
}
