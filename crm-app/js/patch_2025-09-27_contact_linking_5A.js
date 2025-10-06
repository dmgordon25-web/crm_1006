export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_contact_linking_5A';
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('js/patch_2025-09-27_contact_linking_5A.js')){
    window.__PATCHES_LOADED__.push('js/patch_2025-09-27_contact_linking_5A.js');
  }

  const queueMicro = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn)=>Promise.resolve().then(fn);

  const RenderGuard = window.RenderGuard || {
    enter(){},
    exit(){},
    isRendering(){ return false; }
  };

  const REL_STORE = 'relationships';
  const INDEX_FROM = 'by_fromId';
  const INDEX_TO = 'by_toId';
  const INDEX_EDGE = 'by_edgeKey';
  const ROLE_SET = new Set(['spouse','coborrower','cobuyer','guarantor','other']);

  function safeStringId(value, label){
    const text = String(value == null ? '' : value).trim();
    if(!text) throw new Error(label + ' is required');
    return text;
  }

  function normalizeRole(value){
    const role = String(value == null ? '' : value).trim().toLowerCase();
    return ROLE_SET.has(role) ? role : 'other';
  }

  function normalizePair(aId, bId){
    const a = safeStringId(aId, 'Contact A');
    const b = safeStringId(bId, 'Contact B');
    if(a === b) throw new Error('Cannot link a contact to itself');
    const fromId = a < b ? a : b;
    const toId = a < b ? b : a;
    return { fromId, toId, edgeKey: fromId + '::' + toId };
  }

  function now(){
    return Date.now();
  }

  const uuid = (function(){
    if(window.crypto && typeof crypto.randomUUID === 'function') return ()=>crypto.randomUUID();
    if(typeof window.uuid === 'function') return ()=>window.uuid();
    return function(){
      const rnd = Math.random().toString(16).slice(2, 10);
      const ts = Date.now().toString(16);
      return rnd + ts + Math.random().toString(16).slice(2, 6);
    };
  })();

  const openDbFn = typeof window.openDB === 'function'
    ? window.openDB
    : (typeof window.opendb === 'function' ? window.opendb : null);
  const withStoreFn = typeof window.withStore === 'function' ? window.withStore : null;

  function ensureDb(){
    if(openDbFn) return openDbFn();
    return Promise.reject(new Error('IndexedDB not available'));
  }

  function withRelationshipStore(mode, handler){
    if(withStoreFn){
      return withStoreFn(REL_STORE, mode, handler);
    }
    return ensureDb().then(db=>{
      return new Promise((resolve, reject)=>{
        try{
          const tx = db.transaction([REL_STORE], mode);
          const store = tx.objectStore(REL_STORE);
          let result;
          try{ result = handler(store); }
          catch(err){ reject(err); return; }
          tx.oncomplete = ()=> resolve(result);
          tx.onerror = e => reject(e && e.target && e.target.error || e);
        }catch(err){ reject(err); }
      });
    });
  }

  function cloneEdge(edge){
    if(!edge || typeof edge !== 'object') return null;
    return Object.assign({}, edge);
  }

  function getAllFromIndex(indexName, value){
    return withRelationshipStore('readonly', store => {
      return new Promise((resolve, reject)=>{
        try{
          const index = store.index(indexName);
          const request = index.getAll(value);
          request.onsuccess = function(){
            const rows = Array.isArray(request.result) ? request.result : [];
            resolve(rows.map(cloneEdge).filter(Boolean));
          };
          request.onerror = e => reject(e && e.target && e.target.error || e);
        }catch(err){ reject(err); }
      });
    });
  }

  function getEdgeByKey(edgeKey){
    const key = String(edgeKey == null ? '' : edgeKey);
    if(!key) return Promise.resolve(null);
    return withRelationshipStore('readonly', store => {
      return new Promise((resolve, reject)=>{
        try{
          const index = store.index(INDEX_EDGE);
          const request = index.get(key);
          request.onsuccess = function(){
            const row = request.result;
            resolve(row ? cloneEdge(row) : null);
          };
          request.onerror = e => reject(e && e.target && e.target.error || e);
        }catch(err){ reject(err); }
      });
    });
  }

  function addEdge(row){
    const payload = cloneEdge(row);
    return withRelationshipStore('readwrite', store => {
      return new Promise((resolve, reject)=>{
        try{
          const request = store.add(payload);
          request.onsuccess = ()=> resolve(cloneEdge(payload));
          request.onerror = e => reject(e && e.target && e.target.error || e);
        }catch(err){ reject(err); }
      });
    });
  }

  function updateEdge(row){
    const payload = cloneEdge(row);
    return withRelationshipStore('readwrite', store => {
      return new Promise((resolve, reject)=>{
        try{
          const request = store.put(payload);
          request.onsuccess = ()=> resolve(cloneEdge(payload));
          request.onerror = e => reject(e && e.target && e.target.error || e);
        }catch(err){ reject(err); }
      });
    });
  }

  function deleteEdge(id){
    const key = String(id == null ? '' : id);
    if(!key) return Promise.resolve(false);
    return withRelationshipStore('readwrite', store => {
      return new Promise((resolve, reject)=>{
        try{
          const request = store.delete(key);
          request.onsuccess = ()=> resolve(true);
          request.onerror = e => reject(e && e.target && e.target.error || e);
        }catch(err){ reject(err); }
      });
    });
  }

  function countIndex(indexName, value){
    return withRelationshipStore('readonly', store => {
      return new Promise((resolve, reject)=>{
        try{
          const index = store.index(indexName);
          const request = index.count(value);
          request.onsuccess = ()=> resolve(Number(request.result) || 0);
          request.onerror = e => reject(e && e.target && e.target.error || e);
        }catch(err){ reject(err); }
      });
    });
  }

  function dispatchChange(detail){
    const payload = Object.assign({}, detail || {});
    return new Promise(resolve => {
      const dispatch = function(){
        try{
          if(typeof window.dispatchAppDataChanged === 'function'){
            window.dispatchAppDataChanged(payload);
          }else{
            document.dispatchEvent(new CustomEvent('app:data:changed', { detail: payload }));
          }
        }catch(err){
          if(console && console.warn) console.warn('relationships dispatch failed', err);
        }
        resolve();
      };
      if(RenderGuard && typeof RenderGuard.isRendering === 'function' && RenderGuard.isRendering()){
        queueMicro(()=> queueMicro(dispatch));
      }else{
        queueMicro(dispatch);
      }
    });
  }

  function logRelationshipActivity(summary, meta){
    const logger = window.logActivity || window.addActivity || window.recordActivity || window.activityLog;
    if(typeof logger !== 'function') return;
    try{
      const payload = Object.assign({ summary, ts: now(), topic: 'relationships' }, meta || {});
      logger(payload);
    }catch(err){
      if(console && console.warn) console.warn('relationships log failed', err);
    }
  }

  function toNeighbor(contactId, edge){
    const neighborId = contactId === edge.fromId ? edge.toId : edge.fromId;
    return {
      contactId: String(neighborId || ''),
      role: normalizeRole(edge.role),
      edgeId: String(edge.id || '')
    };
  }

  async function edgeExists(aId, bId){
    const pair = normalizePair(aId, bId);
    const existing = await getEdgeByKey(pair.edgeKey);
    return !!existing;
  }

  async function linkContacts(aId, bId, role){
    const pair = normalizePair(aId, bId);
    const normalizedRole = normalizeRole(role);
    const existing = await getEdgeByKey(pair.edgeKey);
    const timestamp = now();
    if(existing){
      const changed = existing.role !== normalizedRole;
      if(changed){
        const updated = Object.assign({}, existing, {
          role: normalizedRole,
          updatedAt: timestamp
        });
        await updateEdge(updated);
        await dispatchChange({ topic: 'relationships:changed', op: 'link', fromId: pair.fromId, toId: pair.toId, edgeId: updated.id, role: normalizedRole, changed: true });
        logRelationshipActivity(`Updated relationship ${pair.fromId} ↔ ${pair.toId}`, { fromId: pair.fromId, toId: pair.toId, edgeId: updated.id, role: normalizedRole, op: 'link:update' });
        return updated;
      }
      await dispatchChange({ topic: 'relationships:changed', op: 'link', fromId: pair.fromId, toId: pair.toId, edgeId: existing.id, role: existing.role, changed: false });
      return existing;
    }
    const row = {
      id: uuid(),
      fromId: pair.fromId,
      toId: pair.toId,
      edgeKey: pair.edgeKey,
      role: normalizedRole,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await addEdge(row);
    await dispatchChange({ topic: 'relationships:changed', op: 'link', fromId: pair.fromId, toId: pair.toId, edgeId: row.id, role: normalizedRole, changed: true });
    logRelationshipActivity(`Linked ${pair.fromId} ↔ ${pair.toId} (${normalizedRole})`, { fromId: pair.fromId, toId: pair.toId, edgeId: row.id, role: normalizedRole, op: 'link:create' });
    return row;
  }

  async function unlinkContacts(aId, bId){
    const pair = normalizePair(aId, bId);
    const existing = await getEdgeByKey(pair.edgeKey);
    if(!existing){
      await dispatchChange({ topic: 'relationships:changed', op: 'unlink', fromId: pair.fromId, toId: pair.toId, changed: false });
      return false;
    }
    await deleteEdge(existing.id);
    await dispatchChange({ topic: 'relationships:changed', op: 'unlink', fromId: pair.fromId, toId: pair.toId, edgeId: existing.id, role: existing.role, changed: true });
    logRelationshipActivity(`Unlinked ${pair.fromId} ↔ ${pair.toId}`, { fromId: pair.fromId, toId: pair.toId, edgeId: existing.id, role: existing.role, op: 'unlink' });
    return true;
  }

  async function listLinksFor(contactId){
    const id = String(contactId == null ? '' : contactId).trim();
    if(!id) return { edges: [], neighbors: [] };
    const [asFrom, asTo] = await Promise.all([
      getAllFromIndex(INDEX_FROM, id),
      getAllFromIndex(INDEX_TO, id)
    ]);
    const seen = new Set();
    const edges = [];
    for(const edge of [].concat(asFrom, asTo)){
      if(!edge || seen.has(edge.id)) continue;
      seen.add(edge.id);
      edges.push(cloneEdge(edge));
    }
    const neighbors = edges.map(edge => toNeighbor(id, edge));
    return { edges, neighbors };
  }

  async function listLinksForMany(contactIds){
    const ids = Array.isArray(contactIds) ? contactIds : [];
    const unique = [];
    const tracker = new Set();
    ids.forEach(raw => {
      const id = String(raw == null ? '' : raw).trim();
      if(!id || tracker.has(id)) return;
      tracker.add(id);
      unique.push(id);
    });
    const map = new Map();
    unique.forEach(id => map.set(id, []));
    if(!unique.length) return map;
    await withRelationshipStore('readonly', store => {
      return new Promise((resolve, reject)=>{
        try{
          const fromIndex = store.index(INDEX_FROM);
          const toIndex = store.index(INDEX_TO);
          let pending = unique.length * 2;
          if(!pending) resolve();
          function handle(request, id, isFrom){
            request.onsuccess = function(){
              const neighbors = map.get(id);
              const rows = Array.isArray(request.result) ? request.result : [];
              rows.forEach(row => {
                if(!row) return;
                const edge = cloneEdge(row);
                const otherId = isFrom ? edge.toId : edge.fromId;
                neighbors.push({
                  contactId: String(otherId || ''),
                  role: normalizeRole(edge.role),
                  edgeId: String(edge.id || '')
                });
              });
              pending -= 1;
              if(pending === 0) resolve();
            };
            request.onerror = e => reject(e && e.target && e.target.error || e);
          }
          unique.forEach(id => {
            handle(fromIndex.getAll(id), id, true);
            handle(toIndex.getAll(id), id, false);
          });
        }catch(err){ reject(err); }
      });
    });
    return map;
  }

  async function countLinks(contactId){
    const id = String(contactId == null ? '' : contactId).trim();
    if(!id) return 0;
    const [fromCount, toCount] = await Promise.all([
      countIndex(INDEX_FROM, id),
      countIndex(INDEX_TO, id)
    ]);
    return Number(fromCount || 0) + Number(toCount || 0);
  }

  function yieldToLoop(){
    if(typeof requestAnimationFrame === 'function'){
      return new Promise(resolve => requestAnimationFrame(()=> resolve()));
    }
    return Promise.resolve();
  }

  async function repointLinks(options){
    const winnerId = safeStringId(options && options.winnerId, 'winnerId');
    const loserId = safeStringId(options && options.loserId, 'loserId');
    if(winnerId === loserId) throw new Error('winnerId and loserId must differ');
    const [fromEdges, toEdges] = await Promise.all([
      getAllFromIndex(INDEX_FROM, loserId),
      getAllFromIndex(INDEX_TO, loserId)
    ]);
    const queue = [];
    const seen = new Set();
    [].concat(fromEdges, toEdges).forEach(edge => {
      if(!edge || seen.has(edge.id)) return;
      seen.add(edge.id);
      queue.push(edge);
    });
    if(!queue.length){
      await dispatchChange({ topic: 'relationships:repointed', winnerId, loserId, moved: 0, dropped: 0, merged: 0 });
      return { moved: 0, dropped: 0, merged: 0 };
    }
    let moved = 0;
    let dropped = 0;
    let merged = 0;
    const total = queue.length;
    let processed = 0;
    for(const edge of queue){
      const otherId = edge.fromId === loserId ? edge.toId : edge.fromId;
      if(!otherId){
        await deleteEdge(edge.id);
        dropped += 1;
        processed += 1;
        if(total > 200 && processed % 200 === 0) await yieldToLoop();
        continue;
      }
      if(String(otherId) === winnerId){
        await deleteEdge(edge.id);
        dropped += 1;
        processed += 1;
        if(total > 200 && processed % 200 === 0) await yieldToLoop();
        continue;
      }
      const pair = normalizePair(winnerId, otherId);
      const existing = await getEdgeByKey(pair.edgeKey);
      if(existing && existing.id !== edge.id){
        await deleteEdge(edge.id);
        merged += 1;
      }else{
        const updated = Object.assign({}, edge, {
          fromId: pair.fromId,
          toId: pair.toId,
          edgeKey: pair.edgeKey,
          updatedAt: now()
        });
        await updateEdge(updated);
        moved += 1;
      }
      processed += 1;
      if(total > 200 && processed % 200 === 0) await yieldToLoop();
    }
    const detail = { topic: 'relationships:repointed', winnerId, loserId, moved, dropped, merged };
    await dispatchChange(detail);
    if(moved || dropped || merged){
      logRelationshipActivity(`Repointed relationships from ${loserId} to ${winnerId}`, { winnerId, loserId, moved, dropped, merged, op: 'repoint' });
    }
    return detail;
  }

  const api = {
    normalizeRole,
    normalizePair,
    now,
    edgeExists,
    linkContacts,
    unlinkContacts,
    listLinksFor,
    listLinksForMany,
    countLinks,
    repointLinks
  };

  window.relationships = Object.assign({}, window.relationships || {}, api);
})();
