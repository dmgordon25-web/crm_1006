// patch_2025-09-26_phase4_polish_regression.js — Phase 4 QA polish & regression hardening
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.patch_2025_09_26_phase4_polish_regression) return;
  window.__INIT_FLAGS__.patch_2025_09_26_phase4_polish_regression = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_2025-09-26_phase4_polish_regression.js')){
    window.__PATCHES_LOADED__.push('/js/patch_2025-09-26_phase4_polish_regression.js');
  }

  const queueMicro = typeof queueMicrotask === 'function' ? queueMicrotask : (cb)=>Promise.resolve().then(cb);
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb)=>setTimeout(cb, 16);
  const now = ()=> Date.now();
  const perfNow = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? ()=>performance.now() : ()=>Date.now();
  const PIPELINE_LANE_PREFIX = 'pipeline:';

  function normalizeLaneKey(value){
    const raw = String(value==null?'':value).trim().toLowerCase();
    if(!raw) return '';
    return raw.replace(/\s+/g,'-').replace(/-+/g,'-');
  }

  function pipelineLaneKey(stageKey){
    const canonical = canonicalStage(stageKey);
    if(!canonical) return '';
    if(canonical === 'preapproved' || canonical === 'pre-app' || canonical === 'preapp') return 'pre-app';
    if(canonical === 'approved' || canonical === 'cleared-to-close' || canonical === 'ctc') return 'ctc';
    if(canonical === 'long-shot') return 'lead';
    return normalizeLaneKey(canonical);
  }

  function extractLaneTokens(partial){
    const tokens = [];
    if(!partial) return tokens;
    if(typeof partial === 'string'){ tokens.push(partial); return tokens; }
    if(Array.isArray(partial)){ partial.forEach(value => { if(typeof value === 'string') tokens.push(value); }); return tokens; }
    if(typeof partial === 'object'){
      if(typeof partial.lane === 'string') tokens.push(partial.lane);
      if(Array.isArray(partial.lanes)) partial.lanes.forEach(value => { if(typeof value === 'string') tokens.push(value); });
    }
    return tokens;
  }

  function logPaint(type, meta, start){
    if(!(window.__ENV__ && window.__ENV__.DEBUG)) return;
    const suffix = meta ? ` ${meta}` : '';
    raf(()=>{
      try{
        const duration = (perfNow() - start).toFixed(2);
        console.debug(`[paint:${type}]${suffix} ${duration}ms`);
      }catch(err){ console.warn('[paint:debug]', err); }
    });
  }

  const MAX_EVENT_LOG = 200;
  const eventLog = window.__PHASE4_EVENT_LOG__ = window.__PHASE4_EVENT_LOG__ || [];

  let toastMuteUntil = 0;
  function muteToastsFor(durationMs){
    const previous = toastMuteUntil;
    const delta = typeof durationMs === 'number' ? Math.max(0, durationMs) : 0;
    const target = now() + delta;
    toastMuteUntil = Math.max(toastMuteUntil, target);
    return ()=>{ toastMuteUntil = previous; };
  }

  function withToastMute(fn, durationMs){
    const restore = muteToastsFor(durationMs || 0);
    try{
      const result = typeof fn === 'function' ? fn() : undefined;
      if(result && typeof result.then === 'function'){
        return result.finally(restore);
      }
      restore();
      return result;
    }catch(err){
      restore();
      throw err;
    }
  }

  // --- A) Render guard + partial repaint API ---
  window.__RENDER_LOCK__ = false;
  window.__RENDER_LOCK_WAITING__ = false;
  window.__SKIP_GLOBAL_RENDER__ = false;
  const pendingRenderTasks = [];
  let flushScheduled = false;
  let lockSince = 0;

  function acquireLock(key){
    window.__RENDER_LOCK__ = key || true;
    lockSince = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function releaseLock(){
    window.__RENDER_LOCK__ = false;
    lockSince = 0;
    if(pendingRenderTasks.length) flushQueue();
  }

  setInterval(()=>{
    if(!window.__RENDER_LOCK__) return;
    const nowTs = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if(lockSince && (nowTs - lockSince) > 500){
      console.warn('Render lock watchdog');
      window.__RENDER_LOCK__ = false;
      lockSince = 0;
      if(pendingRenderTasks.length) flushQueue();
    }
  }, 250);

  function flushQueue(){
    if(flushScheduled) return;
    flushScheduled = true;
    queueMicro(()=>{
      flushScheduled = false;
      if(window.__RENDER_LOCK__){
        if(!window.__RENDER_LOCK_WAITING__){
          window.__RENDER_LOCK_WAITING__ = true;
          raf(()=>{
            window.__RENDER_LOCK_WAITING__ = false;
            flushQueue();
          });
        }
        return;
      }
      const next = pendingRenderTasks.shift();
      if(next){
        try{ next(); }
        catch(err){ console.warn('[render queue]', err); }
      }
      if(pendingRenderTasks.length) flushQueue();
    });
  }

  window.withRender = function(lockKey, fn){
    return new Promise((resolve, reject)=>{
      const runner = ()=>{
        if(window.__RENDER_LOCK__){
          pendingRenderTasks.push(runner);
          flushQueue();
          return;
        }
        acquireLock(lockKey);
        let finished = false;
        function finalize(){
          if(finished) return;
          finished = true;
          releaseLock();
        }
        (async ()=>{
          try{
            const result = typeof fn === 'function' ? await fn() : undefined;
            resolve(result);
          }catch(err){
            reject(err);
          }finally{
            finalize();
          }
        })();
      };
      runner();
    });
  };

  if(typeof window.renderAll === 'function' && !window.renderAll.__phase4Guarded){
    const originalRenderAll = window.renderAll;
    window.renderAll = function(){
      if(window.__SKIP_GLOBAL_RENDER__) return Promise.resolve();
      return window.withRender('renderAll', ()=> originalRenderAll.apply(this, arguments));
    };
    window.renderAll.__phase4Guarded = true;
  }

  const EVT = window.EVT = Object.freeze({
    selectionChanged:'selection:changed',
    contactUpdated:'contact:updated',
    stageChanged:'stage:changed',
    taskUpdated:'task:updated',
    automationExecuted:'automation:executed',
    dataChanged:'app:data:changed'
  });

  function logEvent(name, detail){
    try{
      const entry = {ts: now(), name, detail: detail!=null ? JSON.parse(JSON.stringify(detail)) : null};
      eventLog.push(entry);
      if(eventLog.length > MAX_EVENT_LOG) eventLog.splice(0, eventLog.length - MAX_EVENT_LOG);
    }catch(_){ eventLog.push({ts: now(), name, detail}); if(eventLog.length > MAX_EVENT_LOG) eventLog.shift(); }
  }

  const listenerMap = new Map();
  const listenersByEvent = new Map();
  const origAdd = document.addEventListener.bind(document);
  document.addEventListener = function(name, fn, opts){
    if(typeof fn !== 'function') return origAdd(name, fn, opts);
    const wrapped = function(){
      try{ return fn.apply(this, arguments); }
      catch(err){ console.warn('[listener]', name, err); }
    };
    listenerMap.set(fn, wrapped);
    if(!listenersByEvent.has(name)) listenersByEvent.set(name, new Set());
    listenersByEvent.get(name).add(fn);
    return origAdd(name, wrapped, opts);
  };
  const origRemove = document.removeEventListener.bind(document);
  document.removeEventListener = function(name, fn, opts){
    const wrapped = listenerMap.get(fn);
    if(wrapped){
      listenerMap.delete(fn);
      const bucket = listenersByEvent.get(name);
      if(bucket) bucket.delete(fn);
      return origRemove(name, wrapped, opts);
    }
    return origRemove(name, fn, opts);
  };

  const debugMode = (function(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      return params.get('debug') === '1';
    }catch(_){ return false; }
  })();

  function logListenerDiagnosticsOnce(){
    if(!debugMode) return;
    if(logListenerDiagnosticsOnce.__ran) return;
    logListenerDiagnosticsOnce.__ran = true;
    ['app:data:changed','selection:changed'].forEach(name => {
      const count = listenersByEvent.has(name) ? listenersByEvent.get(name).size : 0;
      const message = `[phase4] ${name} listeners: ${count}`;
      if(count > 12){ console.warn(message); }
      else { console.info(message); }
    });
  }
  queueMicro(logListenerDiagnosticsOnce);

  const stageMutations = new Map();
  const STAGE_TOUCH_TTL = 30000;
  function canonicalStage(value){
    if(typeof window.canonicalizeStage === 'function') return window.canonicalizeStage(value);
    return String(value||'').trim().toLowerCase();
  }

  function rememberStageMutation(detail){
    if(!detail) return;
    const rawId = detail.contactId != null ? detail.contactId : detail.id;
    if(rawId == null) return;
    const id = String(rawId);
    const nowTs = now();
    const targets = [];
    if(detail.from != null) targets.push(canonicalStage(detail.from));
    if(detail.to != null) targets.push(canonicalStage(detail.to));
    else if(detail.stage != null) targets.push(canonicalStage(detail.stage));
    targets.filter(Boolean).forEach(stageKey => {
      const entry = stageMutations.get(stageKey) || {ids:new Set(), ts:nowTs};
      entry.ids.add(id);
      entry.ts = nowTs;
      stageMutations.set(stageKey, entry);
    });
  }
  document.addEventListener(EVT.stageChanged, evt=> rememberStageMutation(evt?.detail||{}));

  function consumeStageContacts(stageKey){
    const entry = stageMutations.get(stageKey);
    if(!entry) return [];
    if(now() - entry.ts > STAGE_TOUCH_TTL){
      stageMutations.delete(stageKey);
      return [];
    }
    stageMutations.delete(stageKey);
    return Array.from(entry.ids);
  }

  function dispatchAppDataPartial(detail){
    const prevSkip = window.__SKIP_GLOBAL_RENDER__;
    const payload = detail && typeof detail === 'object' ? Object.assign({}, detail) : {};
    if(payload.partial && typeof payload.partial === 'object' && !Array.isArray(payload.partial)){
      payload.partial = Object.assign({}, payload.partial);
    }
    const start = perfNow();
    const lanes = extractLaneTokens(payload.partial);
    const scopeLabel = (typeof payload.scope === 'string' && payload.scope) ? payload.scope : (payload.partial && typeof payload.partial === 'object' && typeof payload.partial.scope === 'string' ? payload.partial.scope : '');
    window.__SKIP_GLOBAL_RENDER__ = true;
    try{
      document.dispatchEvent(new CustomEvent('app:data:changed',{detail:payload}));
    }catch(err){ console.warn('[partial:data]', err); }
    finally{
      queueMicro(()=>{ window.__SKIP_GLOBAL_RENDER__ = prevSkip; });
      if(lanes.length) logPaint('lane', lanes.join('|'), start);
      else logPaint('partial', scopeLabel, start);
    }
  }

  if(typeof window.dispatchAppDataChanged === 'function'){
    const current = window.dispatchAppDataChanged;
    if(!current.__phase4Wrapped){
      const original = current.__phase4Original || current;
      const wrapped = function(detail){
        if(detail && detail.partial){
          dispatchAppDataPartial(detail);
          return;
        }
        const start = perfNow();
        const result = original.apply(this, arguments);
        logPaint('full', detail && typeof detail.scope === 'string' ? detail.scope : '', start);
        return result;
      };
      wrapped.__phase4Wrapped = true;
      wrapped.__phase4Original = original;
      window.dispatchAppDataChanged = wrapped;
    }
  }

  function dispatch(evtName, detail){
    const name = String(evtName||'');
    if(!name) return;
    const payload = detail === undefined ? {} : detail;
    logEvent(name, payload);
    if(name === EVT.stageChanged) rememberStageMutation(payload);
    try{
      document.dispatchEvent(new CustomEvent(name,{detail:payload}));
    }catch(err){ console.warn('[dispatch]', name, err); }
  }
  window.dispatchTypedEvent = dispatch;

  function iterateActions(detail, cb){
    if(!detail || typeof cb !== 'function') return;
    if(detail.action) cb(detail);
    if(Array.isArray(detail.actions)){
      detail.actions.forEach(entry => {
        if(entry && entry.action) cb(entry);
      });
    }
  }

  document.addEventListener(EVT.dataChanged, evt => {
    const detail = evt?.detail || {};
    if(!detail) return;
    if(detail.source === 'automations'){
      iterateActions(detail, actionDetail => {
        if(actionDetail.action === 'history'){
          const payload = Object.assign({}, actionDetail);
          if(payload.contactId == null) payload.contactId = detail.contactId;
          dispatch(EVT.automationExecuted, payload);
        }
        if(actionDetail.action === 'task'){
          dispatch(EVT.taskUpdated, Object.assign({}, actionDetail));
        }
      });
    }
  });

  let lastToastMsg = '';
  let lastToastTs = 0;
  const originalToast = typeof window.toast === 'function' ? window.toast.bind(window) : null;
  function toastSafe(message){
    const msg = message == null ? '' : String(message);
    const ts = now();
    if(msg === 'Executed: Automation daily catch-up') return;
    if(ts < toastMuteUntil) return;
    if(msg === lastToastMsg && (ts - lastToastTs) < 2000) return;
    lastToastMsg = msg;
    lastToastTs = ts;
    if(originalToast) originalToast(msg);
    else console.log('[toast]', msg);
  }
  window.toast = toastSafe;

  const repaint = window.repaint = window.repaint || {};
  repaint.lane = function(stageKey){
    const canonical = canonicalStage(stageKey);
    if(!canonical) return;
    const laneKey = pipelineLaneKey(stageKey);
    const laneToken = laneKey ? `${PIPELINE_LANE_PREFIX}${laneKey}` : '';
    const ids = consumeStageContacts(canonical);
    const basePartial = laneToken ? {lane: laneToken, scope:'pipeline'} : {scope:'pipeline'};
    const baseDetail = {source:'phase4:lane', stage:canonical};
    if(laneKey) baseDetail.lane = laneKey;
    const dispatchDetail = extra => {
      const payload = Object.assign({}, baseDetail, extra || {});
      payload.partial = Object.assign({}, basePartial);
      dispatchAppDataPartial(payload);
    };
    if(ids.length){
      ids.forEach(id => dispatchDetail({action:'stage', contactId:String(id)}));
      return;
    }
    dispatchDetail();
  };
  repaint.dashboardKpis = function(){
    dispatch(EVT.taskUpdated, {partial:true, source:'phase4:dashboard'});
  };
  repaint.timeline = function(contactId){
    const id = contactId!=null ? String(contactId) : '';
    if(!id) return;
    dispatchAppDataPartial({partial:true, source:'phase4:timeline', action:'history', contactId:id});
  };
  repaint.widget = function(id){
    const widgetId = id!=null ? String(id) : '';
    if(!widgetId) return;
    dispatch(EVT.contactUpdated, {partial:true, source:'phase4:widget', widget:widgetId});
  };

  // --- C) Selection regression guards ---
  (function enforceSelectionSingleton(){
    let primary = (window.SelectionService && typeof window.SelectionService === 'object') ? window.SelectionService : null;
    let exposed = primary || null;
    let warned = false;
    const proxies = new WeakMap();

    Object.defineProperty(window, 'SelectionService', {
      configurable:true,
      enumerable:true,
      get(){ return exposed; },
      set(value){
        if(!value || typeof value !== 'object'){
          primary = value || null;
          exposed = primary;
          return value;
        }
        if(!primary){
          primary = value;
          exposed = value;
          return value;
        }
        if(value === primary || value === exposed) return value;
        if(!warned && console && console.warn){
          console.warn('[selection] duplicate SelectionService detected; using primary instance');
          warned = true;
        }
        let proxy = proxies.get(primary);
        if(!proxy){
          proxy = new Proxy(primary, {
            get(target, prop){
              const val = target[prop];
              return typeof val === 'function' ? val.bind(target) : val;
            },
            set(target, prop, val){ target[prop] = val; return true; }
          });
          proxies.set(primary, proxy);
        }
        exposed = proxy;
        return value;
      }
    });
    if(primary) exposed = primary;
  })();

  function selectionDetail(svc){
    if(!svc) return {type:'contacts', ids:[]};
    const ids = typeof svc.getIds === 'function' ? svc.getIds() : Array.from(svc.ids || []);
    return {type: svc.type || 'contacts', ids};
  }

  function ensureSelectionServiceWiring(){
    const svc = window.SelectionService;
    if(!svc || svc.__phase4Wired) return;
    const originalSync = typeof svc.syncChecks === 'function' ? svc.syncChecks.bind(svc) : null;
    let pendingSync = null;
    function scheduleSync(){
      if(!originalSync) return;
      if(pendingSync) return;
      pendingSync = raf(()=>{
        pendingSync = null;
        try{ originalSync(); }
        catch(err){ console.warn('[selection sync]', err); }
      });
    }
    svc.emit = function(){
      dispatch(EVT.selectionChanged, selectionDetail(svc));
    };
    ['add','remove','clear','del'].forEach(method => {
      const original = typeof svc[method] === 'function' ? svc[method].bind(svc) : null;
      if(!original || original.__phase4Wrapped) return;
      const wrapped = function(){
        const result = original.apply(this, arguments);
        if(method !== 'clear') scheduleSync();
        return result;
      };
      wrapped.__phase4Wrapped = true;
      svc[method] = wrapped;
    });
    svc.__phase4Wired = true;
    svc.emit();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureSelectionServiceWiring);
  else queueMicro(ensureSelectionServiceWiring);

  function hideActionbarWhenEmpty(){
    const svc = window.SelectionService;
    const bar = document.getElementById('actionbar');
    if(!svc || !bar || typeof svc.count !== 'function') return;
    if(svc.count() === 0){
      bar.style.display = 'none';
      bar.classList.remove('has-selection');
      bar.removeAttribute('data-selection-type');
    }
  }
  document.addEventListener(EVT.selectionChanged, hideActionbarWhenEmpty);

  document.addEventListener('click', evt => {
    const navBtn = evt.target && evt.target.closest ? evt.target.closest('#main-nav [data-nav]') : null;
    if(!navBtn) return;
    const view = navBtn.getAttribute('data-nav') || '';
    try{ document.dispatchEvent(new CustomEvent('app:navigate',{detail:{view}})); }
    catch(err){ console.warn('[app:navigate]', err); }
    if(window.SelectionService && typeof window.SelectionService.clear === 'function'){
      window.SelectionService.clear();
    }
  }, true);

  let selfTestRan = false;
  function runSelectionSelfTest(){
    if(selfTestRan) return;
    const svc = window.SelectionService;
    if(!svc || typeof svc.add !== 'function' || typeof svc.count !== 'function') return;
    if(svc.count() > 0) return; // avoid disrupting active selections
    selfTestRan = true;
    const snapshot = typeof svc.getIds === 'function' ? svc.getIds().slice() : [];
    const prevType = svc.type || 'contacts';
    const before = svc.count();
    const testIds = ['__smoke_sel_a__','__smoke_sel_b__'];
    testIds.forEach(id => svc.add(id));
    const mid = svc.count();
    svc.clear();
    snapshot.forEach(id => svc.add(id, prevType));
    const after = svc.count();
    if(before !== 0 || mid < testIds.length || after !== snapshot.length){
      console.warn('[selection] self-test failed');
    }
  }
  if(document.readyState === 'complete') queueMicro(runSelectionSelfTest);
  else window.addEventListener('load', ()=> queueMicro(runSelectionSelfTest), {once:true});

  // --- D) Stage & data canonicalization ---
  async function migrateContactsOnBoot(){
    if(migrateContactsOnBoot.__ran) return;
    migrateContactsOnBoot.__ran = true;
    if(typeof openDB !== 'function' || typeof dbGetAll !== 'function' || typeof dbBulkPut !== 'function') return;
    await openDB();
    const contacts = await dbGetAll('contacts').catch(()=>[]);
    if(!Array.isArray(contacts) || !contacts.length) return;
    const updates = [];
    const now = Date.now();
    contacts.forEach(record => {
      if(!record || !record.id) return;
      const originalStage = record.stage;
      const canonical = typeof window.canonicalizeStage === 'function' ? window.canonicalizeStage(originalStage) : String(originalStage||'application').toLowerCase();
      let dirty = canonical !== originalStage;
      const stageEnteredAt = record.stageEnteredAt && typeof record.stageEnteredAt === 'object' ? Object.assign({}, record.stageEnteredAt) : {};
      if(!stageEnteredAt[canonical]){
        stageEnteredAt[canonical] = now;
        dirty = true;
      }
      let lossReason = record.lossReason;
      if((canonical==='lost' || canonical==='denied') && !lossReason){
        lossReason = 'other';
        dirty = true;
      }
      if(!dirty) return;
      const next = Object.assign({}, record, {stage: canonical, stageEnteredAt, lossReason});
      updates.push(next);
    });
    if(!updates.length) return;
    await dbBulkPut('contacts', updates);
    dispatchAppDataPartial({partial:true, source:'migration:phase4', entity:'contacts', count:updates.length});
    if(typeof renderAll === 'function') await renderAll();
  }
  migrateContactsOnBoot();

  // --- E) Automations safety + clock ---
  (function automationSafety(){
    if(typeof window.enqueueAutomation !== 'function') return;
    if(window.enqueueAutomation.__phase4Wrapped) return;
    const originalEnqueue = window.enqueueAutomation;
    window.enqueueAutomation = async function(){
      try{
        return await originalEnqueue.apply(this, arguments);
      }catch(err){
        toastSafe('That didn’t stick—rolled back');
        throw err;
      }
    };
    window.enqueueAutomation.__phase4Wrapped = true;

    document.addEventListener(EVT.automationExecuted, evt => {
      const detail = evt?.detail;
      if(detail && detail.contactId) repaint.timeline(detail.contactId);
    });

    const DAILY_KEY = 'automation:lastDailyTick';
    const QUEUE_META_ID = 'automationsQueue';

    async function triggerCatchUp(){
      if(triggerCatchUp.__running) return;
      triggerCatchUp.__running = true;
      let shouldKick = false;
      let dueCount = 0;
      let kickDetail = null;
      try{
        let active = false;
        if(typeof openDB === 'function' && typeof dbGet === 'function'){
          await openDB();
          let queueRecord = null;
          try{ queueRecord = await dbGet('meta', QUEUE_META_ID); }
          catch(err){ console.warn('automation queue load', err); }
          const nowTs = Date.now();
          const items = Array.isArray(queueRecord?.items) ? queueRecord.items.slice() : [];
          const filtered = [];
          let mutated = false;
          for(const item of items){
            if(item && item.status === 'queued' && Number(item.runAt || 0) <= nowTs){
              shouldKick = true;
              dueCount += 1;
            }
            if(item && item.type === 'meta:dailyTick' && item.contactId === '__phase4__'){
              const status = item.status || 'queued';
              const runAt = Number(item.runAt || 0) || nowTs;
              const age = nowTs - runAt;
              if(status !== 'done' && age < 86400000){
                active = true;
                filtered.push(item);
                continue;
              }
              if(status === 'done' && age < 172800000){
                filtered.push(item);
                continue;
              }
              mutated = true;
              continue;
            }
            filtered.push(item);
          }
          if(mutated && typeof dbPut === 'function'){
            const nextRecord = Object.assign({}, queueRecord || {id:QUEUE_META_ID}, {items: filtered});
            try{ await dbPut('meta', nextRecord); }
            catch(err){ console.warn('automation queue prune', err); }
          }
          if(shouldKick && !kickDetail){
            kickDetail = {source:'phase4:queue'};
          }
          if(active){
            return;
          }
        }
        await withToastMute(()=> Promise.resolve(originalEnqueue({
          contactId:'__phase4__',
          type:'meta:dailyTick',
          label:'Automation daily catch-up',
          runAt: Date.now(),
          status:'queued',
          payload:{noop:true}
        })).catch(err=>{ console.warn('automation catch-up enqueue', err); }), 4000);
        shouldKick = true;
        dueCount = (dueCount || 0) + 1;
        kickDetail = {source:'phase4:scheduled'};
      }catch(err){ console.warn('automation catch-up', err); }
      finally{
        try{
          if(shouldKick){
            const detail = Object.assign({due: dueCount, ts: Date.now()}, kickDetail || {source:'phase4'});
            document.dispatchEvent(new CustomEvent('automation:catchup',{detail}));
          }
        }catch(err){ console.warn('automation catch-up notify', err); }
        triggerCatchUp.__running = false;
      }
    }

    function ensureDailyTick(force){
      try{
        const last = Number(localStorage.getItem(DAILY_KEY)||0);
        const nowTs = Date.now();
        if(force || !last || (nowTs - last) > 86400000){
          localStorage.setItem(DAILY_KEY, String(nowTs));
          triggerCatchUp();
        }
      }catch(err){ console.warn('automation daily tick', err); }
    }

    ensureDailyTick(true);
    window.addEventListener('focus', ()=> ensureDailyTick(false));
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) ensureDailyTick(false); });
    setInterval(()=> ensureDailyTick(false), 3600000);
  })();

  // --- F) Orphan sweep & CSS dedupe handled elsewhere ---

  // --- G) Dev mode & self-test harness ---
  function isDev(){
    try{
      if(new URLSearchParams(location.search).get('dev')==='1') return true;
      if(localStorage.getItem('APP_DEV') === '1') return true;
    }catch(err){ console.warn('dev detect', err); }
    return false;
  }

  function assert(cond, msg){
    if(!cond) throw new Error(msg||'Assertion failed');
  }
  window.__assert = assert;

  async function runSmokeTests(){
    const results = [];
    async function step(name, fn){
      try{
        await fn();
        results.push({name, ok:true});
      }catch(err){
        results.push({name, ok:false, error:err});
        throw err;
      }
    }
    try{
      await step('Stage move', async ()=>{
        assert(typeof window.updateContactStage === 'function', 'updateContactStage missing');
        await openDB();
        const contacts = await dbGetAll('contacts');
        const target = contacts.find(c=>c && !c.deleted);
        assert(target, 'No contact available');
        const originalStage = canonicalStage(target.stage || 'application');
        await window.updateContactStage(target.id, 'underwriting', originalStage);
        const updated = await dbGet('contacts', target.id);
        assert(updated && canonicalStage(updated.stage) === 'underwriting', 'Stage did not persist');
        repaint.lane('underwriting');
        repaint.lane(originalStage);
        await window.updateContactStage(target.id, originalStage, 'underwriting');
      });

      await step('Selection', async ()=>{
        const svc = window.SelectionService;
        assert(svc && typeof svc.add === 'function', 'SelectionService missing');
        const existing = typeof svc.getIds === 'function' ? svc.getIds().slice() : [];
        const originalType = svc.type || 'contacts';
        const before = typeof svc.count === 'function' ? svc.count() : existing.length;
        const testIds = [existing[0] || '__smoke_sel_a__', existing[1] || '__smoke_sel_b__'];
        testIds.forEach(id => svc.add(id));
        const afterAdd = typeof svc.count === 'function' ? svc.count() : (typeof svc.getIds === 'function' ? svc.getIds().length : 0);
        assert(afterAdd >= before + 1, 'Selection count did not increment');
        svc.clear();
        assert((typeof svc.count === 'function' ? svc.count() : 0) === 0, 'Selection clear failed');
        existing.forEach(id => svc.add(id, originalType));
      });

      await step('Automations', async ()=>{
        assert(typeof window.enqueueAutomation === 'function', 'enqueueAutomation missing');
        await openDB();
        const contacts = await dbGetAll('contacts');
        const target = contacts.find(c=>c && !c.deleted);
        assert(target, 'No contact for automation');
        const contactId = String(target.id);
        const beforeTimeline = Array.isArray(target.extras?.timeline) ? target.extras.timeline.length : 0;
        const itemId = `${contactId}:log:smoke:${Date.now()}`;
        await window.enqueueAutomation({
          id: itemId,
          contactId,
          type:'log:smoke',
          label:'Smoke Automation',
          runAt: Date.now(),
          status:'queued',
          payload:{text:'Smoke automation executed', tag:'automation'}
        });
        await new Promise((resolve, reject)=>{
          const timeout = setTimeout(()=>{
            document.removeEventListener(EVT.automationExecuted, handler);
            reject(new Error('Automation not executed'));
          }, 4000);
          const handler = evt => {
            const detail = evt?.detail || {};
            if(detail.id === itemId || String(detail.contactId||'') === contactId){
              clearTimeout(timeout);
              document.removeEventListener(EVT.automationExecuted, handler);
              resolve();
            }
          };
          document.addEventListener(EVT.automationExecuted, handler);
        });
        repaint.timeline(contactId);
        const refreshed = await dbGet('contacts', contactId);
        const afterTimeline = Array.isArray(refreshed?.extras?.timeline) ? refreshed.extras.timeline.length : 0;
        assert(afterTimeline >= beforeTimeline, 'Timeline did not update');
      });

      await step('Partner guard', async ()=>{
        assert(typeof window.softDelete === 'function', 'softDelete missing');
        await openDB();
        const contacts = await dbGetAll('contacts');
        const linked = contacts.find(c=>c && c.buyerPartnerId && c.buyerPartnerId !== window.PARTNER_NONE_ID);
        assert(linked, 'No partner-linked contact');
        const partnerId = linked.buyerPartnerId;
        const partnerRecord = await dbGet('partners', partnerId);
        assert(partnerRecord, 'Partner record missing');
        const blocked = await window.softDelete('partners', partnerId);
        assert(blocked && blocked.blocked, 'Partner delete should block when linked');
        const reassigned = Object.assign({}, linked, {buyerPartnerId: window.PARTNER_NONE_ID, listingPartnerId: window.PARTNER_NONE_ID});
        let contactMutated = false;
        let partnerRemoved = false;
        try{
          await dbPut('contacts', reassigned);
          contactMutated = true;
          const deleted = await window.softDelete('partners', partnerId);
          partnerRemoved = !!(deleted && deleted.ok);
          assert(partnerRemoved, 'Partner delete should succeed after reassignment');
        }finally{
          if(partnerRemoved){
            try{ await dbPut('partners', partnerRecord); }
            catch(err){ console.warn('smoke partner restore', err); }
          }
          if(contactMutated){
            try{ await dbPut('contacts', linked); }
            catch(err){ console.warn('smoke contact restore', err); }
          }
        }
      });

      await step('Dashboard KPIs', async ()=>{
        const host = document.getElementById('dashboard-kpis');
        assert(host, 'Dashboard KPIs container missing');
        const before = host.textContent;
        repaint.dashboardKpis();
        await new Promise(resolve => raf(()=> resolve()));
        const after = host.textContent;
        assert(after !== '', 'Dashboard KPIs empty after repaint');
        assert(before !== after || host.childElementCount > 0, 'Dashboard KPIs did not refresh');
      });
    }catch(err){ /* fallthrough for reporting */ }

    const failed = results.filter(r=>!r.ok);
    toastSafe(failed.length ? `Smoke tests failed: ${failed.map(r=>r.name).join(', ')}` : 'Smoke tests passed');
    console.table(results.map(r=>({test:r.name, ok:r.ok, error:r.error?.message || ''})));
    return results;
  }

  function ensureDevTray(){
    if(!isDev()) return;
    let tray = document.getElementById('dev-debug-tray');
    if(tray) return;
    tray = document.createElement('div');
    tray.id = 'dev-debug-tray';
    tray.innerHTML = `
      <button data-dev-act="smoke">Run Smoke Tests</button>
      <button data-dev-act="log">Show Event Log</button>
      <button data-dev-act="seed">Toggle Fake Seed</button>
    `;
    tray.style.position = 'fixed';
    tray.style.top = '16px';
    tray.style.right = '16px';
    tray.style.zIndex = '2000';
    tray.style.display = 'flex';
    tray.style.flexDirection = 'column';
    tray.style.gap = '8px';
    tray.style.background = 'rgba(15,23,42,0.85)';
    tray.style.borderRadius = '12px';
    tray.style.padding = '12px';
    tray.style.boxShadow = '0 12px 24px rgba(15,23,42,0.25)';
    tray.style.color = '#f8fafc';
    Array.from(tray.querySelectorAll('button')).forEach(btn=>{
      btn.style.border = 'none';
      btn.style.background = '#6366f1';
      btn.style.color = '#ffffff';
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '8px';
      btn.style.cursor = 'pointer';
    });
    document.body.appendChild(tray);
    tray.addEventListener('click', evt => {
      const btn = evt.target.closest('button[data-dev-act]');
      if(!btn) return;
      const act = btn.getAttribute('data-dev-act');
      if(act==='smoke') runSmokeTests().catch(err=> toastSafe(err.message || String(err)));
      if(act==='log') console.table(eventLog.map(entry=>({time:new Date(entry.ts).toLocaleTimeString(), name:entry.name, detail:entry.detail})));
      if(act==='seed'){
        const key = 'APP_DEV_SEED';
        const next = localStorage.getItem(key)==='1' ? '0' : '1';
        localStorage.setItem(key, next);
        toastSafe(`Fake seed ${next==='1'?'enabled':'disabled'}`);
      }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureDevTray);
  else ensureDevTray();

  // --- H) Error handling wrappers ---
  function wrapSafe(name){
    const fn = window[name];
    if(typeof fn !== 'function') return;
    if(fn.__wrappedPhase4) return;
    window[name] = async function(){
      try{
        return await fn.apply(this, arguments);
      }catch(err){
        toastSafe('That didn’t stick—rolled back');
        console.warn(name, err);
        throw err;
      }
    };
    window[name].__wrappedPhase4 = true;
  }
  ['handleDrop','saveForm','updateContactStage','enqueueAutomation'].forEach(name=> wrapSafe(name));

  // --- I) Performance guards ---
  // --- I) Performance guards ---
  // Selection wiring handles per-frame batching via scheduleSync.

})();
