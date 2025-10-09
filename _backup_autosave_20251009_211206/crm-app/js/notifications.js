// notifications.js — unified Notifications Center (queue, panel, view)
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.notifications_center) return;
  window.__INIT_FLAGS__.notifications_center = true;
  let wiredFor = null;

  const ONE_DAY = 24*60*60*1000;
  const TYPE_LABELS = {
    taskDue: 'Task Due',
    missingDocs: 'Missing Docs',
    birthday: 'Birthday',
    anniversary: 'Anniversary',
    closingSoon: 'Closing Soon'
  };
  const UPCOMING_WINDOW_DAYS = 30;

  function toNotifierItems(queue){
    const now = Date.now();
    return (queue||[]).map(item => {
      if(!item) return null;
      const label = TYPE_LABELS[item.type] || item.type || 'Notification';
      const subject = (item.subject || '').trim();
      const name = (item.name || '').trim();
      const baseTitle = subject || (label + (name ? `: ${name}` : ''));
      const due = item.meta?.due || item.due || item.meta?.fundedDate || '';
      let ts = now;
      if(due){
        const dt = new Date(due);
        if(!Number.isNaN(dt.getTime())) ts = dt.getTime();
      }else if(item.meta?.daysOut){
        const offset = Number(item.meta.daysOut);
        if(Number.isFinite(offset)) ts = now + offset*ONE_DAY;
      }
      return {
        id: item.id || buildId(item.type || 'notification', item.contactId || ''),
        ts,
        type: label,
        title: baseTitle || label,
        meta: {
          contactId: item.contactId,
          channel: item.channel,
          due,
          queue: item
        }
      };
    }).filter(Boolean);
  }

  function updateNotifier(queue){
    const notifierItems = toNotifierItems(queue);
    try{
      const notifier = window.Notifier;
      if(notifier && typeof notifier.replace === 'function'){
        notifier.replace(notifierItems);
        return;
      }
    }catch(_){ }
    if(typeof window !== 'undefined'){
      try{ window.__NOTIF_QUEUE__ = notifierItems.slice(); }
      catch(_){ window.__NOTIF_QUEUE__ = notifierItems; }
      try{ window.localStorage?.setItem('notifications:queue', JSON.stringify(notifierItems)); }catch(_){ }
      try{ window.dispatchEvent(new CustomEvent('notifications:changed')); }catch(_){ }
    }
  }

  function pad(n){ return (n<10?'0':'')+n; }
  function ymd(d){ const x=new Date(d); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; }
  function mmdd(d){ const x=new Date(d); return `${pad(x.getMonth()+1)}-${pad(x.getDate())}`; }
  function todayYMD(){ return ymd(new Date()); }

  function csvEscape(s){ const v=String(s??''); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
  function downloadFile(name, text){
    const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 750);
  }

  async function loadSettingsRecord(id, fallback){
    try{
      const all = await dbGetAll('settings');
      const rec = all.find(s => s.id===id);
      if(rec) return rec;
    }catch(_){ }
    return Object.assign({id}, fallback||{});
  }

  async function saveSettingsRecord(rec){
    rec.id = rec.id || 'misc';
    await dbPut('settings', rec);
  }

  async function getEventTemplates(){
    const rec = await loadSettingsRecord('eventTemplates', {templates:{}});
    const defaults = {
      taskDue:{ emailSubject:'Task due: {label}', emailBody:'Hi {first}, quick reminder: {label} is due {due}.', smsBody:'Reminder: {label} due {due}.' },
      missingDocs:{ emailSubject:'We still need: {missingDocs}', emailBody:'Hi {first}, we still need: {missingDocs}.', smsBody:'Hi {first}, still need: {missingDocs}.' },
      birthday:{ emailSubject:'Happy Birthday, {first}!', emailBody:'Wishing you a great day, {first}!', smsBody:'Happy Birthday, {first}!' },
      anniversary:{ emailSubject:'Happy Anniversary!', emailBody:'Congrats on your anniversary, {first}!', smsBody:'Happy Anniversary, {first}!' },
      closingSoon:{ emailSubject:'Closing soon for {first} {last}', emailBody:'Heads up: closing is scheduled for {fundedDate}.', smsBody:'Closing scheduled: {fundedDate}.' }
    };
    return Object.assign({}, defaults, rec.templates||{});
  }

  async function getNotifPrefs(){
    const rec = await loadSettingsRecord('notifPrefs', {events:{}, closingSoonDays:7, upcomingWindowDays: UPCOMING_WINDOW_DAYS});
    const defaults = {
      taskDue:{enabled:true, channel:'email'},
      missingDocs:{enabled:true, channel:'email'},
      birthday:{enabled:true, channel:'email'},
      anniversary:{enabled:true, channel:'email'},
      closingSoon:{enabled:true, channel:'email'}
    };
    return {
      id:'notifPrefs',
      closingSoonDays: (typeof rec.closingSoonDays==='number'? rec.closingSoonDays : 7),
      upcomingWindowDays: (typeof rec.upcomingWindowDays === 'number' ? rec.upcomingWindowDays : UPCOMING_WINDOW_DAYS),
      events: Object.assign(defaults, rec.events||{})
    };
  }

  async function getNotifLog(){
    const rec = await loadSettingsRecord('notifLog', {log:[]});
    rec.log = Array.isArray(rec.log)? rec.log : [];
    return rec;
  }

  async function saveNotifLog(rec){
    rec.id = 'notifLog';
    rec.log = Array.isArray(rec.log)? rec.log : [];
    await saveSettingsRecord(rec);
  }

  async function getNotifSnooze(){
    const rec = await loadSettingsRecord('notifSnooze', {items:[]});
    rec.items = Array.isArray(rec.items)? rec.items : [];
    return rec;
  }

  async function saveNotifSnooze(rec){
    rec.id = 'notifSnooze';
    rec.items = Array.isArray(rec.items)? rec.items : [];
    await saveSettingsRecord(rec);
  }

  function replaceTokens(text, ctx){
    let out = String(text||'');
    for(const [k,v] of Object.entries(ctx||{})){
      const val = String(v??'');
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), val).replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), val);
    }
    return out;
  }

  function sentToday(log, contactId, type, todayIso){
    const today = todayIso || todayYMD();
    return (log.log||[]).some(row => row.contactId===contactId && row.type===type && row.when===today);
  }

  function isSnoozed(snooze, contactId, type, todayIso){
    const today = todayIso || todayYMD();
    return (snooze.items||[]).some(x => x.contactId===contactId && x.type===type && String(x.until)>=today);
  }

  function contactTokens(c, extra){
    return Object.assign({
      first: c.first||'',
      last: c.last||'',
      email: c.email||'',
      phone: c.phone||'',
      loanType: c.loanType||c.loanProgram||'',
      missingDocs: c.missingDocs||'',
      fundedDate: c.fundedDate||c.expectedClosing||c.closingDate||''
    }, extra||{});
  }

  function chooseTemplate(templates, type){
    return templates[type] || {};
  }

  function buildId(type, contactId){
    return `${type}|${contactId}`;
  }

  function nextOccurrenceWithinWindow(rawDate, today, windowDays){
    if(!rawDate) return null;
    const base = new Date(rawDate);
    if(Number.isNaN(base.getTime())) return null;
    const candidate = new Date(today.getFullYear(), base.getMonth(), base.getDate());
    if(candidate < today){
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
    const diffMs = candidate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / ONE_DAY);
    if(diffDays < 0 || diffDays > windowDays) return null;
    return candidate;
  }

  async function buildQueue(now = new Date()){
    await openDB();
    const [contacts, tasks] = await Promise.all([dbGetAll('contacts'), dbGetAll('tasks')]);
    const templates = await getEventTemplates();
    const prefs = await getNotifPrefs();
    const log = await getNotifLog();
    const snooze = await getNotifSnooze();
    const today = now instanceof Date && !Number.isNaN(now.getTime()) ? new Date(now.getTime()) : new Date();
    const todayStr = ymd(today);

    const queue = [];

    const pushItem = (contact, type, ctxExtras)=>{
      if(!contact || !type) return;
      const pref = prefs.events?.[type];
      if(!pref || !pref.enabled) return;
      if(sentToday(log, contact.id, type, todayStr)) return;
      if(isSnoozed(snooze, contact.id, type, todayStr)) return;
      const tpl = chooseTemplate(templates, type);
      const tokens = contactTokens(contact, ctxExtras||{});
      const subject = replaceTokens(tpl.emailSubject||'', tokens);
      const emailBody = replaceTokens(tpl.emailBody||'', tokens);
      const smsBody = replaceTokens(tpl.smsBody||'', tokens);
      queue.push({
        id: buildId(type, contact.id),
        type,
        channel: pref.channel || 'email',
        contactId: contact.id,
        name: `${contact.first||''} ${contact.last||''}`.trim() || contact.name || contact.company || '—',
        email: contact.email||'',
        phone: contact.phone||'',
        subject,
        emailBody,
        smsBody,
        due: ctxExtras?.due || '',
        meta: ctxExtras || {}
      });
    };

    if(prefs.events?.taskDue?.enabled){
      (tasks||[]).filter(t => !t.done && t.due && ymd(t.due)===todayStr).forEach(task => {
        const contact = contacts.find(c => c.id===task.contactId);
        if(!contact) return;
        pushItem(contact, 'taskDue', {label: task.title||task.text||'', due: ymd(task.due)});
      });
    }

    if(prefs.events?.missingDocs?.enabled){
      (contacts||[]).filter(c => typeof c.missingDocs==='string' && c.missingDocs.trim()).forEach(contact => {
        pushItem(contact, 'missingDocs', {missingDocs: contact.missingDocs});
      });
    }

    const upcomingWindow = Math.max(1, Number(prefs.upcomingWindowDays || UPCOMING_WINDOW_DAYS));

    if(prefs.events?.birthday?.enabled){
      (contacts||[]).forEach(contact => {
        const next = nextOccurrenceWithinWindow(contact.birthday, today, upcomingWindow);
        if(next) pushItem(contact, 'birthday', { due: ymd(next) });
      });
    }

    if(prefs.events?.anniversary?.enabled){
      (contacts||[]).forEach(contact => {
        const next = nextOccurrenceWithinWindow(contact.anniversary, today, upcomingWindow);
        if(next) pushItem(contact, 'anniversary', { due: ymd(next) });
      });
    }

    if(prefs.events?.closingSoon?.enabled){
      const windowDays = Math.max(1, Number(prefs.closingSoonDays||7));
      const horizon = new Date(today.getTime() + windowDays*ONE_DAY);
      (contacts||[]).forEach(contact => {
        const raw = contact.expectedClosing || contact.closingDate || contact.fundedDate;
        if(!raw) return;
        const dt = new Date(raw);
        if(Number.isNaN(dt.getTime())) return;
        if(dt >= today && dt <= horizon){
          pushItem(contact, 'closingSoon', {fundedDate: ymd(dt), daysOut: Math.round((dt.getTime()-today.getTime())/ONE_DAY)});
        }
      });
    }

    return queue;
  }

  window.buildNotificationQueue = buildQueue;

  async function computeNotifications(now = new Date()){
    return buildQueue(now);
  }

  async function getBadgeCount(now = new Date()){
    const list = await computeNotifications(now);
    return Array.isArray(list) ? list.length : 0;
  }

  window.computeNotifications = computeNotifications;
  window.getNotificationBadgeCount = getBadgeCount;
  if(typeof module !== 'undefined' && module.exports){
    module.exports = { computeNotifications, getBadgeCount };
  }

  async function recordSnooze(contactId, type, days){
    const rec = await getNotifSnooze();
    const untilDate = new Date();
    untilDate.setDate(untilDate.getDate() + (days||1));
    const until = ymd(untilDate);
    const key = `${contactId}|${type}`;
    let found = false;
    rec.items = rec.items.map(item => {
      if(`${item.contactId}|${item.type}`===key){
        found = true;
        return {contactId, type, until};
      }
      return item;
    });
    if(!found) rec.items.push({contactId, type, until});
    await saveNotifSnooze(rec);
  }

  async function recordSent(contactId, type, channel){
    const log = await getNotifLog();
    const today = todayYMD();
    log.log = log.log.filter(entry => !(entry.contactId===contactId && entry.type===type && entry.when===today));
    log.log.push({contactId, type, when: today, channel});
    const seen = new Set();
    log.log = log.log.filter(entry => {
      const k = `${entry.contactId}|${entry.type}|${entry.when}`;
      if(seen.has(k)) return false;
      seen.add(k); return true;
    });
    await saveNotifLog(log);

    try{
      const rec = await dbGet('notifications', buildId(type, contactId));
      if(rec){
        rec.status = 'sent';
        rec.sentAt = new Date().toISOString();
        await dbPut('notifications', rec);
      }
    }catch(_){ }
  }

  async function syncQueueStore(queue){
    await openDB();
    const existing = await dbGetAll('notifications');
    const map = new Map((existing||[]).map(row => [row.id, row]));
    const now = Date.now();
    const toPut = queue.map(item => {
      const prev = map.get(item.id);
      const status = prev && prev.status==='sent' ? 'sent' : 'queued';
      return {
        id: item.id,
        contactId: item.contactId,
        name: item.name,
        email: item.email,
        phone: item.phone,
        type: item.type,
        channel: item.channel,
        status,
        subject: item.subject||'',
        body: (item.channel==='sms'? item.smsBody : item.emailBody)||'',
        meta: item.meta||{},
        updatedAt: now,
        createdAt: prev?.createdAt || now
      };
    });
    const keepIds = new Set(toPut.map(r => r.id));
    const toDelete = (existing||[]).filter(row => !keepIds.has(row.id) && row.status!=='sent').map(row => row.id);
    if(toPut.length) await dbBulkPut('notifications', toPut);
    for(const id of toDelete) await dbDelete('notifications', id);
  }

  function ensureFilters(){
    const wrap = document.getElementById('notif-filters');
    if(!wrap) return;
    if(!wrap.__built){
      wrap.__built = true;
      wrap.innerHTML = `
        <label>Type<select id="notif-filter-type">
          <option value="all">All</option>
          <option value="taskDue">Task Due</option>
          <option value="missingDocs">Missing Docs</option>
          <option value="birthday">Birthday</option>
          <option value="anniversary">Anniversary</option>
          <option value="closingSoon">Closing Soon</option>
        </select></label>
        <label>Channel<select id="notif-filter-channel">
          <option value="all">All</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select></label>`;
      wrap.addEventListener('change', ()=>{ renderNotifications(); });
    }
  }

  function ensureBulkBar(){
    const bar = document.getElementById('notif-bulkbar');
    if(!bar) return;
    if(!bar.__built){
      bar.__built = true;
      bar.innerHTML = `
        <label class="switch"><input type="checkbox" id="notif-select-all"><span>Select All</span></label>
        <span id="notif-selected-count" class="muted">0 selected</span>
        <span class="grow"></span>
        <button class="btn" data-bulk="snooze-1">Snooze 1d</button>
        <button class="btn" data-bulk="snooze-3">Snooze 3d</button>
        <button class="btn" data-bulk="snooze-7">Snooze 7d</button>
        <button class="btn brand" data-bulk="send">Send Selected</button>
        <button class="btn" data-bulk="send-all">Send All (filtered)</button>`;
      bar.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button[data-bulk]');
        if(!btn) return;
        const action = btn.getAttribute('data-bulk');
        const selection = getSelected();
        if(action.startsWith('snooze-')){
          const days = Number(action.split('-')[1]||'1');
          for(const item of selection) await recordSnooze(item.contactId, item.type, days);
          toast(`Snoozed ${selection.length||0} notification${selection.length===1?'':'s'} for ${days} day(s).`);
          await renderNotifications();
          return;
        }
        if(action==='send'){
          for(const item of selection){
            await recordSent(item.contactId, item.type, item.channel);
            try{
              await dbPut('activity', {
                id: crypto.randomUUID(),
                contactId: item.contactId,
                kind: 'notification',
                summary: `[${item.channel.toUpperCase()}] ${item.type}`,
                body: (item.channel==='sms'? item.smsBody : item.emailBody)||'',
                ts: Date.now()
              });
            }catch(_){ }
          }
          toast(selection.length? 'Sent selected notifications.' : 'Nothing selected.');
          await renderNotifications();
          return;
        }
        if(action==='send-all'){
          const filtered = getFiltered();
          for(const item of filtered){
            await recordSent(item.contactId, item.type, item.channel);
            try{
              await dbPut('activity', {
                id: crypto.randomUUID(),
                contactId: item.contactId,
                kind: 'notification',
                summary: `[${item.channel.toUpperCase()}] ${item.type}`,
                body: (item.channel==='sms'? item.smsBody : item.emailBody)||'',
                ts: Date.now()
              });
            }catch(_){ }
          }
          toast(filtered.length? `Marked ${filtered.length} notification${filtered.length===1?'':'s'} as sent.` : 'No notifications to send.');
          await renderNotifications();
        }
      });
      const selAll = bar.querySelector('#notif-select-all');
      if(selAll && !selAll.__wired){
        selAll.__wired = true;
        selAll.addEventListener('change', ()=>{
          const cards = document.querySelectorAll('#notif-center-list .notif-card input[type="checkbox"]');
          cards.forEach(cb => { cb.checked = selAll.checked; });
          updateSelectedCount();
        });
      }
    }
  }

  let __lastQueue = [];
  let __filteredQueue = [];

  function getFilterValues(){
    const typeSel = document.getElementById('notif-filter-type');
    const channelSel = document.getElementById('notif-filter-channel');
    return {
      type: typeSel ? typeSel.value : 'all',
      channel: channelSel ? channelSel.value : 'all'
    };
  }

  function getFiltered(){
    return Array.isArray(__filteredQueue) ? __filteredQueue : [];
  }

  function getSelected(){
    const map = new Map((getFiltered()||[]).map(item => [item.id, item]));
    const checked = Array.from(document.querySelectorAll('#notif-center-list .notif-card input[type="checkbox"]:checked'));
    return checked.map(cb => map.get(cb.closest('.notif-card')?.dataset?.id || '')).filter(Boolean);
  }

  function updateSelectedCount(){
    const el = document.getElementById('notif-selected-count');
    if(!el) return;
    const n = document.querySelectorAll('#notif-center-list .notif-card input[type="checkbox"]:checked').length;
    el.textContent = `${n} selected`;
  }

  function renderNotificationsList(queue){
    const host = document.getElementById('notif-center-list');
    if(!host) return;
    ensureFilters();
    ensureBulkBar();

    const {type, channel} = getFilterValues();
    const filtered = queue.filter(item => (type==='all'||item.type===type) && (channel==='all'||item.channel===channel));
    __filteredQueue = filtered;

    const pill = document.getElementById('notifications-count-pill');
    if(pill){
      pill.style.display = filtered.length ? '' : 'none';
      if(filtered.length) pill.textContent = `${filtered.length} queued`;
    }

    const subhead = document.getElementById('notifications-subhead');
    if(subhead){
      if(filtered.length){
        subhead.textContent = 'Queued notifications respect daily throttles per contact/event.';
      }else{
        subhead.textContent = 'No queued notifications. Automations are up to date.';
      }
    }

    if(!filtered.length){
      host.innerHTML = '<div class="muted">No queued notifications. Great job staying ahead!</div>';
      updateSelectedCount();
      return;
    }

    host.innerHTML = filtered.map(item => {
      const preview = item.channel==='sms' ? item.smsBody : item.emailBody;
      const dueLine = item.meta?.due ? `Due ${item.meta.due}` : (item.meta?.fundedDate ? `Target ${item.meta.fundedDate}` : '');
      return `<div class="card notif-card" data-id="${item.id}" style="margin-bottom:10px;padding:12px">
        <div class="row" style="gap:10px;align-items:center">
          <input type="checkbox" class="notif-select">
          <div class="pill">${TYPE_LABELS[item.type]||item.type}</div>
          <div style="flex:1">
            <div><strong>${item.name}</strong></div>
            <div class="muted">${item.channel.toUpperCase()}${dueLine?` • ${dueLine}`:''}</div>
          </div>
          <button class="btn" data-act="preview">Preview</button>
          <button class="btn" data-act="snooze-1">Snooze 1d</button>
          <button class="btn" data-act="snooze-3">Snooze 3d</button>
          <button class="btn" data-act="snooze-7">Snooze 7d</button>
          <button class="btn brand" data-act="send">Send</button>
        </div>
        <details style="margin-top:6px"><summary>Message Preview</summary>
          <pre style="white-space:pre-wrap;margin:8px 0">${preview ? preview.replace(/</g,'&lt;') : '(empty)'}</pre>
        </details>
      </div>`;
    }).join('');

    updateSelectedCount();
  }

  function wireListEvents(){
    const host = document.getElementById('notif-center-list');
    if(!host || host.__wired) return;
    host.__wired = true;
    host.addEventListener('change', (e)=>{
      if(e.target.matches('input.notif-select')) updateSelectedCount();
    });
    host.addEventListener('click', async (e)=>{
      const card = e.target.closest('.notif-card');
      if(!card) return;
      const id = card.dataset.id;
      const item = (__filteredQueue||[]).find(q => q.id===id) || (__lastQueue||[]).find(q => q.id===id);
      if(!item) return;
      if(e.target.matches('[data-act="preview"]')){
        const body = item.channel==='sms' ? item.smsBody : `${item.subject}\n\n${item.emailBody}`;
        alert(body || '(empty message)');
        return;
      }
      if(e.target.matches('[data-act="snooze-1"]') || e.target.matches('[data-act="snooze-3"]') || e.target.matches('[data-act="snooze-7"]')){
        const days = e.target.matches('[data-act="snooze-1"]') ? 1 : (e.target.matches('[data-act="snooze-3"]') ? 3 : 7);
        await recordSnooze(item.contactId, item.type, days);
        toast(`Snoozed ${TYPE_LABELS[item.type]||item.type} for ${days} day(s).`);
        await renderNotifications();
        return;
      }
      if(e.target.matches('[data-act="send"]')){
        await recordSent(item.contactId, item.type, item.channel);
        try{
          await dbPut('activity', {
            id: crypto.randomUUID(),
            contactId: item.contactId,
            kind: 'notification',
            summary: `[${item.channel.toUpperCase()}] ${item.type}`,
            body: (item.channel==='sms'? item.smsBody : item.emailBody)||'',
            ts: Date.now()
          });
        }catch(_){ }
        toast('Notification marked as sent.');
        await renderNotifications();
      }
    });
  }

  async function exportCurrentQueue(){
    const filtered = getFiltered();
    if(!filtered.length){
      toast('No queued notifications to export.');
      return;
    }
    const hdr = ['type','channel','contactId','name','email','phone','subject','body'];
    const rows = filtered.map(it => [it.type,it.channel,it.contactId,it.name,it.email,it.phone,it.subject||'', (it.channel==='sms'?it.smsBody:it.emailBody)||'']);
    const csv = [hdr.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    downloadFile(`notifications_${Date.now()}.csv`, csv);
  }

  async function renderNotifications(){
    const queue = await buildQueue();
    __lastQueue = queue;
    await syncQueueStore(queue);
    updateNotifier(queue);
    renderNotificationsList(queue);
  }

  window.renderNotifications = renderNotifications;

  function render(root){ // keep existing
    wireListEvents();
    const exportBtn = document.getElementById('notifications-export');
    if(exportBtn && !exportBtn.__wired){
      exportBtn.__wired = true;
      exportBtn.addEventListener('click', ()=>{ exportCurrentQueue(); });
    }
    renderNotifications();
  }

  function maybeWire(){
    const root = document.getElementById('notifications-center');
    if(!root) return;
    if(wiredFor === root) return;
    wiredFor = root;
    render(root);
  }

  if(typeof document !== 'undefined' && document && typeof document.addEventListener === 'function'){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', maybeWire, {once:true}); else maybeWire();
  }

  window.RenderGuard?.registerHook?.(maybeWire);

  if(!window.__NOTIFICATIONS_WRAP__){
    window.__NOTIFICATIONS_WRAP__ = true;
    const prev = window.renderAll;
    window.renderAll = async function(){
      const out = typeof prev==='function' ? await prev.apply(this, arguments) : undefined;
      try{ await renderNotifications(); }catch(_){ }
      return out;
    };
  }
})();
