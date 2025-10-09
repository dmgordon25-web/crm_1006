export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_doccenter2';
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_2025-09-27_doccenter2.js')){
    window.__PATCHES_LOADED__.push('/js/patch_2025-09-27_doccenter2.js');
  }

  const queueMicro = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn)=>Promise.resolve().then(fn);

  const STATUS_ORDER = ['requested','received','waived'];
  const STATUS_LABELS = {
    requested: 'Requested',
    received: 'Received',
    waived: 'Waived'
  };

  let catalogPromise = null;

  function canonicalStatus(value){
    const norm = String(value == null ? '' : value).trim().toLowerCase();
    return STATUS_ORDER.includes(norm) ? norm : 'requested';
  }

  function normalizeName(name){
    return String(name == null ? '' : name).trim();
  }

  function makeId(){
    if(window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if(typeof window.uuid === 'function') return window.uuid();
    return String(Date.now() + Math.random());
  }

  function dispatchDataChanged(detail){
    const payload = Object.assign({ source: 'doccenter2' }, detail||{});
    if(typeof window.dispatchAppDataChanged === 'function'){
      window.dispatchAppDataChanged(payload);
    }else{
      document.dispatchEvent(new CustomEvent('app:data:changed', { detail: payload }));
    }
  }

  function inform(message){
    try{
      if(typeof window.toast === 'function') window.toast(message);
      else if(typeof window.notify === 'function') window.notify(message);
      else console.log('[doccenter2]', message);
    }catch(err){ console.warn('doccenter2 notify failed', err); }
  }

  function logActivityNote(contactId, summary){
    const logger = window.logActivity || window.addActivity || window.recordActivity || window.activityLog;
    if(typeof logger === 'function'){
      try{ logger({ contactId, summary, ts: Date.now() }); }
      catch(err){ console.warn('doccenter2 activity log failed', err); }
    }
  }

  async function fetchCatalog(){
    const names = new Map();
    const seeds = ['Conventional','FHA','VA','USDA','Jumbo','Non-QM','HELOC','Bridge','Other'];
    if(typeof window.requiredDocsFor === 'function'){
      for(const loanType of seeds){
        try{
          const docs = await window.requiredDocsFor(loanType);
          (Array.isArray(docs) ? docs : []).forEach(name => {
            const trimmed = normalizeName(name);
            if(!trimmed) return;
            const key = trimmed.toLowerCase();
            if(!names.has(key)) names.set(key, trimmed);
          });
        }catch(err){ console.warn('doccenter2 catalog fetch', err); }
      }
    }
    try{
      const existing = await dbGetAll('documents');
      (Array.isArray(existing) ? existing : []).forEach(doc => {
        if(!doc) return;
        const trimmed = normalizeName(doc.name);
        if(!trimmed) return;
        const key = trimmed.toLowerCase();
        if(!names.has(key)) names.set(key, trimmed);
      });
    }catch(err){ console.warn('doccenter2 catalog documents', err); }
    return names;
  }

  function loadCatalog(){
    if(!catalogPromise){
      catalogPromise = fetchCatalog().catch(err=>{ console.warn('doccenter2 catalog', err); return new Map(); });
    }
    return catalogPromise;
  }

  function formatTooltip(doc){
    const parts = [];
    if(doc.updatedAt){
      try{
        const dt = new Date(doc.updatedAt);
        if(!Number.isNaN(dt.getTime())) parts.push(`Updated ${dt.toLocaleString()}`);
      }catch(_){ /* noop */ }
    }
    if(doc.source){
      const label = String(doc.source).trim();
      if(label) parts.push(`Source: ${label}`);
    }
    return parts.join(' • ');
  }

  async function loadDocsForContact(contactId){
    if(!contactId) return [];
    let list = [];
    try{
      const all = await dbGetAll('documents');
      list = (all||[]).filter(doc => doc && String(doc.contactId) === String(contactId));
    }catch(err){ console.warn('doccenter2 load docs', err); }
    return list.map(raw => ({
      id: String(raw && raw.id || makeId()),
      contactId: raw ? raw.contactId : contactId,
      name: normalizeName(raw && raw.name),
      status: canonicalStatus(raw && raw.status),
      type: raw && raw.type || '',
      source: raw && raw.source || '',
      createdAt: raw && raw.createdAt || Date.now(),
      updatedAt: raw && raw.updatedAt || raw && raw.createdAt || Date.now()
    }));
  }

  async function syncContactAfterChange(contactId, docs, opts){
    if(!contactId) return false;
    let contact = null;
    try{ contact = await dbGet('contacts', contactId); }
    catch(err){ console.warn('doccenter2 contact fetch', err); }
    if(!contact) return false;
    const options = Object.assign({ recomputeMissing:true, touch:false }, opts||{});
    let touched = false;
    if(options.recomputeMissing && typeof window.computeMissingDocsFrom === 'function'){
      try{
        const missing = await window.computeMissingDocsFrom(docs, contact.loanType || contact.loanProgram);
        if((contact.missingDocs||'') !== (missing||'')){
          contact.missingDocs = missing || '';
          contact.updatedAt = Date.now();
          touched = true;
        }
      }catch(err){ console.warn('doccenter2 compute missing', err); }
    }
    if(options.touch){
      contact.updatedAt = Date.now();
      touched = true;
    }
    if(touched){
      try{ await dbPut('contacts', contact); }
      catch(err){ console.warn('doccenter2 contact update', err); }
    }
    return touched;
  }
  async function insertDoc(state, doc){
    const contactId = state.contactId();
    if(!contactId) throw new Error('contact required');
    const now = Date.now();
    const record = {
      id: doc.id || makeId(),
      contactId,
      name: normalizeName(doc.name),
      status: canonicalStatus(doc.status),
      type: doc.type || '',
      source: doc.source || '',
      createdAt: doc.createdAt || now,
      updatedAt: now
    };
    await dbPut('documents', record);
    const docs = await loadDocsForContact(contactId);
    await syncContactAfterChange(contactId, docs, { recomputeMissing:true, touch:true });
    dispatchDataChanged({ store:'documents', contactId, inserted:record.id });
    return docs;
  }

  async function updateDoc(state, doc, changes, opts){
    const contactId = state.contactId();
    if(!contactId) throw new Error('contact required');
    const now = Date.now();
    const next = Object.assign({}, doc, changes||{});
    next.name = normalizeName(next.name);
    next.status = canonicalStatus(next.status);
    next.updatedAt = now;
    await dbPut('documents', next);
    const docs = await loadDocsForContact(contactId);
    const options = Object.assign({ touchContact:false, recompute:true }, opts||{});
    await syncContactAfterChange(contactId, docs, { recomputeMissing:options.recompute, touch:options.touchContact });
    dispatchDataChanged({ store:'documents', contactId, updated:next.id });
    return docs;
  }

  function createLane(status, label){
    const lane = document.createElement('div');
    lane.className = 'doc-lane card';
    lane.dataset.status = status;
    lane.setAttribute('role', 'region');
    lane.setAttribute('aria-label', `${label} documents lane`);
    lane.setAttribute('aria-dropeffect', 'move');
    lane.style.minHeight = '140px';
    lane.style.padding = '10px';
    lane.style.border = '1px solid #e2e8f0';
    lane.style.borderRadius = '12px';
    lane.style.background = '#ffffff';
    lane.style.display = 'flex';
    lane.style.flexDirection = 'column';
    lane.style.gap = '6px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    const title = document.createElement('strong');
    title.textContent = label;
    const count = document.createElement('span');
    count.className = 'muted';
    count.textContent = '0';
    header.appendChild(title);
    header.appendChild(count);

    const list = document.createElement('ul');
    list.className = 'doc-chip-list';
    list.dataset.status = status;
    list.setAttribute('role', 'list');
    list.style.minHeight = '80px';

    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Drop docs here';
    empty.style.fontSize = '12px';
    empty.style.padding = '8px 4px';
    empty.style.textAlign = 'center';

    lane.appendChild(header);
    lane.appendChild(list);
    lane.appendChild(empty);

    return { lane, list, title, count, empty, status, label };
  }

  function clearKeyboardDrag(state){
    state.keyboardDragId = null;
    state.keyboardTargetIndex = null;
    highlightKeyboardLane(state);
  }

  function beginKeyboardDrag(state, docId, status){
    state.keyboardDragId = docId;
    const idx = STATUS_ORDER.indexOf(status);
    state.keyboardTargetIndex = idx >= 0 ? idx : 0;
    highlightKeyboardLane(state);
  }

  function moveKeyboardTarget(state, delta){
    if(state.keyboardTargetIndex == null) state.keyboardTargetIndex = 0;
    let next = state.keyboardTargetIndex + delta;
    next = Math.max(0, Math.min(STATUS_ORDER.length - 1, next));
    if(next !== state.keyboardTargetIndex){
      state.keyboardTargetIndex = next;
      highlightKeyboardLane(state);
    }
  }

  function highlightKeyboardLane(state){
    const active = state.keyboardDragId != null;
    const targetIdx = active ? state.keyboardTargetIndex : null;
    STATUS_ORDER.forEach((status, idx)=>{
      const info = state.lanes.get(status);
      if(!info) return;
      if(active && idx === targetIdx){
        info.lane.style.boxShadow = '0 0 0 2px #94a3b8';
      }else{
        info.lane.style.boxShadow = '';
      }
    });
  }

  async function commitKeyboardDrop(state, chip){
    if(state.keyboardTargetIndex == null) return;
    const targetStatus = STATUS_ORDER[state.keyboardTargetIndex];
    const doc = chip.getDoc();
    if(!doc) return;
    const prevStatus = doc.status;
    if(targetStatus === prevStatus){
      chip.setAttribute('aria-grabbed', 'false');
      clearKeyboardDrag(state);
      return;
    }
    try{
      chip.setAttribute('aria-grabbed', 'false');
      const docs = await updateDoc(state, doc, { status: targetStatus }, { touchContact:true, recompute:true });
      clearKeyboardDrag(state);
      state.refresh({ docs, focusDocId: doc.id });
      logActivityNote(state.contactId(), `${doc.name} marked ${STATUS_LABELS[targetStatus]}`);
    }catch(err){
      console.warn('doccenter2 keyboard drop', err);
      inform('Unable to move document.');
      clearKeyboardDrag(state);
    }
  }

  function createChipElement(doc, state){
    let current = Object.assign({}, doc);
    const item = document.createElement('li');
    item.className = 'doc-chip';
    item.dataset.docId = current.id;
    item.dataset.status = current.status;
    item.setAttribute('draggable', 'true');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-grabbed', 'false');
    item.tabIndex = 0;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'doc-chip-name';
    nameSpan.textContent = current.name;

    const badge = document.createElement('span');
    badge.className = 'doc-chip-status';
    badge.textContent = STATUS_LABELS[current.status] || current.status;

    const select = document.createElement('select');
    select.className = 'doc-status-select';
    select.setAttribute('aria-label', `Set status for ${current.name}`);
    select.style.fontSize = '11px';
    select.style.padding = '2px 4px';
    STATUS_ORDER.forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = STATUS_LABELS[key];
      if(key === current.status) option.selected = true;
      select.appendChild(option);
    });

    function sync(){
      item.dataset.status = current.status;
      nameSpan.textContent = current.name;
      badge.textContent = STATUS_LABELS[current.status] || current.status;
      select.value = current.status;
      item.title = formatTooltip(current);
    }

    select.addEventListener('change', async (evt)=>{
      evt.stopPropagation();
      const nextStatus = canonicalStatus(select.value);
      if(nextStatus === current.status) return;
      const prevStatus = current.status;
      try{
        current.status = nextStatus;
        current.updatedAt = Date.now();
        sync();
        const docs = await updateDoc(state, current, { status: nextStatus }, { touchContact:true, recompute:true });
        state.refresh({ docs, focusDocId: current.id });
        if(prevStatus !== nextStatus){
          logActivityNote(state.contactId(), `${current.name} marked ${STATUS_LABELS[nextStatus]}`);
        }
      }catch(err){
        console.warn('doccenter2 status change', err);
        inform('Unable to update document status.');
        current.status = prevStatus;
        sync();
      }
    });

    item.addEventListener('dragstart', (evt)=>{
      evt.dataTransfer.effectAllowed = 'move';
      evt.dataTransfer.setData('text/plain', current.id);
      item.classList.add('dragging');
      item.setAttribute('aria-grabbed', 'true');
      state.activeDragId = current.id;
    });

    item.addEventListener('dragend', ()=>{
      item.classList.remove('dragging');
      item.setAttribute('aria-grabbed', 'false');
      if(state.activeDragId === current.id) state.activeDragId = null;
    });

    item.addEventListener('keydown', async (evt)=>{
      const key = evt.key;
      if(key === ' ' || key === 'Spacebar'){
        evt.preventDefault();
        if(state.keyboardDragId === current.id){
          item.setAttribute('aria-grabbed', 'false');
          clearKeyboardDrag(state);
        }else{
          item.setAttribute('aria-grabbed', 'true');
          beginKeyboardDrag(state, current.id, current.status);
        }
        return;
      }
      if(state.keyboardDragId !== current.id) return;
      if(key === 'ArrowLeft' || key === 'ArrowUp'){
        evt.preventDefault();
        moveKeyboardTarget(state, -1);
        return;
      }
      if(key === 'ArrowRight' || key === 'ArrowDown'){
        evt.preventDefault();
        moveKeyboardTarget(state, 1);
        return;
      }
      if(key === 'Enter'){
        evt.preventDefault();
        await commitKeyboardDrop(state, item);
      }
    });

    item.appendChild(nameSpan);
    item.appendChild(badge);
    item.appendChild(select);
    item.title = formatTooltip(current);

    item.update = function(nextDoc){
      current = Object.assign({}, nextDoc);
      sync();
    };
    item.getDoc = function(){ return Object.assign({}, current); };

    return item;
  }
  function flashChip(state, docId){
    const chip = state.chips.get(docId);
    if(!chip) return;
    chip.focus();
    if(chip.__flashTimer) clearTimeout(chip.__flashTimer);
    chip.style.transition = 'box-shadow 0.25s ease';
    chip.style.boxShadow = '0 0 0 2px #f97316';
    chip.__flashTimer = setTimeout(()=>{
      chip.style.boxShadow = '';
      chip.__flashTimer = null;
    }, 600);
  }

  function getDocById(state, docId){
    const key = String(docId);
    return state.docs.find(d => String(d.id) === key) || null;
  }

  function attachLaneEvents(state, info){
    const resetHighlight = ()=>{
      info.lane.style.background = '#ffffff';
      info.lane.style.outline = '';
    };
    info.lane.addEventListener('dragover', (evt)=>{
      const id = state.activeDragId || (evt.dataTransfer && evt.dataTransfer.getData('text/plain'));
      if(!id) return;
      evt.preventDefault();
      evt.dataTransfer.dropEffect = 'move';
      info.lane.style.background = '#f8fafc';
      info.lane.style.outline = '2px dashed #94a3b8';
    });
    info.lane.addEventListener('dragenter', (evt)=>{
      const id = state.activeDragId || (evt.dataTransfer && evt.dataTransfer.getData('text/plain'));
      if(!id) return;
      evt.preventDefault();
      info.lane.style.background = '#f8fafc';
      info.lane.style.outline = '2px dashed #94a3b8';
    });
    info.lane.addEventListener('dragleave', ()=>{
      resetHighlight();
    });
    info.lane.addEventListener('drop', async (evt)=>{
      evt.preventDefault();
      resetHighlight();
      const docId = state.activeDragId || (evt.dataTransfer && evt.dataTransfer.getData('text/plain'));
      state.activeDragId = null;
      if(!docId) return;
      const doc = getDocById(state, docId);
      if(!doc) return;
      const nextStatus = info.status;
      if(nextStatus === doc.status) return;
      try{
        const docs = await updateDoc(state, doc, { status: nextStatus }, { touchContact:true, recompute:true });
        state.refresh({ docs, focusDocId: doc.id });
        logActivityNote(state.contactId(), `${doc.name} marked ${STATUS_LABELS[nextStatus]}`);
      }catch(err){
        console.warn('doccenter2 drop', err);
        inform('Unable to move document.');
      }
    });
  }
  function updateTypeaheadOptions(state){
    if(!state.typeaheadList) return;
    const options = new Map();
    if(state.catalog){
      state.catalog.forEach((value, key)=> options.set(key, value));
    }
    state.docs.forEach(doc =>{
      const name = normalizeName(doc.name);
      if(!name) return;
      const key = name.toLowerCase();
      if(!options.has(key)) options.set(key, name);
    });
    const frag = document.createDocumentFragment();
    Array.from(options.values()).sort((a,b)=> a.localeCompare(b)).forEach(name =>{
      const opt = document.createElement('option');
      opt.value = name;
      frag.appendChild(opt);
    });
    state.typeaheadList.innerHTML = '';
    state.typeaheadList.appendChild(frag);
  }

  function getLoanLabel(state){
    const sel = state.loanSelect;
    if(!sel) return 'loan';
    const opt = sel.selectedOptions && sel.selectedOptions[0];
    const text = opt && opt.textContent ? opt.textContent.trim() : '';
    const value = sel.value || '';
    return text || value || 'loan';
  }

  function updateSummary(state){
    const contactId = state.contactId();
    const docs = state.docs;
    const summaryEl = state.summaryEl;
    const missingEl = state.missingEl;
    const emailBtn = state.emailBtn;
    const outstanding = docs.filter(doc => doc.status === 'requested').map(doc => doc.name);
    const totals = {
      requested: docs.filter(doc => doc.status === 'requested').length,
      received: docs.filter(doc => doc.status === 'received').length,
      waived: docs.filter(doc => doc.status === 'waived').length
    };

    if(summaryEl){
      if(!contactId){
        summaryEl.textContent = 'Save this contact to manage documents.';
      }else if(!docs.length){
        summaryEl.textContent = 'No documents yet. Sync the required list or add a custom item.';
      }else{
        const total = docs.length;
        const outstandingCount = totals.requested;
        summaryEl.textContent = `${total} docs • ${totals.received} received • ${totals.waived} waived • ${outstandingCount} outstanding`;
      }
    }

    if(missingEl){
      const missing = state.contact && state.contact.missingDocs ? String(state.contact.missingDocs).trim() : '';
      if(missing){
        missingEl.textContent = `Still Needed: ${missing}`;
        missingEl.classList.add('warn');
      }else if(contactId && docs.length){
        missingEl.textContent = 'All required documents accounted for.';
        missingEl.classList.remove('warn');
      }else{
        missingEl.textContent = '';
        missingEl.classList.remove('warn');
      }
    }

    if(emailBtn){
      emailBtn.dataset.docs = JSON.stringify(outstanding);
      emailBtn.dataset.loan = getLoanLabel(state);
      emailBtn.disabled = !outstanding.length;
    }

    if(state.addButton){
      const hasContact = !!contactId;
      const enable = hasContact && !state.loading;
      state.addButton.disabled = !enable;
      if(state.typeaheadInput){
        state.typeaheadInput.disabled = !enable;
        state.typeaheadInput.placeholder = enable ? 'Add document name' : (hasContact ? 'Loading documents...' : 'Save contact to add docs');
      }
    }
  }

  function renderBoard(state, opts){
    const docs = (state.docs||[]).map(doc => Object.assign({}, doc));
    const grouped = new Map();
    STATUS_ORDER.forEach(status => grouped.set(status, []));
    docs.forEach(doc =>{
      const status = STATUS_ORDER.includes(doc.status) ? doc.status : 'requested';
      doc.status = status;
      grouped.get(status).push(doc);
    });
    STATUS_ORDER.forEach(status =>{
      grouped.get(status).sort((a,b)=>{
        const aTime = a.createdAt || 0;
        const bTime = b.createdAt || 0;
        if(aTime === bTime) return a.name.localeCompare(b.name);
        return aTime - bTime;
      });
    });

    const seen = new Set();
    STATUS_ORDER.forEach(status =>{
      const info = state.lanes.get(status);
      if(!info) return;
      const list = info.list;
      const docsForLane = grouped.get(status);
      docsForLane.forEach(doc =>{
        let chip = state.chips.get(doc.id);
        if(!chip){
          chip = createChipElement(doc, state);
          state.chips.set(doc.id, chip);
        }else{
          chip.update(doc);
        }
        if(chip.parentNode !== list) list.appendChild(chip);
        seen.add(doc.id);
      });
      Array.from(list.children).forEach(child =>{
        if(!child.dataset) return;
        if(child.dataset.docId && !seen.has(child.dataset.docId)){
          child.remove();
        }
      });
      info.count.textContent = String(docsForLane.length);
      info.empty.style.display = docsForLane.length ? 'none' : 'block';
    });

    Array.from(state.chips.keys()).forEach(id =>{
      if(!seen.has(id)){
        const chip = state.chips.get(id);
        if(chip && chip.parentNode) chip.parentNode.removeChild(chip);
        state.chips.delete(id);
      }
    });

    updateSummary(state);
    updateTypeaheadOptions(state);

    if(opts && opts.focusDocId){
      const chip = state.chips.get(opts.focusDocId);
      if(chip){
        queueMicro(()=> chip.focus());
      }
    }
  }
  function scheduleRefresh(state, opts){
    state.pendingRefresh = Object.assign({}, state.pendingRefresh||{}, opts||{});
    if(state.refreshQueued) return;
    state.refreshQueued = true;
    queueMicro(async ()=>{
      state.refreshQueued = false;
      if(state.destroyed) return;
      const payload = state.pendingRefresh;
      state.pendingRefresh = null;
      await state.refresh(payload||{});
    });
  }

  async function refreshState(state, opts){
    if(state.destroyed) return;
    state.loading = true;
    try{
      const contactId = state.contactId();
      if(!contactId){
        state.docs = [];
        state.contact = null;
        state.loading = false;
        renderBoard(state, opts);
        return;
      }
      let docs = null;
      if(opts && Array.isArray(opts.docs)){
        docs = opts.docs.map(doc => ({
          id: String(doc.id),
          contactId: doc.contactId,
          name: normalizeName(doc.name),
          status: canonicalStatus(doc.status),
          type: doc.type || '',
          source: doc.source || '',
          createdAt: doc.createdAt || Date.now(),
          updatedAt: doc.updatedAt || Date.now()
        }));
      }
      if(!docs){
        docs = await loadDocsForContact(contactId);
      }
      let contact = opts && opts.contact ? opts.contact : null;
      if(!contact){
        try{ contact = await dbGet('contacts', contactId); }
        catch(err){ console.warn('doccenter2 load contact', err); contact = null; }
      }
      state.docs = docs;
      state.contact = contact;
      state.loading = false;
      renderBoard(state, opts);
    }catch(err){
      state.loading = false;
      throw err;
    }
  }

  function buildBoardUI(state){
    const legacyList = state.legacyList;
    legacyList.innerHTML = '';
    legacyList.style.display = 'none';

    const board = document.createElement('div');
    board.dataset.docBoard = '1';
    board.style.display = 'flex';
    board.style.flexDirection = 'column';
    board.style.gap = '12px';
    legacyList.parentNode.insertBefore(board, legacyList.nextSibling);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.flexWrap = 'wrap';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = 'Add document name';
    input.setAttribute('aria-label', 'Document name');
    input.style.flex = '1 1 220px';
    input.style.minWidth = '180px';

    const datalist = document.createElement('datalist');
    datalist.id = `doccenter-catalog-${Math.random().toString(36).slice(2,10)}`;
    input.setAttribute('list', datalist.id);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn';
    addBtn.textContent = '+ Add';

    controls.appendChild(input);
    controls.appendChild(addBtn);

    board.appendChild(controls);
    board.appendChild(datalist);

    const lanesWrap = document.createElement('div');
    lanesWrap.style.display = 'grid';
    lanesWrap.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
    lanesWrap.style.gap = '12px';
    board.appendChild(lanesWrap);

    state.board = board;
    state.addButton = addBtn;
    state.typeaheadInput = input;
    state.typeaheadList = datalist;
    state.lanesWrap = lanesWrap;

    STATUS_ORDER.forEach(status =>{
      const info = createLane(status, STATUS_LABELS[status]);
      lanesWrap.appendChild(info.lane);
      state.lanes.set(status, info);
      attachLaneEvents(state, info);
    });
  }

  function createAddHandler(state){
    return async function handleAdd(){
      const input = state.typeaheadInput;
      if(!input) return;
      const name = normalizeName(input.value);
      if(!name){
        inform('Enter a document name.');
        input.focus();
        return;
      }
      const contactId = state.contactId();
      if(!contactId){
        inform('Save this contact before adding documents.');
        return;
      }
      const key = name.toLowerCase();
      const existing = state.docs.find(doc => doc.name.toLowerCase() === key);
      if(existing){
        flashChip(state, existing.id);
        inform('Document already exists for this contact.');
        return;
      }
      const catalog = state.catalog instanceof Map ? state.catalog : new Map();
      const source = catalog.has(key) ? 'catalog' : 'custom';
      const newDoc = { id: makeId(), name, status:'requested', source };
      try{
        const docs = await insertDoc(state, newDoc);
        input.value = '';
        await state.refresh({ docs, focusDocId: newDoc.id });
      }catch(err){
        console.warn('doccenter2 add', err);
        inform('Unable to add document.');
      }
    };
  }

  function createDataChangedHandler(state){
    return (evt)=>{
      if(state.destroyed) return;
      const detail = evt.detail || {};
      const contactId = state.contactId();
      if(!contactId) return;
      const stores = [];
      if(detail.store) stores.push(detail.store);
      if(Array.isArray(detail.stores)) stores.push(...detail.stores);
      if(Array.isArray(detail.tables)) stores.push(...detail.tables);
      const lowerStores = stores.map(s => String(s).toLowerCase());
      const contactIds = Array.isArray(detail.contactIds) ? detail.contactIds.map(String) : [];
      const targetContact = detail.contactId ? String(detail.contactId) : null;
      const related = lowerStores.includes('documents')
        || lowerStores.includes('document')
        || contactIds.includes(String(contactId))
        || (targetContact && targetContact === String(contactId));
      if(related){
        scheduleRefresh(state);
      }
    };
  }
  function setupBoard(dialog, body){
    const legacyList = body.querySelector('#c-doc-list');
    if(!legacyList) return null;
    if(body.querySelector('[data-doc-board]')){
      return body.__docBoardState || null;
    }

    const state = {
      dialog,
      body,
      idInput: body.querySelector('#c-id'),
      summaryEl: body.querySelector('#c-doc-summary'),
      missingEl: body.querySelector('#c-doc-missing'),
      emailBtn: body.querySelector('#c-email-docs'),
      loanSelect: body.querySelector('#c-loanType'),
      addButton: null,
      typeaheadInput: null,
      typeaheadList: null,
      lanes: new Map(),
      chips: new Map(),
      docs: [],
      contact: null,
      activeDragId: null,
      keyboardDragId: null,
      keyboardTargetIndex: null,
      refreshQueued: false,
      pendingRefresh: null,
      destroyed: false,
      catalog: null,
      loading: true,
      board: null,
      legacyList,
      contactId(){
        const el = state.idInput;
        return el && el.value ? String(el.value).trim() : '';
      },
      refresh: (opts)=> refreshState(state, opts)
    };

    buildBoardUI(state);

    const handleAdd = createAddHandler(state);
    if(state.addButton) state.addButton.addEventListener('click', handleAdd);
    if(state.typeaheadInput){
      state.typeaheadInput.addEventListener('keydown', (evt)=>{
        if(evt.key === 'Enter'){
          evt.preventDefault();
          handleAdd();
        }
      });
    }

    state.onDataChanged = createDataChangedHandler(state);
    document.addEventListener('app:data:changed', state.onDataChanged);

    state.destroy = ()=>{
      if(state.destroyed) return;
      state.destroyed = true;
      document.removeEventListener('app:data:changed', state.onDataChanged);
      if(state.onDialogClose) dialog.removeEventListener('close', state.onDialogClose);
      if(state.onDialogCancel) dialog.removeEventListener('cancel', state.onDialogCancel);
      state.chips.forEach(chip =>{
        if(chip.__flashTimer){
          clearTimeout(chip.__flashTimer);
          chip.__flashTimer = null;
        }
      });
      if(state.board && state.board.parentNode){
        state.board.parentNode.removeChild(state.board);
      }
      if(state.legacyList){
        state.legacyList.style.display = '';
      }
      body.__docBoardState = null;
    };

    state.onDialogClose = ()=> state.destroy();
    state.onDialogCancel = ()=> state.destroy();
    dialog.addEventListener('close', state.onDialogClose);
    dialog.addEventListener('cancel', state.onDialogCancel);

    if(state.loanSelect){
      state.loanSelect.addEventListener('change', ()=> updateSummary(state));
    }

    loadCatalog().then(map =>{
      if(state.destroyed) return;
      state.catalog = map instanceof Map ? map : new Map();
      updateTypeaheadOptions(state);
    });

    updateSummary(state);
    state.refresh({}).catch(err => console.warn('doccenter2 initial refresh', err));

    body.__docBoardState = state;
    return state;
  }
  document.addEventListener('contact:modal:ready', (evt)=>{
    const detail = evt.detail || {};
    const dialog = detail.dialog;
    const body = detail.body;
    if(!dialog || !body) return;
    if(dialog.__docBoardState && typeof dialog.__docBoardState.destroy === 'function'){
      dialog.__docBoardState.destroy();
    }
    const state = setupBoard(dialog, body);
    if(state) dialog.__docBoardState = state;
  });

  (function wrapEnsureRequiredDocs(){
    const original = window.ensureRequiredDocs;
    if(typeof original !== 'function' || original.__doccenter2Wrapped) return;
    const wrapped = async function(contact){
      const result = await original.apply(this, arguments);
      try{
        if(contact && contact.id && result > 0){
          dispatchDataChanged({ store:'documents', contactId: contact.id, ensured: result });
        }
      }catch(err){ console.warn('doccenter2 ensureRequiredDocs dispatch', err); }
      return result;
    };
    wrapped.__doccenter2Wrapped = true;
    window.ensureRequiredDocs = wrapped;
  })();
})();
