
import { STR, text } from './ui/strings.js';

let quickAddTestHooks = null;

(function(){

  function idFactory(){
    try{
      if(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'){
        return crypto.randomUUID();
      }
    }catch(_err){}
    if(typeof window.uuid === 'function'){
      try{ return window.uuid(); }
      catch(_err){}
    }
    return String(Date.now() + Math.random());
  }

  function canonicalStage(value){
    const raw = value == null ? 'application' : value;
    try{
      if(typeof window.canonicalizeStage === 'function'){
        return window.canonicalizeStage(raw);
      }
    }catch(_err){}
    const base = String(raw || 'application').trim().toLowerCase();
    return base || 'application';
  }

  function toastMessage(message){
    if(typeof window.toast === 'function'){
      window.toast(message);
      return;
    }
    if(typeof window.notify === 'function'){
      try{ window.notify(message); }
      catch(_err){}
      return;
    }
    try{ window.alert(message); }
    catch(_err){}
  }

  function ensureDialog(){
    let dlg = document.getElementById('quick-add-modal');
    if(!dlg){
      dlg = document.createElement('dialog');
      dlg.id = 'quick-add-modal';
      dlg.className = 'record-modal quick-add-modal';
      dlg.innerHTML = `
        <div class="dlg">
          <form method="dialog" class="modal-form-shell" id="quick-add-form">
            <div class="modal-header">
              <strong class="grow">${text('modal.add-contact.title')}</strong>
              <button type="button" class="btn" data-close>${STR['general.close']}</button>
            </div>
            <div class="dialog-scroll">
              <div class="modal-body">
                <div class="modal-form-layout">
                  <label>
                    <span>${STR['field.first-name']}</span>
                    <input id="quick-first" name="first" type="text" autocomplete="given-name" />
                  </label>
                  <label>
                    <span>${STR['field.last-name']}</span>
                    <input id="quick-last" name="last" type="text" autocomplete="family-name" />
                  </label>
                  <label>
                    <span>${STR['field.email']}</span>
                    <input id="quick-email" name="email" type="email" autocomplete="email" />
                  </label>
                  <label>
                    <span>${STR['field.phone']}</span>
                    <input id="quick-phone" name="phone" type="tel" autocomplete="tel" />
                  </label>
                  <label>
                    <span>${STR['field.notes']}</span>
                    <textarea id="quick-notes" name="notes" rows="3" placeholder="${text('modal.add-contact.notes-placeholder')}"></textarea>
                  </label>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn brand" id="quick-add-save" type="submit">${text('modal.add-contact.submit')}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(dlg);
    }
    if(!dlg.__wired){
      dlg.__wired = true;
      const form = dlg.querySelector('#quick-add-form');
      const closeBtn = dlg.querySelector('[data-close]');
      if(closeBtn){
        closeBtn.addEventListener('click', (evt)=>{
          evt.preventDefault();
          try{ dlg.close(); }
          catch(_err){ dlg.removeAttribute('open'); dlg.style.display='none'; }
        });
      }
      dlg.addEventListener('close', ()=>{
        dlg.removeAttribute('open');
        dlg.style.display = 'none';
      });
      if(form){
        form.addEventListener('submit', async (evt)=>{
          evt.preventDefault();
          await handleSave(form, dlg);
        });
      }
    }
    return dlg;
  }

  function normalizeName(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeEmail(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizePhone(value){
    return String(value == null ? '' : value).trim();
  }

  async function handleSave(form, dlg){
    const firstField = form.elements.namedItem('first');
    const lastField = form.elements.namedItem('last');
    const emailField = form.elements.namedItem('email');
    const phoneField = form.elements.namedItem('phone');
    const notesField = form.elements.namedItem('notes');
    const first = normalizeName(firstField ? firstField.value : '');
    const last = normalizeName(lastField ? lastField.value : '');
    const emailInput = normalizeName(emailField ? emailField.value : '');
    const phoneInput = normalizeName(phoneField ? phoneField.value : '');
    const notesRaw = normalizeName(notesField ? notesField.value : '');

    if(!first && !last){
      toastMessage(text('modal.add-contact.toast-missing-name'));
      const target = form.querySelector('[name="first"]') || form.querySelector('[name="last"]');
      if(target){
        target.focus();
      }
      return;
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const stage = canonicalStage('application');
    const name = [first, last].filter(Boolean).join(' ');
    const record = {
      id: idFactory(),
      first,
      last,
      name,
      email: normalizeEmail(emailInput),
      phone: normalizePhone(phoneInput),
      notes: notesRaw,
      stage,
      status: 'inprogress',
      stageEnteredAt: nowIso,
      createdAt: now,
      updatedAt: now,
      lastContact: '',
      loanAmount: '',
      rate: '',
      fundedDate: '',
      buyerPartnerId: null,
      listingPartnerId: null,
      referredBy: '',
      contactType: 'Borrower',
      priority: 'Warm',
      leadSource: '',
      communicationPreference: 'Phone',
      closingTimeline: '',
      loanPurpose: '',
      loanProgram: '',
      loanType: '',
      propertyType: '',
      occupancy: '',
      employmentType: '',
      creditRange: '',
      docStage: 'application-started',
      pipelineMilestone: 'Intro Call',
      preApprovalExpires: '',
      nextFollowUp: '',
      secondaryEmail: '',
      secondaryPhone: '',
      missingDocs: '',
      extras: {}
    };

    if(!record.email){
      delete record.email;
    }
    if(!record.phone){
      delete record.phone;
    }
    if(!record.notes){
      delete record.notes;
    }

    try{
      await openDB();
      if(!record.buyerPartnerId){
        record.buyerPartnerId = null;
      }
      if(!record.listingPartnerId){
        record.listingPartnerId = null;
      }
      await dbPut('contacts', record);
      try{
        if(typeof ensureRequiredDocs === 'function') await ensureRequiredDocs(record);
        if(typeof computeMissingDocsForAll === 'function') await computeMissingDocsForAll();
      }catch(docErr){
        console && console.warn && console.warn('quick-add docs sync', docErr);
      }
      const detail = {
        scope: 'contacts',
        action: 'quick-add',
        contactId: String(record.id || ''),
        source: 'quick-add'
      };
      if(typeof window.dispatchAppDataChanged === 'function'){
        window.dispatchAppDataChanged(detail);
      }else{
        document.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
      }
      if(window.Toast && typeof window.Toast.show === 'function'){
        window.Toast.show('Created');
      }
      try{ dlg.close(); }
      catch(_err){ dlg.removeAttribute('open'); dlg.style.display='none'; }
      form.reset();
    }catch(err){
      console && console.error && console.error('quick-add save failed', err);
      toastMessage('Could not save quick contact. Try again.');
    }
  }

  async function openQuickAdd(){
    const dlg = ensureDialog();
    const form = dlg.querySelector('#quick-add-form');
    if(!dlg || !form) return;
    if(dlg.hasAttribute('open')){
      try{ dlg.close(); }
      catch(_err){}
    }
    form.reset();
    dlg.style.display = 'block';
    try{ dlg.showModal(); }
    catch(_err){ dlg.setAttribute('open',''); }
    const firstInput = form.querySelector('[name="first"]');
    if(firstInput){
      firstInput.focus();
      firstInput.select?.();
    }
  }

  function init(){
    const header = document.querySelector('header.header-bar') || document.getElementById('main-nav')?.parentElement;
    if(header && !header.querySelector('[data-quick-add-contact]')){
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin-left:8px';
      const btnC = document.createElement('button');
      btnC.className = 'btn'; btnC.textContent = 'Add Contact';
      btnC.setAttribute('data-quick-add-contact','1');
      const btnP = document.createElement('button');
      btnP.className = 'btn'; btnP.textContent = 'Add Partner';
      btnP.setAttribute('data-quick-add-partner','1');
      wrap.append(btnC, btnP);
      header.appendChild(wrap);
    }
    const btnC = header?.querySelector('[data-quick-add-contact]');
    if(btnC && !btnC.__wired){ btnC.__wired = true; btnC.addEventListener('click', e=>{ e.preventDefault(); openQuickAdd(); }); }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }

  quickAddTestHooks = {
    handleSave,
    ensureDialog
  };
  if(typeof window !== 'undefined'){
    window.__QuickAddTestHooks__ = quickAddTestHooks;
  }
})();

export {};

export function __getQuickAddTestHooks(){
  return quickAddTestHooks;
}
