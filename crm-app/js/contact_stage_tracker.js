/* P6b: Loan Stage Tracker — single-select stage rail with persistence and optional LS history */
(function(){
  if (window.__WIRED_STAGE_TRACKER__) return; window.__WIRED_STAGE_TRACKER__ = true;

  // Canonical stage order (8 lanes)
  const STAGES = [
    "Long Shot","Application","Pre-Approved","Processing",
    "Underwriting","Approved","CTC","Funded"
  ];

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

    const current = await Storage.readStage(cid) || "Long Shot";
    rail.setAttribute('data-contact-id', cid);
    rail.setAttribute('data-current', current);

    // Label
    const label = document.createElement('div');
    label.textContent = 'Stage:';
    label.style.fontWeight = '600';
    label.style.marginRight = '6px';
    rail.appendChild(label);

    // Buttons
    STAGES.forEach(s=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-stage', s);
      btn.textContent = s;
      btn.style.padding = '4px 8px';
      btn.style.fontSize = '12px';
      btn.style.borderRadius = '12px';
      btn.style.border = '1px solid #ccc';
      btn.style.cursor = 'pointer';
      btn.style.background = (s===current) ? '#e6f4ea' : '#f7f7f7';
      btn.style.fontWeight = (s===current) ? '600' : '500';
      rail.appendChild(btn);
    });

    rail.__STAGE_STATE__ = { cid, current };
  }

  // ---- Events (delegated, idempotent) ----
  document.addEventListener('click', async (e)=>{
    const btn = e.target?.closest?.('.stage-rail [data-stage]');
    if (!btn) return;
    const rail = btn.closest('.stage-rail'); if (!rail) return;
    const state = rail.__STAGE_STATE__; if (!state) return;
    const cid = state.cid;
    const sel = btn.getAttribute('data-stage');

    // No-op if same
    if (sel === state.current) return;

    // Update UI immediately
    state.current = sel;
    rail.setAttribute('data-current', sel);
    rail.querySelectorAll('[data-stage]').forEach(b=>{
      const active = b.getAttribute('data-stage') === sel;
      b.style.background = active ? '#e6f4ea' : '#f7f7f7';
      b.style.fontWeight = active ? '600' : '500';
    });

    // Persist + optional history
    await Storage.writeStage(cid, sel);
    Storage.appendHistory(cid, sel).catch(()=>{});
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
