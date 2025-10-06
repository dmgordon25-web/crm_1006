export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_contact_linking_5C';
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('js/patch_2025-09-27_contact_linking_5C.js')){
    window.__PATCHES_LOADED__.push('js/patch_2025-09-27_contact_linking_5C.js');
  }

  const queueMicro = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn)=>Promise.resolve().then(fn);

  const RenderGuard = window.RenderGuard || {
    enter(){},
    exit(){},
    isRendering(){ return false; }
  };

  const originStyleId = 'contact-linked-rollup-styles';
  function ensureStyles(){
    if(document.getElementById(originStyleId)) return;
    const style = document.createElement('style');
    style.id = originStyleId;
    style.textContent = `
      .origin-pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 6px;font-size:11px;line-height:1.3;background:#e0f2fe;color:#0369a1;margin-left:8px;font-weight:500;white-space:nowrap;}
      .origin-pill[data-origin-self="true"]{background:#ede9fe;color:#5b21b6;}
      .linked-rollup-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
      .linked-rollup-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#0f172a;border:1px solid #cbd5f5;border-radius:999px;padding:2px 10px;background:#f8fafc;cursor:pointer;}
      .linked-rollup-toggle input{margin:0;}
      .linked-rollup-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 8px;background:#eef2ff;color:#312e81;font-size:12px;font-weight:500;cursor:pointer;}
      .timeline-list li .origin-pill{margin-left:6px;}
    `;
    document.head.appendChild(style);
  }

  function safeString(value){
    return String(value == null ? '' : value);
  }

  function normalizeId(value){
    return safeString(value).trim();
  }

  function formatName(contact){
    if(!contact) return '';
    const parts = [safeString(contact.first||'').trim(), safeString(contact.last||'').trim()].filter(Boolean);
    if(parts.length) return parts.join(' ');
    return safeString(contact.name || contact.company || contact.email || contact.phone || 'Contact').trim();
  }

  function getRelationships(){
    const svc = window.relationships || null;
    if(!svc) return null;
    if(typeof svc.listLinksFor !== 'function') return null;
    if(typeof svc.repointLinks !== 'function') return null;
    return svc;
  }

  async function emitDataChanged(detail){
    const payload = Object.assign({}, detail||{});
    const dispatch = ()=>{
      try{
        if(typeof window.dispatchAppDataChanged === 'function'){
          window.dispatchAppDataChanged(payload);
        }else{
          document.dispatchEvent(new CustomEvent('app:data:changed',{detail:payload}));
        }
      }catch(err){
        console.warn('linked rollup dispatch failed', err);
      }
    };
    if(RenderGuard && typeof RenderGuard.isRendering === 'function' && RenderGuard.isRendering()){
      queueMicro(()=> queueMicro(dispatch));
    }else{
      queueMicro(dispatch);
    }
  }

  function getContactIdFromDialog(dialog){
    if(!dialog) return '';
    const input = dialog.querySelector('#c-id');
    return normalizeId(input ? input.value : '');
  }

  function getLinkedState(dialog){
    if(!dialog) return null;
    return dialog.__contactLinkedState || null;
  }

  function getNeighborIds(dialog, contactId){
    const ids = new Set();
    if(contactId) ids.add(contactId);
    const linkedState = getLinkedState(dialog);
    const neighbors = linkedState && Array.isArray(linkedState.neighbors) ? linkedState.neighbors : [];
    neighbors.forEach(item => {
      const id = normalizeId(item && item.contactId);
      if(id && id !== contactId) ids.add(id);
    });
    return Array.from(ids);
  }

  async function loadContactsMap(targetIds){
    const ids = Array.isArray(targetIds) ? targetIds.map(normalizeId).filter(Boolean) : [];
    if(!ids.length) return new Map();
    if(typeof openDB !== 'function' || typeof dbGetAll !== 'function') return new Map();
    await openDB();
    let rows = [];
    try{ rows = await dbGetAll('contacts'); }
    catch(err){ console.warn('linked rollup load contacts', err); rows = []; }
    const map = new Map();
    const lookup = new Set(ids);
    rows.forEach(row => {
      const key = normalizeId(row && row.id);
      if(!key || !lookup.has(key)) return;
      map.set(key, Object.assign({}, row));
    });
    return map;
  }

  async function loadTasksFor(ids){
    if(typeof openDB !== 'function' || typeof dbGetAll !== 'function') return [];
    await openDB();
    let rows = [];
    try{ rows = await dbGetAll('tasks'); }
    catch(err){ console.warn('linked rollup load tasks', err); rows = []; }
    const lookup = new Set(ids.map(normalizeId));
    return rows.filter(row => lookup.has(normalizeId(row && row.contactId)));
  }

  async function loadQueueItems(ids){
    if(typeof openDB !== 'function' || typeof dbGet !== 'function') return [];
    await openDB();
    let record = null;
    try{ record = await dbGet('meta', 'automationsQueue'); }
    catch(err){ console.warn('linked rollup load queue', err); }
    const items = Array.isArray(record && record.items) ? record.items : [];
    const lookup = new Set(ids.map(normalizeId));
    return items.filter(item => lookup.has(normalizeId(item && item.contactId)));
  }

  const escapeHtml = (value)=> String(value==null?'':value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const formatDate = (ts)=>{
    if(!ts && ts!==0) return '';
    const date = ts instanceof Date ? ts : new Date(Number(ts));
    if(Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0,16).replace('T',' ');
  };

  function timestampFor(entry, fallback){
    if(!entry) return fallback || Date.now();
    const keys = ['when','whenDue','timestamp','ts','date','due','dueAt','runAt','completedAt','createdAt','updatedAt'];
    for(const key of keys){
      if(entry[key]){
        const val = entry[key];
        const num = typeof val === 'number' ? val : Date.parse(val);
        if(!Number.isNaN(num)) return num;
      }
    }
    return fallback || Date.now();
  }

  function buildTimelineRows(contactsMap, queueItems, contactIds){
    const rows = [];
    const dedupe = new Set();
    contactIds.forEach(contactId => {
      const contact = contactsMap.get(contactId) || null;
      const name = formatName(contact);
      const extras = contact && contact.extras && Array.isArray(contact.extras.timeline) ? contact.extras.timeline : [];
      extras.forEach(entry => {
        const ts = timestampFor(entry, Date.now());
        const label = entry && (entry.text || entry.summary || entry.title || 'Timeline');
        const key = entry && entry.id ? `history:${entry.id}` : `history:${contactId}:${ts}:${label}`;
        if(dedupe.has(key)) return;
        dedupe.add(key);
        rows.push({
          type: 'history',
          ts,
          entry,
          contactId,
          name,
          self: contactId === contactIds[0]
        });
      });
    });
    queueItems.forEach(item => {
      const contactId = normalizeId(item && item.contactId);
      if(!contactId) return;
      const contact = contactsMap.get(contactId) || null;
      const name = formatName(contact);
      const when = item.status === 'done' ? (item.completedAt || item.runAt) : item.runAt;
      const ts = timestampFor({ ts: when }, Date.now());
      const key = `queue:${item.id || contactId+':'+ts}`;
      if(dedupe.has(key)) return;
      dedupe.add(key);
      rows.push({
        type: 'queue',
        ts,
        item,
        contactId,
        name,
        self: contactId === contactIds[0]
      });
    });
    rows.sort((a,b)=> (b.ts||0) - (a.ts||0));
    return rows;
  }

  function renderQueueRow(row){
    const item = row.item || {};
    const status = item.status || 'queued';
    const whenTs = status === 'done' ? (item.completedAt || item.runAt) : item.runAt;
    const whenLabel = formatDate(whenTs);
    if(status === 'queued'){
      const actions = [];
      if(item.type && item.type.startsWith('email:')) actions.push(`<button class="btn pill" data-queue-send="${escapeHtml(item.id)}">Send</button>`);
      actions.push(`<button class="btn pill" data-queue-cancel="${escapeHtml(item.id)}">Cancel</button>`);
      const actionHtml = actions.length ? ` — ${actions.join(' ')}` : '';
      return `<li data-entry="queue" data-id="${escapeHtml(item.id||'')}">Queued: ${escapeHtml(item.label||item.type||'Automation')}${whenLabel?` (${escapeHtml(whenLabel)})`:''}${actionHtml}${renderOriginPill(row)}</li>`;
    }
    if(status === 'canceled'){
      return `<li data-entry="queue" data-id="${escapeHtml(item.id||'')}">Canceled: ${escapeHtml(item.label||item.type||'Automation')}${whenLabel?` (${escapeHtml(whenLabel)})`:''}${renderOriginPill(row)}</li>`;
    }
    return `<li data-entry="queue" data-id="${escapeHtml(item.id||'')}">Sent: ${escapeHtml(item.label||item.type||'Automation')}${whenLabel?` (${escapeHtml(whenLabel)})`:''}${renderOriginPill(row)}</li>`;
  }

  function renderHistoryRow(row){
    const entry = row.entry || {};
    const when = entry.when || entry.date || entry.timestamp;
    const whenLabel = formatDate(when);
    const text = entry.text || entry.summary || entry.title || entry.note || 'Timeline entry';
    return `<li data-entry="history">${escapeHtml(text)}${whenLabel?` (${escapeHtml(whenLabel)})`:''}${renderOriginPill(row)}</li>`;
  }

  function renderOriginPill(row){
    const owner = row.name || '';
    const pill = owner ? `<span class="origin-pill" data-origin-id="${escapeHtml(row.contactId||'')}" data-origin-self="${row.self?'true':'false'}">${row.self ? 'This contact' : `via ${escapeHtml(owner)}`}</span>` : '';
    return pill;
  }

  function renderTimeline(list, rows){
    if(!list) return;
    if(!rows.length){
      list.innerHTML = '<li class="muted">No timeline entries yet.</li>';
      return;
    }
    const html = rows.map(row => row.type === 'queue' ? renderQueueRow(row) : renderHistoryRow(row)).join('');
    list.innerHTML = html;
  }

  function renderTasks(list, rows){
    if(!list) return;
    if(!rows.length){
      list.innerHTML = '<li class="muted">No open tasks for linked contacts.</li>';
      return;
    }
    const html = rows.map(row => {
      const dueLabel = row.dueLabel ? ` (${escapeHtml(row.dueLabel)})` : '';
      const statusLabel = row.status ? `<span class="task-status">${escapeHtml(row.status)}</span>` : '';
      const pill = renderOriginPill(row);
      return `<li data-task-id="${escapeHtml(row.id||'')}">${escapeHtml(row.title||row.label||'Task')}${dueLabel}${statusLabel?` ${statusLabel}`:''}${pill}</li>`;
    }).join('');
    list.innerHTML = html;
  }

  function buildTaskRows(tasks, contactsMap, contactIds){
    const rows = [];
    const lookup = new Set(contactIds.map(normalizeId));
    const dedupe = new Set();
    tasks.forEach(task => {
      const contactId = normalizeId(task && task.contactId);
      if(!lookup.has(contactId)) return;
      const contact = contactsMap.get(contactId) || null;
      const name = formatName(contact);
      const ts = timestampFor(task, Date.now());
      const dueDate = task && task.due ? new Date(task.due) : null;
      const dueLabel = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString().slice(0,10) : '';
      const key = task && task.id ? `task:${task.id}` : `task:${contactId}:${task && task.title || task && task.label || ''}:${ts}`;
      if(dedupe.has(key)) return;
      dedupe.add(key);
      rows.push({
        id: task && task.id,
        title: task && (task.title || task.label || task.text || 'Task'),
        dueLabel,
        status: task && (task.status || (task.done ? 'done' : 'open')),
        ts,
        contactId,
        name,
        self: contactId === contactIds[0]
      });
    });
    rows.sort((a,b)=> (b.ts||0) - (a.ts||0));
    return rows;
  }

  function findTimelineList(dialog){
    if(!dialog) return null;
    const section = dialog.querySelector('#contact-timeline');
    if(!section) return null;
    const list = section.querySelector('.timeline-list, ul');
    return list || null;
  }

  function findTasksList(dialog){
    if(!dialog) return null;
    const selectors = ['#contact-task-list', '.contact-task-list', '[data-contact-task-list]'];
    for(const sel of selectors){
      const node = dialog.querySelector(sel);
      if(node) return node;
    }
    return null;
  }

  function ensureToggle(dialog){
    const section = dialog && dialog.querySelector('#contact-timeline');
    if(!section) return null;
    let headerWrap = section.querySelector('.linked-rollup-header');
    if(!headerWrap){
      const heading = section.querySelector('h4');
      if(heading){
        headerWrap = document.createElement('div');
        headerWrap.className = 'linked-rollup-header';
        heading.parentNode.insertBefore(headerWrap, heading);
        headerWrap.appendChild(heading);
      }
    }
    if(!headerWrap) return null;
    let label = dialog.querySelector('#contact-linked-rollup-toggle-label');
    if(!label){
      label = document.createElement('label');
      label.id = 'contact-linked-rollup-toggle-label';
      label.className = 'linked-rollup-toggle';
      label.innerHTML = `<input type="checkbox" id="contact-linked-rollup-toggle" aria-controls="contact-timeline"/> Show linked activity`;
      headerWrap.appendChild(label);
    }
    const input = label.querySelector('#contact-linked-rollup-toggle');
    return input || null;
  }

  function ensureHeaderBadge(state){
    const dialog = state.dialog;
    const summary = dialog && dialog.querySelector('.modal-summary .summary-name');
    if(!summary) return;
    let badge = summary.querySelector('.linked-rollup-badge');
    const count = Math.max(0, state.neighborCount || 0);
    if(count <= 0){
      if(badge){ badge.remove(); }
      return;
    }
    if(!badge){
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'linked-rollup-badge';
      badge.innerHTML = '🔗 <span class="linked-rollup-count"></span>';
      summary.appendChild(badge);
      badge.addEventListener('click', ()=>{
        if(typeof window.focusContactLinkedSection === 'function'){
          window.focusContactLinkedSection();
        }
      });
      badge.addEventListener('keydown', evt => {
        if(evt.key === 'Enter' || evt.key === ' '){
          evt.preventDefault();
          badge.click();
        }
      });
    }
    const countNode = badge.querySelector('.linked-rollup-count');
    if(countNode) countNode.textContent = String(count);
    badge.setAttribute('aria-label', `${count} linked contact${count===1?'':'s'}`);
    badge.title = 'View linked contacts';
  }

  const sessionToggleState = new Map();

  function createModalState(dialog){
    return {
      dialog,
      toggle: null,
      contactId: '',
      enabled: false,
      neighborCount: 0,
      contactsMap: new Map(),
      tasks: [],
      queueItems: [],
      timelineCacheKey: '',
      tasksCacheKey: '',
      observerAttached: false,
      pendingApply: false,
      pendingApplyAgain: false,
      destroyed: false
    };
  }

  function getModalState(dialog){
    if(!dialog) return null;
    if(dialog.__contactRollupState) return dialog.__contactRollupState;
    const state = createModalState(dialog);
    dialog.__contactRollupState = state;
    dialog.addEventListener('close', ()=>{ state.destroyed = true; state.toggle = null; });
    return state;
  }

  async function refreshNeighbors(state){
    const dialog = state.dialog;
    const contactId = state.contactId;
    const ids = getNeighborIds(dialog, contactId);
    state.neighborCount = Math.max(0, ids.length - (contactId ? 1 : 0));
    ensureHeaderBadge(state);
    const key = ids.join('|');
    if(key === state.timelineCacheKey && key === state.tasksCacheKey) return;
    state.timelineCacheKey = key;
    state.tasksCacheKey = key;
    state.contactsMap = await loadContactsMap(ids);
    const [queueItems, tasks] = await Promise.all([
      loadQueueItems(ids),
      loadTasksFor(ids)
    ]);
    state.queueItems = Array.isArray(queueItems) ? queueItems : [];
    state.tasks = Array.isArray(tasks) ? tasks : [];
  }

  async function applyRollup(state){
    if(state.pendingApply){
      state.pendingApplyAgain = true;
      return;
    }
    state.pendingApply = true;
    try{
      await refreshNeighbors(state);
      const ids = getNeighborIds(state.dialog, state.contactId);
      const timelineRows = buildTimelineRows(state.contactsMap, state.queueItems, ids);
      const tasksRows = buildTaskRows(state.tasks, state.contactsMap, ids);
      const timelineList = findTimelineList(state.dialog);
      const taskList = findTasksList(state.dialog);
      if(timelineRows.length > 500 || tasksRows.length > 500){
        await Promise.resolve();
      }
      renderTimeline(timelineList, timelineRows);
      renderTasks(taskList, tasksRows);
    }catch(err){
      console.warn('linked rollup apply failed', err);
    }finally{
      state.pendingApply = false;
      if(state.pendingApplyAgain){
        state.pendingApplyAgain = false;
        applyRollup(state);
      }
    }
  }

  function restoreBaseViews(state){
    const dialog = state.dialog;
    const list = findTimelineList(dialog);
    if(list){
      list.innerHTML = '<li class="muted">Loading timeline...</li>';
      if(typeof window.repaint === 'object' && typeof window.repaint.timeline === 'function' && state.contactId){
        window.repaint.timeline(state.contactId);
      }
    }
    const taskList = findTasksList(dialog);
    if(taskList){
      taskList.innerHTML = '';
    }
  }

  function handleToggleChange(state, checked){
    state.enabled = !!checked;
    if(state.contactId){
      sessionToggleState.set(state.contactId, state.enabled);
    }
    if(state.enabled){
      applyRollup(state);
    }else{
      restoreBaseViews(state);
    }
  }

  function onModalReady(detail){
    ensureStyles();
    const dialog = detail && detail.dialog;
    const body = detail && detail.body;
    if(!dialog || !body) return;
    const state = getModalState(dialog);
    state.contactId = getContactIdFromDialog(dialog);
    const toggle = ensureToggle(dialog);
    state.toggle = toggle;
    const remembered = state.contactId ? sessionToggleState.get(state.contactId) : false;
    if(toggle){
      toggle.checked = !!remembered;
      if(!toggle.__linkedRollup){
        toggle.__linkedRollup = true;
        toggle.addEventListener('change', ()=> handleToggleChange(state, toggle.checked));
      }
    }
    state.enabled = !!remembered;
    state.timelineCacheKey = '';
    state.tasksCacheKey = '';
    const ids = getNeighborIds(dialog, state.contactId);
    state.neighborCount = Math.max(0, ids.length - (state.contactId ? 1 : 0));
    ensureHeaderBadge(state);
    if(state.enabled){
      applyRollup(state);
    }else{
      restoreBaseViews(state);
    }
  }

  document.addEventListener('contact:modal:ready', evt =>{
    onModalReady(evt && evt.detail);
  });

  function handleAppDataChanged(evt){
    const detail = evt && evt.detail || {};
    const dialogs = Array.from(document.querySelectorAll('#contact-modal'));
    dialogs.forEach(dialog => {
      const state = dialog.__contactRollupState;
      if(!state || state.destroyed) return;
      const isRelationships = String(detail.topic||'').startsWith('relationships:');
      const contactId = normalizeId(detail.contactId || detail.id || detail.winnerId || detail.loserId || '');
      const relevant = isRelationships || (contactId && (contactId === state.contactId));
      if(state.enabled && relevant){
        queueMicro(()=> applyRollup(state));
      }else if(relevant){
        state.timelineCacheKey = '';
        state.tasksCacheKey = '';
        ensureHeaderBadge(state);
      }
    });
    enhanceLinkButtons();
    if(detail.topic === 'merge:contacts'){
      const svc = getRelationships();
      if(!svc) return;
      const winnerId = normalizeId(detail.winnerId);
      const loserId = normalizeId(detail.loserId);
      if(!winnerId || !loserId || winnerId === loserId) return;
      svc.repointLinks({ winnerId, loserId }).then(result =>{
        emitDataChanged(Object.assign({ topic:'relationships:repointed', source:'relationships:merge-hook' }, result || {}, { winnerId, loserId }));
      }).catch(err => console.warn('merge repoint failed', err));
    }
  }
  document.addEventListener('app:data:changed', handleAppDataChanged);

  function enhanceLinkButtons(){
    const buttons = document.querySelectorAll('button[data-contact-links]');
    buttons.forEach(btn => {
      if(btn.__linkedTooltip) return;
      btn.__linkedTooltip = true;
      const count = Number(btn.textContent||btn.dataset.count||0) || 0;
      btn.title = 'Click to manage links';
      const aria = count === 1 ? 'Open linked contact (1)' : `Open linked contacts (${count})`;
      btn.setAttribute('aria-label', aria);
      btn.addEventListener('keydown', evt => {
        if(evt.key === ' '){
          evt.preventDefault();
          btn.click();
        }
      });
    });
  }

  const observeWorkbench = ()=>{
    const host = document.getElementById('workbench');
    if(!host || host.__linkedObserver) return;
    const observer = new MutationObserver(()=> queueMicro(()=> enhanceLinkButtons()));
    observer.observe(host, { childList:true, subtree:true });
    host.__linkedObserver = observer;
    enhanceLinkButtons();
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{
      observeWorkbench();
      enhanceLinkButtons();
    });
  }else{
    observeWorkbench();
    enhanceLinkButtons();
  }

  function ensureWindowRepoint(){
    const svc = getRelationships();
    if(!svc) return;
    if(typeof window.repointLinks !== 'function'){
      window.repointLinks = function(opts){
        return svc.repointLinks(opts);
      };
    }
  }
  ensureWindowRepoint();

  

  function wrapMerge(){
    const original = window.mergeContactsWithIds;
    if(typeof original !== 'function' || original.__linkedRollupWrapped) return;
    const wrapped = async function(ids){
      const list = Array.isArray(ids) ? ids.slice(0,2).map(normalizeId).filter(Boolean) : [];
      const result = await original.apply(this, arguments);
      if(list.length === 2 && typeof openDB === 'function' && typeof dbGet === 'function'){
        queueMicro(async ()=>{
          try{
            await openDB();
            const [first, second] = await Promise.all([dbGet('contacts', list[0]), dbGet('contacts', list[1])]);
            let winnerId = '';
            let loserId = '';
            if(first && !second){
              winnerId = list[0];
              loserId = list[1];
            }else if(!first && second){
              winnerId = list[1];
              loserId = list[0];
            }else{
              return;
            }
            if(!winnerId || !loserId || winnerId === loserId) return;
            await emitDataChanged({ topic:'merge:contacts', source:'relationships:merge-wrapper', winnerId, loserId });
          }catch(err){ console.warn('merge repoint detect failed', err); }
        });
      }
      return result;
    };
    wrapped.__linkedRollupWrapped = true;
    window.mergeContactsWithIds = wrapped;
  }
  wrapMerge();
})();
