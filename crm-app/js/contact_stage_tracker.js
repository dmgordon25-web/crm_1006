/* P6b: Loan Stage Tracker — single-select stage rail with persistence and optional LS history */
(function(){
  if (window.__WIRED_STAGE_TRACKER__) return; window.__WIRED_STAGE_TRACKER__ = true;

  // Canonical stage order (8 lanes)
  const STAGE_ITEMS = [
    { key: 'long-shot', label: 'Long Shot' },
    { key: 'application', label: 'Application' },
    { key: 'preapproved', label: 'Pre-Approved' },
    { key: 'processing', label: 'Processing' },
    { key: 'underwriting', label: 'Underwriting' },
    { key: 'approved', label: 'Approved' },
    { key: 'cleared-to-close', label: 'CTC' },
    { key: 'funded', label: 'Funded' }
  ];
  const DEFAULT_STAGE_KEY = STAGE_ITEMS[0].key;

  const KEY_TO_LABEL = new Map();
  const STAGE_ALIASES = new Map();

  const canonicalStageKeyFromLabel = typeof window.stageKeyFromLabel === 'function'
    ? (value)=> {
      try {
        return window.stageKeyFromLabel(value);
      } catch { return null; }
    }
    : null;

  const canonicalizeStageKey = typeof window.canonicalizeStage === 'function'
    ? (value)=> {
      try {
        return window.canonicalizeStage(value);
      } catch { return null; }
    }
    : null;

  const canonicalStageLabelFromKey = typeof window.stageLabelFromKey === 'function'
    ? (value)=> {
      try {
        return window.stageLabelFromKey(value);
      } catch { return null; }
    }
    : null;

  function registerStageAlias(alias, key){
    const raw = String(alias ?? '').trim();
    if (!raw) return;
    const lowered = raw.toLowerCase();
    if (lowered) STAGE_ALIASES.set(lowered, key);
    const squished = lowered.replace(/[^a-z0-9]+/g, '');
    if (squished) STAGE_ALIASES.set(squished, key);
    const dashed = lowered.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (dashed) STAGE_ALIASES.set(dashed, key);
  }

  STAGE_ITEMS.forEach(({ key, label })=>{
    const normalizedKey = String(key ?? '').trim().toLowerCase() || DEFAULT_STAGE_KEY;
    KEY_TO_LABEL.set(key, label);
    KEY_TO_LABEL.set(normalizedKey, label);
    registerStageAlias(key, key);
    registerStageAlias(label, key);
  });

  function normalizeStageKey(value){
    const raw = String(value ?? '').trim();
    if (!raw) return DEFAULT_STAGE_KEY;

    if (canonicalStageKeyFromLabel){
      const canonical = canonicalStageKeyFromLabel(raw);
      if (canonical && KEY_TO_LABEL.has(canonical)) return canonical;
    }

    if (canonicalizeStageKey){
      const canonical = canonicalizeStageKey(raw);
      if (canonical && KEY_TO_LABEL.has(canonical)) return canonical;
    }

    const lowered = raw.toLowerCase();
    if (STAGE_ALIASES.has(lowered)) return STAGE_ALIASES.get(lowered);
    const squished = lowered.replace(/[^a-z0-9]+/g, '');
    if (STAGE_ALIASES.has(squished)) return STAGE_ALIASES.get(squished);
    const dashed = lowered.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (STAGE_ALIASES.has(dashed)) return STAGE_ALIASES.get(dashed);
    return DEFAULT_STAGE_KEY;
  }

  function stageLabelFromKey(value){
    const key = normalizeStageKey(value);
    if (canonicalStageLabelFromKey){
      const label = canonicalStageLabelFromKey(key);
      if (label) return label;
    }
    return KEY_TO_LABEL.get(key) || KEY_TO_LABEL.get(DEFAULT_STAGE_KEY) || STAGE_ITEMS[0].label;
  }

  // ---- Persistence adapter (contacts store if available; else LS by contactId) ----
  const Storage = (function(){
    const LS_KEY = "contactStages:v1";
    let mem = null;
    function hasIDB(){
      try { return !!(window.db && typeof window.db.get==="function" && typeof window.db.put==="function"); }
      catch { return false; }
    }
    async function getAllLS(){
      if (mem) return mem;
      try { mem = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { mem = {}; }
      return mem;
    }
    async function saveAllLS(){ try { localStorage.setItem(LS_KEY, JSON.stringify(mem||{})); } catch{} }

    return {
      async readStage(contactId){
        if (!contactId) return null;
        if (hasIDB()){
          try {
            const row = await window.db.get("contacts", contactId).catch(()=>null);
            return row?.stage || null;
          } catch { /* fallthrough to LS */ }
        }
        const all = await getAllLS(); return all[contactId]?.stage || null;
      },
      async writeStage(contactId, stage){
        if (!contactId) return;
        if (hasIDB()){
          try {
            // Minimal, non-destructive merge write: read→patch→put
            const row = await window.db.get("contacts", contactId).catch(()=>null);
            const next = { ...(row||{ id: contactId }), stage };
            await window.db.put("contacts", next);
            return;
          } catch {
            // fall through to LS on failure
          }
        }
        const all = await getAllLS();
        all[contactId] = { ...(all[contactId]||{}), stage };
        await saveAllLS();
      },
      async appendHistory(contactId, stage){
        // Optional LS-only breadcrumb; non-blocking
        const all = await getAllLS();
        const rec = all[contactId] = all[contactId] || {};
        const arr = rec.history = Array.isArray(rec.history) ? rec.history : [];
        arr.push({ t: Date.now(), stage });
        await saveAllLS();
      }
    };
  })();

  // ---- Host lookup helpers (resilient selectors; no-ops if not present) ----
  function contactRoot(){
    return document.querySelector('[data-view="contact"]') || document.body;
  }
  function activeContactId(){
    const root = contactRoot();
    return root?.getAttribute?.('data-contact-id') || window.__ACTIVE_CONTACT_ID__ || null;
  }
  function stageMountPoint(){
    // Prefer a reserved container if present; else header zone; else docs pane top as fallback.
    return document.querySelector('[data-view="contact"] [data-pane="details"] [data-mount="stage-rail"]')
        || document.querySelector('[data-view="contact"] [data-pane="details"]')
        || document.querySelector('[data-view="contact"] [data-pane]')  // any visible pane in the contact view
        || null;
  }

  // ---- Render ----
  async function renderStageRail(){
    const cid = activeContactId(); if (!cid) return;
    const host = stageMountPoint(); if (!host) return;
    // avoid duplicating UI
    let rail = host.querySelector('.stage-rail');
    if (!rail){
      rail = document.createElement('div');
      rail.className = 'stage-rail';
      rail.style.display = 'flex';
      rail.style.flexWrap = 'wrap';
      rail.style.gap = '6px';
      rail.style.alignItems = 'center';
      rail.style.margin = '6px 0 8px';
      host.prepend(rail);
    }
    rail.innerHTML = '';

    const stored = await Storage.readStage(cid);
    const currentKey = normalizeStageKey(stored);
    const currentLabel = stageLabelFromKey(currentKey);
    rail.setAttribute('data-contact-id', cid);
    rail.setAttribute('data-current-key', currentKey);
    rail.setAttribute('data-current', currentLabel);

    // Label
    const label = document.createElement('div');
    label.textContent = 'Stage:';
    label.style.fontWeight = '600';
    label.style.marginRight = '6px';
    rail.appendChild(label);

    // Buttons
    STAGE_ITEMS.forEach(({ key, label: stageLabel })=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-stage', key);
      btn.textContent = stageLabel;
      btn.style.padding = '4px 8px';
      btn.style.fontSize = '12px';
      btn.style.borderRadius = '12px';
      btn.style.border = '1px solid #ccc';
      btn.style.cursor = 'pointer';
      const active = key === currentKey;
      btn.style.background = active ? '#e6f4ea' : '#f7f7f7';
      btn.style.fontWeight = active ? '600' : '500';
      rail.appendChild(btn);
    });

    rail.__STAGE_STATE__ = { cid, currentKey };
  }

  // ---- Events (delegated, idempotent) ----
  document.addEventListener('click', async (e)=>{
    const btn = e.target?.closest?.('.stage-rail [data-stage]');
    if (!btn) return;
    const rail = btn.closest('.stage-rail'); if (!rail) return;
    const state = rail.__STAGE_STATE__; if (!state) return;
    const cid = state.cid;
    const sel = btn.getAttribute('data-stage');
    const selKey = normalizeStageKey(sel);

    // No-op if same
    if (selKey === state.currentKey) return;

    // Update UI immediately
    state.currentKey = selKey;
    rail.setAttribute('data-current-key', selKey);
    rail.setAttribute('data-current', stageLabelFromKey(selKey));
    rail.querySelectorAll('[data-stage]').forEach(b=>{
      const key = normalizeStageKey(b.getAttribute('data-stage'));
      const active = key === selKey;
      b.style.background = active ? '#e6f4ea' : '#f7f7f7';
      b.style.fontWeight = active ? '600' : '500';
    });

    // Persist + optional history
    await Storage.writeStage(cid, selKey);
    Storage.appendHistory(cid, selKey).catch(()=>{});
    window.dispatchAppDataChanged?.("contact:stage:set");
  }, true);

  // ---- Visibility hooks ----
  function isVisible(el){ return !!el && el.offsetParent !== null && !el.hasAttribute('aria-hidden'); }

  async function tryRender(){
    const mount = stageMountPoint(); if (!mount) return;
    if (!isVisible(mount)) return;
    await renderStageRail();
  }

  // Re-render on app navigation and data changes
  window.addEventListener('app:data:changed', ()=>{ queueMicrotask(tryRender); });

  // Heuristic: when user navigates in contact view (tabs, nav, etc.)
  document.addEventListener('click', (e)=>{
    const nav = e.target?.closest?.('[data-tab],[data-nav],[data-target],[data-action]');
    if (nav) queueMicrotask(tryRender);
  }, true);

  // First paint
  requestAnimationFrame(()=>requestAnimationFrame(tryRender));
})();
