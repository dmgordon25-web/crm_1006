/* P6d: partners import — dedupe + merge */
(async function(){
  if (window.__IMPORT_PARTNERS_V5__) return; window.__IMPORT_PARTNERS_V5__ = true;

  const H = window.IMPORT_HELPERS;
  const SKIP_MERGE_KEYS = new Set(['id']);
  const partnerIndex = {
    loaded: false,
    byId: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    byNameCity: new Map()
  };

  function isFilled(value){
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  function tupleKeys(row){
    const { email, phone, name, city } = H.keyTuple(row || {});
    const nameCity = name ? `${name}|${city || ''}` : '';
    return { email, phone, nameCity };
  }

  function unregister(record){
    if (!record || record.id == null) return;
    const id = String(record.id);
    const { email, phone, nameCity } = tupleKeys(record);
    if (partnerIndex.byId.get(id)) partnerIndex.byId.delete(id);
    if (email){
      const prev = partnerIndex.byEmail.get(email);
      if (prev && String(prev.id) === id) partnerIndex.byEmail.delete(email);
    }
    if (phone){
      const prev = partnerIndex.byPhone.get(phone);
      if (prev && String(prev.id) === id) partnerIndex.byPhone.delete(phone);
    }
    if (nameCity){
      const prev = partnerIndex.byNameCity.get(nameCity);
      if (prev && String(prev.id) === id) partnerIndex.byNameCity.delete(nameCity);
    }
  }

  function register(record){
    if (!record || record.id == null) return record;
    const id = String(record.id);
    partnerIndex.byId.set(id, record);
    const { email, phone, nameCity } = tupleKeys(record);
    if (email){
      const prev = partnerIndex.byEmail.get(email);
      if (!prev || String(prev.id) === id) partnerIndex.byEmail.set(email, record);
    }
    if (phone){
      const prev = partnerIndex.byPhone.get(phone);
      if (!prev || String(prev.id) === id) partnerIndex.byPhone.set(phone, record);
    }
    if (nameCity){
      const prev = partnerIndex.byNameCity.get(nameCity);
      if (!prev || String(prev.id) === id) partnerIndex.byNameCity.set(nameCity, record);
    }
    return record;
  }

  async function loadStore(store){
    if (typeof window.dbGetAll === 'function'){
      try { return await window.dbGetAll(store); }
      catch(_err){}
    }
    if (window.db && typeof window.db.getAll === 'function'){
      try { return await window.db.getAll(store); }
      catch(_err){}
    }
    return [];
  }

  async function ensurePartnerIndex(){
    if (partnerIndex.loaded) return partnerIndex;
    const existing = await loadStore('partners');
    (existing || []).forEach(register);
    partnerIndex.loaded = true;
    return partnerIndex;
  }

  function findPartner(row){
    if (!row) return null;
    const id = row.id || row.partnerId;
    if (id){
      const match = partnerIndex.byId.get(String(id));
      if (match) return match;
    }
    const { email, phone, nameCity } = tupleKeys(row);
    if (email){
      const match = partnerIndex.byEmail.get(email);
      if (match) return match;
    }
    if (phone){
      const match = partnerIndex.byPhone.get(phone);
      if (match) return match;
    }
    if (nameCity){
      const match = partnerIndex.byNameCity.get(nameCity);
      if (match) return match;
    }
    return null;
  }

  async function putPartner(record){
    if (typeof window.dbPut === 'function') return window.dbPut('partners', record);
    if (window.db && typeof window.db.put === 'function') return window.db.put('partners', record);
    throw new Error('dbPut unavailable for partners import');
  }

  async function upsertPartner(row, audit){
    await ensurePartnerIndex();
    const existing = findPartner(row);
    if (existing){
      unregister(existing);
      const merged = { ...existing };
      for (const [key, value] of Object.entries(row || {})){
        if (SKIP_MERGE_KEYS.has(key)) continue;
        if (!isFilled(value)) continue;
        if (isFilled(merged[key])) continue;
        merged[key] = value;
      }
      if (!isFilled(merged.name)){
        merged.name = `${(merged.firstName||'').trim()} ${(merged.lastName||'').trim()}`.trim() || merged.name;
      }
      merged.updatedAt = Date.now();
      await putPartner(merged);
      register(merged);
      return merged.id;
    }

    const id = row.id || crypto?.randomUUID?.() || `p_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const rec = { id, ...row };
    if (!isFilled(rec.name)){
      rec.name = `${(rec.firstName||'').trim()} ${(rec.lastName||'').trim()}`.trim() || rec.name || '';
    }
    rec.createdAt = rec.createdAt || Date.now();
    await putPartner(rec);
    register(rec);
    return id;
  }

  window.ImportPartnersV5 = {
    upsertPartner,
    findMatch: async (row) => {
      await ensurePartnerIndex();
      return findPartner(row);
    },
    getIndex: () => partnerIndex
  };
})();
