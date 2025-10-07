// patch_20250926_ctc_actionbar.js — stage canonicalization + hardened action bar
import { setDisabled } from './patch_2025-10-02_baseline_ux_cleanup.js';
import { openContactsMergeByIds } from '/js/contacts_merge_orchestrator.js';

(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.patch_20250926_ctc_actionbar) return;
  window.__INIT_FLAGS__.patch_20250926_ctc_actionbar = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_20250926_ctc_actionbar.js')){
    window.__PATCHES_LOADED__.push('/js/patch_20250926_ctc_actionbar.js');
  }

  const STAGE_SYNONYMS = {
    'cleared-to-close':'cleared-to-close',
    'clear-to-close':'cleared-to-close',
    'cleared to close':'cleared-to-close',
    'ctc':'cleared-to-close',
    'pre-approved':'preapproved',
    'pre approved':'preapproved',
    'post close':'post-close',
    'postclose':'post-close',
    'closed':'post-close',
    'client':'post-close',
    'won':'funded',
    'declined':'denied',
    'denied':'denied',
    'lost':'lost'
  };
  const KNOWN_STAGE_LOOKUP = {
    'application':true,
    'preapproved':true,
    'processing':true,
    'underwriting':true,
    'approved':true,
    'cleared-to-close':true,
    'funded':true,
    'post-close':true,
    'nurture':true,
    'lost':true,
    'denied':true,
    'long-shot':true
  };
  const STAGE_LABELS = {
    application:'Application',
    processing:'Processing',
    underwriting:'Underwriting',
    approved:'Approved',
    'cleared-to-close':'Cleared to Close',
    funded:'Funded',
    'post-close':'Post-Close',
    nurture:'Nurture',
    lost:'Lost',
    denied:'Denied',
    'long-shot':'Long Shot'
  };
  const currencyFmt = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb)=>setTimeout(cb,16);
  const warnedMissing = new Set();

  function canonicalizeStage(value){
    const raw = String(value==null?'':value).trim().toLowerCase();
    if(!raw) return 'application';
    const normalized = raw.replace(/[\s_]+/g,'-');
    if(Object.prototype.hasOwnProperty.call(STAGE_SYNONYMS, normalized)) return STAGE_SYNONYMS[normalized];
    if(Object.prototype.hasOwnProperty.call(KNOWN_STAGE_LOOKUP, normalized)) return normalized;
    return 'application';
  }
  window.canonicalizeStage = canonicalizeStage;

  function canonicalizeContact(record){
    if(!record || typeof record!=='object') return record;
    const next = canonicalizeStage(record.stage);
    if(next === record.stage) return record;
    return Object.assign({}, record, { stage: next });
  }

  function patchStageFunction(name, stageIndex){
    const original = window[name];
    if(typeof original !== 'function') return;
    window[name] = function(){
      const args = Array.from(arguments);
      if(stageIndex!=null && args.length>stageIndex){
        args[stageIndex] = canonicalizeStage(args[stageIndex]);
      }
      if(name==='upsertContact' && args[0] && typeof args[0]==='object'){
        args[0] = canonicalizeContact(args[0]);
      }
      const result = original.apply(this, args);
      if(result && typeof result.then === 'function'){
        return result.then(res => {
          if(typeof res === 'string') return canonicalizeStage(res);
          if(res && typeof res === 'object' && 'stage' in res){
            res.stage = canonicalizeStage(res.stage);
          }
          return res;
        });
      }
      if(typeof result === 'string') return canonicalizeStage(result);
      if(result && typeof result === 'object' && 'stage' in result){
        result.stage = canonicalizeStage(result.stage);
      }
      return result;
    };
  }

  patchStageFunction('setContactStage', 1);
  patchStageFunction('moveCardToStage', 1);
  patchStageFunction('upsertContact', 0);

  function patchDbHelpers(){
    if(typeof window.dbPut === 'function'){
      const original = window.dbPut;
      window.dbPut = function(store, obj){
        const next = (store === 'contacts' && obj) ? canonicalizeContact(obj) : obj;
        return original.call(this, store, next);
      };
    }
    if(typeof window.dbBulkPut === 'function'){
      const original = window.dbBulkPut;
      window.dbBulkPut = function(store, list){
        const nextList = (store === 'contacts' && Array.isArray(list))
          ? list.map(item => canonicalizeContact(item))
          : list;
        return original.call(this, store, nextList);
      };
    }
    if(typeof window.dbRestoreAll === 'function'){
      const original = window.dbRestoreAll;
      window.dbRestoreAll = async function(snapshot, mode){
        await original.apply(this, arguments);
        try{
          await normalizeStagesOnBoot(true);
        }catch(_err){}
      };
    }
  }
  patchDbHelpers();

  (function(){
    const arrProto = Array.prototype;
    if(!arrProto.__stageSynonymPatched){
      const originalIncludes = arrProto.includes;
      Object.defineProperty(arrProto, 'includes', {
        value: function(searchElement){
          if(typeof searchElement === 'string'){
            const norm = canonicalizeStage(searchElement);
            if(norm === 'cleared-to-close'){
              const idx = arguments.length>1 ? arguments[1] : undefined;
              if(originalIncludes.call(this, 'cleared-to-close', idx)) return true;
              if(originalIncludes.call(this, 'ctc', idx)) return true;
              if(originalIncludes.call(this, 'clear-to-close', idx)) return true;
            }
          }
          return originalIncludes.apply(this, arguments);
        },
        configurable:true,
        writable:true
      });
      Object.defineProperty(arrProto, '__stageSynonymPatched', { value:true });
    }
    const setProto = Set.prototype;
    if(!setProto.__stageSynonymPatched){
      const originalHas = setProto.has;
      Object.defineProperty(setProto, 'has', {
        value: function(value){
          if(typeof value === 'string'){
            const norm = canonicalizeStage(value);
            if(norm === 'cleared-to-close'){
              if(originalHas.call(this, 'cleared-to-close')) return true;
              if(originalHas.call(this, 'ctc')) return true;
              if(originalHas.call(this, 'clear-to-close')) return true;
            }
          }
          return originalHas.call(this, value);
        },
        configurable:true,
        writable:true
      });
      Object.defineProperty(setProto, '__stageSynonymPatched', { value:true });
    }
  })();

  function toast(msg){
    try{
      if(typeof window.toast === 'function'){ window.toast(msg); return; }
    }catch(_err){}
    console.log('[toast]', msg);
  }

  function warnMissing(name){
    if(warnedMissing.has(name)) return;
    warnedMissing.add(name);
    console.warn('[actionbar] missing handler:', name);
  }

  function resolveRowId(node){
    if(!node) return null;
    const attrs = ['data-id','data-contact-id','data-partner-id','data-row-id'];
    for(const attr of attrs){
      const direct = node.getAttribute && node.getAttribute(attr);
      if(direct) return String(direct);
    }
    if(node.dataset){
      if(node.dataset.id) return String(node.dataset.id);
      if(node.dataset.contactId) return String(node.dataset.contactId);
      if(node.dataset.partnerId) return String(node.dataset.partnerId);
      if(node.dataset.rowId) return String(node.dataset.rowId);
    }
    const row = node.closest ? node.closest('[data-id],[data-contact-id],[data-partner-id],[data-row-id],tr') : null;
    if(row){
      for(const attr of attrs){
        const val = row.getAttribute(attr);
        if(val) return String(val);
      }
      if(row.dataset){
        if(row.dataset.id) return String(row.dataset.id);
        if(row.dataset.contactId) return String(row.dataset.contactId);
        if(row.dataset.partnerId) return String(row.dataset.partnerId);
        if(row.dataset.rowId) return String(row.dataset.rowId);
      }
    }
    if(node.closest && window.__NAME_ID_MAP__){
      const cell = node.closest('[data-name]');
      if(cell && cell.dataset && cell.dataset.name){
        const lookup = window.__NAME_ID_MAP__[cell.dataset.name];
        if(lookup) return String(lookup);
      }
    }
    return null;
  }

  function detectRowType(node){
    const table = node.closest ? node.closest('table') : null;
    if(!table) return 'contacts';
    const hints = [
      table.getAttribute('data-entity'),
      table.getAttribute('data-type'),
      table.getAttribute('aria-label'),
      table.dataset ? (table.dataset.scope || table.dataset.type) : null
    ].filter(Boolean).join(' ').toLowerCase();
    if(hints.includes('partner')) return 'partners';
    return 'contacts';
  }

  let SelectionService = window.SelectionService;

  function isSelectionService(obj){
    if(!obj || typeof obj !== 'object') return false;
    return typeof obj.add === 'function'
      && typeof obj.remove === 'function'
      && typeof obj.clear === 'function'
      && typeof obj.count === 'function'
      && typeof obj.getIds === 'function';
  }

  function ensureSelectionService(){
    if(isSelectionService(SelectionService)) return true;
    if(isSelectionService(window.SelectionService)){
      SelectionService = window.SelectionService;
      return true;
    }
    return false;
  }

  let syncScheduled = false;
  function scheduleSyncChecks(){
    if(!ensureSelectionService()) return;
    const svc = SelectionService;
    if(!svc || typeof svc.syncChecks !== 'function') return;
    if(syncScheduled) return;
    syncScheduled = true;
    raf(()=>{
      syncScheduled = false;
      try{ svc.syncChecks(); }
      catch(err){ console.warn('selection sync', err); }
    });
  }

  let selectionVersion = 0;
  let selectionTickScheduled = false;
  let selectionLockWait = false;
  const pendingActions = new Map();
  const actionState = { busy:false, current:null };

  function currentView(){
    if(typeof window.__ROUTE__ === 'string' && window.__ROUTE__){
      return window.__ROUTE__;
    }
    try{
      const activeMain = document.querySelector('main[id^="view-"]:not(.hidden)');
      if(activeMain && typeof activeMain.id === 'string'){
        return activeMain.id.replace(/^view-/, '') || 'dashboard';
      }
    }catch(_err){}
    try{
      const activeNav = document.querySelector('#main-nav button[data-nav].active');
      if(activeNav){
        const navTarget = activeNav.getAttribute('data-nav');
        if(navTarget) return navTarget;
      }
    }catch(_err){}
    try{
      const hash = typeof window.location?.hash === 'string' ? window.location.hash : (typeof location?.hash === 'string' ? location.hash : '');
      if(hash){
        const cleaned = hash.replace(/^#/, '').replace(/^\//, '');
        if(cleaned){
          const segment = cleaned.split('/')[0];
          if(segment) return segment;
        }
      }
    }catch(_err){}
    return 'dashboard';
  }

  function queueSelectionTick(){
    if(selectionTickScheduled) return;
    selectionTickScheduled = true;
    raf(()=>{
      selectionTickScheduled = false;
      if(window.__RENDER_LOCK__){
        if(selectionLockWait) return;
        selectionLockWait = true;
        raf(()=>{
          selectionLockWait = false;
          queueSelectionTick();
        });
        return;
      }
      selectionVersion++;
      scheduleDetailHydration();
    });
  }
  let lastHydratedVersion = 0;
  let hydrationPromise = null;
  let detailStore = { contacts: [], partners: [] };

  function actionbar(){ return document.getElementById('actionbar'); }

  function wireActionbarRules(){
    if(window.__WIRED_ACTIONBAR_RULES__) return window.__APPLY_ACTIONBAR_RULES__;
    window.__WIRED_ACTIONBAR_RULES__ = true;

    function getSelectedCount(){
      try{
        if(window.Selection && typeof window.Selection.getSelectedIds === 'function'){
          const ids = window.Selection.getSelectedIds();
          if(Array.isArray(ids)) return ids.length;
          if(ids && typeof ids.size === 'number') return ids.size;
        }
        if(window.Selection && typeof window.Selection.size === 'function'){
          const size = window.Selection.size();
          if(typeof size === 'number' && !Number.isNaN(size)) return size;
        }
        if(window.SelectionService && typeof window.SelectionService.getIds === 'function'){
          const ids = window.SelectionService.getIds();
          if(Array.isArray(ids)) return ids.length;
          if(ids && typeof ids.size === 'number') return ids.size;
          if(ids && typeof ids.length === 'number') return ids.length;
        }
        if(window.SelectionService && typeof window.SelectionService.count === 'function'){
          const count = window.SelectionService.count();
          if(typeof count === 'number' && !Number.isNaN(count)) return count;
        }
      }catch(_err){}
      try{
        const domSelected = document.querySelectorAll('[data-selectable].selected, [data-row].is-selected, tr.selected, .row.selected, [data-selected="true"]');
        return domSelected.length;
      }catch(_err){}
      return 0;
    }

    function findButtons(){
      const editBtn = document.querySelector('#actionbar [data-act="edit"], [data-act="edit"], [data-action="edit"], .action-edit, #btnEdit, #btn-edit');
      const mergeBtn = document.querySelector('#actionbar [data-act="merge"], [data-act="merge"], [data-action="merge"], .action-merge, #btnMerge, #btn-merge');
      return { editBtn, mergeBtn };
    }

    function setButtonDisabled(el, disabled){
      if(!el) return;
      const off = !!disabled;
      try{ setDisabled(el, off); }
      catch(_err){
        if(typeof el.disabled !== 'undefined') el.disabled = off;
        if(off){ el.setAttribute('disabled', ''); }
        else{ el.removeAttribute('disabled'); }
        el.setAttribute('aria-disabled', off ? 'true' : 'false');
      }
      try{
        if(el.classList){
          el.classList.toggle('disabled', off);
          el.classList.toggle('is-disabled', off);
        }
      }catch(_err){}
    }

    function applyRules(){
      const { editBtn, mergeBtn } = findButtons();
      const count = getSelectedCount();
      const editOn = count === 1;
      const mergeOn = count === 2;
      setButtonDisabled(editBtn, !editOn);
      setButtonDisabled(mergeBtn, !mergeOn);
    }

    function addListener(target, eventName){
      try{
        if(target && typeof target.addEventListener === 'function'){
          target.addEventListener(eventName, applyRules);
        }
      }catch(_err){}
    }

    const raf = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
    const listenTargets = [window, document];
    const selectionEvents = ['selection:changed', 'selectionChanged'];
    const dataEvents = ['app:data:changed', 'appDataChanged'];
    listenTargets.forEach(target => {
      selectionEvents.forEach(evt => addListener(target, evt));
      dataEvents.forEach(evt => addListener(target, evt));
    });
    raf(() => raf(applyRules));

    window.__APPLY_ACTIONBAR_RULES__ = applyRules;
    return applyRules;
  }

  function updatePrimaryButtons(){
    const applyRules = wireActionbarRules();
    if(typeof applyRules === 'function') applyRules();
  }

  wireActionbarRules();

  function ensureConvertButton(){
    const bar = actionbar();
    if(!bar) return null;
    const host = bar.querySelector('.actionbar-actions');
    if(!host) return null;
    let btn = host.querySelector('[data-act="convertPipeline"]');
    if(btn) return btn;
    btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.dataset.act = 'convertPipeline';
    btn.textContent = 'Move to Pipeline';
    const clearBtn = host.querySelector('[data-act="clear"]');
    if(clearBtn && clearBtn.parentNode === host){
      host.insertBefore(btn, clearBtn);
    }else{
      host.appendChild(btn);
    }
    btn.disabled = true;
    if(btn.classList && typeof btn.classList.add === 'function') btn.classList.add('disabled');
    return btn;
  }

  function isLongShotRecord(contact){
    if(!contact) return false;
    const status = String(contact.status||'').toLowerCase();
    const stage = canonicalizeStage(contact.stage);
    if(status === 'longshot') return true;
    if(stage === 'long-shot') return true;
    return false;
  }

  function updateConvertButtonState(data){
    const btn = ensureConvertButton();
    if(!btn) return;
    const eligible = data && Array.isArray(data.contacts) && data.contacts.length === 1 && isLongShotRecord(data.contacts[0]);
    btn.disabled = !eligible;
    if(btn.classList && typeof btn.classList.toggle === 'function'){
      btn.classList.toggle('disabled', !eligible);
    }
  }

  function labelForStage(stage){
    const key = canonicalizeStage(stage);
    if(STAGE_LABELS[key]) return STAGE_LABELS[key];
    return key ? key.replace(/-/g,' ') : 'Application';
  }

  function updateActionbarBase(){
    if(!ensureSelectionService()) return;
    const bar = actionbar();
    if(!bar) return;
    ensureConvertButton();
    const count = SelectionService.count();
    if(typeof window.applyActionBarGuards === 'function'){
      try{ window.applyActionBarGuards(bar, count); }
      catch(err){ console.warn('applyActionBarGuards failed', err); }
    }else if(typeof window.computeActionBarGuards === 'function'){
      try{
        const guards = window.computeActionBarGuards(count);
        const acts = {
          edit:'edit',
          merge:'merge',
          emailTogether:'emailTogether',
          emailMass:'emailMass',
          addTask:'task',
          bulkLog:'bulkLog',
          convertToPipeline:'convertPipeline',
          delete:'delete',
          clear:'clear'
        };
        Object.entries(acts).forEach(([key, act]) => {
          const btn = bar.querySelector(`[data-act="${act}"]`);
          if(!btn) return;
          const enabled = !!guards[key];
          btn.disabled = !enabled;
          if(btn.classList && typeof btn.classList.toggle === 'function'){
            btn.classList.toggle('disabled', !enabled);
          }
        });
      }catch(err){ console.warn('computeActionBarGuards failed', err); }
    }
    bar.dataset.count = String(count);
    const countEl = bar.querySelector('[data-role="count"]');
    const breakdownEl = bar.querySelector('[data-role="breakdown"]');
    const amountEl = bar.querySelector('[data-role="amount"]');
    const namesEl = bar.querySelector('[data-role="names"]');
    const stagesEl = bar.querySelector('[data-role="stages"]');
    if(!count){
      bar.style.display = 'none';
      bar.classList.remove('has-selection');
      bar.removeAttribute('data-selection-type');
      if(countEl) countEl.textContent = 'No records selected';
      if(breakdownEl) breakdownEl.textContent = 'Select rows to unlock pipeline actions.';
      if(amountEl) amountEl.textContent = '';
      if(namesEl) namesEl.textContent = 'No contacts or partners in focus yet.';
      if(stagesEl) stagesEl.innerHTML = '';
      detailStore = { contacts: [], partners: [] };
      lastHydratedVersion = selectionVersion;
      updateConvertButtonState(detailStore);
      return;
    }
    bar.style.display = '';
    bar.classList.add('has-selection');
    bar.setAttribute('data-selection-type', SelectionService.type);
    if(countEl) countEl.textContent = count === 1 ? '1 Selected' : `${count} Selected`;
    updatePrimaryButtons();
  }

  async function fetchSelectionRecords(){
    if(!ensureSelectionService()) return { contacts: [], partners: [] };
    if(typeof window.openDB !== 'function') return { contacts: [], partners: [] };
    const ids = SelectionService.getIds();
    if(!ids.length) return { contacts: [], partners: [] };
    await window.openDB();
    const [contacts, partners] = await Promise.all([
      (typeof window.dbGetAll === 'function' ? window.dbGetAll('contacts') : Promise.resolve([])).catch(()=>[]),
      (typeof window.dbGetAll === 'function' ? window.dbGetAll('partners') : Promise.resolve([])).catch(()=>[])
    ]);
    const contactMap = new Map((contacts||[]).map(row => [String(row.id), row]));
    const partnerMap = new Map((partners||[]).map(row => [String(row.id), row]));
    const data = { contacts: [], partners: [] };
    if(SelectionService.type === 'partners'){
      SelectionService.getIds().forEach(id => {
        const row = partnerMap.get(String(id));
        if(row) data.partners.push(row);
      });
    } else {
      SelectionService.getIds().forEach(id => {
        const row = contactMap.get(String(id));
        if(row) data.contacts.push(row);
      });
    }
    return data;
  }

  function renderDetail(data){
    if(!ensureSelectionService()) return;
    const bar = actionbar();
    if(!bar) return;
    const breakdownEl = bar.querySelector('[data-role="breakdown"]');
    const amountEl = bar.querySelector('[data-role="amount"]');
    const namesEl = bar.querySelector('[data-role="names"]');
    const stagesEl = bar.querySelector('[data-role="stages"]');
    const parts = [];
    if(data.contacts.length) parts.push(`${data.contacts.length} contact${data.contacts.length===1?'':'s'}`);
    if(data.partners.length) parts.push(`${data.partners.length} partner${data.partners.length===1?'':'s'}`);
    if(breakdownEl){
      if(parts.length){
        breakdownEl.textContent = parts.join(' • ');
      }else{
        breakdownEl.textContent = SelectionService.type === 'partners' ? 'Partners selected' : 'Contacts selected';
      }
    }
    if(amountEl){
      if(data.contacts.length){
        const total = data.contacts.reduce((sum,row)=> sum + (Number(row.loanAmount)||0), 0);
        amountEl.textContent = total ? `Pipeline Value: ${currencyFmt.format(total)}` : 'Pipeline Value: —';
      } else {
        amountEl.textContent = 'Pipeline Value: —';
      }
    }
    if(namesEl){
      if(data.contacts.length){
        const names = data.contacts.map(row => {
          const first = String(row.first||'').trim();
          const last = String(row.last||'').trim();
          if(first || last) return `${first} ${last}`.trim();
          return row.name || row.email || `Contact ${row.id}`;
        }).filter(Boolean);
        const preview = names.slice(0,3);
        namesEl.textContent = preview.length ? preview.join(', ') + (names.length>3 ? `, +${names.length-3} more` : '') : 'Selected contacts ready for action.';
      }else if(data.partners.length){
        const names = data.partners.map(row => row.name || row.company || `Partner ${row.id}`).filter(Boolean);
        const preview = names.slice(0,3);
        namesEl.textContent = preview.length ? preview.join(', ') + (names.length>3 ? `, +${names.length-3} more` : '') : 'Selected partners ready for action.';
      }else{
        namesEl.textContent = 'Select rows to work with them together.';
      }
    }
    if(stagesEl){
      if(data.contacts.length){
        const counts = new Map();
        data.contacts.forEach(row => {
          const key = canonicalizeStage(row.stage);
          counts.set(key, (counts.get(key)||0)+1);
        });
        const chips = Array.from(counts.entries())
          .sort((a,b)=> b[1]-a[1])
          .map(([stage,total]) => `<span class="actionbar-stage-chip" data-stage="${stage}">${labelForStage(stage)} <strong>${total}</strong></span>`)
          .join('');
        stagesEl.innerHTML = chips;
      } else {
        stagesEl.innerHTML = '';
      }
    }
    updateConvertButtonState(data);
  }

  function scheduleDetailHydration(){
    if(!ensureSelectionService()) return;
    updateActionbarBase();
    if(!SelectionService.count()){
      return;
    }
    const currentVersion = selectionVersion;
    hydrationPromise = (async ()=>{
      try{
        const data = await fetchSelectionRecords();
        if(currentVersion >= lastHydratedVersion){
          lastHydratedVersion = currentVersion;
          detailStore = data;
          renderDetail(data);
        }
        return data;
      }catch(err){
        console.warn('actionbar hydrate', err);
        return detailStore;
      }
    })();
  }

  async function ensureSelectionDetail(){
    if(!ensureSelectionService()) return { contacts: [], partners: [] };
    if(!SelectionService.count()) return { contacts: [], partners: [] };
    if(lastHydratedVersion === selectionVersion) return detailStore;
    if(hydrationPromise){
      try{ return await hydrationPromise; }
      catch(_err){ return detailStore; }
    }
    try{
      const data = await fetchSelectionRecords();
      detailStore = data;
      lastHydratedVersion = selectionVersion;
      return data;
    }catch(_err){
      return detailStore;
    }
  }

  function logAction(meta){
    if(!window.DEBUG) return;
    try{
      const action = meta && meta.action ? meta.action : 'unknown';
      const selected = meta && Array.isArray(meta.selected) ? `[${meta.selected.join(',')}]` : '[]';
      const result = meta && meta.result ? meta.result : 'unknown';
      console.info(`[ACTIONBAR] action=${action} selected=${selected} result=${result}`);
    }catch(_err){}
  }

  function setActionbarBusy(isBusy, action){
    actionState.busy = !!isBusy;
    const bar = actionbar();
    if(!bar) return;
    bar.classList.toggle('is-busy', !!isBusy);
    if(isBusy){
      bar.setAttribute('data-busy-action', action || '');
    }else{
      bar.removeAttribute('data-busy-action');
    }
  }

  function emitSelectionAction(action, extra){
    const payload = Object.assign({ source:`actionbar:${action}`, scope:'selection', action }, extra && typeof extra === 'object' ? extra : {});
    if(typeof window.dispatchAppDataChanged === 'function') window.dispatchAppDataChanged(payload);
    else document.dispatchEvent(new CustomEvent('app:data:changed', { detail: payload }));
    return payload;
  }

  function finalizeAction(action, snapshot, result){
    const status = result && result.status ? result.status : 'cancel';
    const detail = result && typeof result.detail === 'object' ? result.detail : null;
    const dispatchFlag = result && Object.prototype.hasOwnProperty.call(result, 'dispatch') ? result.dispatch : !!detail;
    const pruneIds = result && Array.isArray(result.prune) ? result.prune.map(String) : null;
    const shouldClear = !!(result && result.clear);
    const sourceBase = `action:${action}`;
    if(status === 'ok'){
      if(pruneIds && pruneIds.length && ensureSelectionService() && typeof SelectionService.prune === 'function'){
        SelectionService.prune(pruneIds, `${sourceBase}:prune`);
      }
      if(shouldClear){
        if(ensureSelectionService() && typeof SelectionService.clear === 'function'){
          SelectionService.clear(`${sourceBase}:clear`);
        }
      }else if(ensureSelectionService() && typeof SelectionService.reemit === 'function'){
        SelectionService.reemit(`${sourceBase}:ok`);
      }
      if(dispatchFlag){
        emitSelectionAction(action, Object.assign({ status:'ok' }, detail || {}));
      }
    }else if(status === 'cancel'){
      if(snapshot && ensureSelectionService() && typeof SelectionService.restore === 'function'){
        SelectionService.restore(snapshot, `${sourceBase}:cancel`);
      }else if(ensureSelectionService() && typeof SelectionService.reemit === 'function'){
        SelectionService.reemit(`${sourceBase}:cancel`);
      }
    }else if(status === 'error'){
      if(snapshot && ensureSelectionService() && typeof SelectionService.restore === 'function'){
        SelectionService.restore(snapshot, `${sourceBase}:error`);
      }else if(ensureSelectionService() && typeof SelectionService.reemit === 'function'){
        SelectionService.reemit(`${sourceBase}:error`);
      }
    }
    setActionbarBusy(false, action);
    actionState.current = null;
    logAction({ action, selected: snapshot && Array.isArray(snapshot.ids) ? snapshot.ids : [], result: status });
    return result;
  }

  function resolvePendingAction(event){
    if(!pendingActions.size) return;
    if(event && event.type === 'app'){
      const detail = event.detail || {};
      const scope = String(detail.scope || detail.topic || '').toLowerCase();
      const sourceName = String(detail.source || '').toLowerCase();
      const contactId = detail.contactId || detail.id || detail.contactID;
      const partnerId = detail.partnerId || detail.id;
      for(const [token, entry] of pendingActions.entries()){
        const monitor = entry && entry.monitor ? entry.monitor : null;
        if(!monitor || monitor.type !== 'edit') continue;
        if(monitor.entity === 'contacts'){
          if(sourceName === 'contact:modal' || scope === 'contacts'){
            if(!monitor.id || !contactId || String(contactId) === String(monitor.id)){
              pendingActions.delete(token);
              finalizeAction(entry.action, entry.snapshot, { status:'ok', clear:true, dispatch:false, detail });
              return;
            }
          }
        }else if(monitor.entity === 'partners'){
          if(sourceName === 'partner:modal' || scope === 'partners'){
            if(!monitor.id || !partnerId || String(partnerId) === String(monitor.id)){
              pendingActions.delete(token);
              finalizeAction(entry.action, entry.snapshot, { status:'ok', clear:true, dispatch:false, detail });
              return;
            }
          }
        }
      }
    }else if(event && event.type === 'close'){
      const target = event.target;
      if(!target || !target.id) return;
      const id = target.id;
      for(const [token, entry] of pendingActions.entries()){
        const monitor = entry && entry.monitor ? entry.monitor : null;
        if(!monitor || monitor.type !== 'edit') continue;
        if((id === 'contact-modal' && monitor.entity === 'contacts') || (id === 'partner-modal' && monitor.entity === 'partners')){
          pendingActions.delete(token);
          finalizeAction(entry.action, entry.snapshot, { status:'cancel', dispatch:false });
          return;
        }
      }
    }
  }

  async function handleAction(act, snapshot){
    if(!ensureSelectionService()) return { status:'cancel', dispatch:false };
    const snap = snapshot && Array.isArray(snapshot.ids)
      ? snapshot
      : (typeof SelectionService.snapshot === 'function'
        ? SelectionService.snapshot()
        : { ids: typeof SelectionService.getIds === 'function' ? SelectionService.getIds() : [], type: SelectionService.type });
    switch(act){
      case 'edit':{
        if(!snap || snap.ids.length !== 1){ toast('Select exactly one record to edit'); return { status:'cancel', dispatch:false }; }
        const id = snap.ids[0];
        if(snap.type === 'partners'){
          if(typeof window.renderPartnerModal === 'function'){
            window.renderPartnerModal(id);
            return { status:'pending', clear:true, dispatch:false, monitor:{ type:'edit', entity:'partners', id } };
          }
          warnMissing('renderPartnerModal');
          return { status:'error', error:'renderPartnerModal missing', dispatch:false };
        }
        if(typeof window.renderContactModal === 'function'){
          window.renderContactModal(id);
          return { status:'pending', clear:true, dispatch:false, monitor:{ type:'edit', entity:'contacts', id } };
        }
        warnMissing('renderContactModal');
        return { status:'error', error:'renderContactModal missing', dispatch:false };
      }
      case 'merge':{
        if(snap.type !== 'contacts'){ toast('Merge supports contacts only'); return { status:'cancel', dispatch:false }; }
        if(snap.ids.length !== 2){ toast('Select exactly two contacts to merge'); return { status:'cancel', dispatch:false }; }
        const ids = snap.ids.slice(0,2).map(id => String(id));
        const route = currentView();
        if(route !== 'contacts'){
          console.warn('[merge] ignored merge outside contacts view', { route, ids });
          return { status:'cancel', dispatch:false };
        }
        const mergeFn = typeof window.mergeContactsWithIds === 'function'
          ? window.mergeContactsWithIds
          : async (pair) => openContactsMergeByIds(pair[0], pair[1]);
        try{
          const result = await mergeFn(ids);
          if(result && result.status === 'cancel'){
            return { status:'cancel', dispatch:false };
          }
          if(result && result.status === 'error'){
            toast('Merge failed');
            return { status:'error', error: result.error || new Error('merge failed'), dispatch:false };
          }
          return { status:'ok', clear:true, dispatch:false, detail:{ merged: ids } };
        }catch(err){
          console.error('mergeContactsWithIds', err);
          toast('Merge failed');
          return { status:'error', error: err, dispatch:false };
        }
      }
      case 'emailTogether':{
        const data = await ensureSelectionDetail();
        const records = snap.type === 'partners' ? data.partners : data.contacts;
        const emails = records.map(row => String(row.email||'').trim()).filter(Boolean);
        if(!emails.length){ toast('No email addresses on selected records'); return { status:'cancel', dispatch:false }; }
        const href = 'mailto:?bcc='+encodeURIComponent(emails.join(','));
        try{ window.open(href, '_self'); }
        catch(_err){ window.location.href = href; }
        return { status:'ok', clear:false, dispatch:false, detail:{ emails: emails.length, mode:'together' } };
      }
      case 'emailMass':{
        const data = await ensureSelectionDetail();
        const records = snap.type === 'partners' ? data.partners : data.contacts;
        const emails = records.map(row => String(row.email||'').trim()).filter(Boolean);
        if(!emails.length){ toast('No email addresses on selected records'); return { status:'cancel', dispatch:false }; }
        const text = emails.join('\n');
        let copied = false;
        if(navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
          try{ await navigator.clipboard.writeText(text); copied = true; }
          catch(_err){ copied = false; }
        }
        if(!copied){
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.setAttribute('readonly','');
          textarea.style.position = 'absolute';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          try{ document.execCommand('copy'); copied = true; }
          catch(_err){ copied = false; }
          textarea.remove();
        }
        toast(copied ? `Copied ${emails.length} email${emails.length===1?'':'s'}` : 'Copy failed');
        return { status:'ok', clear:false, dispatch:false, detail:{ emails: emails.length, mode:'copy', copied } };
      }
      case 'convertPipeline':{
        if(snap.type !== 'contacts'){ toast('Conversion applies to contacts only'); return { status:'cancel', dispatch:false }; }
        if(snap.ids.length !== 1){ toast('Select a single long shot to convert'); return { status:'cancel', dispatch:false }; }
        const data = await ensureSelectionDetail();
        const contact = data.contacts[0];
        if(!contact || !isLongShotRecord(contact)){ toast('Selected contact is already in pipeline'); return { status:'cancel', dispatch:false }; }
        if(typeof window.convertLongShotToPipeline !== 'function'){ warnMissing('convertLongShotToPipeline'); return { status:'error', error:'convertLongShotToPipeline missing', dispatch:false }; }
        try{
          const result = await window.convertLongShotToPipeline(contact.id);
          toast('Moved to pipeline');
          return { status:'ok', clear:true, dispatch:false, detail:{ converted: contact.id, ok: result && result.ok !== false } };
        }catch(err){
          console.error('convertLongShotToPipeline', err);
          toast('Conversion failed');
          return { status:'error', error: err, dispatch:false };
        }
      }
      case 'task':{
        if(snap.type !== 'contacts'){ toast('Tasks apply to contact records'); return { status:'cancel', dispatch:false }; }
        const data = await ensureSelectionDetail();
        if(!data.contacts.length){ toast('No contacts selected'); return { status:'cancel', dispatch:false }; }
        const result = await openBulkTaskModal(data.contacts);
        if(!result || result.status === 'cancel') return { status:'cancel', dispatch:false };
        if(result.status === 'error') return { status:'error', error: result.error, dispatch:false };
        return { status:'ok', clear:true, dispatch:true, detail:Object.assign({ count: result.count || data.contacts.length }, result.detail || {}) };
      }
      case 'bulkLog':{
        if(!snap.ids.length){ toast('Select records to log activity'); return { status:'cancel', dispatch:false }; }
        if(typeof window.openBulkLogModal === 'function'){
          const result = await window.openBulkLogModal(snap.ids.slice());
          if(result && result.status === 'ok'){
            return { status:'ok', clear:true, dispatch:true, detail:Object.assign({ count: result.count || snap.ids.length }, result.detail || {}) };
          }
          if(result && result.status === 'error') return { status:'error', error: result.error, dispatch:false };
          return { status:'cancel', dispatch:false };
        }
        if(typeof window.bulkAppendLog === 'function'){
          warnMissing('openBulkLogModal');
          return { status:'error', error:'openBulkLogModal missing', dispatch:false };
        }
        warnMissing('bulkLog');
        return { status:'error', error:'bulkLog missing', dispatch:false };
      }
      case 'clear':{
        return { status:'ok', clear:true, dispatch:false, detail:{ cleared:true } };
      }
      case 'delete':{
        const removed = await deleteSelection();
        if(removed === false) return { status:'error', error:'delete failed', dispatch:false };
        if(!removed || !removed.count) return { status:'cancel', dispatch:false };
        return { status:'ok', clear:true, dispatch:false, detail:{ deleted: removed.count }, prune: removed.ids };
      }
      default:
        warnMissing(`action:${act}`);
        return { status:'cancel', dispatch:false };
    }
  }

  async function executeAction(act){
    if(!act) return;
    if(actionState.busy) return;
    if(!ensureSelectionService()) return;
    const snapshot = typeof SelectionService.snapshot === 'function'
      ? SelectionService.snapshot()
      : { ids: typeof SelectionService.getIds === 'function' ? SelectionService.getIds() : [], type: SelectionService.type };
    if(!snapshot || !Array.isArray(snapshot.ids) || !snapshot.ids.length){
      toast('Select records first');
      return;
    }
    setActionbarBusy(true, act);
    actionState.current = { action: act };
    let result;
    try{
      result = await handleAction(act, snapshot);
    }catch(err){
      console.error('handleAction failed', act, err);
      result = { status:'error', error: err, dispatch:false };
    }
    if(!result) result = { status:'cancel', dispatch:false };
    if(result.status === 'pending'){
      const token = Symbol(`pending:${act}`);
      pendingActions.set(token, {
        token,
        action: act,
        snapshot,
        monitor: result.monitor || null
      });
      actionState.current = { action: act, token };
      setActionbarBusy(false, act);
      logAction({ action: act, selected: snapshot.ids, result:'pending' });
      return;
    }
    finalizeAction(act, snapshot, result);
  }

  function ensureTaskModal(){
    let wrap = document.getElementById('bulk-task-modal');
    if(wrap) return wrap;
    wrap = document.createElement('div');
    wrap.id = 'bulk-task-modal';
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="dlg" style="max-width:520px">
        <div class="row" style="align-items:center">
          <strong>Add Task to Selected</strong>
          <span class="grow"></span>
          <button class="btn" data-close-task>Close</button>
        </div>
        <div class="muted" id="bt-count" style="margin-top:6px"></div>
        <div class="row" style="gap:12px;margin-top:12px">
          <label class="grow">Title<br><input id="bt-title" type="text" placeholder="Follow up"/></label>
          <label>Due<br><input id="bt-due" type="date"/></label>
        </div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button class="btn brand" id="bt-save" disabled>Save Tasks</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', evt => {
      if(evt.target === wrap || evt.target.hasAttribute('data-close-task')){
        wrap.classList.add('hidden');
      }
    });
    const titleInput = wrap.querySelector('#bt-title');
    const saveBtn = wrap.querySelector('#bt-save');
    if(titleInput && saveBtn){
      titleInput.addEventListener('input', () => {
        saveBtn.disabled = !titleInput.value.trim();
      });
    }
    const dueInput = wrap.querySelector('#bt-due');
    if(dueInput && !dueInput.value){
      try{ dueInput.value = new Date().toISOString().slice(0,10); }
      catch(_err){}
    }
    return wrap;
  }

  async function openBulkTaskModal(rows){
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if(!list.length){ toast('Select contact rows'); return Promise.resolve({ status:'cancel' }); }
    const wrap = ensureTaskModal();
    const titleInput = wrap.querySelector('#bt-title');
    const dueInput = wrap.querySelector('#bt-due');
    const saveBtn = wrap.querySelector('#bt-save');
    const countEl = wrap.querySelector('#bt-count');
    if(countEl) countEl.textContent = `${list.length} contact${list.length===1?'':'s'} selected`;
    if(titleInput) titleInput.value = '';
    if(dueInput){
      try{ dueInput.value = new Date().toISOString().slice(0,10); }
      catch(_err){}
    }
    if(saveBtn){ saveBtn.disabled = true; saveBtn.onclick = null; }
    wrap.classList.remove('hidden');
    if(titleInput) titleInput.focus();
    const existingHandlers = wrap.__taskHandlers;
    if(existingHandlers){
      if(existingHandlers.cancel) wrap.removeEventListener('click', existingHandlers.cancel, true);
      if(existingHandlers.key) document.removeEventListener('keydown', existingHandlers.key, true);
      if(existingHandlers.save && saveBtn) saveBtn.removeEventListener('click', existingHandlers.save);
    }
    return new Promise(resolve => {
      let done = false;
      const cleanup = () => {
        if(titleInput) titleInput.value = '';
        if(saveBtn) saveBtn.disabled = true;
        wrap.__taskHandlers = null;
      };
      const finish = (result) => {
        if(done) return;
        done = true;
        wrap.classList.add('hidden');
        if(cancelHandler) wrap.removeEventListener('click', cancelHandler, true);
        if(keyHandler) document.removeEventListener('keydown', keyHandler, true);
        if(saveHandler && saveBtn) saveBtn.removeEventListener('click', saveHandler);
        cleanup();
        resolve(result);
      };
      const cancelHandler = (evt) => {
        if(evt.target === wrap || evt.target.hasAttribute('data-close-task')){
          evt.preventDefault();
          evt.stopPropagation();
          evt.stopImmediatePropagation();
          finish({ status:'cancel' });
        }
      };
      const keyHandler = (evt) => {
        if(evt.key === 'Escape'){
          evt.preventDefault();
          finish({ status:'cancel' });
        }
      };
      const saveHandler = async (evt) => {
        evt.preventDefault();
        const title = titleInput ? titleInput.value.trim() : '';
        const due = dueInput ? dueInput.value : '';
        if(!title){ toast('Task title required'); return; }
        try{
          if(typeof window.openDB === 'function') await window.openDB();
          const now = Date.now();
          const tasks = list.map(row => ({
            id: String('task-'+row.id+'-'+now),
            contactId: row.id,
            title,
            due: due || '',
            status: 'open',
            createdAt: now,
            updatedAt: now
          }));
          if(tasks.length && typeof window.dbBulkPut === 'function'){
            await window.dbBulkPut('tasks', tasks);
          }
          toast(`Added ${tasks.length} task${tasks.length===1?'':'s'}`);
          finish({ status:'ok', count: tasks.length, detail:{ scope:'tasks', action:'bulk-task', count: tasks.length } });
        }catch(err){
          console.warn('bulk task error', err);
          toast('Failed to add tasks');
          finish({ status:'error', error: err });
        }
      };
      wrap.addEventListener('click', cancelHandler, true);
      document.addEventListener('keydown', keyHandler, true);
      if(saveBtn) saveBtn.addEventListener('click', saveHandler);
      wrap.__taskHandlers = { cancel: cancelHandler, key: keyHandler, save: saveHandler };
    });
  }

  async function deleteSelection(){
    if(!ensureSelectionService()) return false;
    const ids = SelectionService.getIds();
    if(!ids.length){ toast('Select records to delete'); return false; }
    const prompt = `Delete ${ids.length} selected record${ids.length===1?'':'s'}?`;
    let confirmed = true;
    if(typeof window.confirmAction === 'function'){
      confirmed = await window.confirmAction({
        title: 'Delete records',
        message: prompt,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        destructive: true
      });
    }else if(typeof window.confirm === 'function'){
      confirmed = window.confirm(prompt);
    }
    if(!confirmed) return { count:0, ids:[] };
    try{
      const targets = ids.map(id => {
        const meta = SelectionService.items.get(id);
        const store = meta && meta.type === 'partners' ? 'partners' : 'contacts';
        return { store, id };
      }).filter(item => item.store && item.id!=null);
      if(!targets.length){ toast('Nothing deleted'); return { count:0, ids:[] }; }
      const describe = window.__SOFT_DELETE_SERVICE__ && typeof window.__SOFT_DELETE_SERVICE__.describeRecords === 'function'
        ? window.__SOFT_DELETE_SERVICE__.describeRecords
        : null;
      const label = describe ? describe(targets) : `${targets.length} record${targets.length===1?'':'s'}`;
      let removed = 0;
      if(typeof window.softDeleteMany === 'function'){
        const result = await window.softDeleteMany(targets, {
          source: 'actionbar:delete',
          message: `Deleted ${label}. Undo to restore.`
        });
        removed = result && typeof result.count === 'number' ? result.count : 0;
      }else if(typeof window.softDelete === 'function'){
        for(const target of targets){
          try{
            const result = await window.softDelete(target.store, target.id, { source:'actionbar:delete' });
            if(result && result.ok) removed += 1;
          }catch(err){ console.warn('softDelete fallback', err); }
        }
        if(removed && typeof window.toast === 'function'){
          window.toast({ message: `Deleted ${removed} record${removed===1?'':'s'}.` });
        }
      }else if(typeof window.dbDelete === 'function'){
        for(const target of targets){
          try{ await window.dbDelete(target.store, target.id); removed += 1; }
          catch(err){ console.warn('delete failed', target.store, target.id, err); }
        }
        if(removed && typeof window.toast === 'function'){
          window.toast({ message: `Deleted ${removed} record${removed===1?'':'s'}.` });
        }
      }
      if(!removed){
        toast('Nothing deleted');
        return { count:0, ids:[] };
      }
      return { count: removed, ids: ids.slice() };
    }catch(err){
      console.warn('deleteSelection', err);
      toast('Delete failed');
      return false;
    }
  }

  function bindActionbar(){
    if(!ensureSelectionService()) return;
    const bar = actionbar();
    if(!bar || bar.__patched) return;
    bar.__patched = true;
    if(bar.style){
      bar.style.boxShadow = '0 6px 16px rgba(0,0,0,.12)';
      bar.style.transform = 'translateY(-4px)';
    }
    bar.addEventListener('click', evt => {
      const btn = evt.target && evt.target.closest('[data-act]');
      if(!btn) return;
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      if(btn.disabled) return;
      const act = btn.dataset.act;
      if(!act) return;
      executeAction(act);
    }, true);
  }

  function bindCheckboxes(){
    document.addEventListener('change', evt => {
      const target = evt.target;
      if(!(target instanceof HTMLInputElement)) return;
      if(target.type !== 'checkbox') return;
      if(!target.closest('table')) return;
      const id = resolveRowId(target);
      if(!id) return;
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      const type = detectRowType(target);
      if(!ensureSelectionService()) return;
      if(target.checked) SelectionService.add(id, type);
      else SelectionService.remove(id);
    }, true);
  }

  function bindNavReset(){
    document.addEventListener('click', evt => {
      const nav = evt.target && evt.target.closest('[data-nav]');
      if(!nav) return;
      if(!ensureSelectionService()) return;
      SelectionService.clear();
    }, true);
  }

  function installObservers(){
    if(window.__SELECTION_OBSERVER__){
      try{ window.__SELECTION_OBSERVER__.disconnect(); }
      catch(_err){}
    }
    const host = document.querySelector('.table-wrap, #view-contacts, #view-partners') || document.body;
    if(!host) return;
    const observer = new MutationObserver(()=>{
      scheduleSyncChecks();
    });
    try{
      observer.observe(host, { childList:true, subtree:true });
      window.__SELECTION_OBSERVER__ = observer;
      scheduleSyncChecks();
    }catch(err){
      console.warn('observer attach failed', err);
    }
  }

  async function normalizeStagesOnBoot(isRestore){
    if(normalizeStagesOnBoot.__ran && !isRestore) return;
    if(!isRestore) normalizeStagesOnBoot.__ran = true;
    if(typeof window.openDB !== 'function' || typeof window.dbGetAll !== 'function' || typeof window.dbBulkPut !== 'function') return;
    try{
      await window.openDB();
      const contacts = await window.dbGetAll('contacts');
      const changed = [];
      contacts.forEach(contact => {
        const next = canonicalizeStage(contact.stage);
        if(next !== contact.stage){
          changed.push(Object.assign({}, contact, { stage: next }));
        }
      });
      if(!changed.length) return;
      await window.dbBulkPut('contacts', changed);
      console.info(`Normalized ${changed.length} contact stage(s) to canonical slug.`);
      const detail = { source:'patch:stage-canonical', normalized: changed.length };
      if(typeof window.dispatchAppDataChanged === 'function') window.dispatchAppDataChanged(detail);
      else document.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
      if(typeof window.renderAll === 'function') await window.renderAll();
    }catch(err){
      console.warn('stage normalization failed', err);
    }
  }

  function bootstrap(){
    if(!ensureSelectionService()){
      console.error('SelectionService unavailable during bootstrap');
      return;
    }
    bindActionbar();
    bindCheckboxes();
    bindNavReset();
    installObservers();
    updateActionbarBase();
    if(typeof window.registerRenderHook === 'function'){
      window.registerRenderHook(() => {
        scheduleSyncChecks();
        queueSelectionTick();
      });
    }
    const ACTIONBAR_EVENT_KEY = '__ACTIONBAR_EVENT_WIRED__';
    if(!document[ACTIONBAR_EVENT_KEY]){
      document[ACTIONBAR_EVENT_KEY] = true;
      document.addEventListener('app:data:changed', evt => {
        resolvePendingAction({ type:'app', detail: evt && evt.detail ? evt.detail : {} });
      });
      document.addEventListener('close', evt => {
        resolvePendingAction({ type:'close', target: evt && evt.target ? evt.target : null });
      }, true);
      document.addEventListener('selection:changed', () => {
        updatePrimaryButtons();
        queueSelectionTick();
      });
    }
    window.updateActionbar = function(){
      queueSelectionTick();
    };
    normalizeStagesOnBoot(false);
  }

  function onDomReady(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    }else{
      fn();
    }
  }

  function initActionbar(){
    if(ensureSelectionService()){
      onDomReady(bootstrap);
      return;
    }
    const bootDone = window.__BOOT_DONE__;
    if(bootDone && typeof bootDone.then === 'function'){
      Promise.resolve(bootDone)
        .then(() => {
          if(ensureSelectionService()) onDomReady(bootstrap);
          else console.error('SelectionService unavailable after boot');
        })
        .catch(err => {
          console.error('SelectionService bootstrap failed', err);
        });
      return;
    }
    console.error('SelectionService unavailable');
  }

  initActionbar();
})();
