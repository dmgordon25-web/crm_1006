
// bulk_log.js — Append a log entry to all selected contacts; updates lastContact + extras.timeline
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.bulk_log) return;
  window.__INIT_FLAGS__.bulk_log = true;

  // Utility: ensure a simple modal container
  function ensureModal(){
    let dlg = document.getElementById('bulk-log-modal');
    if(dlg) return dlg;
    dlg = document.createElement('div');
    dlg.id = 'bulk-log-modal';
    dlg.className = 'modal';
    dlg.innerHTML = `
      <div class="dlg" style="max-width:560px">
        <div class="row" style="align-items:center">
          <strong>Bulk Log</strong>
          <span class="grow"></span>
          <button class="btn" id="bl-close">Close</button>
        </div>
        <div class="row" style="gap:12px;margin-top:8px">
          <label class="grow">Entry<br>
            <textarea id="bl-text" rows="4" style="width:100%" placeholder="e.g., Called and left voicemail."></textarea>
          </label>
        </div>
        <div class="row" style="gap:12px;margin-top:8px">
          <label>Date<br><input id="bl-date" type="date"></label>
          <label class="grow">Tag (optional)<br><input id="bl-tag" type="text" placeholder="outreach / follow-up"></label>
        </div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button class="btn" id="bl-save" disabled>Save to Selected</button>
        </div>
        <div class="muted" id="bl-count" style="margin-top:6px"></div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e)=>{ if(e.target===dlg) dlg.classList.add('hidden'); });
    dlg.querySelector('#bl-close').addEventListener('click', ()=> dlg.classList.add('hidden'));
    const text = dlg.querySelector('#bl-text'); const date = dlg.querySelector('#bl-date');
    const btn = dlg.querySelector('#bl-save');
    text.addEventListener('input', ()=> btn.disabled = text.value.trim().length===0);
    date.value = new Date().toISOString().slice(0,10);
    return dlg;
  }

  async function bulkAppendLog(ids, text, when, tag){
    await openDB();
    const contacts = await dbGetAll('contacts');
    const idx = new Map(contacts.map(c=> [c.id,c]));
    const stamp = (new Date(when)).toISOString();
    const changed = [];
    ids.forEach(id=>{
      const c = idx.get(id); if(!c) return;
      c.extras = c.extras || {};
      const tl = c.extras.timeline = Array.isArray(c.extras.timeline)? c.extras.timeline : [];
      tl.push({ when: stamp, text: String(text||'').trim(), tag: tag||'bulk', by: 'bulk' });
      c.lastContact = stamp.slice(0,10);
      c.updatedAt = Date.now();
      changed.push(c);
    });
    if(changed.length) await dbBulkPut('contacts', changed);
    return changed.length;
  }
  window.bulkAppendLog = bulkAppendLog;

  window.openBulkLogModal = function(ids){
    const list = Array.isArray(ids) ? ids.filter(id => id != null) : [];
    if(!list.length){ toast('No contacts selected'); return Promise.resolve({ status:'cancel' }); }
    const dlg = ensureModal();
    const textEl = dlg.querySelector('#bl-text');
    const dateEl = dlg.querySelector('#bl-date');
    const tagEl = dlg.querySelector('#bl-tag');
    const countEl = dlg.querySelector('#bl-count');
    const saveBtn = dlg.querySelector('#bl-save');
    if(countEl) countEl.textContent = `${list.length} contact${list.length===1?'':'s'} selected`;
    if(textEl) textEl.value = '';
    if(tagEl) tagEl.value = '';
    if(dateEl){
      try{ dateEl.value = new Date().toISOString().slice(0,10); }
      catch(_err){}
    }
    if(saveBtn) saveBtn.disabled = true;
    dlg.classList.remove('hidden');
    if(textEl) textEl.focus();
    const existing = dlg.__bulkHandlers;
    if(existing){
      if(existing.cancel) dlg.removeEventListener('click', existing.cancel, true);
      if(existing.key) document.removeEventListener('keydown', existing.key, true);
      if(existing.save && saveBtn) saveBtn.removeEventListener('click', existing.save);
    }
    return new Promise(resolve => {
      let done = false;
      const cleanup = () => {
        dlg.__bulkHandlers = null;
        if(textEl) textEl.value = '';
        if(saveBtn) saveBtn.disabled = true;
      };
      const finish = (result) => {
        if(done) return;
        done = true;
        dlg.classList.add('hidden');
        if(cancelHandler) dlg.removeEventListener('click', cancelHandler, true);
        if(keyHandler) document.removeEventListener('keydown', keyHandler, true);
        if(saveHandler && saveBtn) saveBtn.removeEventListener('click', saveHandler);
        cleanup();
        resolve(result);
      };
      const cancelHandler = (evt) => {
        const target = evt.target;
        if(target === dlg || (target && (target.id === 'bl-close' || target.hasAttribute && target.hasAttribute('data-close')))){
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
        const text = textEl ? textEl.value.trim() : '';
        const when = dateEl && dateEl.value ? dateEl.value : new Date().toISOString().slice(0,10);
        const tag = tagEl ? tagEl.value.trim() || 'bulk' : 'bulk';
        if(!text){ toast('Enter a log entry'); return; }
        try{
          const count = await bulkAppendLog(list, text, when, tag);
          toast(`Logged to ${count} contact${count===1?'':'s'}`);
          finish({ status:'ok', count, detail:{ scope:'contacts', action:'bulk-log', count, ids: list.slice().map(val => String(val)) } });
        }catch(err){
          console.error('bulkAppendLog', err);
          toast('Failed to log activity');
          finish({ status:'error', error: err });
        }
      };
      dlg.addEventListener('click', cancelHandler, true);
      document.addEventListener('keydown', keyHandler, true);
      if(saveBtn) saveBtn.addEventListener('click', saveHandler);
      dlg.__bulkHandlers = { cancel: cancelHandler, key: keyHandler, save: saveHandler };
    });
  };
})();