import { getDB } from '/js/store/db_core.js';

export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_workbench';
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;

  const queueMicro = typeof queueMicrotask === 'function' ? queueMicrotask : (fn)=>Promise.resolve().then(fn);
  const RenderGuard = window.RenderGuard || { enter(){}, exit(){}, isRendering(){ return false; } };

  const ENTITY_CONFIG = {
    contacts: {
      label: 'Contacts',
      store: 'contacts',
      type: 'contacts',
      icon: '👥'
    },
    clients: {
      label: 'Clients',
      store: 'contacts',
      type: 'contacts',
      icon: '🧾'
    },
    partners: {
      label: 'Partners',
      store: 'partners',
      type: 'partners',
      icon: '🤝'
    },
    longshots: {
      label: 'Long Shots',
      store: 'contacts',
      type: 'contacts',
      icon: '🎯'
    }
  };
  const ENTITY_ORDER = ['contacts','clients','partners','longshots'];
  const PAGE_SIZES = [25,50,100];
  const PAGE_DEFAULT = 50;

  const FILTER_DEFAULTS = {
    contacts(){
      return {
        q: '',
        stages: [],
        partnerId: '',
        createdFrom: '',
        createdTo: '',
        updatedFrom: '',
        updatedTo: '',
        lastTouchFrom: '',
        lastTouchTo: '',
        hasEmail: false,
        hasPhone: false,
        overdueTasks: false,
        lastTouchOlderThan: '',
        partnerIds: [],
        hasLinkedContacts: 'any'
      };
    },
    clients(){
      const base = FILTER_DEFAULTS.contacts();
      base.stages = [];
      base.partnerId = '';
      return base;
    },
    partners(){
      return {
        q: '',
        tiers: [],
        createdFrom: '',
        createdTo: '',
        updatedFrom: '',
        updatedTo: '',
        lastTouchFrom: '',
        lastTouchTo: '',
        hasEmail: false,
        hasPhone: false,
        lastTouchOlderThan: ''
      };
    },
    longshots(){
      const base = FILTER_DEFAULTS.contacts();
      base.status = '';
      base.stages = [];
      return base;
    }
  };

  const SORT_DEFAULTS = {
    contacts: { field: 'updatedAt', dir: 'desc' },
    clients: { field: 'lastTouch', dir: 'desc' },
    partners: { field: 'lastTouch', dir: 'desc' },
    longshots: { field: 'lastTouch', dir: 'desc' }
  };

  const dom = {};
  const state = {
    entity: 'contacts',
    filters: FILTER_DEFAULTS.contacts(),
    sort: SORT_DEFAULTS.contacts,
    page: 1,
    pageSize: PAGE_DEFAULT,
    data: [],
    filtered: [],
    currentViewId: null,
    savedViews: [],
    favorites: new Set(),
    loading: false,
    pendingReload: false,
    partnerLookup: new Map(),
    taskIndex: new Map(),
    shadowSelection: new Set(),
    linkCounts: new Map()
  };

  let shadowTable = null;
  let actionbarInterceptorWired = false;
  let dataChangeWired = false;
  let navObserverWired = false;

  const toNumber = (val)=> Number(val||0) || 0;
  const toStamp = (val)=>{
    if(!val) return 0;
    if(typeof val === 'number') return val;
    const str = String(val);
    if(/^[0-9]+$/.test(str)) return Number(str);
    const date = Date.parse(str);
    if(Number.isNaN(date)) return 0;
    return date;
  };
  const isoDate = (val)=>{
    if(!val) return '';
    const d = new Date(toStamp(val));
    if(Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  };
  const fmtDate = (val)=>{
    if(!val) return '—';
    const d = new Date(toStamp(val));
    if(Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };
  const fmtMoney = (val)=>{
    const num = Number(val||0);
    if(!num) return '—';
    try{
      return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(num);
    }catch(_err){
      return `$${num.toLocaleString()}`;
    }
  };
  const normString = (val)=> String(val==null?'':val).trim();
  const lc = (val)=> normString(val).toLowerCase();

  function withRender(fn){
    return function(){
      RenderGuard.enter();
      try{ return fn.apply(this, arguments); }
      finally{ RenderGuard.exit(); }
    };
  }

  async function ensureSavedViewStore(){
    if(typeof indexedDB === 'undefined') return;
    let db = null;
    try{
      db = await getDB();
    }catch(err){
      if(console && console.warn) console.warn('[workbench] failed to open DB', err);
      return;
    }
    if(!window.__APP_DB__) window.__APP_DB__ = db;
    if(db && db.objectStoreNames && db.objectStoreNames.contains && !db.objectStoreNames.contains('savedViews')){
      if(console && console.warn) console.warn('[workbench] savedViews store unavailable; refresh may be required');
    }
  }

  function toastSafe(message){
    try{
      if(typeof window.toast === 'function'){ window.toast(message); return; }
    }catch(_err){}
    console.log('[workbench]', message);
  }

  async function savedViewStore(){
    await ensureSavedViewStore();
    return {
      async list(entity){
        if(typeof dbGetAll !== 'function') return [];
        const rows = await dbGetAll('savedViews').catch(()=>[]);
        return (rows||[]).filter(row => row && row.entity === entity);
      },
      async save(payload){
        if(typeof dbPut !== 'function') return;
        await dbPut('savedViews', payload);
      },
      async remove(id){
        if(typeof dbDelete === 'function'){
          await dbDelete('savedViews', id);
        }
      },
      async get(id){
        if(typeof dbGet === 'function') return dbGet('savedViews', id);
        return null;
      }
    };
  }

  function ensureShadowTable(){
    if(shadowTable && shadowTable.isConnected) return shadowTable;
    shadowTable = document.createElement('table');
    shadowTable.id = 'workbench-shadow-table';
    shadowTable.style.display = 'none';
    shadowTable.innerHTML = '<tbody></tbody>';
    document.body.appendChild(shadowTable);
    return shadowTable;
  }

  function syncShadowSelection(){
    ensureShadowTable();
    const tbody = shadowTable.tBodies[0];
    const active = state.shadowSelection;
    const present = new Set();
    if(tbody){
      Array.from(tbody.querySelectorAll('tr[data-id]')).forEach(row => {
        const id = row.getAttribute('data-id');
        if(active.has(id)){
          present.add(id);
        }else{
          row.remove();
        }
      });
    }
    active.forEach(id => {
      if(present.has(id)) return;
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', id);
      const td = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.setAttribute('data-id', id);
      cb.dataset.id = id;
      td.appendChild(cb);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    if(window.SelectionService && typeof window.SelectionService.syncChecks === 'function'){
      window.SelectionService.syncChecks();
    }
  }

  function clearShadowSelection(){
    state.shadowSelection.clear();
    if(shadowTable && shadowTable.tBodies[0]){
      shadowTable.tBodies[0].innerHTML = '';
    }
    if(window.SelectionService && typeof window.SelectionService.syncChecks === 'function'){
      window.SelectionService.syncChecks();
    }
  }

  function rememberSelection(ids){
    const svc = window.SelectionService;
    if(!svc || typeof svc.getIds !== 'function') return;
    const currentIds = svc.getIds();
    const type = svc.type === 'partners' ? 'partners' : 'contacts';
    const inPage = new Set(ids.map(String));
    currentIds.forEach(id => {
      if(!inPage.has(id)){
        state.shadowSelection.add(id);
      }
    });
    syncShadowSelection();
    const note = document.querySelector('#workbench-selection-note');
    if(note){
      const offscreen = Array.from(state.shadowSelection).length;
      if(offscreen){
        note.textContent = `${offscreen} selected across pages`;
        note.style.display = '';
      }else{
        note.textContent = '';
        note.style.display = 'none';
      }
    }
    svc.syncChecks && svc.syncChecks();
    svc.type = type;
  }

  function releaseSelectionNote(){
    const note = document.querySelector('#workbench-selection-note');
    if(note){
      note.textContent = '';
      note.style.display = 'none';
    }
  }

  function resetStateForEntity(entity){
    state.entity = entity;
    state.filters = FILTER_DEFAULTS[entity] ? FILTER_DEFAULTS[entity]() : {};
    state.sort = Object.assign({}, SORT_DEFAULTS[entity] || SORT_DEFAULTS.contacts);
    state.page = 1;
    state.pageSize = PAGE_DEFAULT;
    state.currentViewId = null;
  }

  function activeMain(){
    return document.querySelector('#view-workbench');
  }

  function ensureDom(){
    const nav = document.getElementById('main-nav');
    if(nav && !nav.querySelector('button[data-nav="workbench"]')){
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.setAttribute('data-nav','workbench');
      btn.textContent = 'Workbench';
      const ref = nav.querySelector('button[data-nav="reports"]');
      if(ref && ref.nextSibling){
        nav.insertBefore(btn, ref.nextSibling);
      }else{
        nav.appendChild(btn);
      }
    }

    if(!activeMain()){
      const container = document.querySelector('.container > main:last-of-type');
      const host = document.createElement('main');
      host.id = 'view-workbench';
      host.classList.add('hidden');
      host.innerHTML = `
        <section class="card" id="workbench-shell">
          <header class="row" id="workbench-header" style="align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap"></header>
          <div class="row" id="workbench-filters" style="gap:12px;flex-wrap:wrap;margin-bottom:12px"></div>
          <div class="muted" id="workbench-selection-note" style="display:none;margin-bottom:8px"></div>
          <div class="table-wrap" id="workbench-table-wrap"></div>
          <footer class="row" id="workbench-footer" style="align-items:center;gap:12px;margin-top:12px"></footer>
        </section>`;
      if(container && container.parentNode){
        container.parentNode.appendChild(host);
      }else{
        document.querySelector('.container').appendChild(host);
      }
    }

    dom.header = document.getElementById('workbench-header');
    dom.filters = document.getElementById('workbench-filters');
    dom.tableWrap = document.getElementById('workbench-table-wrap');
    dom.footer = document.getElementById('workbench-footer');
  }

  function entityOptionsHtml(){
    return ENTITY_ORDER.map(key => {
      const conf = ENTITY_CONFIG[key];
      if(!conf) return '';
      const selected = state.entity === key ? ' selected' : '';
      return `<option value="${key}"${selected}>${conf.icon||''} ${conf.label}</option>`;
    }).join('');
  }

  function savedViewOptions(){
    if(!Array.isArray(state.savedViews)) return '<option value="">Saved Views</option>';
    const favorites = new Set(state.savedViews.filter(v => v && v.favorite).map(v=>v.id));
    const sorted = state.savedViews.slice().sort((a,b)=>{
      const fa = favorites.has(a.id) ? 0 : 1;
      const fb = favorites.has(b.id) ? 0 : 1;
      if(fa !== fb) return fa - fb;
      return lc(a.name).localeCompare(lc(b.name));
    });
    const opts = ['<option value="">Saved Views</option>'];
    sorted.forEach(view => {
      if(!view) return;
      const prefix = favorites.has(view.id) ? '★ ' : '';
      const selected = state.currentViewId === view.id ? ' selected' : '';
      opts.push(`<option value="${view.id}"${selected}>${prefix}${view.name}</option>`);
    });
    return opts.join('');
  }

  function renderHeader(){
    if(!dom.header) return;
    const conf = ENTITY_CONFIG[state.entity];
    const entityLabel = conf ? conf.label : 'Entity';
    const viewSelectId = 'workbench-view-select';
    dom.header.innerHTML = `
      <label class="row" style="gap:6px;align-items:center">
        <span class="muted">Entity</span>
        <select id="workbench-entity" class="input">${entityOptionsHtml()}</select>
      </label>
      <div class="row" style="gap:6px;align-items:center">
        <select id="${viewSelectId}" class="input" style="min-width:160px">${savedViewOptions()}</select>
        <button class="btn" id="btn-workbench-save">Save View</button>
        <button class="btn" id="btn-workbench-update"${state.currentViewId?'' :' disabled'}>Update View</button>
        <button class="btn danger" id="btn-workbench-delete"${state.currentViewId?'' :' disabled'}>Delete View</button>
      </div>
      <span class="grow"></span>
      <div class="row" style="gap:6px;align-items:center">
        <label class="muted">Rows/Page
          <select id="workbench-page-size" class="input" style="min-width:80px">
            ${PAGE_SIZES.map(size => `<option value="${size}"${state.pageSize===size?' selected':''}>${size}</option>`).join('')}
          </select>
        </label>
        <button class="btn" id="btn-workbench-export">Export CSV</button>
      </div>`;
    wireHeader();
  }

  function renderFilters(){
    if(!dom.filters) return;
    const conf = ENTITY_CONFIG[state.entity];
    const filters = state.filters || {};
    const partners = Array.from(state.partnerLookup.values()).sort((a,b)=> lc(a.name).localeCompare(lc(b.name)));
    const partnerOptions = ['<option value="">Any Partner</option>'].concat(partners.map(p=>`<option value="${p.id}">${p.name||'Partner'}</option>`)).join('');
    const stageOptions = ['<option value="">Any Stage</option>','application','processing','underwriting','approved','cleared-to-close','funded','post-close','nurture','lost','denied']
      .map(stage => `<option value="${stage}"${(filters.stages||[]).includes(stage)?' selected':''}>${stage.replace(/-/g,' ')||'Any Stage'}</option>`)
      .join('');
    const tierOptions = ['<option value="">Any Tier</option>','Top','Solid Partner','Developing','Keep in Touch']
      .map(tier => `<option value="${tier}"${(filters.tiers||[]).includes(tier)?' selected':''}>${tier}</option>`)
      .join('');
    const statusOptions = ['<option value="">Any Status</option>','nurture','lost','dormant','paused','watching']
      .map(stat => `<option value="${stat}"${filters.status===stat?' selected':''}>${stat.replace(/(^|\s)\w/g, m=>m.toUpperCase())}</option>`)
      .join('');

    const blocks = [];
    blocks.push(`
      <label class="muted">Search
        <input type="search" id="workbench-filter-q" value="${filters.q||''}" placeholder="Search ${conf?conf.label:''}"/>
      </label>`);
    if(state.entity === 'contacts' || state.entity === 'clients'){
      blocks.push(`
        <label class="muted">Stage
          <select id="workbench-filter-stage" multiple size="1" data-role="multiselect">${stageOptions}</select>
        </label>`);
      blocks.push(`
        <label class="muted">Partner
          <select id="workbench-filter-partner">${partnerOptions}</select>
        </label>`);
      if(state.entity === 'contacts'){
        const linkedValue = (filters.hasLinkedContacts || 'any').toLowerCase();
        blocks.push(`
          <label class="muted">Linked Contacts
            <select id="workbench-filter-linked">
              <option value="any"${linkedValue==='any'?' selected':''}>Any</option>
              <option value="yes"${linkedValue==='yes'?' selected':''}>Yes</option>
              <option value="no"${linkedValue==='no'?' selected':''}>No</option>
            </select>
          </label>`);
      }
    }
    if(state.entity === 'longshots'){
      blocks.push(`
        <label class="muted">Status
          <select id="workbench-filter-status">${statusOptions}</select>
        </label>`);
    }
    if(state.entity === 'partners'){
      blocks.push(`
        <label class="muted">Tier
          <select id="workbench-filter-tier" multiple size="1" data-role="multiselect">${tierOptions}</select>
        </label>`);
    }

    blocks.push(`
      <label class="muted">Created From
        <input type="date" id="workbench-filter-created-from" value="${filters.createdFrom||''}"/>
      </label>`);
    blocks.push(`
      <label class="muted">Created To
        <input type="date" id="workbench-filter-created-to" value="${filters.createdTo||''}"/>
      </label>`);
    blocks.push(`
      <label class="muted">Updated From
        <input type="date" id="workbench-filter-updated-from" value="${filters.updatedFrom||''}"/>
      </label>`);
    blocks.push(`
      <label class="muted">Updated To
        <input type="date" id="workbench-filter-updated-to" value="${filters.updatedTo||''}"/>
      </label>`);
    blocks.push(`
      <label class="muted">Last Touch From
        <input type="date" id="workbench-filter-lasttouch-from" value="${filters.lastTouchFrom||''}"/>
      </label>`);
    blocks.push(`
      <label class="muted">Last Touch To
        <input type="date" id="workbench-filter-lasttouch-to" value="${filters.lastTouchTo||''}"/>
      </label>`);
    blocks.push(`
      <label class="muted">Last Touch Older Than
        <input type="number" min="0" step="1" id="workbench-filter-lasttouch-older" value="${filters.lastTouchOlderThan||''}" placeholder="days" style="width:90px"/>
      </label>`);
    blocks.push(`
      <label class="switch">
        <input type="checkbox" id="workbench-filter-email"${filters.hasEmail?' checked':''}/>
        <span>Has Email</span>
      </label>`);
    blocks.push(`
      <label class="switch">
        <input type="checkbox" id="workbench-filter-phone"${filters.hasPhone?' checked':''}/>
        <span>Has Phone</span>
      </label>`);
    if(state.entity !== 'partners'){
      blocks.push(`
        <label class="switch">
          <input type="checkbox" id="workbench-filter-overdue"${filters.overdueTasks?' checked':''}/>
          <span>Overdue Tasks</span>
        </label>`);
    }
    dom.filters.innerHTML = blocks.join('');
    wireFilters();
  }

  function renderFooter(){
    if(!dom.footer) return;
    const total = state.filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
    if(state.page > pageCount) state.page = pageCount;
    const start = total === 0 ? 0 : ((state.page-1)*state.pageSize)+1;
    const end = Math.min(total, state.page*state.pageSize);
    dom.footer.innerHTML = `
      <div class="muted">Showing ${start}-${end} of ${total}</div>
      <span class="grow"></span>
      <div class="row" style="gap:6px;align-items:center">
        <button class="btn" id="workbench-prev" ${state.page<=1?'disabled':''}>Prev</button>
        <span>Page ${state.page} / ${pageCount}</span>
        <button class="btn" id="workbench-next" ${state.page>=pageCount?'disabled':''}>Next</button>
      </div>`;
    const prev = dom.footer.querySelector('#workbench-prev');
    const next = dom.footer.querySelector('#workbench-next');
    if(prev) prev.addEventListener('click', evt => {
      evt.preventDefault();
      if(state.page>1){ state.page -= 1; renderTable(); }
    });
    if(next) next.addEventListener('click', evt => {
      evt.preventDefault();
      const max = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      if(state.page < max){ state.page += 1; renderTable(); }
    });
  }

  function tableColumns(){
    switch(state.entity){
      case 'partners':
        return [
          { key:'select', label:'', width:'28px' },
          { key:'name', label:'Name' },
          { key:'tier', label:'Tier' },
          { key:'email', label:'Email' },
          { key:'phone', label:'Phone' },
          { key:'lastTouch', label:'Last Touch', isDate:true },
          { key:'updatedAt', label:'Updated', isDate:true }
        ];
      case 'clients':
        return [
          { key:'select', label:'', width:'28px' },
          { key:'name', label:'Name' },
          { key:'stage', label:'Stage' },
          { key:'loanAmount', label:'Loan Amount', isMoney:true },
          { key:'partnerName', label:'Partner' },
          { key:'lastTouch', label:'Last Touch', isDate:true },
          { key:'updatedAt', label:'Updated', isDate:true }
        ];
      case 'longshots':
        return [
          { key:'select', label:'', width:'28px' },
          { key:'name', label:'Name' },
          { key:'status', label:'Status' },
          { key:'email', label:'Email' },
          { key:'phone', label:'Phone' },
          { key:'lastTouch', label:'Last Touch', isDate:true },
          { key:'notes', label:'Notes' }
        ];
      default:
        return [
          { key:'select', label:'', width:'28px' },
          { key:'name', label:'Name' },
          { key:'stage', label:'Stage' },
          { key:'links', label:'Links', width:'70px', isLinkCount:true },
          { key:'email', label:'Email' },
          { key:'phone', label:'Phone' },
          { key:'partnerName', label:'Partner' },
          { key:'lastTouch', label:'Last Touch', isDate:true },
          { key:'updatedAt', label:'Updated', isDate:true }
        ];
    }
  }

  function sortRows(rows){
    const sort = state.sort || { field:'updatedAt', dir:'desc' };
    const dir = sort.dir === 'asc' ? 1 : -1;
    const field = sort.field;
    const accessor = (row)=>{
      if(!row) return '';
      if(field === 'loanAmount') return toNumber(row.loanAmount);
      if(field === 'lastTouch' || field === 'updatedAt' || field === 'createdAt') return toStamp(row[field]);
      const value = row[field];
      if(typeof value === 'string') return value.toLowerCase();
      return value;
    };
    rows.sort((a,b)=>{
      const av = accessor(a);
      const bv = accessor(b);
      if(av == null && bv == null) return 0;
      if(av == null) return dir;
      if(bv == null) return -dir;
      if(av > bv) return dir;
      if(av < bv) return -dir;
      return 0;
    });
  }

  function renderTable(){
    if(!dom.tableWrap) return;
    const total = state.filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
    if(state.page > pageCount) state.page = pageCount;
    const start = (state.page-1)*state.pageSize;
    const rows = state.filtered.slice(start, start + state.pageSize);
    const columns = tableColumns();
    const header = columns.map(col => {
      if(col.key === 'select'){
        return `<th style="width:${col.width||'28px'}"><input type="checkbox" id="workbench-select-all"></th>`;
      }
      const active = state.sort.field === col.key;
      const arrow = active ? (state.sort.dir === 'asc' ? '▲' : '▼') : '↕';
      return `<th><button class="sort-btn" data-key="${col.key}" type="button">${col.label} <span class="sort-icon">${arrow}</span></button></th>`;
    }).join('');
    const body = rows.map(row => {
      const cells = columns.map(col => {
        if(col.key === 'select'){
          return `<td><input type="checkbox" data-id="${row.id}" data-entity="${state.entity}" /></td>`;
        }
        if(col.key === 'links'){
          const count = Number(row.linkCount || 0);
          const label = String(count);
          const aria = count === 1 ? 'Open linked contact (1)' : `Open linked contacts (${label})`;
          return `<td><button type="button" class="btn" data-contact-links="${row.id}" aria-label="${aria}">${label}</button></td>`;
        }
        let value = row[col.key];
        if(col.isDate) value = fmtDate(value);
        else if(col.isMoney) value = fmtMoney(value);
        else if(col.key === 'name') value = row.name || '—';
        else if(value == null || value === '') value = '—';
        return `<td>${value}</td>`;
      }).join('');
      const type = ENTITY_CONFIG[state.entity]?.type || 'contacts';
      return `<tr data-id="${row.id}" data-type="${type}">${cells}</tr>`;
    }).join('');
    dom.tableWrap.innerHTML = `<table class="table" id="workbench-table" data-entity="${state.entity}"><thead><tr>${header}</tr></thead><tbody>${body || '<tr><td colspan="'+columns.length+'" class="muted">No records found.</td></tr>'}</tbody></table>`;

    const selectAll = dom.tableWrap.querySelector('#workbench-select-all');
    if(selectAll){
      selectAll.addEventListener('change', evt => {
        const checked = !!evt.target.checked;
        dom.tableWrap.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => {
          cb.checked = checked;
          cb.dispatchEvent(new Event('change', { bubbles:true }));
        });
      });
    }

    dom.tableWrap.querySelectorAll('button.sort-btn').forEach(btn => {
      btn.addEventListener('click', evt => {
        evt.preventDefault();
        const key = btn.getAttribute('data-key');
        if(!key) return;
        if(state.sort.field === key){
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        }else{
          state.sort.field = key;
          state.sort.dir = 'asc';
        }
        sortRows(state.filtered);
        renderTable();
        renderFooter();
      });
    });

    dom.tableWrap.querySelectorAll('button[data-contact-links]').forEach(btn => {
      btn.addEventListener('click', evt => {
        evt.preventDefault();
        const id = btn.getAttribute('data-contact-links');
        if(!id || typeof window.renderContactModal !== 'function') return;
        window.renderContactModal(id, { focusLinked: true });
      });
    });

    rememberSelection(rows.map(row => row.id));
    renderFooter();
  }

  async function maybeYield(index){
    if(index % 500 === 0){
      await Promise.resolve();
    }
  }

  function recordPartner(partner){
    if(!partner || !partner.id) return;
    const key = String(partner.id);
    state.partnerLookup.set(key, {
      id: key,
      name: partner.name || partner.company || 'Partner'
    });
  }

  function normalizeContact(row){
    const partnerId = row.partnerId || row.buyerPartnerId || row.listingPartnerId || '';
    const partner = partnerId ? state.partnerLookup.get(String(partnerId)) : null;
    const nameParts = [row.first, row.last].map(normString).filter(Boolean);
    const name = nameParts.length ? nameParts.join(' ') : (row.name || row.company || row.email || row.phone || `Contact ${row.id}`);
    const stage = row.stage ? String(row.stage).replace(/_/g,'-').toLowerCase() : '';
    const status = row.status ? String(row.status).toLowerCase() : '';
    const createdAt = row.createdAt || row.created || row.addedAt || row.created_on || row.createdOn || null;
    const updatedAt = row.updatedAt || row.modifiedAt || row.updated_on || row.updatedOn || null;
    const lastTouch = row.lastContact || row.lastTouch || row.lastActivity || row.activityDate || row.updatedAt || row.updated_on || row.updatedOn || null;
    const loanAmount = row.loanAmount || row.amount || row.loan || 0;
    const email = normString(row.email || row.primaryEmail || row.workEmail);
    const phone = normString(row.phone || row.mobile || row.primaryPhone);
    const notes = normString(row.notes || row.summary || '');
    const normalized = {
      raw: row,
      id: String(row.id),
      entity: 'contacts',
      name,
      email,
      phone,
      stage,
      status,
      partnerId: partnerId ? String(partnerId) : '',
      partnerName: partner ? partner.name : '',
      createdAt,
      updatedAt,
      lastTouch,
      loanAmount,
      notes,
      hasEmail: !!email,
      hasPhone: !!phone,
      overdueTasks: false
    };
    const tasks = state.taskIndex.get(normalized.id) || [];
    const now = Date.now();
    normalized.overdueTasks = tasks.some(task => {
      const due = toStamp(task.due);
      if(!due) return false;
      if(due > now) return false;
      const status = String(task.status||'open').toLowerCase();
      return status !== 'done' && status !== 'complete' && status !== 'completed' && status !== 'closed';
    });
    return normalized;
  }

  function normalizePartner(row){
    const createdAt = row.createdAt || row.created || row.addedAt || null;
    const updatedAt = row.updatedAt || row.modifiedAt || null;
    const lastTouch = row.lastTouch || row.lastActivity || row.updatedAt || null;
    const name = row.name || row.company || row.email || row.phone || `Partner ${row.id}`;
    return {
      raw: row,
      id: String(row.id),
      entity: 'partners',
      name,
      email: normString(row.email || ''),
      phone: normString(row.phone || ''),
      tier: normString(row.tier || ''),
      createdAt,
      updatedAt,
      lastTouch,
      hasEmail: !!row.email,
      hasPhone: !!row.phone
    };
  }

  async function ensureLinkCounts(ids, force){
    const svc = window.relationships;
    if(!svc) return;
    const map = state.linkCounts;
    const unique = [];
    const seen = new Set();
    ids.forEach(raw => {
      const id = String(raw == null ? '' : raw).trim();
      if(!id) return;
      if(!force && map.has(id)) return;
      if(seen.has(id)) return;
      seen.add(id);
      unique.push(id);
    });
    if(!unique.length) return;
    if(typeof svc.listLinksForMany === 'function'){
      const batchSize = 200;
      for(let i=0;i<unique.length;i+=batchSize){
        const slice = unique.slice(i, i+batchSize);
        let result = null;
        try{
          result = await svc.listLinksForMany(slice);
        }catch(err){
          console.warn('workbench listLinksForMany failed', err);
          result = null;
        }
        slice.forEach(id => {
          let neighbors = [];
          if(result && typeof result.get === 'function'){
            neighbors = result.get(String(id));
          }else if(result && result[id]){
            neighbors = result[id];
          }
          const count = Array.isArray(neighbors) ? neighbors.length : 0;
          map.set(String(id), count);
        });
        if(unique.length > 200){ await Promise.resolve(); }
      }
    }else if(typeof svc.countLinks === 'function'){
      const batchSize = 50;
      for(let i=0;i<unique.length;i+=batchSize){
        const slice = unique.slice(i, i+batchSize);
        const counts = await Promise.all(slice.map(id => svc.countLinks(id).catch(()=>0)));
        slice.forEach((id, idx) => {
          map.set(String(id), Number(counts[idx]) || 0);
        });
        if(unique.length > 200){ await Promise.resolve(); }
      }
    }
  }

  async function loadData(){
    if(state.loading){ state.pendingReload = true; return; }
    state.loading = true;
    await openDB();
    const [contacts, partners, tasks] = await Promise.all([
      dbGetAll('contacts').catch(()=>[]),
      dbGetAll('partners').catch(()=>[]),
      dbGetAll('tasks').catch(()=>[])
    ]);
    state.partnerLookup.clear();
    (partners||[]).forEach(recordPartner);
    state.taskIndex.clear();
    (tasks||[]).forEach(task => {
      if(!task || !task.contactId) return;
      const key = String(task.contactId);
      if(!state.taskIndex.has(key)) state.taskIndex.set(key, []);
      state.taskIndex.get(key).push(task);
    });
    let rows = [];
    switch(state.entity){
      case 'partners':
        rows = (partners||[]).map(normalizePartner).filter(Boolean);
        break;
      default:
        rows = (contacts||[]).map(normalizeContact).filter(Boolean);
        if(state.entity === 'clients'){
          rows = rows.filter(row => ['funded','post-close','cleared-to-close','approved'].includes(row.stage));
        }else if(state.entity === 'longshots'){
          rows = rows.filter(row => ['nurture','lost'].includes(row.stage) || ['nurture','lost','paused','dormant','watching'].includes(row.status));
        }
        break;
    }
    state.data = rows;
    await applyFilters();
    state.loading = false;
    if(state.pendingReload){
      state.pendingReload = false;
      loadData();
    }
  }

  async function applyFilters(){
    const filters = state.filters || {};
    const rows = state.data.slice();
    const q = lc(filters.q || '');
    const stageSet = new Set((filters.stages||[]).map(s=>s.toLowerCase()));
    const tierSet = new Set((filters.tiers||[]).map(s=>lc(s)));
    const partnerFilter = filters.partnerId ? String(filters.partnerId) : '';
    const statusFilter = lc(filters.status || '');
    const hasEmail = !!filters.hasEmail;
    const hasPhone = !!filters.hasPhone;
    const overdueTasks = !!filters.overdueTasks;
    const createdFrom = filters.createdFrom ? toStamp(filters.createdFrom) : 0;
    const createdTo = filters.createdTo ? toStamp(filters.createdTo) : 0;
    const updatedFrom = filters.updatedFrom ? toStamp(filters.updatedFrom) : 0;
    const updatedTo = filters.updatedTo ? toStamp(filters.updatedTo) : 0;
    const lastTouchFrom = filters.lastTouchFrom ? toStamp(filters.lastTouchFrom) : 0;
    const lastTouchTo = filters.lastTouchTo ? toStamp(filters.lastTouchTo) : 0;
    const olderThan = filters.lastTouchOlderThan ? Number(filters.lastTouchOlderThan) : 0;
    const olderCutoff = olderThan > 0 ? Date.now() - olderThan*86400000 : 0;
    const linkedFilter = state.entity === 'contacts' ? (filters.hasLinkedContacts || 'any').toLowerCase() : 'any';

    if(state.entity === 'contacts'){
      const ids = rows.map(row => row && row.id).filter(Boolean);
      await ensureLinkCounts(ids, false);
    }

    const filtered = [];
    for(let i=0;i<rows.length;i++){
      const row = rows[i];
      await maybeYield(i);
      if(!row) continue;
      if(state.entity === 'contacts'){
        const idKey = String(row.id);
        const linkCount = state.linkCounts.has(idKey) ? state.linkCounts.get(idKey) : 0;
        row.linkCount = linkCount;
        if(linkedFilter === 'yes' && !(linkCount > 0)) continue;
        if(linkedFilter === 'no' && linkCount > 0) continue;
      }
      if(q){
        const hay = [row.name, row.email, row.phone, row.notes, row.partnerName].map(lc).join(' ');
        if(!hay.includes(q)) continue;
      }
      if(stageSet.size && row.stage){
        if(!stageSet.has(row.stage.toLowerCase())) continue;
      }else if(stageSet.size){
        continue;
      }
      if(partnerFilter && String(row.partnerId||'') !== partnerFilter) continue;
      if(statusFilter){
        const statusVal = lc(row.status || row.stage);
        if(statusVal !== statusFilter) continue;
      }
      if(tierSet.size && row.tier){
        if(!tierSet.has(lc(row.tier))) continue;
      }else if(tierSet.size && state.entity === 'partners'){
        continue;
      }
      if(hasEmail && !row.hasEmail) continue;
      if(hasPhone && !row.hasPhone) continue;
      const created = toStamp(row.createdAt);
      if(createdFrom && (!created || created < createdFrom)) continue;
      if(createdTo && (!created || created > createdTo)) continue;
      const updated = toStamp(row.updatedAt);
      if(updatedFrom && (!updated || updated < updatedFrom)) continue;
      if(updatedTo && (!updated || updated > updatedTo)) continue;
      const touch = toStamp(row.lastTouch);
      if(lastTouchFrom && (!touch || touch < lastTouchFrom)) continue;
      if(lastTouchTo && (!touch || touch > lastTouchTo)) continue;
      if(olderCutoff && (!touch || touch > olderCutoff)) continue;
      if(overdueTasks && !row.overdueTasks) continue;
      filtered.push(row);
    }
    state.filtered = filtered;
    sortRows(state.filtered);
    state.page = 1;
    renderTable();
  }

  async function refreshSavedViews(){
    const store = await savedViewStore();
    const list = await store.list(state.entity);
    state.savedViews = list.map(view => ({
      id: String(view.id),
      entity: view.entity,
      name: view.name,
      query: view.query,
      sort: view.sort,
      columns: view.columns,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
      favorite: !!view.favorite
    }));
    renderHeader();
  }

  function viewPayload(name){
    const now = Date.now();
    return {
      id: String(name+':' + now + ':' + Math.random().toString(36).slice(2)),
      entity: state.entity,
      name,
      query: JSON.parse(JSON.stringify(state.filters || {})),
      sort: Object.assign({}, state.sort),
      columns: tableColumns().map(col => col.key),
      createdAt: now,
      updatedAt: now
    };
  }

  async function saveView(){
    const name = window.prompt('Name this view', 'New view');
    if(!name) return;
    const payload = viewPayload(name);
    const store = await savedViewStore();
    await store.save(payload);
    state.currentViewId = payload.id;
    await refreshSavedViews();
    toastSafe('Saved view.');
    dispatchDataChanged({ source:'workbench:save-view', entity: state.entity });
  }

  async function updateView(){
    if(!state.currentViewId){ toastSafe('Select a view to update.'); return; }
    const store = await savedViewStore();
    const existing = await store.get(state.currentViewId);
    if(!existing){ toastSafe('View missing.'); return; }
    const next = Object.assign({}, existing, {
      query: JSON.parse(JSON.stringify(state.filters || {})),
      sort: Object.assign({}, state.sort),
      columns: tableColumns().map(col => col.key),
      updatedAt: Date.now()
    });
    await store.save(next);
    await refreshSavedViews();
    toastSafe('View updated.');
    dispatchDataChanged({ source:'workbench:update-view', entity: state.entity });
  }

  async function deleteView(){
    if(!state.currentViewId){ toastSafe('Select a view to delete.'); return; }
    let confirmed = true;
    if(typeof window.confirmAction === 'function'){
      confirmed = await window.confirmAction({
        title:'Delete saved view',
        message:'Delete this saved view?',
        confirmLabel:'Delete',
        cancelLabel:'Keep',
        destructive:true
      });
    }else if(typeof window.confirm === 'function'){
      confirmed = window.confirm('Delete this saved view?');
    }
    if(!confirmed) return;
    const store = await savedViewStore();
    await store.remove(state.currentViewId);
    state.currentViewId = null;
    await refreshSavedViews();
    toastSafe('View deleted.');
    dispatchDataChanged({ source:'workbench:delete-view', entity: state.entity });
  }

  function applyView(viewId){
    const view = (state.savedViews||[]).find(v => v && v.id === viewId);
    if(!view){ return; }
    state.currentViewId = viewId;
    state.filters = Object.assign(FILTER_DEFAULTS[state.entity] ? FILTER_DEFAULTS[state.entity]() : {}, view.query || {});
    state.sort = Object.assign({}, view.sort || SORT_DEFAULTS[state.entity] || SORT_DEFAULTS.contacts);
    renderHeader();
    renderFilters();
    applyFilters();
  }

  function gatherFilteredRowsForExport(){
    const svc = window.SelectionService;
    const selectedIds = svc && typeof svc.getIds === 'function' ? svc.getIds() : [];
    if(selectedIds && selectedIds.length){
      const set = new Set(selectedIds.map(String));
      return state.filtered.filter(row => set.has(String(row.id)));
    }
    return state.filtered.slice();
  }

  function encodeCsv(rows){
    const cols = tableColumns().filter(col => col.key !== 'select');
    const header = ['id'].concat(cols.map(col => col.label));
    const lines = [header];
    rows.forEach(row => {
      const line = [row.id];
      cols.forEach(col => {
        let value = row[col.key];
        if(col.isDate) value = fmtDate(value);
        else if(col.isMoney) value = fmtMoney(value);
        else if(value == null) value = '';
        line.push(String(value));
      });
      lines.push(line);
    });
    return lines.map(cols => cols.map(val => {
      const str = String(val==null?'':val);
      if(/[",\n]/.test(str)){
        return '"' + str.replace(/"/g,'""') + '"';
      }
      return str;
    }).join(',')).join('\n');
  }

  function download(filename, content){
    const blob = new Blob(['\ufeff'+content], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCsv(){
    const rows = gatherFilteredRowsForExport();
    if(!rows.length){ toastSafe('No rows to export.'); return; }
    const csv = encodeCsv(rows);
    const conf = ENTITY_CONFIG[state.entity];
    const label = conf ? conf.label.replace(/\s+/g,'_').toLowerCase() : 'workbench';
    download(`workbench_${label}_${new Date().toISOString().slice(0,10)}.csv`, csv);
    toastSafe(`Exported ${rows.length} row${rows.length===1?'':'s'}.`);
  }

  function wireHeader(){
    const entity = document.getElementById('workbench-entity');
    if(entity && !entity.__workbench){
      entity.__workbench = true;
      entity.addEventListener('change', evt => {
        const value = evt.target.value;
        if(!ENTITY_CONFIG[value]) return;
        resetStateForEntity(value);
        renderHeader();
        renderFilters();
        refreshSavedViews();
        loadData();
      });
    }
    const viewSelect = document.getElementById('workbench-view-select');
    if(viewSelect && !viewSelect.__workbench){
      viewSelect.__workbench = true;
      viewSelect.addEventListener('change', evt => {
        const value = evt.target.value;
        if(!value){ state.currentViewId = null; renderHeader(); return; }
        applyView(value);
      });
    }
    const saveBtn = document.getElementById('btn-workbench-save');
    if(saveBtn && !saveBtn.__workbench){ saveBtn.__workbench = true; saveBtn.addEventListener('click', evt => { evt.preventDefault(); saveView(); }); }
    const updateBtn = document.getElementById('btn-workbench-update');
    if(updateBtn && !updateBtn.__workbench){ updateBtn.__workbench = true; updateBtn.addEventListener('click', evt => { evt.preventDefault(); updateView(); }); }
    const deleteBtn = document.getElementById('btn-workbench-delete');
    if(deleteBtn && !deleteBtn.__workbench){ deleteBtn.__workbench = true; deleteBtn.addEventListener('click', evt => { evt.preventDefault(); deleteView(); }); }
    const exportBtn = document.getElementById('btn-workbench-export');
    if(exportBtn && !exportBtn.__workbench){ exportBtn.__workbench = true; exportBtn.addEventListener('click', evt => { evt.preventDefault(); exportCsv(); }); }
    const pageSize = document.getElementById('workbench-page-size');
    if(pageSize && !pageSize.__workbench){
      pageSize.__workbench = true;
      pageSize.addEventListener('change', evt => {
        const value = Number(evt.target.value)||PAGE_DEFAULT;
        state.pageSize = value;
        state.page = 1;
        renderTable();
      });
    }
  }

  function parseMultiSelect(select){
    if(!select) return [];
    if(select.multiple){
      return Array.from(select.selectedOptions || []).map(opt => opt.value).filter(Boolean);
    }
    const value = select.value;
    if(!value) return [];
    return [value];
  }

  function wireFilters(){
    const qInput = document.getElementById('workbench-filter-q');
    if(qInput && !qInput.__workbench){
      qInput.__workbench = true;
      qInput.addEventListener('input', evt => {
        state.filters.q = evt.target.value;
        applyFilters();
      });
    }
    const stageSelect = document.getElementById('workbench-filter-stage');
    if(stageSelect && !stageSelect.__workbench){
      stageSelect.__workbench = true;
      stageSelect.addEventListener('change', evt => {
        state.filters.stages = parseMultiSelect(stageSelect);
        applyFilters();
      });
    }
    const partnerSelect = document.getElementById('workbench-filter-partner');
    if(partnerSelect && !partnerSelect.__workbench){
      partnerSelect.__workbench = true;
      partnerSelect.addEventListener('change', evt => {
        state.filters.partnerId = evt.target.value;
        applyFilters();
      });
    }
    const linkedSelect = document.getElementById('workbench-filter-linked');
    if(linkedSelect && !linkedSelect.__workbench){
      linkedSelect.__workbench = true;
      linkedSelect.addEventListener('change', evt => {
        const value = (evt.target.value || 'any').toLowerCase();
        state.filters.hasLinkedContacts = value || 'any';
        applyFilters();
      });
    }
    const tierSelect = document.getElementById('workbench-filter-tier');
    if(tierSelect && !tierSelect.__workbench){
      tierSelect.__workbench = true;
      tierSelect.addEventListener('change', () => {
        state.filters.tiers = parseMultiSelect(tierSelect);
        applyFilters();
      });
    }
    const statusSelect = document.getElementById('workbench-filter-status');
    if(statusSelect && !statusSelect.__workbench){
      statusSelect.__workbench = true;
      statusSelect.addEventListener('change', evt => {
        state.filters.status = evt.target.value;
        applyFilters();
      });
    }
    const createdFrom = document.getElementById('workbench-filter-created-from');
    if(createdFrom && !createdFrom.__workbench){ createdFrom.__workbench = true; createdFrom.addEventListener('change', evt => { state.filters.createdFrom = evt.target.value; applyFilters(); }); }
    const createdTo = document.getElementById('workbench-filter-created-to');
    if(createdTo && !createdTo.__workbench){ createdTo.__workbench = true; createdTo.addEventListener('change', evt => { state.filters.createdTo = evt.target.value; applyFilters(); }); }
    const updatedFrom = document.getElementById('workbench-filter-updated-from');
    if(updatedFrom && !updatedFrom.__workbench){ updatedFrom.__workbench = true; updatedFrom.addEventListener('change', evt => { state.filters.updatedFrom = evt.target.value; applyFilters(); }); }
    const updatedTo = document.getElementById('workbench-filter-updated-to');
    if(updatedTo && !updatedTo.__workbench){ updatedTo.__workbench = true; updatedTo.addEventListener('change', evt => { state.filters.updatedTo = evt.target.value; applyFilters(); }); }
    const lastFrom = document.getElementById('workbench-filter-lasttouch-from');
    if(lastFrom && !lastFrom.__workbench){ lastFrom.__workbench = true; lastFrom.addEventListener('change', evt => { state.filters.lastTouchFrom = evt.target.value; applyFilters(); }); }
    const lastTo = document.getElementById('workbench-filter-lasttouch-to');
    if(lastTo && !lastTo.__workbench){ lastTo.__workbench = true; lastTo.addEventListener('change', evt => { state.filters.lastTouchTo = evt.target.value; applyFilters(); }); }
    const older = document.getElementById('workbench-filter-lasttouch-older');
    if(older && !older.__workbench){ older.__workbench = true; older.addEventListener('input', evt => { state.filters.lastTouchOlderThan = evt.target.value; applyFilters(); }); }
    const email = document.getElementById('workbench-filter-email');
    if(email && !email.__workbench){ email.__workbench = true; email.addEventListener('change', evt => { state.filters.hasEmail = evt.target.checked; applyFilters(); }); }
    const phone = document.getElementById('workbench-filter-phone');
    if(phone && !phone.__workbench){ phone.__workbench = true; phone.addEventListener('change', evt => { state.filters.hasPhone = evt.target.checked; applyFilters(); }); }
    const overdue = document.getElementById('workbench-filter-overdue');
    if(overdue && !overdue.__workbench){ overdue.__workbench = true; overdue.addEventListener('change', evt => { state.filters.overdueTasks = evt.target.checked; applyFilters(); }); }
  }

  function dispatchDataChanged(detail){
    const payload = detail || { source:'workbench' };
    const dispatch = function(){
      if(typeof window.dispatchAppDataChanged === 'function'){
        window.dispatchAppDataChanged(payload);
      }else{
        document.dispatchEvent(new CustomEvent('app:data:changed', { detail: payload }));
      }
    };
    if(RenderGuard.isRendering()){
      queueMicro(dispatch);
    }else{
      dispatch();
    }
  }

  function wireDataChange(){
    if(dataChangeWired) return;
    dataChangeWired = true;
    document.addEventListener('app:data:changed', evt => {
      const detail = evt && evt.detail || {};
      const topic = String(detail.topic||'');
      if(topic.startsWith('relationships:')){
        if(detail.fromId) state.linkCounts.delete(String(detail.fromId));
        if(detail.toId) state.linkCounts.delete(String(detail.toId));
      }
      if(detail && detail.contactId){
        state.linkCounts.delete(String(detail.contactId));
      }
      const view = document.querySelector('#main-nav button[data-nav="workbench"]').classList.contains('active');
      if(!view) return;
      loadData();
    });
  }

  function wireSelectionReset(){
    if(navObserverWired) return;
    const svc = window.SelectionService;
    if(!svc || typeof svc.onChange !== 'function'){
      if(typeof console !== 'undefined' && console.warn){
        console.warn('[workbench] SelectionService.onChange unavailable');
      }
      return;
    }
    navObserverWired = true;
    svc.onChange(() => {
      if(typeof svc.count === 'function' && svc.count() === 0){
        clearShadowSelection();
        releaseSelectionNote();
      }
    });
  }

  function wireActionbar(){
    if(actionbarInterceptorWired) return;
    const bar = document.getElementById('actionbar');
    if(!bar) return;
    actionbarInterceptorWired = true;
    bar.addEventListener('mousedown', async evt => {
      const btn = evt.target.closest('[data-act]');
      if(!btn) return;
      const svc = window.SelectionService;
      if(!svc || typeof svc.count !== 'function') return;
      if(svc.count()) return;
      const viewMain = activeMain();
      if(!viewMain || viewMain.classList.contains('hidden')) return;
      const targetRows = state.filtered.slice();
      if(!targetRows.length) return;
      const label = btn.textContent ? btn.textContent.trim() : btn.dataset.act;
      let confirmed = true;
      const message = `${label} for all ${targetRows.length} filtered row${targetRows.length===1?'':'s'}?`;
      if(typeof window.confirmAction === 'function'){
        confirmed = await window.confirmAction({
          title: label || 'Apply action',
          message,
          confirmLabel: label || 'Apply',
          cancelLabel: 'Cancel',
          destructive: true
        });
      }else if(typeof window.confirm === 'function'){
        confirmed = window.confirm(message);
      }
      if(!confirmed) return;
      const type = ENTITY_CONFIG[state.entity]?.type || 'contacts';
      const ids = targetRows.map(row => String(row.id));
      ids.forEach(id => state.shadowSelection.add(id));
      syncShadowSelection();
      ids.forEach(id => svc.add(id, type));
    });
  }

  function init(){
    ensureDom();
    wireHeader();
    wireFilters();
    renderHeader();
    renderFilters();
    renderTable();
    refreshSavedViews();
    loadData();
    wireDataChange();
    wireSelectionReset();
    wireActionbar();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
