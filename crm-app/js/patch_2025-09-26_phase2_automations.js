// patch_2025-09-26_phase2_automations.js — Phase 2 automations engine + timeline
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.patch_2025_09_26_phase2_automations) return;
  window.__INIT_FLAGS__.patch_2025_09_26_phase2_automations = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_2025-09-26_phase2_automations.js')){
    window.__PATCHES_LOADED__.push('/js/patch_2025-09-26_phase2_automations.js');
  }

  const DAY_MS = 86400000;
  const SIX_HOURS_MS = 21600000;
  const QUEUE_META_ID = 'automationsQueue';
  const PARTNER_NONE_ID = window.PARTNER_NONE_ID || window.NONE_PARTNER_ID || '00000000-0000-none-partner-000000000000';

  let OWNER_SIGNATURE = 'Your mortgage team';
  let ownerSignatureLoading = null;

  function applySignatureCache(cache){
    if(!cache || !Array.isArray(cache.items) || !cache.items.length){
      OWNER_SIGNATURE = 'Your mortgage team';
      return false;
    }
    const items = cache.items.map(item => ({
      id: String(item && item.id != null ? item.id : ''),
      body: String(item && item.body != null ? item.body : ''),
      title: String(item && item.title != null ? item.title : '')
    }));
    const defaultId = items.some(item => item.id === cache.defaultId)
      ? cache.defaultId
      : (items[0] ? items[0].id : null);
    const row = items.find(item => item.id === defaultId) || items[0];
    if(row && row.body){
      OWNER_SIGNATURE = row.body;
      return true;
    }
    return false;
  }

  function primeOwnerSignatureFromWindow(){
    try{ if(applySignatureCache(window.__SIGNATURE_CACHE__)) return true; }
    catch(_){ }
    return false;
  }

  async function refreshOwnerSignature(){
    if(ownerSignatureLoading) return ownerSignatureLoading;
    ownerSignatureLoading = (async ()=>{
      if(primeOwnerSignatureFromWindow()) return;
      try{
        if(window.Settings && typeof window.Settings.get === 'function'){
          const data = await window.Settings.get();
          if(data && data.signature){
            applySignatureCache(data.signature);
          }
        }else if(typeof openDB === 'function' && typeof dbGetAll === 'function'){
          await openDB();
          const settings = await dbGetAll('settings');
          const rec = Array.isArray(settings) ? settings.find(s => s && s.id === 'signatures') : null;
          if(rec && Array.isArray(rec.items) && rec.items.length){
            applySignatureCache({ items: rec.items, defaultId: rec.defaultId });
          }
        }
      }catch(err){ console && console.warn && console.warn('owner signature load', err); }
    })();
    try{ await ownerSignatureLoading; }
    finally{ ownerSignatureLoading = null; }
  }

  primeOwnerSignatureFromWindow();
  refreshOwnerSignature();

  const state = {
    contacts: new Map(),
    partners: new Map(),
    queue: new Map(),
    queueLoaded: false,
    processing: false,
    openTimelines: new Map(),
    modalState: new Map()
  };

  const changeScopes = [];
  const changeScopeStacks = new Map();

  function scopeKeyForDetail(detail){
    if(!detail) return null;
    if(detail.contactId!=null) return `contact:${String(detail.contactId)}`;
    if(detail.id!=null) return `id:${String(detail.id)}`;
    return null;
  }

  function dispatchChange(detail){
    const payload = Object.assign({}, detail || {});
    if(!payload.source) payload.source = 'automations';
    document.dispatchEvent(new CustomEvent('app:data:changed',{detail:payload}));
  }

  function normalizeChange(detail){
    if(!detail) return null;
    const normalized = Object.assign({}, detail);
    if(!normalized.source) normalized.source = 'automations';
    if(normalized.contactId!=null) normalized.contactId = String(normalized.contactId);
    if(normalized.id!=null) normalized.id = String(normalized.id);
    return normalized;
  }

  function unifyContactId(list){
    if(!Array.isArray(list) || !list.length) return null;
    const first = list[0].contactId || list[0].id || null;
    if(!first) return null;
    const key = String(first);
    for(const entry of list){
      const current = entry && (entry.contactId || entry.id);
      if(!current || String(current) !== key) return null;
    }
    return key;
  }

  function flushChanges(bucket, baseDetail, collector){
    const list = Array.isArray(bucket) ? bucket.filter(Boolean) : [];
    const emit = (detail) => {
      if(!detail) return;
      const payload = Object.assign({}, detail);
      if(typeof collector === 'function') collector(payload);
      else dispatchChange(payload);
    };
    if(!list.length){
      if(baseDetail){
        const payload = normalizeChange(baseDetail);
        if(payload) emit(payload);
      }
      return;
    }
    if(!baseDetail){
      if(list.length === 1){
        emit(list[0]);
        return;
      }
      const combined = {
        action: 'batch',
        actions: list.map(entry => Object.assign({}, entry))
      };
      const contactId = unifyContactId(list);
      if(contactId) combined.contactId = contactId;
      emit(combined);
      return;
    }
    const payload = normalizeChange(baseDetail) || {source:'automations'};
    const actions = list.map(entry => Object.assign({}, entry));
    payload.actions = actions;
    if(!payload.action){
      payload.action = actions.length === 1 ? actions[0].action : 'batch';
    }
    if(!payload.contactId){
      const contactId = unifyContactId(actions);
      if(contactId) payload.contactId = contactId;
    }
    emit(payload);
  }

  function recordChange(detail){
    const normalized = normalizeChange(detail);
    if(!normalized) return;
    const key = scopeKeyForDetail(normalized);
    if(key){
      const scopedStack = changeScopeStacks.get(key);
      if(scopedStack && scopedStack.length){
        scopedStack[scopedStack.length-1].bucket.push(normalized);
        return;
      }
    }
    if(changeScopes.length){
      changeScopes[changeScopes.length-1].bucket.push(normalized);
      return;
    }
    dispatchChange(normalized);
  }

  async function withChangeScope(baseDetail, fn, options){
    const opts = options && typeof options === 'object' ? options : {};
    const bucket = [];
    const scope = {
      bucket,
      key: scopeKeyForDetail(baseDetail),
      collector: typeof opts.collector === 'function' ? opts.collector : null
    };
    changeScopes.push(scope);
    if(scope.key){
      const scopedStack = changeScopeStacks.get(scope.key);
      if(scopedStack){
        scopedStack.push(scope);
      }else{
        changeScopeStacks.set(scope.key, [scope]);
      }
    }
    try{
      return await fn();
    }finally{
      const index = changeScopes.lastIndexOf(scope);
      if(index !== -1) changeScopes.splice(index, 1);
      if(scope.key){
        const scopedStack = changeScopeStacks.get(scope.key);
        if(scopedStack){
          const scopedIndex = scopedStack.lastIndexOf(scope);
          if(scopedIndex !== -1) scopedStack.splice(scopedIndex, 1);
          if(!scopedStack.length) changeScopeStacks.delete(scope.key);
        }
      }
      flushChanges(bucket, baseDetail, scope.collector);
    }
  }

  function pickAction(detail, action){
    if(!detail || !action) return null;
    if(detail.action === action) return detail;
    if(Array.isArray(detail.actions)){
      for(const entry of detail.actions){
        if(entry && entry.action === action) return entry;
      }
    }
    return null;
  }

  const toastSafe = (msg)=>{
    try{
      if(typeof window.toast === 'function') window.toast(msg);
      else console.log('[automations]', msg);
    }catch(err){ console.log('[automations]', msg); }
  };

  const canonicalStage = (value)=>{
    const fn = typeof window.canonicalizeStage === 'function'
      ? window.canonicalizeStage
      : (val)=> String(val==null?'':val).trim().toLowerCase();
    return fn(value);
  };

  const stageLabels = {
    lead: 'Lead',
    'pre-app': 'Pre-App',
    preapproved: 'Pre-App',
    'preapproved-lead': 'Pre-App',
    application: 'Application',
    processing: 'Processing',
    underwriting: 'Underwriting',
    approved: 'Approved',
    'cleared-to-close': 'Cleared to Close',
    ctc: 'Cleared to Close',
    funded: 'Funded',
    'post-close': 'Post-Close',
    nurture: 'Nurture'
  };

  const escapeHtml = (value)=> String(value==null?'':value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  const formatDate = (ts)=>{
    if(!ts && ts!==0) return '';
    const date = ts instanceof Date ? ts : new Date(Number(ts));
    if(Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  };

  const toYMD = (date)=>{
    if(!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if(Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  };

  const ensureExtras = (contact)=>{
    if(!contact) return contact;
    contact.extras = contact.extras && typeof contact.extras === 'object' ? contact.extras : {};
    if(!Array.isArray(contact.extras.timeline)) contact.extras.timeline = [];
    return contact;
  };

  const ensurePlaybookDefaults = (contact)=>{
    if(!contact) return {record:contact, changed:false};
    let changed = false;
    if(contact.pbNewLead === undefined){ contact.pbNewLead = true; changed = true; }
    if(contact.pbMilestones === undefined){ contact.pbMilestones = true; changed = true; }
    if(contact.pbPostClose === undefined){ contact.pbPostClose = true; changed = true; }
    ensureExtras(contact);
    return {record:contact, changed};
  };

  async function ensureContactRecord(id){
    if(!id && id!==0) return null;
    const key = String(id);
    if(state.contacts.has(key)) return state.contacts.get(key);
    if(typeof openDB !== 'function' || typeof dbGet !== 'function') return null;
    await openDB();
    const record = await dbGet('contacts', key);
    if(!record) return null;
    const {record:withDefaults, changed} = ensurePlaybookDefaults(Object.assign({}, record));
    if(changed && typeof dbPut === 'function'){
      try{ await dbPut('contacts', withDefaults); }
      catch(err){ console && console.warn && console.warn('automations default update', err); }
    }
    state.contacts.set(key, withDefaults);
    return withDefaults;
  }

  function upsertContact(contact){
    if(!contact || contact.id==null) return contact;
    const copy = Object.assign({}, contact);
    ensurePlaybookDefaults(copy);
    state.contacts.set(String(copy.id), copy);
    return copy;
  }

  async function ensurePartnerRecord(id){
    if(!id && id!==0) return null;
    const key = String(id);
    if(!key || key===PARTNER_NONE_ID) return null;
    if(state.partners.has(key)) return state.partners.get(key);
    if(typeof openDB !== 'function' || typeof dbGet !== 'function') return null;
    await openDB();
    const record = await dbGet('partners', key);
    if(record) state.partners.set(key, record);
    return record || null;
  }

  async function ensureQueueLoaded(){
    if(state.queueLoaded) return state.queue;
    if(typeof openDB !== 'function' || typeof dbGet !== 'function') return state.queue;
    await openDB();
    let record = null;
    try{ record = await dbGet('meta', QUEUE_META_ID); }
    catch(err){ console && console.warn && console.warn('load queue', err); }
    const items = Array.isArray(record && record.items) ? record.items : [];
    state.queue.clear();
    for(const item of items){
      if(!item || !item.id) continue;
      const normalized = Object.assign({}, item);
      normalized.contactId = String(normalized.contactId||'');
      normalized.status = normalized.status === 'done' || normalized.status === 'canceled' ? normalized.status : 'queued';
      normalized.runAt = Number(normalized.runAt||0) || Date.now();
      normalized.createdAt = Number(normalized.createdAt||0) || normalized.runAt;
      if(normalized.completedAt) normalized.completedAt = Number(normalized.completedAt);
      if(normalized.canceledAt) normalized.canceledAt = Number(normalized.canceledAt);
      normalized.payload = normalized.payload && typeof normalized.payload === 'object' ? normalized.payload : {};
      normalized.label = normalized.label || normalized.type || 'Automation';
      state.queue.set(String(normalized.id), normalized);
    }
    state.queueLoaded = true;
    return state.queue;
  }

  async function persistQueue(){
    if(typeof dbPut !== 'function') return;
    await ensureQueueLoaded();
    const ordered = Array.from(state.queue.values()).sort((a,b)=>{
      return (a.runAt||0) - (b.runAt||0) || (a.createdAt||0) - (b.createdAt||0);
    });
    const payload = { id: QUEUE_META_ID, items: ordered };
    try{ await dbPut('meta', payload); }
    catch(err){ console && console.warn && console.warn('persist queue', err); }
  }

  function queueItemsForContact(contactId){
    const key = String(contactId||'');
    const list = [];
    state.queue.forEach(item => { if(item && String(item.contactId||'')===key) list.push(item); });
    return list;
  }

  async function enqueueItems(contact, defs){
    const contactId = contact && contact.id ? String(contact.id) : null;
    if(!contactId || !Array.isArray(defs) || !defs.length) return {queued:0};
    await ensureQueueLoaded();
    let added = 0;
    const now = Date.now();
    for(const def of defs){
      if(!def || !def.type) continue;
      const runAtRaw = def.runAt!=null ? def.runAt : now;
      const runAt = typeof runAtRaw === 'number' ? runAtRaw : Date.parse(runAtRaw);
      const ts = Number.isNaN(runAt) ? now : runAt;
      const typeKey = def.type;
      const id = `${contactId}:${typeKey}:${ts}`;
      if(state.queue.has(id)) continue;
      const item = {
        id,
        contactId,
        type: typeKey,
        runAt: ts,
        payload: def.payload && typeof def.payload === 'object' ? def.payload : {},
        status: 'queued',
        createdAt: now,
        label: def.label || typeKey,
        meta: def.meta && typeof def.meta === 'object' ? def.meta : {}
      };
      state.queue.set(id, item);
      added++;
    }
    if(added){
      await persistQueue();
      toastSafe(`Queued ${added} automation${added===1?'':'s'} for ${contact.first||contact.last||contact.name||'contact'}`);
      refreshTimeline(contactId);
      Promise.resolve().then(()=> runDueProcessing());
    }
    return {queued:added};
  }

  function contactName(contact){
    if(!contact) return '';
    const first = contact.first || '';
    const last = contact.last || '';
    const name = `${first} ${last}`.trim();
    return name || contact.name || contact.email || 'Contact';
  }

  function contactFirst(contact){
    if(!contact) return '';
    if(contact.first) return contact.first;
    if(contact.name) return String(contact.name).split(' ')[0];
    return '';
  }

  function ownerSignature(){
    primeOwnerSignatureFromWindow();
    return OWNER_SIGNATURE;
  }

  function newLeadEmailTemplate(contact){
    const first = contactFirst(contact) || 'there';
    return {
      subject: 'Welcome — let’s get started',
      body: `Hi ${first},\n\nGreat connecting! I’m excited to help you move forward. I’ll follow up with next steps soon, and you can reply here with any questions.\n\nTalk soon,\n${ownerSignature()}`
    };
  }

  function newLeadFollowupTask(contact){
    return {
      title: 'Follow up on new lead',
      due: toYMD(new Date(Date.now() + DAY_MS))
    };
  }

  function milestoneEmailTemplate(contact, stage){
    const label = stageLabels[stage] || stageLabels[canonicalStage(stage)] || (stage ? String(stage).replace(/\b\w/g, ch=>ch.toUpperCase()) : 'Pipeline');
    const first = contactFirst(contact) || 'there';
    return {
      subject: `Update: we\'ve reached ${label}`,
      body: `Hi ${first},\n\nQuick update — we\'re now at the ${label} stage. I\'ll keep you posted on what comes next and let you know if I need anything.\n\nThank you,\n${ownerSignature()}`,
      label: `Milestone — ${label}`
    };
  }

  function milestonePartnerTemplate(contact, stage, partner){
    const label = stageLabels[stage] || stageLabels[canonicalStage(stage)] || (stage ? String(stage).replace(/\b\w/g, ch=>ch.toUpperCase()) : 'Pipeline');
    const name = contactName(contact);
    const partnerName = partner && (partner.name || partner.company) ? `${partner.name || partner.company}` : 'Partner';
    return {
      subject: `Update on ${name} — ${label}`,
      body: `Hi ${partnerName},\n\nHeads up that ${name} just moved to the ${label} stage. I\'ll keep you in the loop on next steps.\n\nThanks!`,
      label: `Partner update — ${label}`
    };
  }

  function postCloseTaskTemplates(contact, fundedDate){
    const base = fundedDate instanceof Date ? fundedDate : new Date(fundedDate);
    if(Number.isNaN(base.getTime())) return [];
    const first = contactFirst(contact) || contactName(contact);
    const checkpoints = [
      {offset:30, key:'30', title:`Check-in with ${first}`},
      {offset:180, key:'180', title:`Mid-year check on ${first}`},
      {offset:365, key:'365', title:`Annual review reminder for ${first}`}
    ];
    return checkpoints.map(entry=>{
      const dueDate = new Date(base.getTime() + entry.offset * DAY_MS);
      return {
        type:`task:postClose:${entry.key}`,
        label:`Post-close ${entry.key}-day check-in`,
        runAt: dueDate.getTime(),
        payload:{
          title: entry.title,
          due: toYMD(dueDate)
        }
      };
    });
  }

  async function logHistory(contactId, text, tag){
    const contact = await ensureContactRecord(contactId);
    if(!contact) return null;
    ensureExtras(contact);
    const whenIso = new Date().toISOString();
    const entry = {
      id: `hist:${Date.now()}:${Math.random().toString(16).slice(2,8)}`,
      when: whenIso,
      text,
      tag: tag || 'automation'
    };
    contact.extras.timeline.push(entry);
    contact.updatedAt = Date.now();
    if(typeof dbPut === 'function'){
      try{ await dbPut('contacts', contact); }
      catch(err){ console && console.warn && console.warn('logHistory dbPut', err); }
    }
    upsertContact(contact);
    recordChange({action:'history', contactId:String(contactId)});
    refreshTimeline(contactId);
    return entry;
  }

  async function createTask(contactId, payload){
    if(typeof openDB !== 'function' || typeof dbPut !== 'function') return null;
    await openDB();
    const now = Date.now();
    const dueStr = toYMD(payload && payload.due);
    const title = payload && payload.title ? payload.title : 'Follow up';
    const id = payload && payload.id ? String(payload.id) : `auto-task-${contactId}-${now}`;
    const task = {
      id,
      contactId: String(contactId),
      title,
      due: dueStr || '',
      status: 'open',
      createdAt: now,
      updatedAt: now,
      origin: 'automation'
    };
    try{ await dbPut('tasks', task); }
    catch(err){ console && console.warn && console.warn('createTask', err); throw err; }
    recordChange({action:'task', contactId:String(contactId)});
    return task;
  }

  function ensureEmailModal(){
    let modal = document.getElementById('email-compose-modal');
    if(modal) return modal;
    modal = document.createElement('dialog');
    modal.id = 'email-compose-modal';
    modal.className = 'record-modal';
    modal.innerHTML = '<div class="dlg">\n      <div class="modal-header"><strong>Email Compose</strong><button type="button" class="btn" data-close>Close</button></div>\n      <div class="dialog-scroll"><div class="modal-body">\n        <label>To<input type="text" data-field="to" readonly></label>\n        <label>Subject<input type="text" data-field="subject"></label>\n        <label>Body<textarea data-field="body"></textarea></label>\n      </div></div>\n      <div class="modal-footer">\n        <button class="btn" type="button" data-open-mail>Open in default mail</button>\n        <button class="btn brand" type="button" data-copy>Copy to clipboard</button>\n      </div>\n    </div>';
    modal.addEventListener('click', (evt)=>{
      if(evt.target && evt.target.closest('[data-close]')){
        evt.preventDefault();
        try{ modal.close(); }
        catch(_){ modal.removeAttribute('open'); modal.style.display='none'; }
      }
    });
    modal.addEventListener('close', ()=>{ modal.removeAttribute('open'); modal.style.display='none'; });
    modal.addEventListener('click', (evt)=>{
      const btnOpen = evt.target && evt.target.closest('[data-open-mail]');
      if(btnOpen){
        evt.preventDefault();
        const href = modal.dataset.mailto || '';
        if(href){
          try{ window.location.href = href; }
          catch(_){ window.open(href, '_self'); }
        }
      }
      const btnCopy = evt.target && evt.target.closest('[data-copy]');
      if(btnCopy){
        evt.preventDefault();
        const subject = modal.querySelector('[data-field="subject"]').value || '';
        const body = modal.querySelector('[data-field="body"]').value || '';
        const text = `Subject: ${subject}\n\n${body}`;
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(text).then(()=> toastSafe('Copied to clipboard'));
        }else{
          const textarea = document.createElement('textarea');
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          try{ document.execCommand('copy'); toastSafe('Copied to clipboard'); }
          catch(_){ toastSafe('Copy failed — select text manually.'); }
          document.body.removeChild(textarea);
        }
      }
    });
    document.body.appendChild(modal);
    return modal;
  }

  function showEmailModal({to, subject, body, href}){
    const modal = ensureEmailModal();
    modal.dataset.mailto = href || '';
    const toField = modal.querySelector('[data-field="to"]');
    const subjField = modal.querySelector('[data-field="subject"]');
    const bodyField = modal.querySelector('[data-field="body"]');
    if(toField) toField.value = to || '';
    if(subjField) subjField.value = subject || '';
    if(bodyField) bodyField.value = body || '';
    modal.style.display = 'block';
    try{ modal.showModal(); }
    catch(_){ modal.setAttribute('open',''); }
  }

  function prepEmail(to, subject, body){
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if(!recipients.length){ toastSafe('Missing email recipient'); return; }
    const toStr = recipients.join(',');
    const subj = subject || '';
    const content = body || '';
    const href = `mailto:${encodeURIComponent(toStr)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(content)}`;
    try{
      if(typeof window.open === 'function'){ window.open(href, '_self'); }
      else window.location.href = href;
    }catch(err){
      try{ window.location.href = href; }
      catch(_err){ console && console.warn && console.warn('mailto fallback', err); }
    }
    showEmailModal({to:toStr, subject:subj, body:content, href});
  }

  async function executeQueueItem(item){
    if(!item || item.status!=='queued') return false;
    const contactId = String(item.contactId||'');
    const now = Date.now();
    try{
      if(item.type && item.type.startsWith('email:')){
        const payload = item.payload || {};
        const to = payload.to || [];
        const subject = payload.subject || '';
        const body = payload.body || '';
        prepEmail(to, subject, body);
      }else if(item.type && item.type.startsWith('task:')){
        await createTask(contactId, item.payload || {});
      }else if(item.type && item.type.startsWith('log:')){
        const payload = item.payload || {};
        await logHistory(contactId, payload.text || 'Timeline entry', payload.tag || 'automation');
      }
      item.status = 'done';
      item.completedAt = now;
      toastSafe(`Executed: ${item.label || item.type}`);
      refreshTimeline(contactId);
      return true;
    }catch(err){
      console && console.warn && console.warn('executeQueueItem', err);
      return false;
    }
  }

  async function runDueProcessing(){
    if(state.processing) return;
    await ensureQueueLoaded();
    const now = Date.now();
    const due = Array.from(state.queue.values()).filter(item=> item && item.status==='queued' && Number(item.runAt||0) <= now);
    if(!due.length) return;
    due.sort((a,b)=> (a.runAt||0) - (b.runAt||0));
    state.processing = true;
    try{
      await withChangeScope({action:'automation:run'}, async ()=>{
        for(let i=0;i<due.length;i++){
          await executeQueueItem(due[i]);
          if((i+1) % 25 === 0){
            await new Promise(resolve=>{
              if(typeof window.requestIdleCallback === 'function') window.requestIdleCallback(()=> resolve());
              else setTimeout(resolve, 0);
            });
          }
        }
      });
      await persistQueue();
    }finally{
      state.processing = false;
    }
  }

  function renderQueueEntry(item){
    const status = item.status || 'queued';
    const whenTs = status === 'done' ? (item.completedAt || item.runAt) : item.runAt;
    const whenLabel = formatDate(whenTs);
    if(status === 'queued'){
      const actions = [];
      if(item.type && item.type.startsWith('email:')) actions.push(`<button class="btn pill" data-queue-send="${escapeHtml(item.id)}">Send</button>`);
      actions.push(`<button class="btn pill" data-queue-cancel="${escapeHtml(item.id)}">Cancel</button>`);
      const actionHtml = actions.length ? ` — ${actions.join(' ')}` : '';
      return `<li data-entry="queue" data-id="${escapeHtml(item.id)}">Queued: ${escapeHtml(item.label||item.type)}${whenLabel?` (${escapeHtml(whenLabel)})`:''}${actionHtml}</li>`;
    }
    if(status === 'canceled'){
      return `<li data-entry="queue" data-id="${escapeHtml(item.id)}">Canceled: ${escapeHtml(item.label||item.type)}${whenLabel?` (${escapeHtml(whenLabel)})`:''}</li>`;
    }
    return `<li data-entry="queue" data-id="${escapeHtml(item.id)}">Sent: ${escapeHtml(item.label||item.type)}${whenLabel?` (${escapeHtml(whenLabel)})`:''}</li>`;
  }

  function renderHistoryEntry(entry){
    const when = entry && (entry.when || entry.date || entry.timestamp);
    const whenLabel = formatDate(when);
    const text = entry && entry.text ? entry.text : 'Timeline entry';
    return `<li data-entry="history">${escapeHtml(text)}${whenLabel?` (${escapeHtml(whenLabel)})`:''}</li>`;
  }

  async function renderContactTimeline(contactId){
    const key = String(contactId||'');
    const info = state.openTimelines.get(key);
    if(!info) return;
    const list = info.list;
    if(!list) return;
    await ensureQueueLoaded();
    const entries = [];
    const contact = await ensureContactRecord(contactId);
    if(contact && Array.isArray(contact.extras && contact.extras.timeline)){
      for(const entry of contact.extras.timeline){
        const when = entry && (entry.when || entry.date || entry.timestamp);
        const ts = when ? Date.parse(when) : Date.now();
        entries.push({kind:'history', ts:Number.isNaN(ts)?Date.now():ts, entry});
      }
    }
    const queueItems = queueItemsForContact(contactId);
    for(const item of queueItems){
      const when = item.status==='done' ? (item.completedAt || item.runAt) : item.runAt;
      entries.push({kind:'queue', ts: when || Date.now(), item});
    }
    entries.sort((a,b)=> (b.ts||0) - (a.ts||0));
    if(!entries.length){
      list.innerHTML = '<li class="muted">Timeline will fill in as automations run.</li>';
      return;
    }
    list.innerHTML = entries.map(row=>{
      if(row.kind==='queue') return renderQueueEntry(row.item);
      return renderHistoryEntry(row.entry);
    }).join('');
  }

  function refreshTimeline(contactId){
    Promise.resolve().then(()=> renderContactTimeline(contactId));
  }

  function ensureTimelineSection(body, contactId){
    const main = body.querySelector('.modal-main') || body;
    let section = main.querySelector('#contact-timeline');
    if(!section){
      section = document.createElement('section');
      section.id = 'contact-timeline';
      section.innerHTML = '<h4>Timeline</h4><ul class="timeline-list"></ul>';
      main.appendChild(section);
    }
    let list = section.querySelector('ul');
    if(!list){
      list = document.createElement('ul');
      section.appendChild(list);
    }
    section.dataset.contactId = String(contactId||'');
    state.openTimelines.set(String(contactId||''), {section, list});
    if(!section.__wired){
      section.__wired = true;
      section.addEventListener('click', async (evt)=>{
        const cancelBtn = evt.target && evt.target.closest('[data-queue-cancel]');
        if(cancelBtn){
          evt.preventDefault();
          const id = cancelBtn.getAttribute('data-queue-cancel');
          if(id){ await cancelQueueItem(id); }
          return;
        }
        const sendBtn = evt.target && evt.target.closest('[data-queue-send]');
        if(sendBtn){
          evt.preventDefault();
          const id = sendBtn.getAttribute('data-queue-send');
          if(id){ await sendQueueItem(id); }
        }
      });
    }
    return section;
  }

  function ensureAutomationsSection(body, context){
    const aside = body.querySelector('.modal-summary');
    if(!aside) return;
    let section = aside.querySelector('#contact-automations');
    if(!section){
      section = document.createElement('div');
      section.id = 'contact-automations';
      section.innerHTML = `
        <h4>Automations</h4>
        <label class="checkbox"><input type="checkbox" data-pb="newLead"> New Lead</label>
        <label class="checkbox"><input type="checkbox" data-pb="milestones"> Stage Milestones</label>
        <label class="checkbox"><input type="checkbox" data-pb="postClose"> Post-Close</label>
      `;
      aside.appendChild(section);
    }
    const newLead = section.querySelector('[data-pb="newLead"]');
    const milestones = section.querySelector('[data-pb="milestones"]');
    const postClose = section.querySelector('[data-pb="postClose"]');
    if(newLead) newLead.checked = context.pbNewLead !== false;
    if(milestones) milestones.checked = context.pbMilestones !== false;
    if(postClose) postClose.checked = context.pbPostClose !== false;
    if(!section.__wired){
      section.__wired = true;
      section.addEventListener('change', (evt)=>{
        const input = evt.target && evt.target.closest('input[data-pb]');
        if(!input) return;
        const key = input.getAttribute('data-pb');
        if(!key) return;
        const checked = !!input.checked;
        if(context){
          if(key==='newLead') context.pbNewLead = checked;
          if(key==='milestones') context.pbMilestones = checked;
          if(key==='postClose') context.pbPostClose = checked;
        }
      });
    }
  }

  async function cancelQueueItem(id){
    await ensureQueueLoaded();
    const item = state.queue.get(String(id));
    if(!item || item.status!=='queued') return;
    item.status = 'canceled';
    item.canceledAt = Date.now();
    await persistQueue();
    toastSafe('Automation canceled');
    refreshTimeline(item.contactId);
  }

  async function sendQueueItem(id){
    await ensureQueueLoaded();
    const item = state.queue.get(String(id));
    if(!item || item.status!=='queued') return;
    await executeQueueItem(item);
    await persistQueue();
  }

  async function queueNewLead(contact){
    if(!contact || contact.pbNewLead === false) return;
    const email = (contact.email || '').trim();
    const items = [];
    if(email){
      const template = newLeadEmailTemplate(contact);
      items.push({
        type:'email:newLead',
        label:'New Lead intro email',
        runAt: Date.now(),
        payload:{
          to: email,
          subject: template.subject,
          body: template.body
        }
      });
    }
    const task = newLeadFollowupTask(contact);
    items.push({
      type:'task:followup:newLead',
      label:'Follow-up task',
      runAt: new Date(task.due).getTime() || Date.now()+DAY_MS,
      payload:{
        title: task.title,
        due: task.due
      }
    });
    await enqueueItems(contact, items);
  }

  async function queueStageMilestone(contact, stage){
    if(!contact || contact.pbMilestones === false) return;
    const canonical = canonicalStage(stage || contact.stage);
    const items = [];
    const email = (contact.email || '').trim();
    const template = milestoneEmailTemplate(contact, canonical);
    if(email){
      items.push({
        type:`email:milestone:${canonical}`,
        label:`${template.label || 'Milestone email'}`,
        runAt: Date.now(),
        payload:{
          to: email,
          subject: template.subject,
          body: template.body
        }
      });
    }
    const partnerIds = [contact.buyerPartnerId, contact.listingPartnerId]
      .map(id => String(id||''))
      .filter(id => id && id !== PARTNER_NONE_ID);
    const seenEmails = new Set();
    for(const partnerId of partnerIds){
      const partner = await ensurePartnerRecord(partnerId);
      if(!partner || !partner.email) continue;
      const emailAddr = String(partner.email).trim();
      if(!emailAddr || seenEmails.has(emailAddr)) continue;
      seenEmails.add(emailAddr);
      const tpl = milestonePartnerTemplate(contact, canonical, partner);
      items.push({
        type:`email:milestone:partner:${partnerId}`,
        label:`Partner update — ${stageLabels[canonical] || canonical}`,
        runAt: Date.now(),
        payload:{
          to: emailAddr,
          subject: tpl.subject,
          body: tpl.body
        }
      });
    }
    if(items.length){ await enqueueItems(contact, items); }
    const label = stageLabels[canonical] || stageLabels[contact.stage] || (contact.stage || '').toString();
    await logHistory(contact.id, `Stage changed to ${label}`, 'stage');
  }

  async function queuePostClose(contact){
    if(!contact || contact.pbPostClose === false) return;
    const fundedDate = contact.fundedDate || contact.closingDate;
    if(!fundedDate) return;
    const templates = postCloseTaskTemplates(contact, fundedDate);
    if(!templates.length) return;
    await enqueueItems(contact, templates);
  }

  async function syncDocChecklist(contact){
    const result = {created:0, missingChanged:false};
    if(!contact || !contact.id) return result;
    if(typeof window.requiredDocsFor !== 'function') return result;
    let docList = null;
    try{
      const ensure = typeof window.ensureRequiredDocs === 'function'
        ? await window.ensureRequiredDocs(contact, {returnDetail:true})
        : null;
      if(ensure){
        if(typeof ensure.created === 'number') result.created = ensure.created;
        if(Array.isArray(ensure.docs)) docList = ensure.docs;
      }
    }catch(err){ console && console.warn && console.warn('sync docs ensure', err); }
    try{
      if(!Array.isArray(docList)){
        if(typeof openDB === 'function' && typeof dbGetAll === 'function'){
          await openDB();
          const docs = await dbGetAll('documents').catch(()=>[]);
          docList = (docs||[]).filter(doc => doc && String(doc.contactId) === String(contact.id));
        }else{
          docList = [];
        }
      }
      if(Array.isArray(docList) && typeof window.computeMissingDocsFrom === 'function'){
        const missing = await window.computeMissingDocsFrom(docList, contact.loanType);
        const normalized = typeof missing === 'string' ? missing : '';
        if((contact.missingDocs || '') !== normalized){
          contact.missingDocs = normalized;
          contact.updatedAt = Date.now();
          if(typeof dbPut === 'function'){
            try{
              await openDB();
              await dbPut('contacts', contact);
            }catch(err){ console && console.warn && console.warn('sync docs dbPut', err); }
          }
          result.missingChanged = true;
        }
      }
    }catch(err){ console && console.warn && console.warn('sync docs missing', err); }
    return result;
  }

  function buildModalContext(contactId, contact){
    const prevStage = contact ? canonicalStage(contact.stage) : null;
    return {
      id: contactId,
      pbNewLead: contact ? contact.pbNewLead !== false : true,
      pbMilestones: contact ? contact.pbMilestones !== false : true,
      pbPostClose: contact ? contact.pbPostClose !== false : true,
      prevStage,
      isNew: !contact
    };
  }

  function bridgeStageChange(detail){
    if(!detail) return;
    if(detail.source === 'kanban-dnd') return;
    const id = detail.contactId || detail.id;
    if(!id) return;
    const stage = detail.stage || detail.to;
    ensureContactRecord(id).then(contact=>{
      if(!contact) return;
      const prev = state.contacts.get(String(id));
      const prevStage = prev ? canonicalStage(prev.stage) : (detail.from ? canonicalStage(detail.from) : null);
      const nextStage = canonicalStage(stage || contact.stage);
      if(prevStage === nextStage) return;
      upsertContact(contact);
      document.dispatchEvent(new CustomEvent('stage:changed', {detail:{id:String(id), from:prevStage, to:nextStage}}));
    });
  }

  async function handleStageChanged(detail, options){
    if(!detail || !detail.id) return;
    const contact = await ensureContactRecord(detail.id);
    if(!contact) return;
    const toStage = canonicalStage(detail.to || contact.stage);
    const fromStage = detail.from ? canonicalStage(detail.from) : null;
    const skipDocSync = !!(detail && detail.isNew);
    const baseDetail = {
      action:'stage',
      contactId:String(contact.id),
      id:String(contact.id),
      stage:toStage,
      from:fromStage,
      to:toStage,
      isNew:!!detail.isNew
    };
    await withChangeScope(baseDetail, async ()=>{
      upsertContact(contact);
      if(contact.pbMilestones !== false && ['application','underwriting','cleared-to-close','ctc','funded'].includes(toStage)){
        const stageKey = toStage==='ctc' ? 'cleared-to-close' : toStage;
        await queueStageMilestone(contact, stageKey);
      }
      if(contact.pbPostClose !== false && toStage === 'funded' && contact.fundedDate){
        await queuePostClose(contact);
      }
      if(contact.pbNewLead !== false && (toStage === 'lead' || toStage === 'preapproved')){
        if(!(detail && detail.isNew)) await queueNewLead(contact);
      }
      if(!skipDocSync){
        try{
          const docResult = await syncDocChecklist(contact);
          if(docResult && docResult.created){
            recordChange({action:'documents', contactId:String(contact.id), created:docResult.created});
          }
          if(docResult && docResult.missingChanged){
            recordChange({action:'contact', contactId:String(contact.id), fields:['missingDocs']});
          }
        }catch(err){ console && console.warn && console.warn('stage doc sync', err); }
      }
      if(toStage === 'funded'){
        recordChange({action:'commissions', contactId:String(contact.id), stage:toStage});
      }
      if(fromStage !== toStage && toStage && ['application','processing','underwriting','cleared-to-close','funded'].includes(toStage)){
        refreshTimeline(contact.id);
      }
      upsertContact(contact);
    }, options);
  }

  async function runStageAutomationsQuiet(input){
    const payload = input && typeof input === 'object' ? Object.assign({}, input) : {};
    const id = payload.id != null ? String(payload.id) : (payload.contactId != null ? String(payload.contactId) : null);
    if(!id) return [];
    const detail = {
      id,
      contactId: id,
      from: payload.from != null ? payload.from : payload.previous,
      to: payload.to != null ? payload.to : payload.stage,
      stage: payload.to != null ? payload.to : payload.stage
    };
    const captured = [];
    await handleStageChanged(detail, { collector: entry => { if(entry) captured.push(entry); } });
    return captured;
  }
  window.runStageAutomationsQuiet = runStageAutomationsQuiet;

  async function handleContactCreated(detail){
    if(!detail || !detail.id) return;
    const contact = await ensureContactRecord(detail.id);
    if(!contact) return;
    const baseDetail = {
      action:'contact',
      contactId:String(contact.id),
      id:String(contact.id),
      created:true
    };
    await withChangeScope(baseDetail, async ()=>{
      await queueNewLead(contact);
      try{
        const docResult = await syncDocChecklist(contact);
        if(docResult && docResult.created){
          recordChange({action:'documents', contactId:String(contact.id), created:docResult.created});
        }
        if(docResult && docResult.missingChanged){
          recordChange({action:'contact', contactId:String(contact.id), fields:['missingDocs']});
        }
      }catch(err){ console && console.warn && console.warn('contact doc sync', err); }
    });
  }

  document.addEventListener('contact:modal:ready', async (evt)=>{
    const dialog = evt.detail && evt.detail.dialog;
    const body = evt.detail && evt.detail.body;
    if(!body) return;
    const idInput = body.querySelector('#c-id');
    const contactId = idInput ? String(idInput.value||'') : '';
    const existing = contactId ? await ensureContactRecord(contactId) : null;
    const context = buildModalContext(contactId, existing);
    const stageInput = body.querySelector('#c-stage');
    if(stageInput && context && context.prevStage==null){
      context.prevStage = canonicalStage(stageInput.value);
    }
    state.modalState.set(contactId || 'new', context);
    ensureAutomationsSection(body, context);
    ensureTimelineSection(body, contactId);
    await renderContactTimeline(contactId);
    if(dialog && !dialog.__autoCleanup){
      dialog.__autoCleanup = true;
      dialog.addEventListener('close', ()=>{
        state.modalState.delete(contactId || 'new');
        state.openTimelines.delete(String(contactId||''));
      });
    }
  });

  document.addEventListener('form:saved', async (evt)=>{
    const detail = evt && evt.detail;
    const button = detail && detail.button;
    if(!button || button.id !== 'btn-save-contact') return;
    const result = detail && detail.result;
    if(!result || !result.id) return;
    const id = String(result.id);
    const context = state.modalState.get(id) || state.modalState.get('new') || buildModalContext(id, null);
    const contact = Object.assign({}, result, {
      pbNewLead: context.pbNewLead !== false,
      pbMilestones: context.pbMilestones !== false,
      pbPostClose: context.pbPostClose !== false
    });
    ensureExtras(contact);
    const prevRecord = state.contacts.get(id) || null;
    if(typeof openDB === 'function' && typeof dbPut === 'function'){
      try{ await openDB(); await dbPut('contacts', contact); }
      catch(err){ console && console.warn && console.warn('save contact automations', err); }
    }
    upsertContact(contact);
    const isNew = !!context.isNew;
    const prevStage = context.prevStage;
    const newStage = canonicalStage(contact.stage);
    const resolvedPrevStage = prevStage != null ? prevStage : (prevRecord ? canonicalStage(prevRecord.stage) : null);
    if(resolvedPrevStage === newStage && newStage === 'funded'){
      const hadFundedDate = !!(prevRecord && prevRecord.fundedDate);
      const hasFundedDate = !!contact.fundedDate;
      if(!hadFundedDate && hasFundedDate && contact.pbPostClose !== false){
        try{ await queuePostClose(contact); }
        catch(err){ console && console.warn && console.warn('queue post-close (funded date)', err); }
      }
    }
    state.modalState.delete(id);
    refreshTimeline(id);
    if(isNew){
      document.dispatchEvent(new CustomEvent('contact:created',{detail:{id}}));
    }
    if(prevStage != null && prevStage !== newStage){
      document.dispatchEvent(new CustomEvent('stage:changed',{detail:{id, from:prevStage, to:newStage, isNew}}));
    }
  });

  document.addEventListener('stage:changed', (evt)=>{
    const detail = evt && evt.detail;
    if(detail && detail.quiet) return;
    Promise.resolve().then(()=> handleStageChanged(detail));
  });

  document.addEventListener('contact:created', (evt)=>{
    Promise.resolve().then(()=> handleContactCreated(evt.detail));
  });

  document.addEventListener('app:data:changed', (evt)=>{
    const detail = evt && evt.detail;
    if(!detail) return;
    if(detail.scope === 'settings' || !detail.source || ['signatures','seed','import','workspace','snapshot','demo'].includes(detail.source)){
      refreshOwnerSignature();
    }
    const stageDetail = pickAction(detail, 'stage');
    if(stageDetail){
      const payload = Object.assign({}, stageDetail);
      if(payload.contactId == null) payload.contactId = detail.contactId || detail.id || payload.id;
      if(payload.id == null) payload.id = payload.contactId;
      if(payload.from == null && detail.from != null) payload.from = detail.from;
      if(payload.to == null && detail.to != null) payload.to = detail.to;
      if(payload.stage == null && detail.stage != null) payload.stage = detail.stage;
      bridgeStageChange(payload);
    }
    const historyDetail = pickAction(detail, 'history');
    if(historyDetail){
      const targetId = historyDetail.contactId || detail.contactId;
      if(targetId) refreshTimeline(targetId);
    }
  });

  document.addEventListener('automation:catchup', ()=>{
    Promise.resolve().then(()=> runDueProcessing());
  });

  async function boot(){
    await ensureQueueLoaded();
    await runDueProcessing();
    setInterval(()=>{ runDueProcessing(); }, SIX_HOURS_MS);
  }

  boot();
})();
