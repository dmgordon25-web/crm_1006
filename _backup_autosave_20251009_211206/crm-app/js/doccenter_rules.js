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

/* P6a: Document Center baseline — canonical specs + renderer + persistence */
(function(){
  if (window.__DOC_RULES_V1_LOADED__) return; window.__DOC_RULES_V1_LOADED__ = true;

  // ---- Canonical doc specs by loanType (edit/extend safely later) ----
  const DOC_SPEC = {
    Generic: [
      "1003 Loan Application", "Credit Report", "Photo ID", "2 Most Recent Paystubs",
      "2 Most Recent Bank Statements", "2 Years W-2s", "2 Years Tax Returns",
      "Purchase Contract / Refi Statement", "Homeowners Insurance", "Asset Statement",
      "VOE / Employment Letter", "Disclosures Signed"
    ],
    Conventional: [
      "1003 Loan Application", "Credit Report", "Photo ID",
      "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)",
      "Tax Returns (2 yrs if needed)", "Purchase Contract", "Homeowners Insurance",
      "Appraisal", "Disclosures Signed"
    ],
    FHA: [
      "1003 Loan Application", "Credit Report", "Photo ID",
      "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)",
      "Tax Returns (2 yrs if needed)", "CAIVRS Clear", "Purchase Contract",
      "Homeowners Insurance", "FHA Case Assignment", "Disclosures Signed"
    ],
    VA: [
      "1003 Loan Application", "Credit Report", "Photo ID",
      "COE (Certificate of Eligibility)", "Paystubs (30 days)", "Bank Statements (2 mo.)",
      "W-2s (2 yrs)", "Purchase Contract", "Homeowners Insurance", "VA Appraisal",
      "Disclosures Signed"
    ],
    USDA: [
      "1003 Loan Application", "Credit Report", "Photo ID",
      "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)",
      "USDA Eligibility Check", "Purchase Contract", "Homeowners Insurance",
      "USDA Appraisal", "Disclosures Signed"
    ],
    Refi: [
      "1003 Loan Application", "Credit Report", "Photo ID",
      "Mortgage Statement", "Homeowners Insurance", "Paystubs (30 days)",
      "Bank Statements (2 mo.)", "W-2s (2 yrs)", "Appraisal (if needed)",
      "Disclosures Signed"
    ],
    Purchase: [
      "1003 Loan Application", "Credit Report", "Photo ID",
      "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)",
      "Purchase Contract", "Homeowners Insurance", "Appraisal", "Disclosures Signed"
    ]
  };

  function canonicalListForLoanType(loanType){
    if (!loanType) return DOC_SPEC.Generic;
    const key = String(loanType).trim();
    return DOC_SPEC[key] || DOC_SPEC.Generic;
  }

  // ---- Persistence adapter (IDB “documents” store if present; else localStorage) ----
  const Storage = (function(){
    const LS_KEY = "documents:v1";
    let mem = null;
    function hasIDB(){
      try {
        // honor existing app DB facade if present (don’t import or change schema)
        return !!(window.db && typeof window.db.get === "function" && typeof window.db.put === "function");
      } catch { return false; }
    }
    async function getAllLS(){
      if (mem) return mem;
      try { mem = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
      catch { mem = {}; }
      return mem;
    }
    async function saveLS(){
      try { localStorage.setItem(LS_KEY, JSON.stringify(mem || {})); } catch {}
    }
    return {
      async read(contactId){
        if (!contactId) return {};
        if (hasIDB()){
          try {
            // Non-blocking; if store missing, treat as empty.
            const row = await window.db.get("documents", contactId).catch(()=>null);
            return row?.items || {};
          } catch { return {}; }
        } else {
          const all = await getAllLS(); return all[contactId] || {};
        }
      },
      async write(contactId, items){
        if (!contactId) return;
        if (hasIDB()){
          try {
            await window.db.put("documents", { id: contactId, items: items || {} });
          } catch {
            // fall through to LS if IDB write fails
            const all = await getAllLS(); all[contactId] = items || {}; await saveLS();
          }
        } else {
          const all = await getAllLS(); all[contactId] = items || {}; await saveLS();
        }
      }
    };
  })();

  // ---- Rendering & interactions ----
  const STATES = ["Requested","Received","Waived"];
  function nextState(s){ const i = STATES.indexOf(s); return STATES[(i+1) % STATES.length]; }

  function findDocsPaneRoot(){
    // robust candidates; adjust in later micro-steps if project differs
    return document.querySelector('[data-view="contact"] [data-pane="docs"]')
        || document.querySelector('#contact-modal [data-pane="docs"]')
        || document.querySelector('[data-pane="docs"]');
  }

  function activeContact(){
    // Attempt to derive current contact context from app; this should align with existing selection APIs.
    // Fallbacks: data-contact-id on view root or a globally tracked selection.
    const root = document.querySelector('[data-view="contact"]') || document.body;
    const id = root?.getAttribute?.('data-contact-id') || window.__ACTIVE_CONTACT_ID__;
    return id || null;
  }

  function activeLoanType(){
    // Try common locations for loanType (dataset attrs or hidden inputs in the Contact view)
    const root = document.querySelector('[data-view="contact"]') || document;
    const el = root.querySelector('[data-loan-type]') || root.querySelector('input[name="loanType"]') || root.querySelector('[data-field="loanType"]');
    const val = el?.value || el?.textContent || el?.getAttribute?.('data-loan-type');
    return (val || '').trim() || 'Generic';
  }

  function countsOf(items){
    let req=0, rec=0, wvd=0;
    Object.values(items).forEach(s=>{
      if (s==="Requested") req++; else if (s==="Received") rec++; else if (s==="Waived") wvd++;
    });
    return {req, rec, wvd};
  }

  async function renderDocs(){
    const pane = findDocsPaneRoot();
    if (!pane) return; // quietly no-op if pane not present
    const cid = activeContact();
    if (!cid) return;

    // Load existing state, seed with canonical spec
    const loanType = activeLoanType();
    const spec = canonicalListForLoanType(loanType);
    const saved = await Storage.read(cid);
    // Ensure all spec docs exist; default to Requested
    const items = { ...Object.fromEntries(spec.map(n=>[n, "Requested"])), ...saved };

    // Build UI (lightweight, JS-injected; no external CSS)
    // Container
    let host = pane.querySelector('.doccenter-host');
    if (!host){
      host = document.createElement('div');
      host.className = 'doccenter-host';
      host.style.padding = '8px 6px';
      host.style.display = 'grid';
      host.style.gridTemplateColumns = '1fr';
      host.style.gap = '6px';
      pane.prepend(host);
    } else {
      host.innerHTML = '';
    }

    // Totals header
    const totals = countsOf(items);
    const header = document.createElement('div');
    header.className = 'doccenter-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '4px';
    header.innerHTML = `
      <div style="font-weight:600;">Documents — ${loanType}</div>
      <div data-docs-totals style="font-size:12px;">R: ${totals.req} • Rec: ${totals.rec} • Wvd: ${totals.wvd}</div>
    `;
    host.appendChild(header);

    // List
    const list = document.createElement('div');
    list.className = 'doccenter-list';
    list.style.display = 'grid';
    list.style.gridTemplateColumns = '1fr auto';
    list.style.rowGap = '4px';
    list.style.columnGap = '8px';
    spec.forEach(name=>{
      const row = document.createElement('div');
      row.setAttribute('data-doc-row', name);
      row.style.display = 'contents'; // allow two-column grid per row without extra wrappers

      const label = document.createElement('div');
      label.textContent = name;
      label.style.fontSize = '13px';
      label.style.lineHeight = '22px';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-doc-chip', name);
      btn.setAttribute('data-state', items[name]);
      btn.textContent = items[name];
      btn.style.minWidth = '110px';
      btn.style.height = '22px';
      btn.style.fontSize = '12px';
      btn.style.borderRadius = '12px';
      btn.style.border = '1px solid #ccc';
      btn.style.cursor = 'pointer';
      btn.style.background = '#f7f7f7';

      row.appendChild(label);
      row.appendChild(btn);
      list.appendChild(row);
    });
    host.appendChild(list);

    // Save current render state to memory (for quick updates)
    host.__DOCS_STATE__ = { cid, items };

    // Delegate chip clicks
    if (!window.__WIRED_DOCS_CHIPS__){
      window.__WIRED_DOCS_CHIPS__ = true;
      document.addEventListener('click', async (e)=>{
        const chip = e.target?.closest?.('[data-doc-chip]');
        if (!chip) return;
        const container = chip.closest?.('.doccenter-host'); if (!container) return;
        const state = container.__DOCS_STATE__; if (!state) return;
        const name = chip.getAttribute('data-doc-chip');
        const curr = chip.getAttribute('data-state') || 'Requested';
        const next = nextState(curr);
        state.items[name] = next;
        chip.setAttribute('data-state', next);
        chip.textContent = next;

        // Update totals
        const t = countsOf(state.items);
        const totalsEl = container.querySelector('[data-docs-totals]');
        if (totalsEl) totalsEl.textContent = `R: ${t.req} • Rec: ${t.rec} • Wvd: ${t.wvd}`;

        // Persist and notify
        await Storage.write(state.cid, state.items);
        window.dispatchAppDataChanged?.("doccenter:toggle");
      }, true);
    }
  }

  // ---- Wiring: when Docs pane becomes active, render (idempotent) ----
  async function tryRenderIfDocsVisible(){
    const pane = findDocsPaneRoot();
    if (!pane) return;
    // Heuristic: pane is considered active if not aria-hidden and is displayed
    const visible = pane.offsetParent !== null && !pane.hasAttribute('aria-hidden');
    if (!visible) return;
    await renderDocs();
  }

  if (!window.__WIRED_DOCS__){
    window.__WIRED_DOCS__ = true;

    // Try on initial paint, then on user navigation. Keep minimal / non-spammy.
    document.addEventListener('click', (e)=>{
      // When user clicks the Docs tab, lazy-render
      const tab = e.target?.closest?.('[data-tab="docs"],[data-nav="docs"],[data-target="docs"]');
      if (tab) {
        queueMicrotask(tryRenderIfDocsVisible);
      }
    }, true);

    // Re-render when app data changes (e.g., loanType changed)
    window.addEventListener('app:data:changed', (e)=> {
      // only re-render if we're on a contact view and docs are visible
      queueMicrotask(tryRenderIfDocsVisible);
    });

    // First attempt after boot (harmless if pane absent)
    requestAnimationFrame(()=>requestAnimationFrame(tryRenderIfDocsVisible));
  }

  // Public helpers (non-breaking)
  window.DocCenter = window.DocCenter || {};
  window.DocCenter.getSpecFor = canonicalListForLoanType;
})();
