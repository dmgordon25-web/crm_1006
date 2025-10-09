(function(){
  if(typeof window === 'undefined') return;
  if(window.confirmAction && typeof window.confirmAction === 'function') return;

  const DEFAULT_OPTIONS = {
    title: 'Are you sure?',
    message: 'Confirm this action?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    destructive: false
  };

  function ensureDialog(){
    const doc = window.document;
    if(!doc || !doc.body) return null;
    let dlg = doc.getElementById('app-confirm-modal');
    if(dlg) return dlg;
    dlg = doc.createElement('dialog');
    dlg.id = 'app-confirm-modal';
    dlg.innerHTML = `
      <form method="dialog" class="dlg confirm-shell" data-role="form">
        <header class="confirm-head" data-role="head"></header>
        <div class="confirm-body" data-role="message"></div>
        <footer class="confirm-actions">
          <button class="btn" type="button" data-role="cancel">Cancel</button>
          <button class="btn danger" type="submit" data-role="confirm">Confirm</button>
        </footer>
      </form>`;
    doc.body.appendChild(dlg);
    return dlg;
  }

  function applyOptions(dlg, options){
    if(!dlg) return;
    const title = String(options.title || '').trim();
    const message = String(options.message || '').trim();
    const confirmLabel = String(options.confirmLabel || 'Confirm');
    const cancelLabel = String(options.cancelLabel || 'Cancel');
    const destructive = !!options.destructive;

    const head = dlg.querySelector('[data-role="head"]');
    if(head){
      head.textContent = title;
      head.style.fontWeight = '600';
      head.style.marginBottom = '8px';
    }
    const body = dlg.querySelector('[data-role="message"]');
    if(body){
      body.textContent = message;
    }
    const cancelBtn = dlg.querySelector('[data-role="cancel"]');
    if(cancelBtn){
      cancelBtn.textContent = cancelLabel;
    }
    const confirmBtn = dlg.querySelector('[data-role="confirm"]');
    if(confirmBtn){
      confirmBtn.textContent = confirmLabel;
      confirmBtn.classList.remove('brand', 'danger');
      confirmBtn.classList.add(destructive ? 'danger' : 'brand');
    }
  }

  async function openDialog(dlg){
    if(!dlg) return;
    try{
      dlg.showModal();
    }catch(err){
      dlg.setAttribute('open', '');
    }
    const confirmBtn = dlg.querySelector('[data-role="confirm"]');
    if(confirmBtn && typeof confirmBtn.focus === 'function'){
      setTimeout(() => {
        try{ confirmBtn.focus(); }
        catch(_err){}
      }, 0);
    }
  }

  function closeDialog(dlg){
    if(!dlg) return;
    try{ dlg.close(); }
    catch(_err){ dlg.removeAttribute('open'); }
  }

  window.confirmAction = function confirmAction(opts){
    const dlg = ensureDialog();
    const options = Object.assign({}, DEFAULT_OPTIONS, opts || {});
    if(!dlg){
      if(typeof window.confirm === 'function'){
        return Promise.resolve(window.confirm(options.message || DEFAULT_OPTIONS.message));
      }
      return Promise.resolve(true);
    }
    applyOptions(dlg, options);
    return new Promise(resolve => {
      const confirmBtn = dlg.querySelector('[data-role="confirm"]');
      const cancelBtn = dlg.querySelector('[data-role="cancel"]');
      const form = dlg.querySelector('form');
      let settled = false;

      function cleanup(result){
        if(settled) return;
        settled = true;
        if(confirmBtn) confirmBtn.removeEventListener('click', onConfirm);
        if(cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        if(form) form.removeEventListener('submit', onSubmit);
        dlg.removeEventListener('cancel', onDialogCancel);
        dlg.removeEventListener('close', onDialogClose);
        resolve(result);
      }

      function onConfirm(event){
        if(event){ event.preventDefault(); event.stopPropagation(); }
        dlg.returnValue = 'confirm';
        closeDialog(dlg);
      }

      function onCancel(event){
        if(event){ event.preventDefault(); event.stopPropagation(); }
        dlg.returnValue = 'cancel';
        closeDialog(dlg);
      }

      function onSubmit(event){
        if(event){ event.preventDefault(); event.stopPropagation(); }
        onConfirm();
      }

      function onDialogCancel(event){
        if(event){ event.preventDefault(); }
        dlg.returnValue = 'cancel';
        closeDialog(dlg);
      }

      function onDialogClose(){
        const result = dlg.returnValue === 'confirm';
        cleanup(result);
      }

      if(confirmBtn) confirmBtn.addEventListener('click', onConfirm);
      if(cancelBtn) cancelBtn.addEventListener('click', onCancel);
      if(form) form.addEventListener('submit', onSubmit);
      dlg.addEventListener('cancel', onDialogCancel, { once: true });
      dlg.addEventListener('close', onDialogClose, { once: true });
      openDialog(dlg);
    });
  };

  window.showConfirm = window.confirmAction;
})();
