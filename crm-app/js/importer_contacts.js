/* P6d: contacts import — partner linking + dedupe */
(async function(){
  if (window.__IMPORT_CONTACTS_V5__) return; window.__IMPORT_CONTACTS_V5__ = true;

  const H = window.IMPORT_HELPERS;
  const SKIP_MERGE_KEYS = new Set(['id','buyerPartnerId','listingPartnerId']);
  const contactIndex = {
    loaded: false,
    byId: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    byNameCity: new Map()
  };
  let nonePartnerPromise = null;

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
    if (contactIndex.byId.get(id)) contactIndex.byId.delete(id);
    if (email){
      const prev = contactIndex.byEmail.get(email);
      if (prev && String(prev.id) === id) contactIndex.byEmail.delete(email);
    }
    if (phone){
      const prev = contactIndex.byPhone.get(phone);
      if (prev && String(prev.id) === id) contactIndex.byPhone.delete(phone);
    }
    if (nameCity){
      const prev = contactIndex.byNameCity.get(nameCity);
      if (prev && String(prev.id) === id) contactIndex.byNameCity.delete(nameCity);
    }
  }

  function register(record){
    if (!record || record.id == null) return record;
    const id = String(record.id);
    contactIndex.byId.set(id, record);
    const { email, phone, nameCity } = tupleKeys(record);
    if (email){
      const prev = contactIndex.byEmail.get(email);
      if (!prev || String(prev.id) === id) contactIndex.byEmail.set(email, record);
    }
    if (phone){
      const prev = contactIndex.byPhone.get(phone);
      if (!prev || String(prev.id) === id) contactIndex.byPhone.set(phone, record);
    }
    if (nameCity){
      const prev = contactIndex.byNameCity.get(nameCity);
      if (!prev || String(prev.id) === id) contactIndex.byNameCity.set(nameCity, record);
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

  async function ensureContactIndex(){
    if (contactIndex.loaded) return contactIndex;
    const existing = await loadStore('contacts');
    (existing || []).forEach(register);
    contactIndex.loaded = true;
    return contactIndex;
  }

  function findContact(row){
    if (!row) return null;
    const id = row.id || row.contactId;
    if (id){
      const match = contactIndex.byId.get(String(id));
      if (match) return match;
    }
    const { email, phone, nameCity } = tupleKeys(row);
    if (email){
      const match = contactIndex.byEmail.get(email);
      if (match) return match;
    }
    if (phone){
      const match = contactIndex.byPhone.get(phone);
      if (match) return match;
    }
    if (nameCity){
      const match = contactIndex.byNameCity.get(nameCity);
      if (match) return match;
    }
    return null;
  }

  async function putContact(record){
    if (typeof window.dbPut === 'function') return window.dbPut('contacts', record);
    if (window.db && typeof window.db.put === 'function') return window.db.put('contacts', record);
    throw new Error('dbPut unavailable for contacts import');
  }

  async function getPartnerById(id){
    if (!id) return null;
    if (typeof window.dbGet === 'function'){
      try { return await window.dbGet('partners', id); }
      catch(_err){}
    }
    if (window.db && typeof window.db.get === 'function'){
      try { return await window.db.get('partners', id); }
      catch(_err){}
    }
    return null;
  }

  async function getNonePartnerId(){
    if (!nonePartnerPromise) nonePartnerPromise = H.ensureNonePartner();
    const row = await nonePartnerPromise;
    return row && row.id ? row.id : H.NONE_PARTNER_ID;
  }

  async function resolvePartnerId(hint){
    if (!hint) return await getNonePartnerId();
    if (typeof hint === 'string') {
      const name = hint.trim();
      if (!name) return await getNonePartnerId();
      const parts = name.split(' ');
      hint = { firstName: parts[0] || name, lastName: parts.slice(1).join(' '), name };
    }
    const explicitId = hint.partnerId || hint.id;
    if (explicitId) {
      const existing = await getPartnerById(explicitId);
      if (existing) return existing.id;
    }
    const partnerApi = window.ImportPartnersV5;
    if (partnerApi && typeof partnerApi.findMatch === 'function'){
      const match = await partnerApi.findMatch(hint);
      if (match && match.id) return match.id;
    }
    const tuple = H.keyTuple(hint);
    const partners = await loadStore('partners');
    if (tuple.email){
      const match = (partners || []).find(row => H.keyTuple(row).email === tuple.email);
      if (match && match.id) return match.id;
    }
    if (tuple.phone){
      const match = (partners || []).find(row => H.keyTuple(row).phone === tuple.phone);
      if (match && match.id) return match.id;
    }
    if (tuple.name){
      const nameCityKey = `${tuple.name}|${tuple.city || ''}`;
      const match = (partners || []).find(row => {
        const k = H.keyTuple(row);
        const key = k.name ? `${k.name}|${k.city || ''}` : '';
        return key === nameCityKey;
      });
      if (match && match.id) return match.id;
    }
    return await getNonePartnerId();
  }

  async function upsertContact(row, audit){
    await ensureContactIndex();
    const existing = findContact(row);

    let buyerPartnerId = row.buyerPartnerId;
    if (buyerPartnerId && !(await getPartnerById(buyerPartnerId))) buyerPartnerId = null;
    let listingPartnerId = row.listingPartnerId;
    if (listingPartnerId && !(await getPartnerById(listingPartnerId))) listingPartnerId = null;
    buyerPartnerId = buyerPartnerId || await resolvePartnerId(row.buyerAgent || row.buyerPartner);
    listingPartnerId = listingPartnerId || await resolvePartnerId(row.listingAgent || row.listingPartner);

    if (existing){
      unregister(existing);
      const merged = { ...existing };
      for (const [key, value] of Object.entries(row || {})){
        if (SKIP_MERGE_KEYS.has(key)) continue;
        if (!isFilled(value)) continue;
        if (isFilled(merged[key])) continue;
        merged[key] = value;
      }
      merged.buyerPartnerId   = merged.buyerPartnerId   || buyerPartnerId;
      merged.listingPartnerId = merged.listingPartnerId || listingPartnerId;
      merged.contactId = merged.contactId || merged.id;
      merged.updatedAt = Date.now();
      await putContact(merged);
      register(merged);
      return merged.id;
    }

    const id = row.id || crypto?.randomUUID?.() || `c_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const rec = { id, ...row, buyerPartnerId, listingPartnerId };
    rec.contactId = rec.contactId || rec.id;
    rec.createdAt = rec.createdAt || Date.now();
    await putContact(rec);
    register(rec);
    return id;
  }

  window.ImportContactsV5 = {
    upsertContact,
    findMatch: async (row) => {
      await ensureContactIndex();
      return findContact(row);
    }
  };
})();
