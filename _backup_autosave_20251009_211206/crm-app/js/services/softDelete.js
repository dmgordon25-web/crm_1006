(function(){
  if(typeof window === 'undefined') return;
  if(window.__SOFT_DELETE_SERVICE__) return;

  const TTL_MS = 15000;
  const WATCHED_STORES = new Set(['contacts','partners','tasks']);
  const STORE_LABELS = {
    contacts: { singular: 'contact', plural: 'contacts' },
    partners: { singular: 'partner', plural: 'partners' },
    tasks: { singular: 'task', plural: 'tasks' }
  };

  const groups = new Map();

  function cloneRecord(record){
    if(!record) return record;
    try{ return structuredClone(record); }
    catch(_err){ return JSON.parse(JSON.stringify(record)); }
  }

  function isPending(record){
    if(!record) return false;
    const value = Number(record.deletedAtPending);
    return Number.isFinite(value) && value > 0;
  }

  function describeRecords(entries){
    if(!Array.isArray(entries) || entries.length === 0) return '0 records';
    const counts = new Map();
    entries.forEach(entry => {
      const key = String(entry.store || 'records');
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    if(counts.size === 1){
      const [store, count] = counts.entries().next().value;
      const labels = STORE_LABELS[store] || { singular: 'record', plural: 'records' };
      return `${count} ${count === 1 ? labels.singular : labels.plural}`;
    }
    return `${entries.length} records`;
  }

  function emitChange(detail){
    const payload = Object.assign({ source: 'soft-delete' }, detail || {});
    if(typeof window.dispatchAppDataChanged === 'function'){
      window.dispatchAppDataChanged(payload);
    }else if(window.document){
      window.document.dispatchEvent(new CustomEvent('app:data:changed', { detail: payload }));
    }
  }

  function buildDetail(action, entries, options, groupId){
    const list = Array.isArray(entries) ? entries : [];
    if(!list.length) return { source: options && options.source ? options.source : 'soft-delete' };
    const primary = list[0];
    const others = list.slice(1).map(entry => ({
      action,
      entity: entry.store,
      id: entry.id,
      groupId,
      count: list.length
    }));
    return {
      source: options && options.source ? options.source : 'soft-delete',
      action,
      entity: primary.store,
      id: primary.id,
      groupId,
      count: list.length,
      actions: others,
      stores: list.reduce((acc, entry) => {
        const store = entry.store;
        acc[store] = (acc[store] || 0) + 1;
        return acc;
      }, {})
    };
  }

  function ensureToast(message, options){
    if(typeof window.toast === 'function'){
      window.toast(Object.assign({ message }, options || {}));
      return;
    }
    if(typeof alert === 'function') alert(message);
  }

  function showUndoToast(group){
    const description = describeRecords(group.records);
    const message = group.options && group.options.message
      ? String(group.options.message)
      : `Deleted ${description}.`;
    const undoLabel = group.options && group.options.undoLabel
      ? String(group.options.undoLabel)
      : 'Undo';
    ensureToast(message, {
      duration: Math.max(TTL_MS, Number(group.options && group.options.duration) || TTL_MS),
      action: {
        label: undoLabel,
        onClick: () => undoGroup(group.id)
      }
    });
  }

  function scheduleFinalize(group){
    if(!group) return;
    if(group.timer) clearTimeout(group.timer);
    const remaining = Math.max(0, group.expiresAt - Date.now());
    group.timer = setTimeout(() => {
      finalizeGroup(group.id);
    }, remaining);
  }

  async function markPending(entries, options){
    if(!Array.isArray(entries) || !entries.length) return [];
    if(typeof window.openDB === 'function'){
      try{ await window.openDB(); }
      catch(err){ console && console.warn && console.warn('softDelete openDB', err); }
    }
    const processed = [];
    for(const entry of entries){
      const store = entry.store;
      const id = entry.id;
      if(!store || id == null) continue;
      if(typeof window.dbGet !== 'function' || typeof window.dbPut !== 'function') continue;
      let record;
      try{
        record = await window.dbGet(store, id, { includePending: true, includeDeleted: true });
      }catch(err){
        console && console.warn && console.warn('softDelete get', err);
        record = null;
      }
      if(!record) continue;
      if(record.isDeleted) continue;
      const snapshot = cloneRecord(record);
      const pendingAt = Date.now();
      const pendingRecord = Object.assign({}, record, {
        deletedAtPending: pendingAt,
        deletedAt: null,
        isDeleted: false,
        __pendingDeleteBackup: snapshot
      });
      try{
        await window.dbPut(store, pendingRecord);
        processed.push({ store, id: String(id), snapshot, pendingAt });
      }catch(err){
        console && console.warn && console.warn('softDelete put', err);
      }
    }
    return processed;
  }

  async function softDeleteInternal(records, options){
    const list = Array.isArray(records) ? records : [];
    if(!list.length) return { ok: false, count: 0 };
    const normalized = list.map(entry => ({
      store: entry && entry.store ? String(entry.store) : '',
      id: entry && entry.id != null ? String(entry.id) : null
    })).filter(entry => entry.store && entry.id != null);
    if(!normalized.length) return { ok: false, count: 0 };
    const processed = await markPending(normalized, options);
    if(!processed.length) return { ok: false, count: 0 };
    const groupId = `${Date.now().toString(36)}:${Math.random().toString(16).slice(2,8)}`;
    const now = Date.now();
    const group = {
      id: groupId,
      records: processed,
      createdAt: now,
      expiresAt: now + TTL_MS,
      timer: null,
      options: options || {},
      undone: false
    };
    groups.set(groupId, group);
    scheduleFinalize(group);
    emitChange(buildDetail('soft-delete', processed, options, groupId));
    showUndoToast(group);
    return { ok: true, count: processed.length, groupId };
  }

  async function undoGroup(groupId){
    const group = groups.get(groupId);
    if(!group) return false;
    groups.delete(groupId);
    if(group.timer) clearTimeout(group.timer);
    group.undone = true;
    if(typeof window.openDB === 'function'){
      try{ await window.openDB(); }
      catch(err){ console && console.warn && console.warn('softDelete undo openDB', err); }
    }
    const restored = [];
    for(const entry of group.records){
      if(typeof window.dbPut !== 'function') continue;
      let record;
      try{
        record = await window.dbGet(entry.store, entry.id, { includePending: true, includeDeleted: true });
      }catch(err){ record = null; }
      let restorePayload = entry.snapshot ? cloneRecord(entry.snapshot) : null;
      if(!restorePayload && record && record.__pendingDeleteBackup){
        restorePayload = cloneRecord(record.__pendingDeleteBackup);
      }
      if(!restorePayload && record){
        restorePayload = cloneRecord(record);
        delete restorePayload.deletedAtPending;
      }
      if(!restorePayload) continue;
      delete restorePayload.deletedAt;
      delete restorePayload.deletedAtPending;
      delete restorePayload.isDeleted;
      delete restorePayload.__pendingDeleteBackup;
      restorePayload.updatedAt = Date.now();
      try{
        await window.dbPut(entry.store, restorePayload);
        restored.push({ store: entry.store, id: entry.id });
      }catch(err){ console && console.warn && console.warn('softDelete undo put', err); }
    }
    if(restored.length){
      emitChange(buildDetail('restore', restored, group.options, groupId));
      ensureToast(`Restored ${describeRecords(restored)}.`);
    }
    return true;
  }

  async function finalizeGroup(groupId){
    const group = groups.get(groupId);
    if(!group) return;
    groups.delete(groupId);
    if(group.timer) clearTimeout(group.timer);
    if(group.undone) return;
    if(typeof window.openDB === 'function'){
      try{ await window.openDB(); }
      catch(err){ console && console.warn && console.warn('softDelete finalize openDB', err); }
    }
    const finalized = [];
    for(const entry of group.records){
      if(typeof window.dbGet !== 'function' || typeof window.dbPut !== 'function') continue;
      let record;
      try{
        record = await window.dbGet(entry.store, entry.id, { includePending: true, includeDeleted: true });
      }catch(err){ record = null; }
      if(!record || !isPending(record)) continue;
      const finalizedAt = Date.now();
      const next = Object.assign({}, record, {
        deletedAtPending: null,
        deletedAt: finalizedAt,
        isDeleted: true,
        __pendingDeleteBackup: undefined,
        updatedAt: finalizedAt
      });
      delete next.__pendingDeleteBackup;
      try{
        await window.dbPut(entry.store, next);
        finalized.push({ store: entry.store, id: entry.id });
      }catch(err){ console && console.warn && console.warn('softDelete finalize put', err); }
    }
    if(finalized.length){
      emitChange(buildDetail('delete-finalize', finalized, group.options, groupId));
    }
  }

  async function softDeleteSingle(store, id, options){
    return softDeleteInternal([{ store, id }], options || {});
  }

  async function softDeleteMany(records, options){
    return softDeleteInternal(records, options || {});
  }

  async function bootstrapPending(){
    if(typeof window.dbGetAll !== 'function') return;
    if(typeof window.openDB === 'function'){
      try{ await window.openDB(); }
      catch(err){ console && console.warn && console.warn('softDelete bootstrap openDB', err); }
    }
    for(const store of WATCHED_STORES){
      let rows = [];
      try{
        rows = await window.dbGetAll(store, { includePending: true, includeDeleted: true });
      }catch(err){ rows = []; }
      rows.forEach(record => {
        if(!record || !record.id) return;
        if(!isPending(record)) return;
        const pendingAt = Number(record.deletedAtPending);
        const snapshot = record.__pendingDeleteBackup
          ? cloneRecord(record.__pendingDeleteBackup)
          : null;
        const entry = {
          store,
          id: String(record.id),
          snapshot,
          pendingAt
        };
        const groupId = `boot:${store}:${record.id}:${pendingAt}`;
        const group = {
          id: groupId,
          records: [entry],
          createdAt: pendingAt,
          expiresAt: pendingAt + TTL_MS,
          timer: null,
          options: { source: 'soft-delete:boot', message: null },
          undone: false
        };
        groups.set(groupId, group);
        const remaining = group.expiresAt - Date.now();
        if(remaining <= 0){
          finalizeGroup(groupId);
        }else{
          scheduleFinalize(group);
        }
      });
    }
  }

  window.softDelete = softDeleteSingle;
  window.softDeleteMany = softDeleteMany;
  window.__SOFT_DELETE_SERVICE__ = {
    ttl: TTL_MS,
    groups,
    undoGroup,
    finalizeGroup,
    describeRecords
  };

  bootstrapPending();
})();
