// templates.js — restored minimal working implementation (Phase 5+)
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.templates) return;
  window.__INIT_FLAGS__.templates = true;

  // --- Token render helpers (backcompat: {token} and {{token}}) ---
  function __replaceTokenBoth(text, token, value){
    const v = String(value||'');
    const re1 = new RegExp('\\{'+token+'\\}', 'g');       // {token}
    const re2 = new RegExp('\\{\\{'+token+'\\}\\}', 'g'); // {{token}}
    return String(text||'').replace(re1, v).replace(re2, v);
  }
  function __renderTokens(base, ctx){
    let out = String(base||'');
    out = __replaceTokenBoth(out, 'first', ctx.first);
    out = __replaceTokenBoth(out, 'last', ctx.last);
    out = __replaceTokenBoth(out, 'email', ctx.email);
    out = __replaceTokenBoth(out, 'phone', ctx.phone);
    out = __replaceTokenBoth(out, 'loanType', ctx.loanType);
    out = __replaceTokenBoth(out, 'stage', ctx.stage);
    out = __replaceTokenBoth(out, 'status', ctx.status);
    out = __replaceTokenBoth(out, 'partnerName', ctx.partnerName);
    out = __replaceTokenBoth(out, 'missingDocs', ctx.missingDocs);
    return out;
  }

  async function renderDocTemplates(rows){
    const box = document.getElementById('doc-templates');
    if(!box) return;
    box.innerHTML = rows.map(r => `<li><button class="link" data-id="${r.id}" data-kind="doc">${r.title||'(untitled doc)'}</button></li>`).join('') || '<li class="muted">—</li>';
  }

  async function renderMsgTemplates(rows){
    const box = document.getElementById('msg-templates');
    if(!box) return;
    box.innerHTML = rows.map(r => `<li><button class="link" data-id="${r.id}" data-kind="msg">${r.title||'(untitled message)'}</button></li>`).join('') || '<li class="muted">—</li>';
  }

  async function renderTemplates(){
    await openDB();
    const templates = await dbGetAll('templates');
    const docs = templates.filter(t => t.kind==='doc');
    const msgs = templates.filter(t => t.kind==='msg');
    await renderDocTemplates(docs);
    await renderMsgTemplates(msgs);
  }

  function openEditor(kind,id){
    const dlg = document.getElementById('template-editor');
    if(!dlg) return;
    document.getElementById('tmpl-title').textContent = (id ? 'Edit Template' : 'New Template');
    const title = document.getElementById('tmpl-name');
    const body = document.getElementById('tmpl-body');
    if(id){
      dbGet('templates', id).then(r=>{
        title.value = r.title||'';
        body.value = r.body||'';
      });
    }else{
      title.value = '';
      body.value = '';
    }
    dlg.showModal();
  }

  async function saveEditor(){
    const dlg = document.getElementById('template-editor');
    const id = document.getElementById('tmpl-id').value || crypto.randomUUID();
    const title = document.getElementById('tmpl-name').value || '';
    const body = document.getElementById('tmpl-body').value || '';
    await dbPut('templates', { id, kind: (document.getElementById('tmpl-kind')?.value||'msg'), title, body, updatedAt: Date.now() });
    dlg.close();
    await renderTemplates();
    toast('Template saved');
  }

  async function deleteEditor(){
    const dlg = document.getElementById('template-editor');
    const id = document.getElementById('tmpl-id').value;
    if(id){ await dbDelete('templates', id); }
    dlg.close();
    await renderTemplates();
    toast('Template deleted');
  }

  async function exportTemplates(){
    const rows = await dbGetAll('templates');
    const blob = new Blob([JSON.stringify(rows,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'templates.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  }

  async function importTemplates(){
    const inp = document.createElement('input');
    inp.type='file'; inp.accept='application/json';
    inp.onchange = async ()=>{
      const [file] = inp.files || [];
      if(!file) return;
      const txt = await file.text();
      const rows = JSON.parse(txt);
      for(const r of rows){ await dbPut('templates', r); }
      await renderTemplates();
      toast('Templates imported');
    };
    inp.click();
  }

  // Compose helpers
  async function openCompose(contactId){
    await openDB();
    const c = await dbGet('contacts', contactId);
    if(!c) return;
    const dlg = document.getElementById('compose-modal');
    if(!dlg) return;
    dlg.dataset.contactId = contactId;
    // Pre-fill
    document.getElementById('compose-to').value = c.email||'';
    document.getElementById('compose-subject').value = '';
    document.getElementById('compose-body').value = '';
    dlg.showModal();
  }

  function renderMessageForContact(contact, tmpl){
    if(!tmpl || !tmpl.body) return '';
    const partnerName = contact.partnerName || '';
    const missingDocs = (contact.missingDocs || '');
    const withTokens = __renderTokens(tmpl.body, {
      ...contact,
      partnerName,
      missingDocs
    });
    return withTokens;
  }

  async function createComposeTask(){
    const dlg = document.getElementById('compose-modal');
    const contactId = dlg?.dataset?.contactId;
    if(!contactId) return;
    const c = await dbGet('contacts', contactId);
    const subject = document.getElementById('compose-subject').value || 'Message';
    const body = document.getElementById('compose-body').value || '';
    // Log as activity + create follow-up task
    const task = { id: crypto.randomUUID(), contactId, label: `Follow up: ${subject}`, due: '', done:false, updatedAt: Date.now() };
    await dbPut('tasks', task);
    await dbPut('activity', { id: crypto.randomUUID(), contactId, kind:'message', summary: subject, body, ts: Date.now() });
    await renderAll();
    toast('Task created & activity logged');
  }

  function wireTokenPalette(){
    const box = document.getElementById('token-palette');
    if(!box || box.__wired) return;
    box.__wired = true;
    box.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-token]');
      if(!btn) return;
      const token = btn.getAttribute('data-token');
      const ta = document.querySelector('#compose-body, #template-body');
      if(ta){
        const start = ta.selectionStart || 0, end = ta.selectionEnd || 0;
        const before = ta.value.slice(0,start), after = ta.value.slice(end);
        ta.value = before + '{{'+token+'}}' + after;
        ta.dispatchEvent(new Event('input'));
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + token.length + 4;
      }
    });
  }

  // Expose globals required by other modules/tests
  window.openCompose = openCompose;
  window.renderMessageForContact = renderMessageForContact;

  document.addEventListener('DOMContentLoaded', async ()=>{
    await openDB();
    wireTokenPalette();
    await renderTemplates();
  });
})();