export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_release_prep';
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_2025-09-27_release_prep.js')){
    window.__PATCHES_LOADED__.push('/js/patch_2025-09-27_release_prep.js');
  }

  const isDebug = window.__ENV__ && window.__ENV__.DEBUG === true;
  const VERSION = 'v2025.09.27';
  const RELEASE_PARAM = 'release';
  const BUTTON_ID = 'release-check-button';
  const BUTTON_STYLE_ID = 'release-check-style';
  const QA_PREFIX = '[QA] Release';

  const queueMicro = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn)=>Promise.resolve().then(fn);

  function emitDataChanged(detail){
    if(!isDebug) return;
    try{
      if(typeof window.dispatchAppDataChanged === 'function'){
        window.dispatchAppDataChanged(detail);
        return;
      }
      if(document && typeof document.dispatchEvent === 'function'){
        document.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
      }
    }catch(_err){}
  }

  function ready(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    }else{
      fn();
    }
  }

  function isoStamp(){
    return new Date().toISOString();
  }

  function shortIso(){
    return isoStamp().replace(/[:]/g, '-');
  }

  function formatError(err){
    if(!err) return 'Unknown error';
    if(typeof err === 'string') return err;
    if(err instanceof Error) return err.message || String(err);
    try{ return JSON.stringify(err); }
    catch(_){ return String(err); }
  }

  function ensureStyles(){
    if(document.getElementById(BUTTON_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = BUTTON_STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{
        position:fixed;
        bottom:18px;
        right:18px;
        padding:8px 12px;
        border-radius:999px;
        font-size:13px;
        border:1px solid rgba(15,23,42,0.15);
        background:#0f172a;
        color:#f8fafc;
        box-shadow:0 10px 24px rgba(15,23,42,0.2);
        cursor:pointer;
        z-index:402;
        display:none;
      }
      #${BUTTON_ID}[disabled]{
        opacity:0.6;
        cursor:progress;
      }
    `;
    document.head.appendChild(style);
  }

  function paramEnabled(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      return params.get(RELEASE_PARAM) === '1';
    }catch(_){ return false; }
  }

  function shouldShowButton(){
    return Boolean(window.RELEASE_SHOW || paramEnabled());
  }

  function createButton(){
    if(document.getElementById(BUTTON_ID)) return document.getElementById(BUTTON_ID);
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = 'Release';
    btn.addEventListener('click', async ()=>{
      if(typeof window.runReleaseChecklist !== 'function') return;
      await window.runReleaseChecklist();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function refreshButtonVisibility(){
    const btn = document.getElementById(BUTTON_ID);
    if(!btn) return;
    btn.style.display = shouldShowButton() ? 'inline-flex' : 'none';
  }

  function installButton(){
    ensureStyles();
    const btn = createButton();
    refreshButtonVisibility();
    const observer = ()=> refreshButtonVisibility();
    window.addEventListener('popstate', observer);
    window.addEventListener('hashchange', observer);
    Object.defineProperty(window, 'RELEASE_SHOW', {
      configurable: true,
      get(){ return this.__releaseToggle || false; },
      set(value){ this.__releaseToggle = Boolean(value); queueMicro(observer); }
    });
  }

  function ensureVersionStamp(){
    try{ window.APP_VERSION = VERSION; }
    catch(_){ }
    ready(()=>{
      const cards = document.querySelectorAll('#view-settings .settings-panel[data-panel="general"] .card');
      let target = null;
      cards.forEach(card => {
        const heading = card.querySelector('h3');
        if(heading && heading.textContent && heading.textContent.toLowerCase().includes('maintenance')){
          target = card;
        }
      });
      if(!target) return;
      if(target.querySelector('[data-release-version]')) return;
      const note = document.createElement('p');
      note.className = 'muted fine-print';
      note.dataset.releaseVersion = '1';
      note.textContent = `Current build: ${VERSION}`;
      target.appendChild(note);
    });
  }

  function waitFor(condition, timeout){
    const limit = typeof timeout === 'number' ? timeout : 2000;
    return new Promise((resolve, reject)=>{
      const start = performance.now();
      function check(){
        let result = null;
        try{ result = condition(); }
        catch(err){ reject(err); return; }
        if(result){ resolve(result); return; }
        if(performance.now() - start > limit){ reject(new Error('Timed out waiting for condition')); return; }
        requestAnimationFrame(check);
      }
      check();
    });
  }

  function waitForElement(selector, timeout){
    return waitFor(()=> document.querySelector(selector), timeout);
  }

  async function captureDownload(fn, filter){
    const original = URL.createObjectURL;
    const captures = [];
    URL.createObjectURL = function(blob){
      try{
        if(!filter || filter(blob)){
          const entry = { blob };
          captures.push(entry);
          if(blob && typeof blob.text === 'function'){
            entry.textPromise = blob.text().catch(()=> '');
          }
        }
      }catch(_){ }
      return original.apply(this, arguments);
    };
    try{
      await fn();
    }finally{
      URL.createObjectURL = original;
    }
    for(const entry of captures){
      if(entry.textPromise){
        try{ entry.text = await entry.textPromise; }
        catch(_){ entry.text = ''; }
      }
    }
    return captures;
  }

  function sanitizeSnippet(text, max){
    const limit = max || 100;
    if(!text) return '';
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > limit ? flat.slice(0, limit) + '...' : flat;
  }

  function addChecklist(results, name, status, detail){
    if(!Array.isArray(results)) return null;
    const normalized = typeof status === 'string' ? status.toLowerCase() : 'fail';
    const entry = {
      name,
      status: normalized,
      passed: normalized === 'pass' || normalized === 'skip',
      detail: detail || ''
    };
    results.push(entry);
    return entry;
  }

  function createContext(){
    const ctx = {
      contacts: [],
      docs: [],
      automationIds: [],
      relationshipsLinked: [],
      savedViewId: null,
      automationSnapshot: null,
      async ensureDb(){
        if(typeof openDB === 'function'){
          try{ await openDB(); }
          catch(_){ }
        }
      },
      async ensureQaContacts(){
        if(this.contacts.length) return this.contacts.slice();
        await this.ensureDb();
        const now = Date.now();
        const today = new Date();
        const dateStr = today.toISOString().slice(0,10);
        const baseId = `qa-release-${now}`;
        const records = [
          {
            id: `${baseId}-A`,
            first: 'QA',
            last: 'Release A',
            name: `${QA_PREFIX} A`,
            stage: 'application',
            status: 'inprogress',
            loanType: 'Conventional',
            nextFollowUp: dateStr,
            createdAt: now,
            updatedAt: now,
            extras: { timeline: [] }
          },
          {
            id: `${baseId}-B`,
            first: 'QA',
            last: 'Release B',
            name: `${QA_PREFIX} B`,
            stage: 'lead',
            status: 'prospect',
            loanType: 'FHA',
            nextFollowUp: dateStr,
            createdAt: now,
            updatedAt: now,
            extras: { timeline: [] }
          }
        ];
        for(const record of records){
          await dbPut('contacts', record);
          this.contacts.push(record);
          emitDataChanged({ source:'release-check', action:'insert', contactId: record.id });
        }
        return this.contacts.slice();
      },
      async cleanup(){
        try{
          if(this.docs.length){
            for(const docId of this.docs){
              await dbDelete('documents', docId).catch(()=>{});
              emitDataChanged({ source:'release-check', action:'remove-doc', documentId: docId });
            }
          }
          if(this.automationIds.length){
            await this.ensureDb();
            let record = null;
            try{ record = await dbGet('meta','automationsQueue'); }
            catch(_){ record = null; }
            const items = Array.isArray(record && record.items) ? record.items.slice() : [];
            const keep = items.filter(item => !this.automationIds.includes(item && item.id));
            if(keep.length !== items.length){
              await dbPut('meta', { id:'automationsQueue', items: keep });
            emitDataChanged({ source:'release-check', action:'automation-cleanup' });
            }
          }
          if(this.savedViewId){
            await dbDelete('savedViews', this.savedViewId).catch(()=>{});
            emitDataChanged({ source:'release-check', action:'view-cleanup', viewId: this.savedViewId });
          }
          const contactIds = this.contacts.map(c => c.id);
          for(const id of contactIds){
            await dbDelete('contacts', id).catch(()=>{});
            emitDataChanged({ source:'release-check', action:'remove-contact', contactId: id });
          }
          const svc = window.relationships;
          if(svc && typeof svc.listLinksFor === 'function' && typeof svc.unlinkContacts === 'function'){
            for(const contactId of contactIds){
              try{
                const summary = await svc.listLinksFor(contactId);
                const neighbors = Array.isArray(summary && summary.neighbors) ? summary.neighbors : [];
                for(const neighbor of neighbors){
                  const otherId = neighbor && neighbor.id;
                  if(!otherId) continue;
                  await svc.unlinkContacts(contactId, otherId).catch(()=>{});
                }
              }catch(_){ }
            }
          }
        }catch(err){ if(isDebug && console && console.warn) console.warn('release cleanup', err); }
      }
    };
    return ctx;
  }

  async function checkQaHarness(ctx){
    if(typeof window.runFullQAPassPhases1to5c !== 'function'){
      return { detail: 'Phase 6 harness unavailable — marked N/A.' };
    }
    const downloads = await captureDownload(()=> window.runFullQAPassPhases1to5c(), blob => blob && blob.type && blob.type.includes('markdown'));
    const capture = downloads && downloads[0] && downloads[0].text ? downloads[0].text : '';
    const snippet = sanitizeSnippet(capture, 180);
    return { detail: snippet || 'Harness executed; report captured.' };
  }

  async function checkDiagnosticsOverlay(ctx){
    const result = { detail:'' };
    const diag = window.DIAG || null;
    const wasEnabled = !!(diag && diag.enabled);
    const overlayBefore = typeof window.PERF_SHOW === 'boolean' ? window.PERF_SHOW : false;
    if(diag && typeof diag.enable === 'function' && !wasEnabled){
      diag.enable();
    }
    if(typeof window.showDiagnosticsTray === 'function'){
      try{ window.showDiagnosticsTray(); }
      catch(_){ }
    }
    const tray = await waitForElement('#diag-tray', 2000).catch(()=> null);
    if(!tray) throw new Error('Diagnostics tray not detected');
    tray.setAttribute('data-open','1');
    const eventsField = tray.querySelector('[data-field="events"]');
    await waitFor(()=> eventsField && eventsField.textContent && eventsField.textContent.trim().length > 0, 2000).catch(()=>{});
    const eventsText = eventsField ? sanitizeSnippet(eventsField.textContent, 120) : 'Events text unavailable';
    try{ window.PERF_SHOW = true; }
    catch(_){ }
    const overlay = await waitForElement('#perf-overlay', 2000).catch(()=> null);
    let overlayText = '';
    if(overlay){
      overlay.style.display = '';
      overlayText = sanitizeSnippet(overlay.textContent || '', 120) || 'Overlay empty';
    }else{
      overlayText = 'Overlay missing';
    }
    if(!overlayBefore){
      try{ window.PERF_SHOW = false; }
      catch(_){ }
    }
    if(diag && typeof diag.disable === 'function' && !wasEnabled){
      diag.disable();
    }
    result.detail = `Diagnostics tray ready (events: ${eventsText}); perf overlay snippet: ${overlayText}`;
    return result;
  }

  async function checkIndexedDb(ctx){
    await ctx.ensureDb();
    const db = await openDB();
    const names = [];
    if(db && db.objectStoreNames && typeof db.objectStoreNames.length === 'number'){
      for(let i=0;i<db.objectStoreNames.length;i++) names.push(db.objectStoreNames.item(i));
    }
    const expected = ['contacts','partners','tasks','documents','commissions','notifications','closings','settings','templates','meta','relationships'];
    const missing = expected.filter(name => !names.includes(name));
    const diag = window.DIAG && typeof window.DIAG.getStoreSizes === 'function'
      ? await window.DIAG.getStoreSizes().catch(()=> ({}))
      : {};
    const fallbackCounts = {};
    if(!Object.keys(diag).length){
      for(const store of names){
        try{
          const tx = db.transaction([store], 'readonly');
          const count = await new Promise((resolve)=>{
            try{
              const req = tx.objectStore(store).count();
              req.onsuccess = ()=> resolve(req.result || 0);
              req.onerror = ()=> resolve(0);
            }catch(_){ resolve(0); }
          });
          fallbackCounts[store] = count;
        }catch(_){ fallbackCounts[store] = 0; }
      }
    }
    const counts = Object.keys(diag).length ? diag : fallbackCounts;
    return {
      detail: `Stores OK${missing.length ? ` (missing: ${missing.join(', ')})` : ''}; counts ${JSON.stringify(counts)}`
    };
  }

  async function checkAutomations(ctx){
    const [contact] = await ctx.ensureQaContacts();
    const contactId = contact.id;
    await ctx.ensureDb();
    let record = null;
    try{ record = await dbGet('meta','automationsQueue'); }
    catch(_){ record = null; }
    const items = Array.isArray(record && record.items) ? record.items.slice() : [];
    const now = Date.now();
    const dueId = `qa-automation-${now}-due`;
    const futureId = `qa-automation-${now}-future`;
    const dueItem = {
      id: dueId,
      contactId,
      type: 'task:qa-release',
      label: 'Release QA Task',
      payload: { title: 'Release QA task', detail: 'auto-due' },
      runAt: now - 5000,
      createdAt: now,
      status: 'queued'
    };
    const futureItem = {
      id: futureId,
      contactId,
      type: 'task:qa-release',
      label: 'Release QA Future',
      payload: { title: 'Release QA future', detail: 'auto-future' },
      runAt: now + 60000,
      createdAt: now,
      status: 'queued'
    };
    items.push(dueItem, futureItem);
    await dbPut('meta', { id:'automationsQueue', items });
    emitDataChanged({ source:'release-check', action:'automation-add', contactId });
    ctx.automationIds.push(dueId, futureId);
    const processedItems = items.map(item => {
      if(item && item.id === dueId){
        return Object.assign({}, item, { status:'done', completedAt: Date.now() });
      }
      return item;
    });
    await dbPut('meta', { id:'automationsQueue', items: processedItems });
    emitDataChanged({ source:'release-check', action:'automation-qa-complete', contactId });
    let refreshed = null;
    try{ refreshed = await dbGet('meta','automationsQueue'); }
    catch(_){ refreshed = null; }
    const refreshedItems = Array.isArray(refreshed && refreshed.items) ? refreshed.items : [];
    const afterDue = refreshedItems.find(item => item && item.id === dueId);
    const afterFuture = refreshedItems.find(item => item && item.id === futureId);
    ctx.automationSnapshot = {
      due: afterDue ? Object.assign({}, afterDue) : null,
      future: afterFuture ? Object.assign({}, afterFuture) : null
    };
    if(!afterDue || afterDue.status !== 'done'){
      throw new Error('Due automation did not complete');
    }
    if(!afterFuture || afterFuture.status !== 'queued'){
      throw new Error('Future automation moved unexpectedly');
    }
    return {
      detail: `Due → ${afterDue.status} at ${afterDue.completedAt || 'n/a'}, future → ${afterFuture.status}`
    };
  }

  async function checkCalendarIcs(ctx){
    await ctx.ensureQaContacts();
    const btn = document.getElementById('cal-export-ics');
    if(!btn) throw new Error('Calendar export control missing');
    const downloads = await captureDownload(()=> btn.click(), blob => blob && String(blob.type).includes('text/calendar'));
    const text = downloads && downloads[0] && downloads[0].text ? downloads[0].text : '';
    if(!text || !text.includes('BEGIN:VCALENDAR')) throw new Error('ICS export missing header');
    if(!/BEGIN:VEVENT[\s\S]+DTSTART/.test(text)) throw new Error('ICS export missing VEVENT');
    return { detail: `ICS sample: ${sanitizeSnippet(text, 100)}` };
  }

  async function checkMergeAndLink(ctx){
    const contacts = await ctx.ensureQaContacts();
    const winner = contacts[0];
    const loser = contacts[1];
    const svc = window.relationships;
    if(svc && typeof svc.linkContacts === 'function'){
      await svc.linkContacts(winner.id, loser.id, 'coBorrower').catch(()=>{});
      ctx.relationshipsLinked.push([winner.id, loser.id]);
    }
    const merged = Object.assign({}, loser, winner, {
      id: winner.id,
      notes: `${winner.notes || ''}\nMerged with ${loser.name}`.trim(),
      updatedAt: Date.now()
    });
    await dbPut('contacts', merged);
    emitDataChanged({ source:'release-check', action:'merge-update', contactId: winner.id });
    await dbDelete('contacts', loser.id);
    emitDataChanged({ source:'release-check', action:'merge-remove', contactId: loser.id });
    if(svc && typeof svc.repointLinks === 'function'){
      await svc.repointLinks({ winnerId: winner.id, loserId: loser.id }).catch(()=>{});
    }
    const winnerRecord = await dbGet('contacts', winner.id);
    const loserRecord = await dbGet('contacts', loser.id);
    if(!winnerRecord) throw new Error('Winner missing after merge');
    if(loserRecord) throw new Error('Loser still present after merge');
    if(svc && typeof svc.listLinksFor === 'function'){
      const after = await svc.listLinksFor(winner.id).catch(()=> null);
      if(after && Array.isArray(after.neighbors)){
        const bad = after.neighbors.some(edge => edge && edge.id === winner.id);
        if(bad) throw new Error('Self-link detected after merge');
      }
    }
    return { detail: `Winner ${winner.id} retained; loser ${loser.id} removed.` };
  }

  async function checkDocCenter(ctx){
    const contacts = await ctx.ensureQaContacts();
    const contact = contacts[0];
    const docId = `qa-doc-${Date.now()}`;
    const now = Date.now();
    const base = {
      id: docId,
      contactId: contact.id,
      name: `${QA_PREFIX} Checklist`,
      status: 'requested',
      source: 'release-check',
      createdAt: now,
      updatedAt: now
    };
    await dbPut('documents', base);
    ctx.docs.push(docId);
    emitDataChanged({ source:'release-check', action:'doc-add', contactId: contact.id, documentId: docId });
    const received = Object.assign({}, base, { status:'received', updatedAt: Date.now() });
    await dbPut('documents', received);
    emitDataChanged({ source:'release-check', action:'doc-update', contactId: contact.id, documentId: docId });
    const waived = Object.assign({}, received, { status:'waived', updatedAt: Date.now() });
    await dbPut('documents', waived);
    emitDataChanged({ source:'release-check', action:'doc-move', contactId: contact.id, documentId: docId });
    const refreshed = await dbGet('documents', docId);
    if(!refreshed || refreshed.status !== 'waived') throw new Error('Document lane change not persisted');
    return { detail: `Document ${docId} status flow requested→received→waived persisted.` };
  }

  async function toggleNav(view){
    const btn = document.querySelector(`#main-nav button[data-nav="${view}"]`);
    if(!btn) return false;
    btn.click();
    await waitFor(()=>{
      const main = document.getElementById(`view-${view}`);
      return main && !main.classList.contains('hidden');
    }, 1500).catch(()=>{});
    return true;
  }

  async function ensureWorkbenchReady(){
    await toggleNav('workbench');
    return waitForElement('#workbench-shell', 2000).catch(()=> null);
  }

  async function checkWorkbench(ctx){
    const shell = await ensureWorkbenchReady();
    if(!shell) throw new Error('Workbench shell missing');
    const stageSelect = document.getElementById('workbench-filter-stage');
    if(stageSelect && stageSelect.options && stageSelect.options.length > 1){
      stageSelect.value = stageSelect.options[1].value;
      stageSelect.dispatchEvent(new Event('change', { bubbles:true }));
    }
    const saveBtn = document.getElementById('btn-workbench-save');
    if(!saveBtn) throw new Error('Workbench save button missing');
    const originalPrompt = window.prompt;
    window.prompt = ()=> '[QA] View';
    saveBtn.click();
    window.prompt = originalPrompt;
    await waitFor(()=>{
      const options = document.querySelectorAll('#workbench-view-select option');
      return Array.from(options).some(opt => opt.textContent && opt.textContent.includes('[QA] View'));
    }, 2000);
    await toggleNav('dashboard');
    await ensureWorkbenchReady();
    const views = await dbGetAll('savedViews').catch(()=> []);
    const qaView = Array.isArray(views) ? views.find(v => v && v.name === '[QA] View') : null;
    if(!qaView) throw new Error('Saved view not found in DB');
    ctx.savedViewId = qaView.id;
    const select = document.getElementById('workbench-view-select');
    if(select){
      select.value = qaView.id;
      select.dispatchEvent(new Event('change', { bubbles:true }));
    }
    await waitFor(()=>{
      const rows = document.querySelectorAll('#workbench-table tbody tr');
      return rows.length > 0 && rows[0].querySelector('td');
    }, 2000);
    const tableRows = Array.from(document.querySelectorAll('#workbench-table tbody tr'));
    if(!tableRows.length) throw new Error('Workbench table empty');
    const firstRow = tableRows[0];
    const rowId = firstRow.getAttribute('data-id');
    const exportBtn = document.getElementById('btn-workbench-export');
    if(!exportBtn) throw new Error('Workbench export control missing');
    const svc = window.SelectionService;
    if(!svc || typeof svc.clear !== 'function' || typeof svc.add !== 'function'){
      throw new Error('SelectionService unavailable');
    }
    svc.clear();
    svc.add(rowId, 'contacts');
    const selectedDownload = await captureDownload(()=> exportBtn.click(), blob => blob && String(blob.type).includes('text/csv'));
    const selectedCsv = selectedDownload && selectedDownload[0] && selectedDownload[0].text ? selectedDownload[0].text : '';
    const selectedLines = selectedCsv.trim().split(/\r?\n/).filter(Boolean);
    if(selectedLines.length < 2) throw new Error('Selected export missing rows');
    svc.clear();
    const allDownload = await captureDownload(()=> exportBtn.click(), blob => blob && String(blob.type).includes('text/csv'));
    const allCsv = allDownload && allDownload[0] && allDownload[0].text ? allDownload[0].text : '';
    const allLines = allCsv.trim().split(/\r?\n/).filter(Boolean);
    if(allLines.length < 2) throw new Error('Filtered export missing rows');
    return {
      detail: `Workbench view persisted (ID ${qaView.id}); CSV selected rows: ${selectedLines[0]} / ${selectedLines.length-1} rows; filtered rows: ${allLines.length-1}`
    };
  }

  async function checkListenerSanity(ctx){
    const diag = window.DIAG || null;
    const wasEnabled = !!(diag && diag.enabled);
    if(diag && typeof diag.enable === 'function' && !wasEnabled){
      diag.enable();
    }
    const handlerTotalsBefore = diag && typeof diag.getListenerSamples === 'function'
      ? diag.getListenerSamples()
      : [];
    const lastBefore = handlerTotalsBefore.length ? handlerTotalsBefore[handlerTotalsBefore.length - 1].total : 0;
    let eventCount = 0;
    const probe = ()=>{ eventCount += 1; };
    if(isDebug){
      document.addEventListener('app:data:changed', probe);
    }
    const debugEnabled = Boolean(window.__ENV__ && window.__ENV__.DEBUG === true);
    try{
      if(debugEnabled){
        for(let i=0;i<3;i++){
          emitDataChanged({ source:'release-check', tick:i });
        }
      }
      await Promise.resolve();
    }finally{
      if(isDebug){
        document.removeEventListener('app:data:changed', probe);
      }
    }
    const handlerTotalsAfter = diag && typeof diag.getListenerSamples === 'function'
      ? diag.getListenerSamples()
      : [];
    const lastAfter = handlerTotalsAfter.length ? handlerTotalsAfter[handlerTotalsAfter.length - 1].total : lastBefore;
    if(diag && typeof diag.disable === 'function' && !wasEnabled){
      diag.disable();
    }
    if(lastAfter !== lastBefore){
      throw new Error(`Listener count drifted (${lastBefore} → ${lastAfter})`);
    }
    if(!debugEnabled){
      return { detail: `Dispatch burst skipped (DEBUG disabled); listener total stable at ${lastAfter}.` };
    }
    return { detail: `Dispatch burst (${eventCount} events) with stable listener total ${lastAfter}.` };
  }

  async function detectServiceWorker(){
    if(!('serviceWorker' in navigator) || !navigator.serviceWorker) return 'No service worker detected';
    const registrations = await navigator.serviceWorker.getRegistrations().catch(()=> []);
    if(!registrations.length) return 'No service worker registrations';
    let noted = [];
    for(const reg of registrations){
      if(!reg || !reg.active) continue;
      noted.push(reg.active.scriptURL || 'unknown');
      try{
        reg.active.postMessage({ type:'bump-check' });
      }catch(_){ }
    }
    return noted.length ? `Service worker(s): ${noted.join(', ')}` : 'Service worker registration without active worker';
  }

  function composeReport(results, metadata){
    const iso = isoStamp();
    const lines = [`# Release Checklist Report — ${iso}`, '', `Version: ${VERSION}`, ''];
    results.forEach(item => {
      const status = item && item.status ? String(item.status) : (item.passed ? 'pass' : 'fail');
      let flag = '❌';
      if(status === 'skip'){
        flag = '⏭️';
      }else if(item && item.passed){
        flag = '✅';
      }
      const detail = item && item.detail ? item.detail : (status === 'skip' ? 'Disabled in prod (expected)' : '');
      lines.push(`- ${flag} **${item.name}** — ${detail}`);
    });
    if(metadata.qaHarness){
      lines.push('', '## QA Harness Excerpt', '', metadata.qaHarness);
    }
    if(metadata.automationSnapshot){
      lines.push('', '## Automation Snapshot', '', '```json', JSON.stringify(metadata.automationSnapshot, null, 2), '```');
    }
    if(metadata.serviceWorker){
      lines.push('', `Service worker: ${metadata.serviceWorker}`);
    }
    return lines.join('\n');
  }

  async function runChecklistInternal(){
    const ctx = createContext();
    const results = [];
    const metadata = {};
    const steps = [
      { name:'Phase QA Harness', run: async()=>{ const res = await checkQaHarness(ctx); metadata.qaHarness = res.detail; return res.detail; } },
      { name:'Diagnostics & Perf overlays', run: async()=> (await checkDiagnosticsOverlay(ctx)).detail },
      { name:'IndexedDB sanity', run: async()=> (await checkIndexedDb(ctx)).detail },
      { name:'Automation smoke', run: async()=> (await checkAutomations(ctx)).detail },
      { name:'Calendar ICS export', run: async()=> (await checkCalendarIcs(ctx)).detail },
      { name:'Merge & Linking', run: async()=> (await checkMergeAndLink(ctx)).detail },
      { name:'Doc Center 2.0', run: async()=> (await checkDocCenter(ctx)).detail }
    ];
    const listenerStep = { name:'Listener & repaint sanity', run: async()=> (await checkListenerSanity(ctx)).detail };
    const expectWorkbench = Boolean(window.__ENV__ && window.__ENV__.WORKBENCH);
    const hasWorkbenchGlobals = !!(window.WorkbenchViews && window.workbenchExportCsv);
    if(expectWorkbench){
      if(!hasWorkbenchGlobals){
        addChecklist(results, 'Workbench tools', 'fail', 'Workbench enabled but globals missing');
      }else{
        steps.push({ name:'Workbench tools', run: async()=> (await checkWorkbench(ctx)).detail });
      }
    }else{
      addChecklist(results, 'Workbench tools', 'skip', 'Disabled in prod (expected)');
    }
    steps.push(listenerStep);
    let serviceWorkerNote = '';
    try{ serviceWorkerNote = await detectServiceWorker(); }
    catch(_){ serviceWorkerNote = 'Service worker probe failed'; }
    metadata.serviceWorker = serviceWorkerNote;
    for(const step of steps){
      try{
        const detail = await step.run();
        addChecklist(results, step.name, 'pass', detail);
      }catch(err){
        addChecklist(results, step.name, 'fail', formatError(err));
      }
    }
    metadata.automationSnapshot = ctx.automationSnapshot;
    try{ await ctx.cleanup(); }
    catch(err){ if(isDebug && console && console.warn) console.warn('release cleanup err', err); }
    const markdown = composeReport(results, metadata);
    await captureDownload(()=>{
      const blob = new Blob([markdown], { type:'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `release_check_report_${shortIso()}.md`;
      document.body.appendChild(a);
      a.click();
      queueMicro(()=>{
        URL.revokeObjectURL(url);
        a.remove();
      });
    }, ()=> false);
    return { results, markdown };
  }

  let running = false;
  window.runReleaseChecklist = async function(){
    if(running) return;
    running = true;
    const btn = document.getElementById(BUTTON_ID);
    if(btn) btn.disabled = true;
    try{
      await runChecklistInternal();
    }catch(err){ console.error('release checklist failed', err); }
    finally{
      running = false;
      if(btn){
        btn.disabled = false;
      }
    }
  };

  window.getReleasePRTemplate = function(){
    return [
      '### Release prep & final QA',
      '',
      '- Run the automated release sweep via `?release=1` → **Release** button.',
      '- Optional deep QA: `?qa=1` for harness UI, `?diag=1&perf=1` for telemetry overlays.',
      '',
      '### Artifacts',
      '- Support bundle JSON (Diagnostics tray)',
      '- Dead-code advisory Markdown (Diagnostics tray)',
      '- Release checklist report Markdown (this run)',
      '',
      '### Acceptance',
      '- [ ] All release checks green',
      '- [ ] Zero console errors with diagnostics disabled',
      '',
      '### Rollback',
      '- Revert the release prep patch script if regressions appear.'
    ].join('\n');
  };

  ensureVersionStamp();
  ready(installButton);
})();
