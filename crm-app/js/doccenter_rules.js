// doccenter_rules.js — required docs per loanType + seeding + missing-docs computation
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.doccenter_rules) return;
  window.__INIT_FLAGS__.doccenter_rules = true;

  const BASE_RULES = {
    fha: ["ID","W2","Paystubs","Bank Statements","Purchase Contract","Homeowners Insurance"],
    va: ["ID","COE (VA Eligibility)","LES/Paystubs","Bank Statements","Purchase Contract","Homeowners Insurance"],
    usda: ["ID","W2","Paystubs","Bank Statements","USDA Income Worksheet","Purchase Contract"],
    conv: ["ID","W2","Paystubs","Bank Statements","Purchase Contract","Appraisal"],
    jumbo: ["ID","Tax Returns","Bank Statements (12 mo.)","Purchase Contract","Appraisal"],
    other: ["ID","Income Proof","Bank Statements","Purchase Contract"]
  };

  function cloneRules(source){
    const out = {};
    Object.keys(source || {}).forEach(key => {
      const list = Array.isArray(source[key]) ? source[key] : [];
      out[String(key).toLowerCase()] = list.map(item => String(item || ''));
    });
    return out;
  }

  function normalizeLoanKey(loanType, catalog){
    const rules = catalog || BASE_RULES;
    const key = String(loanType || 'other').toLowerCase();
    return rules[key] ? key : 'other';
  }

  async function loadDocRulesOverrides(){
    if(typeof openDB !== 'function' || typeof dbGetAll !== 'function') return null;
    try{
      await openDB();
      const settings = await dbGetAll('settings').catch(()=>[]);
      const record = (Array.isArray(settings) ? settings : []).find(row => row && row.id === 'docRules');
      if(record && record.rules && typeof record.rules === 'object') return record.rules;
    }catch(err){ console && console.warn && console.warn('doc rules overrides', err); }
    return null;
  }

  function mergeRules(base, overrides){
    const merged = cloneRules(base);
    const source = overrides && typeof overrides === 'object' ? overrides : null;
    if(source){
      Object.keys(source).forEach(key => {
        const norm = String(key || '').toLowerCase();
        const list = Array.isArray(source[key]) ? source[key] : [];
        merged[norm] = list.map(item => String(item || '')).filter(Boolean);
      });
    }
    return merged;
  }

  async function resolveRules(){
    const overrides = await loadDocRulesOverrides();
    return mergeRules(BASE_RULES, overrides);
  }

  async function requiredDocsForAsync(loanType){
    const rules = await resolveRules();
    const key = normalizeLoanKey(loanType, rules);
    return (rules[key] || []).slice();
  }

  function requiredDocsSnapshot(loanType){
    const key = normalizeLoanKey(loanType, BASE_RULES);
    return (BASE_RULES[key] || []).slice();
  }

  async function fetchContactDocs(contactId){
    if(!contactId) return [];
    if(typeof openDB !== 'function' || typeof dbGetAll !== 'function') return [];
    await openDB();
    const all = await dbGetAll('documents').catch(()=>[]);
    return (all || []).filter(doc => doc && String(doc.contactId) === String(contactId));
  }

  function nextDocId(contactId){
    try{ if(typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); }
    catch(_){ /* noop */ }
    const rand = Math.random().toString(16).slice(2, 10);
    return `doc-${contactId}-${Date.now()}-${rand}`;
  }

  async function ensureRequiredDocs(contact, opts){
    if(!contact || !contact.id) return 0;
    const options = opts && typeof opts === 'object' ? opts : {};
    const required = await requiredDocsForAsync(contact.loanType);
    if(!required.length){
      return options.returnDetail || options.useCache ? {created:0, docs:Array.isArray(options.docs) ? options.docs : []} : 0;
    }
    let docs = Array.isArray(options.docs) ? options.docs : null;
    if(!docs){
      docs = await fetchContactDocs(contact.id);
    }
    const seen = new Set(docs.map(doc => String(doc && doc.name || '').toLowerCase()));
    const toCreate = [];
    const now = Date.now();
    required.forEach(name => {
      const label = String(name || '').trim();
      if(!label) return;
      const key = label.toLowerCase();
      if(seen.has(key)) return;
      const doc = {
        id: nextDocId(contact.id),
        contactId: contact.id,
        name: label,
        status: 'Requested',
        updatedAt: now
      };
      toCreate.push(doc);
      seen.add(key);
      docs.push(doc);
    });
    if(toCreate.length && typeof dbBulkPut === 'function'){
      try{
        await openDB();
        await dbBulkPut('documents', toCreate);
      }catch(err){ console && console.warn && console.warn('ensureRequiredDocs bulk', err); }
    }
    if(options.returnDetail || options.useCache || Array.isArray(options.docs)){
      return {created: toCreate.length, docs};
    }
    return toCreate.length;
  }

  async function computeMissingDocsFromAsync(docs, loanType){
    const required = await requiredDocsForAsync(loanType);
    if(!required.length) return '';
    const byName = new Map();
    (Array.isArray(docs) ? docs : []).forEach(doc => {
      if(!doc) return;
      const key = String(doc.name || '').toLowerCase();
      if(!byName.has(key)) byName.set(key, doc);
    });
    const missing = [];
    required.forEach(name => {
      const key = String(name || '').toLowerCase();
      const doc = byName.get(key);
      const status = String(doc && doc.status || '');
      if(!doc || !/^received|waived$/i.test(status)) missing.push(name);
    });
    return missing.join(', ');
  }

  async function syncContactDocChecklist(contact, docs){
    const result = {created:0, missingChanged:false};
    if(!contact || !contact.id) return result;
    const ensure = await ensureRequiredDocs(contact, {docs, returnDetail:true});
    const list = ensure && Array.isArray(ensure.docs) ? ensure.docs : (Array.isArray(docs) ? docs : []);
    result.created = ensure && typeof ensure.created === 'number' ? ensure.created : 0;
    const missing = await computeMissingDocsFromAsync(list, contact.loanType);
    const normalized = typeof missing === 'string' ? missing : '';
    if((contact.missingDocs || '') !== normalized){
      contact.missingDocs = normalized;
      contact.updatedAt = Date.now();
      if(typeof dbPut === 'function'){
        try{
          await openDB();
          await dbPut('contacts', contact);
        }catch(err){ console && console.warn && console.warn('doccenter missing docs put', err); }
      }
      result.missingChanged = true;
    }
    return result;
  }

  async function computeAndPersistMissingDocs(){
    if(typeof openDB !== 'function' || typeof dbGetAll !== 'function' || typeof dbPut !== 'function') return 0;
    await openDB();
    const [contacts, documents] = await Promise.all([
      dbGetAll('contacts').catch(()=>[]),
      dbGetAll('documents').catch(()=>[])
    ]);
    const grouped = new Map();
    (documents || []).forEach(doc => {
      if(!doc || !doc.contactId) return;
      const key = String(doc.contactId);
      if(!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(doc);
    });
    let writes = 0;
    for(const contact of contacts || []){
      if(!contact || !contact.id) continue;
      const docs = grouped.get(String(contact.id)) || [];
      const missing = await computeMissingDocsFromAsync(docs, contact.loanType);
      const normalized = typeof missing === 'string' ? missing : '';
      if((contact.missingDocs || '') !== normalized){
        const updated = Object.assign({}, contact, {missingDocs: normalized, updatedAt: Date.now()});
        try{ await dbPut('contacts', updated); writes++; }
        catch(err){ console && console.warn && console.warn('doccenter missing docs persist', err); }
      }
    }
    return writes;
  }

  async function hydrateAllContacts(){
    if(typeof openDB !== 'function' || typeof dbGetAll !== 'function') return;
    await openDB();
    const [contacts, documents] = await Promise.all([
      dbGetAll('contacts').catch(()=>[]),
      dbGetAll('documents').catch(()=>[])
    ]);
    const grouped = new Map();
    (documents || []).forEach(doc => {
      if(!doc || !doc.contactId) return;
      const key = String(doc.contactId);
      if(!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(doc);
    });
    for(const contact of contacts || []){
      if(!contact || !contact.loanType) continue;
      try{ await syncContactDocChecklist(contact, grouped.get(String(contact.id)) || []); }
      catch(err){ console && console.warn && console.warn('doccenter hydrate contact', err); }
    }
  }

  function schedule(fn){ Promise.resolve().then(fn); }

  window.requiredDocsFor = requiredDocsForAsync;
  window.ensureRequiredDocs = ensureRequiredDocs;
  window.computeMissingDocsFrom = computeMissingDocsFromAsync;
  window.computeMissingDocsForAll = computeAndPersistMissingDocs;
  window.syncContactDocChecklist = syncContactDocChecklist;

  if(!window.__DOC_RULES_WRAPPED__){
    window.__DOC_RULES_WRAPPED__ = true;
    const originalRenderAll = window.renderAll;
    if(typeof originalRenderAll === 'function'){
      window.renderAll = async function(){
        const result = await originalRenderAll.apply(this, arguments);
        try{ await hydrateAllContacts(); }
        catch(err){ console && console.warn && console.warn('doccenter renderAll hydrate', err); }
        return result;
      };
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=> schedule(()=> hydrateAllContacts()));
  }else{
    schedule(()=> hydrateAllContacts());
  }
})();
