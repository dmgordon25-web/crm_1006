
/* db.js — complete DB helpers (global, non-module) */
(function(){
  const globalScope = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));

  let core = globalScope && globalScope.__DB_CORE__ ? globalScope.__DB_CORE__ : null;
  if(!core){
    const DB_NAME_FALLBACK = 'crm';
    const DB_VERSION_FALLBACK = 3;
    let promise = null;
    const ensureStores = (db, tx) => {
      const ensure = (name, opts) => {
        if (!db.objectStoreNames.contains(name)) {
          return db.createObjectStore(name, opts);
        }
        try{
          return tx ? tx.objectStore(name) : null;
        }catch(_err){
          return null;
        }
      };
      const storeDefs = [
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
      storeDefs.forEach(def => ensure(def.name, def.opts));
      const relStore = ensure('relationships', { keyPath: 'id' });
      if(relStore){
        try{ if(!relStore.indexNames.contains('by_fromId')) relStore.createIndex('by_fromId', 'fromId', { unique: false }); }
        catch(_err){}
        try{ if(!relStore.indexNames.contains('by_toId')) relStore.createIndex('by_toId', 'toId', { unique: false }); }
        catch(_err){}
        try{ if(!relStore.indexNames.contains('by_edgeKey')) relStore.createIndex('by_edgeKey', 'edgeKey', { unique: true }); }
        catch(_err){}
      }
    };
    const fallbackGetDB = () => {
      if(promise) return promise;
      promise = new Promise((resolve, reject)=>{
        if(typeof indexedDB === 'undefined'){
          reject(new Error('IndexedDB unavailable'));
          return;
        }
        const req = indexedDB.open(DB_NAME_FALLBACK, DB_VERSION_FALLBACK);
        req.onupgradeneeded = () => {
          const db = req.result;
          const tx = req.transaction;
          ensureStores(db, tx);
        };
        req.onsuccess = () => {
          const db = req.result;
          try{
            const previous = typeof db.onclose === 'function' ? db.onclose : null;
            db.onclose = function(event){
              promise = null;
              if(previous){
                try{ previous.call(this, event); }
                catch(_err){}
              }
            };
          }catch(_err){}
          try{
            const originalClose = typeof db.close === 'function' ? db.close.bind(db) : null;
            if(originalClose){
              db.close = function(){
                promise = null;
                return originalClose();
              };
            }
          }catch(_err){}
          try{
            db.onversionchange = () => {
              try{ db.close(); }
              catch(_closeErr){}
            };
          }catch(_err){}
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
      return promise;
    };
    const fallbackUseDB = async (fn) => {
      try{
        const db = await fallbackGetDB();
        return await fn(db);
      }catch(err){
        if(String(err && err.name).toLowerCase() === 'versionerror'){
          const db = await fallbackGetDB();
          return await fn(db);
        }
        throw err;
      }
    };
    core = {
      DB_NAME: DB_NAME_FALLBACK,
      DB_VERSION: DB_VERSION_FALLBACK,
      getDB: fallbackGetDB,
      useDB: fallbackUseDB
    };
    if(globalScope) globalScope.__DB_CORE__ = core;
  }

  const DB_NAME = core.DB_NAME;
  const getDB = core.getDB;
  const useDB = core.useDB;

  const CORE_STORES = ['contacts','partners','tasks','documents','deals','commissions','settings','templates','notifications','docs','closings','meta'];
  const EXTRA_STORES = ['relationships','savedViews'];
  const STORES = CORE_STORES.concat(EXTRA_STORES);
  window.DB_META = { DB_NAME, STORES };

  function isPending(record){
    if(!record) return false;
    const value = Number(record.deletedAtPending);
    return Number.isFinite(value) && value > 0;
  }

  function isDeleted(record){
    if(!record) return false;
    if(record.isDeleted) return true;
    const value = Number(record.deletedAt);
    return Number.isFinite(value) && value > 0;
  }

  function normalizeOptions(opts){
    const options = (opts && typeof opts === 'object') ? opts : {};
    return {
      includePending: !!options.includePending,
      includeDeleted: !!options.includeDeleted
    };
  }

  function filterRecord(record, options){
    if(!record) return null;
    if(!options.includePending && isPending(record)) return null;
    if(!options.includeDeleted && isDeleted(record)) return null;
    return record;
  }

  function filterList(list, options){
    if(!Array.isArray(list)) return [];
    return list.filter(item => {
      if(!item) return false;
      if(!options.includePending && isPending(item)) return false;
      if(!options.includeDeleted && isDeleted(item)) return false;
      return true;
    });
  }

  async function openDB(){
    const db = await getDB();
    if (!window.__APP_DB__ || window.__APP_DB__ !== db) {
      window.__APP_DB__ = db;
      try{
        const previous = typeof db.onclose === 'function' ? db.onclose : null;
        db.onclose = function(event){
          if(previous){
            try{ previous.call(this, event); }
            catch(_err){}
          }
          if(window.__APP_DB__ === db) window.__APP_DB__ = null;
        };
      }catch(_err){ /* ignore */ }
    }
    return db;
  }

  function withStore(store, mode, fn){
    return useDB(db => new Promise((resolve, reject)=>{
      try{
        const tx = db.transaction([store], mode);
        const os = tx.objectStore(store);
        const result = fn(os);
        tx.oncomplete = ()=> resolve(result);
        tx.onerror = e => reject(e.target && e.target.error || e);
      }catch(e){ reject(e); }
    }));
  }

  function dbGet(store, id, opts){
    const options = normalizeOptions(opts);
    return withStore(store, 'readonly', os => new Promise((res,rej)=>{
      const r = os.get(id);
      r.onsuccess = ()=> {
        const value = filterRecord(r.result || null, options);
        res(value || null);
      };
      r.onerror = e => rej(e.target && e.target.error || e);
    }));
  }
  function dbGetAll(store, opts){
    const options = normalizeOptions(opts);
    return withStore(store, 'readonly', os => new Promise((res,rej)=>{
      const r = os.getAll();
      r.onsuccess = ()=> {
        const list = Array.isArray(r.result) ? r.result : [];
        res(filterList(list, options));
      };
      r.onerror = e => rej(e.target && e.target.error || e);
    }));
  }
  function dbPut(store, obj){
    if (!obj) return Promise.resolve();
    if (!obj.id) obj.id = String(Date.now()+Math.random());
    obj.id = String(obj.id);
    return withStore(store, 'readwrite', os => new Promise((res,rej)=>{
      const r = os.put(obj); r.onsuccess = ()=>res(); r.onerror = e => rej(e.target && e.target.error || e);
    }));
  }
  function dbBulkPut(store, list){
    list = Array.isArray(list) ? list : [];
    return withStore(store, 'readwrite', os => new Promise((res,rej)=>{
      let i=0;
      (function next(){
        if (i>=list.length) return res();
        const obj = list[i++] || {};
        if (!obj.id) obj.id = String(Date.now()+Math.random());
        obj.id = String(obj.id);
        const r = os.put(obj);
        r.onsuccess = next;
        r.onerror = e => rej(e.target && e.target.error || e);
      })();
    }));
  }
  function dbDelete(store, id){
    return withStore(store, 'readwrite', os => new Promise((res,rej)=>{
      const r=os.delete(id); r.onsuccess=()=>res(); r.onerror=e=>rej(e.target&&e.target.error||e);
    }));
  }
  function dbClear(store){
    return withStore(store, 'readwrite', os => new Promise((res,rej)=>{
      const r=os.clear(); r.onsuccess=()=>res(); r.onerror=e=>rej(e.target&&e.target.error||e);
    }));
  }
  async function dbExportAll(){
    const out = {};
    for(const s of STORES){
      out[s] = await dbGetAll(s, { includePending: true, includeDeleted: true });
    }
    return out;
  }
function clonePartner(record){
  if(!record) return record;
  if(typeof structuredClone === 'function'){
    try{ return structuredClone(record); }
    catch(_err){}
  }
  return JSON.parse(JSON.stringify(record));
}

function hasMergeValue(value){
  if(value === null || value === undefined) return false;
  if(typeof value === 'string') return value.trim().length > 0;
  if(typeof value === 'number') return Number.isFinite(value);
  if(typeof value === 'boolean') return true;
  if(Array.isArray(value)) return value.length > 0;
  if(typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

const PARTNER_MERGE_FIELDS = [
  'name','company','email','phone','tier','partnerType','focus','priority','preferredContact','cadence','address','city','state','zip','referralVolume','lastTouch','nextTouch','relationshipOwner','collaborationFocus','notes'
];

function scoreMergePartner(partner){
  if(!partner) return 0;
  let score = 0;
  PARTNER_MERGE_FIELDS.forEach(field => { if(hasMergeValue(partner[field])) score += 1; });
  if(partner.extras && typeof partner.extras === 'object'){ score += Object.keys(partner.extras).length; }
  return score;
}

function chooseKeepPartner(a, b, strategy){
  if(strategy && strategy.keepId){
    const keepKey = String(strategy.keepId);
    if(String(a && a.id) === keepKey) return { keep: a, drop: b };
    if(String(b && b.id) === keepKey) return { keep: b, drop: a };
  }
  const scoreA = scoreMergePartner(a);
  const scoreB = scoreMergePartner(b);
  if(scoreA > scoreB) return { keep: a, drop: b };
  if(scoreB > scoreA) return { keep: b, drop: a };
  const createdA = Number(a && a.createdAt) || Number.MAX_SAFE_INTEGER;
  const createdB = Number(b && b.createdAt) || Number.MAX_SAFE_INTEGER;
  if(createdA <= createdB) return { keep: a, drop: b };
  return { keep: b, drop: a };
}

function mergePartnerPayload(baseRecord, incomingRecord){
  const base = clonePartner(baseRecord) || {};
  const payload = clonePartner(incomingRecord) || {};
  const result = Object.assign({}, base);
  PARTNER_MERGE_FIELDS.forEach(field => { if(hasMergeValue(payload[field])) result[field] = payload[field]; });
  if(payload.extras || base.extras){ result.extras = Object.assign({}, base.extras || {}, payload.extras || {}); }
  if(hasMergeValue(payload.notes)){
    const a = String(base.notes || '').trim();
    const b = String(payload.notes || '').trim();
    if(!a) result.notes = b;
    else if(!b) result.notes = a;
    else if(a === b) result.notes = a;
    else {
      const stamp = new Date().toISOString().replace('T',' ').slice(0,16);
      result.notes = `${a}\\n\\n--- merged ${stamp} ---\\n${b}`;
    }
  }
  result.updatedAt = Date.now();
  result.id = base.id || payload.id;
  result.partnerId = base.partnerId || payload.partnerId || result.id;
  return result;
}

async function mergePartners(aId, bId, strategy){
  const idA = String(aId||'');
  const idB = String(bId||'');
  if(!idA || !idB) throw new Error('mergePartners requires two ids');
  if(idA === idB) return { keepId: idA, dropId: idB, merged: null, contacts: 0, relationships: 0 };
  const result = await useDB(async (db) => {
    const stores = Array.from(db.objectStoreNames || []);
    const names = ['partners','contacts'];
    if(stores.includes('relationships')) names.push('relationships');
    const tx = db.transaction(names, 'readwrite');
    const partnersStore = tx.objectStore('partners');
    const contactsStore = tx.objectStore('contacts');
    const relStore = names.includes('relationships') ? tx.objectStore('relationships') : null;
    const wrap = (request) => new Promise((resolve, reject)=>{
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event && event.target && event.target.error || request.error);
    });
    const [a, b] = await Promise.all([wrap(partnersStore.get(idA)), wrap(partnersStore.get(idB))]);
    if(!a || !b) throw new Error('Partners not found for merge');
    const { keep, drop } = chooseKeepPartner(a, b, strategy);
    if(!keep || !drop) throw new Error('Unable to resolve merge keep/drop');
    const merged = mergePartnerPayload(keep, drop);
    const contacts = await wrap(contactsStore.getAll());
    const updates = [];
    const dropKey = String(drop.id);
    const keepKey = String(keep.id);
    (contacts||[]).forEach(contact => {
      if(!contact || contact.id == null) return;
      let changed = false;
      if(String(contact.partnerId||'')===dropKey){ contact.partnerId = keepKey; changed = true; }
      if(String(contact.buyerPartnerId||'')===dropKey){ contact.buyerPartnerId = keepKey; changed = true; }
      if(String(contact.listingPartnerId||'')===dropKey){ contact.listingPartnerId = keepKey; changed = true; }
      if(Array.isArray(contact.partnerIds)){
        const nextIds = contact.partnerIds.map(pid => String(pid)===dropKey ? keepKey : pid);
        if(nextIds.join('|') !== contact.partnerIds.map(String).join('|')){
          contact.partnerIds = Array.from(new Set(nextIds.map(String)));
          changed = true;
        }
      }
      if(changed){ contact.updatedAt = Date.now(); updates.push(contact); }
    });
    for(const contact of updates){ await wrap(contactsStore.put(contact)); }
    const relUpdates = [];
    if(relStore){
      const edges = await wrap(relStore.getAll());
      (edges||[]).forEach(edge => {
        if(!edge) return;
        let changed = false;
        if(String(edge.fromId||'')===dropKey){ edge.fromId = keepKey; changed = true; }
        if(String(edge.toId||'')===dropKey){ edge.toId = keepKey; changed = true; }
        if(changed){
          const from = String(edge.fromId||'');
          const to = String(edge.toId||'');
          if(from && to){
            const ordered = from < to ? [from,to] : [to,from];
            edge.edgeKey = ordered.join('::');
          }
          edge.updatedAt = Date.now();
          relUpdates.push(edge);
        }
      });
      for(const rel of relUpdates){ await wrap(relStore.put(rel)); }
    }
    await wrap(partnersStore.put(merged));
    const completion = new Promise((resolve, reject)=>{
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => reject(event && event.target && event.target.error || new Error('merge tx failed'));
      tx.onabort = (event) => reject(event && event.target && event.target.error || new Error('merge tx aborted'));
    });
    await completion;
    return { keep, drop, merged, contactsUpdated: updates.length, relationshipsUpdated: relUpdates.length };
  });
  const keepId = String(result.keep.id);
  const dropId = String(result.drop.id);
  if(typeof window.softDelete === 'function'){
    try{ await window.softDelete('partners', dropId, { source:'partners:merge', keepId }); }
    catch(_err){ await dbDelete('partners', dropId); }
  }else{
    await dbDelete('partners', dropId);
  }
  try{
    const detail = { scope:'partners', action:'merge', keepId, dropId, contacts:result.contactsUpdated, relationships:result.relationshipsUpdated };
    if(typeof window.dispatchAppDataChanged === 'function'){ window.dispatchAppDataChanged(detail); }
    else if(window.document){ window.document.dispatchEvent(new CustomEvent('app:data:changed',{detail})); }
  }catch(_err){}
  return { keepId, dropId, mergedId: keepId, contacts: result.contactsUpdated, relationships: result.relationshipsUpdated };
}

  async function dbRestoreAll(snapshot, mode){
    const data = snapshot || {};
    const restoreMode = mode === 'replace' ? 'replace' : 'merge';
    if(restoreMode === 'replace'){
      for(const s of STORES){ await dbClear(s); }
    }
    for(const s of STORES){
      const incoming = Array.isArray(data[s]) ? data[s] : [];
      if(!incoming.length){ continue; }
      if(restoreMode === 'replace'){
        const rows = incoming.filter(row => row && row.id!=null);
        if(rows.length) await dbBulkPut(s, rows);
        continue;
      }
      const existing = await dbGetAll(s);
      const existingMap = new Map(existing.map(rec => [String(rec.id), rec]));
      const merged = [];
      for(const row of incoming){
        if(!row || row.id==null) continue;
        const key = String(row.id);
        const prev = existingMap.get(key);
        if(prev){
          const next = Object.assign({}, prev, row);
          if(prev.extras || row.extras){
            next.extras = Object.assign({}, prev.extras||{}, row.extras||{});
          }
          merged.push(next);
          existingMap.delete(key);
        }else{
          merged.push(Object.assign({}, row));
        }
      }
      if(merged.length) await dbBulkPut(s, merged);
    }
  }

  // expose
  window.openDB = openDB;
  window.withStore = withStore;
  window.dbGet = dbGet;
  window.dbGetAll = dbGetAll;
  window.dbPut = dbPut;
  window.dbBulkPut = dbBulkPut;
  window.dbDelete = dbDelete;
  window.dbClear = dbClear;
  window.dbExportAll = dbExportAll;
  window.dbRestoreAll = dbRestoreAll;
  window.mergePartners = mergePartners;
  window.STORES = STORES;
})();
