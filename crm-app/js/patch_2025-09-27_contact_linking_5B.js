export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_contact_linking_5B';
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('js/patch_2025-09-27_contact_linking_5B.js')){
    window.__PATCHES_LOADED__.push('js/patch_2025-09-27_contact_linking_5B.js');
  }

  const queueMicro = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn)=>Promise.resolve().then(fn);

  const SECTION_ID = 'contact-linked';
  const LIST_ID = 'contact-linked-list';
  const FORM_ID = 'contact-linked-form';
  const SEARCH_ID = 'contact-linked-search';
  const DATALIST_ID = 'contact-linked-options';
  const ROLE_ID = 'contact-linked-role';
  const HELPER_ID = 'contact-linked-help';
  const EMPTY_ID = 'contact-linked-empty';

  const ROLE_OPTIONS = [
    { value:'spouse', label:'Spouse' },
    { value:'coborrower', label:'Co-Borrower' },
    { value:'cobuyer', label:'Co-Buyer' },
    { value:'guarantor', label:'Guarantor' },
    { value:'other', label:'Other' }
  ];

  const contactCache = {
    entries: [],
    byId: new Map(),
    loaded: false,
    dirty: false
  };

  function getRelationships(){
    const svc = window.relationships || null;
    if(!svc || typeof svc.linkContacts !== 'function' || typeof svc.listLinksFor !== 'function'){
      return null;
    }
    return svc;
  }

  function markCacheDirty(){
    contactCache.dirty = true;
  }

  async function loadContacts(force){
    if(!force && contactCache.loaded && !contactCache.dirty){
      return contactCache;
    }
    try{
      await openDB();
      const rows = await dbGetAll('contacts');
      const mapped = Array.isArray(rows) ? rows.map(row => {
        if(!row || !row.id) return null;
        const id = String(row.id);
        const first = String(row.first||'').trim();
        const last = String(row.last||'').trim();
        const name = (first || last) ? `${first}${first&&last?' ':''}${last}`.trim() : (row.name || row.company || row.email || row.phone || `Contact ${id}`);
        const email = String(row.email||'').trim();
        const phone = String(row.phone||'').trim();
        const stage = String(row.stage||'').trim();
        const search = [name, email, phone, stage, id].join(' ').toLowerCase();
        return { id, name, email, phone, stage, search };
      }).filter(Boolean) : [];
      mapped.sort((a,b)=> a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      contactCache.entries = mapped;
      contactCache.byId = new Map(mapped.map(item => [item.id, item]));
      contactCache.loaded = true;
      contactCache.dirty = false;
    }catch(err){
      console.warn('contact linked cache load failed', err);
      contactCache.entries = [];
      contactCache.byId = new Map();
      contactCache.loaded = true;
      contactCache.dirty = false;
    }
    return contactCache;
  }

  function createSection(panel){
    const section = document.createElement('section');
    section.id = SECTION_ID;
    section.className = 'modal-subsection';
    section.innerHTML = `
      <div class="section-header" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
        <h4 style="margin:0">Linked Contacts</h4>
        <p class="muted" id="${HELPER_ID}">Link co-borrowers, spouses, or guarantors to view relationships at a glance.</p>
      </div>
      <div id="${LIST_ID}" role="list" class="doc-chip-list" style="margin-bottom:12px"></div>
      <div id="${EMPTY_ID}" class="muted">No linked contacts yet.</div>
      <form id="${FORM_ID}" class="row" style="flex-wrap:wrap;gap:12px;align-items:flex-end" autocomplete="off">
        <label class="muted" style="flex:1 1 220px;display:flex;flex-direction:column;gap:6px">Search Contact
          <input type="search" id="${SEARCH_ID}" placeholder="Start typing a contact" list="${DATALIST_ID}" aria-describedby="${HELPER_ID}" autocomplete="off"/>
          <datalist id="${DATALIST_ID}"></datalist>
        </label>
        <label class="muted" style="flex:0 0 160px;display:flex;flex-direction:column;gap:6px">Role
          <select id="${ROLE_ID}" aria-label="Relationship role">
            ${ROLE_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
          </select>
        </label>
        <button class="btn brand" type="submit" style="flex:0 0 auto">Link</button>
      </form>
    `;
    panel.appendChild(section);
    return section;
  }

  function ensureSection(dialog){
    const body = dialog ? dialog.querySelector('#contact-modal-body') : null;
    const panel = body ? body.querySelector('.modal-panel[data-panel="relationships"]') : null;
    if(!panel){
      return null;
    }
    let section = panel.querySelector('#'+SECTION_ID);
    if(!section){
      section = createSection(panel);
    }
    const list = section.querySelector('#'+LIST_ID);
    const form = section.querySelector('#'+FORM_ID);
    const search = section.querySelector('#'+SEARCH_ID);
    const datalist = section.querySelector('#'+DATALIST_ID);
    const role = section.querySelector('#'+ROLE_ID);
    const empty = section.querySelector('#'+EMPTY_ID);
    return { section, list, form, search, datalist, role, empty, panel };
  }

  function disableControls(ui, reason){
    if(!ui || !ui.form) return;
    const controls = ui.form.querySelectorAll('input,select,button');
    controls.forEach(ctrl => ctrl.disabled = true);
    if(ui.list){
      ui.list.innerHTML = `<div class="muted">${reason || 'Relationship service unavailable.'}</div>`;
    }
    if(ui.empty){ ui.empty.style.display = 'none'; }
  }

  function enableControls(ui){
    if(!ui || !ui.form) return;
    ui.form.querySelectorAll('input,select,button').forEach(ctrl => ctrl.disabled = false);
  }

  function normalizeId(id){
    return String(id==null?'':id).trim();
  }

  function extractContactId(dialog, fallback){
    const hidden = dialog ? dialog.querySelector('#c-id') : null;
    const value = hidden ? hidden.value : null;
    const normalized = normalizeId(value || fallback);
    return normalized;
  }

  function formatOption(contact){
    if(!contact) return '';
    const parts = [contact.name];
    if(contact.stage) parts.push(contact.stage);
    if(contact.email) parts.push(contact.email);
    else if(contact.phone) parts.push(contact.phone);
    return parts.filter(Boolean).join(' • ');
  }

  function updateSearchOptions(state){
    const ui = state.ui;
    if(!ui || !ui.datalist || !ui.search) return;
    const query = String(ui.search.value||'').toLowerCase().trim();
    const options = document.createDocumentFragment();
    state.searchMap.clear();
    const contacts = state.contactEntries.filter(entry => entry.id !== state.contactId);
    const matches = query ? contacts.filter(entry => entry.search.includes(query)) : contacts;
    matches.slice(0, 20).forEach(entry => {
      const option = document.createElement('option');
      const label = formatOption(entry);
      option.value = label;
      options.appendChild(option);
      state.searchMap.set(label, entry.id);
    });
    ui.datalist.innerHTML = '';
    ui.datalist.appendChild(options);
  }

  function resolveSelectedId(state){
    const ui = state.ui;
    if(!ui || !ui.search) return '';
    const value = ui.search.value.trim();
    if(!value) return '';
    if(state.searchMap.has(value)) return state.searchMap.get(value);
    if(state.searchMap.size === 1){
      return Array.from(state.searchMap.values())[0];
    }
    if(state.contactEntries){
      const match = state.contactEntries.find(entry => formatOption(entry) === value || entry.name === value || entry.id === value);
      if(match) return match.id;
    }
    return '';
  }

  function clearForm(state){
    const ui = state.ui;
    if(!ui) return;
    if(ui.search){
      ui.search.value = '';
      ui.search.dataset.selectedId = '';
    }
    if(ui.role){ ui.role.value = 'other'; }
    updateSearchOptions(state);
  }

  function toastSafe(message){
    try{
      if(typeof window.toast === 'function'){ window.toast(message); return; }
    }catch(_err){}
    console.log('[contact-linked]', message);
  }

  function contactName(state, id){
    const entry = state.contactMap.get(id);
    if(entry) return entry.name;
    return `Contact ${id}`;
  }

  function renderEmpty(state){
    if(!state.ui) return;
    if(state.neighbors.length){
      state.ui.empty.style.display = 'none';
    }else{
      state.ui.empty.textContent = 'No linked contacts yet.';
      state.ui.empty.style.display = '';
    }
  }

  function buildChip(state, neighbor){
    const contactId = neighbor.contactId;
    const dialog = state.dialog;
    const ui = state.ui;
    const entry = state.contactMap.get(contactId) || null;
    const name = entry ? entry.name : `Contact ${contactId}`;
    const chip = document.createElement('div');
    chip.className = 'doc-chip';
    chip.setAttribute('role', 'listitem');
    chip.setAttribute('tabindex', '0');
    chip.dataset.contactId = contactId;
    chip.innerHTML = `
      <span class="doc-chip-name">${name}</span>
      <label class="muted" style="display:flex;align-items:center;gap:4px;font-size:12px">
        <select class="contact-linked-role-select" aria-label="Change role for ${name}">
          ${ROLE_OPTIONS.map(opt => `<option value="${opt.value}"${opt.value===neighbor.role?' selected':''}>${opt.label}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="btn" data-linked-open>Open</button>
      <button type="button" class="btn danger" data-linked-unlink aria-label="Unlink ${name}">Unlink</button>
    `;
    const roleSelect = chip.querySelector('select.contact-linked-role-select');
    if(roleSelect){
      roleSelect.addEventListener('change', async (evt)=>{
        const newRole = evt.target.value || 'other';
        const svc = state.relationships;
        if(!svc) return;
        try{
          state.pendingFocusId = contactId;
          await svc.linkContacts(state.contactId, contactId, newRole);
        }catch(err){
          console.warn('contact linked role change failed', err);
          toastSafe(err && err.message ? err.message : 'Failed to update role');
          evt.target.value = neighbor.role;
        }
      });
    }
    const openBtn = chip.querySelector('[data-linked-open]');
    if(openBtn){
      openBtn.addEventListener('click', (evt)=>{
        evt.preventDefault();
        if(typeof window.renderContactModal === 'function'){
          window.renderContactModal(contactId, { focusLinked: true });
        }
      });
    }
    const unlinkBtn = chip.querySelector('[data-linked-unlink]');
    if(unlinkBtn){
      unlinkBtn.addEventListener('click', async (evt)=>{
        evt.preventDefault();
        let confirmed = true;
        const prompt = `Unlink ${name}?`;
        if(typeof window.confirmAction === 'function'){
          confirmed = await window.confirmAction({
            title: 'Unlink contact',
            message: prompt,
            confirmLabel: 'Unlink',
            cancelLabel: 'Keep link',
            destructive: true
          });
        }else if(typeof window.confirm === 'function'){
          confirmed = window.confirm(prompt);
        }
        if(!confirmed) return;
        const svc = state.relationships;
        if(!svc) return;
        try{
          await svc.unlinkContacts(state.contactId, contactId);
        }catch(err){
          console.warn('contact unlink failed', err);
          toastSafe(err && err.message ? err.message : 'Failed to unlink contact');
        }
      });
    }
    return chip;
  }

  function focusChip(state, id){
    if(!state || !state.ui) return;
    const node = state.ui.list ? state.ui.list.querySelector(`[data-contact-id="${id}"]`) : null;
    if(node){
      node.focus({ preventScroll:false });
      try{ node.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
      catch(_err){}
    }
  }

  function listNeighbors(state, neighbors){
    const ui = state.ui;
    if(!ui || !ui.list) return;
    ui.list.innerHTML = '';
    const frag = document.createDocumentFragment();
    neighbors.forEach(neighbor => {
      const chip = buildChip(state, neighbor);
      frag.appendChild(chip);
    });
    ui.list.appendChild(frag);
    renderEmpty(state);
    if(state.pendingFocusId){
      focusChip(state, state.pendingFocusId);
      state.pendingFocusId = null;
    }
  }

  async function refresh(state){
    if(state.refreshing){
      state.needsRefresh = true;
      return;
    }
    state.refreshing = true;
    try{
      const svc = state.relationships = getRelationships();
      if(!svc){
        disableControls(state.ui, 'Relationship service unavailable.');
        state.neighbors = [];
        renderEmpty(state);
        return;
      }
      const cache = await loadContacts(contactCache.dirty || state.forceReloadContacts);
      state.contactEntries = cache.entries;
      state.contactMap = cache.byId;
      state.forceReloadContacts = false;
      updateSearchOptions(state);
      if(!state.contactId){
        if(state.ui && state.ui.form){
          state.ui.form.querySelectorAll('input,select,button').forEach(ctrl => ctrl.disabled = true);
        }
        state.neighbors = [];
        if(state.ui && state.ui.list){
          state.ui.list.innerHTML = '<div class="muted">Save contact to link relationships.</div>';
        }
        if(state.ui && state.ui.empty){ state.ui.empty.style.display = 'none'; }
        return;
      }
      enableControls(state.ui);
      const data = await svc.listLinksFor(state.contactId);
      const neighbors = Array.isArray(data && data.neighbors) ? data.neighbors : [];
      state.neighbors = neighbors.map(item => ({
        contactId: normalizeId(item.contactId),
        role: String(item.role||'other').toLowerCase(),
        edgeId: item.edgeId
      }));
      listNeighbors(state, state.neighbors);
    }catch(err){
      console.warn('contact linked refresh failed', err);
      if(state.ui && state.ui.list){
        state.ui.list.innerHTML = `<div class="muted">${err && err.message ? err.message : 'Unable to load linked contacts.'}</div>`;
      }
    }finally{
      state.refreshing = false;
      if(state.needsRefresh){
        state.needsRefresh = false;
        refresh(state);
      }
    }
  }

  function attachDataListener(state){
    if(state.dataListener) return;
    state.dataListener = function(evt){
      const detail = evt && evt.detail || {};
      if(state.dialog && !state.dialog.hasAttribute('open')) return;
      const topic = String(detail.topic||'');
      if(topic.startsWith('relationships:')){
        if(detail.fromId) state.forceReloadContacts = true;
        if(detail.toId) state.forceReloadContacts = true;
        state.pendingFocusId = detail.toId && String(detail.toId) !== state.contactId ? String(detail.toId) : state.contactId;
        refresh(state);
        return;
      }
      const changedId = normalizeId(detail.contactId || detail.id || '');
      if(changedId && (changedId === state.contactId || state.neighbors.some(n => n.contactId === changedId))){
        markCacheDirty();
        state.forceReloadContacts = true;
        refresh(state);
      }
    };
    document.addEventListener('app:data:changed', state.dataListener);
  }

  function detachDataListener(state){
    if(!state.dataListener) return;
    document.removeEventListener('app:data:changed', state.dataListener);
    state.dataListener = null;
  }

  function installFormHandlers(state){
    const ui = state.ui;
    if(!ui || !ui.form || ui.form.__linkedWired) return;
    ui.form.__linkedWired = true;
    ui.form.addEventListener('submit', async (evt)=>{
      evt.preventDefault();
      const svc = state.relationships = getRelationships();
      if(!svc){
        toastSafe('Relationship service unavailable.');
        return;
      }
      const targetId = resolveSelectedId(state);
      if(!targetId){
        toastSafe('Select a contact to link.');
        return;
      }
      if(targetId === state.contactId){
        toastSafe('Cannot link a contact to itself.');
        return;
      }
      if(state.neighbors.some(n => n.contactId === targetId)){
        toastSafe('Already linked — highlighting existing entry.');
        focusChip(state, targetId);
        return;
      }
      const role = ui.role ? (ui.role.value || 'other') : 'other';
      try{
        state.pendingFocusId = targetId;
        await svc.linkContacts(state.contactId, targetId, role);
        clearForm(state);
      }catch(err){
        console.warn('contact link failed', err);
        toastSafe(err && err.message ? err.message : 'Unable to link contacts');
      }
    });
    if(ui.search){
      ui.search.addEventListener('input', ()=>{
        updateSearchOptions(state);
      });
      ui.search.addEventListener('change', ()=>{
        const id = resolveSelectedId(state);
        ui.search.dataset.selectedId = id || '';
      });
    }
  }

  function ensureState(dialog){
    if(!dialog) return null;
    if(dialog.__contactLinkedState) return dialog.__contactLinkedState;
    const ui = ensureSection(dialog);
    if(!ui) return null;
    const state = {
      dialog,
      ui,
      contactId: '',
      neighbors: [],
      contactEntries: contactCache.entries,
      contactMap: contactCache.byId,
      searchMap: new Map(),
      relationships: getRelationships(),
      pendingFocusId: null,
      refreshing: false,
      needsRefresh: false,
      forceReloadContacts: false,
      dataListener: null
    };
    installFormHandlers(state);
    dialog.__contactLinkedState = state;
    dialog.addEventListener('close', ()=>{
      detachDataListener(state);
      state.contactId = '';
      state.neighbors = [];
      state.pendingFocusId = null;
    });
    return state;
  }

  function focusSection(dialog){
    if(!dialog) return;
    const section = dialog.querySelector('#'+SECTION_ID);
    if(!section) return;
    try{ section.scrollIntoView({ behavior:'smooth', block:'start' }); }
    catch(_err){}
    const focusable = section.querySelector('input,select,button,[tabindex]');
    if(focusable){
      focusable.focus({ preventScroll:true });
    }else{
      section.setAttribute('tabindex','-1');
      section.focus({ preventScroll:true });
      section.removeAttribute('tabindex');
    }
  }

  window.focusContactLinkedSection = function(){
    const dialog = document.getElementById('contact-modal');
    if(!dialog || !dialog.hasAttribute('open')) return;
    queueMicro(()=> focusSection(dialog));
  };

  const originalRender = window.renderContactModal;
  if(typeof originalRender === 'function'){
    window.renderContactModal = async function(){
      const args = Array.from(arguments);
      const contactId = args.length ? args[0] : null;
      const options = (args[1] && typeof args[1] === 'object') ? args[1] : {};
      const result = await originalRender.apply(this, args);
      queueMicro(async ()=>{
        const dialog = document.getElementById('contact-modal');
        const state = ensureState(dialog);
        if(!state) return;
        state.contactId = extractContactId(dialog, contactId);
        state.pendingFocusId = null;
        attachDataListener(state);
        await refresh(state);
        if(options && options.focusLinked){
          focusSection(dialog);
        }
      });
      return result;
    };
  }
})();
